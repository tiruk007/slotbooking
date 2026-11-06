# Slotbook — Enterprise Scheduling Engine

[![Tests](https://img.shields.io/badge/tests-71%20passed%20%7C%20100%25-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)]()
[![Next.js](https://img.shields.io/badge/Next.js-14%20App%20Router-black.svg)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20Alpine-336791.svg)]()
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)]()

Slotbook is a high-reliability, customer-facing appointment scheduling platform built with **Next.js 14 (App Router)**, **TypeScript**, and **PostgreSQL 16**. It solves real-world distributed scheduling challenges: double-booking under high concurrency, timezone mismatches across Daylight Saving Time (DST) boundaries, buffer math collision, and transient email delivery failures.

---

## 🎯 Assessment Reviewer Resources & Documentation

All submission deliverables are organized in [`docs/assessment/`](./docs/assessment/):

| Resource | Format | Description |
| :--- | :--- | :--- |
| [**Reviewer Guide & Submission Index**](./docs/assessment/README_FOR_REVIEWER.md) | Markdown | Executive overview, test breakdown, and verification checklist. |
| [**5-Minute Speaker & Teleprompter Script**](./docs/assessment/SPEAKER_SCRIPT.md) | Markdown | Word-for-word 5-minute teleprompter narration matching all 5 assessment beats. |
| [**Speaker Script (PDF)**](./docs/assessment/SPEAKER_SCRIPT.pdf) | PDF (3 Pages) | Printable PDF teleprompter script for the 5-minute video recording. |
| [**Architecture & Reliability Report**](./docs/assessment/Architecture/Slotbook_Architecture_and_Reliability_Report.pdf) | PDF (9 Pages) | Deep-dive engineering report: GiST exclusion, outbox pattern, ER model, timezone math. |
| [**Fresh PC Setup Guide**](./docs/assessment/Setup_Guide/FRESH_PC_SETUP_GUIDE.md) | Markdown | Zero-prerequisite setup guide for a brand-new Windows 10/11 laptop. |
| [**Fresh PC Setup Guide (PDF)**](./docs/assessment/Setup_Guide/Slotbook_Fresh_PC_Setup_Guide.pdf) | PDF | Printable PDF format of the zero-prerequisite setup guide. |

---

## 🚀 60-Second Quick Start (Docker Compose)

The entire application and database stack can be launched on any system with Docker Desktop and Git installed. No host Node.js or PostgreSQL installations are required.

```bash
# 1. Clone repository
git clone https://github.com/tiruk007/slotbooking.git
cd slotbooking

# 2. Copy environment template
cp .env.example .env

# 3. Launch container stack
docker compose up --build
```

**What the container startup automates**:
1. Starts PostgreSQL 16 Alpine with `btree_gist` extension preloaded.
2. Automatically runs database migrations (`npm run db:migrate`).
3. Automatically seeds initial host profiles and event types (`npm run db:seed`).
4. Boots the production Next.js 14 application on [http://localhost:3000](http://localhost:3000).

---

## 🔑 Seed Credentials for Evaluation

- **Public Customer Booking**: [http://localhost:3000/book/tirumalesh/30-minutes](http://localhost:3000/book/tirumalesh/30-minutes) (No login required; guest email OTP: `123456`)
- **Private Host Portal**: [http://localhost:3000/host/login](http://localhost:3000/host/login)
  - **Email**: `host@slotbook.internal` (or `tirumaleshkommavarapu@gmail.com`)
  - **Password**: `Password123!`
  - *(Or enter email to receive host login OTP)*

---

## 🏗️ Core Architecture & Reliability Guarantees

| Capability | Guarantee | Engineering Mechanism |
| :--- | :--- | :--- |
| **Double-Booking Prevention** | Mathematical Impossibility | PostgreSQL `btree_gist` exclusion constraint over continuous `TSTZRANGE`: `EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&)`. Overlapping requests trigger DB error `23P01`, converted cleanly to HTTP `409 Conflict`. |
| **5-Minute Hold Leases** | Authoritative TTL | Temporary slots are protected by hold leases. Leases expire via database `clock_timestamp()`, immune to client clock drift or manipulation. |
| **Timezone Safety & DST** | Canonical UTC Storage | Internal times stored in UTC (`TIMESTAMPTZ`). Evaluated in host IANA timezone (`Asia/Kolkata`) and projected to guest viewport timezone (`America/New_York`) with DST wall-clock anchoring. |
| **Buffer Mathematics** | Dedicated Meeting Spacing | Slot stride strictly equals $(D + B_{\text{before}} + B_{\text{after}})$. A 30m meeting with 10m before & 10m after buffers iterates at 50-minute increments, preventing back-to-back encroachment. |
| **Zero Dual-Write Failures** | Transactional Outbox | Staged notifications are inserted atomically inside the booking transaction. A resilient background daemon dispatches emails with exponential backoff. |
| **Host/Guest State Sync** | Real-Time Consistency | Guest cancellations synchronously update host dashboard counters and move bookings to the cancelled appointments list. |
| **API Idempotency** | Duplicate Replay Safety | `Idempotency-Key` headers are hashed and cached with response payloads in PostgreSQL, preventing double charges or duplicate slots on network retry. |

---

## 🧪 Comprehensive Automated Testing (71 Tests)

All 71 automated tests run against live PostgreSQL with zero mocking of database constraints:

```bash
# Run tests locally or inside Docker container
npm test
# Or inside Docker:
docker compose exec slotbook-app npm test
```

### Verified Test Suites:
- **`tests/concurrency.test.ts` (3 tests)**: 10 parallel asynchronous requests hitting the exact same millisecond yield exactly 1 success (`200 OK`) and 9 immediate rejections (`409 Conflict`). Tests capacity > 1 group serialization.
- **`tests/scheduling_and_availability.test.ts` (18 tests)**: Verifies 50m buffer step cadence, weekly recurring working hours, date override precedence, minimum notice windows, and booking horizons.
- **`tests/critical_fixes.test.ts` (12 tests)**: Verifies host dashboard cancellation sync, hold lease expiry sweep, buffer collision edge cases, and weekly availability Zod schema validation.
- **`tests/booking_lifecycle.test.ts` (14 tests)**: Verifies Hold &rarr; OTP Verification &rarr; Confirm &rarr; Cancel &rarr; Reschedule state machine transitions.
- **`tests/auth_and_notification.test.ts` (10 tests)**: Verifies passwordless host OTP, persistent sessions with SHA-256 tokens, session revocation on logout, and multi-host isolation.
- **`tests/transformation.test.ts` (8 tests)**: Verifies daily duplicate booking prevention, cross-event buffers, and transactional outbox delivery tracking.
- **`tests/api.test.ts` (6 tests)**: Verifies API contracts, Zod payload validation, and idempotency key replay.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 14 (App Router, Route Handlers, Server Actions)
- **Language**: TypeScript (Strict mode: `noImplicitAny: true`)
- **Database**: PostgreSQL 16 (Alpine) with `btree_gist` extension
- **Data Access**: Typed client (`pg`) with parameterized SQL
- **Schema Validation**: Zod bidirectional validation
- **Timezone & Date Math**: `date-fns-tz` & `luxon` (IANA timezones)
- **Email Engine**: Nodemailer (Gmail SMTP + Transactional Relational Outbox)
- **Styling**: Tailwind CSS & Lucide Icons
- **Containerization**: Docker Compose with multi-stage Next.js image
- **Documentation & Reports**: Typst 0.15 & python-pptx

---

## 💻 Daily Development Commands

```bash
# Start containers in background
docker compose up -d

# View live application logs
docker compose logs -f slotbook-app

# View database logs
docker compose logs -f slotbook-db

# Run migrations manually
docker compose exec slotbook-app npm run db:migrate

# Seed database manually
docker compose exec slotbook-app npm run db:seed

# Run test suite inside container
docker compose exec slotbook-app npm test

# Stop containers (preserves database data)
docker compose stop

# Destroy containers and database volume (clean slate)
docker compose down -v
```

---

## 📄 License

MIT License. Designed and engineered for high-reliability scheduling.  
*Author: Tirumalesh Kommavarapu | November 2026*
