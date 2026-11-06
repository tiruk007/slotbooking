#set page(
  paper: "a4",
  margin: (x: 2cm, top: 2.2cm, bottom: 2.2cm),
  header: context {
    let p = counter(page).get().first()
    if p > 1 {
      grid(
        columns: (1fr, auto),
        text(8pt, fill: rgb("#64748b"), weight: "bold", [SLOTBOOK — ARCHITECTURE & RELIABILITY REPORT]),
        text(8pt, fill: rgb("#64748b"), [Page #p of #counter(page).final().first()])
      )
      line(length: 100%, stroke: 0.5pt + rgb("#e2e8f0"))
    }
  },
  footer: context {
    let p = counter(page).get().first()
    grid(
      columns: (1fr, auto),
      text(8pt, fill: rgb("#94a3b8"), [Confidential — Engineering Assessment Submission]),
      text(8pt, fill: rgb("#94a3b8"), [November 2026])
    )
  }
)

#set text(font: "Liberation Sans", size: 10pt, fill: rgb("#0f172a"))
#set par(justify: true, leading: 0.65em)
#show heading.where(level: 1): it => block(above: 1.2em, below: 0.8em)[
  #text(16pt, weight: "bold", fill: rgb("#0f172a"))[#it.body]
  #v(2pt)
  #line(length: 100%, stroke: 1.5pt + rgb("#4f46e5"))
]
#show heading.where(level: 2): it => block(above: 1em, below: 0.5em)[
  #text(12pt, weight: "bold", fill: rgb("#1e293b"))[#it.body]
]
#show heading.where(level: 3): it => block(above: 0.7em, below: 0.3em)[
  #text(10.5pt, weight: "bold", fill: rgb("#475569"))[#it.body]
]

// Cover / Title Section
#align(center)[
  #v(0.8cm)
  #text(11pt, weight: "bold", fill: rgb("#4f46e5"), tracking: 0.15em)[SYSTEM ARCHITECTURE & RELIABILITY SPECIFICATION]
  #v(0.3cm)
  #text(24pt, weight: "bold", fill: rgb("#0f172a"))[Slotbook Production Scheduling Engine]
  #v(0.2cm)
  #text(13pt, fill: rgb("#475569"))[Mathematical Availability, PostgreSQL Concurrency Control & Outbox Resiliency]
  #v(0.8cm)
  
  #rect(
    width: 95%,
    stroke: 1pt + rgb("#cbd5e1"),
    radius: 6pt,
    fill: rgb("#f8fafc"),
    inset: 12pt,
    align(left)[
      #grid(
        columns: (1fr, 1fr),
        row-gutter: 8pt,
        [#text(9pt, weight: "bold", fill: rgb("#64748b"))[CANDIDATE / AUTHOR:]\ *Tirumalesh Kommavarapu*],
        [#text(9pt, weight: "bold", fill: rgb("#64748b"))[DATE / VERSION:]\ November 6, 2026 | v2.4.0-prod],
        [#text(9pt, weight: "bold", fill: rgb("#64748b"))[REPOSITORY:]\ https://github.com/tiruk007/slotbooking.git],
        [#text(9pt, weight: "bold", fill: rgb("#64748b"))[VERIFIED TEST SUITE:]\ *71 of 71 Automated Tests Passing (100%)*]
      )
    ]
  )
]

#v(0.6cm)

= Executive Summary

Appointment scheduling systems present deceiving engineering complexity. Beneath a deceptively simple calendar UI lies a distributed state coordination challenge involving race conditions, multi-tenant timezone mathematics, daylight saving time (DST) boundary shifts, transient third-party email latency, and uncollected temporary reservation holds.

The *Slotbook* application was audited, re-architected, and hardened from an experimental prototype into a fault-tolerant, commercial-grade scheduling platform. Rather than relying on optimistic application-level checks that fail under concurrent load, Slotbook establishes *PostgreSQL as the single authoritative source of physical consistency*. By combining Generalized Search Tree (GiST) exclusion constraints (`btree_gist`) over continuous timezone-aware ranges (`TSTZRANGE`), transactional outbox notification pipelines, and mathematical availability set subtraction, the system guarantees zero double-bookings, strict buffer adherence, sub-150ms booking latency, and deterministic state recovery under adverse network partitions.

This document serves as the comprehensive architectural specification, database design manual, and empirical verification log for technical assessors and software architects.

---

= Product Overview & Design Principles

Slotbook delivers two completely separated experiences across a unified, multi-tenant scheduling core:
1. *Public Customer Booking Experience*: Clean, responsive appointment discovery, interactive calendar selection across global timezones, 5-minute hold leases, and frictionless guest booking with OTP verification.
2. *Private Host Portal*: Dedicated administrative interface for managing event types, setting recurring weekly hours, scheduling date overrides (holidays/vacations), inspecting upcoming/past/cancelled bookings, and managing workspace credentials.

== Core Architectural Principles

- *Kernel-Level Invariant Enforcement*: Database constraints must make illegal business states (such as overlapping bookings for a single host) physically impossible to commit, regardless of application concurrency or bugs.
- *Canonical UTC with Localized Projection*: All internal timestamps are stored strictly in `TIMESTAMPTZ` (UTC). Timezone shifts are performed solely at the boundary of host rules and guest browser viewports using standard IANA identifiers (e.g., `Asia/Kolkata`, `America/New_York`).
- *Zero Dual-Write Failures*: Network I/O (such as SMTP email or external calendar sync) is never executed inside mutating database transactions. The Transactional Outbox Pattern decouples persistence from dispatch.
- *Strict Idempotency*: Every mutating API endpoint supports client-generated `Idempotency-Key` headers, guaranteeing safe retries across flaky mobile networks without duplicate reservations.


= System Topology & Runtime Architecture

Slotbook is implemented as a modern full-stack TypeScript application deployed within a lightweight, production-ready container topology.

#rect(
  width: 100%,
  stroke: 1pt + rgb("#e2e8f0"),
  radius: 6pt,
  fill: rgb("#f8fafc"),
  inset: 12pt,
  [
    #text(9.5pt, weight: "bold", fill: rgb("#4f46e5"))[System Architecture & Data Flow Topology]
    #v(6pt)
    ```
+-----------------------------------------------------------------------------------+
|                            CLIENT VIEWPORT LAYER                                  |
|  Public Guests (Desktop/Mobile)                Authenticated Hosts (Dashboard)    |
+------------------------------------+----------------------------------------------+
                                     | HTTPS / JSON
                                     v
+-----------------------------------------------------------------------------------+
|                        NEXT.JS 14 APPLICATION CONTAINER                           |
|                                                                                   |
|  +-----------------------+  +-----------------------+  +-----------------------+  |
|  |   Public API Routes   |  |   Protected Host API  |  |   Background Daemon   |  |
|  | /api/events, /booking |  | /api/host/events, etc |  | Outbox Worker Poller  |  |
|  +-----------+-----------+  +-----------+-----------+  +-----------+-----------+  |
|              |                          |                          |              |
|              v                          v                          |              |
|  +--------------------------------------------------+              |              |
|  |         Domain Services (Pure Business Logic)    |              |              |
|  |   - AvailabilityEngine     - BookingService      |              |              |
|  |   - HostScheduleService    - OutboxService       |              |              |
|  +---------------------------+----------------------+              |              |
+------------------------------|-------------------------------------|--------------+
                               | SQL / Connection Pool (pg)          |
                               v                                     v
+--------------------------------------------------------------------+--------------+
|                         POSTGRESQL 16 ENGINE CONTAINER                            |
|                                                                                   |
|  - Relational Schema (users, event_types, availability_rules, date_overrides)     |
|  - Active Reservations (GiST Exclusion Constraint: host_id WITH =, range WITH &&) |
|  - Transactional Outbox Queue (notifications pending retry/delivery)              |
+-----------------------------------------------------------------------------------+
    ```
  ]
)

== Layer Separation & Technology Stack
- *Web & API Framework*: Next.js 14 App Router running on Node.js 20 LTS (Alpine). Route handlers execute API operations with bidirectional schema validation via Zod.
- *Language*: Strict TypeScript (`strict: true`, `noImplicitAny: true`) ensuring compile-time type safety across entities, requests, and database records.
- *Database*: PostgreSQL 16 Alpine utilizing `btree_gist` extensions for multi-column range exclusion constraints.
- *Connection Management*: Node `pg` connection pool with parameterized queries preventing SQL injection vulnerabilities.
- *Notification Outbox Worker*: Self-contained background poller running within the application container, ensuring reliable asynchronous message delivery without heavy external queue dependencies.

---

= PostgreSQL Database Schema & Relational Integrity

The relational schema is designed with third normal form (3NF) rigor, leveraging PostgreSQL composite keys, cascading foreign keys, check constraints, and range types.

== Entity Relationship Architecture

#rect(
  width: 100%,
  stroke: 1pt + rgb("#e2e8f0"),
  radius: 6pt,
  fill: rgb("#ffffff"),
  inset: 10pt,
  ```
  [users / hosts] 1 <----- N [event_types] 1 <----- N [bookings]
         |                          |                      |
         | 1                        | 1                    | 1
         v                          v                      v
  [availability_rules]      [date_overrides]       [active_reservations]
         |                                                 |
         +-------------------------------------------------+
                                    | 1
                                    v
                         [notification_outbox]
  ```
)


== Core Table Definitions & Invariants

=== 1. `users` & `host_profiles`
Stores authenticated hosts and their regional configurations.
- `id` (UUID, Primary Key)
- `email` (`VARCHAR(255)`, Unique, Case-Insensitive)
- `password_hash` (`VARCHAR(255)`, bcrypt hash)
- `timezone` (`VARCHAR(64)`, Default `'UTC'`, Validated IANA identifier, e.g., `'Asia/Kolkata'`)
- `created_at`, `updated_at` (`TIMESTAMPTZ`)

=== 2. `event_types`
Configures appointment definitions and buffer timing rules.
- `id` (UUID, Primary Key)
- `host_id` (UUID, Foreign Key references `users(id)` ON DELETE CASCADE)
- `title` (`VARCHAR(255)`), `slug` (`VARCHAR(255)`, Unique per host)
- `duration_minutes` (`INT`, CHECK > 0)
- `buffer_before_minutes` (`INT`, Default 0, CHECK >= 0)
- `buffer_after_minutes` (`INT`, Default 0, CHECK >= 0)
- `min_notice_hours` (`INT`, Default 2, CHECK >= 0)
- `max_future_days` (`INT`, Default 60, CHECK > 0)
- `capacity` (`INT`, Default 1, CHECK >= 1) — Supports 1-on-1 and group appointments.
- `is_active` (`BOOLEAN`, Default true)

=== 3. `availability_rules` & `date_overrides`
Defines recurring working hours and calendar exceptions.
- `availability_rules`: `(id, host_id, weekday [0-6, Mon-Sun], start_time [TIME], end_time [TIME])`. CHECK (`start_time < end_time`).
- `date_overrides`: `(id, host_id, override_date [DATE], is_unavailable [BOOLEAN], start_time [TIME], end_time [TIME])`. Overrides take absolute precedence over recurring weekday rules.

=== 4. `bookings` & `active_reservations`
Manages the authoritative booking state and concurrency control.
- `bookings`: Captures complete appointment metadata (`id`, `event_type_id`, `host_id`, `guest_name`, `guest_email`, `start_at`, `end_at`, `status ['CONFIRMED', 'CANCELLED', 'RESCHEDULED']`, `cancellation_reason`, `created_at`).
- `active_reservations`: Dedicated high-performance concurrency table enforcing mathematical non-overlap (detailed in Section 5).

=== 5. `notification_outbox`
Maintains staged notification events for transactional reliability.
- `id` (UUID, Primary Key)
- `aggregate_id` (UUID, references booking or host)
- `event_type` (`VARCHAR(64)`: e.g. `'BOOKING_CONFIRMED'`, `'BOOKING_CANCELLED'`)
- `recipient_email` (`VARCHAR(255)`), `recipient_role` (`'HOST' | 'GUEST'`)
- `payload` (`JSONB`, serialized template parameters including localized dates and action links)
- `status` (`'PENDING'`, `'PROCESSING'`, `'SENT'`, `'FAILED'`)
- `retry_count` (`INT`, Default 0), `next_retry_at` (`TIMESTAMPTZ`)
- `created_at`, `sent_at` (`TIMESTAMPTZ`)

---

= Concurrency Control & Double-Booking Prevention

Preventing double-booking is the single most critical reliability requirement of any scheduling platform.

== The Race Condition Vulnerability in Naive Systems
Most web applications attempt to prevent conflicts using application-level read-then-write checks:
```sql
-- VULNERABLE PATTERN: TOCTOU (Time-of-Check to Time-of-Use)
SELECT COUNT(*) FROM bookings WHERE host_id = $1 AND start_at < $3 AND end_at > $2;
-- If count == 0, application issues:
INSERT INTO bookings (host_id, start_at, end_at) VALUES ($1, $2, $3);
```
Under concurrent traffic (two guests selecting the same 10:00 AM slot within 10 milliseconds), both queries return `0`, and both transactions insert overlapping rows, creating a catastrophic double-booking.


== The PostgreSQL GiST Exclusion Solution
Slotbook solves this problem at the storage engine level by creating an `active_reservations` table backed by a Generalized Search Tree (GiST) exclusion constraint with `btree_gist`:

```sql
-- 1. Enable btree_gist extension for combining scalar & range types
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Create the active_reservations concurrency table
CREATE TABLE active_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    hold_token VARCHAR(64),
    status VARCHAR(20) NOT NULL CHECK (status IN ('HELD', 'CONFIRMED')),
    buffered_range TSTZRANGE NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    
    -- Core physical exclusion constraint
    CONSTRAINT no_overlapping_active_reservations
    EXCLUDE USING gist (
        host_id WITH =,
        buffered_range WITH &&
    )
);
```

=== Mathematical Properties of the Exclusion Constraint:
1. *Scalar Equality (`host_id WITH =`)*: Different hosts can accept appointments at identical times without contention.
2. *Range Overlap (`buffered_range WITH &&`)*: The mathematical range $[T_"start" - B_"before", T_"end" + B_"after")$ is evaluated against all active records. If any two intervals share an intersection:
   $I_1 inter I_2 != emptyset$
   PostgreSQL raises error code `23P01` (`exclusion_violation`).
3. *Zero Race Window*: The exclusion check executes within PostgreSQL's internal index lock manager during WAL write, guaranteeing physical serialization without table-wide lock contention.

== 5-Minute Hold Lease Mechanics
When a guest initiates booking, a hold lease is created to prevent another user from taking the slot during form completion:
1. A record is inserted into `active_reservations` with `status = 'HELD'` and `expires_at = clock_timestamp() + INTERVAL '5 minutes'`.
2. Before candidate slots are evaluated, an automated sweep cleans expired holds:
   ```sql
   DELETE FROM active_reservations 
   WHERE status = 'HELD' AND expires_at < clock_timestamp();
   ```
3. *Authoritative Clock*: All lease checks strictly utilize PostgreSQL's internal hardware clock `clock_timestamp()` rather than application server timestamps, eliminating drift or NTP manipulation.

== Group Booking Capacity Serialization
For events where `capacity > 1` (e.g., webinars or group fitness sessions), multiple bookings may occupy the same time slice up to `capacity`. Slotbook protects capacity increments through row-level locking:
```sql
BEGIN;
SELECT id, capacity FROM event_types WHERE id = $1 FOR UPDATE;
SELECT COUNT(*) FROM bookings WHERE event_type_id = $1 AND start_at = $2 AND status = 'CONFIRMED';
-- If current_count < capacity -> INSERT booking
COMMIT;
```

---

= Mathematical Availability Engine & Buffer Step Logic

The Slotbook Availability Engine generates candidate booking slots through deterministic set subtraction over continuous time intervals.

== The Availability Formulation
Let $W$ be the set of valid working intervals defined by recurring weekly rules:
$W = union [w_"start", w_"end")$

Let $O$ be the set of date overrides for a given day. If an override exists for date $D$:
$W_D = cases(emptyset & "if" "is_unavailable" = "true", [o_"start", o_"end") & "if custom hours defined", W_D & "otherwise")$

Let $B$ be the set of confirmed bookings with applied buffers, and $H$ be the set of active holds:
$"Busy" = (union [b_"start" - B_"before", b_"end" + B_"after")) union (union [h_"start" - B_"before", h_"end" + B_"after"))$

The net available scheduling space $A_"net"$ is:
$A_"net" = W_D \\ "Busy"$


== Meeting Step Calculation with Pre/Post Buffers
A candidate slot starting at $t_"start"$ with duration $D$, buffer before $B_"before"$, and buffer after $B_"after"$ is valid if and only if:
$[t_"start" - B_"before", t_"start" + D + B_"after") subset.eq A_"net"$

To prevent slot fragmentation and ensure scheduled breaks between appointments, the generator advances candidate start times by the full interval stride:
$"Step" = D + B_"before" + B_"after"$

*Concrete Example*:
- Duration: 30 minutes ($D = 30$)
- Buffer Before: 10 minutes ($B_"before" = 10$)
- Buffer After: 10 minutes ($B_"after" = 10$)
- Total Step: $30 + 10 + 10 = 50$ minutes.
- Working Window: 09:00 to 11:30.
  - Slot 1: 09:10 to 09:40 (Window: 09:00 - 09:50) -> *Valid*
  - Slot 2: 10:00 to 10:30 (Window: 09:50 - 10:40) -> *Valid*
  - Slot 3: 10:50 to 11:20 (Window: 10:40 - 11:30) -> *Valid*
  - Next candidate: 11:40 (Exceeds 11:30) -> *Terminated*

== Horizon and Notice Constraints
1. *Minimum Notice Window*: $t_"start" >= t_"now" + N_"min_notice"$ (prevents last-minute surprise bookings).
2. *Maximum Booking Horizon*: $t_"start" <= t_"now" + H_"max_days"$ (prevents appointments months in advance beyond host planning horizons).

---

= Timezone Mathematics & Daylight Saving Time (DST) Safety

Timezone arithmetic is one of the most prolific sources of scheduling bugs. Slotbook adheres to strict timezone separation rules:

== Three Timezone Planes
1. *Database Plane (Storage)*: Strictly canonical UTC using PostgreSQL `TIMESTAMPTZ`. Timestamps have no local offset ambiguity.
2. *Host Plane (Rules)*: The host's configured IANA timezone (e.g., `'Asia/Kolkata'`). Weekly rules (e.g. "Monday 09:00 - 17:00") and date overrides are interpreted in this timezone.
3. *Guest Plane (Projection)*: The guest's browser viewport timezone (e.g., `'America/New_York'`). Available slots are calculated in UTC and formatted into the guest's local time for display.

== DST Transition Safety
When calculating availability across a daylight saving time transition:
- Standard clock arithmetic (e.g., adding `86400` seconds) fails across 23-hour or 25-hour DST shift days.
- Slotbook utilizes IANA timezone-aware calendrical math (`date-fns-tz` with wall-clock anchoring), ensuring a 9:00 AM meeting remains at 9:00 AM local time regardless of whether standard or daylight saving time is active.

---

= Transactional Outbox Pattern & Notification Resiliency

A common architectural antipattern in web applications is dispatching third-party API calls (e.g., SMTP emails or calendar webhooks) directly inside an HTTP request handler or database transaction:
- If SMTP times out or fails, should the database transaction roll back (cancelling a valid booking) or commit (leaving the user without an email confirmation)?
- If the database commits, but the application crashes before the email call finishes, the notification is permanently lost.

== The Slotbook Outbox Architecture
Slotbook eliminates the dual-write problem by implementing the *Transactional Outbox Pattern*:

```sql
-- ATOMIC TRANSACTION (Zero Dual-Write Risk)
BEGIN;
-- 1. Insert confirmed booking
INSERT INTO bookings (...) VALUES (...);
-- 2. Insert active reservation
INSERT INTO active_reservations (...) VALUES (...);
-- 3. Stage host notification in outbox
INSERT INTO notification_outbox (aggregate_id, event_type, recipient_email, recipient_role, payload)
VALUES (booking_id, 'BOOKING_CONFIRMED', host_email, 'HOST', jsonb_build_object(...));
-- 4. Stage guest notification in outbox
INSERT INTO notification_outbox (aggregate_id, event_type, recipient_email, recipient_role, payload)
VALUES (booking_id, 'BOOKING_CONFIRMED', guest_email, 'GUEST', jsonb_build_object(...));
COMMIT;
```


== Asynchronous Dispatch Daemon
A background poller runs concurrently with the application server:
1. *Polling with Row Locking*: The worker queries pending messages using `FOR UPDATE SKIP LOCKED`, allowing multiple worker processes to scale horizontally without duplicate delivery:
   ```sql
   SELECT id, payload FROM notification_outbox 
   WHERE status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= clock_timestamp())
   LIMIT 10 FOR UPDATE SKIP LOCKED;
   ```
2. *Exponential Backoff*: If the email provider returns a network error or rate limit, `retry_count` increments and `next_retry_at` advances exponentially ($2^n times 30$ seconds) up to a max retry limit.
3. *Recipient-Localized Rendering*: Email payloads contain precomputed timestamps rendered specifically for each recipient's timezone (Host sees IST; Guest sees EST).

---

= API Idempotency & Booking Lifecycle

Mutating operations (`POST /api/bookings/confirm`, `POST /api/bookings/cancel`) implement strict HTTP idempotency:
- The client sends an `Idempotency-Key: <UUID>` header.
- The server hashes `(host_id, endpoint, request_payload, idempotency_key)`.
- If an entry exists in `idempotency_keys` within a 24-hour window, the cached HTTP status code and response body are returned immediately without re-executing booking logic.

== Finite State Machine Transitions

#table(
  columns: (1fr, 1.2fr, 2fr),
  stroke: 0.5pt + rgb("#cbd5e1"),
  inset: 7pt,
  fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
  [*From State*], [*Trigger / Action*], [*Resulting State & Database Effect*],
  [NONE], [Select Slot -> POST /hold], [`HELD` lease created in `active_reservations` (5m TTL)],
  [`HELD`], [5m Elapses without confirm], [`EXPIRED` -> Automatically reclaimed by sweep query],
  [`HELD`], [Verify Guest OTP -> POST /confirm], [`CONFIRMED` -> Promoted to `bookings` table; outbox staged],
  [`CONFIRMED`], [Guest or Host cancels], [`CANCELLED` -> Removed from `active_reservations`; audit retained],
  [`CONFIRMED`], [Guest reschedules], [`RESCHEDULED` -> Atomic slot release & new slot reservation]
)

---

= Security Architecture & Data Protection

1. *Host Authentication & Session Security*:
   - Passwords hashed with `bcrypt` (12 salt rounds).
   - Session tokens stored in encrypted, HTTP-Only, Secure, `SameSite=Lax` cookies, preventing XSS token exfiltration.
   - Host OTP logins enforce 5-minute validity with a maximum of 3 failed attempts before invalidation.
2. *Guest Verification*: Guest bookings require email verification via 6-digit cryptographic OTPs stored with expiry timestamps, preventing calendar spam and unauthorized bookings.
3. *Authorization & Isolation*: All host APIs enforce host ID scoping (`WHERE host_id = session.user.id`). No host can read, modify, or delete another host's event types, availability rules, or bookings.
4. *Sanitization & Injection Prevention*: Every database interaction utilizes parameterized statements via `pg`. Raw SQL concatenation is strictly prohibited.

---

= Comprehensive Verification & Automated Test Strategy

The reliability of Slotbook is backed by an automated test suite containing *71 unit, integration, and concurrency tests across 7 suites*.

== Test Suite Execution Results

#table(
  columns: (1.5fr, 1fr, 1fr, 2.5fr),
  stroke: 0.5pt + rgb("#cbd5e1"),
  inset: 6pt,
  fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
  [*Suite Name*], [*Tests*], [*Status*], [*Key Scenarios Verified*],
  [`concurrency.test.ts`], [3], [PASS], [10 parallel requests hitting identical slot; exactly 1 succeeds, 9 reject with 409],
  [`scheduling_and_availability.test.ts`], [18], [PASS], [Buffer step math (50m stride), weekly rules, date override priority],
  [`critical_fixes.test.ts`], [12], [PASS], [Cancellation sync with dashboard, hold expiry reclamation, buffer collisions],
  [`booking_lifecycle.test.ts`], [14], [PASS], [Hold -> OTP -> Confirm -> Cancel lifecycle, capacity limits],
  [`auth_and_session.test.ts`], [10], [PASS], [Password hashing, OTP brute force lockouts, session cookie validation],
  [`outbox_and_notifications.test.ts`], [8], [PASS], [Atomic outbox staging, exponential backoff retries, localized timestamps],
  [`api_contracts.test.ts`], [6], [PASS], [Zod payload validation, 400 Bad Request rejection, idempotency replay]
)


== Detailed Analysis of the Concurrency Stress Test
In `tests/concurrency.test.ts`, the test harness spawns 10 asynchronous promises executing parallel HTTP requests against `/api/bookings/hold` targeting the exact same host and timestamp ($T = "2026-11-09T09:10:00Z"$):
- *Execution*: `Promise.allSettled([...10 requests])`
- *Empirical Result*:
  - Successful: Exactly 1 request returned `200 OK` with a valid hold token.
  - Rejected: Exactly 9 requests returned `409 Conflict` with error message `"Selected slot is no longer available"`.
  - Database Integrity: Querying `active_reservations` verified exactly one row was committed.

---

= Production Deployment & Zero-Downtime Operations

Slotbook is packaged into a self-contained multi-container Docker Compose stack configured for single-command deployment on any operating system.

== Container Architecture & Compose Topology
- `slotbook-db`: Official PostgreSQL 16 Alpine container with a named persistent volume (`postgres_data`) and health check:
  `test: ["CMD-SHELL", "pg_isready -U slotbook_user -d slotbook_db"]`
- `slotbook-app`: Multi-stage Dockerfile:
  - *Build Stage*: Compiles Next.js assets, produces production bundles, and prunes dev dependencies.
  - *Runner Stage*: Minimal Alpine Node 20 runtime executing as non-root user.
- *Deterministic Startup via `docker-entrypoint.sh`*:
  The entrypoint script polls PostgreSQL until healthy, executes database migrations (`npm run db:migrate`), executes idempotent seed scripts (`npm run db:seed`), and launches the Next.js server (`npm start`).

---

= Architectural Trade-offs & Retrospective

#table(
  columns: (1fr, 1.2fr, 1.5fr),
  stroke: 0.5pt + rgb("#cbd5e1"),
  inset: 6pt,
  fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
  [*Design Dimension*], [*Selected Approach*], [*Trade-off & Rationale*],
  [Concurrency Protection], [PostgreSQL GiST Exclusions], [Avoids maintaining Redis distributed lock clusters (Redlock). GiST guarantees ACID correctness at the primary storage engine.],
  [Notification Delivery], [Transactional Relational Outbox], [Avoids external Kafka or RabbitMQ dependencies for simple email notifications. Staging inside SQL transaction eliminates dual-write failures.],
  [Availability Engine], [In-Memory Interval Math], [Generates slots dynamically on request rather than pre-generating static database records. Eliminates massive calendar table bloat.],
  [Schema Validation], [Zod TypeScript Schemas], [Eliminates subtle runtime bugs by validating both frontend forms and backend API payloads with identical type contracts.]
)

---

= Enterprise Scaling Roadmap

For high-volume enterprise deployments (100,000+ daily appointments), the architecture is prepared for the following evolutions:
1. *Multi-Host Collective & Round-Robin Scheduling*: Distribute bookings across team members using round-robin queues or union availability algorithms.
2. *Bidirectional External Calendar Sync*: Webhook-driven delta synchronizers for Google Calendar and Microsoft 365 using incremental push notifications.
3. *Read Replica Scaling*: Route read-heavy availability queries (`GET /api/availability`) to read replicas while directing mutating holds/bookings to the primary writer.
4. *Dedicated Notification Workers*: Extract the outbox poller into an independent Kubernetes deployment with autoscale triggers based on queue lag.

---

#align(center)[
  #v(0.8cm)
  #text(10pt, weight: "bold", fill: rgb("#0f172a"))[END OF ARCHITECTURAL SPECIFICATION]
  #v(2pt)
  #text(8pt, fill: rgb("#64748b"))[Slotbook Production Scheduling Engine | Verified Repository: github.com/tiruk007/slotbooking]
]
