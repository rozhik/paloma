import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { AiTaskDetails } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked } from '../db/query.js';
import { folders, photos } from '../db/schema.js';
import { andVisible, currentAccess } from '../auth/scope.js';
import type { Principal } from '../auth/principal.js';
import { TaskFailed, taskQueue, type TaskRecord, type TaskRun } from '../tasks/queue.js';
import { pluginRegistry, type RegisteredAiProvider } from '../plugins/index.js';
import type { AiAnswer, AiRequest } from '../plugins/api.js';
import { fail } from '../services/apiError.js';
import { parsePhotoIds } from '../services/folderChanges.js';
import { parseKeywords } from '../services/libraryText.js';
import { redactPhotoPath } from '../services/redact.js';
import { checkAnswer, toCallError, usageTokens, type AiCallError } from './answer.js';
import { applyResult } from './apply.js';
import { currentTasks, serverEnv } from './config.js';
import { modelPrices } from './models.js';
import { recordCall } from './usage.js';
import { prepareImage } from './image.js';
import { expandPrompt, languageName, topLibraryTags } from './prompt.js';
import { aiContext } from './providerSettings.js';
import { processedPhotos, saveResult } from './results.js';
import type { StoredProvider, StoredTask } from './store.js';
import { effectiveModelOptions, runLanguage, taskFingerprint } from './tasks.js';

/** Failures in a row that stop a run when the provider refuses the credentials or cannot be reached. */
export const STOP_AFTER = 5;
/** Retries of a photo when the service asks to slow down. */
export const RATE_LIMIT_RETRIES = 3;
const MAX_FAILURES_LISTED = 20;

/** Waiting between retries; replaced in tests. */
export const timing = {
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

interface RunPhoto {
  id: number;
  filePath: string;
  fileHash: string;
  keywords: string[];
  caption: string | null;
}

/** What an AI run task works on. */
interface AiParams {
  taskId: string;
  photoIds: number[];
  again: boolean;
  /** UI language of the user who started it, for tasks that use the user's language */
  userLanguage: string;
  /** With `again`: how many of `photoIds` were started before a pause */
  next: number;
}

/** A run in progress: the AI task's configuration as it was when the run started. */
interface Run {
  context: TaskRun<AiParams, AiTaskDetails>;
  task: StoredTask;
  stored: StoredProvider;
  provider: RegisteredAiProvider;
  ctx: ReturnType<typeof aiContext>;
  fingerprint: string;
  language: string;
  modelOptions: AiRequest['options'];
  libraryTags: string[];
  /** Fatal failures (credentials, unreachable) in a row */
  fatalInARow: number;
  /** Why the run stopped early */
  stopped: string | null;
}

const FATAL: readonly string[] = ['auth', 'unreachable'];

/** The photos among `ids` the current access may see, in the order given. */
async function visiblePhotos(ids: number[]): Promise<RunPhoto[]> {
  const rows = await chunked(ids, BATCH_SIZE, (chunk) => all(db.select({
    id: photos.id, filename: photos.filename, folderPath: folders.path, fileHash: photos.fileHash, keywords: photos.keywords, caption: photos.caption,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(andVisible(inArray(photos.id, chunk)))));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ id, filePath: path.join(row.folderPath, row.filename), fileHash: row.fileHash, keywords: parseKeywords(row.keywords), caption: row.caption }] : [];
  });
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The AI task and its provider (the named one and the type of its plugin), or why it cannot run. */
async function readyTask(taskId: string): Promise<{ task: StoredTask; stored: StoredProvider; provider: RegisteredAiProvider } | { problem: string }> {
  const { tasks, infos, content } = await currentTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return { problem: 'task_not_found' };
  const problem = infos.find((t) => t.id === taskId)!.problem;
  if (problem) return { problem };
  await pluginRegistry.init();
  const stored = content.providers.find((p) => p.id === task.provider)!;
  return { task, stored, provider: pluginRegistry.getAiProvider(stored.type)! };
}

/**
 * `POST /api/ai/runs {taskId, photoIds, again}` in the current request's access: adds an AI run to the task queue.
 * `userLanguage` is the user's UI language. The photos the user cannot see, and unless `again` those already
 * processed, are left out.
 */
export async function startAiRun(body: unknown, userLanguage: string, principal: Principal): Promise<TaskRecord<AiParams, AiTaskDetails>> {
  const value = isObject(body) ? body : {};
  if (typeof value.taskId !== 'string' || value.taskId === '') fail(400, 'invalid_field', 'taskId must be a task id', { field: 'taskId' });
  const ids = parsePhotoIds(value.photoIds);
  if (!ids) fail(400, 'photo_ids_required', 'photoIds must be a non-empty array of photo ids');
  if (value.again !== undefined && typeof value.again !== 'boolean') fail(400, 'invalid_field', 'again must be true or false', { field: 'again' });
  const taskId = value.taskId;
  const again = value.again === true;

  const ready = await readyTask(taskId);
  if ('problem' in ready) {
    if (ready.problem === 'task_not_found') fail(404, 'ai_task_not_found', `AI task ${taskId} not found`, { id: taskId });
    fail(400, 'ai_task_not_ready', `AI task ${taskId} is not ready: ${ready.problem}`, { id: taskId, problem: ready.problem });
  }
  const { task, provider } = ready;
  let list = (await visiblePhotos(ids)).map((photo) => photo.id);
  if (!again) {
    const fingerprint = taskFingerprint(task, effectiveModelOptions(task, provider.definition.modelOptions), runLanguage(task, userLanguage));
    const done = await processedPhotos(task.id, fingerprint, list);
    list = list.filter((id) => !done.has(id));
  }
  const added = await taskQueue.add<AiParams, AiTaskDetails>({
    kind: 'ai',
    owner: principal.user ? { id: principal.user.id, name: principal.user.displayName } : null,
    subject: { photoCount: list.length, aiTaskId: task.id, aiTaskName: task.name },
    params: { taskId: task.id, photoIds: list, again, userLanguage, next: 0 },
    access: currentAccess(),
    details: {
      kind: 'ai', output: task.output, again, tagsAdded: 0, descriptionsSet: 0, inputTokens: 0, outputTokens: 0, credits: 0, failures: [], photoIds: [],
    },
    total: list.length,
  });
  console.log(`AI run of ${task.id} added to the queue for ${list.length} photos`);
  return added;
}

/**
 * Runs an AI run task, with the library access of the user who started it. Results are saved photo by photo,
 * so a paused, cancelled or interrupted run goes on with the photos it has not done.
 */
async function runAiTask(context: TaskRun<AiParams, AiTaskDetails>): Promise<void> {
  const { task: record } = context;
  const { params } = record;
  const ready = await readyTask(params.taskId);
  if ('problem' in ready) throw new TaskFailed(ready.problem === 'task_not_found' ? `AI task ${params.taskId} no longer exists` : `AI task ${params.taskId} is not ready: ${ready.problem}`);
  const { task, stored, provider } = ready;
  const language = runLanguage(task, params.userLanguage);
  const modelOptions = effectiveModelOptions(task, provider.definition.modelOptions);
  const fingerprint = taskFingerprint(task, modelOptions, language);

  let list: RunPhoto[];
  if (params.again) {
    list = await visiblePhotos(params.photoIds.slice(params.next));
  } else {
    list = await visiblePhotos(params.photoIds);
    const done = await processedPhotos(task.id, fingerprint, list.map((photo) => photo.id));
    list = list.filter((photo) => !done.has(photo.id));
  }
  record.total = record.done + list.length;
  context.progress();

  const run: Run = {
    context, task, stored, provider, ctx: aiContext(provider, stored, serverEnv(), new AbortController().signal), fingerprint, language, modelOptions,
    libraryTags: task.prompt.includes('{libraryTags}') ? await topLibraryTags() : [], fatalInARow: 0, stopped: null,
  };
  console.log(`AI run of ${task.id} started on ${list.length} photos`);

  let next = 0;
  const startedBefore = params.next;
  const worker = async () => {
    while (!context.stopping() && run.stopped === null && next < list.length) {
      const photo = list[next++];
      if (params.again) params.next = startedBefore + next;
      await processPhoto(run, photo);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, task.options.parallel) }, worker));
  const { details } = record;
  console.log(`AI run of ${task.id} ended: ${record.done - record.failed} processed, ${record.failed} failed, ${details.tagsAdded} tags added`);
  if (run.stopped !== null) throw new TaskFailed(run.stopped);
}

/** Counts a failed photo and lists its message, with the photo named by id instead of its file. */
function failPhoto(run: Run, photo: RunPhoto, message: string): void {
  const record = run.context.task;
  record.failed += 1;
  if (record.details.failures.length < MAX_FAILURES_LISTED) {
    record.details.failures.push({ photoId: photo.id, message: redactPhotoPath(message, photo.filePath, photo.id) });
  }
}

async function processPhoto(run: Run, photo: RunPhoto): Promise<void> {
  const { task } = run;
  const record = run.context.task;
  const { details } = record;
  try {
    const answer = checkAnswer(task.output, await ask(run, photo));
    await saveResult({
      photoId: photo.id, taskId: task.id, fingerprint: run.fingerprint, fileHash: photo.fileHash, provider: run.stored.id,
      model: task.model!, output: task.output, answer,
    });
    details.inputTokens += answer.inputTokens ?? 0;
    details.outputTokens += answer.outputTokens ?? 0;
    run.fatalInARow = 0;
    const applied = await applyResult(photo.id, task, answer);
    details.tagsAdded += applied.tagsAdded;
    if (applied.descriptionSet) details.descriptionsSet += 1;
    if (applied.error) failPhoto(run, photo, applied.error);
  } catch (err) {
    const error = toCallError(err);
    failPhoto(run, photo, error.message);
    run.fatalInARow = FATAL.includes(error.kind) ? run.fatalInARow + 1 : 0;
    if (run.fatalInARow >= STOP_AFTER && run.stopped === null) run.stopped = redactPhotoPath(error.message, photo.filePath, photo.id);
  } finally {
    record.done += 1;
    details.photoIds.push(photo.id);
    run.context.progress();
  }
}

/**
 * Stores the record of one provider call, with the model's prices as they are now, and adds its credits to the
 * run's. A record that cannot be written is logged and does not fail the photo.
 */
async function logCall(run: Run, tokens: Record<string, number> | null, ok: boolean, error?: string): Promise<void> {
  const { task: record } = run.context;
  try {
    const credits = await recordCall({
      queueTaskId: record.id, aiTaskId: run.task.id, userId: record.ownerId, providerId: run.stored.id, providerName: run.stored.name,
      model: run.task.model!, tokens, prices: await modelPrices(run.stored.id, run.task.model!), ok, error,
    });
    record.details.credits = Math.round(((record.details.credits ?? 0) + credits) * 1e10) / 1e10;
  } catch (err) {
    console.error(`Cannot store the usage record of an AI call: ${(err as Error).message}`);
  }
}

/** Sends one photo to the provider, retrying when the service asks to slow down. */
async function ask(run: Run, photo: RunPhoto): Promise<AiAnswer> {
  const { task } = run;
  const prompt = expandPrompt(task.prompt, {
    language: languageName(run.language), maxTags: task.options.maxTags ?? 10, photoTags: photo.keywords, description: photo.caption,
    libraryTags: run.libraryTags,
  });
  const request: AiRequest = {
    model: task.model!, prompt, output: task.output, image: await prepareImage(photo.filePath, task.options.imageSize),
    language: languageName(run.language), options: run.modelOptions,
    ...(task.output === 'tags' ? { maxTags: task.options.maxTags } : {}),
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const answer = await run.provider.definition.run(request, run.ctx);
      await logCall(run, usageTokens((answer as { usage?: unknown } | null)?.usage), true);
      return answer;
    } catch (err) {
      const error: AiCallError = toCallError(err);
      await logCall(run, usageTokens((err as { usage?: unknown } | null)?.usage), false, error.message);
      if (error.kind !== 'rate-limit' || attempt >= RATE_LIMIT_RETRIES) throw error;
      await timing.sleep(error.retryAfterMs ?? 2000 * 2 ** attempt);
    }
  }
}

taskQueue.register({ kind: 'ai', run: runAiTask });
