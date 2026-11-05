import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { Calendar, User, Clock, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Slotbook — Production Appointment Scheduling",
  description: "Calendly-style appointment booking system with PostgreSQL database concurrency safety",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2.5 font-bold text-xl text-indigo-600 hover:text-indigo-700">
              <Calendar className="w-6 h-6" />
              <span>Slotbook</span>
            </Link>

            <nav className="flex items-center space-x-4 text-sm font-medium">
              <Link
                href="/alex@slotbook.dev/30-min-chat"
                className="text-slate-600 hover:text-slate-900 transition flex items-center space-x-1"
              >
                <Clock className="w-4 h-4" />
                <span>Demo Booking</span>
              </Link>
              <Link
                href="/dashboard"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-md transition shadow-sm flex items-center space-x-1.5"
              >
                <User className="w-4 h-4" />
                <span>Host Dashboard</span>
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Database Concurrency Enforced via PostgreSQL GiST Exclusion &amp; Row-Level Locks</span>
            </p>
            <p>Slotbook &bull; Production Full-Stack Scheduling Engine</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
