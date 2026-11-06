-- Migration 0003: Session Management, Domain Outbox Events, Google Cleanup, and Demo Host Removal

-- 1. Create host_sessions table for persistent database sessions
CREATE TABLE IF NOT EXISTS host_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_host_sessions_token_hash ON host_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_host_sessions_host_id ON host_sessions(host_id);

-- 2. Drop obsolete Google Calendar / Meet integration columns
ALTER TABLE hosts DROP COLUMN IF EXISTS google_refresh_token;
ALTER TABLE hosts DROP COLUMN IF EXISTS google_access_token;
ALTER TABLE hosts DROP COLUMN IF EXISTS google_token_expiry;
ALTER TABLE hosts DROP COLUMN IF EXISTS google_email;
ALTER TABLE hosts DROP COLUMN IF EXISTS google_connected_at;
ALTER TABLE bookings DROP COLUMN IF EXISTS google_calendar_event_id;

-- 3. Enhance notification_outbox table for domain events
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS related_host_id UUID REFERENCES hosts(id) ON DELETE SET NULL;

-- Update event_type constraint to support all required domain events
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS chk_notification_event_types;
ALTER TABLE notification_outbox ADD CONSTRAINT chk_notification_event_types 
  CHECK (event_type IN (
    'HOST_SIGNUP_OTP',
    'HOST_LOGIN_OTP',
    'GUEST_EMAIL_VERIFICATION_OTP',
    'BOOKING_CONFIRMED',
    'BOOKING_RESCHEDULED',
    'BOOKING_CANCELLED',
    'HOST_CANCELLED_BOOKING',
    'EVENT_CANCELLED',
    'HOST_CANCELLED_EVENT',
    'EVENT_CREATED',
    'EVENT_UPDATED',
    'EVENT_DELETED',
    'HOST_REGISTERED',
    'HOST_ACCOUNT_DELETED'
  ));

-- 4. Clean up legacy seeded demo host Alex Chen and associated demo records
DELETE FROM hosts WHERE email = 'alex@slotbook.dev';

