"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Users,
  Clock,
  ExternalLink,
  XCircle,
  AlertTriangle,
  Search,
} from "lucide-react";

export default function HostBookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("UPCOMING");
  const [searchTerm, setSearchTerm] = useState("");

  // Cancel Modal
  const [cancelModal, setCancelModal] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    loadBookings();
  }, [filter]);

  async function loadBookings() {
    setLoading(true);
    try {
      const url = filter === "ALL" ? "/api/dashboard/bookings" : `/api/dashboard/bookings?status=${filter}`;
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json();
        setBookings(d?.data?.bookings || d?.bookings || []);
      }
    } catch (err) {
      console.error("Failed to load bookings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelBooking() {
    if (!cancelModal) return;
    setCancelling(true);

    try {
      const res = await fetch(`/api/dashboard/bookings/${cancelModal.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });

      if (res.ok) {
        setCancelModal(null);
        setCancelReason("");
        await loadBookings();
      }
    } catch (err) {
      console.error("Cancel failed:", err);
    } finally {
      setCancelling(false);
    }
  }

  const filteredBookings = bookings.filter((b) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      b.guestName?.toLowerCase().includes(term) ||
      b.guestEmail?.toLowerCase().includes(term) ||
      b.eventName?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Client Bookings
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review confirmed appointments, meeting purposes, and manage host-side cancellations.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-xl text-xs font-semibold">
          {["UPCOMING", "PAST", "CANCELLED", "ALL"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg transition ${
                filter === tab ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by guest name, email, or event..."
          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-indigo-600"
        />
      </div>

      {/* Bookings List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          Loading appointments...
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-xs text-slate-400">
          No appointments found matching the current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((b) => (
            <div
              key={b.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    b.status === "CONFIRMED" ? "bg-emerald-50 text-emerald-700" :
                    b.status === "CANCELLED" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {b.status}
                  </span>
                  <span className="font-bold text-sm text-slate-900">{b.eventName}</span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div>
                    <strong>Guest:</strong> {b.guestName} ({b.guestEmail})
                  </div>
                  <div>
                    <strong>Date &amp; Time:</strong>{" "}
                    {new Date(b.startAt).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}
                  </div>
                  {b.meetingPurpose && (
                    <div className="text-slate-500 italic">
                      &ldquo;{b.meetingPurpose}&rdquo;
                    </div>
                  )}
                  {b.status === "CANCELLED" && (
                    <div className="text-xs text-red-600 bg-red-50/50 p-2.5 rounded-lg border border-red-100 space-y-0.5">
                      <div><strong>Cancelled on:</strong> {b.updatedAt ? new Date(b.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Recently"}</div>
                      <div><strong>Reason:</strong> {b.cancellationReason || "No reason provided"}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                {b.status === "CONFIRMED" && (
                  <button
                    onClick={() => {
                      setCancelModal(b);
                      setCancelReason("Host schedule conflict");
                    }}
                    className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-semibold transition"
                  >
                    Cancel Booking
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: Cancel Booking */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Cancel Appointment?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Cancel appointment with <strong>{cancelModal.guestName}</strong>. The guest will be notified by email.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for cancellation (included in email):
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setCancelModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                Keep Booking
              </button>
              <button
                disabled={cancelling}
                onClick={handleCancelBooking}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel & Notify Guest"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

