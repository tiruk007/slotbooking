"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Globe,
  Users,
  Copy,
  Check,
} from "lucide-react";

const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

const WEEKDAYS = [
  { id: 1, name: "Monday" },
  { id: 2, name: "Tuesday" },
  { id: 3, name: "Wednesday" },
  { id: 4, name: "Thursday" },
  { id: 5, name: "Friday" },
  { id: 6, name: "Saturday" },
  { id: 7, name: "Sunday" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"events" | "availability" | "overrides" | "bookings">("events");
  const [host, setHost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Event types state
  const [eventTypes, setEventTypes] = useState<any[]>([]);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    name: "",
    slug: "",
    durationMinutes: 30,
    capacity: 1,
    bufferBefore: 0,
    bufferAfter: 0,
    minimumNoticeMinutes: 60,
    bookingHorizonDays: 30,
  });

  // Availability state
  const [rules, setRules] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [homeTimezone, setHomeTimezone] = useState("UTC");

  // Bookings state
  const [bookings, setBookings] = useState<any[]>([]);
  const [cancelModalBooking, setCancelModalBooking] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // New Override form state
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideAvailable, setNewOverrideAvailable] = useState(false);
  const [newOverrideStart, setNewOverrideStart] = useState("09:00");
  const [newOverrideEnd, setNewOverrideEnd] = useState("17:00");

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  useEffect(() => {
    loadHostSession();
  }, []);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadHostSession = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setHost(data.host);
      setHomeTimezone(data.host.homeTimezone);
      await Promise.all([loadEvents(), loadAvailability(), loadBookings()]);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    const res = await fetch("/api/dashboard/events");
    if (res.ok) {
      const data = await res.json();
      setEventTypes(data.eventTypes || []);
    }
  };

  const loadAvailability = async () => {
    const res = await fetch("/api/dashboard/availability");
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules || []);
      setOverrides(data.overrides || []);
      if (data.homeTimezone) setHomeTimezone(data.homeTimezone);
    }
  };

  const loadBookings = async () => {
    const res = await fetch("/api/dashboard/bookings");
    if (res.ok) {
      const data = await res.json();
      setBookings(data.bookings || []);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const handleSaveTimezone = async (tz: string) => {
    setHomeTimezone(tz);
    const res = await fetch("/api/dashboard/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeTimezone: tz, rules, overrides }),
    });
    if (res.ok) {
      showMsg("Home timezone updated successfully");
    } else {
      showMsg("Failed to update timezone", "error");
    }
  };

  // Event modal handlers
  const openCreateEvent = () => {
    setEditingEvent(null);
    setEventForm({
      name: "",
      slug: "",
      durationMinutes: 30,
      capacity: 1,
      bufferBefore: 0,
      bufferAfter: 0,
      minimumNoticeMinutes: 60,
      bookingHorizonDays: 30,
    });
    setIsEventModalOpen(true);
  };

  const openEditEvent = (ev: any) => {
    setEditingEvent(ev);
    setEventForm({
      name: ev.name,
      slug: ev.slug,
      durationMinutes: ev.durationMinutes,
      capacity: ev.capacity,
      bufferBefore: ev.bufferBefore,
      bufferAfter: ev.bufferAfter,
      minimumNoticeMinutes: ev.minimumNoticeMinutes,
      bookingHorizonDays: ev.bookingHorizonDays,
    });
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingEvent ? `/api/dashboard/events/${editingEvent.id}` : "/api/dashboard/events";
    const method = editingEvent ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventForm),
    });

    const data = await res.json();
    if (res.ok) {
      showMsg(editingEvent ? "Event updated" : "Event created");
      setIsEventModalOpen(false);
      loadEvents();
    } else {
      showMsg(data?.error?.message || "Failed to save event", "error");
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Are you sure you want to delete this event type?")) return;
    const res = await fetch(`/api/dashboard/events/${id}`, { method: "DELETE" });
    if (res.ok) {
      showMsg("Event deleted");
      loadEvents();
    } else {
      showMsg("Failed to delete event", "error");
    }
  };

  // Availability Window Handlers
  const addWindow = (weekday: number) => {
    const newRule = { weekday, startTime: "09:00:00", endTime: "17:00:00" };
    setRules([...rules, newRule]);
  };

  const removeWindow = (index: number) => {
    const updated = [...rules];
    updated.splice(index, 1);
    setRules(updated);
  };

  const updateWindow = (index: number, field: "startTime" | "endTime", value: string) => {
    const updated = [...rules];
    const formatted = value.length === 5 ? `${value}:00` : value;
    updated[index][field] = formatted;
    setRules(updated);
  };

  const handleSaveAvailability = async () => {
    const res = await fetch("/api/dashboard/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        homeTimezone,
        rules: rules.map((r) => ({
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
        })),
        overrides: overrides.map((o) => ({
          overrideDate: o.overrideDate,
          isAvailable: o.isAvailable,
          customStartTime: o.customStartTime || null,
          customEndTime: o.customEndTime || null,
        })),
      }),
    });

    if (res.ok) {
      showMsg("Weekly availability rules saved!");
    } else {
      const data = await res.json();
      showMsg(data?.error?.message || "Failed to save availability", "error");
    }
  };

  // Date Overrides Handlers
  const handleAddOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOverrideDate) return;

    const newOverride = {
      overrideDate: newOverrideDate,
      isAvailable: newOverrideAvailable,
      customStartTime: newOverrideAvailable ? (newOverrideStart.length === 5 ? `${newOverrideStart}:00` : newOverrideStart) : null,
      customEndTime: newOverrideAvailable ? (newOverrideEnd.length === 5 ? `${newOverrideEnd}:00` : newOverrideEnd) : null,
    };

    const updatedOverrides = [...overrides.filter((o) => o.overrideDate !== newOverrideDate), newOverride];
    setOverrides(updatedOverrides);

    const res = await fetch("/api/dashboard/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeTimezone, rules, overrides: updatedOverrides }),
    });

    if (res.ok) {
      showMsg("Date override added!");
      setNewOverrideDate("");
    } else {
      showMsg("Failed to add override", "error");
    }
  };

  const handleDeleteOverride = async (overrideDate: string) => {
    const updated = overrides.filter((o) => o.overrideDate !== overrideDate);
    setOverrides(updated);
    const res = await fetch("/api/dashboard/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeTimezone, rules, overrides: updated }),
    });
    if (res.ok) {
      showMsg("Override removed");
    }
  };

  // Host Cancel Booking
  const handleCancelBooking = async () => {
    if (!cancelModalBooking) return;
    const res = await fetch(`/api/dashboard/bookings/${cancelModalBooking.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason || "Cancelled by host" }),
    });

    if (res.ok) {
      showMsg("Booking cancelled");
      setCancelModalBooking(null);
      setCancelReason("");
      loadBookings();
    } else {
      const data = await res.json();
      showMsg(data?.error?.message || "Failed to cancel booking", "error");
    }
  };

  const copyBookingLink = (slug: string) => {
    const url = `${window.location.origin}/${encodeURIComponent(host.email)}/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
    showMsg("Booking URL copied to clipboard!");
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Alert toast */}
      {msg && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-lg border flex items-center gap-2 text-sm font-medium ${
            msg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {msg.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Header Profile & Timezone */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{host?.name}&apos;s Dashboard</h1>
          <p className="text-sm text-slate-500">{host?.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Globe className="w-4 h-4 text-indigo-600" />
            <label className="text-xs font-semibold text-slate-600 uppercase">Home TZ:</label>
            <select
              value={homeTimezone}
              onChange={(e) => handleSaveTimezone(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-800 focus:outline-none cursor-pointer"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleLogout}
            className="px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-8 text-sm font-medium">
        <button
          onClick={() => setActiveTab("events")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "events"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Event Types ({eventTypes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("availability")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "availability"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Weekly Availability</span>
        </button>

        <button
          onClick={() => setActiveTab("overrides")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "overrides"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Date Overrides ({overrides.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("bookings")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "bookings"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Bookings ({bookings.length})</span>
        </button>
      </div>

      {/* TAB 1: EVENT TYPES */}
      {activeTab === "events" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Configured Event Types</h2>
            <button
              onClick={openCreateEvent}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Event Type</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventTypes.map((ev) => (
              <div
                key={ev.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        ev.capacity > 1
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      }`}
                    >
                      {ev.capacity > 1 ? `Group (Cap: ${ev.capacity})` : "1-on-1"}
                    </span>
                    <span className="text-xs text-slate-500">{ev.durationMinutes} mins</span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg">{ev.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">/{ev.slug}</p>

                  <div className="text-xs text-slate-600 space-y-1 pt-2 border-t border-slate-100">
                    <div>
                      Buffers: {ev.bufferBefore}m before &bull; {ev.bufferAfter}m after
                    </div>
                    <div>
                      Notice: {ev.minimumNoticeMinutes}m &bull; Horizon: {ev.bookingHorizonDays} days
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => copyBookingLink(ev.slug)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    {copiedSlug === ev.slug ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSlug === ev.slug ? "Copied" : "Copy Link"}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditEvent(ev)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-md hover:bg-slate-100 transition"
                      title="Edit Event"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(ev.id)}
                      className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50 transition"
                      title="Delete Event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: WEEKLY AVAILABILITY */}
      {activeTab === "availability" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Weekly Schedule Windows</h2>
              <p className="text-xs text-slate-500">
                Configure multiple operating windows per weekday in your home timezone ({homeTimezone}).
              </p>
            </div>
            <button
              onClick={handleSaveAvailability}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
            >
              Save Weekly Availability
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {WEEKDAYS.map((day) => {
              const dayRules = rules
                .map((r, idx) => ({ ...r, originalIndex: idx }))
                .filter((r) => r.weekday === day.id);

              return (
                <div key={day.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="w-32 font-semibold text-sm text-slate-800">{day.name}</div>

                  <div className="flex-1 space-y-2">
                    {dayRules.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">Unavailable</span>
                    ) : (
                      dayRules.map((rule) => (
                        <div key={rule.originalIndex} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={rule.startTime.slice(0, 5)}
                            onChange={(e) => updateWindow(rule.originalIndex, "startTime", e.target.value)}
                            className="border border-slate-300 rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                          />
                          <span className="text-xs text-slate-400">to</span>
                          <input
                            type="time"
                            value={rule.endTime.slice(0, 5)}
                            onChange={(e) => updateWindow(rule.originalIndex, "endTime", e.target.value)}
                            className="border border-slate-300 rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeWindow(rule.originalIndex)}
                            className="text-slate-400 hover:text-red-500 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => addWindow(day.id)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 self-start md:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Window</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: DATE OVERRIDES */}
      {activeTab === "overrides" && (
        <div className="space-y-6">
          {/* Add Override Form */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Add Date-Specific Override</h2>
            <p className="text-xs text-slate-500">
              Mark specific calendar dates as unavailable (vacation/holiday) or set custom operating windows.
            </p>

            <form onSubmit={handleAddOverride} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={newOverrideDate}
                  onChange={(e) => setNewOverrideDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Status</label>
                <select
                  value={newOverrideAvailable ? "available" : "unavailable"}
                  onChange={(e) => setNewOverrideAvailable(e.target.value === "available")}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="unavailable">Mark Unavailable (Blocked)</option>
                  <option value="available">Custom Working Hours</option>
                </select>
              </div>

              {newOverrideAvailable && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Start Time</label>
                    <input
                      type="time"
                      value={newOverrideStart}
                      onChange={(e) => setNewOverrideStart(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">End Time</label>
                    <input
                      type="time"
                      value={newOverrideEnd}
                      onChange={(e) => setNewOverrideEnd(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition shadow-sm"
              >
                Add Override
              </button>
            </form>
          </div>

          {/* List Overrides */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 font-bold text-sm text-slate-900">
              Active Overrides
            </div>
            {overrides.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No active date overrides.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {overrides.map((o) => (
                  <div key={o.overrideDate} className="px-6 py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">{o.overrideDate}</span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          o.isAvailable
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {o.isAvailable ? `Custom Hours: ${o.customStartTime?.slice(0, 5)} - ${o.customEndTime?.slice(0, 5)}` : "Unavailable"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteOverride(o.overrideDate)}
                      className="text-slate-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: BOOKINGS */}
      {activeTab === "bookings" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm space-y-4">
          <div className="px-6 py-4 border-b border-slate-200 font-bold text-base text-slate-900 flex items-center justify-between">
            <span>Upcoming &amp; Past Bookings</span>
            <button onClick={loadBookings} className="text-xs text-indigo-600 font-medium hover:underline">
              Refresh
            </button>
          </div>

          {bookings.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">No bookings recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">Event</th>
                    <th className="px-6 py-3">Guest</th>
                    <th className="px-6 py-3">Time ({homeTimezone})</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-semibold text-slate-900">{b.eventName}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">{b.guestName || "Pending Hold"}</div>
                        <div className="text-xs text-slate-500">{b.guestEmail || "-"}</div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-600">
                        {new Date(b.startAt).toLocaleString("en-US", {
                          timeZone: homeTimezone,
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "numeric",
                          hour12: true,
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                            b.status === "CONFIRMED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : b.status === "HELD"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : b.status === "CANCELLED"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {b.status}
                        </span>
                        {b.cancellationReason && (
                          <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={b.cancellationReason}>
                            Reason: {b.cancellationReason}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {b.status === "CONFIRMED" && (
                          <button
                            onClick={() => setCancelModalBooking(b)}
                            className="text-xs font-semibold text-red-600 hover:text-red-800 underline"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Event Modal */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              {editingEvent ? "Edit Event Type" : "Create New Event Type"}
            </h3>

            <form onSubmit={handleSaveEvent} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Name</label>
                <input
                  type="text"
                  required
                  value={eventForm.name}
                  onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                  placeholder="30 Minute Strategy Session"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">URL Slug</label>
                <input
                  type="text"
                  required
                  value={eventForm.slug}
                  onChange={(e) => setEventForm({ ...eventForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                  placeholder="30-min-strategy"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (15-120 mins)</label>
                  <input
                    type="number"
                    min={15}
                    max={120}
                    required
                    value={eventForm.durationMinutes}
                    onChange={(e) => setEventForm({ ...eventForm, durationMinutes: parseInt(e.target.value, 10) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={eventForm.capacity}
                    onChange={(e) => setEventForm({ ...eventForm, capacity: parseInt(e.target.value, 10) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Buffer Before (mins)</label>
                  <input
                    type="number"
                    min={0}
                    value={eventForm.bufferBefore}
                    onChange={(e) => setEventForm({ ...eventForm, bufferBefore: parseInt(e.target.value, 10) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Buffer After (mins)</label>
                  <input
                    type="number"
                    min={0}
                    value={eventForm.bufferAfter}
                    onChange={(e) => setEventForm({ ...eventForm, bufferAfter: parseInt(e.target.value, 10) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Notice (mins)</label>
                  <input
                    type="number"
                    min={0}
                    value={eventForm.minimumNoticeMinutes}
                    onChange={(e) => setEventForm({ ...eventForm, minimumNoticeMinutes: parseInt(e.target.value, 10) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Booking Horizon (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={eventForm.bookingHorizonDays}
                    onChange={(e) => setEventForm({ ...eventForm, bookingHorizonDays: parseInt(e.target.value, 10) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
                >
                  Save Event Type
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Host Cancel Modal */}
      {cancelModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Cancel Booking</h3>
            <p className="text-sm text-slate-600">
              Are you sure you want to cancel the booking with{" "}
              <strong>{cancelModalBooking.guestName}</strong>?
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Cancellation Reason
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation..."
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalBooking(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                Keep Booking
              </button>
              <button
                type="button"
                onClick={handleCancelBooking}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
