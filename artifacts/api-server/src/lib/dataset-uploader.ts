import * as XLSX from "xlsx";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { invalidateSchemaCache } from "./schema-inspector";

export interface UploadResult {
  tableName: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  sql: string;
  message: string;
}

const MAX_ROWS = 100_000;
const BATCH_SIZE = 500;

function sanitizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^(\d)/, "_$1")
    .slice(0, 63) || "col";
}

function deriveTableName(filename: string): string {
  const base = filename.replace(/\.(csv|xlsx|xls)$/i, "");
  return sanitizeName(base) || "uploaded_data";
}

function detectType(values: string[]): string {
  const nonEmpty = values.filter((v) => v !== "" && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return "TEXT";

  const isInteger = nonEmpty.every((v) => /^-?\d+$/.test(v.trim()));
  if (isInteger) return "BIGINT";

  const isNumeric = nonEmpty.every((v) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v.trim()));
  if (isNumeric) return "NUMERIC";

  return "TEXT";
}

async function ensureUniqueTableName(base: string, client: { query: Function }): Promise<string> {
  let name = base;
  let suffix = 1;
  while (true) {
    const result = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [name],
    );
    if (result.rowCount === 0) return name;
    name = `${base}_${suffix++}`;
  }
}

export async function importDataset(
  buffer: Buffer,
  originalFilename: string,
  customTableName?: string,
): Promise<UploadResult> {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  }) as string[][];

  if (rawRows.length < 2) {
    throw new Error("The file must contain at least a header row and one data row.");
  }

  const rawHeaders: string[] = rawRows[0].map(String);
  const dataRows = rawRows.slice(1, MAX_ROWS + 1);

  if (dataRows.length === 0) {
    throw new Error("No data rows found after the header.");
  }

  const seenCols = new Map<string, number>();
  const columns = rawHeaders.map((h) => {
    let col = sanitizeName(h) || "col";
    const count = seenCols.get(col) ?? 0;
    seenCols.set(col, count + 1);
    return count > 0 ? `${col}_${count}` : col;
  });

  const colTypes = columns.map((_, ci) => {
    const vals = dataRows.map((r) => String(r[ci] ?? ""));
    return detectType(vals);
  });

  const baseTableName = customTableName
    ? sanitizeName(customTableName)
    : deriveTableName(originalFilename);

  const client = await pool.connect();
  try {
    const tableName = await ensureUniqueTableName(baseTableName, client);

    const colDefs = columns.map((col, i) => `"${col}" ${colTypes[i]}`).join(",\n  ");
    const createSQL = `CREATE TABLE "${tableName}" (\n  ${colDefs}\n);`;

    await client.query(createSQL);

    const colList = columns.map((c) => `"${c}"`).join(", ");
    let inserted = 0;

    for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
      const batch = dataRows.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) break;

      const values: string[] = [];
      const params: string[] = [];
      let paramIndex = 1;

      for (const row of batch) {
        const placeholders = columns.map(() => `$${paramIndex++}`).join(", ");
        params.push(`(${placeholders})`);
        for (let ci = 0; ci < columns.length; ci++) {
          const raw = String(row[ci] ?? "").trim();
          values.push(raw === "" ? null! : raw);
        }
      }

      await client.query(
        `INSERT INTO "${tableName}" (${colList}) VALUES ${params.join(", ")}`,
        values,
      );
      inserted += batch.length;
    }

    invalidateSchemaCache();
    logger.info({ tableName, rowCount: inserted }, "Dataset imported");

    return {
      tableName,
      rowCount: inserted,
      columnCount: columns.length,
      columns,
      sql: createSQL,
      message: `Imported ${inserted.toLocaleString()} rows into table "${tableName}".`,
    };
  } catch (err) {
    await client.query(`DROP TABLE IF EXISTS "${baseTableName}"`).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
