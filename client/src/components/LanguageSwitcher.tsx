import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Check, Languages } from 'lucide-react';
import { LANGUAGES } from '../i18n/languages.js';
import { changeLanguage, currentLanguage } from '../i18n/index.js';

interface LanguageSwitcherProps {
  /** The toggle's button style, from the skin */
  variant?: string;
  /** Extra classes for the toggle */
  className?: string;
  /** Show only the icon; the language's name stays the accessible name */
  iconOnly?: boolean;
  iconSize?: number;
}

/** Menu listing every UI language by its own name; the choice is remembered in this browser. */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'outline-light', className = 'btn-lg-custom', iconOnly = false, iconSize = 22,
}) => {
  const { t } = useTranslation();
  const active = currentLanguage();

  return (
    <Dropdown align="end">
      <Dropdown.Toggle variant={variant} className={className} title={t('language.label')} aria-label={t('language.label')}>
        <Languages size={iconSize} />
        {!iconOnly && <span>{LANGUAGES.find((l) => l.tag === active)?.nativeName}</span>}
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
