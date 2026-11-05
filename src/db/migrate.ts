import fs from "fs";
import path from "path";
import { getPool } from "./index";
import * as dotenv from "dotenv";

dotenv.config();

export async function runMigrations(customUrl?: string) {
  const url = customUrl || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook";
  console.log(`Running migrations against: ${url.replace(/:[^:@]+@/, ":***@")}`);
  const pool = getPool(url);
  const client = await pool.connect();

  try {
    const migrationFile = path.join(__dirname, "migrations", "0000_init.sql");
    const sql = fs.readFileSync(migrationFile, "utf-8");

    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    console.log("✓ Migrations applied successfully with GiST exclusion constraint.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
    if (customUrl) {
      await pool.end();
    }
  }
}

if (require.main === module || process.argv[1]?.includes("migrate.ts")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
