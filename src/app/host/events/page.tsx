"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Users,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Share2,
} from "lucide-react";

export default function HostEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [host, setHost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmData, setDeleteConfirmData] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    try {
      const [eventsRes, meRes] = await Promise.all([
        fetch("/api/dashboard/events"),
        fetch("/api/auth/me"),
      ]);

      if (eventsRes.ok) {
        const d = await eventsRes.json();
        setEvents(d.data.eventTypes || []);
      }
      if (meRes.ok) {
        const d = await meRes.json();
        setHost(d.data.host);
      }
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteClick(id: string, name: string) {
    setDeleteModal({ id, name });
    setDeleteConfirmData(null);
    setDeleteReason("Event discontinued by host");

    // Pre-check if future bookings exist
    try {
      const res = await fetch(`/api/dashboard/events/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.data?.requiresConfirmation) {
        setDeleteConfirmData(data.data);
      }
    } catch (err) {
      console.error("Failed to check event deletion:", err);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteModal) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/dashboard/events/${deleteModal.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, reason: deleteReason }),
      });

      if (res.ok) {
        setDeleteModal(null);
        setDeleteConfirmData(null);
        await loadEvents();
      }
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  }

  function copyPublicLink(eventSlug: string) {
    const hostIdentifier = host?.slug || host?.email || "host";
    const url = `${window.location.origin}/book/${hostIdentifier}/${eventSlug}`;
    navigator.clipboard.writeText(url);
    setCopyFeedback(eventSlug);
    setTimeout(() => setCopyFeedback(null), 2500);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        Loading event types...
      </div>
    );
  }

  const hostIdentifier = host?.slug || host?.email || "host";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Appointment Types
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage your scheduling options, buffer rules, notice constraints, and public booking availability.
          </p>
        </div>

        <Link
          href="/host/events/new"
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Create Event</span>
        </Link>
      </div>

      {/* Events List / Empty State */}
      {events.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <Calendar className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">You haven't created any events yet.</h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
              Create your first appointment type to start accepting meetings from clients and guests.
            </p>
          </div>
          <Link
            href="/host/events/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Event</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((e) => (
            <div
              key={e.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between hover:border-slate-300 transition"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    e.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"
                  }`}>
                    {e.status}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {e.category || "One-on-One"}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900">{e.name}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                    {e.description || "No description provided."}
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Duration:</span>
                    <span className="font-semibold text-slate-800">{e.durationMinutes} mins</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Capacity:</span>
                    <span className="font-semibold text-slate-800">{e.capacity > 1 ? `Group (${e.capacity})` : "1 Guest"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Buffers:</span>
                    <span className="font-semibold text-slate-800">{e.bufferBefore}m before / {e.bufferAfter}m after</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Notice &amp; Horizon:</span>
                    <span className="font-semibold text-slate-800">{e.minimumNoticeMinutes / 60}h notice &bull; {e.bookingHorizonDays}d</span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => copyPublicLink(e.slug)}
                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    title="Copy Public Booking Link"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <Link
                    href={`/book/${hostIdentifier}/${e.slug}`}
                    target="_blank"
                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    title="Preview Public Booking Page"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                  {copyFeedback === e.slug && (
                    <span className="text-[10px] font-bold text-emerald-600">Copied!</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/host/events/${e.id}/edit`}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </Link>
                  <button
                    onClick={() => handleDeleteClick(e.id, e.name)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Delete Event"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: Delete Event Confirmation */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete "{deleteModal.name}"?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to delete this event type?
                </p>
              </div>
            </div>

            {deleteConfirmData?.requiresConfirmation && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-3">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{deleteConfirmData.message}</span>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-red-800 mb-1">
                    Cancellation reason (included in guest email):
                  </label>
                  <textarea
                    rows={2}
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="w-full p-2.5 border border-red-200 bg-white rounded-lg text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Confirm & Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
