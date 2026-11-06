import Link from "next/link";
import {
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Users,
  Video,
  Globe,
} from "lucide-react";

export default function BecomeAHostPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 space-y-16">
      {/* Hero Header */}
      <div className="text-center space-y-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold tracking-wide shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Host With Slotbook</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
          Share your schedule. <br />
          <span className="text-indigo-600">Eliminate back-and-forth.</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
          Slotbook gives you total control over your availability. Set recurring windows, buffer times, minimum notice, and connect Google Meet for automated video links.
        </p>

        <div className="pt-2">
          <Link
            href="/host/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/30 text-base transition"
          >
            <span>Create Your Host Account</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-slate-400 mt-2">
            Free &bull; Passwordless email OTP &bull; Opens in a separate host portal tab
          </p>
        </div>
      </div>

      {/* Feature Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Custom Buffer Times</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Never get booked back-to-back without a break. Define buffer-before and buffer-after minutes that apply automatically across all your meetings.
          </p>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Zero Double Bookings</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            PostgreSQL GiST exclusion locks your slot interval at the database layer. Even concurrent simultaneous clicks cannot consume the same slot.
          </p>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Video className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Google Meet Integration</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Connect your own Google Calendar account. Confirmed appointments automatically generate live Google Meet links included in client confirmations.
          </p>
        </div>
      </div>

      {/* How it works for hosts */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-xs space-y-8">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl font-black text-slate-900">How Hosting Works</h2>
          <p className="text-xs text-slate-500">Three easy steps to start accepting client bookings.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
              1
            </div>
            <h4 className="font-bold text-sm text-slate-900">Verify Your Account</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Sign up with your name and email. Confirm your email with a secure 6-digit OTP code. No password to remember.
            </p>
          </div>

          <div className="space-y-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
              2
            </div>
            <h4 className="font-bold text-sm text-slate-900">Define Appointment Types</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Create 1-on-1 consultations or group sessions. Set duration, notice, buffers, and publish when ready.
            </p>
          </div>

          <div className="space-y-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
              3
            </div>
            <h4 className="font-bold text-sm text-slate-900">Share &amp; Get Booked</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your events appear on the public discovery page and your personal booking URL. Clients book and receive instant calendar confirmations.
            </p>
          </div>
        </div>

        <div className="pt-6 text-center border-t border-slate-100">
          <Link
            href="/host/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition"
          >
            <span>Get Started Now</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
