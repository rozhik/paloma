/** Tag editing rules shared by the chips control and the dialogs; tags compare ignoring case, as on the server. */

const key = (tag: string) => tag.toLowerCase();

/** The tags typed into the field: split at commas, trimmed, empty parts dropped. */
export function typedTags(text: string): string[] {
  return text.split(',').map((part) => part.trim()).filter((part) => part !== '');
}

/** `current` with the typed tags it does not have yet (ignoring case) added at the end. */
export function addTags(current: readonly string[], typed: readonly string[]): string[] {
  const seen = new Set(current.map(key));
  const next = [...current];
  for (const tag of typed) {
    if (seen.has(key(tag))) continue;
    seen.add(key(tag));
    next.push(tag);
  }
  return next;
}

/** `current` without `tag`, compared ignoring case. */
export function removeTag(current: readonly string[], tag: string): string[] {
  return current.filter((item) => key(item) !== key(tag));
}

/**
 * Known tags that contain what is typed, ignoring case, that the chips do not have yet: those starting with it
 * first, then the rest, each group in the given order. Nothing while the field is empty.
 */
export function tagSuggestions(known: readonly string[], typed: string, current: readonly string[], limit = 8): string[] {
  const query = key(typed.trim());
  if (query === '') return [];
  const taken = new Set(current.map(key));
  const matches = known.filter((tag) => !taken.has(key(tag)) && key(tag).includes(query));
  const starting = matches.filter((tag) => key(tag).startsWith(query));
  return [...starting, ...matches.filter((tag) => !key(tag).startsWith(query))].slice(0, limit);
}

export type ChipKeyResult =
  | { kind: 'add'; tags: string[] }
  | { kind: 'removeLast'; tags: string[] }
  | { kind: 'none' };

/**
 * What a key in the tag field does: Enter or a comma adds the typed tags, Backspace in the empty field removes
 * the last chip. Other keys type into the field.
 */
export function chipKey(keyName: string, fieldText: string, current: readonly string[]): ChipKeyResult {
  if (keyName === 'Enter' || keyName === ',') {
    const typed = typedTags(fieldText);
    return typed.length > 0 ? { kind: 'add', tags: addTags(current, typed) } : { kind: 'none' };
  }
  if (keyName === 'Backspace' && fieldText === '' && current.length > 0) {
    return { kind: 'removeLast', tags: current.slice(0, -1) };
  }
  return { kind: 'none' };
}
