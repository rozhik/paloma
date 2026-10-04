import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Check, Languages } from 'lucide-react';
import { LANGUAGES } from '../i18n/languages.js';
import { changeLanguage, currentLanguage } from '../i18n/index.js';

/** Top-bar menu listing every UI language by its own name; the choice is remembered in this browser. */
export const LanguageSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const active = currentLanguage();

  return (
    <Dropdown align="end">
      <Dropdown.Toggle variant="outline-light" className="btn-lg-custom" title={t('language.label')} aria-label={t('language.label')}>
        <Languages size={22} />
        <span>{LANGUAGES.find((l) => l.tag === active)?.nativeName}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu>
        {LANGUAGES.map(({ tag, nativeName, dir }) => (
          <Dropdown.Item
            key={tag}
            lang={tag}
            dir={dir}
            active={tag === active}
            onClick={() => changeLanguage(tag)}
            className="d-flex align-items-center justify-content-between gap-3 fs-5"
          >
            <span>{nativeName}</span>
            {tag === active && <Check size={18} />}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
};
