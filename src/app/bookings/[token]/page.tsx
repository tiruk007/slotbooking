"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Clock,
  User,
  Mail,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Globe,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

export default function BookingManagementPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [booking, setBooking] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [guestTz, setGuestTz] = useState("UTC");

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedNewSlot, setSelectedNewSlot] = useState<string>("");
  const [rescheduling, setRescheduling] = useState(false);

  // Group slots by date in guest's timezone
  const slotsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const slot of availableSlots) {
      const dateKey = new Date(slot.startAt).toLocaleDateString("en-CA", {
        timeZone: guestTz,
      });
      const list = map.get(dateKey) || [];
      list.push(slot);
      map.set(dateKey, list);
    }
    return map;
  }, [availableSlots, guestTz]);

  const availableDates = useMemo(() => {
    return Array.from(slotsByDate.keys()).sort();
  }, [slotsByDate]);

  useEffect(() => {
    if (availableDates.length > 0 && (!selectedDate || !slotsByDate.has(selectedDate))) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate, slotsByDate]);

  // Cancel state
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setGuestTz(tz);
    } catch {
      setGuestTz("UTC");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    loadBooking();
  }, [token]);

  const loadBooking = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${token}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Booking not found");
      }
      setBooking(data);
    } catch (err: any) {
      setError(err.message || "Failed to load booking details");
    } finally {
      setLoading(false);
    }
  };

  const loadRescheduleSlots = async () => {
    if (!booking) return;
    setLoadingSlots(true);
    setSelectedNewSlot("");
    try {
      const hostIdentifier = booking.host.slug || booking.host.email;
      const res = await fetch(
        `/api/hosts/${encodeURIComponent(hostIdentifier)}/events/${booking.event.slug}/slots?tz=${encodeURIComponent(guestTz)}`
      );
      const data = await res.json();
      if (res.ok) {
        setAvailableSlots(data.slots || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleOpenReschedule = () => {
    setShowReschedule(true);
    setShowCancel(false);
    setSelectedNewSlot("");
    loadRescheduleSlots();
  };

  const handleRescheduleSubmit = async () => {
    if (!selectedNewSlot) return;
    setRescheduling(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/bookings/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStartAt: selectedNewSlot,
          guestTimezone: guestTz,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to reschedule booking");
      }

      setSuccessMsg("Your booking has been rescheduled successfully!");
      setShowReschedule(false);
      setSelectedNewSlot("");
      loadBooking();
    } catch (err: any) {
      setError(err.message || "Failed to reschedule");
    } finally {
      setRescheduling(false);
    }
  };

  const handleCancelSubmit = async () => {
    setCancelling(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/bookings/${token}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to cancel booking");
      }

      setSuccessMsg("Your booking has been cancelled.");
      setShowCancel(false);
      loadBooking();
    } catch (err: any) {
      setError(err.message || "Failed to cancel booking");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Loading booking details...
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Booking Not Found</h2>
        <p className="text-sm text-slate-600">{error}</p>
        <Link href="/" className="inline-block mt-4 text-sm font-semibold text-indigo-600 hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  const isConfirmed = booking?.status === "CONFIRMED";
  const isCancelled = booking?.status === "CANCELLED";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      {/* Success banner */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Booking Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Booking Management
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{booking.event.name}</h1>
            <p className="text-sm text-slate-500">with {booking.host.name} ({booking.host.email})</p>
          </div>

          <div>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border ${
                isConfirmed
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : isCancelled
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-slate-100 text-slate-700 border-slate-200"
              }`}
            >
              {booking.status}
            </span>
          </div>
        </div>

        {/* Appointment Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Date &amp; Time</span>
            </span>
            <div className="font-bold text-slate-900">
              {new Date(booking.startAt).toLocaleString("en-US", {
                timeZone: guestTz,
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "numeric",
                hour12: true,
              })}
            </div>
            <div className="text-xs text-slate-400">Timezone: {guestTz}</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-indigo-600" />
              <span>Guest Details</span>
            </span>
            <div className="font-bold text-slate-900">{booking.guestName}</div>
            <div className="text-xs text-slate-500">{booking.guestEmail}</div>
          </div>
        </div>

        {/* Meeting Purpose */}
        {booking.meetingPurpose && (
          <div className="p-4 bg-slate-50 rounded-xl text-sm space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase block">Meeting Purpose</span>
            <p className="text-slate-800">{booking.meetingPurpose}</p>
          </div>
        )}

        {/* Meeting Location / Details */}
        <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <strong>Meeting Coordination:</strong> The host and guest coordinate directly using the contact details above.
        </div>

        {booking.cancellationReason && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-1">
            <span className="font-bold uppercase tracking-wider">Cancellation Reason:</span>
            <p>{booking.cancellationReason}</p>
          </div>
        )}

        {/* Actions for Confirmed Bookings */}
        {isConfirmed && (
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100">
            <button
              onClick={handleOpenReschedule}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reschedule Booking</span>
            </button>

            <button
              onClick={() => {
                setShowCancel(true);
                setShowReschedule(false);
              }}
              className="px-4 py-2 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-300 text-slate-700 hover:text-red-700 rounded-lg text-sm font-semibold transition flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Cancel Booking</span>
            </button>
          </div>
        )}
      </div>

      {/* Reschedule Drawer / Box */}
      {showReschedule && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-lg p-6 sm:p-8 space-y-6 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-600" />
                <span>Select New Appointment Time</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Choose a new date and time slot within the host&apos;s booking horizon.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 self-start sm:self-auto">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>Timezone: <strong>{guestTz}</strong></span>
            </div>
          </div>

          {loadingSlots ? (
            <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span>Checking available host openings...</span>
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="py-10 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
              No open slots available to reschedule to at this moment. Please check back later.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Date Selector */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>1. Select Date</span>
                </span>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {availableDates.map((dateStr) => {
                    const isSelected = selectedDate === dateStr;
                    const count = (slotsByDate.get(dateStr) || []).length;
                    const d = new Date(dateStr + "T00:00:00");
                    const formattedDate = d.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    });

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => {
                          setSelectedDate(dateStr);
                          setSelectedNewSlot("");
                        }}
                        className={`w-full p-3 rounded-xl border text-left flex items-center justify-between text-xs transition ${
                          isSelected
                            ? "bg-indigo-50 border-indigo-600 text-indigo-950 font-bold shadow-xs"
                            : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 font-medium"
                        }`}
                      >
                        <span>{formattedDate}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}>
                          {count} {count === 1 ? "slot" : "slots"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Slots for Selected Date */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>2. Select Time ({guestTz})</span>
                </span>
                {!selectedDate || (slotsByDate.get(selectedDate) || []).length === 0 ? (
                  <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    Select a date on the left to see available times.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {(slotsByDate.get(selectedDate) || []).map((slot) => {
                      const isSelected = selectedNewSlot === slot.startAt;
                      const timeStr = new Date(slot.startAt).toLocaleTimeString("en-US", {
                        timeZone: guestTz,
                        hour: "numeric",
                        minute: "2-digit",
                      });

                      return (
                        <button
                          key={slot.startAt}
                          type="button"
                          onClick={() => setSelectedNewSlot(slot.startAt)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition text-center ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white text-slate-800 border-slate-200 hover:border-indigo-400"
                          }`}
                        >
                          {timeStr}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comparison Review Card */}
          {selectedNewSlot && (
            <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider block">
                Appointment Comparison
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Current Appointment</div>
                  <div className="font-bold text-slate-700 line-through">
                    {new Date(booking.startAt).toLocaleString("en-US", {
                      timeZone: guestTz,
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="p-3 bg-white rounded-xl border border-indigo-300 shadow-xs space-y-1">
                  <div className="text-[11px] font-bold text-indigo-600 uppercase">New Proposed Time</div>
                  <div className="font-black text-indigo-950">
                    {new Date(selectedNewSlot).toLocaleString("en-US", {
                      timeZone: guestTz,
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Confirming will atomically release your current appointment slot and reserve the new time. Both you and the host will receive an updated email confirmation.
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={() => {
                setShowReschedule(false);
                setSelectedNewSlot("");
              }}
              className="px-4 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Keep Current Time
            </button>
            <button
              disabled={!selectedNewSlot || rescheduling}
              onClick={handleRescheduleSubmit}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rescheduling ? "animate-spin" : ""}`} />
              <span>{rescheduling ? "Confirming Reschedule..." : "Confirm Reschedule"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Cancel Modal / Box */}
      {showCancel && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-md p-6 space-y-4 animate-in fade-in duration-150">
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              <span>Confirm Appointment Cancellation</span>
            </h3>
            <p className="text-xs text-slate-500">
              This will release your reserved slot and notify <strong>{booking.host.name}</strong>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Cancellation Reason (Optional)
            </label>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Schedule conflict, no longer needed..."
              className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowCancel(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Keep Booking
            </button>
            <button
              disabled={cancelling}
              onClick={handleCancelSubmit}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              {cancelling ? "Cancelling..." : "Confirm Cancellation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
