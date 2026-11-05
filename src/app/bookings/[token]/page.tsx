"use client";

import { useEffect, useState } from "react";
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
  const [selectedNewSlot, setSelectedNewSlot] = useState<string>("");
  const [rescheduling, setRescheduling] = useState(false);

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
    try {
      const res = await fetch(
        `/api/hosts/${encodeURIComponent(booking.host.email)}/events/${booking.event.slug}/slots?tz=${encodeURIComponent(guestTz)}`
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
        body: JSON.stringify({ newStartAt: selectedNewSlot }),
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
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-md p-6 space-y-5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-indigo-600" />
              <span>Select New Slot to Reschedule</span>
            </h3>
            <button
              onClick={() => setShowReschedule(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
            >
              Close
            </button>
          </div>

          {loadingSlots ? (
            <div className="py-8 text-center text-xs text-slate-500">Loading open slots...</div>
          ) : availableSlots.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No open slots available to reschedule to at this moment.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
              {availableSlots.map((slot) => {
                const isSelected = selectedNewSlot === slot.startAt;
                const formatted = new Date(slot.startAt).toLocaleString("en-US", {
                  timeZone: guestTz,
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "numeric",
                  hour12: true,
                });

                return (
                  <button
                    key={slot.startAt}
                    type="button"
                    onClick={() => setSelectedNewSlot(slot.startAt)}
                    className={`p-2.5 border rounded-lg text-xs font-semibold text-center transition ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-slate-800 border-slate-200 hover:border-indigo-400"
                    }`}
                  >
                    {formatted}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              onClick={() => setShowReschedule(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Keep Current Time
            </button>
            <button
              disabled={!selectedNewSlot || rescheduling}
              onClick={handleRescheduleSubmit}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              {rescheduling ? "Rescheduling..." : "Confirm Reschedule"}
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
