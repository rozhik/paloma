// @ts-check
/**
 * Bundled plugin: brightness, contrast, black & white and sepia.
 * @typedef {import('../../server/src/plugins/api.js').PluginHost} PluginHost
 * @typedef {import('../../server/src/plugins/api.js').PluginContributions} PluginContributions
 * @typedef {import('../../server/src/plugins/api.js').RenderInput['image']} Image
 * @typedef {[number, number, number]} Row
 */

const LABELS = {
  brightness: {
    en: 'Brightness', 'zh-Hans': '亮度', es: 'Brillo', ar: 'السطوع', 'pt-BR': 'Brilho', fr: 'Luminosité',
    de: 'Helligkeit', ja: '明るさ', ru: 'Яркость', id: 'Kecerahan', uk: 'Яскравість',
  },
  contrast: {
    en: 'Contrast', 'zh-Hans': '对比度', es: 'Contraste', ar: 'التباين', 'pt-BR': 'Contraste', fr: 'Contraste',
    de: 'Kontrast', ja: 'コントラスト', ru: 'Контраст', id: 'Kontras', uk: 'Контраст',
  },
  amount: {
    en: 'Amount', 'zh-Hans': '强度', es: 'Intensidad', ar: 'المقدار', 'pt-BR': 'Intensidade', fr: 'Intensité',
    de: 'Stärke', ja: '強さ', ru: 'Сила', id: 'Jumlah', uk: 'Сила',
  },
  bw: {
    en: 'Black & white', 'zh-Hans': '黑白', es: 'Blanco y negro', ar: 'أبيض وأسود', 'pt-BR': 'Preto e branco',
    fr: 'Noir et blanc', de: 'Schwarzweiß', ja: '白黒', ru: 'Чёрно-белое', id: 'Hitam putih', uk: 'Чорно-біле',
  },
  sepia: {
    en: 'Sepia', 'zh-Hans': '棕褐色', es: 'Sepia', ar: 'بني داكن', 'pt-BR': 'Sépia', fr: 'Sépia',
    de: 'Sepia', ja: 'セピア', ru: 'Сепия', id: 'Sepia', uk: 'Сепія',
  },
};

/** Rec. 709 luminance, the same in every channel, so the result stays RGB for later steps */
/** @type {Row} */
const LUMINANCE = [0.2126, 0.7152, 0.0722];
/** @type {[Row, Row, Row]} */
const SEPIA = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];

/**
 * The image as plain RGB without alpha, so a 3×3 colour matrix applies. A grey image from another
 * filter gets its one channel copied into red, green and blue.
 * @param {Image} image
 * @param {PluginHost} host
 */
async function toRgb(image, host) {
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const grey = { width: info.width, height: info.height, channels: /** @type {const} */ (1) };
  if (info.channels === 1) return host.sharp(data, { raw: grey }).joinChannel([data, data], { raw: grey });
  return host.sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

/**
 * @param {PluginHost} host
 * @returns {PluginContributions}
 */
export function activate(host) {
  const amountParam = () => ({
    name: 'amount', label: LABELS.amount, type: /** @type {const} */ ('number'), min: -100, max: 100, step: 1, default: 0,
  });

  return {
    filters: [
      {
        name: 'brightness',
        label: LABELS.brightness,
        group: 'tuning',
        icon: 'icons/brightness.svg',
        params: [amountParam()],
        render({ image, params }) {
          const amount = /** @type {number} */ (params.amount);
          return amount === 0 ? image : image.modulate({ brightness: 1 + amount / 200 });
        },
      },
      {
        name: 'contrast',
        label: LABELS.contrast,
        group: 'tuning',
        icon: 'icons/contrast.svg',
        params: [amountParam()],
        render({ image, params }) {
          const amount = /** @type {number} */ (params.amount);
          if (amount === 0) return image;
          // Stretch or squeeze values around middle grey
          const factor = Math.max(0, 1 + amount / 100);
          return image.linear(factor, 128 * (1 - factor));
        },
      },
      {
        name: 'bw',
        label: LABELS.bw,
        group: 'effects',
        icon: 'icons/bw.svg',
        params: [],
        async render({ image }) {
          return (await toRgb(image, host)).recomb([LUMINANCE, LUMINANCE, LUMINANCE]);
        },
      },
      {
        name: 'sepia',
        label: LABELS.sepia,
        group: 'effects',
        icon: 'icons/sepia.svg',
        params: [],
        async render({ image }) {
          return (await toRgb(image, host)).recomb(SEPIA);
        },
      },
    ],
  };
}
