// Removes server file-system paths from text that leaves the server (API error bodies, task messages, MCP
// results), so a client never learns where the library or the cache lives.

/**
 * An absolute POSIX path of two or more segments (`/a/b`), or a Windows drive or UNC path (`C:\a`, `\\host\share`),
 * starting the text or after whitespace, a quote, `(`, `[`, `=` or `:`. URLs (`http://host/a/b`) are left alone,
 * since their path follows the host, not one of those characters.
 */
const ABSOLUTE_PATH = /(^|[\s'"`(\[=:,])((?:[A-Za-z]:[\\/]|\\\\)[^\s'"`)\]]+|\/(?:[^\s/'"`)\]]+\/)+[^\s/'"`)\]]*)/g;

export const PATH_PLACEHOLDER = '<path>';

/** The text with every absolute path replaced by `<path>`. */
export function redactPaths(text: string): string {
  return text.replace(ABSOLUTE_PATH, (_match, before: string) => `${before}${PATH_PLACEHOLDER}`);
}

/** The text with `filePath` replaced by `photo <id>`, then any other absolute path redacted. */
export function redactPhotoPath(text: string, filePath: string, photoId: number): string {
  return redactPaths(filePath ? text.split(filePath).join(`photo ${photoId}`) : text);
}
