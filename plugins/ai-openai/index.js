// @ts-check
/**
 * Bundled plugin: AI tasks with the OpenAI API, or any server that speaks its Chat Completions API (Ollama,
 * LM Studio, vLLM). Paloma builds the prompt and image and checks the answer; this provider only turns a request
 * into one Chat Completions call and its reply back into tags, objects or text.
 * @typedef {import('../../server/src/plugins/api.js').PluginContributions} PluginContributions
 * @typedef {import('../../server/src/plugins/api.js').AiContext} AiContext
 * @typedef {import('../../server/src/plugins/api.js').AiRequest} AiRequest
 * @typedef {import('../../server/src/plugins/api.js').AiAnswer} AiAnswer
 * @typedef {import('../../server/src/plugins/api.js').AiErrorKind} AiErrorKind
 */

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const T = {
  apiKey: {
    en: 'API key', 'zh-Hans': 'API 密钥', es: 'Clave de API', ar: 'مفتاح API', 'pt-BR': 'Chave de API', fr: 'Clé d’API',
    de: 'API-Schlüssel', ja: 'API キー', ru: 'API-ключ', id: 'Kunci API', uk: 'API-ключ',
  },
  apiKeyHelp: {
    en: 'Needed for OpenAI; local servers usually need none.',
    'zh-Hans': 'OpenAI 需要；本地服务器通常不需要。',
    es: 'Necesaria para OpenAI; los servidores locales no suelen necesitarla.',
    ar: 'مطلوب لـ OpenAI؛ الخوادم المحلية لا تحتاجه عادة.',
    'pt-BR': 'Necessária para a OpenAI; servidores locais geralmente não precisam.',
    fr: 'Nécessaire pour OpenAI ; les serveurs locaux n’en ont généralement pas besoin.',
    de: 'Für OpenAI nötig; lokale Server brauchen meist keinen.',
    ja: 'OpenAI では必要です。ローカルサーバーでは通常不要です。',
    ru: 'Нужен для OpenAI; локальным серверам обычно не нужен.',
    id: 'Diperlukan untuk OpenAI; server lokal biasanya tidak memerlukannya.',
    uk: 'Потрібен для OpenAI; локальним серверам зазвичай не потрібен.',
  },
  baseUrl: {
    en: 'Server address', 'zh-Hans': '服务器地址', es: 'Dirección del servidor', ar: 'عنوان الخادم', 'pt-BR': 'Endereço do servidor',
    fr: 'Adresse du serveur', de: 'Serveradresse', ja: 'サーバーのアドレス', ru: 'Адрес сервера', id: 'Alamat server', uk: 'Адреса сервера',
  },
  baseUrlHelp: {
    en: 'OpenAI, or a compatible server such as http://localhost:11434/v1 for Ollama.',
    'zh-Hans': 'OpenAI，或兼容服务器，例如 Ollama 的 http://localhost:11434/v1。',
    es: 'OpenAI o un servidor compatible, como http://localhost:11434/v1 para Ollama.',
    ar: 'OpenAI، أو خادم متوافق مثل http://localhost:11434/v1 لـ Ollama.',
    'pt-BR': 'OpenAI ou um servidor compatível, como http://localhost:11434/v1 para o Ollama.',
    fr: 'OpenAI, ou un serveur compatible comme http://localhost:11434/v1 pour Ollama.',
    de: 'OpenAI oder ein kompatibler Server, etwa http://localhost:11434/v1 für Ollama.',
    ja: 'OpenAI、または Ollama の http://localhost:11434/v1 などの互換サーバー。',
    ru: 'OpenAI или совместимый сервер, например http://localhost:11434/v1 для Ollama.',
    id: 'OpenAI, atau server yang kompatibel seperti http://localhost:11434/v1 untuk Ollama.',
    uk: 'OpenAI або сумісний сервер, наприклад http://localhost:11434/v1 для Ollama.',
  },
  timeout: {
    en: 'Request timeout, seconds', 'zh-Hans': '请求超时（秒）', es: 'Tiempo de espera, segundos', ar: 'مهلة الطلب بالثواني',
    'pt-BR': 'Tempo limite da solicitação, segundos', fr: 'Délai de la requête, secondes', de: 'Zeitlimit der Anfrage, Sekunden',
    ja: 'リクエストのタイムアウト（秒）', ru: 'Тайм-аут запроса, секунды', id: 'Batas waktu permintaan, detik', uk: 'Тайм-аут запиту, секунди',
  },
  temperature: {
    en: 'Temperature', 'zh-Hans': '温度', es: 'Temperatura', ar: 'درجة الحرارة', 'pt-BR': 'Temperatura', fr: 'Température',
    de: 'Temperatur', ja: '温度', ru: 'Температура', id: 'Suhu', uk: 'Температура',
  },
  detail: {
    en: 'Image detail', 'zh-Hans': '图像细节', es: 'Detalle de imagen', ar: 'تفاصيل الصورة', 'pt-BR': 'Detalhe da imagem',
    fr: 'Détail de l’image', de: 'Bilddetail', ja: '画像の詳細度', ru: 'Детализация изображения', id: 'Detail gambar', uk: 'Деталізація зображення',
  },
  auto: { en: 'Auto', 'zh-Hans': '自动', es: 'Automático', ar: 'تلقائي', 'pt-BR': 'Automático', fr: 'Auto', de: 'Automatisch', ja: '自動', ru: 'Авто', id: 'Otomatis', uk: 'Авто' },
  low: { en: 'Low', 'zh-Hans': '低', es: 'Bajo', ar: 'منخفض', 'pt-BR': 'Baixo', fr: 'Faible', de: 'Niedrig', ja: '低', ru: 'Низкая', id: 'Rendah', uk: 'Низька' },
  high: { en: 'High', 'zh-Hans': '高', es: 'Alto', ar: 'مرتفع', 'pt-BR': 'Alto', fr: 'Élevé', de: 'Hoch', ja: '高', ru: 'Высокая', id: 'Tinggi', uk: 'Висока' },
  maxOutputTokens: {
    en: 'Maximum answer tokens', 'zh-Hans': '回答的最大令牌数', es: 'Máximo de tokens de respuesta', ar: 'الحد الأقصى لرموز الإجابة',
    'pt-BR': 'Máximo de tokens da resposta', fr: 'Jetons de réponse maximum', de: 'Maximale Antwort-Tokens', ja: '回答の最大トークン数',
    ru: 'Максимум токенов ответа', id: 'Token jawaban maksimum', uk: 'Максимум токенів відповіді',
  },
};

const SYSTEM_PROMPT = 'You look at photos for a personal photo library and answer only with JSON that matches the requested schema.';

/**
 * @param {string} key
 * @param {{ type: 'object', properties: Record<string, unknown> }} items
 */
const listOf = (key, items) => ({
  type: 'object',
  properties: { [key]: { type: 'array', items: { ...items, required: Object.keys(items.properties), additionalProperties: false } } },
  required: [key],
  additionalProperties: false,
});

/** JSON schemas of the answers, strict as OpenAI's structured outputs need: every property required, nothing else. */
const SCHEMAS = {
  tags: listOf('tags', { type: 'object', properties: { name: { type: 'string' }, confidence: { type: 'number' } } }),
  objects: listOf('objects', {
    type: 'object',
    properties: {
      label: { type: 'string' },
      confidence: { type: 'number' },
      box: {
        type: 'object',
        properties: { left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' } },
        required: ['left', 'top', 'right', 'bottom'],
        additionalProperties: false,
      },
    },
  }),
  text: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
};

/** For servers that do not take `response_format`: the answer's shape in words, added to the prompt. */
const SHAPES = {
  tags: '{"tags": [{"name": "...", "confidence": 0.9}]}',
  objects: '{"objects": [{"label": "...", "confidence": 0.9, "box": {"left": 0.1, "top": 0.2, "right": 0.5, "bottom": 0.8}}]}',
  text: '{"text": "..."}',
};

/**
 * @param {AiErrorKind} kind
 * @param {string} message
 * @param {number} [retryAfterMs]
 */
function providerError(kind, message, retryAfterMs) {
  return Object.assign(new Error(message), { kind, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) });
}

/** The server address and key to use: the saved ones, else the environment's, else OpenAI's address. */
export function connection(/** @type {Pick<AiContext, 'settings' | 'env'>} */ { settings, env }) {
  const saved = typeof settings.baseUrl === 'string' && settings.baseUrl !== '' && settings.baseUrl !== DEFAULT_BASE_URL ? settings.baseUrl : '';
  const baseUrl = (saved || env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey = (typeof settings.apiKey === 'string' && settings.apiKey !== '' ? settings.apiKey : env.OPENAI_API_KEY) || '';
  return { baseUrl, apiKey };
}

/**
 * Sends a request to the server and returns its JSON; failures become provider errors with a kind.
 * @param {AiContext} ctx
 * @param {string} path
 * @param {Record<string, unknown>} [body]
 */
async function call(ctx, path, body) {
  const { baseUrl, apiKey } = connection(ctx);
  const seconds = typeof ctx.settings.timeoutSeconds === 'number' ? ctx.settings.timeoutSeconds : 60;
  /** @type {Response} */
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(seconds * 1000)]),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? `no answer within ${seconds} seconds` : String(err instanceof Error ? err.message : err);
    throw providerError('unreachable', `${baseUrl} cannot be reached: ${reason}`);
  }
  const text = await response.text();
  /** @type {any} */
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (response.ok) return json;
  const message = (json && typeof json.error?.message === 'string' && json.error.message) || `${baseUrl} answered ${response.status} ${response.statusText}`.trim();
  const code = json?.error?.code;
  if (response.status === 401 || response.status === 403 || code === 'insufficient_quota') throw providerError('auth', message);
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'));
    throw providerError('rate-limit', message, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined);
  }
  if (response.status >= 500) throw providerError('unreachable', message);
  throw Object.assign(providerError('other', message), { status: response.status });
}

/** The first JSON object in a reply, also when a model wraps it in text or a code block. */
export function parseReply(/** @type {string} */ content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = /\{[\s\S]*\}/.exec(content);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
  }
  throw providerError('bad-answer', `The model did not answer with JSON: ${content.slice(0, 200)}`);
}

/**
 * The answer in Paloma's shape from the model's JSON.
 * @param {AiRequest['output']} output
 * @param {any} reply
 * @returns {AiAnswer}
 */
export function toAnswer(output, reply) {
  if (typeof reply !== 'object' || reply === null) throw providerError('bad-answer', 'The model did not answer with a JSON object');
  if (output === 'tags') return { tags: Array.isArray(reply.tags) ? reply.tags : [] };
  if (output === 'text') return { text: typeof reply.text === 'string' ? reply.text : '' };
  const objects = Array.isArray(reply.objects) ? reply.objects : [];
  return {
    objects: objects.map((/** @type {any} */ o) => ({ label: o?.label, confidence: o?.confidence, rect: o?.box ?? o?.rect })),
  };
}

/** Request parameters a server may refuse; each one the server names in a 400 is dropped and the request is sent again. */
const OPTIONAL_PARAMS = ['response_format', 'temperature', 'max_completion_tokens'];

/** @returns {PluginContributions} */
export function activate() {
  return {
    aiProviders: [{
      id: 'openai',
      label: 'OpenAI',
      settings: [
        { name: 'apiKey', label: T.apiKey, type: 'secret', help: T.apiKeyHelp },
        { name: 'baseUrl', label: T.baseUrl, type: 'text', default: DEFAULT_BASE_URL, help: T.baseUrlHelp },
        { name: 'timeoutSeconds', label: T.timeout, type: 'number', min: 5, max: 600, default: 60 },
      ],
      missingSettings(ctx) {
        const { baseUrl, apiKey } = connection(ctx);
        return baseUrl === DEFAULT_BASE_URL && !apiKey ? ['apiKey'] : [];
      },
      settingFromEnv(name, { env }) {
        if (name === 'apiKey') return Boolean(env.OPENAI_API_KEY);
        if (name === 'baseUrl') return Boolean(env.OPENAI_BASE_URL);
        return false;
      },
      modelOptions: [
        { name: 'temperature', label: T.temperature, type: 'number', min: 0, max: 2, step: 0.1, default: 0.2 },
        {
          name: 'detail', label: T.detail, type: 'choice', default: 'auto',
          options: [{ value: 'auto', label: T.auto }, { value: 'low', label: T.low }, { value: 'high', label: T.high }],
        },
        { name: 'maxOutputTokens', label: T.maxOutputTokens, type: 'number', min: 64, max: 8192, step: 64, default: 1024 },
      ],

      async listModels(ctx) {
        const json = await call(ctx, '/models');
        const data = Array.isArray(json?.data) ? json.data : [];
        return data.filter((/** @type {any} */ m) => typeof m?.id === 'string').map((/** @type {any} */ m) => ({ id: m.id }));
      },

      async run(request, ctx) {
        const dataUrl = `data:${request.image.mimeType};base64,${request.image.data.toString('base64')}`;
        /** @type {Record<string, unknown>} */
        const body = {
          model: request.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                { type: 'image_url', image_url: { url: dataUrl, detail: request.options.detail } },
              ],
            },
          ],
          temperature: request.options.temperature,
          max_completion_tokens: request.options.maxOutputTokens,
          response_format: { type: 'json_schema', json_schema: { name: `paloma_${request.output}`, strict: true, schema: SCHEMAS[request.output] } },
        };
        /** @type {any} */
        let json;
        for (;;) {
          try {
            json = await call(ctx, '/chat/completions', body);
            break;
          } catch (err) {
            const message = err instanceof Error ? err.message : '';
            const refused = /** @type {{ status?: number }} */ (err).status === 400 && OPTIONAL_PARAMS.find((p) => p in body && message.includes(p));
            if (!refused) throw err;
            delete body[refused];
            if (refused === 'response_format') {
              const user = /** @type {any} */ (body.messages)[1];
              user.content[0].text = `${request.prompt}\n\nAnswer only with JSON like ${SHAPES[request.output]}`;
            }
          }
        }
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') {
          const refusal = json?.choices?.[0]?.message?.refusal;
          throw providerError('bad-answer', typeof refusal === 'string' && refusal ? `The model refused: ${refusal}` : 'The model gave an empty answer');
        }
        const answer = toAnswer(request.output, parseReply(content));
        const usage = json?.usage;
        if (usage) answer.usage = { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
        return answer;
      },
    }],
  };
}
