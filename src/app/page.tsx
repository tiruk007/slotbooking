import Link from "next/link";
import { getPool } from "@/db";
import {
  Calendar,
  Clock,
  Users,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Globe,
  Bell,
  CalendarCheck,
  Video,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function getLatestEvents() {
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT e.id, e.name, e.slug, e.description, e.category, e.status,
              e.duration_minutes, e.capacity, e.buffer_before, e.buffer_after,
              e.created_at,
              h.id as host_id, h.name as host_name, h.email as host_email,
              COALESCE(h.slug, h.email) as host_slug
       FROM event_types e
       JOIN hosts h ON e.host_id = h.id
       WHERE e.status = 'PUBLISHED' 
         AND h.status = 'ACTIVE'
       ORDER BY e.created_at DESC
       LIMIT 3`
    );
    return res.rows;
  } catch (err) {
    console.error("Failed to query latest events for homepage:", err);
    return [];
  }
}

export default async function HomePage() {
  const latestEvents = await getLatestEvents();

  return (
    <div className="space-y-24 py-12 sm:py-16">
      {/* 1. Hero Section */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-6 pt-4">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold tracking-wide shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Simple scheduling &bull; Seamless meetings</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
          Schedule meetings without the <br className="hidden sm:inline" />
          <span className="text-indigo-600">back-and-forth</span>
        </h1>

        <p className="max-w-2xl mx-auto text-base sm:text-xl text-slate-600 leading-relaxed font-normal">
          Make time for what matters. Slotbook simplifies appointment booking with instant availability, automated confirmations, and conflict-free calendar management.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4">
          <Link
            href="/become-a-host"
            className="w-full sm:w-auto px-7 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-sm transition flex items-center justify-center space-x-2 text-sm sm:text-base"
          >
            <span>Become a Host</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/events"
            className="w-full sm:w-auto px-7 py-3.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-xl shadow-xs transition flex items-center justify-center space-x-2 text-sm sm:text-base"
          >
            <CalendarCheck className="w-4 h-4 text-indigo-600" />
            <span>Explore Events</span>
          </Link>
        </div>

        <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-slate-500 font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>No account required for guests</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Automated email confirmations</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Zero double-booking guarantee</span>
          </div>
        </div>
      </section>

      {/* 2. Latest Published Events Section */}
      <section id="appointment-types" className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Available Appointment Types
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Select an appointment type to check real-time availability and reserve your slot.
            </p>
          </div>
          {latestEvents.length > 0 && (
            <Link
              href="/events"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 self-start sm:self-auto"
            >
              <span>View All Events</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {latestEvents.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <Calendar className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">No events available right now.</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Verified hosts have not published any active appointments yet. Check back soon or create your own host account.
              </p>
            </div>
            <Link
              href="/become-a-host"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              <span>Become a Host</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${
            latestEvents.length === 1
              ? "max-w-md mx-auto"
              : latestEvents.length === 2
              ? "sm:grid-cols-2 max-w-3xl mx-auto"
              : "sm:grid-cols-3"
          } gap-6`}>
            {latestEvents.map((e) => (
              <div
                key={e.id}
                className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between hover:border-indigo-300 hover:shadow-md transition group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {e.category || "One-on-One"}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{e.duration_minutes}m</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition tracking-tight">
                      {e.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                      {e.description || "General consultation or meeting session."}
                    </p>
                  </div>

                  <div className="space-y-1 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Host:</span>
                      <span className="font-bold text-slate-800">{e.host_name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Capacity:</span>
                      <span className="font-semibold text-slate-700">
                        {e.capacity > 1 ? `Group (${e.capacity})` : "1-on-1"}
                      </span>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/events/${e.slug}`}
                  className="mt-6 w-full py-2.5 px-4 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2"
                >
                  <span>Book Now</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. How Slotbook Works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
            Seamless Workflow
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            How Slotbook Works
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm">
            Three simple steps designed to give both hosts and guests a frictionless scheduling experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Step 1 */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs relative space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-lg">
              1
            </div>
            <h3 className="text-lg font-bold text-slate-900">1. Select Appointment</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Browse published sessions, choose an appointment type, and pick a date in your preferred local timezone.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs relative space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-lg">
              2
            </div>
            <h3 className="text-lg font-bold text-slate-900">2. Hold &amp; Verify Email</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your chosen slot is temporarily held for 5 minutes. Enter your contact info and 6-digit email security code.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs relative space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-lg">
              3
            </div>
            <h3 className="text-lg font-bold text-slate-900">3. Confirmed &amp; Connected</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Instantly receive confirmation with calendar details, Google Meet link, and a private magic link to manage plans.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Benefits Section (Hosts & Guests) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Benefits for Hosts */}
          <div className="bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 shadow-xs space-y-6">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                For Hosts &amp; Professionals
              </span>
              <h3 className="text-2xl font-black text-slate-900">Take Control of Your Schedule</h3>
              <p className="text-sm text-slate-500">Eliminate manual coordination and protect your calendar from unwanted meeting overload.</p>
            </div>

            <ul className="space-y-4">
              <li className="flex items-start space-x-3 text-sm text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Automatic Meeting Buffers:</strong> Enforce 10-15 minute rest intervals between adjacent and cross-event calls.
                </div>
              </li>
              <li className="flex items-start space-x-3 text-sm text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Custom Notice &amp; Horizon Limits:</strong> Prevent surprise last-minute bookings and limit bookings to 30-60 days.
                </div>
              </li>
              <li className="flex items-start space-x-3 text-sm text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Google Meet Integration:</strong> Connect Google Calendar to auto-generate conferencing links without manual entry.
                </div>
              </li>
              <li className="flex items-start space-x-3 text-sm text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Flexible Working Windows:</strong> Set morning and afternoon availability with custom day-off overrides.
                </div>
              </li>
            </ul>
          </div>

          {/* Benefits for Guests */}
          <div className="bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 shadow-xs space-y-6">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                For Clients &amp; Guests
              </span>
              <h3 className="text-2xl font-black text-slate-900">Effortless, Account-Free Booking</h3>
              <p className="text-sm text-slate-500">Reserve appointments in seconds without passwords or mandatory profile setups.</p>
            </div>

            <ul className="space-y-4">
              <li className="flex items-start space-x-3 text-sm text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong>No Account Required:</strong> Guests book directly using just a verified email address.
                </div>
              </li>
              <li className="flex items-start space-x-3 text-sm text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Automatic Timezone Adjustment:</strong> View all slots converted to your local time automatically.
                </div>
              </li>
              <li className="flex items-start space-x-3 text-sm text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong>5-Minute Protected Hold:</strong> Your selected time is guaranteed while you complete your details.
                </div>
              </li>
              <li className="flex items-start space-x-3 text-sm text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Private Magic Reschedule Link:</strong> Change plans or cancel easily anytime via your secure booking URL.
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 5. Bottom Call to Action */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="bg-gradient-to-br from-indigo-900 to-slate-950 rounded-3xl p-8 sm:p-12 text-center text-white space-y-6 shadow-xl">
          <div className="inline-flex p-3 rounded-2xl bg-indigo-500/20 text-indigo-400">
            <Calendar className="w-8 h-8" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight max-w-xl mx-auto">
            Ready to streamline your appointment scheduling?
          </h2>
          <p className="text-slate-300 max-w-lg mx-auto text-sm sm:text-base leading-relaxed">
            Join hosts who rely on Slotbook for conflict-free, reliable meetings. Create your host profile today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/become-a-host"
              className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-indigo-600/30"
            >
              Get Started as a Host
            </Link>
            <Link
              href="/events"
              className="w-full sm:w-auto px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-xl text-sm transition"
            >
              Browse Public Events
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
