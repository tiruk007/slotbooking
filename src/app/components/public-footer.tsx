"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, CheckCircle2 } from "lucide-react";

export function PublicFooter() {
  const pathname = usePathname();

  // If in the Host Portal, do not render public footer
  if (pathname.startsWith("/host")) {
    return null;
  }

  return (
    <footer className="border-t border-slate-200 bg-white py-12 text-sm text-slate-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center space-x-2 font-bold text-lg text-slate-900">
              <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white">
                <Calendar className="w-4 h-4" />
              </div>
              <span>Slotbook</span>
            </div>
            <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
              Simple scheduling. Seamless meetings. Connecting hosts and clients with conflict-free appointments and automated reminders.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 text-xs uppercase tracking-wider mb-3">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/events" className="hover:text-indigo-600">Explore Events</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-indigo-600">How It Works</Link></li>
              <li><Link href="/become-a-host" className="hover:text-indigo-600">Become a Host</Link></li>
              <li>
                <Link
                  href="/host/login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-indigo-600"
                >
                  Hosts Portal
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 text-xs uppercase tracking-wider mb-3">Reliability &amp; Security</h4>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-1.5 text-slate-500">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Zero Double-Booking Guarantee</span>
              </li>
              <li className="flex items-center gap-1.5 text-slate-500">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Passwordless Email OTP Security</span>
              </li>
              <li className="flex items-center gap-1.5 text-slate-500">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Private Guest Magic Management</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
          <p>&copy; {new Date().getFullYear()} Slotbook Inc. Simple scheduling, seamless meetings.</p>
          <div className="flex space-x-6">
            <span className="text-slate-400">High-Reliability PostgreSQL Engine</span>
            <span className="text-slate-400">&bull;</span>
            <span className="text-slate-400">Timezone-Aware Scheduling</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
