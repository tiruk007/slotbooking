import Link from "next/link";
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
  Zap,
} from "lucide-react";

export default function HomePage() {
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
            href="/register"
            className="w-full sm:w-auto px-7 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-sm transition flex items-center justify-center space-x-2 text-sm sm:text-base"
          >
            <span>Create Your Account</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/#appointment-types"
            className="w-full sm:w-auto px-7 py-3.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-xl shadow-xs transition flex items-center justify-center space-x-2 text-sm sm:text-base"
          >
            <CalendarCheck className="w-4 h-4 text-indigo-600" />
            <span>Book an Appointment</span>
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
            <span>Timezone auto-detection</span>
          </div>
        </div>
      </section>

      {/* 2. How Slotbook Works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-12">
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Effortless Flow</span>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">How Slotbook Works</h2>
          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            Booking a meeting should be quick and frictionless for both hosts and guests.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-2xl border border-slate-200/90 shadow-xs space-y-4 relative">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-lg">
              1
            </div>
            <h3 className="text-lg font-bold text-slate-900">Define Your Availability</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Set your weekly working windows, buffers between appointments, and mark vacation days with simple date overrides.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-200/90 shadow-xs space-y-4 relative">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-lg">
              2
            </div>
            <h3 className="text-lg font-bold text-slate-900">Share Your Personal Link</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Send your booking link to clients or team members. Guests pick any open slot adjusted directly to their local timezone.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-200/90 shadow-xs space-y-4 relative">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-lg">
              3
            </div>
            <h3 className="text-lg font-bold text-slate-900">Meet with Confidence</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Both parties receive instant email confirmations with meeting details, agenda notes, and private self-serve reschedule links.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Available Appointment Types */}
      <section id="appointment-types" className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-12">
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Appointments</span>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Available Appointment Types</h2>
          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            Choose the format that fits your discussion needs. Book instantly below.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  1-on-1 Session
                </span>
                <Clock className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">30 Min Appointment</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Ideal for quick check-ins, brief introductory calls, or focused advice sessions.
                </p>
              </div>
              <div className="text-xs text-slate-400 font-medium">
                Duration: 30 minutes &bull; 10 min buffer
              </div>
            </div>

            <Link
              href="/alex@slotbook.dev/30-min-appointment"
              className="mt-6 w-full py-2.5 px-4 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-semibold rounded-xl text-sm transition flex items-center justify-center space-x-2"
            >
              <span>Book Appointment</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Card 2 */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-indigo-200 shadow-xs flex flex-col justify-between hover:border-indigo-400 transition group relative">
            <div className="absolute -top-3 right-6 bg-indigo-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Popular
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  1-on-1 Deep Dive
                </span>
                <Clock className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">1 Hr Appointment</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Comprehensive consultation, technical design review, or deep-dive mentorship session.
                </p>
              </div>
              <div className="text-xs text-slate-400 font-medium">
                Duration: 60 minutes &bull; 15 min buffer
              </div>
            </div>

            <Link
              href="/alex@slotbook.dev/1-hr-appointment"
              className="mt-6 w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center space-x-2 shadow-xs"
            >
              <span>Book Appointment</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Card 3 */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between hover:border-emerald-300 transition group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  Group Session
                </span>
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Group Discussion</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Interactive multi-attendee session for team alignment, collaborative workshops, or open Q&amp;A.
                </p>
              </div>
              <div className="text-xs text-slate-400 font-medium">
                Duration: 45 minutes &bull; Capacity: Up to 4 guests
              </div>
            </div>

            <Link
              href="/alex@slotbook.dev/group-discussion"
              className="mt-6 w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white font-semibold rounded-xl text-sm transition flex items-center justify-center space-x-2"
            >
              <span>Join Discussion</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Benefits Section (Hosts & Guests) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Benefits for Hosts */}
          <div className="bg-gradient-to-br from-indigo-50/60 to-white p-8 rounded-2xl border border-indigo-100 shadow-xs space-y-6">
            <div className="inline-flex p-3 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-900">Built for Busy Hosts</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Take full control of your calendar without spending hours coordinating emails.
              </p>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <span><strong>Buffer Protection:</strong> Automatic rest periods before and after every meeting so you never feel rushed.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <span><strong>Date Overrides:</strong> Mark individual days off or set custom working hours with a single click.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <span><strong>Passwordless OTP Security:</strong> Sign in securely using instant email verification codes.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <span><strong>Multiple Event Types:</strong> Create custom durations, 1-on-1 sessions, and group workshops.</span>
              </li>
            </ul>
          </div>

          {/* Benefits for Guests */}
          <div className="bg-gradient-to-br from-slate-50 to-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <div className="inline-flex p-3 rounded-xl bg-slate-900 text-white shadow-xs">
              <Globe className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-900">Seamless for Your Guests</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                A delightful booking experience that respects your clients' time and privacy.
              </p>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-slate-900 flex-shrink-0 mt-0.5" />
                <span><strong>No Account Needed:</strong> Guests book appointments in seconds with just their name and verified email.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-slate-900 flex-shrink-0 mt-0.5" />
                <span><strong>Timezone Intelligence:</strong> Times automatically convert to the guest's local clock to eliminate confusion.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-slate-900 flex-shrink-0 mt-0.5" />
                <span><strong>Self-Service Management:</strong> Private magic links let guests reschedule or cancel on their own terms.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-slate-900 flex-shrink-0 mt-0.5" />
                <span><strong>Clear Meeting Agenda:</strong> Specify discussion goals upfront so every meeting is productive.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 5. Bottom Call to Action */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-14 text-center space-y-6 shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-4 max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Ready to simplify your scheduling?
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Create your host profile in seconds with email verification. No credit card required.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-md flex items-center justify-center space-x-2 text-sm sm:text-base"
              >
                <span>Become a Host</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition text-sm sm:text-base border border-slate-700"
              >
                <span>Hosts Login</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
