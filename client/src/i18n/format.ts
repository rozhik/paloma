import { useTranslation } from 'react-i18next';

/** A `YYYY-MM-DD` calendar day as local midnight, so formatting shows that same day in every time zone. */
const calendarDay = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
};

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
    /** Two `YYYY-MM-DD` calendar days as a range, e.g. `Oct 3 – 9, 2016` */
    formatDayRange: (from: string, to: string) => date.formatRange(calendarDay(from), calendarDay(to)),
  };
}

/** Formatters for the active UI language; components re-render with new ones when the language changes. */
export function useFormat() {
  const { i18n } = useTranslation();
  return formatters(i18n.language);
}
