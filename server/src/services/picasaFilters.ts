import type { EditStep, RelativeRect } from '../../../shared/types.js';

/**
 * Picasa's `filters=` (docs/picassa/07 §4): `name=1,param,…;` items applied from first to last. The list is
 * the photo's edit history, so it becomes the edit chain step by step, in order and with repeats.
 */

type Field = 'number' | 'color';

/** Filters whose parameters have known meaning, with the names they get (docs/picassa/08 §4.2). */
const NAMED: Record<string, [string, Field][]> = {
  tilt: [['angle', 'number'], ['scale', 'number']],
  fill: [['amount', 'number']],
  unsharp2: [['amount', 'number']],
  sat: [['amount', 'number']],
  Boost: [['amount', 'number']],
  finetune2: [['fillLight', 'number'], ['highlights', 'number'], ['shadows', 'number'], ['neutral', 'color'], ['temperature', 'number']],
  Vignette: [['radius', 'number'], ['strength', 'number'], ['fade', 'number'], ['color', 'color']],
};

/** Filters without parameters besides the enabled flag. `bw` and `sepia` are the bundled filters of that name. */
const PLAIN = new Set(['autolight', 'autocolor', 'enhance', 'warm', 'bw', 'sepia', 'Invert']);

const FLOAT = /^-?(\d+(\.\d*)?|\.\d+)$/;
const HEX = /^[0-9a-f]{1,16}$/i;
const COLOR = /^[0-9a-f]{1,8}$/i;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** A `rect64` hex (leading zeros may be missing): four 16-bit words left, top, right, bottom over 65535. */
export function parseRect64(hex: string): RelativeRect | undefined {
  if (!HEX.test(hex)) return undefined;
  const padded = hex.padStart(16, '0');
  const [left, top, right, bottom] = [0, 4, 8, 12].map((at) => round6(parseInt(padded.slice(at, at + 4), 16) / 65535));
  return { left, top, right, bottom };
}

/** A Picasa colour `00RRGGBB` as `#rrggbb`, ignoring the alpha byte; `00000000` means "not chosen" and is null. */
function parseColor(value: string): string | null | undefined {
  if (!COLOR.test(value)) return undefined;
  const padded = value.padStart(8, '0').toLowerCase();
  return padded === '00000000' ? null : `#${padded.slice(2)}`;
}

/** One `name=flag,params…` item as a step, or undefined when it cannot be read. */
function parseItem(item: string): EditStep | undefined {
  const equals = item.indexOf('=');
  if (equals <= 0) return undefined;
  const filter = item.slice(0, equals);
  const [flag, ...params] = item.slice(equals + 1).split(',');
  if (flag !== '0' && flag !== '1') return undefined;
  const step: EditStep = { filter };
  if (flag === '0') step.enabled = false;

  if (filter === 'crop64') {
    const rect = params.length === 1 ? parseRect64(params[0]) : undefined;
    if (!rect) return undefined;
    step.rect = rect;
  } else if (PLAIN.has(filter)) {
    if (params.length > 0) return undefined;
  } else if (filter in NAMED) {
    const fields = NAMED[filter];
    if (params.length !== fields.length) return undefined;
    for (const [index, [name, type]] of fields.entries()) {
      const raw = params[index];
      if (type === 'color') {
        const color = parseColor(raw);
        if (color === undefined) return undefined;
        step[name] = color;
      } else {
        if (!FLOAT.test(raw)) return undefined;
        step[name] = Number(raw);
      }
    }
  } else if (params.length > 0) {
    // Unknown meaning: the raw strings, exactly as in the file, so nothing is guessed
    step.params = params;
  }
  return step;
}

/** The edit chain of a section's `filters=` value; unreadable items are dropped. */
export function parseFilters(value: string | undefined): EditStep[] {
  if (!value) return [];
  return value.split(';').filter((item) => item !== '').map(parseItem).filter((step): step is EditStep => step !== undefined);
}
