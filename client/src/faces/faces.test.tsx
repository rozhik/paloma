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
import { ProgressRing, resultMessage } from './FaceDetectionProgress.js';
import { FaceCropGrid, SimilarFacesContent, toggled } from './SimilarFaces.js';
import { UnrecognizedHeader } from './UnrecognizedFaces.js';
import { useFaceDetection } from './detectionRunner.js';

function setSettings(patch: Partial<UiSettings>) {
  useUiSettings.setState(patch);
  Object.assign(useUiSettings.getInitialState(), patch);
}

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => {
  setSettings({ level: DEFAULT_UI_SETTINGS.level });
  useFaceDetection.setState({ progress: null, result: null });
  Object.assign(useFaceDetection.getInitialState(), { progress: null, result: null });
});

const html = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

describe('face detection progress', () => {
  it('fills the ring to the share done and names the cancel action', () => {
    const markup = html(<ProgressRing progress={{ done: 12, total: 30, cancelling: false }} onCancel={() => {}} />);
    expect(markup).toContain(`aria-label="${i18n.t('faces.cancel', { done: 12, total: 30 })}"`);
    expect(markup).toContain('12 / 30');
    // 60% of the circle is still empty
    const circumference = 2 * Math.PI * 26;
    expect(markup).toContain(`stroke-dashoffset="${circumference * 0.6}"`);
  });

  it('is disabled while stopping', () => {
    expect(html(<ProgressRing progress={{ done: 3, total: 30, cancelling: true }} onCancel={() => {}} />)).toContain('disabled=""');
  });

  it('says how many faces were found on how many photos, and what went wrong', () => {
    const t = i18n.t.bind(i18n) as never;
    const base = { faces: 17, photos: 11, failed: 0, total: 30, cancelled: false, error: null };
    expect(resultMessage(base, t)).toBe(i18n.t('faces.found', { faces: 17, photos: 11 }));
    expect(resultMessage({ ...base, cancelled: true, failed: 2 }, t))
      .toBe(`${i18n.t('faces.stopped')} ${i18n.t('faces.found', { faces: 17, photos: 11 })} ${i18n.t('faces.failed', { failed: 2 })}`);
    expect(resultMessage({ ...base, total: 0 }, t)).toBe(i18n.t('faces.nothingToDo'));
    expect(resultMessage({ ...base, error: new Error('no WebGL') }, t)).toContain('no WebGL');
  });

  it('offers detection at Normal for a grid with photos, and not at Easy or while running', () => {
    const photos = [{ id: 1 }] as Photo[];
    expect(html(<FaceDetectionButton photos={photos} />)).toContain(i18n.t('faces.detect'));
    expect(html(<FaceDetectionButton photos={[]} />)).toBe('');
    setSettings({ level: 'easy' });
    expect(html(<FaceDetectionButton photos={photos} />)).toBe('');
    setSettings({ level: 'normal' });
    Object.assign(useFaceDetection.getInitialState(), { progress: { done: 0, total: 1, cancelling: false } });
    expect(html(<FaceDetectionButton photos={photos} />)).toBe('');
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
        onFaces={onFaces} facesOn={facesOn}
      />,
    );
    expect(nav(() => {}, true)).toMatch(new RegExp(`aria-label="${i18n.t('viewer.faces')}"[^>]*aria-pressed="true"`));
    expect(nav(undefined)).not.toContain(`aria-label="${i18n.t('viewer.faces')}"`);
  });
});
