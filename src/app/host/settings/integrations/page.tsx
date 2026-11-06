"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Link2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  Video,
} from "lucide-react";

function HostIntegrationsContent() {
  const searchParams = useSearchParams();
  const querySuccess = searchParams.get("google") === "connected";
  const queryError = searchParams.get("error");

  const [status, setStatus] = useState<{
    connected: boolean;
    googleEmail: string | null;
    connectedAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(querySuccess ? "Google Calendar connected successfully!" : null);
  const [error, setError] = useState<string | null>(queryError);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/host/google/status");
      if (res.ok) {
        const d = await res.json();
        setStatus(d.data);
      }
    } catch (err) {
      console.error("Failed to fetch Google integration status:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect Google Calendar? Future appointments will not automatically receive Google Meet video links.")) {
      return;
    }

    setDisconnecting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/host/google/disconnect", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to disconnect");
      setMessage("Google Calendar has been disconnected.");
      await loadStatus();
    } catch (err: any) {
      setError(err.message || "Failed to disconnect Google Calendar");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header with Back Link */}
      <div className="flex items-center gap-3">
        <Link
          href="/host/settings"
          className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-500 transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Integrations &amp; Conferencing
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Connect external calendar and conferencing providers to power automated video links.
          </p>
        </div>
      </div>

      {message && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Google Calendar Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-blue-600 text-xl shadow-xs">
              G
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Google Calendar &amp; Meet</h2>
              <p className="text-xs text-slate-500">Auto-generate real Google Meet video links for client bookings.</p>
            </div>
          </div>

          <div>
            {loading ? (
              <span className="text-xs text-slate-400">Checking status...</span>
            ) : status?.connected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Connected</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                <XCircle className="w-3.5 h-3.5" />
                <span>Not Connected</span>
              </span>
            )}
          </div>
        </div>

        {/* Card Body */}
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-400">
            Checking integration status...
          </div>
        ) : status?.connected ? (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Connected Account:</span>
                <span className="font-bold text-slate-800">{status.googleEmail || "Verified Google Account"}</span>
              </div>
              {status.connectedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Authorized Since:</span>
                  <span className="text-slate-700">
                    {new Date(status.connectedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Video Conferencing:</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Video className="w-3 h-3" />
                  <span>Google Meet enabled</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <a
                href="/api/auth/google"
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Reconnect Account
              </a>
              <button
                disabled={disconnecting}
                onClick={handleDisconnect}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect Google Account"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              When connected, Slotbook will automatically create events on your personal Google Calendar
              and attach genuine Google Meet video conferencing links for all confirmed appointments.
              OAuth authorization ensures only you have access to your calendar.
            </p>

            <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-start gap-3 text-xs text-indigo-900">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong>Privacy Guaranteed:</strong> Each host connects their own Google account. We only request permission to manage appointments scheduled through Slotbook.
              </span>
            </div>

            <div className="pt-2">
              <a
                href="/api/auth/google"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                <Video className="w-4 h-4" />
                <span>Connect Google Account</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HostIntegrationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading integrations...</div>}>
      <HostIntegrationsContent />
    </Suspense>
  );
}

