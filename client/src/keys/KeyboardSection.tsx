import React, { useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'lucide-react';
import type { KeymapPresetId } from '../../../shared/types.js';
import { KEYMAP_PRESETS } from '../../../shared/keymaps.js';
import { useAllows } from '../levels/controls.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { effectiveKeymap, useKeymapStore } from './keymapStore.js';
import { keymapError, presetName } from './names.js';

/**
 * Settings → Keyboard: the user's keymap, the presets to start from, and the way to the Keybindings page. Unlike the
 * rest of Settings, the keymap is kept on the server for the user.
 */
export const KeyboardSection: React.FC = () => {
  const { t } = useTranslation();
  const allowed = useAllows('settings.keyboard');
  const stored = useKeymapStore((state) => state.stored);
  const save = useKeymapStore((state) => state.save);
  const setCurrentView = usePalomaStore((state) => state.setCurrentView);
  const [confirm, setConfirm] = useState<KeymapPresetId | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!allowed) return null;
  const keymap = effectiveKeymap({ stored });
  const ownKeys = Object.keys(keymap.bindings).length > 0;

  const apply = (preset: KeymapPresetId) => {
    setConfirm(null);
    setError(null);
    save({ name: presetName(t, preset), basedOn: preset, bindings: {} }).catch((err) => setError(keymapError(t, err)));
  };
  // A keymap with keys of its own is replaced only after asking
  const choose = (preset: KeymapPresetId) => (ownKeys ? setConfirm(preset) : apply(preset));

  return (
    <fieldset className="mb-4">
      <legend className="fs-3 fw-bold mb-1">{t('keys.settingsTitle')}</legend>
      <p className="fs-5 text-secondary mb-2">{t('keys.settingsHint')}</p>
      <p className="fs-5 mb-1">{t('keys.current', { name: keymap.name })}</p>
      <p className="text-secondary mb-3">{t('keys.basedOn', { preset: presetName(t, keymap.basedOn) })}</p>

      <h4 className="fs-4 fw-semibold mb-2" id="keyboard-presets">{t('keys.presetsLabel')}</h4>
      <div className="settings-appearance-grid mb-3" role="group" aria-labelledby="keyboard-presets">
        {KEYMAP_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`btn btn-outline-primary settings-appearance d-block text-start h-100 ${keymap.basedOn === preset ? 'active' : ''}`}
            aria-pressed={keymap.basedOn === preset}
            aria-describedby={`keymap-${preset}-description`}
            onClick={() => choose(preset)}
          >
            <span className="d-block fs-5 fw-semibold">{presetName(t, preset)}</span>
            <span id={`keymap-${preset}-description`} className="d-block settings-appearance-description">{t(`keys.presets.${preset}.description`)}</span>
          </button>
        ))}
      </div>

      <button type="button" className="btn btn-primary btn-lg-custom" onClick={() => setCurrentView('keybindings')}>
        <Keyboard size={20} aria-hidden="true" />
        <span>{t('keys.edit')}</span>
      </button>
      {error && <Alert variant="danger" className="mt-3 mb-0">{error}</Alert>}

      <ConfirmModal
        show={confirm !== null}
        title={t('keys.replaceTitle')}
        body={t('keys.replaceBody', { preset: confirm ? presetName(t, confirm) : '' })}
        confirmLabel={t('keys.replace')}
        onConfirm={() => confirm && apply(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </fieldset>
  );
};
