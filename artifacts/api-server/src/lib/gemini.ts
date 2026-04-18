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

/**
 * WikiSQL-style few-shot examples covering all major SQL patterns:
 * COUNT, SUM, AVG, MAX, MIN, WHERE, ORDER BY, GROUP BY, HAVING, JOIN,
 * LIKE, IN, BETWEEN, subqueries, CTEs, and comparisons.
 */
const FEW_SHOT_EXAMPLES = `
### FEW-SHOT EXAMPLES (WikiSQL-style training):

Example 1 — COUNT with filter:
Q: How many employees work in the Engineering department?
A: SELECT COUNT(*) AS employee_count FROM employees WHERE department = 'Engineering';

Example 2 — SUM aggregation:
Q: What is the total revenue from all sales in Q1?
A: SELECT SUM(revenue) AS total_revenue FROM sales WHERE quarter = 'Q1';

Example 3 — AVG aggregation:
Q: What is the average salary of employees by department?
A: SELECT department, AVG(salary) AS avg_salary FROM employees GROUP BY department ORDER BY avg_salary DESC;

Example 4 — MAX and MIN:
Q: What is the highest and lowest rated movie?
A: SELECT MAX(rating) AS highest_rating, MIN(rating) AS lowest_rating FROM movies;

Example 5 — ORDER BY with LIMIT:
Q: Show me the top 5 countries by GDP.
A: SELECT name, gdp_billion FROM countries ORDER BY gdp_billion DESC LIMIT 5;

Example 6 — WHERE with comparison:
Q: Which employees earn more than 100000?
A: SELECT name, department, salary FROM employees WHERE salary > 100000 ORDER BY salary DESC;

Example 7 — JOIN two tables:
Q: Show me each sale with the employee name who made it.
A: SELECT e.name AS employee_name, s.product_name, s.revenue, s.sale_date FROM sales s JOIN employees e ON s.employee_id = e.id ORDER BY s.sale_date DESC;

Example 8 — GROUP BY with COUNT:
Q: How many movies are there per genre?
A: SELECT genre, COUNT(*) AS movie_count FROM movies GROUP BY genre ORDER BY movie_count DESC;

Example 9 — HAVING clause:
Q: Which departments have an average salary above 90000?
A: SELECT department, AVG(salary) AS avg_salary FROM employees GROUP BY department HAVING AVG(salary) > 90000;

Example 10 — LIKE for string search:
Q: Find all courses that mention 'science' in their name.
A: SELECT course_name, department, instructor FROM courses WHERE LOWER(course_name) LIKE '%science%';

Example 11 — IN clause:
Q: Show customers from USA, UK, or Canada.
A: SELECT name, email, country, total_spent FROM customers WHERE country IN ('USA', 'UK', 'Canada') ORDER BY total_spent DESC;

Example 12 — BETWEEN for ranges:
Q: Which movies were released between 2010 and 2020?
A: SELECT title, release_year, rating, director FROM movies WHERE release_year BETWEEN 2010 AND 2020 ORDER BY release_year;

Example 13 — Date filtering:
Q: Show all orders placed in April 2024.
A: SELECT * FROM orders WHERE order_date >= '2024-04-01' AND order_date < '2024-05-01' ORDER BY order_date;

Example 14 — Subquery:
Q: Which products have never been ordered?
A: SELECT p.name, p.category, p.price FROM products p WHERE p.id NOT IN (SELECT DISTINCT product_id FROM orders WHERE product_id IS NOT NULL);

Example 15 — CTE (WITH clause):
Q: Show the total revenue per region and what percentage of overall revenue each region represents.
A: WITH total AS (SELECT SUM(revenue) AS grand_total FROM sales), regional AS (SELECT region, SUM(revenue) AS region_total FROM sales GROUP BY region) SELECT r.region, r.region_total, ROUND(r.region_total * 100.0 / t.grand_total, 2) AS percentage FROM regional r, total t ORDER BY r.region_total DESC;

Example 16 — CASE WHEN:
Q: Classify employees as junior, mid, or senior based on salary.
A: SELECT name, department, salary, CASE WHEN salary < 85000 THEN 'Junior' WHEN salary BETWEEN 85000 AND 120000 THEN 'Mid-level' ELSE 'Senior' END AS level FROM employees ORDER BY salary;

Example 17 — Multiple JOINs:
Q: Show me each order with the customer name and product name.
A: SELECT c.name AS customer, p.name AS product, o.quantity, o.total_amount, o.status, o.order_date FROM orders o JOIN customers c ON o.customer_id = c.id JOIN products p ON o.product_id = p.id ORDER BY o.order_date DESC;

Example 18 — COUNT DISTINCT:
Q: How many unique countries do our customers come from?
A: SELECT COUNT(DISTINCT country) AS unique_countries FROM customers;

Example 19 — String concatenation and formatting:
Q: List all students with their university and GPA, sorted by GPA.
A: SELECT name, university, major, gpa FROM students WHERE gpa IS NOT NULL ORDER BY gpa DESC;

Example 20 — Window function rank:
Q: Rank employees by salary within each department.
A: SELECT name, department, salary, RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rank_in_dept FROM employees;

Example 21 — Stock price change:
Q: What was the price change for each stock on April 15 2024?
A: SELECT ticker, company, open_price, close_price, ROUND(close_price - open_price, 2) AS price_change, ROUND((close_price - open_price) * 100.0 / open_price, 2) AS pct_change FROM stock_prices WHERE trade_date = '2024-04-15' ORDER BY pct_change DESC;

Example 22 — Aggregation with NULL handling:
Q: Show the average GPA per major, excluding students without a GPA.
A: SELECT major, COUNT(*) AS student_count, ROUND(AVG(gpa), 2) AS avg_gpa FROM students WHERE gpa IS NOT NULL GROUP BY major ORDER BY avg_gpa DESC;

Example 23 — Teams with most championships:
Q: Which sport has the highest total championships across all teams?
A: SELECT sport, SUM(championships_won) AS total_championships FROM sports_teams GROUP BY sport ORDER BY total_championships DESC;

Example 24 — Filtering NULL values:
Q: Show students who do not have a scholarship.
A: SELECT name, major, university, gpa FROM students WHERE scholarship IS NULL ORDER BY gpa DESC;

Example 25 — Population density:
Q: Which countries have a population density greater than 200 people per km2?
A: SELECT name, continent, population, area_km2, ROUND(population::NUMERIC / area_km2, 2) AS density_per_km2 FROM countries WHERE (population::NUMERIC / area_km2) > 200 ORDER BY density_per_km2 DESC;
`;

export async function generateSQL(
  question: string,
  schema: string,
): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

  const today = new Date().toISOString().split("T")[0];

  const prompt = `You are a world-class SQL Expert trained on the WikiSQL dataset. Your task is to translate Natural Language questions into valid, optimized PostgreSQL queries.

### DATABASE SCHEMA:
${schema}

### CONSTRAINTS:
1. Return ONLY the raw SQL code. Do not include markdown blocks (\`\`\`sql), explanations, or introductory text.
2. Only use columns and tables provided in the schema above.
3. Use modern SQL best practices: explicit JOINs, meaningful aliases, proper aggregations.
4. If the question cannot be answered with the given schema, return exactly: "ERROR: Insufficient data in schema."
5. For date-based queries, assume the current date is ${today}.
6. Limit results to 100 rows unless specified otherwise to prevent crashes.
7. Use PostgreSQL-compatible syntax (e.g., use :: for casting, ILIKE for case-insensitive matching).
8. Always use ROUND() for decimal/percentage calculations.
9. Prefer readable column aliases (e.g., AS total_revenue, AS avg_salary).
10. For "top N" questions, always use ORDER BY + LIMIT.
11. For percentage calculations, cast to NUMERIC before dividing.

${FEW_SHOT_EXAMPLES}

### NOW ANSWER THIS QUESTION:
${question}

SQL:`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip accidental markdown code fences if Gemini adds them
  return text
    .replace(/^```sql\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export async function explainSQL(sql: string): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Explain what this SQL query does in simple, clear English that a non-technical person can understand. Be concise but thorough. Focus on:
1. What data is being retrieved (which tables/columns)
2. Any filters applied (WHERE conditions)
3. Any grouping or aggregation (GROUP BY, COUNT, SUM, etc.)
4. How the results are sorted or limited

SQL Query:
${sql}

Plain English Explanation:`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
