import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { usePalomaStore } from '../../../store/usePalomaStore.js';
import { LanguageSwitcher } from '../../../components/LanguageSwitcher.js';
import { useNavigationItems } from '../../../shell/navigation.js';
import { useAllows } from '../../../levels/controls.js';

/** Classic navigation bar: logo, search, and a labelled button for every view. */
export const ClassicNavbar: React.FC = () => {
  const { searchQuery, setSearchQuery, setCurrentView } = usePalomaStore();
  const { t } = useTranslation();
  const items = useNavigationItems();
  const showSearch = useAllows('search');
  const showLanguage = useAllows('languageSwitcher');

  return (
    <nav className="paloma-navbar d-flex align-items-center justify-content-between" aria-label={t('nav.views')}>
      <div className="d-flex align-items-center gap-3">
        <button type="button" className="paloma-logo btn p-0 border-0" onClick={() => setCurrentView('library')}>
          🕊️ <span>Paloma</span>
          <span className="badge bg-primary text-wrap fs-6 ms-2">{t('nav.edition')}</span>
        </button>
      </div>

      <div className="classic-search d-flex align-items-center gap-2 flex-grow-1 mx-4">
        {showSearch && (
          <div className="input-group">
            <span className="input-group-text border-end-0">
              <Search size={20} />
            </span>
            <input
              type="search"
              className="form-control form-control-lg border-start-0 fs-5"
              placeholder={t('nav.searchPlaceholder')}
              aria-label={t('nav.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="d-flex align-items-center gap-2">
        {items.map(({ view, icon: Icon, label, active, select }) => (
          <button
            key={view}
            type="button"
            className={`btn btn-lg-custom ${active ? 'btn-primary' : 'btn-outline-light'}`}
            aria-current={active ? 'page' : undefined}
            onClick={select}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
        {showLanguage && <LanguageSwitcher />}
      </div>
    </nav>
  );
};
