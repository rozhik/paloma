import React, { useState } from 'react';
import { Modal, Nav } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { AiUsagePanel, ModelCatalogView } from './AiUsagePanel.js';

/** The models users can pick from with their prices and capabilities, and the credits their own AI runs used. */
export const AiModelsModal: React.FC<{ show: boolean; onHide: () => void }> = ({ show, onHide }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'models' | 'usage'>('models');
  return (
    <Modal show={show} onHide={onHide} size="lg" centered scrollable>
      <Modal.Header closeButton><Modal.Title>{t('ai.models.dialogTitle')}</Modal.Title></Modal.Header>
      <Modal.Body className="fs-6">
        <Nav variant="tabs" activeKey={tab} onSelect={(key) => setTab(key === 'usage' ? 'usage' : 'models')} className="mb-3">
          <Nav.Item><Nav.Link eventKey="models">{t('ai.models.title')}</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="usage">{t('ai.usage.title')}</Nav.Link></Nav.Item>
        </Nav>
        {tab === 'models' ? <ModelCatalogView /> : <AiUsagePanel />}
      </Modal.Body>
    </Modal>
  );
};
