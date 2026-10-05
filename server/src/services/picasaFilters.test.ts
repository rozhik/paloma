import { describe, it, expect } from 'vitest';
import { parseFilters, parseRect64 } from './picasaFilters.js';

describe('parseRect64', () => {
  it('splits the hex into four 16-bit words over 65535', () => {
    expect(parseRect64('33101d68ffffffff')).toEqual({ left: 0.199466, top: 0.11487, right: 1, bottom: 1 });
  });

  it('pads a value whose leading zeros were not written', () => {
    expect(parseRect64('6911ae3ce91ecbd')).toEqual(parseRect64('06911ae3ce91ecbd'));
    expect(parseRect64('6911ae3ce91ecbd')!.left).toBe(round6(0x0691 / 65535));
  });

  it('rejects anything that is not 1 to 16 hex digits', () => {
    expect(parseRect64('xyz')).toBeUndefined();
    expect(parseRect64('')).toBeUndefined();
    expect(parseRect64('1234567890abcdef0')).toBeUndefined();
  });
});

function round6(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

describe('parseFilters', () => {
  it('turns a Picasa chain into steps in order', () => {
    expect(parseFilters('crop64=1,33101d68ffffffff;autolight=1;bw=1;')).toEqual([
      { filter: 'crop64', rect: { left: 0.199466, top: 0.11487, right: 1, bottom: 1 } },
      { filter: 'autolight' },
      { filter: 'bw' },
    ]);
  });

  it('keeps repeats and order', () => {
    expect(parseFilters('unsharp2=1,0.600000;warm=1;warm=1;sepia=1;').map((s) => s.filter))
      .toEqual(['unsharp2', 'warm', 'warm', 'sepia']);
  });

  it('names the parameters of filters with known meaning', () => {
    expect(parseFilters('tilt=1,-0.250000,0.000000;fill=1,0.300000;finetune2=1,0.000000,0.000000,0.140351,00000000,-0.500000;Vignette=1,0.500000,0.300000,0.000000,00ff8800;')).toEqual([
      { filter: 'tilt', angle: -0.25, scale: 0 },
      { filter: 'fill', amount: 0.3 },
      { filter: 'finetune2', fillLight: 0, highlights: 0, shadows: 0.140351, neutral: null, temperature: -0.5 },
      { filter: 'Vignette', radius: 0.5, strength: 0.3, fade: 0, color: '#ff8800' },
    ]);
  });

  it('keeps the raw parameters of filters with unknown meaning', () => {
    expect(parseFilters('PicnikGrain=1,0.350000,0;redeye=1;')).toEqual([
      { filter: 'PicnikGrain', params: ['0.350000', '0'] },
      { filter: 'redeye' },
    ]);
  });

  it('marks a step whose flag is 0 as not enabled', () => {
    expect(parseFilters('sepia=0;')).toEqual([{ filter: 'sepia', enabled: false }]);
  });

  it('drops items that cannot be read and keeps the rest', () => {
    expect(parseFilters('bw;crop64=1,nothex;fill=1,lots;tilt=1,0.1;sepia=2;bw=1,extra;=1;autolight=1;')).toEqual([
      { filter: 'autolight' },
    ]);
  });

  it('gives no steps without a value', () => {
    expect(parseFilters(undefined)).toEqual([]);
    expect(parseFilters('')).toEqual([]);
    expect(parseFilters(';;')).toEqual([]);
  });
});
