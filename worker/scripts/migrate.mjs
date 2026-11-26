// Creates the tables in your Neon database.
// Usage: DATABASE_URL="postgres://..." npm run db:migrate
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to your Neon connection string first.');
  process.exit(1);
}
const sql = neon(url);
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
  .replace(/--.*$/gm, '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);
for (const stmt of schema) await sql.query(stmt);
console.log(`Applied ${schema.length} statements. Database is ready.`);
