"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Globe,
  AlertTriangle,
  Save,
  CheckCircle2,
  Trash2,
  KeyRound,
  Shield,
  Link2,
} from "lucide-react";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export default function HostSettingsPage() {
  const router = useRouter();
  const [host, setHost] = useState<any>(null);
  const [homeTimezone, setHomeTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [savingTz, setSavingTz] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Deletion Flow
  const [deleteStep, setDeleteStep] = useState<"IDLE" | "CONFIRM" | "OTP">("IDLE");
  const [deleteOtp, setDeleteOtp] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const d = await res.json();
          const hostData = d?.data?.host || d?.host;
          if (hostData) {
            setHost(hostData);
            setHomeTimezone(hostData.homeTimezone || "UTC");
          }
        }
      } catch (err) {
        console.error("Failed to load host profile:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleSaveTimezone() {
    setSavingTz(true);
    setMessage(null);
    try {
      // Save timezone using availability endpoint
      const res = await fetch("/api/dashboard/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: homeTimezone,
        }),
      });
      setMessage("Timezone saved successfully!");
      setTimeout(() => setMessage(null), 3000);
    } catch {
      // ignore
    } finally {
      setSavingTz(false);
    }
  }

  async function handleRequestDeleteOtp() {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/auth/delete-account/request-otp", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to send code");
      setDeleteStep("OTP");
    } catch (err: any) {
      setDeleteError(err.message || "Failed to request deletion OTP");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleVerifyDelete() {
    if (deleteOtp.length !== 6) {
      setDeleteError("Please enter all 6 digits.");
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/auth/delete-account/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: deleteOtp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to delete account");
      router.push("/host/login");
    } catch (err: any) {
      setDeleteError(err.message || "Invalid deletion code");
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Account Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage your verified host identity, timezone, and security options.
        </p>
      </div>

      {message && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Host Identity</h2>
          <p className="text-xs text-slate-500">Your profile details displayed to clients on booking pages.</p>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Full Name
            </label>
            <div className="font-bold text-slate-900">{host?.name}</div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Verified Email
            </label>
            <div className="font-bold text-slate-900">{host?.email}</div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Host Slug
            </label>
            <div className="font-mono text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg inline-block">
              /book/{host?.slug || host?.email}/[event-slug]
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Primary Scheduling Timezone
            </label>
            <div className="flex items-center gap-3">
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
                onClick={handleSaveTimezone}
                disabled={savingTz}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {savingTz ? "Saving..." : "Save Timezone"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone: Account Deletion */}
      <div className="bg-white rounded-3xl border border-red-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-red-50 text-red-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-red-900">Delete Host Account</h2>
            <p className="text-xs text-slate-600 leading-relaxed mt-1">
              Permanently delete your host profile, events, and availability. All upcoming client bookings
              will be cancelled transactionally and affected guests will be notified by email. This action is irreversible.
            </p>
          </div>
        </div>

        {deleteError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {deleteError}
          </div>
        )}

        {deleteStep === "IDLE" && (
          <button
            onClick={() => setDeleteStep("CONFIRM")}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition"
          >
            I want to delete my account
          </button>
        )}

        {deleteStep === "CONFIRM" && (
          <div className="p-4 rounded-2xl bg-red-50/50 border border-red-200 space-y-3">
            <p className="text-xs font-bold text-red-900">
              Are you completely sure? To verify ownership, we will send a 6-digit confirmation code to your email.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDeleteStep("IDLE")}
                className="px-4 py-2 border border-slate-300 bg-white rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={deleteLoading}
                onClick={handleRequestDeleteOtp}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {deleteLoading ? "Sending Code..." : "Send Deletion Code"}
              </button>
            </div>
          </div>
        )}

        {deleteStep === "OTP" && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 space-y-4">
            <div>
              <label className="block text-xs font-bold text-red-900 uppercase tracking-wider mb-1">
                Enter 6-Digit Deletion Code Sent to {host?.email}
              </label>
              <input
                type="text"
                maxLength={6}
                value={deleteOtp}
                onChange={(e) => setDeleteOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="&bull;&bull;&bull;&bull;&bull;&bull;"
                className="w-48 px-4 py-2.5 bg-white border border-red-300 rounded-xl font-mono text-center text-lg tracking-widest text-red-900 focus:outline-hidden"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDeleteStep("IDLE")}
                className="px-4 py-2 border border-slate-300 bg-white rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={deleteLoading || deleteOtp.length !== 6}
                onClick={handleVerifyDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {deleteLoading ? "Verifying & Deleting..." : "Permanently Delete Account"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

