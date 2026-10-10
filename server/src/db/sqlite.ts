import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * SQL fragments whose spelling depends on the database. Services build conditions from these instead of
 * writing raw SQL, so another backend replaces this file only.
 */

/** The first `length` characters of a text column, e.g. the `YYYY-MM-DD` day of an ISO timestamp. */
export function textPrefix(column: SQLWrapper, length: number): SQL<string> {
  return sql<string>`substr(${column}, 1, ${sql.raw(String(length))})`;
}

/** Whether a text column contains `part` (case-sensitive; callers compare lowercased text). */
export function containsText(column: SQLWrapper, part: string): SQL {
  return sql`instr(${column}, ${part}) > 0`;
}

/** A condition no row matches. */
export const noRows: SQL = sql`0`;
