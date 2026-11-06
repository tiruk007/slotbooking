import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { Calendar, User, ArrowRight, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Slotbook — Simple scheduling. Seamless meetings.",
  description: "Effortless, conflict-free appointment scheduling for professionals and teams.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased font-sans">
        <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-40 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2.5 font-bold text-xl text-indigo-600 hover:text-indigo-700 transition">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="tracking-tight text-slate-900 font-extrabold text-xl">Slotbook</span>
            </Link>

            <nav className="flex items-center space-x-3 sm:space-x-5 text-sm font-medium">
              <Link
                href="/#how-it-works"
                className="hidden sm:inline-block text-slate-600 hover:text-slate-900 transition"
              >
                How It Works
              </Link>
              <Link
                href="/#appointment-types"
                className="hidden sm:inline-block text-slate-600 hover:text-slate-900 transition"
              >
                Appointments
              </Link>
              <Link
                href="/register"
                className="text-slate-700 hover:text-indigo-600 font-semibold transition"
              >
                Become a Host
              </Link>
              <Link
                href="/login"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition shadow-xs flex items-center space-x-1.5 font-semibold text-xs sm:text-sm"
              >
                <User className="w-4 h-4" />
                <span>Hosts Login</span>
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

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
                  <li><Link href="/#how-it-works" className="hover:text-indigo-600">How It Works</Link></li>
                  <li><Link href="/#appointment-types" className="hover:text-indigo-600">Event Types</Link></li>
                  <li><Link href="/register" className="hover:text-indigo-600">Host Registration</Link></li>
                  <li><Link href="/login" className="hover:text-indigo-600">Hosts Login</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 text-xs uppercase tracking-wider mb-3">Security &amp; Privacy</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-1.5 text-slate-500">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Private Guest Magic Links</span>
                  </li>
                  <li className="flex items-center gap-1.5 text-slate-500">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Email OTP Authentication</span>
                  </li>
                  <li className="flex items-center gap-1.5 text-slate-500">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Zero Double-Booking Guarantee</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
              <p>&copy; {new Date().getFullYear()} Slotbook Inc. All rights reserved.</p>
              <p>Simple scheduling. Seamless meetings.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
