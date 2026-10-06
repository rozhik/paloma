/** Builders of XMP, IPTC and EXIF text blocks for tests, and a JPEG writer that embeds them. */
import fs from 'node:fs';
import sharp from 'sharp';

/** IIM records: `[record, dataset, value]`. */
export function iim(records: Array<[number, number, string | Buffer]>): Buffer {
  return Buffer.concat(records.map(([record, dataset, value]) => {
    const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
    const header = Buffer.from([0x1c, record, dataset, 0, 0]);
    header.writeUInt16BE(bytes.length, 3);
    return Buffer.concat([header, bytes]);
  }));
}

/** IIM records wrapped as Photoshop resource 0x0404, as JPEG APP13 carries them. */
export function photoshopIptc(records: Buffer): Buffer {
  const header = Buffer.alloc(12);
  header.write('8BIM', 0, 'latin1');
  header.writeUInt16BE(0x0404, 4);
  header.writeUInt16BE(0, 6); // empty Pascal name, padded to even length
  header.writeUInt32BE(records.length, 8);
  const pad = records.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), header, records, pad]);
}

/** An XMP packet with the given description and subject items. */
export function xmpPacket({ description, subject }: { description?: string; subject?: string[] }): string {
  const li = (items: string[]) => items.map((item) => `<rdf:li>${item}</rdf:li>`).join('');
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
${description === undefined ? '' : `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${description}</rdf:li></rdf:Alt></dc:description>`}
${subject === undefined ? '' : `<dc:subject><rdf:Bag>${li(subject)}</rdf:Bag></dc:subject>`}
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
}

function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

export interface JpegText {
  xmp?: string;
  /** IIM records (not yet wrapped) */
  iptc?: Buffer;
  /** EXIF IFD0 string tags, as sharp's `withExif` takes them */
  exif?: Record<string, string>;
}

/** Writes a tiny JPEG with the given XMP (APP1), IPTC (APP13) and EXIF blocks. */
export async function writeJpegWithText(file: string, text: JpegText, color = '#888888'): Promise<void> {
  let image = sharp({ create: { width: 8, height: 8, channels: 3, background: color } }).jpeg();
  if (text.exif) image = image.withExif({ IFD0: text.exif });
  const jpeg = await image.toBuffer();
  const segments: Buffer[] = [];
  if (text.xmp) segments.push(segment(0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(text.xmp, 'utf8')])));
  if (text.iptc) segments.push(segment(0xed, photoshopIptc(text.iptc)));
  // Right after SOI; readers find APP segments in any order
  fs.writeFileSync(file, Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]));
}
