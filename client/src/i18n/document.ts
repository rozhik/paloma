import ltrBootstrap from 'bootstrap/dist/css/bootstrap.min.css?url';
import rtlBootstrap from 'bootstrap/dist/css/bootstrap.rtl.min.css?url';
import { i18n, currentLanguage, languageOf } from './index.js';

const BOOTSTRAP_LINK_ID = 'bootstrap-css';

/** Sets `<html lang dir>`, the page title and the Bootstrap build (LTR or RTL) for the active language. */
function applyLanguage(): void {
  const { tag, dir } = languageOf(currentLanguage());
  const root = document.documentElement;
  root.lang = tag;
  root.dir = dir;
  document.title = i18n.t('app.title');

  let link = document.getElementById(BOOTSTRAP_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = BOOTSTRAP_LINK_ID;
    link.rel = 'stylesheet';
    // First in <head>, so the app's own styles still override Bootstrap
    document.head.prepend(link);
  }
  const href = dir === 'rtl' ? rtlBootstrap : ltrBootstrap;
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

/** Applies the active language to the document now and after every language change. */
export function bindDocumentLanguage(): void {
  applyLanguage();
  i18n.on('languageChanged', applyLanguage);
}
