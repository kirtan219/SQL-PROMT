import { pool } from "@workspace/db";
import { logger } from "./logger";

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

export interface SchemaInfo {
  tables: TableInfo[];
  schemaText: string;
}

let cachedSchema: SchemaInfo | null = null;
let cacheTime: number = 0;
const CACHE_TTL_MS = 30_000;

export async function getSchemaInfo(): Promise<SchemaInfo> {
  const now = Date.now();
  if (cachedSchema && now - cacheTime < CACHE_TTL_MS) {
    return cachedSchema;
  }

  try {
    const client = await pool.connect();
    try {
      const tablesResult = await client.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      const tables: TableInfo[] = [];

      for (const row of tablesResult.rows) {
        const columnsResult = await client.query<{
          column_name: string;
          data_type: string;
          is_nullable: string;
        }>(
          `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
          ORDER BY ordinal_position
        `,
          [row.table_name],
        );

        tables.push({
          name: row.table_name,
          columns: columnsResult.rows.map((col) => ({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === "YES",
          })),
        });
      }

      const schemaText =
        tables.length === 0
          ? "No tables found in the database yet."
          : tables
              .map(
                (t) =>
                  `Table: ${t.name} (${t.columns.map((c) => `${c.name} ${c.type.toUpperCase()}${c.nullable ? "" : " NOT NULL"}`).join(", ")})`,
              )
              .join("\n");

      cachedSchema = { tables, schemaText };
      cacheTime = now;

      logger.info({ tableCount: tables.length }, "Schema inspected successfully");
      return cachedSchema;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "Failed to inspect schema");
    return {
      tables: [],
      schemaText: "Unable to read schema. Ensure the database is connected.",
    };
  }
}

export function invalidateSchemaCache(): void {
  cachedSchema = null;
  cacheTime = 0;
}
