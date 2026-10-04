import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

interface ConfirmModalProps {
  show: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before an action that changes or removes data. */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({ show, title, body, confirmLabel, variant = 'primary', onConfirm, onCancel }) => {
  const { t } = useTranslation();
  return (
    <Modal show={show} onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="fs-5">{body}</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant={variant} onClick={onConfirm}>{confirmLabel}</Button>
      </Modal.Footer>
    </Modal>
  );
};
