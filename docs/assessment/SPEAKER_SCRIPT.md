# Slotbook — 5-Minute Video Walkthrough & Speaker Script

> **Candidate / Presenter**: Tirumalesh Kommavarapu  
> **Target Recording Time**: Exactly 5 Minutes (0:00 to 5:00)  
> **Captures**: Screen Capture + Webcam (Face) + Audio  
> **Platform Requirements**: Aligned with the 5 Teleprompter Beats  

---

## ⏱️ Teleprompter Timing & Section Overview

```text
+-------------------+--------------------------------------------------------------+---------------------------+
| Timestamp         | Teleprompter Beat                                            | Screen Focus              |
+-------------------+--------------------------------------------------------------+---------------------------+
| 0:00 – 1:00 (60s) | Beat 1: Show the data model & explain how you prevent double- | Architecture & Data Model |
|                   |         booking under concurrency.                           | (active_reservations)     |
| 1:00 – 2:00 (60s) | Beat 2: Walk through a booking request (hold, confirm,        | Booking State Machine &   |
|                   |         reschedule) & where Postgres guarantees correctness. | PostgreSQL Authoritative  |
| 2:00 – 3:00 (60s) | Beat 3: Explain time-zone logic: host zone generation vs     | Timezone Planes & Buffer  |
|                   |         guest zone display across DST boundaries.            | Step Mathematics          |
| 3:00 – 4:00 (60s) | Beat 4: Name one optional extension you built (or chose not  | Daily Limit Index &       |
|                   |         to) and why, given the timebox.                      | Transactional Outbox      |
| 4:00 – 5:00 (60s) | Beat 5: Show one test (concurrency, timezone edge case, or   | Live Terminal npm test    |
|                   |         load) proving your reliability claim.                | 10-Parallel Concurrency   |
+-------------------+--------------------------------------------------------------+---------------------------+
```

---

## 🎙️ Word-for-Word Teleprompter Narration

### Minute 0:00 – 1:00: Data Model & Concurrency Protection
*(Screen: Show Data Model / `active_reservations` DDL)*

> **[0:00]** "Hello everyone. My name is Tirumalesh, and today I'm presenting Slotbook — a high-reliability appointment scheduling engine built with Next.js 14, TypeScript, and PostgreSQL 16.
> 
> **[0:15]** When building scheduling systems, the most dangerous architectural trap is relying on application-level checks like `SELECT count(*) WHERE start = time`. Under concurrent traffic, those checks suffer from time-of-check to time-of-use race conditions. 
> 
> **[0:30]** In Slotbook, PostgreSQL is the single authoritative source of truth. We solved double-booking at the database storage engine level using the `btree_gist` extension on our `active_reservations` table. 
> 
> **[0:45]** We enforce an exclusion constraint: `EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&)`. Here, `buffered_range` is a continuous timestamp range spanning from the start time minus before-buffer to end time plus after-buffer. If two guests attempt to book the exact same slot concurrently, PostgreSQL physically rejects the second write with error code `23P01`, which our API translates into an immediate 409 Conflict."

---

### Minute 1:00 – 2:00: The Booking Request Lifecycle & Postgres Correctness
*(Screen: Show Booking State Machine: Hold $\rightarrow$ Confirm $\rightarrow$ Reschedule)*

> **[1:00]** "Now let's trace a booking lifecycle: **Hold**, **Confirm**, and **Reschedule**.
> 
> **[1:12]** When a guest selects an available time slot, we don't immediately confirm it. Instead, we issue a 5-minute hold lease in `active_reservations`. Crucially, this lease does not rely on application clocks or Redis TTLs; it authoritatively evaluates against PostgreSQL's internal hardware clock: `clock_timestamp()`. If the user abandons the form, the slot is automatically reclaimed during the next sweep without locking the calendar hostage.
> 
> **[1:32]** When the guest enters their details and verifies their 6-digit email OTP, the reservation transitions to `CONFIRMED`. 
> 
> **[1:45]** If the guest later needs to reschedule using their private self-service link, Slotbook performs an atomic transaction: it releases the existing reservation and locks the new target slot in a single commit. If the new slot has been taken by someone else in the interim, the entire transaction rolls back cleanly, leaving their original booking intact with zero data loss."

---

### Minute 2:00 – 3:00: Timezone Mathematics & Buffer Step Logic
*(Screen: Show Timezone Architecture & Buffer Step Diagram)*

> **[2:00]** "Next, let's look at how we handle timezones and Daylight Saving Time.
> 
> **[2:10]** We divide time into three strict planes: Storage, Host, and Guest. All timestamps in the database are stored canonically in UTC using `TIMESTAMPTZ`. 
> 
> **[2:22]** When computing availability, our engine evaluates working hours against the host's configured IANA timezone — for example, `Asia/Kolkata`. We apply recurring weekly rules, subtract date overrides and busy blocks, and project the available slots into the guest's local browser timezone — for example, `America/New_York`.
> 
> **[2:40]** Notice our buffer cadence: candidate slot stepping strictly uses the full interval stride: $\text{Step} = \text{Duration} + \text{Buffer}_{\text{before}} + \text{Buffer}_{\text{after}}$. A 30-minute appointment with 10-minute before and 10-minute after buffers steps at 50-minute increments: 9:10, 10:00, 10:50. This mathematical formulation guarantees that hosts always receive their scheduled breaks."

---

### Minute 3:00 – 4:00: Optional Extensions Built
*(Screen: Show Daily Limit Partial Index & Transactional Outbox Table)*

> **[3:00]** "Given the 48-hour timebox, we focused on extensions that reinforce operational reliability. 
> 
> **[3:12]** The first extension we built is the **Daily Cap and Per-Guest Limit**. To prevent malicious users or bots from hoarding an entire day's schedule, we created a PostgreSQL partial unique index on `(event_type_id, LOWER(guest_email), host_local_date)`. This enforces at the database level that a guest email can hold at most one active appointment per event type per local calendar day.
> 
> **[3:32]** The second extension is our **Transactional Outbox Pattern**. In naive applications, sending an email directly inside an HTTP handler introduces dual-write failure modes: if the SMTP server times out, the booking fails or hangs. In Slotbook, notifications are staged inside the same database transaction as the booking. An asynchronous background poller dispatches emails with exponential backoff and localized timestamps for both host and guest."

---

### Minute 4:00 – 5:00: Live Test Verification & Conclusion
*(Screen: Switch to Terminal / Test Runner)*

> **[4:00]** "To empirically verify these reliability guarantees, we wrote comprehensive automated test suites. 
> 
> **[4:10]** In `tests/concurrency.test.ts`, we simulate high-load race conditions: 10 asynchronous parallel requests hit the exact same host and time slot simultaneously.
> 
> *(Execute or display `npm test` in the terminal)*
> 
> **[4:25]** As you can see, all **71 tests pass across 7 suites**. In the concurrency test, exactly one transaction succeeds with HTTP 200 OK, while the other 9 receive an immediate HTTP 409 Conflict. Zero double-bookings occur.
> 
> **[4:40]** Slotbook is completely containerized. With a single command — `docker compose up --build` — PostgreSQL 16 initializes with `btree_gist`, migrations execute automatically, demo data seeds, and the Next.js server boots.
> 
> **[4:55]** Thank you for your time, and I look forward to your questions."

---

## 💡 Quick Tips for Candidate Recording

1. **Keep the Script Visible**: Position your browser window with this script right below your webcam so your eye contact remains natural.
2. **Pacing**: Aim for ~130–140 words per minute. Each minute section contains ~130 words.
3. **Screen Layout**:
   - Split your screen: 70% presentation / code / terminal, 30% webcam face.
   - For Minute 0 to 3: Show the Architecture Report diagrams or slides.
   - For Minute 4: Show the terminal running `npm test` (71 passed).
4. **Deliverable Upload**: Upload `Slotbook_Architecture_and_Reliability_Report.pdf` or `Slotbook_Assessment_Presentation.pdf` as your final deliverable attachment.
