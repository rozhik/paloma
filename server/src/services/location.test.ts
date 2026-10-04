import { describe, it, expect } from 'vitest';
import { cellCentre, effectiveLocation, geoCell, isGeotag, roundGeotag } from './location.js';

const EXIF = { latitude: 48.160833, longitude: 24.500278 };
const NO_EXIF = { latitude: null, longitude: null };

describe('effectiveLocation', () => {
  it('uses the camera location without a geotag', () => {
    expect(effectiveLocation(undefined, EXIF)).toEqual({ ...EXIF, locationSource: 'exif', geoCell: '4816:2450' });
    expect(effectiveLocation(undefined, NO_EXIF)).toEqual({ ...NO_EXIF, locationSource: null, geoCell: null });
  });

  it('lets a geotag override the camera', () => {
    expect(effectiveLocation({ lat: 50.45, lon: 30.5234 }, EXIF))
      .toEqual({ latitude: 50.45, longitude: 30.5234, locationSource: 'user', geoCell: '5045:3052' });
  });

  it('removes the location for a null geotag, even with EXIF GPS', () => {
    expect(effectiveLocation(null, EXIF)).toEqual({ ...NO_EXIF, locationSource: null, geoCell: null });
  });
});

describe('geo helpers', () => {
  it('validates geotags', () => {
    expect(isGeotag({ lat: -90, lon: 180 })).toBe(true);
    expect(isGeotag({ lat: 90.1, lon: 0 })).toBe(false);
    expect(isGeotag({ lat: Number.NaN, lon: 0 })).toBe(false);
    expect(isGeotag(null)).toBe(false);
  });

  it('rounds to 6 decimals without negative zero', () => {
    expect(roundGeotag({ lat: 48.1608334999, lon: -0.0000001 })).toEqual({ lat: 48.160833, lon: 0 });
    expect(Object.is(roundGeotag({ lat: -0.0000001, lon: 0 }).lat, 0)).toBe(true);
  });

  it('puts nearby points in one 0.01° cell and gives its centre', () => {
    expect(geoCell(48.4512, 24.5534)).toBe(geoCell(48.4498, 24.5466));
    expect(geoCell(-33.856, -74.006)).toBe('-3386:-7401');
    expect(cellCentre('-3386:-7401')).toEqual({ lat: -33.86, lon: -74.01 });
  });
});
