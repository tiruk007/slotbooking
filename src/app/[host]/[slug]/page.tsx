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
  MessageSquare,
  KeyRound,
  RotateCcw,
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

  // Selected date & slot
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);

  // Booking step: 1 = select slot, 2 = details & request code, 3 = verify OTP, 4 = confirmed
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3 | 4>(1);

  // Guest inputs
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [meetingPurpose, setMeetingPurpose] = useState("");

  // Hold & OTP state
  const [activeHold, setActiveHold] = useState<any | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number>(300);
  const [verificationCode, setVerificationCode] = useState("");
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

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
        setBookingStep(1);
        setError("Your 5-minute hold has expired. Please select a slot again.");
        loadSlots();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeHold]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

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
      });
      const list = map.get(dateKey) || [];
      list.push(slot);
      map.set(dateKey, list);
    }
    return map;
  }, [slots, guestTz]);

  const availableDates = useMemo(() => {
    return Array.from(slotsByDate.keys()).sort();
  }, [slotsByDate]);

  // Handle slot selection -> Move to details step
  const handleSlotClick = (slot: any) => {
    setSelectedSlot(slot);
    setBookingStep(2);
    setError(null);
  };

  // Step 2: Request Hold and Send Verification Code
  const handleRequestHoldAndCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !eventData) return;

    if (!guestName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!guestEmail.trim()) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!meetingPurpose.trim() || meetingPurpose.trim().length < 3) {
      setError("Please explain the purpose of your appointment (at least 3 characters).");
      return;
    }

    setIsRequestingCode(true);
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
          startAt: selectedSlot.startAt,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          meetingPurpose: meetingPurpose.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to reserve slot");
      }

      setActiveHold(data);
      const expiresAt = new Date(data.holdExpiresAt).getTime();
      setHoldSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
      setResendCooldown(30);
      setBookingStep(3);
    } catch (err: any) {
      setError(err.message || "Could not reserve slot. Please select another slot.");
      loadSlots();
    } finally {
      setIsRequestingCode(false);
    }
  };

  // Resend OTP code
  const handleResendCode = async () => {
    if (!activeHold || resendCooldown > 0) return;
    setError(null);
    try {
      const res = await fetch(`/api/holds/${activeHold.id}/resend-otp`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to resend verification code");
      }
      setResendCooldown(30);
    } catch (err: any) {
      setError(err.message || "Failed to resend code");
    }
  };

  // Step 3: Verify OTP and Confirm Booking
  const handleConfirmWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHold) return;

    if (!verificationCode || verificationCode.trim().length !== 6) {
      setError("Please enter the 6-digit verification code sent to your email.");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const res = await fetch(`/api/holds/${activeHold.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: verificationCode.trim(),
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          meetingPurpose: meetingPurpose.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to confirm booking");
      }

      setConfirmedBooking(data);
      setActiveHold(null);
      setBookingStep(4);
    } catch (err: any) {
      setError(err.message || "Verification failed. Please check the code and try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  if (loading && !hostData) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-slate-500">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading available times...</span>
        </div>
      </div>
    );
  }

  // STEP 4: Confirmed View
  if (confirmedBooking) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">You are Scheduled!</h1>
            <p className="text-slate-600">
              A calendar appointment has been created with <strong>{hostData?.name}</strong>.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-left space-y-3.5 text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="font-semibold text-slate-900 text-base">{eventData?.name}</span>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {eventData?.durationMinutes} mins
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-700">
              <Calendar className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span>
                {new Date(confirmedBooking.startAt).toLocaleString("en-US", {
                  timeZone: guestTz,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-700">
              <Globe className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span>{guestTz}</span>
            </div>

            <div className="flex items-start gap-2 text-slate-700 pt-2 border-t border-slate-200">
              <MessageSquare className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-slate-500 uppercase font-semibold block">Meeting Purpose</span>
                <p className="text-slate-800 text-sm mt-0.5">{confirmedBooking.meetingPurpose}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200">
              <div className="text-xs text-slate-500 bg-slate-100/70 p-3 rounded-lg">
                <strong>Appointment Status:</strong> Confirmed. You and the host can coordinate directly using the contact details above.
              </div>
            </div>
          </div>

          <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 text-left flex items-start gap-3">
            <Mail className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 leading-relaxed">
              We sent a confirmation email to <strong>{confirmedBooking.guestEmail}</strong>.
              You do not need an account. If you ever need to reschedule or cancel, use your private management link below.
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            {confirmedBooking.manageUrl && (
              <Link
                href={confirmedBooking.manageUrl}
                className="inline-flex items-center justify-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition"
              >
                <span>Manage Appointment</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
            <Link
              href="/"
              className="inline-flex items-center justify-center space-x-2 px-6 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition"
            >
              <span>Back to Slotbook</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      {/* Host / Event Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              <User className="w-3.5 h-3.5" />
              <span>{hostData?.name}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{eventData?.name}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>{eventData?.durationMinutes} Minutes</span>
              </span>
              {eventData?.capacity > 1 && (
                <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-medium border border-emerald-100">
                  Group Event (Max {eventData.capacity} guests)
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-slate-400" />
              <select
                value={guestTz}
                onChange={(e) => setGuestTz(e.target.value)}
                className="text-xs font-medium border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            {hostData?.timezone && hostData.timezone !== guestTz && (
              <span className="text-[11px] text-slate-500 font-medium">
                Host working hours based on {hostData.timezone}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-6 sm:mx-8 my-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-sm text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* STEP 1: Select Date & Time Slot */}
        {bookingStep === 1 && (
          <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Available Dates */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>1. Select Date</span>
              </h3>

              {availableDates.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-sm text-slate-500">
                  No available dates in the next {eventData?.bookingHorizonDays || 30} days.
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {availableDates.map((dateStr) => {
                    const isSelected = selectedDate === dateStr;
                    const dateObj = new Date(dateStr + "T00:00:00");
                    const slotCount = slotsByDate.get(dateStr)?.length || 0;

                    return (
                      <button
                        key={dateStr}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`w-full text-left p-3.5 rounded-xl border transition flex items-center justify-between ${
                          isSelected
                            ? "bg-indigo-50 border-indigo-600 text-indigo-900 font-semibold shadow-sm"
                            : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
                        }`}
                      >
                        <div>
                          <div className="text-sm">
                            {dateObj.toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="text-xs text-slate-500">{slotCount} slots available</div>
                        </div>
                        <ArrowRight className={`w-4 h-4 ${isSelected ? "text-indigo-600" : "text-slate-300"}`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Available Slots */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>2. Select Time ({guestTz})</span>
              </h3>

              {!selectedDate || (slotsByDate.get(selectedDate) || []).length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-sm text-slate-500">
                  Please select an available date on the left.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
                  {(slotsByDate.get(selectedDate) || []).map((slot) => {
                    const timeLabel = new Date(slot.startAt).toLocaleTimeString("en-US", {
                      timeZone: guestTz,
                      hour: "numeric",
                      minute: "2-digit",
                    });

                    return (
                      <button
                        key={slot.startAt}
                        onClick={() => handleSlotClick(slot)}
                        className="py-3 px-4 border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/50 rounded-xl text-sm font-semibold text-slate-800 hover:text-indigo-700 transition flex items-center justify-center shadow-sm"
                      >
                        {timeLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Guest Details Form */}
        {bookingStep === 2 && selectedSlot && (
          <div className="p-6 sm:p-8 max-w-xl mx-auto">
            <button
              onClick={() => {
                setBookingStep(1);
                setError(null);
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mb-6"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to time selection</span>
            </button>

            <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 mb-6 text-xs text-indigo-900 flex items-center justify-between">
              <div>
                <span className="font-bold block">{eventData?.name}</span>
                <span>
                  {new Date(selectedSlot.startAt).toLocaleString("en-US", {
                    timeZone: guestTz,
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  ({guestTz})
                </span>
              </div>
              <span className="text-xs bg-white px-2.5 py-1 rounded border border-indigo-200 font-semibold">
                {eventData?.durationMinutes}m
              </span>
            </div>

            <form onSubmit={handleRequestHoldAndCode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Tirumalesh"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  A 6-digit verification code will be sent to this email to verify your booking.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Meeting Purpose / Agenda <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={meetingPurpose}
                  onChange={(e) => setMeetingPurpose(e.target.value)}
                  placeholder="Briefly explain what you would like to discuss during this appointment."
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isRequestingCode}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-sm transition flex items-center justify-center space-x-2"
              >
                {isRequestingCode ? (
                  <span>Reserving slot &amp; sending code...</span>
                ) : (
                  <>
                    <span>Continue to Verification</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* STEP 3: OTP Verification Form */}
        {bookingStep === 3 && activeHold && (
          <div className="p-6 sm:p-8 max-w-md mx-auto text-center space-y-6">
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100">
              <KeyRound className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">Verify Your Email</h2>
              <p className="text-xs text-slate-600 mt-1">
                We sent a 6-digit code to <strong>{guestEmail}</strong>.
              </p>
            </div>

            {/* 5-minute countdown */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-semibold text-amber-800">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Slot reserved for: {Math.floor(holdSecondsLeft / 60)}:
                {String(holdSecondsLeft % 60).padStart(2, "0")}
              </span>
            </div>

            <form onSubmit={handleConfirmWithOtp} className="space-y-4">
              <div>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  className="w-48 mx-auto text-center tracking-[0.5em] text-2xl font-bold py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isVerifying || verificationCode.length !== 6}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-sm transition flex items-center justify-center space-x-2"
              >
                {isVerifying ? <span>Confirming booking...</span> : <span>Confirm Appointment</span>}
              </button>
            </form>

            <div className="pt-2 text-xs text-slate-500">
              Didn't receive the code?{" "}
              {resendCooldown > 0 ? (
                <span className="text-slate-400">Resend in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="text-indigo-600 font-semibold hover:underline"
                >
                  Resend code
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
