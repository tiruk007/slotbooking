"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Users,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react";

export default function HostDashboardPage() {
  const [host, setHost] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [meRes, eventsRes, bookingsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/dashboard/events"),
          fetch("/api/dashboard/bookings?status=UPCOMING"),
        ]);

        if (meRes.ok) {
          const d = await meRes.json();
          setHost(d.data.host);
        }
        if (eventsRes.ok) {
          const d = await eventsRes.json();
          setEvents(d.data.eventTypes || []);
        }
        if (bookingsRes.ok) {
          const d = await bookingsRes.json();
          setBookings(d.data.bookings || []);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        Loading dashboard metrics...
      </div>
    );
  }

  const publishedCount = events.filter((e) => e.status === "PUBLISHED").length;
  const totalHours = bookings.reduce((acc, b) => {
    const diff = (new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / (1000 * 60 * 60);
    return acc + diff;
  }, 0);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Host Workspace</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Welcome back, {host?.name || "Host"}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Primary timezone: <strong className="text-slate-700">{host?.homeTimezone || "UTC"}</strong> &bull; {host?.email}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/host/events/new"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Event</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Event Types</span>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{events.length}</span>
            <span className="text-xs text-slate-400 font-medium">({publishedCount} published)</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Upcoming Bookings</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{bookings.length}</span>
            <span className="text-xs text-emerald-600 font-semibold">confirmed</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Scheduled Hours</span>
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{totalHours.toFixed(1)}</span>
            <span className="text-xs text-slate-400 font-medium">hours</span>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Events Overview */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Your Appointment Types</h2>
            <Link href="/host/events" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {events.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-xs text-slate-400">You haven't created any events yet.</p>
              <Link
                href="/host/events/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Your First Event</span>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {events.slice(0, 3).map((e) => (
                <div key={e.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs text-slate-900">{e.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {e.durationMinutes}m &bull; {e.capacity > 1 ? `Group (${e.capacity})` : "1-on-1"}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    e.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {e.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Bookings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Next Upcoming Appointments</h2>
            <Link href="/host/bookings" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {bookings.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No upcoming appointments scheduled.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {bookings.slice(0, 3).map((b) => (
                <div key={b.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs text-slate-900">{b.eventName} with {b.guestName}</div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(b.startAt).toLocaleDateString()} at {new Date(b.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {b.meetLink ? (
                    <a
                      href={b.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <span>Join Meet</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[10px] text-slate-400">In-Person/Custom</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
