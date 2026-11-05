-- Slotbook Core Migration: Tables, Indexes, Constraints and GiST Exclusion Protection

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. Hosts
CREATE TABLE IF NOT EXISTS hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  home_timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. Event Types
CREATE TABLE IF NOT EXISTS event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 15 AND duration_minutes <= 120),
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  buffer_before INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before >= 0),
  buffer_after INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after >= 0),
  minimum_notice_minutes INTEGER NOT NULL DEFAULT 60 CHECK (minimum_notice_minutes >= 0),
  booking_horizon_days INTEGER NOT NULL DEFAULT 30 CHECK (booking_horizon_days >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_host_slug UNIQUE (host_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_event_types_host_id ON event_types(host_id);
CREATE INDEX IF NOT EXISTS idx_event_types_slug ON event_types(slug);

-- 3. Availability Rules
CREATE TABLE IF NOT EXISTS availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday >= 1 AND weekday <= 7), -- 1=Monday .. 7=Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CONSTRAINT chk_rule_times CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_host_weekday ON availability_rules(host_id, weekday);

-- 4. Date Overrides
CREATE TABLE IF NOT EXISTS date_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  custom_start_time TIME,
  custom_end_time TIME,
  CONSTRAINT chk_override_times CHECK (
    custom_start_time IS NULL OR custom_end_time IS NULL OR custom_start_time < custom_end_time
  )
);

CREATE INDEX IF NOT EXISTS idx_date_overrides_host_date ON date_overrides(host_id, override_date);

-- 5. Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  guest_name TEXT,
  guest_email TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'RESCHEDULED')),
  hold_expires_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  manage_token_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_booking_times CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS idx_bookings_event_start ON bookings(event_type_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status_hold ON bookings(status, hold_expires_at);
CREATE INDEX IF NOT EXISTS idx_bookings_manage_token ON bookings(manage_token_hash);

-- 6. Active Reservations Claim Table with GiST Exclusion Constraint (Capacity = 1 protection)
CREATE TABLE IF NOT EXISTS active_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
  buffered_range TSTZRANGE NOT NULL,
  CONSTRAINT exclude_host_schedule_overlap EXCLUDE USING gist (
    host_id WITH =,
    buffered_range WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_active_reservations_host ON active_reservations(host_id);

-- 7. Idempotency Keys
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  response_status INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys(key);

-- 8. Notification Outbox
CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('BOOKING_CONFIRMED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED')),
  payload JSONB NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status ON notification_outbox(delivery_status, created_at);
