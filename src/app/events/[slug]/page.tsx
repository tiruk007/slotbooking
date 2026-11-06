"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Users,
  ArrowRight,
  ArrowLeft,
  User,
  Globe,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

export default function EventDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();

  const [event, setEvent] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvent() {
      try {
        const res = await fetch(`/api/public/events/${slug}`);
        if (!res.ok) {
          throw new Error("This event type is not available or not published.");
        }
        const data = await res.json();
        setEvent(data.data.event);
      } catch (err: any) {
        setError(err.message || "Event not found");
      } finally {
        setLoading(false);
      }
    }
    loadEvent();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        Loading event details...
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Event Not Found</h2>
        <p className="text-xs text-slate-500">{error || "The requested event does not exist."}</p>
        <Link
          href="/events"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Browse All Events</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-8">
      {/* Back Link */}
      <Link
        href="/events"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Events Discovery</span>
      </Link>

      {/* Main Event Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-6">
          <div>
            <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
              {event.category || "One-on-One"}
            </span>
            <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mt-2">
              {event.name}
            </h1>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>{event.durationMinutes} Minutes</span>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">About This Session</h2>
          <p className="text-sm text-slate-600 leading-relaxed font-normal">
            {event.description || "No detailed description provided by the host."}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Duration</span>
              <strong className="text-slate-900">{event.durationMinutes} mins</strong>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Capacity</span>
              <strong className="text-slate-900">{event.capacity > 1 ? `Up to ${event.capacity} Guests` : "1-on-1"}</strong>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Minimum Notice</span>
              <strong className="text-slate-900">{Math.round(event.minimumNoticeMinutes / 60)} hours</strong>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Booking Horizon</span>
              <strong className="text-slate-900">{event.bookingHorizonDays} days</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Available Hosts Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Available Hosts for This Event</h2>
          <p className="text-xs text-slate-500">
            {event.hosts.length > 1
              ? "Multiple hosts offer this appointment type. Select a host to inspect their calendar slots."
              : "Select this host to choose your preferred meeting date and time."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {event.hosts.map((h: any) => (
            <div
              key={h.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between gap-4 hover:border-indigo-300 transition"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{h.name}</h3>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      <span>{h.timezone}</span>
                    </p>
                  </div>
                </div>
              </div>

              <Link
                href={`/book/${h.slug}/${event.slug}`}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-xs"
              >
                <span>Select Host &amp; Choose Time</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
