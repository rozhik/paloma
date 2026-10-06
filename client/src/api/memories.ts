import type { Memory } from '../../../shared/types.js';
import { apiRequest } from './http.js';

/** The local calendar date of `now` as `YYYY-MM-DD`, the "today" whose memories are shown. */
export function localDate(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const fetchMemories = (date: string): Promise<Memory[]> =>
  apiRequest<Memory[]>('GET', `/api/memories?date=${encodeURIComponent(date)}`);
