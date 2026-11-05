import bcrypt from "bcryptjs";
import { getPool } from "./index";
import * as dotenv from "dotenv";

dotenv.config();

export async function seed(customUrl?: string) {
  const url = customUrl || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook";
  console.log(`Seeding database: ${url.replace(/:[^:@]+@/, ":***@")}`);
  const pool = getPool(url);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Clean existing seed data
    await client.query("DELETE FROM hosts WHERE email = 'alex@slotbook.dev'");

    const passwordHash = await bcrypt.hash("password123", 10);

    // 1. Create demo host
    const hostRes = await client.query(
      `INSERT INTO hosts (name, email, password_hash, home_timezone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, home_timezone`,
      ["Alex Chen", "alex@slotbook.dev", passwordHash, "Asia/Kolkata"]
    );
    const hostId = hostRes.rows[0].id;
    console.log(`✓ Seeded Host: ${hostRes.rows[0].name} (${hostRes.rows[0].email})`);

    // 2. Create Event Types
    // Event 1: 1-on-1 30-min chat
    await client.query(
      `INSERT INTO event_types 
       (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [hostId, "30 Minute Quick Chat", "30-min-chat", 30, 1, 10, 10, 60, 30]
    );

    // Event 2: 1-on-1 60-min strategy session
    await client.query(
      `INSERT INTO event_types 
       (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [hostId, "60 Minute Strategy Session", "strategy-session", 60, 1, 15, 15, 120, 60]
    );

    // Event 3: Group workshop with capacity 4
    await client.query(
      `INSERT INTO event_types 
       (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [hostId, "Group Product Workshop", "team-workshop", 45, 4, 10, 10, 180, 30]
    );
    console.log("✓ Seeded Event Types (1-on-1 and Group capacity)");

    // 3. Weekly Availability (Monday - Friday, 2 windows: 09:00-12:00 and 13:00-17:00)
    for (let weekday = 1; weekday <= 5; weekday++) {
      await client.query(
        `INSERT INTO availability_rules (host_id, weekday, start_time, end_time)
         VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)`,
        [hostId, weekday, "09:00:00", "12:00:00", "13:00:00", "17:00:00"]
      );
    }
    console.log("✓ Seeded Weekly Availability Rules (Mon-Fri 09:00-12:00, 13:00-17:00)");

    // 4. Sample Date Override (e.g. Next month holiday)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);
    const dateStr = futureDate.toISOString().split("T")[0];
    await client.query(
      `INSERT INTO date_overrides (host_id, override_date, is_available)
       VALUES ($1, $2, $3)`,
      [hostId, dateStr, false]
    );
    console.log(`✓ Seeded Date Override (${dateStr} marked unavailable)`);

    await client.query("COMMIT");
    console.log("✓ Database seeding completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seeding failed:", error);
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
