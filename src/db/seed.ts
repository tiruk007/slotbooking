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

    // Check if database is already initialized
    const existingHostsRes = await client.query("SELECT COUNT(*) AS count FROM hosts");
    const hostCount = parseInt(existingHostsRes.rows[0].count, 10);
    if (hostCount > 0) {
      console.log(`Database already has ${hostCount} host(s) initialized. Skipping seeding to preserve existing records.`);
      await client.query("COMMIT");
      return;
    }

    // 1. Create initial host (passwordless OTP ready)
    const hostRes = await client.query(
      `INSERT INTO hosts (name, email, password_hash, home_timezone, status)
       VALUES ($1, $2, NULL, $3, 'ACTIVE')
       RETURNING id, name, email, home_timezone`,
      ["Alex Chen", "alex@slotbook.dev", "Asia/Kolkata"]
    );
    const hostId = hostRes.rows[0].id;
    console.log(`✓ Seeded Host: ${hostRes.rows[0].name} (${hostRes.rows[0].email})`);

    // 2. Create Event Types with the updated commercial names
    // Event 1: 30 Min Appointment
    await client.query(
      `INSERT INTO event_types 
       (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [hostId, "30 Min Appointment", "30-min-appointment", 30, 1, 10, 10, 60, 30]
    );

    // Event 2: 1 Hr Appointment
    await client.query(
      `INSERT INTO event_types 
       (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [hostId, "1 Hr Appointment", "1-hr-appointment", 60, 1, 15, 15, 120, 60]
    );

    // Event 3: Group Discussion (capacity 4)
    await client.query(
      `INSERT INTO event_types 
       (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [hostId, "Group Discussion", "group-discussion", 45, 4, 10, 10, 180, 30]
    );
    console.log("✓ Seeded Customer-Facing Event Types (30 Min Appointment, 1 Hr Appointment, Group Discussion)");

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
