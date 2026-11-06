-- 0004_add_guest_timezone.sql
-- Add guest_timezone to bookings to preserve the recipient's chosen IANA timezone for notifications

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_timezone TEXT DEFAULT 'UTC';
