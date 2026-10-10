import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { i18n, initI18n } from '../../i18n/index.js';
import { TagChips } from './TagChips.js';

beforeAll(async () => {
  await initI18n('en');
});

describe('TagChips', () => {
  it('shows each tag as a chip with a remove button named after it, then the field', () => {
    const markup = renderToStaticMarkup(<TagChips tags={['old', 'river']} onChange={() => {}} suggestions={[]} />);
    for (const tag of ['old', 'river']) {
      expect(markup).toContain(`aria-label="${i18n.t('tags.removeChip', { name: tag }).replace(/"/g, '&quot;')}"`);
    }
    expect(markup).toContain(`aria-label="${i18n.t('tags.addChip')}"`);
    expect(markup.indexOf('river')).toBeLessThan(markup.indexOf('<input'));
  });

  it('links each chip to its tag only when asked, keeping its remove button', () => {
    const plain = renderToStaticMarkup(<TagChips tags={['river']} onChange={() => {}} suggestions={[]} />);
    expect(plain).not.toContain('entry-link');
    const linked = renderToStaticMarkup(<TagChips tags={['river']} onChange={() => {}} suggestions={[]} linkTags />);
    expect(linked).toMatch(/<button type="button" class="entry-link[^"]*tag-chip-link[^"]*">.*lucide-tag.*>river<\/span><\/button>/);
    expect(linked).toContain(`aria-label="${i18n.t('tags.removeChip', { name: 'river' })}"`);
  });
});
