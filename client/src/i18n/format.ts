import { useTranslation } from 'react-i18next';

/** Formatters for numbers, dates and times in the given language. */
export function formatters(language: string) {
  const number = new Intl.NumberFormat(language);
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });
  const dateTime = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  const degrees = new Intl.NumberFormat(language, { maximumFractionDigits: 5 });
  return {
    /** Decimal degrees with the language's decimal mark, e.g. `48.16083°` */
    formatDegrees: (value: number) => `${degrees.format(value)}°`,
    formatNumber: (value: number) => number.format(value),
    formatDate: (value: Date | string) => date.format(new Date(value)),
    formatDateTime: (value: Date | string) => dateTime.format(new Date(value)),
  };
}

/** Formatters for the active UI language; components re-render with new ones when the language changes. */
export function useFormat() {
  const { i18n } = useTranslation();
  return formatters(i18n.language);
}
