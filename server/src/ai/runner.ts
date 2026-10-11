import crypto from 'node:crypto';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { AiRunInfo, AiRunStatus, LibraryAccess } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked } from '../db/query.js';
import { folders, photos } from '../db/schema.js';
import { andVisible, currentAccess, runWithAccess } from '../auth/scope.js';
import { pluginRegistry, type RegisteredAiProvider } from '../plugins/index.js';
import type { AiAnswer, AiRequest } from '../plugins/api.js';
import { fail } from '../services/apiError.js';
import { parsePhotoIds } from '../services/folderChanges.js';
import { parseKeywords } from '../services/libraryText.js';
import { checkAnswer, toCallError, type AiCallError } from './answer.js';
import { applyResult } from './apply.js';
import { aiStore, currentTasks, serverEnv } from './config.js';
import { prepareImage } from './image.js';
import { expandPrompt, languageName, topLibraryTags } from './prompt.js';
import { aiContext } from './providerSettings.js';
import { processedPhotos, saveResult } from './results.js';
import type { StoredTask } from './store.js';
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

interface Run {
  info: AiRunInfo;
  task: StoredTask;
  provider: RegisteredAiProvider;
  ctx: ReturnType<typeof aiContext>;
  fingerprint: string;
  language: string;
  modelOptions: AiRequest['options'];
  libraryTags: string[];
  photos: RunPhoto[];
  access: LibraryAccess;
  /** Fatal failures (credentials, unreachable) in a row */
  fatalInARow: number;
  finished: Promise<void>;
}

const FATAL: readonly string[] = ['auth', 'unreachable'];

/** The photos among `ids` the current request may see, in the order given. */
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

/**
 * The AI run of the server: at most one at a time, processing photos in the background after the request that
 * started it, with the library access of the user who started it. Results are saved photo by photo, so a
 * cancelled run, or one ended by a restart, can be resumed by running the task again.
 */
export class AiRunner {
  private current: Run | null = null;
  private last: AiRunInfo | null = null;
  private starting = false;

  status(): AiRunStatus {
    return { current: this.current ? structuredClone(this.current.info) : null, last: this.last ? structuredClone(this.last) : null };
  }

  /** `POST /api/ai/runs {taskId, photoIds, again}` in the current request's access; `language` is the user's UI language. */
  async start(body: unknown, language: string): Promise<AiRunInfo> {
    const value = isObject(body) ? body : {};
    if (typeof value.taskId !== 'string' || value.taskId === '') fail(400, 'invalid_field', 'taskId must be a task id', { field: 'taskId' });
    const ids = parsePhotoIds(value.photoIds);
    if (!ids) fail(400, 'photo_ids_required', 'photoIds must be a non-empty array of photo ids');
    if (value.again !== undefined && typeof value.again !== 'boolean') fail(400, 'invalid_field', 'again must be true or false', { field: 'again' });
    if (this.current || this.starting) fail(409, 'ai_run_in_progress', 'Another AI run is in progress');
    this.starting = true;
    try {
      return await this.prepare(value.taskId, ids, value.again === true, language);
    } finally {
      this.starting = false;
    }
  }

  private async prepare(taskId: string, ids: number[], again: boolean, userLanguage: string): Promise<AiRunInfo> {
    const { tasks, infos } = await currentTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) fail(404, 'ai_task_not_found', `AI task ${taskId} not found`, { id: taskId });
    const problem = infos.find((t) => t.id === taskId)!.problem;
    if (problem) fail(400, 'ai_task_not_ready', `AI task ${taskId} is not ready: ${problem}`, { id: taskId, problem });
    await pluginRegistry.init();
    const provider = pluginRegistry.getAiProvider(task.provider!)!;

    const language = runLanguage(task, userLanguage);
    const modelOptions = effectiveModelOptions(task, provider.definition.modelOptions);
    const fingerprint = taskFingerprint(task, modelOptions, language);
    let list = await visiblePhotos(ids);
    if (!again) {
      const done = await processedPhotos(task.id, fingerprint, list.map((photo) => photo.id));
      list = list.filter((photo) => !done.has(photo.id));
    }
    const libraryTags = task.prompt.includes('{libraryTags}') ? await topLibraryTags() : [];
    const saved = (await aiStore()).read().providers[provider.definition.id] ?? {};

    const info: AiRunInfo = {
      id: crypto.randomUUID(), taskId: task.id, taskName: task.name, output: task.output, state: 'running', total: list.length, done: 0,
      failed: 0, tagsAdded: 0, descriptionsSet: 0, inputTokens: 0, outputTokens: 0, error: null, failures: [], photoIds: [],
      startedAt: new Date().toISOString(), endedAt: null,
    };
    const run: Run = {
      info, task, provider, ctx: aiContext(provider, saved, serverEnv(), new AbortController().signal), fingerprint, language,
      modelOptions, libraryTags, photos: list, access: currentAccess(), fatalInARow: 0, finished: Promise.resolve(),
    };
    this.current = run;
    console.log(`AI run of ${task.id} started on ${list.length} photos`);
    run.finished = runWithAccess(run.access, () => this.process(run));
    return structuredClone(info);
  }

  /** Stops the run after the photos in progress; null when there is none. */
  cancel(): AiRunInfo | null {
    const run = this.current;
    if (!run) return null;
    if (run.info.state === 'running') run.info.state = 'cancelling';
    return structuredClone(run.info);
  }

  /** Resolves when the run in progress, if any, has ended (for tests and shutdown). */
  async idle(): Promise<void> {
    await this.current?.finished;
  }

  private async process(run: Run): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (run.info.state === 'running' && next < run.photos.length) {
        const photo = run.photos[next++];
        await this.processPhoto(run, photo);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.max(1, run.task.options.parallel) }, worker));
    } catch (err) {
      run.info.state = 'stopped';
      run.info.error = err instanceof Error ? err.message : String(err);
      console.error('AI run failed:', err);
    }
    const { info } = run;
    info.state = info.state === 'cancelling' ? 'cancelled' : info.state === 'stopped' ? 'stopped' : 'finished';
    info.endedAt = new Date().toISOString();
    console.log(`AI run of ${run.task.id} ${info.state}: ${info.done - info.failed} processed, ${info.failed} failed, ${info.tagsAdded} tags added`);
    this.last = structuredClone(info);
    this.current = null;
  }

  private async processPhoto(run: Run, photo: RunPhoto): Promise<void> {
    const { info, task } = run;
    try {
      const answer = checkAnswer(task.output, await this.ask(run, photo));
      await saveResult({
        photoId: photo.id, taskId: task.id, fingerprint: run.fingerprint, fileHash: photo.fileHash, provider: run.provider.definition.id,
        model: task.model!, output: task.output, answer,
      });
      info.inputTokens += answer.inputTokens ?? 0;
      info.outputTokens += answer.outputTokens ?? 0;
      run.fatalInARow = 0;
      const applied = await applyResult(photo.id, task, answer);
      info.tagsAdded += applied.tagsAdded;
      if (applied.descriptionSet) info.descriptionsSet += 1;
      if (applied.error) this.fail(run, photo, applied.error);
    } catch (err) {
      const error = toCallError(err);
      this.fail(run, photo, error.message);
      run.fatalInARow = FATAL.includes(error.kind) ? run.fatalInARow + 1 : 0;
      if (run.fatalInARow >= STOP_AFTER && info.state !== 'stopped') {
        info.state = 'stopped';
        info.error = error.message;
      }
    } finally {
      info.done += 1;
      info.photoIds.push(photo.id);
    }
  }

  private fail(run: Run, photo: RunPhoto, message: string): void {
    run.info.failed += 1;
    if (run.info.failures.length < MAX_FAILURES_LISTED) run.info.failures.push({ photoId: photo.id, message });
  }

  /** Sends one photo to the provider, retrying when the service asks to slow down. */
  private async ask(run: Run, photo: RunPhoto): Promise<AiAnswer> {
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
        return await run.provider.definition.run(request, run.ctx);
      } catch (err) {
        const error: AiCallError = toCallError(err);
        if (error.kind !== 'rate-limit' || attempt >= RATE_LIMIT_RETRIES) throw error;
        await timing.sleep(error.retryAfterMs ?? 2000 * 2 ** attempt);
      }
    }
  }
}

export const aiRunner = new AiRunner();
