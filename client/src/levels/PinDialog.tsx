import React, { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Delete } from 'lucide-react';
import { createPin, isValidPin, type PinRecord } from './pin.js';
import { pinWaitLeft, unlockSettings, usePinGate } from './pinGate.js';

/** `unlock` asks for the PIN to open Settings; `create` and `change` ask for a new PIN twice. */
export type PinDialogMode = 'unlock' | 'create' | 'change';

interface PinDialogProps {
  show: boolean;
  mode: PinDialogMode;
  /** After the right PIN (`unlock`), or with the record of the new PIN (`create`, `change`) */
  onDone: (record?: PinRecord) => void;
  onCancel: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** `m:ss` */
const clock = (ms: number) => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Asks for a PIN with a large keypad, for the Child level's lock on Settings. */
export const PinDialog: React.FC<PinDialogProps> = ({ show, mode, onDone, onCancel }) => {
  const { t } = useTranslation();
  const inputId = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const [pin, setPin] = useState('');
  /** The first entry of a new PIN, while the user repeats it */
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lockedUntil = usePinGate((state) => state.lockedUntil);
  const [now, setNow] = useState(Date.now());
  const waitLeft = mode === 'unlock' ? Math.max(0, lockedUntil - now) : 0;

  // A fresh dialog each time it is shown
  useEffect(() => {
    if (!show) return;
    setPin('');
    setFirst(null);
    setError(null);
    setNow(Date.now());
  }, [show, mode]);

  // The countdown while entry is refused
  useEffect(() => {
    if (!show || lockedUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [show, lockedUntil]);

  const type = (digit: string) => {
    setError(null);
    setPin((current) => (current.length < 8 ? current + digit : current));
    input.current?.focus();
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (mode === 'unlock') {
      if (pinWaitLeft() > 0) return;
      const result = unlockSettings(pin);
      setNow(Date.now());
      setPin('');
      if (result === 'ok') onDone();
      else if (result === 'wrong') setError(t('levels.pin.wrong'));
      return;
    }
    if (!isValidPin(pin)) {
      setError(t('levels.pin.invalid'));
      return;
    }
    if (first === null) {
      setFirst(pin);
      setPin('');
      setError(null);
    } else if (first !== pin) {
      setFirst(null);
      setPin('');
      setError(t('levels.pin.mismatch'));
    } else {
      onDone(createPin(pin));
    }
  };

  const title = t(`levels.pin.${mode}Title`);
  const hint = mode === 'unlock'
    ? t('levels.pin.unlockHint')
    : first === null ? t('levels.pin.createHint') : t('levels.pin.repeatHint');

  return (
    <Modal show={show} onHide={onCancel} centered onEntered={() => input.current?.focus()}>
      <form onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="fs-5">
          <label htmlFor={inputId} className="d-block mb-2">{hint}</label>
          <input
            ref={input}
            id={inputId}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            className="form-control form-control-lg text-center fs-2 pin-input"
            value={pin}
            disabled={waitLeft > 0}
            onChange={(event) => {
              setError(null);
              setPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 8));
            }}
          />
          {waitLeft > 0 && <Alert variant="warning" className="mt-3 mb-0" role="status">{t('levels.pin.wait', { time: clock(waitLeft) })}</Alert>}
          {error && waitLeft === 0 && <Alert variant="danger" className="mt-3 mb-0" role="alert">{error}</Alert>}
          <div className="pin-keypad mt-3" dir="ltr">
            {KEYS.map((digit) => (
              <button key={digit} type="button" className="btn btn-outline-primary btn-lg" disabled={waitLeft > 0} onClick={() => type(digit)}>
                {digit}
              </button>
            ))}
            <span />
            <button type="button" className="btn btn-outline-primary btn-lg" disabled={waitLeft > 0} onClick={() => type('0')}>0</button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-lg"
              title={t('levels.pin.deleteDigit')}
              aria-label={t('levels.pin.deleteDigit')}
              disabled={waitLeft > 0}
              onClick={() => setPin((current) => current.slice(0, -1))}
            >
              <Delete size={24} />
            </button>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="lg" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" size="lg" disabled={pin.length === 0 || waitLeft > 0}>
            {mode !== 'unlock' && first === null ? t('levels.pin.next') : t('levels.pin.ok')}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
};

/** The PIN dialog that `requestSettings` opens at the Child level. */
export const SettingsPinDialog: React.FC = () => {
  const asking = usePinGate((state) => state.asking);
  return (
    <PinDialog
      show={asking}
      mode="unlock"
      onDone={() => {}}
      onCancel={() => usePinGate.setState({ asking: false })}
    />
  );
};
