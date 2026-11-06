-- Migration 0002: Workflow separation, host Google OAuth tokens, event metadata & status

-- 1. Hosts table additions: custom slug and per-host Google Calendar OAuth credentials
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMPTZ;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS google_email TEXT;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS google_connected_at TIMESTAMPTZ;

-- Backfill slug for any existing hosts based on name or email prefix
UPDATE hosts 
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'), '^-|-$', '', 'g'))
WHERE slug IS NULL;

-- Ensure unique constraint on host slug
CREATE UNIQUE INDEX IF NOT EXISTS uq_hosts_slug ON hosts(slug);

-- 2. Event Types additions: description, category, and publishing status (PUBLISHED, DRAFT, INACTIVE)
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'One-on-One';
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PUBLISHED';

-- Set default descriptions for seeded/existing events if NULL
UPDATE event_types SET description = 'Introductory call or brief consultation' WHERE description IS NULL;

-- 3. Bookings additions: Google Calendar event ID
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;

-- 4. Clean up any stale or legacy pending notifications from earlier testing
DELETE FROM notification_outbox 
WHERE delivery_status = 'PENDING' 
  AND (recipient_email LIKE '%@example.com' OR recipient_email = 'alex@slotbook.dev');
