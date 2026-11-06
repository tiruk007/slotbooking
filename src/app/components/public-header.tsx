"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, User, ArrowRight, Sparkles } from "lucide-react";

export function PublicHeader() {
  const pathname = usePathname();

  // If in the Host Portal, do not render public header
  if (pathname.startsWith("/host")) {
    return null;
  }

  return (
    <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2.5 font-bold text-xl text-indigo-600 hover:text-indigo-700 transition">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Calendar className="w-5 h-5" />
          </div>
          <span className="tracking-tight text-slate-900 font-extrabold text-xl">Slotbook</span>
        </Link>

        <nav className="flex items-center space-x-3 sm:space-x-5 text-sm font-medium">
          <Link
            href="/events"
            className="text-slate-600 hover:text-slate-900 font-medium transition"
          >
            Explore Events
          </Link>
          <Link
            href="/#how-it-works"
            className="hidden sm:inline-block text-slate-600 hover:text-slate-900 transition"
          >
            How It Works
          </Link>
          <Link
            href="/become-a-host"
            className="text-slate-700 hover:text-indigo-600 font-semibold transition"
          >
            Become a Host
          </Link>
          <Link
            href="/host/login"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition shadow-xs flex items-center space-x-1.5 font-semibold text-xs sm:text-sm"
          >
            <User className="w-4 h-4" />
            <span>Hosts Login</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

