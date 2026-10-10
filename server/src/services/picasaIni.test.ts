import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { findPicasaIni, parseGeotag, parsePicasaIni, readPicasaIni } from './picasaIni.js';

const sectionsOf = (bytes: Buffer) => parsePicasaIni(bytes).sections;

const crlf = (...lines: string[]): Buffer => Buffer.from(lines.map((line) => `${line}\r\n`).join(''));

describe('findPicasaIni', () => {
  it('prefers .picasa.ini over Picasa.ini and ignores other files', async () => {
    expect(findPicasaIni(['a.jpg', 'Picasa.ini', '.picasa.ini'])).toBe('.picasa.ini');
    expect(findPicasaIni(['a.jpg', 'Picasa.ini'])).toBe('Picasa.ini');
    expect(findPicasaIni(['.Picasa.INI', 'picasa.ini'])).toBe('.Picasa.INI');
    expect(findPicasaIni(['a.jpg', 'picasa.ini.bak'])).toBeUndefined();
  });
});

describe('parsePicasaIni', () => {
  it('maps star, hidden, caption, keywords and filters and ignores other keys', async () => {
    const sections = sectionsOf(crlf(
      '[a.jpg]',
      'star=yes',
      'hidden=yes',
      'caption=Sunrise',
      'keywords=mountains,,dawn',
      'filters=crop64=1,4c0e1ab4d2ba7b2a;',
      'rotate=rotate(1)',
      '[b.jpg]',
      'backuphash=52410',
    ));
    expect(sections).toEqual({
      'a.jpg': {
        star: true,
        hidden: true,
        caption: 'Sunrise',
        keywords: ['mountains', 'dawn'],
        edits: [{ filter: 'crop64', rect: { left: 0.297093, top: 0.104311, right: 0.823163, bottom: 0.481117 } }],
      },
    });
  });

  it('keeps spaces in values', async () => {
    expect(sectionsOf(crlf('[a.jpg]', 'caption= Sunrise ', 'keywords= hills ,dawn'))).toEqual({
      'a.jpg': { caption: ' Sunrise ', keywords: [' hills ', 'dawn'] },
    });
  });

  it('only treats star=yes as starred', async () => {
    expect(sectionsOf(crlf('[a.jpg]', 'star=no', 'hidden=1'))).toEqual({});
  });

  it('uses the first occurrence of a duplicate key and ignores a repeated section', async () => {
    expect(sectionsOf(crlf('[a.jpg]', 'caption=first', 'caption=second', '[a.jpg]', 'star=yes'))).toEqual({
      'a.jpg': { caption: 'first' },
    });
  });

  it('skips folder, album, contact and other non-file sections', async () => {
    expect(sectionsOf(crlf(
      '[Picasa]', 'name=Trip', 'caption=x',
      '[.album:c9ea9fa67022f38a3c771894d2a8a468]', 'name=Birds', 'caption=x',
      '[Contacts2]', 'b8e4117cf1d6615b=Roy;;',
      '[encoding]', 'utf8=1',
      '[photoid]', '1=a.jpg',
      '[(null)]', 'star=yes',
    ))).toEqual({});
  });

  it('reads album sections with their mapped keys verbatim', async () => {
    expect(parsePicasaIni(crlf(
      '[.album:c9ea9fa67022f38a3c771894d2a8a468]',
      'name= Birds  of Ukraine',
      'token=c9ea9fa67022f38a3c771894d2a8a468',
      'date=2018-10-23T15:33:29+03:00',
      'location= ',
      'description=Spring',
      'name_lh=web',
      '[.album:7f01]',
      'token=7f01',
      '[.album:7f01]',
      'name=Repeated',
    )).albums).toEqual({
      c9ea9fa67022f38a3c771894d2a8a468: {
        name: ' Birds  of Ukraine', date: '2018-10-23T15:33:29+03:00', location: ' ', description: 'Spring',
      },
      '7f01': {},
    });
  });

  it('reads album membership without empty items or duplicates', async () => {
    expect(sectionsOf(crlf('[a.jpg]', 'albums=a,,a,b'))).toEqual({ 'a.jpg': { albums: ['a', 'b'] } });
  });

  it('reads LF line endings and skips blank lines', async () => {
    expect(sectionsOf(Buffer.from('[a.jpg]\n\nstar=yes\n'))).toEqual({ 'a.jpg': { star: true } });
  });

  it('decodes windows-1251 when the file is not valid UTF-8', async () => {
    // "Захід" in windows-1251
    const caption = Buffer.from([0xc7, 0xe0, 0xf5, 0xb3, 0xe4]);
    const bytes = Buffer.concat([Buffer.from('[a.jpg]\r\ncaption='), caption, Buffer.from('\r\n')]);
    expect(sectionsOf(bytes)).toEqual({ 'a.jpg': { caption: 'Захід' } });
  });

  it('reads UTF-8 Cyrillic as is', async () => {
    expect(sectionsOf(crlf('[Зйомка 1.bmp]', 'keywords=гори,схід сонця'))).toEqual({
      'Зйомка 1.bmp': { keywords: ['гори', 'схід сонця'] },
    });
  });

  it('treats an empty file as having no data', async () => {
    expect(sectionsOf(Buffer.alloc(0))).toEqual({});
  });
});

describe('parseGeotag', () => {
  it('reads decimal degrees, negative values and spaces around the numbers', async () => {
    expect(parseGeotag('33.770556,-84.293055')).toEqual({ lat: 33.770556, lon: -84.293055 });
    expect(parseGeotag(' -33.856 , 151.215 ')).toEqual({ lat: -33.856, lon: 151.215 });
    expect(parseGeotag('48,24')).toEqual({ lat: 48, lon: 24 });
  });

  it('rounds to 6 decimal places', async () => {
    expect(parseGeotag('48.1608334999,24.50027777')).toEqual({ lat: 48.160833, lon: 24.500278 });
  });

  it('ignores malformed and out-of-range values', async () => {
    for (const value of [undefined, '', 'north,east', '48.1', '48.1,24.5,3', '48.1,', '91,0', '0,181', '1e2,3', '0x10,3', '48.1;24.5']) {
      expect(parseGeotag(value), String(value)).toBeUndefined();
    }
  });

  it('maps the geotag key of a file section', async () => {
    expect(sectionsOf(crlf('[a.jpg]', 'geotag=33.770556,-84.293055', '[b.jpg]', 'geotag=north,east'))).toEqual({
      'a.jpg': { geotag: { lat: 33.770556, lon: -84.293055 } },
    });
  });
});

describe('readPicasaIni', () => {
  let dir: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_ini_test_'));
  });

  afterEach(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports a folder without a Picasa file as missing', async () => {
    fs.writeFileSync(path.join(dir, 'a.jpg'), '');
    expect(await readPicasaIni(dir)).toEqual({ kind: 'missing' });
  });

  it('reads the file and hashes its raw bytes', async () => {
    const bytes = crlf('[a.jpg]', 'star=yes');
    fs.writeFileSync(path.join(dir, 'Picasa.ini'), bytes);

    expect(await readPicasaIni(dir)).toEqual({
      kind: 'ok',
      fileName: 'Picasa.ini',
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      sections: { 'a.jpg': { star: true } },
      albums: {},
      people: {},
    });
  });

  it('reads an empty file as present with no sections', async () => {
    fs.writeFileSync(path.join(dir, '.picasa.ini'), '');
    expect(await readPicasaIni(dir)).toMatchObject({ kind: 'ok', fileName: '.picasa.ini', sections: {} });
  });
});

describe('Picasa faces and contacts', () => {
  const ini = (text: string) => parsePicasaIni(Buffer.from(text.replace(/\n/g, '\r\n')));

  it('reads a named face, an ignored face and the contact', async () => {
    const data = ini([
      '[Contacts2]',
      'b8e4117cf1d6615b=Roy Avery;;',
      '[a.jpg]',
      'faces=rect64(579922efa1cce2aa),b8e4117cf1d6615b;rect64(502f02655e191250),ffffffffffffffff',
    ].join('\n'));

    expect(data.people).toEqual({ b8e4117cf1d6615b: { name: 'Roy Avery', email: null, googleId: null } });
    expect(data.sections['a.jpg'].faces).toEqual([
      { rect: { left: 0.342184, top: 0.136461, right: 0.632029, bottom: 0.88542 }, person: 'b8e4117cf1d6615b' },
      { rect: expect.any(Object), ignored: true },
    ]);
    expect(data.sections.Contacts2).toBeUndefined();
  });

  it('pads a short contact id to 16 digits', async () => {
    const data = ini('[Contacts2]\n8E4117cf1d6615b=Ann;ann@example.com;123\n[a.jpg]\nfaces=rect64(1),8E4117cf1d6615b');
    expect(data.people).toEqual({ '08e4117cf1d6615b': { name: 'Ann', email: 'ann@example.com', googleId: '123' } });
    expect(data.sections['a.jpg'].faces?.[0].person).toBe('08e4117cf1d6615b');
  });

  it('drops a contact without exactly three parts', async () => {
    expect(ini('[Contacts2]\n0123456789abcdef=Ann;ann@example.com').people).toEqual({});
  });

  it('drops faces that cannot be read', async () => {
    const data = ini('[a.jpg]\nfaces=rect64(zz),b8e4117cf1d6615b;rect64(1),;oops;rect64(10001),b8e4117cf1d6615b');
    expect(data.sections['a.jpg'].faces).toEqual([
      { rect: { left: 0, top: 0, right: 0.000015, bottom: 0.000015 }, person: 'b8e4117cf1d6615b' },
    ]);
  });
});
