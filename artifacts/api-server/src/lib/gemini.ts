import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Please add it to your secrets.",
      );
    }
    genAI = new GoogleGenerativeAI(apiKey);
    logger.info("Gemini AI client initialized");
  }
  return genAI;
}

export async function generateSQL(
  question: string,
  schema: string,
): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

  const today = new Date().toISOString().split("T")[0];

  const prompt = `You are a world-class SQL Expert and Data Analyst. Your task is to translate Natural Language questions into valid, optimized SQL queries for PostgreSQL.

### DATABASE SCHEMA:
${schema}

### CONSTRAINTS:
1. Return ONLY the raw SQL code. Do not include markdown blocks (\`\`\`sql), explanations, or introductory text.
2. Only use columns and tables provided in the schema above.
3. Use modern SQL best practices (e.g., explicit JOINs, aliases for clarity).
4. If the question cannot be answered with the given schema, return the string: "ERROR: Insufficient data in schema."
5. For date-based queries, assume the current date is ${today}.
6. Limit results to 100 rows unless specified otherwise to prevent crashes.
7. Use PostgreSQL-compatible syntax only.

### OUTPUT FORMAT:
[Valid SQL Query]

### QUESTION:
${question}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  return text;
}

export async function explainSQL(sql: string): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Explain what this SQL query does in simple, plain English that a non-technical person can understand. Be concise but complete. Focus on what data is being retrieved and any filtering or aggregation happening.

SQL Query:
${sql}

Explanation:`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
