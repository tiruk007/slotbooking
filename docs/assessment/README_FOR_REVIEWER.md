# Slotbook Assessment — Reviewer Guide & Submission Index

> **Applicant / Author**: Tirumalesh Kommavarapu  
> **Repository**: [https://github.com/tiruk007/slotbooking.git](https://github.com/tiruk007/slotbooking.git)  
> **Branch**: `main`  
> **Automated Test Results**: **71 of 71 Tests Passing (100%)** across 7 test suites  
> **Date**: November 2026  

---

## Welcome Reviewer!

Thank you for reviewing the **Slotbook** technical assessment. Slotbook has been audited, refactored, and hardened into a production-grade appointment scheduling engine built with **Next.js 14, TypeScript, and PostgreSQL 16**.

All assessment deliverables have been generated and structured into the folders below:

```text
docs/assessment/
├── README_FOR_REVIEWER.md                      <-- You are here
├── SPEAKER_SCRIPT.md                           (5-minute teleprompter narration & speaker script)
├── SPEAKER_SCRIPT.pdf                          (Compiled 3-page printable speaker script PDF)
├── Architecture/
│   ├── Slotbook_Architecture_and_Reliability_Report.pdf  (9-page comprehensive architecture report)
│   └── architecture_report.typ                           (Typst source)
├── Setup_Guide/
│   ├── FRESH_PC_SETUP_GUIDE.md                 (Zero-prerequisite Windows guide)
│   ├── Slotbook_Fresh_PC_Setup_Guide.pdf       (Compiled PDF guide)
│   └── setup_guide.typ                         (Typst source)
└── Presentation/ (Kept locally for submission upload; ignored on git)
    ├── Slotbook_Assessment_Presentation.pptx   (8 slides with presenter notes)
    └── Slotbook_Assessment_Presentation.pdf    (8 widescreen slides)
```

---

## 1. Quick Navigation to Deliverables

1. **5-Minute Video Speaker & Teleprompter Script**:
   - [Speaker Script (Markdown)](./SPEAKER_SCRIPT.md) — Word-for-word 5-minute teleprompter narration matching all 5 assessment beats.
   - [Speaker Script (PDF)](./SPEAKER_SCRIPT.pdf) — Formatted 3-page printable PDF version.
2. **Deep-Dive System Architecture & Reliability Report (9 Pages)**:
   - [Architecture Report (PDF)](./Architecture/Slotbook_Architecture_and_Reliability_Report.pdf) — Exhaustive 9-page technical document covering PostgreSQL GiST concurrency, availability formulation, timezone mathematics, transactional outbox pattern, state machines, and test evidence.
3. **Fresh-PC Windows Setup & Verification Guide**:
   - [Fresh-PC Setup Guide (Markdown)](./Setup_Guide/FRESH_PC_SETUP_GUIDE.md) — Step-by-step setup walkthrough for a brand-new Windows 10/11 laptop with zero prerequisites.
   - [Fresh-PC Setup Guide (PDF)](./Setup_Guide/Slotbook_Fresh_PC_Setup_Guide.pdf) — Formatted PDF version.
4. **Presentation Deck (Local File Upload Deliverable)**:
   - Located locally in `docs/assessment/Presentation/` (`Slotbook_Assessment_Presentation.pptx` and `.pdf`) for direct upload to the assessment portal.

---

## 2. 60-Second Quick Start (Single-Command Docker Launch)

On any machine with Docker Desktop and Git installed:

```bash
git clone https://github.com/tiruk007/slotbooking.git
cd slotbooking
cp .env.example .env
docker compose up --build
```

**What the container stack automates**:
- Boots PostgreSQL 16 with `btree_gist` preloaded.
- Runs database migrations (`npm run db:migrate`).
- Runs idempotent seed scripts (`npm run db:seed`).
- Boots Next.js 14 production server at `http://localhost:3000`.

---

## 3. Seed Credentials for Testing

| Role | Portal URL | Credentials |
| :--- | :--- | :--- |
| **Public Guest** | `http://localhost:3000` | No login required. Can book directly at `/book/tirumalesh/30-minutes`. OTP for guest email verification: `123456` (or check console). |
| **Host Admin** | `http://localhost:3000/host/login` | **Email**: `host@slotbook.internal` (or `tirumaleshkommavarapu@gmail.com`)<br>**Password**: `Password123!`<br>*(Or use host email OTP login)* |

---

## 4. Key Architectural Highlights Verified in Code

1. **Mathematical Impossibility of Double-Booking**:
   - Implemented via PostgreSQL GiST exclusion constraint on `active_reservations`:
     ```sql
     EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&)
     ```
   - Evaluates continuous `TSTZRANGE` over $[T_{\text{start}} - B_{\text{before}}, T_{\text{end}} + B_{\text{after}})$.
   - Verified by `tests/concurrency.test.ts`: 10 parallel asynchronous requests hitting the exact same millisecond yield exactly 1 success (`200 OK`) and 9 immediate rejections (`409 Conflict`).
2. **Authoritative Expiration & Clock**:
   - 5-minute hold leases expire using PostgreSQL's internal `clock_timestamp()`, immune to client or server clock drift.
3. **Transactional Outbox Notification Engine**:
   - Email dispatch is completely decoupled from booking transactions via the `notification_outbox` table.
   - Eliminates dual-write inconsistencies when external SMTP experiences latency or outage.
4. **Timezone & Buffer Math**:
   - Stored in UTC (`TIMESTAMPTZ`). Host availability evaluated in host IANA timezone (e.g. `Asia/Kolkata`).
   - Candidate slot step is strictly $(D + B_{\text{before}} + B_{\text{after}})$, e.g., 30m appointment + 10m before + 10m after = 50m stride.
5. **Bidirectional Schema Validation**:
   - Frontend React state and backend API payloads are strictly validated against identical Zod schemas, eliminating 400 Bad Request payload mismatch errors.

---

## 5. Verification Checklist

- [x] **All 71 Tests Passing**: Run `docker compose exec slotbook-app npm test`.
- [x] **Clean Next.js Build**: 26 routes compiling statically and dynamically with zero TypeScript errors.
- [x] **Database Migrations**: Tested up and down idempotently.
- [x] **Host Cancellation Synchronization**: Guest cancellations immediately update host dashboard counters and move appointments to the cancelled appointments list.
- [x] **Zero Credentials in Git**: `.env.example` contains generic placeholders; real secrets remain local.
- [x] **Fresh-PC Windows Readiness**: Complete Windows 10/11 Docker guide provided.

---
*For questions or detailed discussions, please refer to [Slotbook_Architecture_and_Reliability_Report.pdf](./Architecture/Slotbook_Architecture_and_Reliability_Report.pdf).*

