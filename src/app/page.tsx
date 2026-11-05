import Link from "next/link";
import { Calendar, ShieldCheck, Lock, Clock, Users, ArrowRight, Zap, CheckCircle2 } from "lucide-react";

export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
      {/* Hero */}
      <section className="text-center space-y-6 pt-6">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-indigo-600" />
          <span>Zero Double-Booking Guarantee</span>
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight">
          Production-Minded <span className="text-indigo-600">Appointment Scheduling</span>
        </h1>
        <p className="max-w-2xl mx-auto text-lg text-slate-600 leading-relaxed">
          Slotbook is an appointment booking system engineered for uncompromising correctness.
          Concurrency safety is enforced by PostgreSQL at the database engine level—no Redis, no external lock services, no race conditions.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition flex items-center justify-center space-x-2"
          >
            <span>Open Host Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/alex@slotbook.dev/30-min-chat"
            className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium rounded-lg shadow-sm transition flex items-center justify-center space-x-2"
          >
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>Public Booking Demo (1-on-1)</span>
          </Link>
          <Link
            href="/alex@slotbook.dev/team-workshop"
            className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium rounded-lg shadow-sm transition flex items-center justify-center space-x-2"
          >
            <Users className="w-4 h-4 text-emerald-600" />
            <span>Group Workshop Demo (Capacity: 4)</span>
          </Link>
        </div>
      </section>

      {/* Demo Credentials Box */}
      <section className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-8 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-400" />
              <span>Seeded Demo Credentials</span>
            </h3>
            <p className="text-slate-300 text-sm max-w-xl">
              Log into the host dashboard to manage event types, configure custom multi-window availability, manage date overrides, and view or cancel bookings.
            </p>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 font-mono text-sm space-y-1.5 w-full md:w-auto">
            <div className="text-slate-400 text-xs uppercase tracking-wide">Demo Host Account</div>
            <div>
              <span className="text-slate-400">Email: </span>
              <span className="text-emerald-400 font-semibold">alex@slotbook.dev</span>
            </div>
            <div>
              <span className="text-slate-400">Password: </span>
              <span className="text-emerald-400 font-semibold">password123</span>
            </div>
            <Link
              href="/login"
              className="inline-block mt-2 text-xs text-indigo-300 hover:text-white underline font-sans"
            >
              Go to Host Login &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Core Engineering Features Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-bold text-slate-900">PostgreSQL Concurrency</h4>
          <p className="text-sm text-slate-600">
            One-on-one slots are locked via <code>btree_gist</code> exclusion constraints on <code>tstzrange</code> with buffers.
            Group capacity is serialized via atomic row-level locking (<code>SELECT ... FOR UPDATE</code>).
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Zap className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-bold text-slate-900">Atomic 5-Min Holds</h4>
          <p className="text-sm text-slate-600">
            Temporary reservations expire strictly by database time (<code>clock_timestamp()</code>).
            Clients can safely retry network requests using the <code>Idempotency-Key</code> header.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
            <Clock className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-bold text-slate-900">IANA Timezone &amp; DST</h4>
          <p className="text-sm text-slate-600">
            Full Luxon IANA calendar mapping. Nonexistent spring-forward wall-clock gaps are rejected; ambiguous fall-back hours are consistently resolved.
          </p>
        </div>
      </section>

      {/* Demo Event Types */}
      <section className="space-y-4">
        <h3 className="text-2xl font-bold text-slate-900">Seeded Event Types</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="space-y-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">1-on-1</span>
              <h4 className="font-bold text-slate-900">30 Minute Quick Chat</h4>
              <p className="text-xs text-slate-500">Duration: 30m | Capacity: 1 | Buffers: 10m before &amp; after</p>
            </div>
            <Link
              href="/alex@slotbook.dev/30-min-chat"
              className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <span>Book this slot</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="space-y-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">1-on-1</span>
              <h4 className="font-bold text-slate-900">60 Minute Strategy Session</h4>
              <p className="text-xs text-slate-500">Duration: 60m | Capacity: 1 | Buffers: 15m before &amp; after</p>
            </div>
            <Link
              href="/alex@slotbook.dev/strategy-session"
              className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <span>Book this slot</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="space-y-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">Group Capacity: 4</span>
              <h4 className="font-bold text-slate-900">Group Product Workshop</h4>
              <p className="text-xs text-slate-500">Duration: 45m | Capacity: 4 | Serialized row-level locks</p>
            </div>
            <Link
              href="/alex@slotbook.dev/team-workshop"
              className="mt-4 text-sm font-semibold text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
            >
              <span>Book group seat</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
