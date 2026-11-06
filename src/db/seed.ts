import { getPool } from "./index";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Slotbook Seed Script
 * 
 * In production / clean deployment, no dummy hosts or fake bookings are inserted.
 * This script ensures database connectivity and validates that migrations are healthy.
 */
export async function seed(customUrl?: string) {
  const url = customUrl || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook";
  console.log(`Checking database initialization: ${url.replace(/:[^:@]+@/, ":***@")}`);
  const pool = getPool(url);
  const client = await pool.connect();

  try {
    // Check hosts count
    const existingHostsRes = await client.query("SELECT COUNT(*) AS count FROM hosts");
    const hostCount = parseInt(existingHostsRes.rows[0].count, 10);
    
    if (hostCount === 0) {
      console.log("✓ Database initialized with clean state (0 hosts). Real hosts can register via /host/signup.");
    } else {
      console.log(`✓ Database has ${hostCount} registered host(s). Preserving existing records.`);
    }
  } catch (error) {
    console.error("Initialization check failed:", error);
    throw error;
  } finally {
    client.release();
    if (customUrl) {
      await pool.end();
    }
  }
}

if (require.main === module || process.argv[1]?.includes("seed.ts")) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
