import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, Keyboard, Plus, RotateCcw, Upload, X } from 'lucide-react';
import type { ActionId, KeyChord, KeySectionId, StoredKeymap } from '../../../shared/types.js';
import {
  BUNDLED_FILTER_ACTIONS, KEY_ACTIONS, KEY_SECTIONS, KEYMAP_MAX_BYTES, chordOf, resolveKeymap, toKeymapFile,
} from '../../../shared/keymaps.js';
import { i18n } from '../i18n/index.js';
import { useAllows } from '../levels/controls.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { effectiveKeymap, useKeymapStore } from './keymapStore.js';
import {
  addKey, canAddKey, displayChord, downloadName, isChanged, isReserved, matchesFilter, readUpload, removeKey, rename, resetAction, resetAll,
  type EditResult,
} from './keymapEdit.js';
import { actionName, isMac, keymapError, presetName, problemText, sectionName } from './names.js';

/** A change that needs a key taken from other actions first: adding a key, or resetting an action. */
interface Conflict {
  id: ActionId;
  key: KeyChord;
  actions: ActionId[];
  /** Does the change, taking the keys from the other actions */
  move: () => EditResult;
}

/** The actions listed in a section: the catalog's, and in Edit also the filters of installed plugins. */
function sectionActions(section: KeySectionId, filterIds: readonly ActionId[]): ActionId[] {
  const builtIn = KEY_ACTIONS.filter((action) => action.section === section).map((action) => action.id);
  return section === 'edit' ? [...builtIn, ...filterIds.filter((id) => !BUNDLED_FILTER_ACTIONS.includes(id))] : builtIn;
}

/**
 * The Keybindings page: the user's keymap by section, with every action and its keys. Keys are added by pressing
 * them, removed, and reset to the preset; each change is saved at once. From Professional, the keymap can be
 * downloaded and uploaded as JSON.
 */
export const KeybindingsView: React.FC = () => {
  const { t } = useTranslation();
  const stored = useKeymapStore((state) => state.stored);
  const filters = useKeymapStore((state) => state.filters);
  const save = useKeymapStore((state) => state.save);
  const setCapturing = useKeymapStore((state) => state.setCapturing);
  const setCurrentView = usePalomaStore((state) => state.setCurrentView);
  const canTransfer = useAllows('keybindings.importExport');
  const keymap = effectiveKeymap({ stored });
  const filterIds = useMemo(() => filters.map((filter) => filter.id), [filters]);
  const resolved = useMemo(() => resolveKeymap(keymap, filterIds), [keymap, filterIds]);
  const mac = isMac();

  const [filter, setFilter] = useState('');
  const [name, setName] = useState(keymap.name);
  const [capture, setCapture] = useState<ActionId | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [upload, setUpload] = useState<{ keymap: StoredKeymap; dropped: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => setName(keymap.name), [keymap.name]);

  const nameOf = (id: ActionId) => actionName(t, id, filters);
  const show = (key: KeyChord) => displayChord(key, mac);

  const commit = (next: StoredKeymap, dropped: string[] = []) => {
    setError(null);
    save(next)
      .then((result) => {
        const left = [...dropped, ...result.dropped];
        if (left.length > 0) setNotice(t('keys.dropped', { ids: left.join(', ') }));
      })
      .catch((err) => setError(keymapError(t, err, filters)));
  };

  /** Saves the change, or asks to take its keys from the actions that have them. */
  const attempt = (id: ActionId, result: EditResult, move: () => EditResult) => {
    if ('keymap' in result) {
      setConflict(null);
      commit(result.keymap);
    } else {
      const [first] = result.conflicts;
      setConflict({ id, key: first.key, actions: [...new Set(result.conflicts.flatMap((c) => c.actions))], move });
    }
  };

  const recorded = (id: ActionId, key: KeyChord) => {
    setCapture(null);
    setNotice(null);
    setWarning(isReserved(key) ? t('keys.reserved', { key: show(key) }) : null);
    attempt(id, addKey(keymap, id, key, { extra: filterIds }), () => addKey(keymap, id, key, { move: true, extra: filterIds }));
  };

  // While a key is being added, the next key press is the key: no action runs, and Esc or Tab is recorded too
  useEffect(() => {
    if (capture === null) return;
    setCapturing(true);
    const onKey = (event: KeyboardEvent) => {
      const key = chordOf(event);
      if (key === null) return;
      event.preventDefault();
      event.stopPropagation();
      recorded(capture, key);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      setCapturing(false);
    };
  }, [capture, keymap]);

  const saveName = () => {
    if (name.trim() === keymap.name) return;
    const renamed = rename(keymap, name);
    if (renamed) commit(renamed);
    else setError(problemText(t, { code: 'name' }));
  };

  const download = () => {
    const english = i18n.getFixedT('en');
    const file = toKeymapFile(keymap, {
      resolved,
      actionName: (id) => actionName(english, id, filters),
      sectionName: (id) => sectionName(english, id),
    });
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName(keymap.name);
    link.click();
    URL.revokeObjectURL(url);
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    const result = readUpload(file.size > KEYMAP_MAX_BYTES ? '' : await file.text(), file.size);
    if (result.ok) setUpload({ keymap: result.keymap, dropped: result.dropped });
    else setError(result.problems.map((problem) => problemText(t, problem, filters)).join(' '));
    if (fileInput.current) fileInput.current.value = '';
  };

  const sections = KEY_SECTIONS.map((section) => ({
    section,
    actions: sectionActions(section, filterIds).filter((id) => matchesFilter(filter, nameOf(id), resolved.get(id) ?? [], mac)),
  })).filter(({ actions }) => actions.length > 0);

  return (
    <main className="flex-grow-1 pal-page overflow-auto p-4">
      <div className="mx-auto" style={{ maxWidth: '900px' }}>
        <button type="button" className="btn btn-outline-secondary btn-lg-custom mb-3" onClick={() => setCurrentView('settings')}>
          <ArrowLeft size={20} className="flip-rtl" aria-hidden="true" />
          <span>{t('keys.back')}</span>
        </button>
        <h2 className="fw-bold d-flex align-items-center gap-2 mb-2">
          <Keyboard size={30} aria-hidden="true" />
          <span>{t('keys.title')}</span>
        </h2>
        <p className="fs-5 text-secondary">{t('keys.intro')}</p>
        <p className="text-secondary">{t('keys.basedOn', { preset: presetName(t, keymap.basedOn) })}</p>

        <div className="d-flex flex-wrap align-items-end gap-3 mb-3">
          <div className="flex-grow-1">
            <label htmlFor="keymap-name" className="form-label fs-5 fw-semibold">{t('keys.name')}</label>
            <input
              id="keymap-name"
              className="form-control form-control-lg"
              value={name}
              maxLength={64}
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => event.key === 'Enter' && saveName()}
            />
          </div>
          {canTransfer && (
            <>
              <button type="button" className="btn btn-outline-primary btn-lg-custom" onClick={download}>
                <Download size={20} aria-hidden="true" />
                <span>{t('keys.download')}</span>
              </button>
              <button type="button" className="btn btn-outline-primary btn-lg-custom" onClick={() => fileInput.current?.click()}>
                <Upload size={20} aria-hidden="true" />
                <span>{t('keys.upload')}</span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="d-none"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />
            </>
          )}
          <button type="button" className="btn btn-outline-danger btn-lg-custom" onClick={() => setConfirmResetAll(true)}>
            <RotateCcw size={20} aria-hidden="true" />
            <span>{t('keys.resetAll')}</span>
          </button>
        </div>

        <input
          type="search"
          className="form-control form-control-lg mb-3"
          placeholder={t('keys.filter')}
          aria-label={t('keys.filter')}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />

        {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert variant="info" dismissible onClose={() => setNotice(null)}>{notice}</Alert>}
        {warning && <Alert variant="warning" dismissible onClose={() => setWarning(null)}>{warning}</Alert>}

        {sections.length === 0 && <p className="fs-5 text-secondary">{t('keys.noMatches')}</p>}
        {sections.map(({ section, actions }) => (
          <section key={section} className="mb-4" aria-labelledby={`keys-${section}`}>
            <h3 id={`keys-${section}`} className="fs-4 fw-bold mb-2">{sectionName(t, section)}</h3>
            <ul className="list-group">
              {actions.map((id) => {
                const keys = resolved.get(id) ?? [];
                const label = nameOf(id);
                return (
                  <li key={id} className="list-group-item">
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <span className="fs-5 flex-grow-1">{label}</span>
                      {keys.length === 0 && <span className="text-secondary">{t('keys.noKey')}</span>}
                      {keys.map((key) => (
                        <span key={key} className="badge text-bg-secondary fs-6 d-inline-flex align-items-center gap-1">
                          <kbd className="bg-transparent p-0">{show(key)}</kbd>
                          <button
                            type="button"
                            className="btn btn-sm p-0 border-0 text-reset"
                            aria-label={t('keys.removeKey', { key: show(key) })}
                            title={t('keys.removeKey', { key: show(key) })}
                            onClick={() => commit(removeKey(keymap, id, key, filterIds))}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                      {capture === id ? (
                        <>
                          <span className="fw-semibold" role="status">{t('keys.pressKey')}</span>
                          <button type="button" className="btn btn-outline-secondary" onClick={() => setCapture(null)}>{t('keys.cancel')}</button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          disabled={!canAddKey(keymap, id, filterIds)}
                          aria-label={t('keys.addKeyTo', { action: label })}
                          onClick={() => {
                            setConflict(null);
                            setCapture(id);
                          }}
                        >
                          <Plus size={16} aria-hidden="true" /> {t('keys.addKey')}
                        </button>
                      )}
                      {isChanged(keymap, id) && (
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          aria-label={t('keys.resetActionLabel', { action: label })}
                          title={t('keys.resetActionLabel', { action: label })}
                          onClick={() => attempt(id, resetAction(keymap, id, { extra: filterIds }), () => resetAction(keymap, id, { move: true, extra: filterIds }))}
                        >
                          {t('keys.resetAction')}
                        </button>
                      )}
                    </div>
                    {conflict?.id === id && (
                      <Alert variant="warning" className="mt-2 mb-0 d-flex flex-wrap align-items-center gap-2">
                        <span className="flex-grow-1">
                          {t('keys.conflict', { key: show(conflict.key), actions: conflict.actions.map(nameOf).join(', ') })}
                        </span>
                        <button
                          type="button"
                          className="btn btn-warning"
                          onClick={() => {
                            const moved = conflict.move();
                            setConflict(null);
                            if ('keymap' in moved) commit(moved.keymap);
                          }}
                        >
                          {t('keys.moveHere')}
                        </button>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setConflict(null)}>{t('keys.cancel')}</button>
                      </Alert>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <ConfirmModal
        show={confirmResetAll}
        title={t('keys.resetAllTitle')}
        body={t('keys.resetAllBody', { preset: presetName(t, keymap.basedOn) })}
        confirmLabel={t('keys.resetAll')}
        variant="danger"
        onConfirm={() => {
          setConfirmResetAll(false);
          commit(resetAll(keymap));
        }}
        onCancel={() => setConfirmResetAll(false)}
      />
      <ConfirmModal
        show={upload !== null}
        title={t('keys.uploadTitle')}
        body={t('keys.uploadBody', { name: upload?.keymap.name ?? '' })}
        confirmLabel={t('keys.replace')}
        onConfirm={() => {
          if (!upload) return;
          setUpload(null);
          commit(upload.keymap, upload.dropped);
          setNotice((current) => current ?? t('keys.uploaded'));
        }}
        onCancel={() => setUpload(null)}
      />
    </main>
  );
};
