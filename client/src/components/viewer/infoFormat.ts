/** Formatting of the Info panel's values in the active language. */

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** A file size with a unit in base 1024 (B, KB, MB, GB), in the language's number format: `3.4 MB`. */
export function fileSizeText(bytes: number, language: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Intl's own byte units are SI-styled ("kB"); these are the binary ones people know from file managers
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)}\u00a0${UNITS[unit]}`;
}

/** Latitude and longitude with 6 decimals in the language's number format: `48.160833, 24.500278`. */
export function coordinatesText(latitude: number, longitude: number, language: string): string {
  const format = new Intl.NumberFormat(language, { minimumFractionDigits: 6, maximumFractionDigits: 6, useGrouping: false });
  // Where the decimal mark is a comma, a semicolon keeps the two numbers apart
  const separator = format.format(0.5).includes(',') ? '; ' : ', ';
  return `${format.format(latitude)}${separator}${format.format(longitude)}`;
}

/** The sidecar entry as stored, with 2-space indentation. */
export const entryJson = (json: Record<string, unknown> | undefined): string => JSON.stringify(json ?? {}, null, 2);
