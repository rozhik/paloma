import React from 'react';
import { usePalomaStore, AppView } from '../store/usePalomaStore.js';
import { useTranslation } from 'react-i18next';
import { Search, Image, Users, MapPin, LayoutGrid, Puzzle, Settings } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher.js';

export const Navbar: React.FC = () => {
  const { currentView, setCurrentView, searchQuery, setSearchQuery } = usePalomaStore();
  const { t } = useTranslation();

  return (
    <nav className="paloma-navbar d-flex align-items-center justify-content-between">
      <div className="d-flex align-items-center gap-3">
        <div className="paloma-logo cursor-pointer" onClick={() => setCurrentView('library')}>
          🕊️ <span>Paloma</span>
          <span className="badge bg-primary text-wrap fs-6 ms-2">{t('nav.edition')}</span>
        </div>
      </div>

      <div className="d-flex align-items-center gap-2 flex-grow-1 mx-4" style={{ maxWidth: '480px' }}>
        <div className="input-group">
          <span className="input-group-text bg-white text-dark border-end-0">
            <Search size={20} />
          </span>
          <input
            type="text"
            className="form-control form-control-lg border-start-0 fs-5"
            placeholder={t('nav.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="d-flex align-items-center gap-2">
        <button
          className={`btn btn-lg-custom ${currentView === 'library' ? 'btn-primary' : 'btn-outline-light'}`}
          onClick={() => setCurrentView('library')}
        >
          <Image size={22} />
          <span>{t('nav.library')}</span>
        </button>

        <button
          className={`btn btn-lg-custom ${currentView === 'people' ? 'btn-primary' : 'btn-outline-light'}`}
          onClick={() => setCurrentView('people')}
        >
          <Users size={22} />
          <span>{t('nav.people')}</span>
        </button>

        <button
          className={`btn btn-lg-custom ${currentView === 'map' ? 'btn-primary' : 'btn-outline-light'}`}
          onClick={() => setCurrentView('map')}
        >
          <MapPin size={22} />
          <span>{t('nav.map')}</span>
        </button>

        <button
          className={`btn btn-lg-custom ${currentView === 'collage' ? 'btn-primary' : 'btn-outline-light'}`}
          onClick={() => setCurrentView('collage')}
        >
          <LayoutGrid size={22} />
          <span>{t('nav.collage')}</span>
        </button>

        <button
          className={`btn btn-lg-custom ${currentView === 'plugins' ? 'btn-primary' : 'btn-outline-light'}`}
          onClick={() => setCurrentView('plugins')}
        >
          <Puzzle size={22} />
          <span>{t('nav.plugins')}</span>
        </button>

        <button
          className={`btn btn-lg-custom ${currentView === 'settings' ? 'btn-primary' : 'btn-outline-light'}`}
          onClick={() => setCurrentView('settings')}
        >
          <Settings size={22} />
          <span>{t('nav.settings')}</span>
        </button>

        <LanguageSwitcher />
      </div>
    </nav>
  );
};
