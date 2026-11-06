# Slotbook — Simple Scheduling. Seamless Meetings.

Slotbook is a modern, reliable appointment scheduling platform built with TypeScript, Next.js (App Router), PostgreSQL 15+, Drizzle ORM, Zod, Tailwind CSS, Luxon, and Vitest.

The platform provides a seamless experience for hosts and guests with passwordless email OTP authentication, strict database-enforced concurrency, cross-event buffer protection, daily duplicate prevention, and transactional email notifications via Gmail SMTP.

---

## 1. Product Overview

Slotbook connects hosts and guests effortlessly:
1. **Public Homepage**: Clear product introduction, how it works, available appointment types, benefits for hosts and guests, and direct calls to action.
2. **Hosts Portal**: Passwordless email OTP registration, instant login via verification code, and an intuitive dashboard to manage availability, date overrides, appointment types, upcoming bookings, and account settings.
3. **Guest Booking Experience**: Frictionless booking without an account. Guests select a convenient slot, enter their contact details and meeting purpose, verify their email with a 6-digit code, and instantly secure their appointment.
4. **Private Booking Management**: Guests receive a private, secure management URL (`/bookings/{token}`) powered by SHA-256 hashed cryptographic tokens, allowing them to reschedule or cancel anytime.

---

## 2. Core Capabilities & Architecture

| Feature | Description | Implementation |
|---|---|---|
| **Host Authentication** | Passwordless Email OTP | 6-digit cryptographically secure OTP, SHA-256 hash storage, 5-minute expiry, 30s resend cooldown, 5 attempt maximum. |
| **Guest Verification** | Mandatory Email Verification | 6-digit OTP delivered via email before final booking confirmation. Stale holds auto-expire after 5 minutes. |
| **Concurrency & Double-Booking Protection** | Zero Double-Bookings | PostgreSQL `btree_gist` exclusion constraints for 1-on-1 bookings and serialized `SELECT ... FOR UPDATE` row locks for group capacity. |
| **Cross-Event Buffer Enforcement** | Dedicated Meeting Spacing | Before-buffers and after-buffers are strictly enforced across both adjacent meetings and different event types for the same host. |
| **Daily Duplicate Protection** | 1 Active Booking / Day | Enforces at most one active booking (`HELD` or `CONFIRMED`) per guest email, per event type, per host-local calendar day via PostgreSQL partial unique index. |
| **Availability & Overrides** | Dynamic Scheduling | Weekly availability windows + date overrides. Marking a day off immediately blocks slots; host is warned if day off conflicts with confirmed bookings. |
| **Email & Outbox System** | Transactional Delivery | Nodemailer integration with Gmail SMTP (`smtp.gmail.com:465`) backed by a PostgreSQL transactional outbox tracking 8 domain events. |
| **Video Conferencing** | Google Meet Integration | Generates real Google Meet links when OAuth credentials are provided; gracefully provides clean meeting details without fabricated URLs. |

---

## 3. Technology Stack

- **Framework**: Next.js 14 (App Router, Server Actions, API Routes)
- **Language**: TypeScript (Strict mode)
- **Database**: PostgreSQL 15+ (with `btree_gist` extension)
- **Data Access**: Drizzle ORM & Typed PostgreSQL Client (`pg`)
- **Validation**: Zod schema validation on all inputs and API payloads
- **Date & Timezone**: Luxon (IANA timezones, DST spring-forward gap & fall-back overlap resolution)
- **Email Engine**: Nodemailer (Gmail SMTP + transactional outbox)
- **Styling**: Tailwind CSS & Lucide Icons
- **Testing**: Vitest integration testing against real PostgreSQL

---

## 4. Database Schema

### Key Tables & Constraints

1. **`hosts`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `name TEXT NOT NULL`
   - `email TEXT NOT NULL UNIQUE`
   - `password_hash TEXT` (deprecated/nullable; authentication uses passwordless OTP)
   - `home_timezone TEXT NOT NULL DEFAULT 'UTC'`
   - `status TEXT NOT NULL DEFAULT 'ACTIVE'`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`

2. **`event_types`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE`
   - `name TEXT NOT NULL` (e.g., "30 Min Appointment", "1 Hr Appointment", "Group Discussion")
   - `slug TEXT NOT NULL`
   - `duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 15 AND duration_minutes <= 120)`
   - `capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1)`
   - `buffer_before INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before >= 0)`
   - `buffer_after INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after >= 0)`
   - `minimum_notice_minutes INTEGER NOT NULL DEFAULT 60 CHECK (minimum_notice_minutes >= 0)`
   - `booking_horizon_days INTEGER NOT NULL DEFAULT 30 CHECK (booking_horizon_days >= 1)`
   - `CONSTRAINT uq_host_slug UNIQUE (host_id, slug)`

3. **`bookings`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE`
   - `guest_name TEXT`
   - `guest_email TEXT`
   - `meeting_purpose TEXT NOT NULL DEFAULT ''`
   - `host_local_date DATE` (stored local calendar date for daily constraint)
   - `start_at TIMESTAMPTZ NOT NULL`
   - `end_at TIMESTAMPTZ NOT NULL`
   - `meet_link TEXT`
   - `status TEXT NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'RESCHEDULED'))`
   - `hold_expires_at TIMESTAMPTZ`
   - `cancellation_reason TEXT`
   - `manage_token_hash TEXT UNIQUE`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`
   - **PostgreSQL Unique Partial Index**:
     ```sql
     CREATE UNIQUE INDEX uq_active_booking_per_guest_event_date
     ON bookings (event_type_id, LOWER(TRIM(guest_email)), host_local_date)
     WHERE status IN ('HELD', 'CONFIRMED');
     ```

4. **`otp_codes`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `email TEXT NOT NULL`
   - `purpose TEXT NOT NULL` (`HOST_REGISTER`, `HOST_LOGIN`, `GUEST_BOOKING`, `HOST_DELETE_ACCOUNT`)
   - `code_hash TEXT NOT NULL` (SHA-256 hash of the 6-digit OTP)
   - `expires_at TIMESTAMPTZ NOT NULL`
   - `consumed_at TIMESTAMPTZ`
   - `attempts INTEGER NOT NULL DEFAULT 0`
   - `metadata JSONB`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`

5. **`active_reservations` (GiST Range Exclusion)**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE`
   - `event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE`
   - `booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE UNIQUE`
   - `buffered_range TSTZRANGE NOT NULL`
   - `CONSTRAINT exclude_host_schedule_overlap EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&)`

6. **`notification_outbox`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL`
   - `recipient_email TEXT`
   - `subject TEXT`
   - `event_type TEXT NOT NULL` (supports 8 domain events including booking confirmation, rescheduling, guest cancellation, host cancellation, account deletion, day-off notifications)
   - `payload JSONB NOT NULL`
   - `delivery_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'FAILED'))`
   - `attempt_count INTEGER NOT NULL DEFAULT 0`
   - `last_error TEXT`
   - `delivered_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`

---

## 5. Booking & Verification Lifecycle

```
[Guest Selects Slot]
        |
        v
[Enter Name, Email, Purpose]
        |
        v
[POST /api/holds] ----------------> Creates 5-min Hold
        |                            Generates 6-digit OTP & Sends Email
        v
[Enter 6-digit Verification Code]
        |
        v
[POST /api/holds/{id}/confirm] ----> Verifies OTP
                                     Enforces Daily Duplicate Constraint
                                     Updates Status to CONFIRMED
                                     Generates Magic Manage Link
                                     Enqueues Confirmation Emails (Host & Guest)
```

---

## 6. Local Installation & Development

### Prerequisites
- Node.js 18+ (tested on Node 20 & 26)
- PostgreSQL 15+ running locally (or via Docker)

### Setup Steps
```bash
# 1. Clone repository
git clone https://github.com/tiruk007/slotbooking.git
cd slotbooking

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, SESSION_SECRET, and Gmail SMTP credentials

# 4. Run database migrations
npm run db:migrate

# 5. Seed initial data (only runs if database is uninitialized)
npm run db:seed

# 6. Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 7. Docker Instructions

Start the complete application stack with Docker Compose:

```bash
docker compose up --build
```

The containerized startup automatically:
1. Starts PostgreSQL 16 Alpine container with healthcheck monitoring.
2. Runs all database migrations sequentially (`npm run db:migrate`).
3. Seeds initial host and appointment types only if the database has not already been initialized.
4. Preserves all existing records across container restarts (using persistent named volume `pgdata`).
5. Launches the production Next.js application on `http://localhost:3000`.

To stop the containers:
```bash
docker compose down
```

---

## 8. Automated Testing

All tests run against a real PostgreSQL database with zero mocking of database concurrency guarantees:

```bash
npm test
```

### Test Suites Included:
- **`tests/concurrency.test.ts`**:
  - Capacity = 1 exclusion: 20 simultaneous concurrent requests &rarr; exactly 1 succeeds, 19 fail with HTTP 409.
  - Capacity > 1 locking: 20 simultaneous requests for capacity = 3 &rarr; exactly 3 succeed, 17 fail with HTTP 409.
  - Idempotency replay with matching key & payload conflict detection.
  - Stale hold cleanup via `clock_timestamp()` and confirmation race condition enforcement.
  - Atomic rescheduling and rollback safety.
  - Timezone and DST spring-forward / fall-back boundary conditions.
- **`tests/api.test.ts`**:
  - Full API lifecycle integration for slots, holds, OTP confirmations, reschedules, and cancellations.
- **`tests/transformation.test.ts`**:
  - Daily duplicate booking prevention (1 active booking per guest email per event per local day).
  - Cross-event before-and-after buffer enforcement.
  - Passwordless host registration and login OTP workflows.
  - Host account deletion with transactional cancellation and guest notifications.
  - Availability day-off conflict detection and override management.
  - Transactional notification outbox delivery tracking.

---

## 9. Environment Variables

Configure the following variables in your `.env` file:

```env
# Database Connection
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/slotbook
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/slotbook_test

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Authentication Session Secret (at least 32 characters)
SESSION_SECRET=slotbook_production_secure_secret_key_at_least_32_characters_long_for_session

# Gmail SMTP Configuration
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

# Google OAuth Credentials for Google Meet (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
```

---

## 10. License

MIT License. Designed and engineered for high-reliability scheduling.
