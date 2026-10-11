import type { UserInfo, UserInput } from '../../../shared/types.js';

const MB = 1024 * 1024;

/** The user editor's fields, as text where the form has text inputs. */
export interface UserForm {
  username: string;
  displayName: string;
  roleId: string;
  password: string;
  accessAll: boolean;
  folders: string[];
  albums: string[];
  /** Megabytes; empty for no limit */
  exportMb: string;
  /** Requests per minute; empty for the default */
  rate: string;
  /** The linked person, null for none */
  personId: string | null;
  personName: string | null;
}

export const emptyUserForm = (): UserForm => ({
  username: '', displayName: '', roleId: 'viewer', password: '', accessAll: true, folders: [], albums: [], exportMb: '', rate: '',
  personId: null, personName: null,
});

/** The editor's fields for an existing user. */
export function formFromUser(user: UserInfo): UserForm {
  const limit = (kind: string) => user.quotas.find((quota) => quota.kind === kind)?.limit ?? null;
  const exportBytes = limit('export_bytes');
  const rate = limit('requests_per_minute');
  return {
    username: user.username,
    displayName: user.displayName,
    roleId: user.roleId,
    password: '',
    accessAll: user.access.all,
    folders: user.access.all ? [] : user.access.folders,
    albums: user.access.all ? [] : user.access.albums,
    exportMb: exportBytes === null ? '' : String(Math.round((exportBytes / MB) * 100) / 100),
    rate: rate === null ? '' : String(rate),
    personId: user.personId,
    personName: user.personName,
  };
}

/** A whole number from a text field; null when empty; NaN when it is not a non-negative number. */
const parseLimit = (text: string, scale = 1): number | null => {
  if (text.trim() === '') return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * scale) : NaN;
};

/**
 * The request body for the form: a new user with username and password, or the changed fields of an existing
 * one. `invalid` names a quota field that is not a number.
 */
export function userInputFromForm(form: UserForm, isNew: boolean): { input: UserInput } | { invalid: 'exportMb' | 'rate' } {
  const exportBytes = parseLimit(form.exportMb, MB);
  if (Number.isNaN(exportBytes)) return { invalid: 'exportMb' };
  const rate = parseLimit(form.rate);
  if (Number.isNaN(rate)) return { invalid: 'rate' };
  const input: UserInput = {
    displayName: form.displayName.trim() || form.username.trim(),
    roleId: form.roleId,
    access: form.accessAll ? { all: true } : { all: false, folders: form.folders, albums: form.albums },
    quotas: { export_bytes: exportBytes, requests_per_minute: rate },
    personId: form.personId,
  };
  if (isNew) {
    input.username = form.username.trim();
    input.password = form.password;
  }
  return { input };
}

/** Adds or removes a value of a list, keeping its order. */
export const toggled = <T,>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
