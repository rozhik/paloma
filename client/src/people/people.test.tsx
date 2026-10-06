import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Person, Photo } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { DEFAULT_UI_SETTINGS, useUiSettings, type UiSettings } from '../settings/uiSettings.js';
import { ApiRequestError, describeError } from '../api/http.js';
import { PersonCards } from '../components/PeopleView.js';
import { PersonEditorForm } from './PersonEditor.js';
import { PersonHeader } from './PersonHeader.js';
import { EMPTY_FORM, formOf } from './personForm.js';

/** Sets UI settings for a server render: zustand renders its initial state there, so that is changed too. */
function setSettings(patch: Partial<UiSettings>) {
  useUiSettings.setState(patch);
  Object.assign(useUiSettings.getInitialState(), patch);
}

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => setSettings({ level: DEFAULT_UI_SETTINGS.level }));

const roy: Person = {
  id: 'b8e4117cf1d6615b', name: 'Roy Avery', alias: 'Bear', comment: 'Uncle', links: ['https://example.com/roy'], birth: '1961',
  gender: 'male', avatarVersion: 'abc', avatar: null, photoCount: 3,
};
const unknown: Person = { ...roy, id: '0123456789abcdef', name: null, alias: null, comment: null, links: [], birth: null, gender: null, avatarVersion: null };
const photos = [{ id: 1 }, { id: 2 }] as Photo[];

const editor = (person: Person | null, form = formOf(person)) =>
  renderToStaticMarkup(<PersonEditorForm person={person} form={form} onChange={() => {}} />);

describe('person editor', () => {
  it('offers only the name for an unknown person', () => {
    const markup = editor(unknown);
    expect(markup).toContain(i18n.t('people.name'));
    for (const key of ['people.alias', 'people.links', 'people.gender', 'people.birth', 'people.avatar'] as const) {
      expect(markup, key).not.toContain(i18n.t(key));
    }
  });

  it('offers the whole profile once the unknown person gets a name', () => {
    const markup = editor(unknown, { ...formOf(unknown), name: 'Ann' });
    for (const key of ['people.alias', 'people.comment', 'people.links', 'people.gender', 'people.birthYear', 'people.birthDate'] as const) {
      expect(markup, key).toContain(i18n.t(key));
    }
  });

  it('shows a known person\'s profile with the avatar choice', () => {
    const markup = editor(roy);
    for (const text of ['value="Roy Avery"', 'value="Bear"', 'Uncle', 'value="https://example.com/roy"', 'value="1961"', i18n.t('people.avatar')]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toMatch(/<option value="male" selected="">/);
  });

  it('asks only for the name of a new person until one is typed, and says it may stay empty', () => {
    expect(editor(null, EMPTY_FORM)).not.toContain(i18n.t('people.alias'));
    expect(editor(null, EMPTY_FORM)).toContain(i18n.t('people.nameOptional'));
    expect(editor(null, { ...EMPTY_FORM, name: 'Ann' })).toContain(i18n.t('people.alias'));
  });

  it('explains a rejected value with the field it is about', () => {
    const message = describeError(new ApiRequestError(400, { code: 'invalid_field', error: 'x', params: { field: 'links' } }), i18n.t);
    expect(message).toContain('links');
  });
});

describe('person header', () => {
  const header = (level: UiSettings['level']) => {
    setSettings({ level });
    return renderToStaticMarkup(<PersonHeader person={roy} photos={photos} onSaved={() => {}} />);
  };

  it('shows the avatar, name, alias and count with editing and Similar faces at Normal', () => {
    const markup = header('normal');
    for (const text of ['/api/people/b8e4117cf1d6615b/avatar?v=abc', 'Roy Avery', 'Bear', '>2<', i18n.t('people.edit'), i18n.t('people.modeSimilar'), i18n.t('faces.detect')]) {
      expect(markup, text).toContain(text);
    }
  });

  it('offers neither editing, Similar faces nor face detection at Easy', () => {
    const markup = header('easy');
    expect(markup).toContain('Roy Avery');
    for (const key of ['people.edit', 'people.modeSimilar', 'faces.detect'] as const) expect(markup, key).not.toContain(i18n.t(key));
  });
});

describe('people cards', () => {
  it('shows known and unknown people with their counts', () => {
    const markup = renderToStaticMarkup(
      <PersonCards people={[roy, { ...unknown, photoCount: 1 }]} onOpen={() => {}} onEdit={() => {}} />,
    );
    expect(markup).toContain('Roy Avery');
    expect(markup).toContain(i18n.t('people.unknown'));
    expect(markup).toContain(i18n.t('common.photos', { count: 3 }));
    expect(markup).toContain(i18n.t('common.photos', { count: 1 }));
    expect(markup).toContain(`aria-label="${i18n.t('people.open', { name: 'Roy Avery' })}"`);
  });

  it('says when there are no people', () => {
    expect(renderToStaticMarkup(<PersonCards people={[]} onOpen={() => {}} onEdit={() => {}} />)).toContain(i18n.t('people.empty'));
  });
});
