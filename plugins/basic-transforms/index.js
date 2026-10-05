// @ts-check
/**
 * Bundled plugin: crop, rotate by quarter turns, flip and straighten.
 * @typedef {import('../../server/src/plugins/api.js').PluginHost} PluginHost
 * @typedef {import('../../server/src/plugins/api.js').PluginContributions} PluginContributions
 * @typedef {import('../../server/src/plugins/api.js').RelativeRect} RelativeRect
 */

const LABELS = {
  crop: {
    en: 'Crop', 'zh-Hans': '裁剪', es: 'Recortar', ar: 'قص', 'pt-BR': 'Recortar', fr: 'Recadrer',
    de: 'Zuschneiden', ja: '切り抜き', ru: 'Кадрирование', id: 'Pangkas', uk: 'Кадрування',
  },
  frame: {
    en: 'Frame', 'zh-Hans': '区域', es: 'Área', ar: 'الإطار', 'pt-BR': 'Área', fr: 'Cadre',
    de: 'Ausschnitt', ja: '範囲', ru: 'Рамка', id: 'Bingkai', uk: 'Рамка',
  },
  rotate: {
    en: 'Rotate', 'zh-Hans': '旋转', es: 'Girar', ar: 'تدوير', 'pt-BR': 'Girar', fr: 'Rotation',
    de: 'Drehen', ja: '回転', ru: 'Поворот', id: 'Putar', uk: 'Поворот',
  },
  angle: {
    en: 'Angle', 'zh-Hans': '角度', es: 'Ángulo', ar: 'الزاوية', 'pt-BR': 'Ângulo', fr: 'Angle',
    de: 'Winkel', ja: '角度', ru: 'Угол', id: 'Sudut', uk: 'Кут',
  },
  flip: {
    en: 'Flip', 'zh-Hans': '翻转', es: 'Voltear', ar: 'قلب', 'pt-BR': 'Espelhar', fr: 'Retourner',
    de: 'Spiegeln', ja: '反転', ru: 'Отражение', id: 'Balik', uk: 'Віддзеркалення',
  },
  direction: {
    en: 'Direction', 'zh-Hans': '方向', es: 'Dirección', ar: 'الاتجاه', 'pt-BR': 'Direção', fr: 'Direction',
    de: 'Richtung', ja: '方向', ru: 'Направление', id: 'Arah', uk: 'Напрямок',
  },
  horizontal: {
    en: 'Horizontal', 'zh-Hans': '水平', es: 'Horizontal', ar: 'أفقي', 'pt-BR': 'Horizontal', fr: 'Horizontal',
    de: 'Horizontal', ja: '水平', ru: 'Горизонтально', id: 'Horizontal', uk: 'Горизонтально',
  },
  vertical: {
    en: 'Vertical', 'zh-Hans': '垂直', es: 'Vertical', ar: 'عمودي', 'pt-BR': 'Vertical', fr: 'Vertical',
    de: 'Vertikal', ja: '垂直', ru: 'Вертикально', id: 'Vertikal', uk: 'Вертикально',
  },
  straighten: {
    en: 'Straighten', 'zh-Hans': '拉直', es: 'Enderezar', ar: 'تسوية', 'pt-BR': 'Endireitar', fr: 'Redresser',
    de: 'Gerade ausrichten', ja: '傾き補正', ru: 'Выравнивание', id: 'Luruskan', uk: 'Вирівнювання',
  },
};

/**
 * Scale of the largest centred rectangle with the image's aspect ratio that fits inside the image
 * turned by `degrees`, so the straightened result has no blank corners.
 * @param {number} width @param {number} height @param {number} degrees
 */
export function straightenScale(width, height, degrees) {
  const radians = (Math.abs(degrees) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return Math.min(width / (width * cos + height * sin), height / (width * sin + height * cos));
}

/**
 * @param {PluginHost} host
 * @returns {PluginContributions}
 */
export function activate(host) {
  return {
    filters: [
      {
        name: 'crop64',
        label: LABELS.crop,
        group: 'basic',
        icon: 'icons/crop64.svg',
        params: [{ name: 'rect', label: LABELS.frame, type: 'rect', default: { left: 0, top: 0, right: 1, bottom: 1 } }],
        render({ image, width, height, params }) {
          const rect = /** @type {RelativeRect} */ (params.rect);
          const left = Math.min(width - 1, Math.round(rect.left * width));
          const top = Math.min(height - 1, Math.round(rect.top * height));
          const right = Math.max(left + 1, Math.round(rect.right * width));
          const bottom = Math.max(top + 1, Math.round(rect.bottom * height));
          return image.extract({ left, top, width: right - left, height: bottom - top });
        },
      },
      {
        name: 'rotate',
        label: LABELS.rotate,
        group: 'basic',
        icon: 'icons/rotate.svg',
        params: [{
          name: 'angle',
          label: LABELS.angle,
          type: 'choice',
          options: [{ value: 90, label: '90°' }, { value: 180, label: '180°' }, { value: 270, label: '270°' }],
          default: 90,
        }],
        render({ image, params }) {
          return image.rotate(/** @type {number} */ (params.angle));
        },
      },
      {
        name: 'flip',
        label: LABELS.flip,
        group: 'basic',
        icon: 'icons/flip.svg',
        params: [{
          name: 'direction',
          label: LABELS.direction,
          type: 'choice',
          options: [{ value: 'horizontal', label: LABELS.horizontal }, { value: 'vertical', label: LABELS.vertical }],
          default: 'horizontal',
        }],
        render({ image, params }) {
          // sharp's flop() mirrors left to right, flip() top to bottom
          return params.direction === 'vertical' ? image.flip() : image.flop();
        },
      },
      {
        name: 'straighten',
        label: LABELS.straighten,
        group: 'basic',
        icon: 'icons/straighten.svg',
        params: [{ name: 'angle', label: LABELS.angle, type: 'number', min: -45, max: 45, step: 0.1, default: 0 }],
        async render({ image, width, height, params }) {
          const angle = /** @type {number} */ (params.angle);
          if (angle === 0) return image;
          const turned = await image
            .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .raw()
            .toBuffer({ resolveWithObject: true });
          const { info } = turned;
          const scale = straightenScale(width, height, angle);
          // One pixel in from the exact fit, so no anti-aliased edge of the turned image shows
          const cropWidth = Math.max(1, Math.floor(width * scale) - 2);
          const cropHeight = Math.max(1, Math.floor(height * scale) - 2);
          return host.sharp(turned.data, { raw: { width: info.width, height: info.height, channels: info.channels } })
            .extract({
              left: Math.floor((info.width - cropWidth) / 2),
              top: Math.floor((info.height - cropHeight) / 2),
              width: cropWidth,
              height: cropHeight,
            })
            .removeAlpha();
        },
      },
    ],
  };
}
