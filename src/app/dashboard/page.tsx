"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  LayoutDashboard,
  CalendarDays,
  Sliders,
  Settings,
  MessageSquare,
  KeyRound,
  AlertTriangle,
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
  const [activeTab, setActiveTab] = useState<"overview" | "events" | "availability" | "bookings" | "settings">("overview");
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

  // Delete event confirmation modal state
  const [deleteEventModal, setDeleteEventModal] = useState<any | null>(null);
  const [deleteEventReason, setDeleteEventReason] = useState("");
  const [deleteEventWarning, setDeleteEventWarning] = useState<string | null>(null);

  // Availability state
  const [rules, setRules] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [homeTimezone, setHomeTimezone] = useState("UTC");
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilityWarningModal, setAvailabilityWarningModal] = useState<any | null>(null);

  // New Override form state
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideAvailable, setNewOverrideAvailable] = useState(false);
  const [newOverrideStart, setNewOverrideStart] = useState("09:00");
  const [newOverrideEnd, setNewOverrideEnd] = useState("17:00");

  // Bookings state
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingFilter, setBookingFilter] = useState<"ALL" | "UPCOMING" | "CONFIRMED" | "CANCELLED">("UPCOMING");
  const [cancelModalBooking, setCancelModalBooking] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Account Deletion state
  const [deleteAccountStep, setDeleteAccountStep] = useState<"IDLE" | "OTP_SENT">("IDLE");
  const [deleteAccountOtp, setDeleteAccountOtp] = useState("");
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/${encodeURIComponent(host.email)}/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    showMsg("Booking URL copied to clipboard");
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  // Event modal handlers
  const openCreateEventModal = () => {
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

  const openEditEventModal = (ev: any) => {
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
    try {
      const url = editingEvent
        ? `/api/dashboard/events/${editingEvent.id}`
        : "/api/dashboard/events";
      const method = editingEvent ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventForm),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to save event type");
      }

      showMsg(editingEvent ? "Event type updated successfully" : "New event type created successfully");
      setIsEventModalOpen(false);
      loadEvents();
    } catch (err: any) {
      showMsg(err.message, "error");
    }
  };

  // Delete event flow with affected bookings confirmation
  const handleOpenDeleteEvent = async (ev: any) => {
    setDeleteEventModal(ev);
    setDeleteEventReason("Event discontinued by host");
    setDeleteEventWarning(null);

    // Check if there are future bookings
    try {
      const res = await fetch(`/api/dashboard/events/${ev.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.requiresConfirmation) {
        setDeleteEventWarning(data.message);
      }
    } catch {
      // Ignore
    }
  };

  const handleConfirmDeleteEvent = async () => {
    if (!deleteEventModal) return;
    try {
      const res = await fetch(`/api/dashboard/events/${deleteEventModal.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, reason: deleteEventReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to delete event type");
      }
      showMsg(data.message || "Event type deleted successfully");
      setDeleteEventModal(null);
      loadEvents();
      loadBookings();
    } catch (err: any) {
      showMsg(err.message, "error");
    }
  };

  // Availability handlers
  const handleAddRule = (weekday: number) => {
    setRules([...rules, { weekday, startTime: "09:00", endTime: "17:00" }]);
  };

  const handleRemoveRule = (index: number) => {
    const updated = [...rules];
    updated.splice(index, 1);
    setRules(updated);
  };

  const handleRuleChange = (index: number, field: "startTime" | "endTime", val: string) => {
    const updated = [...rules];
    updated[index][field] = val;
    setRules(updated);
  };

  const handleAddOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOverrideDate) return;

    const newO = {
      overrideDate: newOverrideDate,
      isAvailable: newOverrideAvailable,
      customStartTime: newOverrideAvailable ? newOverrideStart : null,
      customEndTime: newOverrideAvailable ? newOverrideEnd : null,
    };

    setOverrides([...overrides.filter((o) => o.overrideDate !== newOverrideDate), newO]);
    setNewOverrideDate("");
  };

  const handleRemoveOverride = (dateStr: string) => {
    setOverrides(overrides.filter((o) => o.overrideDate !== dateStr));
  };

  const handleSaveAvailability = async (confirmCancellation = false) => {
    setSavingAvailability(true);
    try {
      const res = await fetch("/api/dashboard/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTimezone,
          rules,
          overrides,
          confirmCancellation,
          cancellationReason: "Host updated availability schedule",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to update availability");
      }

      if (data.requiresConfirmation) {
        setAvailabilityWarningModal(data);
        return;
      }

      setAvailabilityWarningModal(null);
      showMsg("Availability schedule and overrides saved successfully");
      loadAvailability();
      loadBookings();
    } catch (err: any) {
      showMsg(err.message, "error");
    } finally {
      setSavingAvailability(false);
    }
  };

  // Cancel booking handler
  const handleHostCancelBooking = async () => {
    if (!cancelModalBooking) return;
    try {
      const res = await fetch(`/api/dashboard/bookings/${cancelModalBooking.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to cancel booking");
      }
      showMsg("Booking cancelled and guest notified");
      setCancelModalBooking(null);
      setCancelReason("");
      loadBookings();
    } catch (err: any) {
      showMsg(err.message, "error");
    }
  };

  // Account deletion handlers
  const handleRequestDeleteAccountOtp = async () => {
    try {
      const res = await fetch("/api/auth/delete-account/request-otp", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to send deletion code");
      }
      setDeleteAccountStep("OTP_SENT");
      showMsg("A verification code was sent to your registered email");
    } catch (err: any) {
      showMsg(err.message, "error");
    }
  };

  const handleConfirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteAccountConfirmText !== "DELETE") {
      showMsg('Please type "DELETE" to confirm', "error");
      return;
    }
    if (deleteAccountOtp.length !== 6) {
      showMsg("Please enter the 6-digit code", "error");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const res = await fetch("/api/auth/delete-account/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: deleteAccountOtp,
          confirmPhrase: "DELETE",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to delete account");
      }

      router.push("/");
    } catch (err: any) {
      showMsg(err.message, "error");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Overview metrics
  const now = new Date();
  const upcomingBookings = useMemo(
    () => bookings.filter((b) => b.status === "CONFIRMED" && new Date(b.startAt) >= now),
    [bookings]
  );
  const todayBookings = useMemo(() => {
    const todayStr = now.toLocaleDateString("en-CA");
    return bookings.filter(
      (b) =>
        b.status === "CONFIRMED" &&
        new Date(b.startAt).toLocaleDateString("en-CA") === todayStr
    );
  }, [bookings]);
  const totalConfirmed = useMemo(
    () => bookings.filter((b) => b.status === "CONFIRMED").length,
    [bookings]
  );
  const totalCancelled = useMemo(
    () => bookings.filter((b) => b.status === "CANCELLED").length,
    [bookings]
  );

  const filteredBookings = useMemo(() => {
    if (bookingFilter === "UPCOMING") return upcomingBookings;
    if (bookingFilter === "CONFIRMED") return bookings.filter((b) => b.status === "CONFIRMED");
    if (bookingFilter === "CANCELLED") return bookings.filter((b) => b.status === "CANCELLED");
    return bookings;
  }, [bookings, bookingFilter, upcomingBookings]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-slate-500">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Toast Alert */}
      {msg && (
        <div
          className={`p-4 rounded-xl flex items-center gap-2 text-sm font-medium shadow-sm transition ${
            msg.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {msg.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Host Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Host Workspace</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{host?.name}</h1>
          <p className="text-xs text-slate-500">{host?.email} &bull; Home Timezone: {homeTimezone}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openCreateEventModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Event</span>
          </button>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl transition"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200 flex space-x-1 sm:space-x-4 overflow-x-auto text-sm font-semibold">
        {[
          { id: "overview", label: "Overview", icon: LayoutDashboard },
          { id: "events", label: "Events", icon: CalendarDays },
          { id: "availability", label: "Availability", icon: Sliders },
          { id: "bookings", label: "Bookings", icon: Calendar },
          { id: "settings", label: "Account Settings", icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-3 sm:px-4 flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
                isActive
                  ? "border-indigo-600 text-indigo-600 font-bold"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 uppercase font-semibold">Upcoming</span>
              <div className="text-2xl sm:text-3xl font-black text-slate-900">{upcomingBookings.length}</div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 uppercase font-semibold">Today</span>
              <div className="text-2xl sm:text-3xl font-black text-indigo-600">{todayBookings.length}</div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 uppercase font-semibold">Total Confirmed</span>
              <div className="text-2xl sm:text-3xl font-black text-emerald-600">{totalConfirmed}</div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 uppercase font-semibold">Cancelled</span>
              <div className="text-2xl sm:text-3xl font-black text-slate-400">{totalCancelled}</div>
            </div>
          </div>

          {/* Upcoming Schedule List */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Next Upcoming Appointments</span>
              </h2>
              <button
                onClick={() => setActiveTab("bookings")}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                View all bookings &rarr;
              </button>
            </div>

            {upcomingBookings.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No upcoming appointments scheduled yet. Share your booking link to get started!
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {upcomingBookings.slice(0, 5).map((b) => (
                  <div key={b.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="font-bold text-slate-900">{b.eventName} with {b.guestName}</div>
                      <div className="text-xs text-slate-500">{b.guestEmail}</div>
                      {b.meetingPurpose && (
                        <div className="text-xs text-slate-600 mt-1 italic">&ldquo;{b.meetingPurpose}&rdquo;</div>
                      )}
                    </div>
                    <div className="text-right text-xs text-slate-600 sm:min-w-[200px]">
                      <div className="font-semibold text-slate-800">
                        {new Date(b.startAt).toLocaleString("en-US", {
                          timeZone: homeTimezone,
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="text-slate-400">({homeTimezone})</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. EVENTS TAB */}
      {activeTab === "events" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Your Event Types</h2>
              <p className="text-xs text-slate-500">Configure your booking links, durations, capacity, and buffer times</p>
            </div>
            <button
              onClick={openCreateEventModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Create Event Type</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventTypes.map((ev) => (
              <div
                key={ev.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between shadow-xs hover:border-slate-300 transition space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {ev.capacity === 1 ? "1-on-1" : `Group (Max ${ev.capacity})`}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{ev.durationMinutes}m</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{ev.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">/{ev.slug}</p>
                  <p className="text-xs text-slate-500">
                    Buffers: {ev.bufferBefore}m before &bull; {ev.bufferAfter}m after
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyLink(ev.slug)}
                      className="flex-1 py-1.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 transition flex items-center justify-center gap-1.5"
                    >
                      {copiedSlug === ev.slug ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSlug === ev.slug ? "Copied!" : "Copy Link"}</span>
                    </button>
                    <a
                      href={`/${encodeURIComponent(host.email)}/${ev.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                      title="Open Public Booking Page"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      onClick={() => openEditEventModal(ev)}
                      className="text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleOpenDeleteEvent(ev)}
                      className="text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. AVAILABILITY TAB */}
      {activeTab === "availability" && (
        <div className="space-y-8">
          {/* Weekly Schedule */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Weekly Working Hours</h2>
              <p className="text-xs text-slate-500">Define the recurring hours when you are available for bookings</p>
            </div>

            <div className="space-y-4">
              {WEEKDAYS.map((day) => {
                const dayRules = rules
                  .map((r, idx) => ({ ...r, originalIndex: idx }))
                  .filter((r) => r.weekday === day.id);

                return (
                  <div
                    key={day.id}
                    className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="w-32 font-bold text-sm text-slate-800">{day.name}</div>

                    <div className="flex-1 space-y-2">
                      {dayRules.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">Unavailable (Day off)</span>
                      ) : (
                        dayRules.map((rule) => (
                          <div key={rule.originalIndex} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={rule.startTime.slice(0, 5)}
                              onChange={(e) =>
                                handleRuleChange(rule.originalIndex, "startTime", e.target.value)
                              }
                              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-slate-400">&ndash;</span>
                            <input
                              type="time"
                              value={rule.endTime.slice(0, 5)}
                              onChange={(e) =>
                                handleRuleChange(rule.originalIndex, "endTime", e.target.value)
                              }
                              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                            />
                            <button
                              onClick={() => handleRemoveRule(rule.originalIndex)}
                              className="p-1 text-slate-400 hover:text-red-500"
                              title="Remove window"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <button
                      onClick={() => handleAddRule(day.id)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 self-start md:self-auto"
                    >
                      + Add Window
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                disabled={savingAvailability}
                onClick={() => handleSaveAvailability(false)}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition shadow-xs"
              >
                {savingAvailability ? "Saving..." : "Save Weekly Schedule"}
              </button>
            </div>
          </div>

          {/* Date Overrides */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Date Overrides &amp; Days Off</h2>
              <p className="text-xs text-slate-500">
                Override your weekly schedule for specific calendar dates (vacations, holidays, or custom working hours)
              </p>
            </div>

            {/* Add Override Form */}
            <form onSubmit={handleAddOverride} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={newOverrideDate}
                    onChange={(e) => setNewOverrideDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={newOverrideAvailable ? "available" : "unavailable"}
                    onChange={(e) => setNewOverrideAvailable(e.target.value === "available")}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="unavailable">Day Off (Unavailable)</option>
                    <option value="available">Custom Working Hours</option>
                  </select>
                </div>

                {newOverrideAvailable && (
                  <div className="sm:col-span-1 flex items-center gap-1.5">
                    <input
                      type="time"
                      value={newOverrideStart}
                      onChange={(e) => setNewOverrideStart(e.target.value)}
                      className="w-full px-2 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                    />
                    <span className="text-xs text-slate-400">&ndash;</span>
                    <input
                      type="time"
                      value={newOverrideEnd}
                      onChange={(e) => setNewOverrideEnd(e.target.value)}
                      className="w-full px-2 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
                  >
                    Add Override
                  </button>
                </div>
              </div>
            </form>

            {/* List of Overrides */}
            {overrides.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No active date overrides. You are following your regular weekly hours.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {overrides.map((o) => (
                  <div key={o.overrideDate} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800 mr-2">{o.overrideDate}</span>
                      {o.isAvailable ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                          Custom: {o.customStartTime?.slice(0, 5)} - {o.customEndTime?.slice(0, 5)}
                        </span>
                      ) : (
                        <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded font-medium">
                          Unavailable (Day off)
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveOverride(o.overrideDate)}
                      className="text-slate-400 hover:text-red-600"
                      title="Delete override"
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

      {/* 4. BOOKINGS TAB */}
      {activeTab === "bookings" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Bookings Log</h2>
              <p className="text-xs text-slate-500">View upcoming, completed, and cancelled client meetings</p>
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-semibold text-slate-600">
              {(["UPCOMING", "CONFIRMED", "CANCELLED", "ALL"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setBookingFilter(f)}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    bookingFilter === f ? "bg-white text-slate-900 shadow-xs font-bold" : "hover:text-slate-900"
                  }`}
                >
                  {f === "UPCOMING" ? "Upcoming" : f === "CONFIRMED" ? "Confirmed" : f === "CANCELLED" ? "Cancelled" : "All"}
                </button>
              ))}
            </div>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              No bookings found matching this filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredBookings.map((b) => (
                <div key={b.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{b.eventName}</span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          b.status === "CONFIRMED"
                            ? "bg-emerald-50 text-emerald-700"
                            : b.status === "CANCELLED"
                            ? "bg-red-50 text-red-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600">
                      Guest: <strong>{b.guestName}</strong> ({b.guestEmail})
                    </div>

                    {b.meetingPurpose && (
                      <div className="text-xs text-slate-500 italic mt-0.5">
                        &ldquo;{b.meetingPurpose}&rdquo;
                      </div>
                    )}

                    {b.cancellationReason && (
                      <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg mt-1">
                        Reason: {b.cancellationReason}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right text-xs text-slate-600">
                      <div className="font-semibold text-slate-900">
                        {new Date(b.startAt).toLocaleString("en-US", {
                          timeZone: homeTimezone,
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="text-slate-400">({homeTimezone})</div>
                    </div>

                    {b.status === "CONFIRMED" && (
                      <button
                        onClick={() => {
                          setCancelModalBooking(b);
                          setCancelReason("Cancelled by host");
                        }}
                        className="text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. ACCOUNT SETTINGS TAB */}
      {activeTab === "settings" && (
        <div className="space-y-8 max-w-3xl">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Host Profile</h2>
              <p className="text-xs text-slate-500">Your verified host identity and primary scheduling timezone</p>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Host Name</label>
                <div className="font-bold text-slate-900">{host?.name}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Verified Email</label>
                <div className="font-bold text-slate-900">{host?.email}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Scheduling Timezone</label>
                <select
                  value={homeTimezone}
                  onChange={(e) => setHomeTimezone(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white font-medium"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleSaveAvailability(false)}
                  className="ml-3 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
                >
                  Save Timezone
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone: Account Deletion */}
          <div className="bg-white rounded-2xl border border-red-200 p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-red-900">Delete Host Account</h2>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  Permanently delete your host profile, availability rules, and event types.
                  All upcoming client bookings will be cancelled and affected guests will be notified by email.
                  This action is irreversible.
                </p>
              </div>
            </div>

            {deleteAccountStep === "IDLE" ? (
              <div>
                <button
                  onClick={handleRequestDeleteAccountOtp}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition"
                >
                  Request Account Deletion Code
                </button>
              </div>
            ) : (
              <form onSubmit={handleConfirmDeleteAccount} className="space-y-4 max-w-md pt-2">
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                  A 6-digit confirmation code was sent to <strong>{host?.email}</strong>.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={deleteAccountOtp}
                    onChange={(e) => setDeleteAccountOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono tracking-widest text-center"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Type &ldquo;DELETE&rdquo; to confirm
                  </label>
                  <input
                    type="text"
                    required
                    value={deleteAccountConfirmText}
                    onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isDeletingAccount || deleteAccountConfirmText !== "DELETE" || deleteAccountOtp.length !== 6}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-xs"
                  >
                    {isDeletingAccount ? "Deleting..." : "Permanently Delete Account"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteAccountStep("IDLE");
                      setDeleteAccountOtp("");
                      setDeleteAccountConfirmText("");
                    }}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit Event */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              {editingEvent ? "Edit Event Type" : "Create New Event Type"}
            </h3>

            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Name</label>
                <input
                  type="text"
                  required
                  value={eventForm.name}
                  onChange={(e) =>
                    setEventForm({
                      ...eventForm,
                      name: e.target.value,
                      slug: editingEvent
                        ? eventForm.slug
                        : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    })
                  }
                  placeholder="e.g. 30 Min Appointment"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Public URL Slug</label>
                <input
                  type="text"
                  required
                  value={eventForm.slug}
                  onChange={(e) => setEventForm({ ...eventForm, slug: e.target.value })}
                  placeholder="30-min-appointment"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    min={15}
                    max={120}
                    required
                    value={eventForm.durationMinutes}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, durationMinutes: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={eventForm.capacity}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, capacity: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Buffer Before (Mins)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={eventForm.bufferBefore}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, bufferBefore: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Buffer After (Mins)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={eventForm.bufferAfter}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, bufferAfter: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
                >
                  {editingEvent ? "Save Changes" : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Event Confirmation */}
      {deleteEventModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Delete &ldquo;{deleteEventModal.name}&rdquo;?</h3>

            {deleteEventWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
                {deleteEventWarning}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cancellation reason for affected guests:
              </label>
              <textarea
                rows={2}
                value={deleteEventReason}
                onChange={(e) => setDeleteEventReason(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteEventModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                Keep Event
              </button>
              <button
                onClick={handleConfirmDeleteEvent}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold"
              >
                Confirm Delete &amp; Notify Guests
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Availability Day-Off Conflicting Bookings Warning */}
      {availabilityWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-600 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirmed Appointments on Days Off</span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {availabilityWarningModal.message}
            </p>

            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-slate-50 rounded-xl p-3 text-xs">
              {availabilityWarningModal.affectedBookings?.map((b: any) => (
                <div key={b.id} className="py-2">
                  <div className="font-bold text-slate-800">{b.eventName} with {b.guestName}</div>
                  <div className="text-slate-500">{new Date(b.startAt).toLocaleString()} ({b.guestEmail})</div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setAvailabilityWarningModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                Go Back &amp; Adjust Dates
              </button>
              <button
                onClick={() => handleSaveAvailability(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold"
              >
                Confirm Day Off &amp; Cancel Bookings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cancel Individual Booking */}
      {cancelModalBooking && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">
              Cancel Appointment with {cancelModalBooking.guestName}?
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Cancellation (included in guest email):
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Brief reason for cancelling this appointment..."
                className="w-full p-3 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCancelModalBooking(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                Keep Booking
              </button>
              <button
                onClick={handleHostCancelBooking}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold"
              >
                Cancel &amp; Notify Guest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
