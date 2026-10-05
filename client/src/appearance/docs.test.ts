import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLOR_TOKENS, FONT_TOKENS, SIZE_TOKENS } from './tokens.js';
import { THEMES, THEME_IDS } from './themes/index.js';
import en from '../i18n/locales/en.json';

const docPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/skins-and-themes.md');
const doc = fs.readFileSync(docPath, 'utf-8');

/** The rows of the table under a `###` heading, as cells without backticks. */
function table(heading: string): string[][] {
  const start = doc.indexOf(`\n### ${heading}\n`);
  if (start < 0) throw new Error(`No "### ${heading}" in the document`);
  const rest = doc.slice(start + heading.length + 6);
  const end = rest.search(/\n#{2,3} /);
  return (end < 0 ? rest : rest.slice(0, end)).split('\n')
    .filter((line) => line.startsWith('| `--pal-'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/`/g, '')));
}

const names = (rows: string[][]) => rows.map((row) => row[0].replace(/^--pal-/, '')).sort();

describe('docs/skins-and-themes.md', () => {
  it('lists exactly the color tokens', () => {
    expect(names(table('Colors'))).toEqual([...COLOR_TOKENS].sort());
  });

  it('lists exactly the size tokens', () => {
    expect(names(table('Sizes'))).toEqual([...SIZE_TOKENS].sort());
  });

  it('lists exactly the font tokens', () => {
    expect(names(table('Fonts'))).toEqual([...FONT_TOKENS].sort());
  });

  it('shows every theme\'s current colors, in a column named after the theme', () => {
    const header = doc.split('\n').find((line) => line.startsWith('| Token | ') && line.includes('Used for'))!
      .split('|').slice(1, -1).map((cell) => cell.trim());
    for (const id of THEME_IDS) {
      const column = header.indexOf(en.settings.themes[id].name);
      expect(column, `a "${en.settings.themes[id].name}" column`).toBeGreaterThan(0);
      for (const row of table('Colors')) {
        const token = row[0].replace(/^--pal-/, '') as typeof COLOR_TOKENS[number];
        expect(row[column], `${id} ${row[0]}`).toBe(THEMES[id].colors[token]);
      }
    }
  });
});
