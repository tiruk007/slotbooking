-- Migration 0001: Product Transformation, OTP Codes, Meeting Purpose, Duplicate Prevention & Outbox Upgrades

-- 1. Hosts table updates for OTP authentication
ALTER TABLE hosts ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

-- 2. OTP Codes table for Host & Guest Verification
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  purpose TEXT NOT NULL, -- HOST_REGISTER, HOST_LOGIN, HOST_DELETE_ACCOUNT, GUEST_BOOKING
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_lookup ON otp_codes(email, purpose, expires_at);

-- 3. Bookings updates: meeting_purpose, host_local_date, meet_link
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS meeting_purpose TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS host_local_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS meet_link TEXT;

-- Backfill meeting_purpose if NULL
UPDATE bookings SET meeting_purpose = 'General Appointment' WHERE meeting_purpose IS NULL;
ALTER TABLE bookings ALTER COLUMN meeting_purpose SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN meeting_purpose SET DEFAULT 'General Appointment';

-- Backfill host_local_date if NULL
UPDATE bookings b
SET host_local_date = (b.start_at AT TIME ZONE COALESCE(h.home_timezone, 'UTC'))::date
FROM event_types e
JOIN hosts h ON e.host_id = h.id
WHERE b.event_type_id = e.id AND b.host_local_date IS NULL;

-- 4. Critical Duplicate Booking Restriction:
-- One guest email address can book an event type only ONCE per host-local calendar day for HELD & CONFIRMED status
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking_per_guest_event_date
ON bookings (event_type_id, LOWER(TRIM(guest_email)), host_local_date)
WHERE status IN ('HELD', 'CONFIRMED');

-- 5. Notification Outbox updates for rich event dispatch
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS recipient_email TEXT;
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Drop old check constraint on event_type if present and allow all domain events
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_event_type_check;
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS chk_notification_event_types;
ALTER TABLE notification_outbox ADD CONSTRAINT chk_notification_event_types CHECK (
  event_type IN (
    'BOOKING_CONFIRMED',
    'BOOKING_RESCHEDULED',
    'BOOKING_CANCELLED',
    'HOST_CANCELLED_EVENT',
    'EVENT_CREATED',
    'EVENT_UPDATED',
    'EVENT_DELETED',
    'HOST_REGISTERED',
    'HOST_ACCOUNT_DELETED'
  )
);

