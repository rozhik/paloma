import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { findPicasaIni, parsePicasaIni, readPicasaIni } from './picasaIni.js';

const crlf = (...lines: string[]): Buffer => Buffer.from(lines.map((line) => `${line}\r\n`).join(''));

describe('findPicasaIni', () => {
  it('prefers .picasa.ini over Picasa.ini and ignores other files', () => {
    expect(findPicasaIni(['a.jpg', 'Picasa.ini', '.picasa.ini'])).toBe('.picasa.ini');
    expect(findPicasaIni(['a.jpg', 'Picasa.ini'])).toBe('Picasa.ini');
    expect(findPicasaIni(['.Picasa.INI', 'picasa.ini'])).toBe('.Picasa.INI');
    expect(findPicasaIni(['a.jpg', 'picasa.ini.bak'])).toBeUndefined();
  });
});

describe('parsePicasaIni', () => {
  it('maps star, hidden, caption and keywords and ignores other keys', () => {
    const sections = parsePicasaIni(crlf(
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
      'a.jpg': { star: true, hidden: true, caption: 'Sunrise', keywords: ['mountains', 'dawn'] },
    });
  });

  it('keeps spaces in values', () => {
    expect(parsePicasaIni(crlf('[a.jpg]', 'caption= Sunrise ', 'keywords= hills ,dawn'))).toEqual({
      'a.jpg': { caption: ' Sunrise ', keywords: [' hills ', 'dawn'] },
    });
  });

  it('only treats star=yes as starred', () => {
    expect(parsePicasaIni(crlf('[a.jpg]', 'star=no', 'hidden=1'))).toEqual({});
  });

  it('uses the first occurrence of a duplicate key and ignores a repeated section', () => {
    expect(parsePicasaIni(crlf('[a.jpg]', 'caption=first', 'caption=second', '[a.jpg]', 'star=yes'))).toEqual({
      'a.jpg': { caption: 'first' },
    });
  });

  it('skips folder, album, contact and other non-file sections', () => {
    expect(parsePicasaIni(crlf(
      '[Picasa]', 'name=Trip', 'caption=x',
      '[.album:c9ea9fa67022f38a3c771894d2a8a468]', 'name=Birds', 'caption=x',
      '[Contacts2]', 'b8e4117cf1d6615b=Roy;;',
      '[encoding]', 'utf8=1',
      '[photoid]', '1=a.jpg',
      '[(null)]', 'star=yes',
    ))).toEqual({});
  });

  it('reads LF line endings and skips blank lines', () => {
    expect(parsePicasaIni(Buffer.from('[a.jpg]\n\nstar=yes\n'))).toEqual({ 'a.jpg': { star: true } });
  });

  it('decodes windows-1251 when the file is not valid UTF-8', () => {
    // "Захід" in windows-1251
    const caption = Buffer.from([0xc7, 0xe0, 0xf5, 0xb3, 0xe4]);
    const bytes = Buffer.concat([Buffer.from('[a.jpg]\r\ncaption='), caption, Buffer.from('\r\n')]);
    expect(parsePicasaIni(bytes)).toEqual({ 'a.jpg': { caption: 'Захід' } });
  });

  it('reads UTF-8 Cyrillic as is', () => {
    expect(parsePicasaIni(crlf('[Зйомка 1.bmp]', 'keywords=гори,схід сонця'))).toEqual({
      'Зйомка 1.bmp': { keywords: ['гори', 'схід сонця'] },
    });
  });

  it('treats an empty file as having no data', () => {
    expect(parsePicasaIni(Buffer.alloc(0))).toEqual({});
  });
});

describe('readPicasaIni', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_ini_test_'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports a folder without a Picasa file as missing', () => {
    fs.writeFileSync(path.join(dir, 'a.jpg'), '');
    expect(readPicasaIni(dir)).toEqual({ kind: 'missing' });
  });

  it('reads the file and hashes its raw bytes', () => {
    const bytes = crlf('[a.jpg]', 'star=yes');
    fs.writeFileSync(path.join(dir, 'Picasa.ini'), bytes);

    expect(readPicasaIni(dir)).toEqual({
      kind: 'ok',
      fileName: 'Picasa.ini',
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      sections: { 'a.jpg': { star: true } },
    });
  });

  it('reads an empty file as present with no sections', () => {
    fs.writeFileSync(path.join(dir, '.picasa.ini'), '');
    expect(readPicasaIni(dir)).toMatchObject({ kind: 'ok', fileName: '.picasa.ini', sections: {} });
  });
});
