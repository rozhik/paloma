/**
 * Reads the description and tags that Picasa, cameras and other programs embed in a photo file
 * (XMP, IPTC IIM, EXIF). Read-only: Paloma never writes these blocks.
 */

/** Description and tags found in one metadata block; absent when the block has none. */
export interface TextFields {
  caption?: string;
  keywords?: string[];
}

export interface EmbeddedText {
  caption: string | null;
  keywords: string[];
  cameraMake: string | null;
  cameraModel: string | null;
}

/** Decodes UTF-8, falling back to latin1 for bytes that are not valid UTF-8. */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

const IPTC_TAG_MARKER = 0x1c;
const UTF8_ESCAPE = Buffer.from([0x1b, 0x25, 0x47]); // ESC % G

const IRB_SIGNATURE = Buffer.from('8BIM');
const IRB_IPTC = 0x0404;

/**
 * The IIM records of an IPTC block: sharp hands over the Photoshop image resources (`8BIM` blocks), where
 * resource 0x0404 holds them; a block that starts with a tag marker is taken as IIM itself.
 */
function iimData(block: Buffer): Buffer | undefined {
  if (block[0] === IPTC_TAG_MARKER) return block;
  let offset = block.indexOf(IRB_SIGNATURE);
  while (offset >= 0 && offset + 12 <= block.length && block.subarray(offset, offset + 4).equals(IRB_SIGNATURE)) {
    const id = block.readUInt16BE(offset + 4);
    const nameLength = block[offset + 6];
    const nameSize = (nameLength + 1) % 2 === 0 ? nameLength + 1 : nameLength + 2; // Pascal string, even size
    const sizeOffset = offset + 6 + nameSize;
    if (sizeOffset + 4 > block.length) return undefined;
    const size = block.readUInt32BE(sizeOffset);
    const start = sizeOffset + 4;
    if (start + size > block.length) return undefined;
    if (id === IRB_IPTC) return block.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  return undefined;
}

/**
 * IPTC IIM: dataset 2:120 is the caption, every 2:25 a keyword. Text is UTF-8 when 1:90 says so,
 * otherwise UTF-8 if valid, else latin1. Reading stops at a truncated or extended-length record.
 */
export function readIptcText(block: Buffer | undefined): TextFields {
  const iptc = block && iimData(block);
  if (!iptc) return {};
  let offset = 0;
  const raw: { caption?: Buffer; keywords: Buffer[] } = { keywords: [] };
  let utf8 = false;
  while (offset + 5 <= iptc.length && iptc[offset] === IPTC_TAG_MARKER) {
    const record = iptc[offset + 1];
    const dataset = iptc[offset + 2];
    const length = iptc.readUInt16BE(offset + 3);
    if (length & 0x8000) break; // extended datasets are never text we read
    const start = offset + 5;
    if (start + length > iptc.length) break;
    const value = iptc.subarray(start, start + length);
    if (record === 1 && dataset === 90) utf8 = value.equals(UTF8_ESCAPE);
    if (record === 2 && dataset === 120 && raw.caption === undefined) raw.caption = value;
    if (record === 2 && dataset === 25) raw.keywords.push(value);
    offset = start + length;
  }
  const decode = (value: Buffer) => (utf8 ? value.toString('utf8') : decodeText(value));
  const fields: TextFields = {};
  if (raw.caption) fields.caption = decode(raw.caption);
  const keywords = raw.keywords.map(decode).filter((keyword) => keyword.trim() !== '');
  if (keywords.length > 0) fields.keywords = keywords;
  return fields;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return ENTITIES[entity];
  });
}

/** The `rdf:li` items of an element's content, with their `xml:lang`. */
function listItems(content: string): { lang: string | null; text: string }[] {
  return [...content.matchAll(/<rdf:li\b([^>]*?)(?:\/>|>([\s\S]*?)<\/rdf:li>)/g)].map(([, attrs, text]) => ({
    lang: /xml:lang\s*=\s*["']([^"']*)["']/.exec(attrs)?.[1] ?? null,
    text: decodeEntities(text ?? ''),
  }));
}

/** Content of `<dc:name ...>...</dc:name>`, or the value of a `dc:name="..."` attribute. */
function property(xmp: string, name: string): { content?: string; attribute?: string } {
  const element = new RegExp(`<dc:${name}\\b[^>]*>([\\s\\S]*?)</dc:${name}>`).exec(xmp);
  if (element) return { content: element[1] };
  const attribute = new RegExp(`\\sdc:${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(xmp);
  if (attribute) return { attribute: decodeEntities(attribute[2] ?? attribute[3]) };
  return {};
}

/** XMP: `dc:description` (the `x-default` item, else the first) and `dc:subject` items. */
export function readXmpText(xmp: Buffer | undefined): TextFields {
  if (!xmp) return {};
  const text = xmp.toString('utf8');
  const fields: TextFields = {};

  const description = property(text, 'description');
  if (description.attribute !== undefined) {
    fields.caption = description.attribute;
  } else if (description.content !== undefined) {
    const items = listItems(description.content);
    const item = items.find((i) => i.lang === 'x-default') ?? items[0];
    if (item) fields.caption = item.text;
  }

  const subject = property(text, 'subject');
  const keywords = subject.attribute !== undefined
    ? [subject.attribute]
    : listItems(subject.content ?? '').map((i) => i.text);
  const nonBlank = keywords.filter((keyword) => keyword.trim() !== '');
  if (nonBlank.length > 0) fields.keywords = nonBlank;
  return fields;
}

/** An EXIF ASCII value: exif-reader gives a string, or the raw bytes when they are not 7-bit. */
function exifString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.replace(/\0+$/, '');
  if (value instanceof Uint8Array) return decodeText(value).replace(/\0+$/, '');
  return undefined;
}

/** Windows XP tags: UTF-16LE in a BYTE array, NUL-terminated. */
function xpString(value: unknown): string | undefined {
  const bytes = Array.isArray(value) ? Uint8Array.from(value as number[]) : value instanceof Uint8Array ? value : null;
  if (!bytes || bytes.length < 2) return undefined;
  return new TextDecoder('utf-16le').decode(bytes.subarray(0, bytes.length - (bytes.length % 2))).replace(/\0+$/, '');
}

type ExifImage = Record<string, unknown> | undefined;

/** EXIF `ImageDescription` (else `XPComment`) and `XPKeywords` split at `;`. */
export function readExifText(image: ExifImage): TextFields {
  if (!image) return {};
  const fields: TextFields = {};
  const caption = [exifString(image.ImageDescription), xpString(image.XPComment)].find((c) => usableCaption(c));
  if (caption !== undefined) fields.caption = caption;
  const keywords = (xpString(image.XPKeywords) ?? '').split(';').filter((keyword) => keyword.trim() !== '');
  if (keywords.length > 0) fields.keywords = keywords;
  return fields;
}

/** Texts cameras write as the description by default; never a user's description. */
export const CAMERA_PLACEHOLDERS = new Set([
  'OLYMPUS DIGITAL CAMERA',
  'SONY DSC',
  'DIGITAL CAMERA',
  'KONICA MINOLTA DIGITAL CAMERA',
  'Default',
]);

function usableCaption(caption: string | undefined): caption is string {
  if (caption === undefined) return false;
  const trimmed = caption.trim();
  return trimmed !== '' && !CAMERA_PLACEHOLDERS.has(trimmed);
}

/** Tags without later duplicates, compared ignoring case; the first spelling and order are kept. */
export function uniqueKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  return keywords.filter((keyword) => {
    const key = keyword.toLowerCase();
    if (keyword === '' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Description and tags from the first block that has them, in the order XMP, IPTC, EXIF. */
export function combineEmbeddedText(blocks: TextFields[]): Pick<EmbeddedText, 'caption' | 'keywords'> {
  const caption = blocks.map((block) => block.caption).find(usableCaption) ?? null;
  const keywords = blocks.map((block) => block.keywords).find((list) => list && list.length > 0) ?? [];
  return { caption, keywords: uniqueKeywords(keywords) };
}

/** Camera make or model as text; blank values count as none. */
export function cameraText(value: unknown): string | null {
  const text = exifString(value)?.trim();
  return text ? text : null;
}
