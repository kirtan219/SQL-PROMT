import { Router, type IRouter } from "express";
import { generateSQL, explainSQL } from "../lib/gemini";
import { getSchemaInfo, invalidateSchemaCache } from "../lib/schema-inspector";
import { runReadOnlyQuery, runDDL } from "../lib/query-runner";
import {
  RunNaturalLanguageQueryBody,
  ExplainSqlQueryBody,
  CreateTableBody,
  DropTableParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/sql/schema", async (req, res): Promise<void> => {
  const info = await getSchemaInfo();
  res.json({
    schema: info.schemaText,
    tables: info.tables,
  });
});

router.get("/sql/sample-questions", async (req, res): Promise<void> => {
  const info = await getSchemaInfo();
  const tableNames = info.tables.map((t) => t.name);

  let questions: string[];

  if (tableNames.length === 0) {
    questions = [
      "Show me all records from any table",
      "How many rows are in each table?",
      "What does the database schema look like?",
    ];
  } else {
    const firstTable = tableNames[0];
    questions = [
      `Show me the first 10 rows from ${firstTable}`,
      `How many records are in ${firstTable}?`,
      ...(tableNames.length > 1
        ? [
            `Show me all tables and their row counts`,
            `What are the most recent records in ${tableNames[tableNames.length - 1]}?`,
          ]
        : []),
      `Show me all columns and data types in ${firstTable}`,
    ];

    if (tableNames.length > 1) {
      questions.push(`How many rows are in each table?`);
    }
  }

  res.json({ questions: questions.slice(0, 6) });
});

router.post("/sql/query", async (req, res): Promise<void> => {
  const parsed = RunNaturalLanguageQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { question } = parsed.data;

  const schemaInfo = await getSchemaInfo();

  if (schemaInfo.tables.length === 0) {
    res.json({
      sql: "",
      columns: [],
      rows: [],
      rowCount: 0,
      warning:
        "No tables found in the database. Create some tables first to start querying.",
    });
    return;
  }

  let sql: string;
  try {
    sql = await generateSQL(question, schemaInfo.schemaText);
    req.log.info({ sql }, "Generated SQL");
  } catch (err) {
    req.log.error({ err }, "Failed to generate SQL");
    res.status(500).json({
      error:
        err instanceof Error ? err.message : "Failed to generate SQL query",
    });
    return;
  }

  if (sql.startsWith("ERROR:")) {
    res.json({
      sql,
      columns: [],
      rows: [],
      rowCount: 0,
      error: sql,
    });
    return;
  }

  let queryResult;
  try {
    queryResult = await runReadOnlyQuery(sql);
  } catch (err) {
    req.log.warn({ err, sql }, "Query execution failed");
    res.json({
      sql,
      columns: [],
      rows: [],
      rowCount: 0,
      error:
        err instanceof Error ? err.message : "Query execution failed",
    });
    return;
  }

  const warning =
    queryResult.rowCount === 0
      ? "The query ran successfully but returned no results. The data may not match your criteria."
      : null;

  res.json({
    sql,
    columns: queryResult.columns,
    rows: queryResult.rows,
    rowCount: queryResult.rowCount,
    warning,
  });
});

router.post("/sql/explain", async (req, res): Promise<void> => {
  const parsed = ExplainSqlQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { sql } = parsed.data;

  try {
    const explanation = await explainSQL(sql);
    res.json({ explanation });
  } catch (err) {
    req.log.error({ err }, "Failed to explain SQL");
    res.status(500).json({
      error:
        err instanceof Error ? err.message : "Failed to generate explanation",
    });
  }
});

router.post("/sql/tables", async (req, res): Promise<void> => {
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { tableName, columns } = parsed.data;

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    res.status(400).json({ error: "Invalid table name. Use letters, numbers, and underscores only." });
    return;
  }

  if (columns.length === 0) {
    res.status(400).json({ error: "At least one column is required." });
    return;
  }

  const columnDefs = columns.map((col) => {
    const constraints: string[] = [];
    if (col.primaryKey) constraints.push("PRIMARY KEY");
    if (!col.nullable && !col.primaryKey) constraints.push("NOT NULL");
    if (col.unique && !col.primaryKey) constraints.push("UNIQUE");
    return `  "${col.name}" ${col.type}${constraints.length ? " " + constraints.join(" ") : ""}`;
  });

  const sql = `CREATE TABLE "${tableName}" (\n${columnDefs.join(",\n")}\n);`;

  try {
    await runDDL(sql);
    invalidateSchemaCache();
    req.log.info({ tableName, sql }, "Table created");
    res.status(201).json({ tableName, sql, message: `Table "${tableName}" created successfully.` });
  } catch (err) {
    req.log.error({ err, sql }, "Failed to create table");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create table" });
  }
});

router.delete("/sql/tables/:tableName", async (req, res): Promise<void> => {
  const parsed = DropTableParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid table name." });
    return;
  }

  const { tableName } = parsed.data;

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    res.status(400).json({ error: "Invalid table name." });
    return;
  }

  const sql = `DROP TABLE IF EXISTS "${tableName}";`;

  try {
    await runDDL(sql);
    invalidateSchemaCache();
    req.log.info({ tableName }, "Table dropped");
    res.json({ tableName, message: `Table "${tableName}" has been deleted.` });
  } catch (err) {
    req.log.error({ err }, "Failed to drop table");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to drop table" });
  }
});

export default router;
