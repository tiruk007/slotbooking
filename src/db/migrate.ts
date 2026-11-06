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
    const migrationsDir = path.join(__dirname, "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    await client.query("BEGIN");

    // Create tracking table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
    `);

    for (const file of files) {
      const checkRes = await client.query(
        "SELECT filename FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (checkRes.rows.length === 0) {
        console.log(`Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, "utf-8");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        console.log(`✓ Migration applied: ${file}`);
      }
    }

    await client.query("COMMIT");
    console.log("✓ All migrations applied successfully.");
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
