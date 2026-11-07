import fs from "fs";
import path from "path";
import { getPool } from "./index";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function ensureDatabaseExists(url: string) {
  try {
    const parsed = new URL(url.replace(/^postgres:/, "postgresql:"));
    const dbName = parsed.pathname.replace(/^\//, "");
    if (!dbName || dbName === "postgres") return;

    const maintenanceDbs = ["postgres", "template1", "slotbook"];
    for (const mDb of maintenanceDbs) {
      if (mDb === dbName) continue;
      try {
        const mParsed = new URL(url.replace(/^postgres:/, "postgresql:"));
        mParsed.pathname = `/${mDb}`;
        const adminPool = new Pool({
          connectionString: mParsed.toString(),
          connectionTimeoutMillis: 4000,
        });
        const adminClient = await adminPool.connect();
        try {
          const check = await adminClient.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [dbName]
          );
          if (check.rowCount === 0) {
            console.log(`Database "${dbName}" does not exist. Creating it automatically...`);
            const cleanDbName = dbName.replace(/[^a-zA-Z0-9_]/g, "");
            await adminClient.query(`CREATE DATABASE "${cleanDbName}"`);
            console.log(`✓ Database "${cleanDbName}" created successfully.`);
          }
          return;
        } finally {
          adminClient.release();
          await adminPool.end();
        }
      } catch {
        // Try next maintenance db
      }
    }
  } catch {
    // If URL parsing fails, ignore and proceed
  }
}

export async function runMigrations(customUrl?: string) {
  const url = customUrl || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook";
  console.log(`Running migrations against: ${url.replace(/:[^:@]+@/, ":***@")}`);

  let pool = getPool(url);
  let client;

  try {
    client = await pool.connect();
  } catch (err: any) {
    if (err?.code === "3D000" || err?.message?.includes("does not exist")) {
      await pool.end();
      await ensureDatabaseExists(url);
      pool = getPool(url);
      client = await pool.connect();
    } else {
      throw err;
    }
  }

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
