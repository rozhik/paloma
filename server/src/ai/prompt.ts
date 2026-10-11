import { listTags } from '../services/tagApi.js';

export const LIBRARY_TAGS_LIMIT = 300;

/** What the placeholders of a prompt are replaced with for one photo. */
export interface PromptValues {
  /** English name of the language, e.g. `Ukrainian` */
  language: string;
  maxTags: number;
  photoTags: readonly string[];
  description: string | null;
  libraryTags: readonly string[];
}

const PLACEHOLDER = /\{(language|maxTags|photoTags|description|libraryTags)\}/g;

/** The prompt with `{language}`, `{maxTags}`, `{photoTags}`, `{description}` and `{libraryTags}` filled in; other braces stay. */
export function expandPrompt(prompt: string, values: PromptValues): string {
  return prompt.replace(PLACEHOLDER, (_, name: keyof PromptValues) => {
    switch (name) {
      case 'language': return values.language;
      case 'maxTags': return String(values.maxTags);
      case 'photoTags': return values.photoTags.join(', ');
      case 'description': return values.description ?? '';
      case 'libraryTags': return values.libraryTags.join(', ');
    }
  });
}

/** The English name of a language tag, e.g. `Ukrainian` for `uk`; the tag itself when it is unknown. */
export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** The tags of the most photos the current request may see, most used first, at most `limit`. */
export async function topLibraryTags(limit = LIBRARY_TAGS_LIMIT): Promise<string[]> {
  const tags = await listTags();
  return tags.sort((a, b) => b.photoCount - a.photoCount).slice(0, limit).map((tag) => tag.name);
}
