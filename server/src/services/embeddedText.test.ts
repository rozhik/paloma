import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  combineEmbeddedText, readExifText, readIptcText, readXmpText, uniqueKeywords,
} from './embeddedText.js';
import { iim, photoshopIptc, writeJpegWithText, xmpPacket } from './embeddedText.fixtures.js';
import { MetadataService } from './MetadataService.js';

const xp = (text: string) => [...Buffer.from(`${text}\0`, 'utf16le')];

describe('readIptcText', () => {
  it('reads a UTF-8 Cyrillic caption marked by 1:90', () => {
    const block = photoshopIptc(iim([[1, 90, Buffer.from([0x1b, 0x25, 0x47])], [2, 120, 'Ринок у Львові']]));
    expect(readIptcText(block)).toEqual({ caption: 'Ринок у Львові' });
  });

  it('reads a latin1 caption without a charset marker', () => {
    const block = photoshopIptc(iim([[2, 120, Buffer.from('Café', 'latin1')]]));
    expect(readIptcText(block)).toEqual({ caption: 'Café' });
  });

  it('reads every keyword in order', () => {
    expect(readIptcText(iim([[2, 25, 'old'], [2, 25, 'bridge'], [2, 25, 'river']])))
      .toEqual({ keywords: ['old', 'bridge', 'river'] });
  });

  it('ignores a truncated record and keeps the ones before it', () => {
    const records = iim([[2, 25, 'old'], [2, 25, 'bridge']]);
    expect(readIptcText(records.subarray(0, records.length - 2))).toEqual({ keywords: ['old'] });
  });

  it('reads nothing from a block without IIM', () => {
    expect(readIptcText(Buffer.from('Photoshop 3.0\0nothing here'))).toEqual({});
    expect(readIptcText(undefined)).toEqual({});
  });
});

describe('readXmpText', () => {
  it('reads a Picasa-style packet', () => {
    const xmp = Buffer.from(xmpPacket({ description: 'Sunrise', subject: ['dawn', 'hills'] }));
    expect(readXmpText(xmp)).toEqual({ caption: 'Sunrise', keywords: ['dawn', 'hills'] });
  });

  it('prefers the x-default description of a Lightroom-style packet', () => {
    const xmp = Buffer.from(`<x:xmpmeta><rdf:RDF><rdf:Description rdf:about="">
      <dc:description><rdf:Alt><rdf:li xml:lang="uk">Міст</rdf:li><rdf:li xml:lang="x-default">Bridge</rdf:li></rdf:Alt></dc:description>
      <dc:subject><rdf:Seq><rdf:li>Rock &amp; Roll</rdf:li><rdf:li>river</rdf:li></rdf:Seq></dc:subject>
    </rdf:Description></rdf:RDF></x:xmpmeta>`);
    expect(readXmpText(xmp)).toEqual({ caption: 'Bridge', keywords: ['Rock & Roll', 'river'] });
  });

  it('reads the attribute form Windows writes for a description', () => {
    const xmp = Buffer.from('<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" dc:description="Old &quot;bridge&quot;"/>');
    expect(readXmpText(xmp)).toEqual({ caption: 'Old "bridge"' });
  });

  it('reads nothing from a packet without dc', () => {
    expect(readXmpText(Buffer.from('<x:xmpmeta><rdf:RDF><rdf:Description xmp:Rating="5"/></rdf:RDF></x:xmpmeta>'))).toEqual({});
  });
});

describe('readExifText', () => {
  it('reads ImageDescription and XPKeywords split at semicolons', () => {
    expect(readExifText({ ImageDescription: 'Market', XPKeywords: xp('a;b;') })).toEqual({ caption: 'Market', keywords: ['a', 'b'] });
  });

  it('falls back to XPComment when ImageDescription is a camera placeholder', () => {
    expect(readExifText({ ImageDescription: 'OLYMPUS DIGITAL CAMERA   ', XPComment: xp('Lake') })).toEqual({ caption: 'Lake' });
  });
});

describe('combineEmbeddedText', () => {
  it('takes XMP over IPTC and IPTC over EXIF', () => {
    expect(combineEmbeddedText([{ caption: 'xmp' }, { caption: 'iptc', keywords: ['old'] }, { caption: 'exif', keywords: ['e'] }]))
      .toEqual({ caption: 'xmp', keywords: ['old'] });
    expect(combineEmbeddedText([{}, { caption: 'iptc' }, { caption: 'exif' }])).toEqual({ caption: 'iptc', keywords: [] });
  });

  it('skips blank descriptions and camera placeholders', () => {
    expect(combineEmbeddedText([{ caption: '  ' }, { caption: 'iptc' }])).toEqual({ caption: 'iptc', keywords: [] });
    expect(combineEmbeddedText([{ caption: 'OLYMPUS DIGITAL CAMERA          ' }])).toEqual({ caption: null, keywords: [] });
  });

  it('drops later duplicates ignoring case', () => {
    expect(uniqueKeywords(['Київ', 'київ', 'Lviv', ''])).toEqual(['Київ', 'Lviv']);
  });
});

describe('MetadataService.extractMetadata text', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reads XMP, IPTC and EXIF text and the camera from a JPEG', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_text_'));
    const file = path.join(dir, 'a.jpg');
    await writeJpegWithText(file, {
      xmp: xmpPacket({ subject: ['bridge', 'river'] }),
      iptc: iim([[2, 120, 'Market day'], [2, 25, 'old']]),
      exif: { ImageDescription: 'SONY DSC', Make: 'Canon', Model: 'Canon EOS 80D' },
    });

    const metadata = await MetadataService.extractMetadata(file);

    expect(metadata).toMatchObject({
      caption: 'Market day', keywords: ['bridge', 'river'], cameraMake: 'Canon', cameraModel: 'Canon EOS 80D',
    });
  });

  it('has no text for a JPEG without metadata', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_text_'));
    const file = path.join(dir, 'a.jpg');
    await writeJpegWithText(file, {});
    expect(await MetadataService.extractMetadata(file)).toMatchObject({ caption: null, keywords: [], cameraMake: null, cameraModel: null });
  });
});
