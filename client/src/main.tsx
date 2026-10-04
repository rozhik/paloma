import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { initI18n, initialLanguage } from './i18n/index.js';
import { bindDocumentLanguage } from './i18n/document.js';
import './index.css';

// The language and its stylesheet are in place before the first render, so the UI does not flash in English or LTR
initI18n(initialLanguage()).then(() => {
  bindDocumentLanguage();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
