import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiObject, PhotoAiResult } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { NavBar } from '../components/viewer/NavBar.js';
import { barLayout } from '../components/viewer/barLayout.js';
import { parseUiSettings } from '../settings/uiSettings.js';
import { ObjectFramesView, objectLabel, objectsOf } from './ObjectFrames.js';

const html = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
const dog: AiObject = { label: 'dog', rect: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 }, confidence: 0.92 };
const ball: AiObject = { label: 'ball', rect: { left: 0.7, top: 0.7, right: 0.9, bottom: 0.9 }, confidence: null };

beforeAll(async () => {
  await initI18n('en');
});

describe('object frames', () => {
  it('labels each frame with its label and confidence', () => {
    const markup = html(<ObjectFramesView objects={[dog, ball]} steps={[]} />);
    expect(markup).toContain('>dog 92%<');
    expect(markup).toContain('>ball<');
    expect(markup).toContain('left:10.000%;top:20.000%;width:20.000%;height:20.000%');
  });

  it('follows a crop and leaves out an object outside it', () => {
    const markup = html(<ObjectFramesView objects={[dog, ball]} steps={[{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 0.5 } }]} />);
    expect(markup).toContain('left:20.000%;top:40.000%;width:40.000%;height:40.000%');
    expect(markup).not.toContain('ball');
  });

  it('turns with a rotate step', () => {
    const markup = html(<ObjectFramesView objects={[dog]} steps={[{ filter: 'rotate', angle: 90 }]} />);
    expect(markup).toContain('left:60.000%;top:10.000%;width:20.000%;height:20.000%');
  });

  it('draws nothing and says so when the photo is straightened', () => {
    const markup = html(<ObjectFramesView objects={[dog]} steps={[{ filter: 'straighten', angle: 3 }]} />);
    expect(markup).toContain(i18n.t('viewer.objectsUnavailable'));
    expect(markup).not.toContain('dog');
  });

  it('takes the objects of every objects result', () => {
    const results = [
      { taskId: 'tags', output: 'tags', tags: [] },
      { taskId: 'objects', output: 'objects', objects: [dog] },
      { taskId: 't-1', output: 'objects', objects: [ball] },
    ] as unknown as PhotoAiResult[];
    expect(objectsOf(results)).toEqual([dog, ball]);
    expect(objectLabel(dog, 'uk')).toBe('dog 92%');
  });
});

describe('Objects toggle', () => {
  const layout = barLayout({ navBar: 'top', editBar: 'left' });
  const bar = (props: Partial<React.ComponentProps<typeof NavBar>>) => html(
    <NavBar placement={layout.navBar} style={{}} filename="a.jpg" index={0} total={1} scale={1} canPrev={false} canNext={false} zoomLocked={false} saving={false}
      onClose={() => {}} onPrev={() => {}} onNext={() => {}} onZoomIn={() => {}} onZoomOut={() => {}} onFit={() => {}}
        zoomLevel="fit" canZoomTo={() => true} onZoomTo={() => {}} {...props} />,
  );

  it('is in the navigation bar when the level offers it, pressed when frames are on', () => {
    expect(bar({})).not.toContain(i18n.t('viewer.objects'));
    expect(bar({ onObjects: () => {}, objectsOn: true })).toMatch(new RegExp(`aria-label="${i18n.t('viewer.objects')}"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="${i18n.t('viewer.objects')}"`));
  });

  it('is remembered in this browser', () => {
    expect(parseUiSettings(JSON.stringify({ showObjects: true })).showObjects).toBe(true);
    expect(parseUiSettings(null).showObjects).toBe(false);
  });
});
