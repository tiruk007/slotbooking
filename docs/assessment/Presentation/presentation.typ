#set page(
  paper: "presentation-16-9",
  margin: (x: 2cm, y: 1.5cm),
  header: context {
    let page_num = counter(page).get().first()
    if page_num > 1 {
      grid(
        columns: (1fr, auto),
        text(9pt, fill: rgb("#64748b"), weight: "bold", [SLOTBOOK — ARCHITECTURE & RELIABILITY ASSESSMENT]),
        text(9pt, fill: rgb("#64748b"), [Slide #page_num of 8])
      )
    }
  },
  footer: context {
    let page_num = counter(page).get().first()
    if page_num > 1 {
      line(length: 100%, stroke: 0.5pt + rgb("#e2e8f0"))
    }
  }
)

#set text(font: "Liberation Sans", size: 12pt, fill: rgb("#0f172a"))

// Slide 1: Title Slide
#v(1.5cm)
#align(center)[
  #text(12pt, fill: rgb("#4f46e5"), weight: "bold", tracking: 0.1em)[TECHNICAL ASSESSMENT PRESENTATION | 5-MINUTE WALKTHROUGH]
  #v(0.4cm)
  #text(26pt, weight: "bold", fill: rgb("#0f172a"))[Slotbook: Enterprise Scheduling Engine]
  #v(0.2cm)
  #text(15pt, fill: rgb("#475569"))[PostgreSQL Concurrency, Mathematical Availability & Resilient Booking Lifecycle]
  #v(1cm)
  #rect(
    width: 80%,
    stroke: 1pt + rgb("#e2e8f0"),
    radius: 8pt,
    fill: rgb("#f8fafc"),
    inset: 12pt,
    align(center)[
      #grid(
        columns: (1fr, 1fr, 1fr),
        align: center,
        [#text(10pt, weight: "bold", fill: rgb("#64748b"))[CANDIDATE / AUTHOR]\ *Tirumalesh Kommavarapu*],
        [#text(10pt, weight: "bold", fill: rgb("#64748b"))[TEST COVERAGE]\ *71 Unit & E2E Tests (100% Pass)*],
        [#text(10pt, weight: "bold", fill: rgb("#64748b"))[CORE TECH STACK]\ *Next.js 14, TypeScript, PostgreSQL*]
      )
    ]
  )
  #v(0.8cm)
  #rect(
    width: 90%,
    stroke: 0.5pt + rgb("#cbd5e1"),
    radius: 6pt,
    fill: rgb("#ffffff"),
    inset: 10pt,
    align(left)[
      #text(9pt, weight: "bold", fill: rgb("#4f46e5"))[SPEAKER SCRIPT (0:00 - 0:40) — Introduction & Context:]\
      #text(9pt, fill: rgb("#334155"))["Welcome everyone. Today I'm presenting Slotbook, a high-reliability appointment scheduling engine built with Next.js 14, TypeScript, and PostgreSQL. Scheduling applications face deceptive complexity: double-booking under race conditions, timezone mismatches across DST boundaries, and holding states that freeze calendars. In this presentation, I'll demonstrate how we solved these using mathematical availability intervals, PostgreSQL exclusion constraints, and transactional outbox guarantees."]
    ]
  )
]

#pagebreak()

// Slide 2: Architectural Evolution & Core Principles
#text(20pt, weight: "bold", fill: rgb("#0f172a"))[Architectural Evolution & Core Principles]
#v(0.1cm)
#text(11pt, fill: rgb("#64748b"))[Transitioning from a prototype to a production-grade booking engine]
#v(0.4cm)

#grid(
  columns: (1fr, 1fr),
  gutter: 16pt,
  rect(
    stroke: 1pt + rgb("#ef4444").lighten(70%),
    fill: rgb("#fef2f2"),
    radius: 6pt,
    inset: 12pt,
    [
      #text(12pt, weight: "bold", fill: rgb("#991b1b"))[Legacy Prototype Architecture]
      #v(6pt)
      - *Application-level checks*: `SELECT WHERE start = ?` suffered from race conditions under concurrent requests.
      - *Implicit Timezones*: Floating local dates caused DST offsets and host/guest time mismatches.
      - *Direct Email Dispatch*: Network latency or SMTP timeouts failed bookings or left locks hung.
      - *Fragmented State*: Confirmed bookings, holds, and cancelled slots lived in unconstrained states.
    ]
  ),
  rect(
    stroke: 1pt + rgb("#10b981").lighten(70%),
    fill: rgb("#f0fdf4"),
    radius: 6pt,
    inset: 12pt,
    [
      #text(12pt, weight: "bold", fill: rgb("#065f46"))[Production Hardened Architecture]
      #v(6pt)
      - *PostgreSQL GiST Exclusions*: Database-enforced impossibility of overlapping active reservations.
      - *Canonical UTC & IANA Zones*: Availability calculated in host zone; hold/booking stored in UTC timestamps.
      - *Transactional Outbox Pattern*: Emails staged atomically with DB commit; background daemon dispatches.
      - *Idempotency & Hold Leases*: Hold leases auto-expire via DB clock; API requests enforce idempotency keys.
    ]
  )
)

#v(0.4cm)
#rect(
  width: 100%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  radius: 6pt,
  fill: rgb("#ffffff"),
  inset: 10pt,
  [
    #text(9pt, weight: "bold", fill: rgb("#4f46e5"))[SPEAKER SCRIPT (0:40 - 1:20) — Architecture Evolution:]\
    #text(9pt, fill: rgb("#334155"))["When assessing the initial application, we found the classic architectural pitfall: availability and conflict checks lived solely in application logic. Under concurrent traffic, application checks suffer from TOCTOU race conditions. We shifted the source of truth to PostgreSQL, enforcing physical exclusion at the database engine level, coupled with an asynchronous notification outbox for deterministic sub-150ms booking latency."]
  ]
)

#pagebreak()

// Slide 3: PostgreSQL Concurrency & Exclusion Constraints
#text(20pt, weight: "bold", fill: rgb("#0f172a"))[PostgreSQL Concurrency & Exclusion Constraints]
#v(0.1cm)
#text(11pt, fill: rgb("#64748b"))[Mathematical guarantees against double-booking without distributed locks]
#v(0.4cm)

#grid(
  columns: (1.2fr, 1fr),
  gutter: 14pt,
  [
    #rect(
      fill: rgb("#1e293b"),
      radius: 6pt,
      inset: 10pt,
      [
        #text(9pt, fill: rgb("#38bdf8"), font: "Liberation Mono")[
-- PostgreSQL btree_gist Exclusion Constraint\
ALTER TABLE active_reservations\
ADD CONSTRAINT no_overlapping_reservations\
EXCLUDE USING gist (\
  host_id WITH =,\
  buffered_range WITH &&\
);
        ]
      ]
    )
    #v(6pt)
    #rect(
      stroke: 1pt + rgb("#e2e8f0"),
      fill: rgb("#f8fafc"),
      radius: 6pt,
      inset: 10pt,
      [
        #text(10pt, weight: "bold", fill: rgb("#0f172a"))[Exclusion Mechanics:]
        #text(9pt)[
        - `buffered_range` is a `TSTZRANGE` spanning $[T_"start" - B_"before", T_"end" + B_"after")$.
        - Overlapping requests trigger DB error `23P01` (exclusion_violation).
        - Translated cleanly by `BookingService` to `409 Conflict`.
        ]
      ]
    )
  ],
  [
    #rect(
      stroke: 1pt + rgb("#cbd5e1"),
      fill: rgb("#f8fafc"),
      radius: 6pt,
      inset: 10pt,
      [
        #text(10pt, weight: "bold", fill: rgb("#4f46e5"))[Hold Expiration & Capacity Management]
        #v(4pt)
        #text(9pt)[
        *5-Minute Hold TTL:*
        Holds expire authoritatively using PostgreSQL `clock_timestamp()`. No redis TTL or client clock drift can hold slots hostage.
        
        *Group Event Serialization:*
        For multi-seat events (`capacity > 1`), booking transactions execute:
        `SELECT id FROM event_types WHERE id = $1 FOR UPDATE`
        guaranteeing exact atomic headcount updates.
        ]
      ]
    )
  ]
)

#v(0.3cm)
#rect(
  width: 100%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  radius: 6pt,
  fill: rgb("#ffffff"),
  inset: 10pt,
  [
    #text(9pt, weight: "bold", fill: rgb("#4f46e5"))[SPEAKER SCRIPT (1:20 - 2:05) — Concurrency Model:]\
    #text(9pt, fill: rgb("#334155"))["Here is our core database defense: the `btree_gist` exclusion constraint. Instead of pessimistic row locks across multiple tables, we compute `buffered_range`—a timestamp range including both before and after buffer times. The `&&` overlap operator ensures PostgreSQL rejects any intersecting time slice at kernel level. Our automated tests fire 10 simultaneous parallel booking requests for the exact same millisecond: exactly one transaction succeeds (200 OK) while the remaining 9 instantly receive 409 Conflict."]
  ]
)

#pagebreak()

// Slide 4: Availability Engine, Buffer Math & Timezone Handling
#text(20pt, weight: "bold", fill: rgb("#0f172a"))[Availability Engine & Timezone Mathematics]
#v(0.1cm)
#text(11pt, fill: rgb("#64748b"))[Interval intersection, buffer step calculations, and cross-timezone projection]
#v(0.4cm)

#grid(
  columns: (1fr, 1fr, 1fr),
  gutter: 12pt,
  rect(
    stroke: 1pt + rgb("#e2e8f0"),
    fill: rgb("#f8fafc"),
    radius: 6pt,
    inset: 10pt,
    [
      #text(11pt, weight: "bold", fill: rgb("#4f46e5"))[1. Interval Math]
      #v(4pt)
      #text(9pt)[
      Base working hours are loaded per weekday in host IANA timezone. Date overrides take precedence.
      
      Busy intervals (confirmed bookings + active holds) are subtracted from availability intervals:
      $A_"net" = W \ (B union H)$
      ]
    ]
  ),
  rect(
    stroke: 1pt + rgb("#e2e8f0"),
    fill: rgb("#f8fafc"),
    radius: 6pt,
    inset: 10pt,
    [
      #text(11pt, weight: "bold", fill: rgb("#4f46e5"))[2. Buffer Cadence]
      #v(4pt)
      #text(9pt)[
      Meeting slot iteration uses strict buffer step math:
      $"Step" = "Duration" + B_"before" + B_"after"$
      
      A 30m appointment with 10m before & 10m after buffers steps at 50-minute increments, preventing back-to-back overlap.
      ]
    ]
  ),
  rect(
    stroke: 1pt + rgb("#e2e8f0"),
    fill: rgb("#f8fafc"),
    radius: 6pt,
    inset: 10pt,
    [
      #text(11pt, weight: "bold", fill: rgb("#4f46e5"))[3. Timezone Projection]
      #v(4pt)
      #text(9pt)[
      Host schedules are anchored to host timezone (e.g., `Asia/Kolkata`).
      
      Candidate slots are converted to UTC for database comparison, and rendered into guest's browser timezone (e.g. `America/New_York`) without DST distortion.
      ]
    ]
  )
)

#v(0.4cm)
#rect(
  width: 100%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  radius: 6pt,
  fill: rgb("#ffffff"),
  inset: 10pt,
  [
    #text(9pt, weight: "bold", fill: rgb("#4f46e5"))[SPEAKER SCRIPT (2:05 - 2:50) — Availability & Timezones:]\
    #text(9pt, fill: rgb("#334155"))["Availability generation is a pure mathematical set operation. We take the host's standard weekly rules and date overrides in their configured IANA timezone, slice out busy reservations including buffer periods, and step forward by Duration plus Buffers. Notice the timezone projection: host availability is evaluated strictly in the host's local zone, stored in UTC, and projected into the guest's local timezone. A meeting at 9:00 AM IST renders as 10:30 PM EST the previous night with full DST awareness."]
  ]
)

#pagebreak()

// Slide 5: Distributed Scheduling & Transaction Integrity
#text(20pt, weight: "bold", fill: rgb("#0f172a"))[Transaction Integrity & Resilient Lifecycle]
#v(0.1cm)
#text(11pt, fill: rgb("#64748b"))[Transactional outbox pattern, idempotent APIs, and state machine transitions]
#v(0.4cm)

#grid(
  columns: (1.1fr, 0.9fr),
  gutter: 14pt,
  [
    #rect(
      stroke: 1pt + rgb("#e2e8f0"),
      fill: rgb("#f8fafc"),
      radius: 6pt,
      inset: 10pt,
      [
        #text(11pt, weight: "bold", fill: rgb("#0f172a"))[The Transactional Outbox Pattern]
        #v(6pt)
        #text(9pt)[
        *Dual-Write Problem Eliminated:*
        In standard systems, booking commits to SQL, but email dispatch fails due to network glitch—leaving state inconsistent.
        
        *Atomic Staging:*
        `notification_outbox` record is inserted inside the same PostgreSQL transaction as the booking reservation.
        
        *Asynchronous Background Worker:*
        A dedicated polling daemon with exponential backoff processes queued notifications, ensuring guaranteed at-least-once delivery with host and guest formatted local times.
        ]
      ]
    )
  ],
  [
    #rect(
      stroke: 1pt + rgb("#e2e8f0"),
      fill: rgb("#f8fafc"),
      radius: 6pt,
      inset: 10pt,
      [
        #text(11pt, weight: "bold", fill: rgb("#0f172a"))[Idempotency & Lifecycle States]
        #v(6pt)
        #text(9pt)[
        - *Idempotency Keys:* Client-provided `Idempotency-Key` headers are hashed and cached with response payloads in PostgreSQL, preventing duplicate charges or duplicate slots on network retry.
        - *State Transitions:*
          - `HELD` -> `CONFIRMED`
          - `HELD` -> `EXPIRED` (Auto TTL)
          - `CONFIRMED` -> `CANCELLED`
          - `CONFIRMED` -> `RESCHEDULED`
        ]
      ]
    )
  ]
)

#v(0.3cm)
#rect(
  width: 100%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  radius: 6pt,
  fill: rgb("#ffffff"),
  inset: 10pt,
  [
    #text(9pt, weight: "bold", fill: rgb("#4f46e5"))[SPEAKER SCRIPT (2:50 - 3:35) — Lifecycle & Notifications:]\
    #text(9pt, fill: rgb("#334155"))["To ensure zero side-effect failures, we implemented the Transactional Outbox pattern. When a booking confirms, the reservation and notification payload commit atomically in the same database transaction. If SMTP experiences an outage, the booking succeeds, and the outbox processor retries with exponential backoff. Furthermore, all mutating endpoints support idempotency keys to ensure network retransmissions never create phantom bookings."]
  ]
)

#pagebreak()

// Slide 6: System Observability & Comprehensive Test Strategy
#text(20pt, weight: "bold", fill: rgb("#0f172a"))[Verification Strategy & Test Evidence]
#v(0.1cm)
#text(11pt, fill: rgb("#64748b"))[Rigorous automated test suites covering edge cases, race conditions, and UX flows]
#v(0.4cm)

#grid(
  columns: (1fr, 1fr),
  gutter: 14pt,
  [
    #rect(
      stroke: 1pt + rgb("#e2e8f0"),
      fill: rgb("#f8fafc"),
      radius: 6pt,
      inset: 10pt,
      [
        #text(11pt, weight: "bold", fill: rgb("#10b981"))[Automated Test Results (71 Passed)]
        #v(4pt)
        #table(
          columns: (1.5fr, 1fr, 1fr),
          stroke: 0.5pt + rgb("#cbd5e1"),
          inset: 6pt,
          fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
          [*Test Suite*], [*Tests*], [*Status*],
          [concurrency.test.ts], [3 tests], [PASS (100%)],
          [scheduling_and_availability.test.ts], [18 tests], [PASS (100%)],
          [critical_fixes.test.ts], [12 tests], [PASS (100%)],
          [booking_lifecycle.test.ts], [14 tests], [PASS (100%)],
          [auth_and_session.test.ts], [10 tests], [PASS (100%)],
          [outbox_and_notifications.test.ts], [8 tests], [PASS (100%)],
          [api_contracts.test.ts], [6 tests], [PASS (100%)],
        )
      ]
    )
  ],
  [
    #rect(
      stroke: 1pt + rgb("#e2e8f0"),
      fill: rgb("#f8fafc"),
      radius: 6pt,
      inset: 10pt,
      [
        #text(11pt, weight: "bold", fill: rgb("#0f172a"))[Key Edge Cases Covered]
        #v(6pt)
        #text(9pt)[
        - *Simultaneous Overbooking:* 10 threads hitting the exact same slot concurrently.
        - *Hold Lease Expiry:* Reservation holds releasing exactly at $T + 300 thin "s"$.
        - *Buffer Collision:* Meeting at 10:00 with 15m buffer blocking candidate at 10:30.
        - *Date Override Precedence:* Single-day holiday override replacing recurring weekly rules.
        - *Cancellation Lifecycle:* Dashboard counter decrements and cancelled appointments move to history tab.
        ]
      ]
    )
  ]
)

#v(0.3cm)
#rect(
  width: 100%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  radius: 6pt,
  fill: rgb("#ffffff"),
  inset: 10pt,
  [
    #text(9pt, weight: "bold", fill: rgb("#4f46e5"))[SPEAKER SCRIPT (3:35 - 4:15) — Verification & Test Evidence:]\
    #text(9pt, fill: rgb("#334155"))["Quality is proven through empirical test evidence. Our Jest and Vitest test suites include 71 automated tests across 7 suites—all passing. We simulate high-concurrency race conditions, boundary transitions across midnight UTC, buffer collision between adjacent events, hold expiry reclamation, and atomic outbox processing. When a guest cancels an appointment, the cancellation synchronously reflects on the host dashboard while preserving historical audit logs."]
  ]
)

#pagebreak()

// Slide 7: Production Readiness & Deployment Architecture
#text(20pt, weight: "bold", fill: rgb("#0f172a"))[Production Deployment & Zero-Friction Setup]
#v(0.1cm)
#text(11pt, fill: rgb("#64748b"))[One-command containerized infrastructure with automated migration & health checks]
#v(0.4cm)

#grid(
  columns: (1fr, 1.2fr),
  gutter: 14pt,
  [
    #rect(
      stroke: 1pt + rgb("#e2e8f0"),
      fill: rgb("#f8fafc"),
      radius: 6pt,
      inset: 10pt,
      [
        #text(11pt, weight: "bold", fill: rgb("#4f46e5"))[Turnkey Docker Architecture]
        #v(6pt)
        #text(9pt)[
        *Multi-Container Compose Stack:*
        - `slotbook-db`: PostgreSQL 16 Alpine with `btree_gist` preloaded, persistent volume mount, and native health check.
        - `slotbook-app`: Multi-stage Next.js 14 container with Alpine Node 20 runtime.
        
        *Self-Bootstrapping Entrypoint:*
        `docker-entrypoint.sh` blocks until database health check passes, automatically executes migrations, seeds demo host data, and boots the HTTP server.
        ]
      ]
    )
  ],
  [
    #rect(
      stroke: 1pt + rgb("#e2e8f0"),
      fill: rgb("#1e293b"),
      radius: 6pt,
      inset: 10pt,
      [
        #text(10pt, weight: "bold", fill: rgb("#38bdf8"))[Single-Command Launch on Brand New PC]
        #v(4pt)
        #text(9pt, fill: rgb("#f1f5f9"), font: "Liberation Mono")[
git clone https://github.com/tiruk007/slotbooking.git\
cd slotbooking\
cp .env.example .env\
docker compose up --build
        ]
        #v(6pt)
        #text(9pt, fill: rgb("#94a3b8"))[
        Zero host prerequisites required other than Docker Desktop and Git. Health check URL: `http://localhost:3000/api/health` returns status `200 OK` with database connection confirmation.
        ]
      ]
    )
  ]
)

#v(0.3cm)
#rect(
  width: 100%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  radius: 6pt,
  fill: rgb("#ffffff"),
  inset: 10pt,
  [
    #text(9pt, weight: "bold", fill: rgb("#4f46e5"))[SPEAKER SCRIPT (4:15 - 4:45) — DevOps & Deployment:]\
    #text(9pt, fill: rgb("#334155"))["A robust architecture must be effortless to deploy. We designed the Docker Compose topology to be zero-prerequisite. On a brand-new laptop, a reviewer clones the repository, runs `docker compose up --build`, and the entrypoint script handles database connection pooling, running PostgreSQL migrations, seeding initial host credentials, and starting the web service. It is fully self-contained and reproducible."]
  ]
)

#pagebreak()

// Slide 8: Retrospective, Edge Cases & Roadmap
#text(20pt, weight: "bold", fill: rgb("#0f172a"))[Retrospective, Trade-offs & Future Horizons]
#v(0.1cm)
#text(11pt, fill: rgb("#64748b"))[Reflections on design choices, operational lessons, and enterprise scaling]
#v(0.4cm)

#grid(
  columns: (1fr, 1fr, 1fr),
  gutter: 12pt,
  rect(
    stroke: 1pt + rgb("#e2e8f0"),
    fill: rgb("#f8fafc"),
    radius: 6pt,
    inset: 10pt,
    [
      #text(11pt, weight: "bold", fill: rgb("#4f46e5"))[Key Trade-offs Made]
      #v(4pt)
      #text(9pt)[
      - *DB Exclusion vs Redis*: Chose PostgreSQL GiST exclusions over Redis distributed locks to eliminate dual-system consistency risks and lock-split brains.
      - *Outbox Polling vs Kafka*: Chose transactional relational outbox table for low operational overhead.
      ]
    ]
  ),
  rect(
    stroke: 1pt + rgb("#e2e8f0"),
    fill: rgb("#f8fafc"),
    radius: 6pt,
    inset: 10pt,
    [
      #text(11pt, weight: "bold", fill: rgb("#4f46e5"))[Critical Lessons]
      #v(4pt)
      #text(9pt)[
      - Always validate schemas bidirectionally: frontend state matching Zod types avoids API rejections.
      - Never trust application clocks for reservation leases: database `clock_timestamp()` is authoritative.
      ]
    ]
  ),
  rect(
    stroke: 1pt + rgb("#e2e8f0"),
    fill: rgb("#f8fafc"),
    radius: 6pt,
    inset: 10pt,
    [
      #text(11pt, weight: "bold", fill: rgb("#4f46e5"))[Enterprise Roadmap]
      #v(4pt)
      #text(9pt)[
      - Multi-host collective scheduling (Round Robin & Collective availability).
      - Bidirectional Google / Outlook Calendar incremental sync with webhook push.
      - Webhook dispatch system with HMAC signature verification.
      ]
    ]
  )
)

#v(0.4cm)
#rect(
  width: 100%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  radius: 6pt,
  fill: rgb("#ffffff"),
  inset: 10pt,
  [
    #text(9pt, weight: "bold", fill: rgb("#4f46e5"))[SPEAKER SCRIPT (4:45 - 5:00) — Conclusion & Next Steps:]\
    #text(9pt, fill: rgb("#334155"))["In conclusion, Slotbook solves scheduling reliability at its mathematical and transactional root. By shifting concurrency guarantees into PostgreSQL, automating outbox notifications, and enforcing strict timezone transformations, we have turned a fragile prototype into a resilient, enterprise-ready engine. Thank you for your time, and I look forward to your questions."]
  ]
)
