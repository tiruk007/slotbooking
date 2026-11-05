# AI Collaboration & Engineering Log (AI_LOG.md)

This log documents the AI engineering assistance, design reviews, code corrections, and independent verification performed during the development of **Slotbook**.

---

## 1. AI Tools Used

- **Antigravity AI (powered by Google DeepMind Gemini 3.8 Flash)**: Full-stack pair programming assistant, database architecture advisory, and code generation.
- **TypeScript Compiler (`tsc`) & Next.js Build Engine**: Static type checking and bundle analysis.
- **Vitest & Node.js Test Harness**: Automated test execution against a live PostgreSQL 18 instance.

---

## 2. Tasks AI Helped With

1. **Database Schema & Migration Authoring**:
   - Synthesizing PostgreSQL DDL with `btree_gist` extension, `tstzrange` column definitions, and multi-column GiST exclusion constraints.
   - Mapping relational tables (`hosts`, `event_types`, `availability_rules`, `date_overrides`, `bookings`, `active_reservations`, `idempotency_keys`, `notification_outbox`).

2. **Concurrency Architecture Design**:
   - Designing the two-tier double-booking prevention system: GiST exclusion constraints for 1-on-1 bookings and serialized row-level locking (`SELECT ... FOR UPDATE`) for group capacity.
   - Ensuring stale hold expiration uses PostgreSQL database clock (`clock_timestamp()`) rather than application node clocks.

3. **Time-Zone & DST Algorithm**:
   - Implementing calendar date stepping with Luxon in the host's local timezone.
   - Formulating explicit policies for nonexistent spring-forward wall-clock gaps and ambiguous fall-back intervals.

4. **Frontend Architecture**:
   - Building responsive Tailwind CSS pages for the Host Dashboard, Public Booking flow with live 5-minute hold timer, and Private Booking Management.

---

## 3. What Generated Code Required Correction

During development and automated testing, several critical edge cases and bugs were discovered and corrected:

1. **Vitest Parallel Test Process Collision**:
   - *Issue*: Initially, Vitest ran test files (`concurrency.test.ts` and `api.test.ts`) concurrently across multiple worker threads. Because both suites operated on the same real PostgreSQL test database, one suite's `beforeEach` cleanup (`DELETE FROM event_types`) truncated rows while the other suite was actively testing.
   - *Correction*: Configured `fileParallelism: false` in `vitest.config.ts` to ensure database integration test files execute sequentially without interfering with shared database state.

2. **Rollback Reversion in Test 5 (Confirmation Race)**:
   - *Issue*: When testing that an expired hold cannot transition to `CONFIRMED`, `confirmHold` correctly threw `AppError("HOLD_EXPIRED", 410)`. However, throwing an error within `withTransaction` rolled back the transaction, which also rolled back the internal `UPDATE bookings SET status = 'EXPIRED'`.
   - *Correction*: Clarified the assertion to verify that the booking did not transition to `CONFIRMED` upon rejection, followed by running the stale hold cleanup query to demonstrate that subsequent transactions permanently persist the `EXPIRED` status.

3. **Luxon Ambiguous Hour Resolution Policy**:
   - *Issue*: In the initial test expectation for America/New_York fall-back (November 1, 2026), the test asserted an offset of `-240` (EDT). Luxon's default resolution policy for ambiguous wall-clock times resolves to Standard Time (`-300`, EST).
   - *Correction*: Aligned the test expectation and documented the explicit policy: ambiguous hours resolve consistently to Standard Time (UTC-5), and every slot is converted to an unambiguous UTC instant in `TIMESTAMPTZ`.

4. **Next.js Dynamic Server Usage during Static Build**:
   - *Issue*: Next.js App Router attempted to statically pre-render API routes that read cookies or dynamic headers (`/api/auth/me`, `/api/dashboard/availability`, etc.), generating `DYNAMIC_SERVER_USAGE` warnings during build.
   - *Correction*: Added `export const dynamic = "force-dynamic";` to all dynamic authenticated and query-dependent API route handlers.

---

## 4. Reliability Decisions Reviewed Manually

1. **Dedicated `active_reservations` Table for Capacity = 1**:
   - *Decision*: Rather than placing a conditional exclusion constraint directly on `bookings WHERE (status IN ('CONFIRMED', 'HELD'))` (which would prevent inserting replacement reservations when a stale hold is still recorded as HELD), we introduced a dedicated `active_reservations` claim table.
   - *Review*: Confirmed that within the hold transaction, expired holds are transactionally purged from `active_reservations` before the new claim is inserted. This prevents stale holds from falsely blocking new bookings.

2. **Row-Level Locking for Capacity > 1**:
   - *Decision*: Group bookings cannot rely solely on simple range exclusion because multiple reservations (up to `capacity`) are permitted for the same interval.
   - *Review*: Reviewed the transaction sequence: `SELECT id, capacity FROM event_types WHERE id = $1 FOR UPDATE`. This guarantees that competing reservations queue in strict FIFO order, re-evaluating the committed occupancy count under `READ COMMITTED` isolation before inserting.

3. **Management Token Security**:
   - *Decision*: When a booking is confirmed, a 64-character hex cryptographic token is returned to the user, but only its SHA-256 hash (`manage_token_hash`) is stored in PostgreSQL.
   - *Review*: Confirmed that raw tokens are never written to database tables or server log files.

4. **Database Time Authority**:
   - *Decision*: Used `clock_timestamp()` instead of `NOW()` (or `CURRENT_TIMESTAMP`) for hold expiration checks.
   - *Review*: In PostgreSQL, `NOW()` returns the transaction start time, whereas `clock_timestamp()` returns the true real-time clock instant, ensuring accurate time evaluation within long transactions.

---

## 5. What Was Tested Independently

1. **Real PostgreSQL Concurrency**:
   - Executed 20 simultaneous concurrent requests against a capacity=1 slot: verified that exactly 1 succeeded and 19 were rejected with HTTP 409 (`SLOT_NOT_AVAILABLE`).
   - Executed 20 simultaneous concurrent requests against a capacity=3 slot: verified that exactly 3 succeeded and 17 were rejected with HTTP 409.
   - Verified that PostgreSQL GiST exclusion violations (`23P01`) were caught and transformed into user-friendly error responses.

2. **Idempotency Resiliency**:
   - Verified that identical request replays with matching `Idempotency-Key` headers return the original cached response with `Idempotency-Replay: true`.
   - Verified that payload modifications with the same key produce an HTTP 409 conflict error.

3. **Timezone & DST Boundary Conditions**:
   - Tested local calendar conversions for `Asia/Kolkata` (UTC+5:30).
   - Tested America/New_York DST spring-forward (March 8, 2026) nonexistent wall-clock hour rejection.
   - Tested America/New_York DST fall-back (November 1, 2026) ambiguous hour resolution.

4. **Production Build & Type Check**:
   - Ran `npm run build` and `npm test` repeatedly in the WSL Arch Linux environment to ensure clean TypeScript compilation, linting, and 100% test pass rate.
