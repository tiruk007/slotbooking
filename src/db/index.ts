import { Pool, PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

let globalPool: Pool | null = null;

export function getPool(connectionString?: string): Pool {
  if (connectionString) {
    return new Pool({ connectionString });
  }
  if (!globalPool) {
    const url = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook";
    globalPool = new Pool({
      connectionString: url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return globalPool;
}

export function getDb(connectionString?: string) {
  const pool = getPool(connectionString);
  return drizzle(pool, { schema });
}

export async function withTransaction<T>(
  clientOrPool: Pool | PoolClient,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const isClient = "release" in clientOrPool && typeof clientOrPool.release === "function";
  const client: PoolClient = isClient ? (clientOrPool as PoolClient) : await (clientOrPool as Pool).connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (!isClient) {
      client.release();
    }
  }
}
