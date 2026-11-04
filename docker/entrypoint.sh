#!/bin/sh
set -eu
if [ -n "${DATABASE_URL:-}" ]; then
  node --input-type=module <<'NODE'
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let last = "";
for (let i = 0; i < 40; i += 1) {
  try {
    await pool.query("select 1");
    await pool.end();
    process.exit(0);
  } catch (err) {
    last = err instanceof Error ? err.message : String(err);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
console.error(last);
process.exit(1);
NODE
fi
exec npm run dev
