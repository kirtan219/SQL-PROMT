import { pool } from "@workspace/db";
import { logger } from "./logger";

export interface QueryRunResult {
  columns: string[];
  rows: (string | null)[][];
  rowCount: number;
}

const BLOCKED_READ_KEYWORDS = /\b(DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE|MERGE|UPSERT|EXEC|EXECUTE|CALL|PRAGMA|ATTACH|DETACH)\b/i;

const DANGEROUS_DDL = /\b(DROP\s+DATABASE|DROP\s+SCHEMA|TRUNCATE)\b/i;

export async function runDDL(sql: string): Promise<void> {
  const trimmed = sql.trim();

  if (DANGEROUS_DDL.test(trimmed)) {
    throw new Error("Dropping databases or schemas is not allowed.");
  }

  const client = await pool.connect();
  try {
    await client.query(trimmed);
    logger.info({ sql: trimmed }, "DDL executed successfully");
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
}

export async function runReadOnlyQuery(sql: string): Promise<QueryRunResult> {
  const trimmed = sql.trim();

  if (BLOCKED_READ_KEYWORDS.test(trimmed)) {
    throw new Error(
      "Only SELECT queries are allowed for safety. The generated query contains a write operation.",
    );
  }

  if (!trimmed.toUpperCase().startsWith("SELECT") && !trimmed.toUpperCase().startsWith("WITH")) {
    throw new Error(
      "Only SELECT or WITH (CTE) queries are allowed.",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");

    const result = await client.query(trimmed);

    await client.query("COMMIT");

    const columns = result.fields.map((f) => f.name);
    const rows = result.rows.map((row) =>
      columns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return null;
        return String(val);
      }),
    );

    logger.info({ rowCount: result.rowCount }, "Query executed successfully");

    return {
      columns,
      rows,
      rowCount: result.rowCount ?? rows.length,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
