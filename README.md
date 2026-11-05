# Slotbook — Production-Minded Appointment Booking Platform

Slotbook is a high-reliability, Calendly-style appointment booking platform built in TypeScript, Next.js (App Router), PostgreSQL 15+, Drizzle ORM, Zod, Tailwind CSS, Luxon, and Vitest.

The platform is designed around **uncompromising correctness and database-enforced concurrency**. No Redis, distributed lock managers, or external caching layers are used for booking correctness—**PostgreSQL is the single source of truth**.

---

## Technical Documentation Deliverables

For in-depth architectural analysis and deployment operations, refer to the documentation guides located in the [`docs/`](docs/) directory:

- 📄 **[SLOTBOOK_ARCHITECTURE.pdf](docs/SLOTBOOK_ARCHITECTURE.pdf)**: Comprehensive 10-page Architecture Specification covering system architecture, relational database ER design, immutable booking lifecycle, PostgreSQL GiST exclusion & row-level locking concurrency controls, idempotency semantics, IANA timezone & DST handling, REST API contracts, Docker architecture, and automated test reliability evidence.
- 🐳 **[DOCKER_SETUP_AND_RUN_GUIDE.md](docs/DOCKER_SETUP_AND_RUN_GUIDE.md)**: Production-grade operator's guide for Windows 11 & WSL 2 Arch Linux detailing prerequisites, environment configuration, Docker Compose lifecycle coordination, background execution, database log streaming, psql shell access, demo URLs, test execution, and troubleshooting.

---

## 1. Project Overview

Slotbook provides three primary surfaces:
1. **Host Dashboard**: Authenticated control panel to configure weekly availability rules (multiple windows per day), date-specific overrides (holidays, custom hours), event types (duration, capacity, buffers, notice, horizon), and view/cancel upcoming bookings.
2. **Public Booking Page**: Fast, client-timezone-aware booking flow (`/{host}/{event-slug}`). Guests can switch timezones, select slots, secure a temporary 5-minute hold, enter their details, and receive an instant confirmation.
3. **Private Booking Management**: Each confirmed booking receives a private management URL (`/bookings/{token}`) powered by cryptographically hashed tokens, allowing guests to reschedule or cancel at will.

---

## 2. Technology Stack

| Component | Technology | Version / Details |
|---|---|---|
| **Language** | TypeScript | Strict mode, Node.js 20+ / 26+ |
| **Frontend** | Next.js (App Router) | React 18, Server & Client Components |
| **Backend** | Next.js API Routes | Server-side transactional services |
| **Database** | PostgreSQL | 15+ (tested with PostgreSQL 16 & 18) |
| **ORM & Migrations** | Drizzle ORM & Raw SQL | `drizzle-orm`, `pg`, raw SQL with GiST exclusion |
| **Validation** | Zod | Runtime schema validation on all inputs |
| **UI & Styling** | Tailwind CSS & Lucide Icons | Responsive desktop & mobile design |
| **Date & Timezone** | Luxon | Full IANA zone support, DST transition handling |
| **Testing** | Vitest | Integration testing against real PostgreSQL instance |
| **Infrastructure** | Docker & Docker Compose | Multi-stage Dockerfile, automated migrations & seed |
| **Authentication** | Session-based | HTTP-only, secure, SameSite cookies with signed JWT |

---

## 3. Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|  - Host Dashboard (/dashboard)     - Public Booking (/{host}/{slug})              |
|  - Login (/login)                  - Booking Management (/bookings/{token})       |
+-----------------------------------------------------------------------------------+
                                          |
                                    HTTPS / JSON
                                          v
+-----------------------------------------------------------------------------------+
|                            NEXT.JS APPLICATION ROUTER                             |
|  - Middleware: Rate Limiting & Request ID Tracking (x-request-id)                  |
|  - API Endpoints: /api/holds, /api/holds/[id]/confirm, /api/hosts/.../slots       |
|  - Validation: Zod Schemas                                                        |
|  - Auth: HTTP-only Session Cookie Verification                                    |
+-----------------------------------------------------------------------------------+
                                          |
                                    Service Calls
                                          v
+-----------------------------------------------------------------------------------+
|                              BOOKING SERVICE ENGINE                               |
|  - Idempotency Engine: SHA-256 payload check & replay                              |
|  - Hold Manager: 5-minute database expiry (clock_timestamp())                     |
|  - Slot Generator: Luxon IANA local calendar & DST gap/overlap resolution        |
|  - Concurrency Orchestrator: Atomically coordinates locks & exclusion checks      |
+-----------------------------------------------------------------------------------+
                                          |
                                PostgreSQL Transactions
                                          v
+-----------------------------------------------------------------------------------+
|                             POSTGRESQL 15+ DATABASE                              |
|                                                                                   |
|  1-on-1 Exclusion: active_reservations (GiST exclude on host_id + buffered_range) |
|  Group Capacity:   SELECT ... FOR UPDATE on event_types                           |
|  Expiry Authority: clock_timestamp()                                              |
|  Audit Trail:      notification_outbox (transactional events)                     |
|  Tables:           hosts, event_types, availability_rules, date_overrides,        |
|                    bookings, active_reservations, idempotency_keys, outbox        |
+-----------------------------------------------------------------------------------+
```

---

## 4. Database Schema Explanation

### Tables and Constraints

1. **`hosts`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `name TEXT NOT NULL`
   - `email TEXT NOT NULL UNIQUE`
   - `password_hash TEXT NOT NULL`
   - `home_timezone TEXT NOT NULL DEFAULT 'UTC'`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`

2. **`event_types`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE`
   - `name TEXT NOT NULL`
   - `slug TEXT NOT NULL`
   - `duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 15 AND duration_minutes <= 120)`
   - `capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1)`
   - `buffer_before INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before >= 0)`
   - `buffer_after INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after >= 0)`
   - `minimum_notice_minutes INTEGER NOT NULL DEFAULT 60 CHECK (minimum_notice_minutes >= 0)`
   - `booking_horizon_days INTEGER NOT NULL DEFAULT 30 CHECK (booking_horizon_days >= 1)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`
   - `CONSTRAINT uq_host_slug UNIQUE (host_id, slug)`

3. **`availability_rules`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE`
   - `weekday INTEGER NOT NULL CHECK (weekday >= 1 AND weekday <= 7)` (1 = Monday .. 7 = Sunday)
   - `start_time TIME NOT NULL`
   - `end_time TIME NOT NULL`
   - `CONSTRAINT chk_rule_times CHECK (start_time < end_time)`

4. **`date_overrides`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE`
   - `override_date DATE NOT NULL`
   - `is_available BOOLEAN NOT NULL DEFAULT true`
   - `custom_start_time TIME`
   - `custom_end_time TIME`
   - `CONSTRAINT chk_override_times CHECK (custom_start_time IS NULL OR custom_end_time IS NULL OR custom_start_time < custom_end_time)`

5. **`bookings`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE`
   - `guest_name TEXT`
   - `guest_email TEXT`
   - `start_at TIMESTAMPTZ NOT NULL`
   - `end_at TIMESTAMPTZ NOT NULL`
   - `status TEXT NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'RESCHEDULED'))`
   - `hold_expires_at TIMESTAMPTZ`
   - `cancellation_reason TEXT`
   - `manage_token_hash TEXT UNIQUE`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`
   - `CONSTRAINT chk_booking_times CHECK (start_at < end_at)`

6. **`active_reservations` (GiST Range Overlap Protection)**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE`
   - `event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE`
   - `booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE UNIQUE`
   - `buffered_range TSTZRANGE NOT NULL`
   - `CONSTRAINT exclude_host_schedule_overlap EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&)`

7. **`idempotency_keys`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `key TEXT NOT NULL UNIQUE`
   - `request_hash TEXT NOT NULL`
   - `response_payload JSONB NOT NULL`
   - `response_status INTEGER NOT NULL DEFAULT 200`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`

8. **`notification_outbox`**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL`
   - `event_type TEXT NOT NULL CHECK (event_type IN ('BOOKING_CONFIRMED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'))`
   - `payload JSONB NOT NULL`
   - `delivery_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'FAILED'))`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`

---

## 5. Double-Booking Prevention Mechanism

Why can two concurrent requests never consume the same slot?

### A. One-on-One Bookings (Capacity = 1)
- **GiST Exclusion Constraint**: The table `active_reservations` enforces `EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&)`.
- The reserved interval is computed including event buffers:
  `[start_at - buffer_before, end_at + buffer_after)`.
- Even if 20 concurrent transactions pass an application check simultaneously, PostgreSQL checks the GiST index during the `INSERT INTO active_reservations`. Only the first committed transaction succeeds; all other overlapping transactions are rejected with error code `23P01` (`exclusion_violation`) and rolled back cleanly.
- When holds expire or bookings are cancelled, rows in `active_reservations` are removed, freeing the interval immediately.

### B. Group Bookings (Capacity > 1)
- **Row-Level Locking**: Competing reservations serialize via `SELECT id, host_id, capacity FROM event_types WHERE id = $1 FOR UPDATE`.
- Under PostgreSQL's `READ COMMITTED` transaction isolation level, any subsequent competing transaction pauses at the `SELECT ... FOR UPDATE` until the active transaction commits.
- When awakened, the second transaction sees the newly committed reservation count. If `activeCount >= capacity`, it aborts with HTTP 409 (`SLOT_NOT_AVAILABLE`).
- Stale holds are purged using `clock_timestamp()` inside the locked transaction prior to calculating occupancy.

### C. Atomic Transaction Steps
Every hold creation executes within a single database transaction:
1. `BEGIN;`
2. `SELECT * FROM event_types WHERE id = $1 FOR UPDATE;`
3. Purge stale holds:
   ```sql
   WITH expired AS (
     UPDATE bookings SET status = 'EXPIRED', updated_at = clock_timestamp()
     WHERE status = 'HELD' AND hold_expires_at <= clock_timestamp()
     RETURNING id
   )
   DELETE FROM active_reservations WHERE booking_id IN (SELECT id FROM expired);
   ```
4. Verify remaining capacity:
   - For `capacity = 1`: check active reservation range intersection.
   - For `capacity > 1`: count active `HELD` and `CONFIRMED` bookings at the target timestamp.
5. `INSERT INTO bookings ... RETURNING id;`
6. If `capacity = 1`, `INSERT INTO active_reservations ...;`
7. If `Idempotency-Key` present, `INSERT INTO idempotency_keys ...;`
8. `COMMIT;` (If any constraint or capacity check fails, `ROLLBACK;`).

---

## 6. Booking Lifecycle State Machine

```
              +-------------+
              |  AVAILABLE  |
              +-------------+
                     |
       (Hold created: 5 min timer)
                     v
+-----------------+ HELD +------------------+
|                   |                       |
| (5m timeout)      | (Guest details)       | (Guest cancels)
v                   v                       v
EXPIRED         CONFIRMED               CANCELLED
                    |
      +-------------+-------------+
      |                           |
(Guest reschedules)         (Host/Guest cancels)
      v                           v
 RESCHEDULED                  CANCELLED
```

- **Hold Expiry**: Expiry is governed strictly by PostgreSQL `clock_timestamp()`. Client device clocks are never trusted.
- **Confirmation Race**: `confirmHold` verifies `clock_timestamp() <= hold_expires_at` with an exclusive row lock (`FOR UPDATE`). Expired holds are blocked with HTTP 410 (`HOLD_EXPIRED`).
- **Rescheduling**: Atomically moves the reservation window. If the target slot is unavailable, the transaction rolls back, leaving the original confirmed appointment intact.
- **Management Tokens**: Guests receive a 64-character raw token. The database stores only the SHA-256 hash (`manage_token_hash`), protecting booking ownership from database exposure.

---

## 7. Network Failure & Idempotency

- The client sends an `Idempotency-Key` header with `POST /api/holds`.
- The server computes the SHA-256 hash of the request payload.
- If the key was already processed:
  - **Identical payload**: The server returns the cached response with `Idempotency-Replay: true`.
  - **Different payload**: The server detects the key conflict and returns HTTP 409 (`IDEMPOTENCY_CONFLICT`).
- Concurrent identical requests cannot create duplicate holds because `key` has a `UNIQUE` constraint in `idempotency_keys`.

---

## 8. Time-Zone Handling & Daylight Saving Time

1. **Host Calendar**: The host's home time zone is stored as an IANA identifier (e.g. `America/New_York`, `Asia/Kolkata`).
2. **Local Availability**: Availability windows are interpreted against the host's local calendar day.
3. **Database Instants**: Actual booking times are stored in UTC as `TIMESTAMPTZ`.
4. **DST Transition Policies**:
   - **Spring-Forward Gap (Nonexistent Times)**: In `America/New_York`, 02:00–02:59 is skipped in March. Slot generation verifies roundtrip wall-clock fidelity using `isValidWallTime()`; nonexistent hours are rejected.
   - **Fall-Back Overlap (Ambiguous Times)**: In November, 01:00–01:59 occurs twice. Slotbook resolves ambiguous local times consistently to standard time using IANA metadata without fixed offset math.

---

## 9. API Documentation

### `GET /api/hosts/{host}/events/{slug}/slots?from&to&tz`
Retrieves available slots for the next 30 days formatted in the guest's timezone.
- **Request**:
  ```http
  GET /api/hosts/alex@slotbook.dev/events/30-min-chat/slots?tz=America/New_York HTTP/1.1
  ```
- **Response** (HTTP 200):
  ```json
  {
    "host": {
      "id": "77b0413d-37f2-4d29-8841-939a85a72cdc",
      "name": "Alex Chen",
      "email": "alex@slotbook.dev",
      "timezone": "Asia/Kolkata"
    },
    "event": {
      "id": "3b290cb6-ecfa-49d7-b873-5e921e3c834a",
      "name": "30 Minute Quick Chat",
      "slug": "30-min-chat",
      "durationMinutes": 30,
      "capacity": 1
    },
    "slots": [
      {
        "startAt": "2026-11-06T03:30:00.000Z",
        "endAt": "2026-11-06T04:00:00.000Z",
        "remainingCapacity": 1
      }
    ]
  }
  ```

### `POST /api/holds`
Reserves a temporary 5-minute hold on a slot.
- **Headers**: `Idempotency-Key: <UUID>`
- **Request**:
  ```json
  {
    "eventTypeId": "3b290cb6-ecfa-49d7-b873-5e921e3c834a",
    "startAt": "2026-11-06T03:30:00.000Z"
  }
  ```
- **Response** (HTTP 201):
  ```json
  {
    "id": "2b6db650-8b65-4fa1-b1e8-71e35fae4465",
    "eventTypeId": "3b290cb6-ecfa-49d7-b873-5e921e3c834a",
    "startAt": "2026-11-06T03:30:00.000Z",
    "endAt": "2026-11-06T04:00:00.000Z",
    "status": "HELD",
    "holdExpiresAt": "2026-11-05T15:45:00.000Z"
  }
  ```

### `POST /api/holds/{id}/confirm`
Confirms an active hold with guest contact info and returns a private management token.
- **Request**:
  ```json
  {
    "guestName": "Sarah Connor",
    "guestEmail": "sarah@example.com"
  }
  ```
- **Response** (HTTP 200):
  ```json
  {
    "id": "2b6db650-8b65-4fa1-b1e8-71e35fae4465",
    "status": "CONFIRMED",
    "startAt": "2026-11-06T03:30:00.000Z",
    "endAt": "2026-11-06T04:00:00.000Z",
    "guestName": "Sarah Connor",
    "guestEmail": "sarah@example.com",
    "manageToken": "9e3c9217e573a4b9c1d683bf...",
    "manageUrl": "/bookings/9e3c9217e573a4b9c1d683bf..."
  }
  ```

### `POST /api/bookings/{token}/reschedule`
Moves an existing confirmed booking to a new time.
- **Request**:
  ```json
  {
    "newStartAt": "2026-11-06T04:30:00.000Z"
  }
  ```
- **Response** (HTTP 200):
  ```json
  {
    "id": "2b6db650-8b65-4fa1-b1e8-71e35fae4465",
    "status": "CONFIRMED",
    "startAt": "2026-11-06T04:30:00.000Z",
    "endAt": "2026-11-06T05:00:00.000Z",
    "message": "Booking rescheduled successfully"
  }
  ```

### `POST /api/bookings/{token}/cancel`
Cancels a booking and releases the slot.
- **Request**:
  ```json
  {
    "reason": "Family emergency"
  }
  ```
- **Response** (HTTP 200):
  ```json
  {
    "id": "2b6db650-8b65-4fa1-b1e8-71e35fae4465",
    "status": "CANCELLED",
    "cancellationReason": "Family emergency",
    "message": "Booking cancelled successfully"
  }
  ```

### `GET /api/health`
Health check endpoint reporting database status and current database time.

---

## 10. Local Installation & Development

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

# 4. Run database migrations
npm run db:migrate

# 5. Seed demo account and events
npm run db:seed

# 6. Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 11. Docker Instructions

Start the entire stack (PostgreSQL + Next.js App) with one command:

```bash
docker compose up --build
```

The containerized startup automatically:
1. Starts PostgreSQL 16 Alpine.
2. Waits for PostgreSQL readiness via healthcheck.
3. Executes raw SQL migrations (including `btree_gist` extension and GiST constraints).
4. Seeds the demo host (`alex@slotbook.dev`) and default event types.
5. Launches the Next.js production server on `http://localhost:3000`.

To stop the containers:
```bash
docker compose down
```

---

## 12. Seeded Demo Login Credentials

The database comes pre-seeded with a fully configured demo host:

| Field | Value |
|---|---|
| **Host Dashboard URL** | [http://localhost:3000/dashboard](http://localhost:3000/dashboard) |
| **Email** | `alex@slotbook.dev` |
| **Password** | `password123` |
| **Home Timezone** | `Asia/Kolkata` |
| **Public 1-on-1 Booking** | [http://localhost:3000/alex@slotbook.dev/30-min-chat](http://localhost:3000/alex@slotbook.dev/30-min-chat) |
| **Public Group Booking** | [http://localhost:3000/alex@slotbook.dev/team-workshop](http://localhost:3000/alex@slotbook.dev/team-workshop) |

---

## 13. Automated Testing

All concurrency, capacity, idempotency, lifecycle, and timezone tests run against a real PostgreSQL instance:

```bash
npm test
```

### Mandatory Tests Verified:
- **Test 1 — Concurrent booking**: 20 simultaneous requests for a capacity=1 slot &rarr; exactly 1 succeeds, 19 fail with HTTP 409, verified via direct database queries.
- **Test 2 — Group capacity**: 20 simultaneous requests for a capacity=3 slot &rarr; exactly 3 succeed, 17 fail with HTTP 409.
- **Test 3 — Idempotency**: Duplicate requests with identical `Idempotency-Key` replay the original hold; different payloads trigger HTTP 409 conflict.
- **Test 4 — Expired hold**: Expired holds no longer consume capacity; subsequent guests can reserve the freed slot immediately.
- **Test 5 — Confirmation race**: Expired holds cannot transition to `CONFIRMED` after `clock_timestamp()` passes `hold_expires_at`.
- **Test 6 — Rescheduling**: Successful reschedule moves reservation atomically; conflicting target slot fails and leaves original confirmed booking intact.
- **Test 7 — Time zones & DST**: Asia/Kolkata conversion, America/New_York spring-forward nonexistent wall-clock gap rejection, and fall-back ambiguous hour resolution.

---

## 14. Known Limitations & Production Enhancements

- **Email Delivery Worker**: Notification records are written to `notification_outbox` in the same transaction as booking mutations. In production, an external outbox worker (e.g. background job listening to Postgres `LISTEN/NOTIFY` or polling `WHERE delivery_status = 'PENDING'`) would deliver actual emails via Resend/SendGrid.
- **SMS / Calendar Sync**: Direct integration with Google Calendar / Outlook via CalDAV can be attached to outbox events without changing database reservation invariants.
