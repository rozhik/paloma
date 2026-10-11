import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { AuthGate } from './auth/AuthPages.js';
import { watchSession } from './auth/authStore.js';
import { currentLanguage, initI18n, initialLanguage } from './i18n/index.js';
import { bindDocumentLanguage } from './i18n/document.js';
import { initAppearance } from './appearance/runtime.js';
import './appearance/base.css';

// The language, skin and theme are in place before the first render, so the UI does not flash in English, LTR,
// or another skin or theme
Promise.all([initI18n(initialLanguage()), initAppearance()]).then(() => {
  bindDocumentLanguage();
  // A request that finds the session ended shows the login page
  watchSession(currentLanguage);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AuthGate>
        <App />
      </AuthGate>
    </React.StrictMode>
  );
});
