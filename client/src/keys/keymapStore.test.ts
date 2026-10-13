import { describe, it, expect, afterEach, vi } from 'vitest';
import { defaultKeymap, effectiveKeymap, resolvedKeymap, useKeymapStore } from './keymapStore.js';

const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => {
  vi.unstubAllGlobals();
  useKeymapStore.setState({ stored: null, owner: null, loadFailed: false, filters: [] });
});

describe('default keymap', () => {
  it('is a copy of mac on Apple devices and of windows elsewhere', () => {
    const name = (preset: string) => preset.toUpperCase();
    expect(defaultKeymap(name, 'MacIntel')).toEqual({ name: 'MAC', basedOn: 'mac', bindings: {} });
    expect(defaultKeymap(name, 'Win32')).toEqual({ name: 'WINDOWS', basedOn: 'windows', bindings: {} });
  });
});

describe('keymap store', () => {
  it('uses what the server has', async () => {
    vi.stubGlobal('fetch', respond(200, {
      keymap: { format: 'paloma-keymap', version: 1, name: 'TV', basedOn: 'tvBox', sections: [{ id: 'viewer', actions: [{ id: 'viewer.next', keys: ['N'] }] }] },
    }));
    await useKeymapStore.getState().load('u1');
    expect(useKeymapStore.getState().stored).toEqual({ name: 'TV', basedOn: 'tvBox', bindings: { 'viewer.next': ['N'] } });
    expect(resolvedKeymap(useKeymapStore.getState()).get('viewer.close')).toEqual(['Escape', 'GoBack', 'BrowserBack']);
  });

  it('keeps the device default when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await useKeymapStore.getState().load('u1');
    const state = useKeymapStore.getState();
    expect(state.loadFailed).toBe(true);
    expect(state.stored).toBeNull();
    expect(resolvedKeymap(state).get('viewer.next')).toEqual(['ArrowRight']);
  });

  it('starts afresh for another user', async () => {
    useKeymapStore.setState({ owner: 'u1', stored: { name: 'A', basedOn: 'tvBox', bindings: {} } });
    vi.stubGlobal('fetch', respond(200, { keymap: null }));
    await useKeymapStore.getState().load('u2');
    expect(effectiveKeymap(useKeymapStore.getState()).bindings).toEqual({});
    expect(useKeymapStore.getState().stored).toBeNull();
  });

  it('goes back to the last saved keymap when saving fails', async () => {
    const saved = { name: 'Mine', basedOn: 'mac' as const, bindings: { 'viewer.next': ['N'] } };
    useKeymapStore.setState({ owner: 'u1', stored: saved });
    vi.stubGlobal('fetch', respond(400, { code: 'invalid_keymap', error: 'no', problems: [{ code: 'conflict' }] }));
    await expect(useKeymapStore.getState().save({ ...saved, bindings: { 'viewer.next': ['I'] } })).rejects.toThrow();
    expect(useKeymapStore.getState().stored).toEqual(saved);
  });

  it('lists the filters of active plugins', async () => {
    vi.stubGlobal('fetch', respond(200, [
      { id: 'vignette', status: 'active', filters: [{ name: 'vignette', label: 'Vignette' }] },
      { id: 'grain', status: 'off', filters: [{ name: 'grain', label: 'Grain' }] },
    ]));
    await useKeymapStore.getState().loadFilters('en');
    expect(useKeymapStore.getState().filters).toEqual([{ id: 'edit.vignette.vignette', label: 'Vignette' }]);
  });
});
