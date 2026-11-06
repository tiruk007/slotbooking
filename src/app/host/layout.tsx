"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar,
  Layers,
  Clock,
  BookOpen,
  Settings,
  Link2,
  LogOut,
  User,
  Shield,
  Menu,
  X,
} from "lucide-react";

interface HostSession {
  id: string;
  name: string;
  email: string;
  homeTimezone: string;
}

export default function HostPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [host, setHost] = useState<HostSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAuthRoute =
    pathname === "/host/login" ||
    pathname === "/host/signup" ||
    pathname === "/host/verify-otp";

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          const hostSession = data?.data?.host || data?.host;
          if (hostSession) {
            setHost(hostSession);
          } else if (!isAuthRoute) {
            router.push(`/host/login?returnUrl=${encodeURIComponent(pathname)}`);
          }
        } else if (!isAuthRoute) {
          router.push(`/host/login?returnUrl=${encodeURIComponent(pathname)}`);
        }
      } catch {
        if (!isAuthRoute) {
          router.push("/host/login");
        }
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [pathname, isAuthRoute, router]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/host/login");
    }
  }

  // If on login/signup/verify, render children directly with a clean centered wrapper
  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-between text-slate-100">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2.5 font-bold text-lg text-indigo-400">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-white font-extrabold tracking-tight">Slotbook Host Portal</span>
            </Link>
            <Link href="/" className="text-xs text-slate-400 hover:text-white transition">
              &larr; Back to Public Site
            </Link>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">{children}</main>

        <footer className="py-6 text-center text-xs text-slate-500 border-t border-slate-800/60">
          Slotbook Host Portal &bull; Secure Email OTP Authentication
        </footer>
      </div>
    );
  }

  const navLinks = [
    { label: "Overview", href: "/host/dashboard", icon: Layers },
    { label: "My Events", href: "/host/events", icon: Calendar },
    { label: "Availability", href: "/host/availability", icon: Clock },
    { label: "Bookings", href: "/host/bookings", icon: BookOpen },
    { label: "Settings", href: "/host/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Host Navigation Bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link href="/host/dashboard" className="flex items-center space-x-2.5 font-bold text-lg text-slate-900">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-slate-900">Slotbook</span>
                <span className="ml-1.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider">
                  Host Portal
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              {navLinks.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== "/host/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Header Items */}
          <div className="hidden md:flex items-center space-x-4">
            {host && (
              <div className="text-right">
                <div className="text-xs font-bold text-slate-900">{host.name}</div>
                <div className="text-[10px] text-slate-500">{host.homeTimezone}</div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 rounded-lg hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold ${
                    isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Host Portal Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            Loading host workspace...
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

