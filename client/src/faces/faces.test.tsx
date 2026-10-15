import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PhotoPeople, Photo } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { DEFAULT_UI_SETTINGS, useUiSettings, type UiSettings } from '../settings/uiSettings.js';
import { NavBar } from '../components/viewer/NavBar.js';
import { barLayout } from '../components/viewer/barLayout.js';
import { FaceFramesView } from '../components/viewer/FaceFrames.js';
import { FaceDetectionButton } from './FaceDetectionButton.js';
import { FaceCropGrid, SimilarFacesContent, toggled } from './SimilarFaces.js';
import { UnrecognizedHeader } from './UnrecognizedFaces.js';
import { useFaceDetection, type DetectionDeps } from './useFaceDetection.js';

function setSettings(patch: Partial<UiSettings>) {
  useUiSettings.setState(patch);
  Object.assign(useUiSettings.getInitialState(), patch);
}

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => {
  setSettings({ level: DEFAULT_UI_SETTINGS.level });
  useFaceDetection.setState({ nothingToDo: false, error: null });
});

const html = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

describe('face detection', () => {
  const deps = (task: unknown): DetectionDeps & { calls: number[][] } => {
    const calls: number[][] = [];
    return { calls, start: async (photoIds: number[]) => { calls.push(photoIds); return { task } as never; }, added: async () => {} };
  };

  it('adds a detection task on the server for the photos of the grid', async () => {
    const d = deps({ id: 't1' });
    await useFaceDetection.getState().start([{ id: 1 }, { id: 2 }], d);
    expect(d.calls).toEqual([[1, 2]]);
    expect(useFaceDetection.getState().nothingToDo).toBe(false);
  });

  it('says so when every photo was already detected', async () => {
    await useFaceDetection.getState().start([{ id: 1 }], deps(null));
    expect(useFaceDetection.getState().nothingToDo).toBe(true);
  });

  it('keeps the refusal of the server', async () => {
    const refusing: DetectionDeps = { start: async () => { throw new Error('nope'); }, added: async () => {} };
    await useFaceDetection.getState().start([{ id: 1 }], refusing);
    expect(useFaceDetection.getState().error).toEqual(new Error('nope'));
  });

  it('offers detection at Normal for a grid with photos, and not at Easy', () => {
    const photos = [{ id: 1 }] as Photo[];
    expect(html(<FaceDetectionButton photos={photos} />)).toContain(i18n.t('faces.detect'));
    expect(html(<FaceDetectionButton photos={[]} />)).toBe('');
    setSettings({ level: 'easy' });
    expect(html(<FaceDetectionButton photos={photos} />)).toBe('');
    setSettings({ level: 'normal' });
  });
});

describe('similar faces', () => {
  const props = {
    name: 'Roy Avery', busy: false, onToggle: () => {}, onSelectAll: () => {}, onAssign: () => {}, onDismiss: () => {}, onOpen: () => {},
  };
  const faces = [
    { id: 4, photoId: 7, rect: { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 }, distance: 0.2 },
    { id: 9, photoId: 8, rect: { left: 0.5, top: 0.1, right: 0.6, bottom: 0.2 }, distance: 0.4 },
  ];

  it('asks to run detection when the person has no detected face', () => {
    const markup = html(<SimilarFacesContent {...props} data={{ noReference: true, faces: [] }} selected={new Set()} />);
    expect(markup).toContain(i18n.t('faces.noReferenceTitle', { name: 'Roy Avery' }));
    expect(markup).toContain(i18n.t('faces.noReferenceHint', { name: 'Roy Avery' }));
  });

  it('shows the crops in order with the selection and the actions', () => {
    const markup = html(<SimilarFacesContent {...props} data={{ noReference: false, faces }} selected={new Set([9])} />);
    expect(markup.indexOf('/api/photos/7/face?')).toBeLessThan(markup.indexOf('/api/photos/8/face?'));
    expect(markup).toMatch(new RegExp(`aria-pressed="true" aria-label="${i18n.t('faces.face', { index: 2 })}"`));
    expect(markup).toMatch(new RegExp(`aria-pressed="false" aria-label="${i18n.t('faces.face', { index: 1 })}"`));
    expect(markup).toContain(i18n.t('faces.assignTo', { name: 'Roy Avery' }));
    expect(markup).toContain(i18n.t('faces.notPerson', { name: 'Roy Avery' }));
    expect(markup).toContain(i18n.t('faces.selected', { count: 1 }));
  });

  it('cannot assign or dismiss with nothing selected', () => {
    const markup = html(<SimilarFacesContent {...props} data={{ noReference: false, faces }} selected={new Set()} />);
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('unrecognized faces', () => {
  const faces = [{ id: 4, photoId: 7, rect: { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 } }];

  it('shows the crops with the given actions', () => {
    const markup = html(
      <FaceCropGrid faces={faces} selected={new Set([4])} onToggle={() => {}} onSelectAll={() => {}} onOpen={() => {}}>
        <button type="button">{i18n.t('info.whoIsThisTitle')}</button>
      </FaceCropGrid>,
    );
    expect(markup).toContain('/api/photos/7/face?');
    expect(markup).toContain(i18n.t('info.whoIsThisTitle'));
    expect(markup).toContain(i18n.t('faces.selectNone'));
  });

  it('has a title with the number of faces', () => {
    const markup = html(<UnrecognizedHeader total={12} />);
    expect(markup).toContain(i18n.t('faces.unrecognizedTitle'));
    expect(markup).toContain('>12<');
  });

  it('toggles faces in a selection', () => {
    expect([...toggled(new Set([1, 2]), 2)]).toEqual([1]);
    expect([...toggled(new Set([1]), 3)]).toEqual([1, 3]);
  });
});

describe('face frames', () => {
  const people: PhotoPeople = {
    people: [
      { id: 'b8e4117cf1d6615b', name: 'Roy Avery', avatarVersion: null, rects: [{ left: 0.1, top: 0.2, right: 0.3, bottom: 0.5 }] },
      { id: '0123456789abcdef', name: 'Ann', avatarVersion: null, rects: [] },
    ],
    faces: [{ id: 5, photoId: 7, rect: { left: 0.6, top: 0.2, right: 0.8, bottom: 0.5 } }],
  };

  it('draws marks with names and unassigned faces dashed', () => {
    const markup = html(<FaceFramesView people={people} steps={[]} onAssign={() => {}} />);
    expect(markup).toContain('left:10.000%;top:20.000%;width:20.000%;height:30.000%');
    expect(markup).toContain('>Roy Avery</span>');
    expect(markup).not.toContain('Ann');
    expect(markup).toMatch(/<button[^>]*class="face-frame unassigned"[^>]*aria-label="Who is this\? \(face 1\)"/);
  });

  it('follows the photo\'s crop', () => {
    const markup = html(<FaceFramesView people={people} steps={[{ filter: 'crop64', rect: { left: 0.5, top: 0, right: 1, bottom: 1 } }]} />);
    expect(markup).not.toContain('Roy Avery');
    expect(markup).toContain('left:20.000%');
  });

  it('only draws unassigned faces when assigning is not offered', () => {
    const markup = html(<FaceFramesView people={people} steps={[]} />);
    expect(markup).not.toContain('<button');
    expect(markup).toContain('class="face-frame unassigned"');
  });

  it('says frames cannot be shown on a straightened photo', () => {
    const markup = html(<FaceFramesView people={people} steps={[{ filter: 'straighten', angle: 2 }]} />);
    expect(markup).toContain(i18n.t('viewer.facesUnavailable'));
    expect(markup).not.toMatch(/class="face-frame[ "]/);
  });

  it('has a Faces toggle in the navigation bar, pressed while frames are on, and none when the level hides it', () => {
    const nav = (onFaces?: () => void, facesOn = false) => html(
      <NavBar
        placement={barLayout(DEFAULT_UI_SETTINGS).navBar} style={{}} filename="a.jpg" index={0} total={1} scale={1}
        canPrev={false} canNext={false} zoomLocked={false} saving={false}
        onClose={() => {}} onPrev={() => {}} onNext={() => {}} onZoomIn={() => {}} onZoomOut={() => {}} onFit={() => {}}
        zoomLevel="fit" canZoomTo={() => true} onZoomTo={() => {}}
        onFaces={onFaces} facesOn={facesOn}
      />,
    );
    expect(nav(() => {}, true)).toMatch(new RegExp(`aria-label="${i18n.t('viewer.faces')}"[^>]*aria-pressed="true"`));
    expect(nav(undefined)).not.toContain(`aria-label="${i18n.t('viewer.faces')}"`);
  });
});
