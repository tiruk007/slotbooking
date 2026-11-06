"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";

function HostVerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const purpose = searchParams.get("purpose") || "login";

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Please enter all 6 digits of your verification code.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = purpose === "register" ? "/api/auth/register/verify" : "/api/auth/login-otp/verify";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Verification failed");
      }

      setSuccessMsg(
        purpose === "register"
          ? "Account verified! Opening your Host Portal..."
          : "Verification successful! Opening your Host Portal..."
      );

      const destination = data.redirectTo || data.data?.redirectTo || "/host/dashboard";
      // Perform clean full-page navigation so browser flushes cookies and initializes layout session
      setTimeout(() => {
        window.location.href = destination;
      }, 500);
    } catch (err: any) {
      setError(err.message || "Invalid or expired code");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const endpoint = purpose === "register" ? "/api/auth/register" : "/api/auth/login-otp/request";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to resend code");
      setTimeLeft(300);
      setSuccessMsg("A new verification code has been dispatched to your email.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || "Could not resend code");
    } finally {
      setResending(false);
    }
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="w-full max-w-md bg-slate-800/90 border border-slate-700/80 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl">
      <div className="text-center space-y-2 mb-8">
        <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-2">
          <KeyRound className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Enter Security Code</h1>
        <p className="text-xs text-slate-400">
          We sent a 6-digit one-time code to <strong className="text-white">{email}</strong>
        </p>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-6">
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 text-center">
            6-Digit Verification Code
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="&bull;&bull;&bull;&bull;&bull;&bull;"
            className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Expires in: {minutes}:{seconds < 10 ? `0${seconds}` : seconds}</span>
          <button
            type="button"
            disabled={resending || timeLeft > 270}
            onClick={handleResend}
            className="text-indigo-400 hover:text-indigo-300 disabled:opacity-40 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
            <span>Resend Code</span>
          </button>
        </div>

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <span>Verifying Code...</span>
          ) : (
            <>
              <span>Verify &amp; Continue</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-700/60 text-center text-xs text-slate-400">
        Wrong email address?{" "}
        <Link href={purpose === "register" ? "/host/signup" : "/host/login"} className="text-indigo-400 hover:text-indigo-300 font-semibold">
          Change Email
        </Link>
      </div>
    </div>
  );
}

export default function HostVerifyOtpPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-sm">Loading security verification...</div>}>
      <HostVerifyOtpContent />
    </Suspense>
  );
}
