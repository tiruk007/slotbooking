#set page(
  paper: "a4",
  margin: (x: 2cm, top: 2.2cm, bottom: 2.2cm),
  header: context {
    let p = counter(page).get().first()
    if p > 1 {
      grid(
        columns: (1fr, auto),
        text(8pt, fill: rgb("#64748b"), weight: "bold", [SLOTBOOK — 5-MINUTE VIDEO SPEAKER SCRIPT]),
        text(8pt, fill: rgb("#64748b"), [Page #p of #counter(page).final().first()])
      )
      line(length: 100%, stroke: 0.5pt + rgb("#e2e8f0"))
    }
  },
  footer: context {
    grid(
      columns: (1fr, auto),
      text(8pt, fill: rgb("#94a3b8"), [Candidate: Tirumalesh Kommavarapu]),
      text(8pt, fill: rgb("#94a3b8"), [November 2026])
    )
  }
)

#set text(font: "Liberation Sans", size: 10pt, fill: rgb("#0f172a"))
#set par(justify: true, leading: 0.65em)
#show heading.where(level: 1): it => block(above: 1.2em, below: 0.8em)[
  #text(15pt, weight: "bold", fill: rgb("#0f172a"))[#it.body]
  #v(2pt)
  #line(length: 100%, stroke: 1.5pt + rgb("#4f46e5"))
]
#show heading.where(level: 2): it => block(above: 1em, below: 0.5em)[
  #text(12pt, weight: "bold", fill: rgb("#1e293b"))[#it.body]
]

#align(center)[
  #v(0.4cm)
  #text(11pt, weight: "bold", fill: rgb("#4f46e5"), tracking: 0.15em)[5-MINUTE RECORDING TELEPROMPTER GUIDE]
  #v(0.3cm)
  #text(22pt, weight: "bold", fill: rgb("#0f172a"))[Slotbook Speaker & Narration Script]
  #v(0.2cm)
  #text(12pt, fill: rgb("#475569"))[Synchronized with Candidate Cue & Teleprompter Beats]
  #v(0.6cm)
  
  #rect(
    width: 95%,
    stroke: 1pt + rgb("#cbd5e1"),
    radius: 6pt,
    fill: rgb("#f8fafc"),
    inset: 10pt,
    align(left)[
      #grid(
        columns: (1fr, 1fr),
        row-gutter: 6pt,
        [#text(9pt, weight: "bold", fill: rgb("#64748b"))[PRESENTER:]\ Tirumalesh Kommavarapu],
        [#text(9pt, weight: "bold", fill: rgb("#64748b"))[TARGET DURATION:]\ Exactly 5 Minutes (0:00 - 5:00)],
        [#text(9pt, weight: "bold", fill: rgb("#64748b"))[CAPTURES REQUIRED:]\ Screen + Webcam (Face) + Audio],
        [#text(9pt, weight: "bold", fill: rgb("#64748b"))[TEST VERIFICATION:]\ 71 of 71 Tests Passing (100%)]
      )
    ]
  )
]

#v(0.4cm)

= Teleprompter Timing & Section Overview

#table(
  columns: (1.2fr, 2.8fr, 2fr),
  stroke: 0.5pt + rgb("#cbd5e1"),
  inset: 6pt,
  fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
  [*Timestamp*], [*Teleprompter Beat*], [*Screen Focus / Visual Cue*],
  [0:00 – 1:00], [Beat 1: Show data model & explain double-book prevention], [Data Model / `active_reservations` DDL],
  [1:00 – 2:00], [Beat 2: Booking lifecycle (hold, confirm, reschedule)], [State Machine & `clock_timestamp()`],
  [2:00 – 3:00], [Beat 3: Timezone logic: host zone vs guest zone display], [Timezone Planes & 50m Stride Math],
  [3:00 – 4:00], [Beat 4: Optional extension built (Daily Cap / Outbox)], [Partial Unique Index & Outbox Table],
  [4:00 – 5:00], [Beat 5: Show one test proving reliability claim], [Terminal running `npm test` (71 passed)]
)

---

= Word-for-Word Presenter Narration

== Minute 0:00 – 1:00: Data Model & Concurrency Protection
*(Screen: Show Data Model / `active_reservations` schema)*

#rect(
  width: 100%,
  stroke: 1pt + rgb("#e2e8f0"),
  fill: rgb("#f8fafc"),
  radius: 6pt,
  inset: 10pt,
  [
    #text(9.5pt)[
    *[0:00]* "Hello everyone. My name is Tirumalesh, and today I'm presenting Slotbook — a high-reliability appointment scheduling engine built with Next.js 14, TypeScript, and PostgreSQL 16.
    
    *[0:15]* When building scheduling systems, the most dangerous architectural trap is relying on application-level checks like `SELECT count(*) WHERE start = time`. Under concurrent traffic, those checks suffer from time-of-check to time-of-use race conditions.
    
    *[0:30]* In Slotbook, PostgreSQL is the single authoritative source of truth. We solved double-booking at the database storage engine level using the `btree_gist` extension on our `active_reservations` table.
    
    *[0:45]* We enforce an exclusion constraint: `EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&)`. Here, `buffered_range` is a continuous timestamp range spanning from the start time minus before-buffer to end time plus after-buffer. If two guests attempt to book the exact same slot concurrently, PostgreSQL physically rejects the second write with error code `23P01`, which our API translates into an immediate 409 Conflict."
    ]
  ]
)

== Minute 1:00 – 2:00: Booking Request Lifecycle & Postgres Correctness
*(Screen: Show Booking State Machine: Hold -> Confirm -> Reschedule)*

#rect(
  width: 100%,
  stroke: 1pt + rgb("#e2e8f0"),
  fill: rgb("#f8fafc"),
  radius: 6pt,
  inset: 10pt,
  [
    #text(9.5pt)[
    *[1:00]* "Now let's trace a booking lifecycle: *Hold*, *Confirm*, and *Reschedule*.
    
    *[1:12]* When a guest selects an available time slot, we don't immediately confirm it. Instead, we issue a 5-minute hold lease in `active_reservations`. Crucially, this lease does not rely on application clocks or Redis TTLs; it authoritatively evaluates against PostgreSQL's internal hardware clock: `clock_timestamp()`. If the user abandons the form, the slot is automatically reclaimed during the next sweep without locking the calendar hostage.
    
    *[1:32]* When the guest enters their details and verifies their 6-digit email OTP, the reservation transitions to `CONFIRMED`.
    
    *[1:45]* If the guest later needs to reschedule using their private self-service link, Slotbook performs an atomic transaction: it releases the existing reservation and locks the new target slot in a single commit. If the new slot has been taken by someone else in the interim, the entire transaction rolls back cleanly, leaving their original booking intact with zero data loss."
    ]
  ]
)

== Minute 2:00 – 3:00: Timezone Mathematics & Buffer Step Logic
*(Screen: Show Timezone Architecture & Buffer Step Diagram)*

#rect(
  width: 100%,
  stroke: 1pt + rgb("#e2e8f0"),
  fill: rgb("#f8fafc"),
  radius: 6pt,
  inset: 10pt,
  [
    #text(9.5pt)[
    *[2:00]* "Next, let's look at how we handle timezones and Daylight Saving Time.
    
    *[2:10]* We divide time into three strict planes: Storage, Host, and Guest. All timestamps in the database are stored canonically in UTC using `TIMESTAMPTZ`.
    
    *[2:22]* When computing availability, our engine evaluates working hours against the host's configured IANA timezone — for example, `Asia/Kolkata`. We apply recurring weekly rules, subtract date overrides and busy blocks, and project the available slots into the guest's local browser timezone — for example, `America/New_York`.
    
    *[2:40]* Notice our buffer cadence: candidate slot stepping strictly uses the full interval stride: $"Step" = "Duration" + "Buffer"_"before" + "Buffer"_"after"$. A 30-minute appointment with 10-minute before and 10-minute after buffers steps at 50-minute increments: 9:10, 10:00, 10:50. This mathematical formulation guarantees that hosts always receive their scheduled breaks."
    ]
  ]
)

== Minute 3:00 – 4:00: Optional Extensions Built
*(Screen: Show Daily Limit Partial Index & Transactional Outbox Table)*

#rect(
  width: 100%,
  stroke: 1pt + rgb("#e2e8f0"),
  fill: rgb("#f8fafc"),
  radius: 6pt,
  inset: 10pt,
  [
    #text(9.5pt)[
    *[3:00]* "Given the 48-hour timebox, we focused on extensions that reinforce operational reliability.
    
    *[3:12]* The first extension we built is the *Daily Cap and Per-Guest Limit*. To prevent malicious users or bots from hoarding an entire day's schedule, we created a PostgreSQL partial unique index on `(event_type_id, LOWER(guest_email), host_local_date)`. This enforces at the database level that a guest email can hold at most one active appointment per event type per local calendar day.
    
    *[3:32]* The second extension is our *Transactional Outbox Pattern*. In naive applications, sending an email directly inside an HTTP handler introduces dual-write failure modes: if the SMTP server times out, the booking fails or hangs. In Slotbook, notifications are staged inside the same database transaction as the booking. An asynchronous background poller dispatches emails with exponential backoff and localized timestamps for both host and guest."
    ]
  ]
)

== Minute 4:00 – 5:00: Live Test Verification & Conclusion
*(Screen: Switch to Terminal / Test Runner)*

#rect(
  width: 100%,
  stroke: 1pt + rgb("#e2e8f0"),
  fill: rgb("#f8fafc"),
  radius: 6pt,
  inset: 10pt,
  [
    #text(9.5pt)[
    *[4:00]* "To empirically verify these reliability guarantees, we wrote comprehensive automated test suites.
    
    *[4:10]* In `tests/concurrency.test.ts`, we simulate high-load race conditions: 10 asynchronous parallel requests hit the exact same host and time slot simultaneously.
    
    *(Execute or display `npm test` in the terminal)*
    
    *[4:25]* As you can see, all *71 tests pass across 7 suites*. In the concurrency test, exactly one transaction succeeds with HTTP 200 OK, while the other 9 receive an immediate HTTP 409 Conflict. Zero double-bookings occur.
    
    *[4:40]* Slotbook is completely containerized. With a single command — `docker compose up --build` — PostgreSQL 16 initializes with `btree_gist`, migrations execute automatically, demo data seeds, and the Next.js server boots.
    
    *[4:55]* Thank you for your time, and I look forward to your questions."
    ]
  ]
)

---

#align(center)[
  #v(0.4cm)
  #text(10pt, weight: "bold", fill: rgb("#0f172a"))[Slotbook — 5-Minute Video Recording Guide]
  #v(2pt)
  #text(8pt, fill: rgb("#64748b"))[Candidate: Tirumalesh Kommavarapu | Repository: github.com/tiruk007/slotbooking]
]
