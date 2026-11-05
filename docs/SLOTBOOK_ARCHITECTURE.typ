#set page(
  paper: "a4",
  margin: (top: 1.5cm, bottom: 1.5cm, left: 1.6cm, right: 1.6cm),
  header: context {
    if here().page() > 1 [
      #grid(
        columns: (1fr, 1fr),
        align(left)[#text(size: 7.5pt, fill: rgb("#64748b"), weight: "bold")[SLOTBOOK — ARCHITECTURAL SPECIFICATION]],
        align(right)[#text(size: 7.5pt, fill: rgb("#64748b"))[POSTGRESQL CONCURRENCY & RELIABILITY]]
      )
      #v(0.15cm)
      #line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
    ]
  },
  footer: context {
    if here().page() > 1 [
      #line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
      #v(0.15cm)
      #grid(
        columns: (1fr, 1fr),
        align(left)[#text(size: 7.5pt, fill: rgb("#94a3b8"))[https://github.com/tiruk007/slotbooking.git]],
        align(right)[#text(size: 7.5pt, fill: rgb("#475569"), weight: "bold")[Page #here().page() of 10]]
      )
    ]
  }
)

#set text(
  font: "Liberation Sans",
  size: 8.5pt,
  fill: rgb("#0f172a"),
  spacing: 110%
)

#set par(justify: true, leading: 0.52em)
#show heading: set text(fill: rgb("#1e293b"))
#show raw: set text(font: "Liberation Mono", size: 7pt)

// =============================================================================
// PAGE 1: COVER PAGE
// =============================================================================
#align(center + horizon)[
  #block(
    fill: rgb("#f8fafc"),
    inset: 28pt,
    radius: 10pt,
    stroke: 1pt + rgb("#e2e8f0"),
    width: 100%
  )[
    #text(size: 10pt, weight: "bold", fill: rgb("#4f46e5"), tracking: 2pt)[SYSTEM ARCHITECTURE SPECIFICATION]
    #v(1.2cm)
    #text(size: 32pt, weight: "extrabold", fill: rgb("#0f172a"))[SLOTBOOK]
    #v(0.3cm)
    #text(size: 14pt, weight: "medium", fill: rgb("#475569"))[Reliable Appointment Booking Platform]
    #v(0.2cm)
    #text(size: 10.5pt, style: "italic", fill: rgb("#64748b"))[Zero Double-Booking Guarantee via PostgreSQL Engine Invariants]

    #v(2.0cm)
    #line(length: 50%, stroke: 1.5pt + rgb("#4f46e5"))
    #v(1.5cm)

    #align(center)[
      #grid(
        columns: (auto, auto),
        column-gutter: 18pt,
        row-gutter: 8pt,
        align: (right, left),
        text(weight: "bold", fill: rgb("#334155"))[Technology Stack:],
        text(fill: rgb("#0f172a"))[TypeScript, Next.js App Router, PostgreSQL 16, Drizzle ORM],
        text(weight: "bold", fill: rgb("#334155"))[Concurrency Enforcement:],
        text(fill: rgb("#0f172a"))[PostgreSQL GiST Exclusion Constraints & Row-Level Locks],
        text(weight: "bold", fill: rgb("#334155"))[Deployment:],
        text(fill: rgb("#0f172a"))[Docker Compose Multi-Container Orchestration],
        text(weight: "bold", fill: rgb("#334155"))[Repository:],
        text(fill: rgb("#2563eb"))[https://github.com/tiruk007/slotbooking.git],
        text(weight: "bold", fill: rgb("#334155"))[Branch & Target:],
        text(fill: rgb("#0f172a"))[main (commit c56a6bc)],
        text(weight: "bold", fill: rgb("#334155"))[Document Version:],
        text(fill: rgb("#0f172a"))[1.0.0 (Production Architecture Review)],
        text(weight: "bold", fill: rgb("#334155"))[Date of Preparation:],
        text(fill: rgb("#0f172a"))[November 2026]
      )
    ]
  ]
]

#pagebreak()

// =============================================================================
// PAGE 2: SYSTEM ARCHITECTURE
// =============================================================================
= 1. System Architecture

Slotbook is structured into three client surfaces interacting with a Next.js App Router backend and an authoritative PostgreSQL 16 database. Concurrency correctness is delegated directly to the database storage engine rather than fragile application-tier in-memory locks or external distributed state caches.

#v(0.15cm)
#align(center)[
  #rect(fill: rgb("#f8fafc"), stroke: 1pt + rgb("#cbd5e1"), radius: 5pt, inset: 6pt, width: 100%)[
    #text(size: 6.8pt, font: "Liberation Mono")[
```
+-------------------------------------------------------------------------------------------------+
|                                        CLIENT SURFACES                                          |
|   +----------------------------+   +----------------------------+   +-----------------------+   |
|   | Host Dashboard (/dashboard)|   | Public Booking (/{host}/..) |   | Guest Management URL  |   |
|   | - Availability & Overrides |   | - Timezone switcher        |   | - Reschedule & Cancel |   |
|   | - Event Types CRUD         |   | - 5-min Hold Countdown UI  |   | - Private Hash Tokens |   |
|   +----------------------------+   +----------------------------+   +-----------------------+   |
+-------------------------------------------------------------------------------------------------+
                                                |  HTTPS / JSON API Requests
                                                v
+-------------------------------------------------------------------------------------------------+
|                                  NEXT.JS APPLICATION LAYER                                      |
|   - Middleware: Rate Limiting & Request ID Propagation (x-request-id)                            |
|   - Route Handlers: /api/hosts/.../slots, /api/holds, /api/holds/[id]/confirm, /api/bookings    |
|   - Zod Validation Gateways & Error Transformers (AppError -> Structured JSON)                  |
|   - Session Engine: Secure Signed HTTP-Only Cookies (Jose HS256 JWT)                            |
+-------------------------------------------------------------------------------------------------+
                                                |  Transactional Service Calls
                                                v
+-------------------------------------------------------------------------------------------------+
|                                    BOOKING SERVICE ENGINE                                       |
|   +--------------------+  +--------------------+  +--------------------+  +-----------------+   |
|   | Idempotency Engine |  | Slot Generator     |  | Concurrency Engine |  | Outbox Notifier |   |
|   | (SHA-256 Checksum) |  | (Luxon IANA / DST) |  | (Lock Orchestrator)|  | (Event Sink)    |   |
|   +--------------------+  +--------------------+  +--------------------+  +-----------------+   |
+-------------------------------------------------------------------------------------------------+
                                                |  PostgreSQL Pool (node-postgres)
                                                v
+-------------------------------------------------------------------------------------------------+
|                                     POSTGRESQL 16 DATABASE                                      |
|   - 1-on-1 Range Overlap Guard: active_reservations (GiST exclude on host_id + buffered_range)  |
|   - Group Capacity Serializer:  event_types (SELECT ... FOR UPDATE row-level locking)           |
|   - Expiry Time Authority:      clock_timestamp() database clock                                |
|   - Tables: hosts, event_types, availability_rules, date_overrides, bookings, idempotency_keys  |
+-------------------------------------------------------------------------------------------------+
```
    ]
  ]
]

#v(0.15cm)
== Request Flow & Component Responsibilities

1. *Guest Booking Flow*: The unauthenticated guest opens `/{host}/{event-slug}`. The Next.js frontend queries `/api/hosts/{host}/events/{slug}/slots?tz={guestTz}`. The *Slot Generator* evaluates the host's weekly rules, date overrides, existing confirmed/held bookings, and buffers in the host's local timezone using Luxon, returning available slots in UTC ISO-8601.
2. *Hold Placement*: When a slot is clicked, the guest browser generates an `Idempotency-Key` and issues `POST /api/holds`. The *Booking Service* initiates a PostgreSQL transaction, acquires an exclusive lock, purges stale holds, validates capacity, inserts the hold, and inserts an active reservation claim.
3. *Hold Confirmation*: The guest supplies their name and email, calling `POST /api/holds/{id}/confirm`. The database transaction verifies `clock_timestamp() <= hold_expires_at`, generates a 64-character private management token, stores its SHA-256 hash in `manage_token_hash`, and writes a `BOOKING_CONFIRMED` event to the `notification_outbox`.
4. *Host Dashboard & Administration*: Authenticated hosts configure weekly availability windows (multiple allowed per weekday) and date-specific overrides. Session tokens are verified via signed HTTP-only cookies; mutation operations enforce host ownership at the database query level.

#pagebreak()

// =============================================================================
// PAGE 3: DATABASE ARCHITECTURE
// =============================================================================
= 2. Database Architecture & Schema Specification

The database model is normalized into 8 core tables with strict foreign keys, cascade rules, unique indexes, and PostgreSQL-specific range exclusion constraints.

#v(0.1cm)
#align(center)[
  #rect(fill: rgb("#f8fafc"), stroke: 1pt + rgb("#cbd5e1"), radius: 5pt, inset: 6pt, width: 100%)[
    #text(size: 6.8pt, font: "Liberation Mono")[
```
+-------------------+        +--------------------+        +-------------------------+
|       hosts       | 1    N |    event_types     | 1    N |   availability_rules    |
+-------------------+--------+--------------------+        +-------------------------+
| PK id (UUID)      |        | PK id (UUID)       |        | PK id (UUID)            |
| UQ email (TEXT)   |        | FK host_id (UUID)  |        | FK host_id (UUID)       |
|    name (TEXT)    |        | UQ host_id, slug   |        |    weekday (INT 1..7)   |
|    password_hash  |        |    duration_minutes|        |    start_time (TIME)    |
|    home_timezone  |        |    capacity (INT)  |        |    end_time (TIME)      |
|    created_at     |        |    buffer_before/af|        +-------------------------+
+-------------------+        |    minimum_notice  |
          |                  |    booking_horizon |        +-------------------------+
          | 1                +--------------------+        |     date_overrides      |
          |                            |                   +-------------------------+
          |                            | 1                 | PK id (UUID)            |
          |                            |                   | FK host_id (UUID)       |
          |                            | N                 |    override_date (DATE) |
          |                  +--------------------+        |    is_available (BOOL)  |
          |                  |      bookings      |        |    custom_start/end_time|
          |                  +--------------------+        +-------------------------+
          |                  | PK id (UUID)       |
          |                  | FK event_type_id   |        +-------------------------+
          |                  |    guest_name/email|        |    idempotency_keys     |
          |                  |    start_at (TZ)   |        +-------------------------+
          |                  |    end_at (TZ)     |        | PK id (UUID)            |
          |                  |    status (TEXT)   |        | UQ key (TEXT)           |
          |                  |    hold_expires_at |        |    request_hash (TEXT)  |
          |                  | UQ manage_token_h  |        |    response_payload(JB) |
          |                  +--------------------+        |    response_status (INT)|
          |                            | 1                 +-------------------------+
          |                            |
          | 1                          | 1                 +-------------------------+
          |                  +--------------------+        |   notification_outbox   |
          +----------------->| active_reservations|        +-------------------------+
                           N +--------------------+        | PK id (UUID)            |
                             | PK id (UUID)       |        | FK booking_id (UUID)    |
                             | FK host_id (UUID)  |        |    event_type (TEXT)    |
                             | FK event_type_id   |        |    payload (JSONB)      |
                             | UQ booking_id(UUID)|        |    delivery_status(TEXT)|
                             | EX buffered_range  |        +-------------------------+
                             |    (TSTZRANGE)     |
                             +--------------------+
```
    ]
  ]
]

#v(0.1cm)
== Entity Definitions & Relational Integrity

#table(
  columns: (1.5fr, 1.2fr, 3.3fr),
  fill: (x, y) => if y == 0 { rgb("#e0e7ff") } else if calc.even(y) { rgb("#f8fafc") } else { none },
  stroke: 0.5pt + rgb("#cbd5e1"),
  align: (left, left, left),
  table.header([*Table*], [*Primary Key*], [*Constraints, Indexes & Characteristics*]),
  [`hosts`], [`id (UUID)`], [`email` UNIQUE; `home_timezone` defaults to 'UTC'; B-Tree index on email.],
  [`event_types`], [`id (UUID)`], [`UNIQUE(host_id, slug)`; duration 15..120; capacity >= 1; buffers >= 0.],
  [`availability_rules`], [`id (UUID)`], [`CHECK(start_time < end_time)`; weekday 1..7 (Luxon ISO standard).],
  [`date_overrides`], [`id (UUID)`], [`override_date` DATE; `is_available` boolean; custom time bounds check.],
  [`bookings`], [`id (UUID)`], [`TIMESTAMPTZ` start/end bounds; status enum check; SHA-256 token hash index.],
  [`active_reservations`], [`id (UUID)`], [*GiST exclusion constraint* (`host_id = WITH, buffered_range && WITH`).],
  [`idempotency_keys`], [`id (UUID)`], [`key` UNIQUE; stores request SHA-256 hash and response payload JSONB.],
  [`notification_outbox`], [`id (UUID)`], [Transactional outbox; status enum ('PENDING', 'DELIVERED', 'FAILED').]
)

#pagebreak()

// =============================================================================
// PAGE 4: BOOKING LIFECYCLE
// =============================================================================
= 3. Booking Lifecycle & State Transitions

Booking states follow an immutable state machine designed to prevent stale holds from artificially consuming capacity while ensuring clients can retry and manage appointments securely.

#v(0.15cm)
#align(center)[
  #rect(fill: rgb("#f8fafc"), stroke: 1pt + rgb("#cbd5e1"), radius: 5pt, inset: 8pt, width: 100%)[
    #text(size: 7.5pt, font: "Liberation Mono")[
```
                     +---------------------------------------+
                     |               AVAILABLE               |
                     |  (Computed dynamically from rules,   |
                     |   overrides, notice & horizon checks) |
                     +---------------------------------------+
                                         |
                                         |  POST /api/holds
                                         v
                     +---------------------------------------+
                     |                 HELD                  |
                     |   - Temporary 5-minute reservation    |
                     |   - hold_expires_at set via DB clock  |
                     |   - Active claim in active_res table  |
                     +---------------------------------------+
                                    /         \
          POST /api/holds/{id}/confirm         \  clock_timestamp() > expires_at
                                  /             \
                                 v               v
             +-----------------------+       +-----------------------+
             |       CONFIRMED       |       |        EXPIRED        |
             | - hold_expires_at=NULL|       | - Released from active|
             | - manage_token issued |       |   reservations table  |
             | - Outbox event logged |       | - Capacity restored   |
             +-----------------------+       +-----------------------+
                     |       |
      Cancel Booking |       | Reschedule Booking
                     v       v
      +-----------------+   +------------------------------------+
      |    CANCELLED    |   |            RESCHEDULED             |
      | - Claim deleted |   | - New slot validated & claimed     |
      | - Slot freed    |   | - Old range moved in 1 transaction |
      +-----------------+   +------------------------------------+
```
    ]
  ]
]

#v(0.15cm)
== Lifecycle State Transition Semantics

1. *AVAILABLE → HELD*: Triggered by `POST /api/holds` with `eventTypeId` and `startAt`. The server sets `status = 'HELD'` and `hold_expires_at = clock_timestamp() + interval '5 minutes'`. If `capacity = 1`, an active claim is registered in `active_reservations` with `buffered_range = tstzrange(start - buffer_before, end + buffer_after, '[)')`.
2. *HELD → CONFIRMED*: Triggered by `POST /api/holds/{id}/confirm` with guest name and email. The transaction locks the booking row (`FOR UPDATE`) and validates that `clock_timestamp() <= hold_expires_at`. Generates a cryptographically secure 64-character hex token (`crypto.randomBytes(32)`), stores its SHA-256 hash in `manage_token_hash`, clears `hold_expires_at`, and emits `BOOKING_CONFIRMED`.
3. *HELD → EXPIRED*: Occurs automatically when `clock_timestamp() > hold_expires_at`. Any subsequent slot computation or hold creation purges expired records from `active_reservations` in its pre-flight step.
4. *CONFIRMED → RESCHEDULED*: Moves the appointment in a single atomic transaction. The new slot is checked and claimed; if the target slot collides, the entire transaction rolls back and the original booking remains untouched.
5. *CONFIRMED / HELD → CANCELLED*: Deletes the claim from `active_reservations`, sets `status = 'CANCELLED'`, records `cancellation_reason`, and emits `BOOKING_CANCELLED`.

#pagebreak()

// =============================================================================
// PAGE 5: DOUBLE-BOOKING PREVENTION
// =============================================================================
= 4. Double-Booking Prevention & Concurrency Safety

The primary architectural challenge in scheduling platforms is the *check-then-insert race condition*: two concurrent requests inspect availability, both determine that a slot is open, and both insert reservations, exceeding capacity. Slotbook completely eliminates this vulnerability using database engine primitives.

== One-on-One Bookings (Capacity = 1): GiST Range Exclusion

For single-capacity bookings, Slotbook leverages PostgreSQL's `btree_gist` extension to establish a generalized exclusion constraint on the `active_reservations` table:

```sql
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TABLE active_reservations (
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
```

*Why this is mathematically uncheatable*:
- When transaction A and transaction B attempt to reserve overlapping slots, PostgreSQL's GiST index detects the predicate collision (`buffered_range WITH &&`) for the same `host_id`.
- The second transaction is aborted with PostgreSQL error code *`23P01` (`exclusion_violation`)*.
- Buffers are embedded inside the `tstzrange`: `[start_at - buffer_before, end_at + buffer_after)`. Thus, buffer conflicts are prevented at the index level across different event types for the same host.

== Group Bookings (Capacity > 1): Serialized Row-Level Locking

For events accommodating multiple guests (e.g., workshops with capacity = 4), range exclusion cannot be used directly because multiple reservations are permitted in the same interval. Slotbook implements serialized row-level locking:

```sql
-- Step 1: Serialize competing transactions for this event type
SELECT id, host_id, capacity FROM event_types WHERE id = $1 FOR UPDATE;

-- Step 2: Purge stale holds using database time
WITH expired_holds AS (
  UPDATE bookings SET status = 'EXPIRED', updated_at = clock_timestamp()
  WHERE status = 'HELD' AND hold_expires_at <= clock_timestamp() RETURNING id
)
DELETE FROM active_reservations WHERE booking_id IN (SELECT id FROM expired_holds);

-- Step 3: Count active reservations
SELECT count(*) FROM bookings
WHERE event_type_id = $1 AND status IN ('HELD', 'CONFIRMED')
  AND start_at = $2::timestamptz
  AND (hold_expires_at IS NULL OR hold_expires_at > clock_timestamp());

-- Step 4: Insert only if count < capacity, then COMMIT;
```

Under PostgreSQL's `READ COMMITTED` isolation level, the `SELECT ... FOR UPDATE` causes concurrent transactions to queue. When the lock releases, the queued transaction re-reads the updated row, re-executes the count query, observes the committed booking, and halts if capacity is exhausted.

#pagebreak()

// =============================================================================
// PAGE 6: IDEMPOTENCY & FAILURE HANDLING
// =============================================================================
= 5. Idempotency & Network Failure Handling

Network timeouts and retry storms can lead to duplicate reservations. Slotbook implements an `Idempotency-Key` header contract on `POST /api/holds` and safe confirmation retries.

== The Idempotency Contract

#table(
  columns: (1.5fr, 4.5fr),
  fill: (x, y) => if calc.even(y) { rgb("#f8fafc") } else { none },
  stroke: 0.5pt + rgb("#cbd5e1"),
  [*Condition*], [*Behavior & Response Code*],
  [New Request], [Executes transaction, stores request checksum and response JSONB; returns HTTP 201 Created.],
  [Identical Retry], [Matches stored SHA-256 payload hash; replays stored response with `Idempotency-Replay: true` (HTTP 201).],
  [Payload Conflict], [Identical key sent with different parameters; rejects immediately with HTTP 409 Conflict (`IDEMPOTENCY_CONFLICT`).],
  [Concurrent Race], [Two concurrent requests with the identical key hit the unique constraint on `idempotency_keys.key` (`23505`); one succeeds, the other retries or receives 409.]
)

== Sequence Diagram: Identical Retry Scenario

#v(0.1cm)
#align(center)[
  #rect(fill: rgb("#f8fafc"), stroke: 1pt + rgb("#cbd5e1"), radius: 5pt, inset: 6pt, width: 100%)[
    #text(size: 6.8pt, font: "Liberation Mono")[
```
Guest Client                          Next.js API Route                    PostgreSQL 16 Engine
     |                                        |                                      |
     |--- 1. POST /api/holds ---------------->|                                      |
     |    Headers: Idempotency-Key: K1        |--- 2. Hash payload (SHA-256) ------->|
     |    Body: { eventId, startAt: T1 }      |    SELECT FROM idempotency_keys      |
     |                                        |<-- 3. Key K1 Not Found --------------|
     |                                        |--- 4. BEGIN TRANSACTION ------------>|
     |                                        |    INSERT INTO bookings (HELD)       |
     |                                        |    INSERT INTO active_reservations   |
     |                                        |    INSERT INTO idempotency_keys (K1) |
     |                                        |--- 5. COMMIT ----------------------->|
     |                                        |                                      |
     |   [ Network Timeout / Drop ]           |                                      |
     |   (Client assumes request failed)      |                                      |
     |                                        |                                      |
     |--- 6. RETRY: POST /api/holds --------->|                                      |
     |    Headers: Idempotency-Key: K1        |--- 7. Hash payload (SHA-256) ------->|
     |    Body: { eventId, startAt: T1 }      |    SELECT FROM idempotency_keys      |
     |                                        |<-- 8. Stored Payload & Hash Match ---|
     |<-- 9. HTTP 201 Created ----------------|                                      |
     |    Idempotency-Replay: true            |                                      |
     |    Body: { id: B1, status: "HELD" }    |                                      |
```
    ]
  ]
]

#v(0.1cm)
== Safe Confirmation Retries
If a guest double-clicks or retries `POST /api/holds/{id}/confirm`, the service checks if the booking is already in status `CONFIRMED` with the matching guest email. If true, it returns the confirmation payload idempotently without generating a second management token or failing.

#pagebreak()

// =============================================================================
// PAGE 7: TIME-ZONE ARCHITECTURE
// =============================================================================
= 6. Time-Zone Architecture & Daylight Saving Time (DST)

Slotbook implements full IANA time-zone handling via Luxon. The architecture decouples the host's operating calendar from the guest's presentation timezone and database storage.

== Core Invariants

1. *Host IANA Identifier*: Stored as an IANA timezone string (e.g., `Asia/Kolkata`, `America/New_York`).
2. *Local Calendar Evaluation*: Operating windows (`09:00:00`–`17:00:00`) and date overrides are evaluated in the host's local wall clock.
3. *Absolute Database Storage*: All booking instants are converted to UTC and stored in PostgreSQL as `TIMESTAMPTZ`.
4. *Zero Fixed-Offset Arithmetic*: Offsets are never calculated by adding constant integer hours (e.g., `+5.5` or `-5`). All calculations use Luxon's IANA zone engine.

== End-to-End Cross-Timezone Example

#align(center)[
  #rect(fill: rgb("#f8fafc"), stroke: 1pt + rgb("#cbd5e1"), radius: 5pt, inset: 8pt, width: 100%)[
    #grid(
      columns: (1fr, 1fr, 1fr),
      align: (center, center, center),
      [
        #text(weight: "bold", fill: rgb("#4f46e5"))[Host Local Time]\
        #text(size: 7.5pt)[Zone: `Asia/Kolkata` (IST)]\
        #v(0.05cm)
        *Friday, 09:30 AM IST*\
        Evaluated against Mon–Fri\
        09:00–12:00 availability rule
      ],
      [
        #text(weight: "bold", fill: rgb("#059669"))[PostgreSQL Storage]\
        #text(size: 7.5pt)[Type: `TIMESTAMPTZ` (UTC)]\
        #v(0.05cm)
        *`2026-11-06T04:00:00.000Z`*\
        Universal instant stored\
        without ambiguity
      ],
      [
        #text(weight: "bold", fill: rgb("#2563eb"))[Guest Browser Time]\
        #text(size: 7.5pt)[Zone: `America/New_York` (EST)]\
        #v(0.05cm)
        *Thursday, 11:00 PM EST*\
        Rendered seamlessly\
        in guest's calendar
      ]
    )
  ]
]

== Daylight Saving Time (DST) Policies

#table(
  columns: (2fr, 4fr),
  fill: (x, y) => if calc.even(y) { rgb("#f8fafc") } else { none },
  stroke: 0.5pt + rgb("#cbd5e1"),
  [*DST Transition Event*], [*Slotbook Resolution Policy & Implementation*],
  [Spring-Forward Gap (Nonexistent local wall clock)], [
    In `America/New_York`, clocks skip from 02:00 to 03:00 on the second Sunday in March. Times such as 02:30 do not exist.
    *Policy*: `isValidWallTime()` tests roundtrip fidelity. If Luxon shifts the requested hour/minute to accommodate the gap, the time is rejected and excluded from generated slots.
  ],
  [Fall-Back Overlap (Ambiguous local wall clock)], [
    On the first Sunday in November, clocks fall back from 02:00 EDT to 01:00 EST. The hour 01:00–01:59 occurs twice.
    *Policy*: Resolved consistently according to standard IANA rules to Standard Time (UTC-5, offset -300 minutes). All API responses emit ISO-8601 UTC strings with `Z`, preventing downstream ambiguity.
  ]
)

#pagebreak()

// =============================================================================
// PAGE 8: API ARCHITECTURE
// =============================================================================
= 7. REST API Architecture & Endpoints

All endpoints emit and accept JSON, enforce runtime Zod validation, return standard HTTP status codes, and output structured error objects: `{ "error": { "code": "...", "message": "..." } }`.

#table(
  columns: (1fr, 2.5fr, 2.5fr),
  fill: (x, y) => if y == 0 { rgb("#e0e7ff") } else if calc.even(y) { rgb("#f8fafc") } else { none },
  stroke: 0.5pt + rgb("#cbd5e1"),
  table.header([*Method*], [*Endpoint*], [*Purpose & Validation*]),
  [`GET`], [`/api/hosts/{host}/events/{slug}/slots`], [Generates available slots for next 30 days in guest timezone `?tz=...`],
  [`POST`], [`/api/holds`], [Places 5-minute hold on slot; supports `Idempotency-Key` header.],
  [`POST`], [`/api/holds/{id}/confirm`], [Confirms held slot with guest name & email; issues management token.],
  [`POST`], [`/api/bookings/{token}/reschedule`], [Atomically moves confirmed booking to new `newStartAt` ISO timestamp.],
  [`POST`], [`/api/bookings/{token}/cancel`], [Cancels appointment with optional reason; frees active reservation claim.],
  [`GET`], [`/api/health`], [System health check probing database connection and `clock_timestamp()`.]
)

== Endpoint Specification & Payloads

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  [
    *Create Temporary Hold*
    ```http
    POST /api/holds HTTP/1.1
    Content-Type: application/json
    Idempotency-Key: 7b9d5c41-8c82-4f51-b847-1930129bc481

    {
      "eventTypeId": "49d1390c-5a88-4d63-bf28...",
      "startAt": "2026-11-10T04:00:00.000Z"
    }
    ```
    ```http
    HTTP/1.1 201 Created
    Content-Type: application/json

    {
      "id": "c1f7b029-4501-4be6-a97e-128919db450a",
      "status": "HELD",
      "holdExpiresAt": "2026-11-10T04:05:00.000Z"
    }
    ```
  ],
  [
    *Confirm Hold & Receive Token*
    ```http
    POST /api/holds/c1f7b029.../confirm HTTP/1.1
    Content-Type: application/json

    {
      "guestName": "Sarah Connor",
      "guestEmail": "sarah@example.com"
    }
    ```
    ```http
    HTTP/1.1 200 OK
    Content-Type: application/json

    {
      "id": "c1f7b029-4501-4be6-a97e-128919db450a",
      "status": "CONFIRMED",
      "manageToken": "9e3c9217e573a4b9c1d6...",
      "manageUrl": "/bookings/9e3c9217e573..."
    }
    ```
  ]
)

#pagebreak()

// =============================================================================
// PAGE 9: DOCKER DEPLOYMENT ARCHITECTURE
// =============================================================================
= 8. Docker Deployment Architecture

The application is containerized using a clean, reproducible multi-container topology orchestrating PostgreSQL 16 Alpine and the Next.js production runtime.

#v(0.15cm)
#align(center)[
  #rect(fill: rgb("#f8fafc"), stroke: 1pt + rgb("#cbd5e1"), radius: 5pt, inset: 6pt, width: 100%)[
    #text(size: 6.8pt, font: "Liberation Mono")[
```
Host Machine (Windows 11 / WSL 2 Arch Linux)
  |
  +--- Port 3000 (HTTP Browser Traffic)
  +--- Port 5433 (PostgreSQL Host Exposure - prevents local 5432 collision)
  |
  v
Docker Engine / Docker Compose (Network: slotbooking_default)
  |
  +-------------------------------------+-------------------------------------+
  |                                     |                                     |
  v                                     v
Service: app                          Service: postgres
Container: slotbook-app               Container: slotbook-postgres
Image: slotbooking-app (node:20-alpine)Image: postgres:16-alpine
  |                                     |
  |-- 1. Wait for DB readiness          |-- 1. Init cluster: slotbook
  |-- 2. Run raw migrations (db:migrate)|-- 2. Healthcheck: pg_isready
  |-- 3. Run seed data (db:seed)        |-- 3. Port: 5432 (Internal)
  |-- 4. Start Next.js (port 3000)      |-- 4. Volume: pgdata (Persistent)
  |                                     |
  +<----- Internal TCP Connection ------+
          DATABASE_URL=postgresql://postgres:postgres@postgres:5432/slotbook
```
    ]
  ]
]

#v(0.15cm)
== Container Specifications & Lifecycle Coordination

#table(
  columns: (1.5fr, 1.2fr, 3.3fr),
  fill: (x, y) => if y == 0 { rgb("#e0e7ff") } else if calc.even(y) { rgb("#f8fafc") } else { none },
  stroke: 0.5pt + rgb("#cbd5e1"),
  [*Service*], [*Base Image*], [*Responsibilities & Configuration*],
  [`postgres`], [`postgres:16-alpine`], [
    - Runs PostgreSQL 16 engine with internal port `5432`.
    - Host port mapped to `${POSTGRES_PORT:-5433}:5432` to avoid host collisions.
    - Persistent volume `pgdata` mounted at `/var/lib/postgresql/data`.
    - Health check executes `pg_isready -U postgres -d slotbook` every 3s.
  ],
  [`app`], [`node:20-alpine`], [
    - Multi-stage build (`deps` → `builder` → `runner`).
    - Depends on `postgres` with condition `service_healthy`.
    - `docker-entrypoint.sh` coordinates migration execution, database seeding, and production server boot.
  ]
)

#pagebreak()

// =============================================================================
// PAGE 10: TESTING & RELIABILITY EVIDENCE
// =============================================================================
= 9. Automated Testing & Reliability Evidence

Slotbook's test suite operates directly against a real PostgreSQL instance to verify engine-level invariants. In-memory databases or mocks are deliberately avoided.

== Test Suite Execution Results (`npm test`)

```text
 RUN  v2.1.9 /home/tirum/Cluster/slotbooking

 ✓ tests/concurrency.test.ts (9 tests) 621ms
   ✓ Test 1 — Concurrent booking: 20 requests for capacity=1 slot -> exactly 1 succeeds (409 on 19)
   ✓ Test 2 — Group capacity: 20 requests for capacity=3 slot -> exactly 3 succeed (409 on 17)
   ✓ Test 3 — Idempotency: duplicate key replays original result; different payload returns 409
   ✓ Test 4 — Expired hold: expired hold frees capacity and allows replacement reservation
   ✓ Test 5 — Confirmation race: booking cannot transition to confirmed after DB expiry
   ✓ Test 6 — Rescheduling: moves reservation atomically; collision leaves original booking intact
   ✓ Test 7 — Time zones: Asia/Kolkata conversion & America/New_York DST transitions
 ✓ tests/api.test.ts (1 test) 63ms
   ✓ handles full lifecycle: hold -> confirm -> reschedule -> cancel with outbox events

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Duration  1.59s (transform 71ms, tests 684ms)
```

== Evidence of Double-Booking Protection

#table(
  columns: (1.5fr, 1.2fr, 3.3fr),
  fill: (x, y) => if y == 0 { rgb("#e0e7ff") } else if calc.even(y) { rgb("#f8fafc") } else { none },
  stroke: 0.5pt + rgb("#cbd5e1"),
  [*Test Scenario*], [*Load*], [*Actual Verified Invariant*],
  [Capacity = 1 Concurrency], [20 parallel calls], [*Exactly 1* reservation created; 19 rejected with 409 (`SLOT_NOT_AVAILABLE`). Verified via database count queries on `bookings` and `active_reservations`.],
  [Group Capacity = 3], [20 parallel calls], [*Exactly 3* reservations created; 17 rejected with 409. Confirmed row count = 3 in PostgreSQL.],
  [Idempotent Replay], [Same key + payload], [Returns identical reservation payload with `isIdempotentReplay: true`. Database record count remains 1.],
  [Reschedule Collision], [Overlap target slot], [Target collision throws 409; original booking remains `CONFIRMED` at original start time.]
)

== Known Limitations & Future Enhancements

1. *Asynchronous Outbox Dispatcher*: Events are currently staged in `notification_outbox` in the same transaction as state changes. A decoupled background daemon can consume records with `LISTEN/NOTIFY` to dispatch external emails via SendGrid or SES.
2. *External Calendar Integration*: Bi-directional synchronization with Google Calendar or Microsoft Outlook via Webhooks can be connected into outbox state changes without modifying core reservation invariants.
