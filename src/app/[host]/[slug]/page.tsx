"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Globe,
  User,
  Mail,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Lock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export default function PublicBookingPage() {
  const params = useParams();
  const router = useRouter();

  const hostParam = params.host as string;
  const slugParam = params.slug as string;

  const [guestTz, setGuestTz] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hostData, setHostData] = useState<any>(null);
  const [eventData, setEventData] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);

  // Selected date
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Hold state
  const [activeHold, setActiveHold] = useState<any | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number>(300);
  const [isHolding, setIsHolding] = useState(false);

  // Guest inputs
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);

  // Detect browser timezone on mount
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setGuestTz(detected);
    } catch {
      setGuestTz("UTC");
    }
  }, []);

  // Fetch slots whenever host, slug, or guestTz changes
  useEffect(() => {
    if (!hostParam || !slugParam) return;
    loadSlots();
  }, [hostParam, slugParam, guestTz]);

  // Hold countdown timer
  useEffect(() => {
    if (!activeHold) return;

    const timer = setInterval(() => {
      const expiresAt = new Date(activeHold.holdExpiresAt).getTime();
      const now = Date.now();
      const remainingSecs = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setHoldSecondsLeft(remainingSecs);

      if (remainingSecs <= 0) {
        clearInterval(timer);
        setActiveHold(null);
        setError("Your 5-minute hold has expired. Please select a slot again.");
        loadSlots();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeHold]);

  const loadSlots = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/hosts/${encodeURIComponent(hostParam)}/events/${slugParam}/slots?tz=${encodeURIComponent(guestTz)}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to load slots");
      }

      setHostData(data.host);
      setEventData(data.event);
      setSlots(data.slots || []);

      // Default select the first date that has available slots
      if (data.slots && data.slots.length > 0) {
        const firstSlotDate = new Date(data.slots[0].startAt).toLocaleDateString("en-CA", {
          timeZone: guestTz,
        });
        setSelectedDate(firstSlotDate);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Group slots by date in guest's timezone
  const slotsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const slot of slots) {
      const dateKey = new Date(slot.startAt).toLocaleDateString("en-CA", {
        timeZone: guestTz,
      }); // "YYYY-MM-DD"
      const list = map.get(dateKey) || [];
      list.push(slot);
      map.set(dateKey, list);
    }
    return map;
  }, [slots, guestTz]);

  const availableDates = useMemo(() => {
    return Array.from(slotsByDate.keys()).sort();
  }, [slotsByDate]);

  // Handle slot selection -> Request 5-minute hold
  const handleSelectSlot = async (slot: any) => {
    setIsHolding(true);
    setError(null);

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          eventTypeId: eventData.id,
          startAt: slot.startAt,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to hold slot");
      }

      setActiveHold(data);
      const expiresAt = new Date(data.holdExpiresAt).getTime();
      setHoldSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    } catch (err: any) {
      setError(err.message || "Could not reserve slot. Please select another slot.");
      loadSlots();
    } finally {
      setIsHolding(false);
    }
  };

  // Confirm hold with guest info
  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHold) return;
    setConfirming(true);
    setError(null);

    try {
      const res = await fetch(`/api/holds/${activeHold.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName, guestEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to confirm booking");
      }

      setConfirmedBooking(data);
      setActiveHold(null);
    } catch (err: any) {
      setError(err.message || "Failed to confirm booking");
    } finally {
      setConfirming(false);
    }
  };

  if (loading && !hostData) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-slate-500">
        Loading availability...
      </div>
    );
  }

  // View: Booking Confirmed
  if (confirmedBooking) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-slate-900">You are Scheduled!</h1>
            <p className="text-slate-600">
              A calendar appointment has been created with <strong>{hostData?.name}</strong>.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-left space-y-3 text-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-semibold text-slate-800">{eventData?.name}</span>
              <span className="text-xs text-slate-500">{eventData?.durationMinutes} mins</span>
            </div>

            <div className="flex items-center gap-2 text-slate-700">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>
                {new Date(confirmedBooking.startAt).toLocaleString("en-US", {
                  timeZone: guestTz,
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "numeric",
                  hour12: true,
                })}
              </span>
              <span className="text-xs text-slate-400">({guestTz})</span>
            </div>

            <div className="flex items-center gap-2 text-slate-700">
              <User className="w-4 h-4 text-indigo-600" />
              <span>{confirmedBooking.guestName}</span>
              <span className="text-xs text-slate-400">&bull; {confirmedBooking.guestEmail}</span>
            </div>
          </div>

          {confirmedBooking.manageUrl && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-left space-y-2">
              <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>Private Booking Management URL</span>
              </div>
              <p className="text-xs text-indigo-700">
                Bookmark or visit your private URL below if you ever need to reschedule or cancel:
              </p>
              <Link
                href={confirmedBooking.manageUrl}
                className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800 underline"
              >
                <span>Open Booking Management Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          <div className="pt-4">
            <Link
              href="/"
              className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const selectedDateSlots = selectedDate ? slotsByDate.get(selectedDate) || [] : [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      {/* Host & Event Details Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
            {hostData?.name}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{eventData?.name}</h1>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{eventData?.durationMinutes} mins</span>
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>{eventData?.capacity > 1 ? `Group Capacity (${eventData?.capacity})` : "1-on-1 Appointment"}</span>
            </span>
          </div>
        </div>

        {/* Timezone Switcher */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700">
          <Globe className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <span className="uppercase text-[10px] text-slate-500 font-bold">Your Timezone:</span>
          <select
            value={guestTz}
            onChange={(e) => setGuestTz(e.target.value)}
            className="bg-transparent font-semibold text-slate-900 focus:outline-none cursor-pointer"
          >
            {COMMON_TIMEZONES.includes(guestTz) ? null : <option value={guestTz}>{guestTz}</option>}
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Booking Interface */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left: Available Dates List / Picker */}
        <div className="md:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Select Date (Next 30 Days)</span>
          </h2>

          {availableDates.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No available dates found within booking horizon.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 max-h-[420px] overflow-y-auto pr-1">
              {availableDates.map((dateStr) => {
                const count = slotsByDate.get(dateStr)?.length || 0;
                const dateObj = new Date(`${dateStr}T12:00:00Z`);
                const isSelected = selectedDate === dateStr;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedDate(dateStr)}
                    className={`w-full text-left px-4 py-2.5 rounded-lg border text-xs font-medium transition flex items-center justify-between ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                    }`}
                  >
                    <span>
                      {dateObj.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        isSelected
                          ? "bg-indigo-700 text-indigo-100"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {count} {count === 1 ? "slot" : "slots"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Slots List for Selected Date */}
        <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <span>Available Times ({guestTz})</span>
            </h2>
            {selectedDate && (
              <span className="text-xs text-slate-500 font-medium">
                {new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>

          {!selectedDate || selectedDateSlots.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Select a date on the left to see available times.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              {selectedDateSlots.map((slot) => {
                const timeString = new Date(slot.startAt).toLocaleTimeString("en-US", {
                  timeZone: guestTz,
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                });

                return (
                  <button
                    key={slot.startAt}
                    type="button"
                    disabled={isHolding}
                    onClick={() => handleSelectSlot(slot)}
                    className="p-3 border border-slate-200 rounded-xl hover:border-indigo-600 hover:bg-indigo-50/50 transition text-center group disabled:opacity-50"
                  >
                    <div className="text-sm font-bold text-slate-800 group-hover:text-indigo-700">
                      {timeString}
                    </div>
                    {eventData?.capacity > 1 && (
                      <div className="text-[10px] text-emerald-600 font-semibold mt-1">
                        {slot.remainingCapacity} seat{slot.remainingCapacity !== 1 ? "s" : ""} left
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5-Minute Hold Modal */}
      {activeHold && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Live Hold Timer Bar */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs text-amber-800">
              <div className="flex items-center gap-1.5 font-semibold">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>Slot Reserved on Temporary Hold</span>
              </div>
              <span className="font-mono font-bold bg-amber-200/70 px-2 py-0.5 rounded text-amber-900">
                {Math.floor(holdSecondsLeft / 60)}:
                {(holdSecondsLeft % 60).toString().padStart(2, "0")}
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">Confirm Your Booking</h3>
              <p className="text-xs text-slate-500">
                {eventData?.name} with {hostData?.name} &bull;{" "}
                {new Date(activeHold.startAt).toLocaleTimeString("en-US", {
                  timeZone: guestTz,
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>

            <form onSubmit={handleConfirm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Your Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Your Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveHold(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={confirming}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-50"
                >
                  {confirming ? "Confirming..." : "Confirm Booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
