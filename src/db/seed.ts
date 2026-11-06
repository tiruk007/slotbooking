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

    // 1. Create demo host for development environment
    const hostRes = await client.query(
      `INSERT INTO hosts (name, email, slug, password_hash, home_timezone, status)
       VALUES ($1, $2, $3, NULL, $4, 'ACTIVE')
       RETURNING id, name, email, slug, home_timezone`,
      ["Alex Chen", "alex@slotbook.dev", "alex-chen", "Asia/Kolkata"]
    );
    const hostId = hostRes.rows[0].id;
    console.log(`✓ Seeded Demo Host: ${hostRes.rows[0].name} (${hostRes.rows[0].email})`);

    // 2. Create the two demo event types required for the assignment demo
    // Event 1: 30 Min Appointment
    await client.query(
      `INSERT INTO event_types 
       (host_id, name, slug, description, category, status, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, 'PUBLISHED', $6, $7, $8, $9, $10, $11)`,
      [hostId, "30 Min Appointment", "30-min-appointment", "Quick introductory meeting or check-in session.", "One-on-One", 30, 1, 10, 10, 60, 30]
    );

    // Event 2: 1 Hr Appointment
    await client.query(
      `INSERT INTO event_types 
       (host_id, name, slug, description, category, status, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, 'PUBLISHED', $6, $7, $8, $9, $10, $11)`,
      [hostId, "1 Hr Appointment", "1-hr-appointment", "Comprehensive consultation, technical design review, or deep-dive mentorship.", "One-on-One", 60, 1, 15, 15, 120, 60]
    );
    console.log("✓ Seeded 2 Demo Event Types (30 Min Appointment, 1 Hr Appointment)");

    // 3. Weekly Availability (Monday - Friday, 09:00-12:00 and 13:00-17:00)
    for (let weekday = 1; weekday <= 5; weekday++) {
      await client.query(
        `INSERT INTO availability_rules (host_id, weekday, start_time, end_time)
         VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)`,
        [hostId, weekday, "09:00:00", "12:00:00", "13:00:00", "17:00:00"]
      );
    }
    console.log("✓ Seeded Weekly Availability Rules (Mon-Fri 09:00-12:00, 13:00-17:00)");

    // Note: No fake bookings or fake notifications are seeded.
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
