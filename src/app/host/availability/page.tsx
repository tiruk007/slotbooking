"use client";

import { useState, useEffect } from "react";
import {
  Clock,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Save,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const WEEKDAYS = [
  { id: 1, name: "Monday" },
  { id: 2, name: "Tuesday" },
  { id: 3, name: "Wednesday" },
  { id: 4, name: "Thursday" },
  { id: 5, name: "Friday" },
  { id: 6, name: "Saturday" },
  { id: 7, name: "Sunday" },
];

export default function HostAvailabilityPage() {
  const [homeTimezone, setHomeTimezone] = useState("UTC");
  const [weeklyRules, setWeeklyRules] = useState<any[]>([]);
  const [dateOverrides, setDateOverrides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New Date Override Form State
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideAvailable, setNewOverrideAvailable] = useState(false);
  const [newOverrideStart, setNewOverrideStart] = useState("09:00");
  const [newOverrideEnd, setNewOverrideEnd] = useState("17:00");

  // Conflict Modal
  const [conflictModal, setConflictModal] = useState<{
    affectedBookings: any[];
    overrideData: any;
  } | null>(null);

  useEffect(() => {
    loadAvailability();
  }, []);

  async function loadAvailability() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/availability");
      if (res.ok) {
        const d = await res.json();
        const payload = d?.data || d || {};
        if (payload.homeTimezone || payload.timezone) {
          setHomeTimezone(payload.homeTimezone || payload.timezone);
        }

        // Support either flat rules or grouped weeklyRules
        if (Array.isArray(payload.rules)) {
          setWeeklyRules(payload.rules);
        } else if (Array.isArray(payload.weeklyRules)) {
          const flat: any[] = [];
          for (const item of payload.weeklyRules) {
            if (Array.isArray(item.windows)) {
              for (const win of item.windows) {
                flat.push({
                  weekday: item.weekday,
                  startTime: win.start.length === 5 ? `${win.start}:00` : win.start,
                  endTime: win.end.length === 5 ? `${win.end}:00` : win.end,
                });
              }
            } else if (item.startTime && item.endTime) {
              flat.push(item);
            }
          }
          setWeeklyRules(flat);
        }

        setDateOverrides(payload.dateOverrides || payload.overrides || []);
      }
    } catch (err) {
      console.error("Failed to load availability:", err);
    } finally {
      setLoading(false);
    }
  }

  function addWeeklyWindow(weekday: number) {
    const existing = weeklyRules.filter((r) => r.weekday === weekday);
    let defaultStart = "09:00:00";
    let defaultEnd = "17:00:00";

    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      const lastEndHour = parseInt(last.endTime.slice(0, 2), 10);
      if (lastEndHour < 17) {
        const nextStartHour = Math.min(lastEndHour + 1, 21);
        const nextEndHour = Math.min(nextStartHour + 4, 22);
        defaultStart = `${String(nextStartHour).padStart(2, "0")}:00:00`;
        defaultEnd = `${String(nextEndHour).padStart(2, "0")}:00:00`;
      } else {
        defaultStart = "18:00:00";
        defaultEnd = "21:00:00";
      }
    }

    setWeeklyRules([
      ...weeklyRules,
      { weekday, startTime: defaultStart, endTime: defaultEnd },
    ]);
  }

  function removeWeeklyWindow(index: number) {
    setWeeklyRules(weeklyRules.filter((_, i) => i !== index));
  }

  function updateWeeklyWindow(index: number, field: "startTime" | "endTime", value: string) {
    const formatted = value.length === 5 ? `${value}:00` : value;
    const next = [...weeklyRules];
    next[index] = { ...next[index], [field]: formatted };
    setWeeklyRules(next);
  }

  async function handleSaveWeekly(confirmConflicts = false) {
    setError(null);
    setMessage(null);

    // 1. Client-side validation: verify time ranges, duplicates, and overlaps
    for (const day of WEEKDAYS) {
      const dayWindows = weeklyRules.filter((r) => r.weekday === day.id);
      for (let i = 0; i < dayWindows.length; i++) {
        const win = dayWindows[i];
        const startStr = win.startTime.slice(0, 5);
        const endStr = win.endTime.slice(0, 5);
        if (startStr >= endStr) {
          setError(`${day.name}: Start time (${startStr}) must be earlier than end time (${endStr}).`);
          return;
        }

        for (let j = i + 1; j < dayWindows.length; j++) {
          const other = dayWindows[j];
          const oStart = other.startTime.slice(0, 5);
          const oEnd = other.endTime.slice(0, 5);

          if (startStr === oStart && endStr === oEnd) {
            setError(`${day.name}: Duplicate window [${startStr} - ${endStr}] detected.`);
            return;
          }

          if (startStr < oEnd && oStart < endStr) {
            setError(`${day.name}: Windows [${startStr} - ${endStr}] and [${oStart} - ${oEnd}] overlap.`);
            return;
          }
        }
      }
    }

    setSaving(true);

    try {
      // Structure payload with grouped weekly rules and host timezone
      const groupedWeeklyRules = WEEKDAYS.map((day) => ({
        weekday: day.id,
        windows: weeklyRules
          .filter((r) => r.weekday === day.id)
          .map((r) => ({
            start: r.startTime.slice(0, 5),
            end: r.endTime.slice(0, 5),
          })),
      }));

      const res = await fetch("/api/dashboard/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: homeTimezone,
          weeklyRules: groupedWeeklyRules,
          dateOverrides,
          confirmConflicts,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.data?.requiresConfirmation || data?.requiresConfirmation) {
          const conf = data.data || data;
          setConflictModal({
            affectedBookings: conf.conflictingBookings || conf.affectedBookings || [],
            overrideData: null,
          });
          return;
        }
        throw new Error(data.error?.message || data.message || "Failed to save weekly schedule");
      }

      setConflictModal(null);
      setMessage("Weekly availability rules saved successfully!");
      setTimeout(() => setMessage(null), 3000);
      await loadAvailability();
    } catch (err: any) {
      setError(err.message || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddOverride(confirmConflicts = false) {
    if (!newOverrideDate) {
      setError("Please select a date for the override.");
      return;
    }

    if (newOverrideAvailable && newOverrideStart >= newOverrideEnd) {
      setError(`Override custom hours: Start time (${newOverrideStart}) must be earlier than end time (${newOverrideEnd}).`);
      return;
    }

    setSaving(true);
    setError(null);

    const overrideObj = {
      overrideDate: newOverrideDate,
      isAvailable: newOverrideAvailable,
      customStartTime: newOverrideAvailable ? `${newOverrideStart}:00` : undefined,
      customEndTime: newOverrideAvailable ? `${newOverrideEnd}:00` : undefined,
    };

    const nextOverrides = [...dateOverrides, overrideObj];

    try {
      const res = await fetch("/api/dashboard/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyRules,
          dateOverrides: nextOverrides,
          confirmConflicts,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.data?.requiresConfirmation) {
          setConflictModal({
            affectedBookings: data.data.conflictingBookings,
            overrideData: nextOverrides,
          });
          return;
        }
        throw new Error(data.error?.message || "Failed to save date override");
      }

      setConflictModal(null);
      setDateOverrides(nextOverrides);
      setNewOverrideDate("");
      setMessage(newOverrideAvailable ? "Custom hours override added!" : "Day off marked successfully!");
      setTimeout(() => setMessage(null), 3000);
      await loadAvailability();
    } catch (err: any) {
      setError(err.message || "Failed to save date override");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOverride(index: number) {
    const nextOverrides = dateOverrides.filter((_, i) => i !== index);
    setDateOverrides(nextOverrides);
    try {
      await fetch("/api/dashboard/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyRules,
          dateOverrides: nextOverrides,
        }),
      });
      setMessage("Date override removed.");
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      console.error("Delete override failed:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        Loading availability schedule...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Availability &amp; Overrides
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configure your standard working hours and mark holidays or days off.
          </p>
        </div>

        <button
          onClick={() => handleSaveWeekly(false)}
          disabled={saving}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "Saving..." : "Save Weekly Rules"}</span>
        </button>
      </div>

      {message && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* 1. Weekly Schedule Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Standard Weekly Hours</h2>
          <p className="text-xs text-slate-500">Define regular recurring appointment slots for each day of the week.</p>
        </div>

        <div className="divide-y divide-slate-100">
          {WEEKDAYS.map((day) => {
            const dayRules = weeklyRules
              .map((rule, idx) => ({ ...rule, originalIndex: idx }))
              .filter((r) => r.weekday === day.id);

            return (
              <div key={day.id} className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="w-32 font-bold text-sm text-slate-800 pt-1.5">
                  {day.name}
                </div>

                <div className="flex-1 space-y-2">
                  {dayRules.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">Unavailable / Day Off</span>
                  ) : (
                    dayRules.map((rule) => (
                      <div key={rule.originalIndex} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={rule.startTime.slice(0, 5)}
                          onChange={(e) => updateWeeklyWindow(rule.originalIndex, "startTime", e.target.value)}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                        <span className="text-xs text-slate-400">&ndash;</span>
                        <input
                          type="time"
                          value={rule.endTime.slice(0, 5)}
                          onChange={(e) => updateWeeklyWindow(rule.originalIndex, "endTime", e.target.value)}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                        <button
                          onClick={() => removeWeeklyWindow(rule.originalIndex)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition"
                          title="Remove Window"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <button
                  onClick={() => addWeeklyWindow(day.id)}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-600 transition flex items-center gap-1 self-start"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Window</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Date Overrides Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Date Overrides &amp; Days Off</h2>
          <p className="text-xs text-slate-500">
            Block specific dates (vacation, holidays) or customize operating hours for particular calendar days.
          </p>
        </div>

        {/* Add Override Form */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Date</label>
            <input
              type="date"
              value={newOverrideDate}
              onChange={(e) => setNewOverrideDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Status</label>
            <select
              value={newOverrideAvailable ? "available" : "unavailable"}
              onChange={(e) => setNewOverrideAvailable(e.target.value === "available")}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
            >
              <option value="unavailable">Unavailable (Day Off)</option>
              <option value="available">Custom Working Hours</option>
            </select>
          </div>

          {newOverrideAvailable && (
            <div className="sm:col-span-1 flex items-center gap-2">
              <input
                type="time"
                value={newOverrideStart}
                onChange={(e) => setNewOverrideStart(e.target.value)}
                className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs bg-white"
              />
              <span className="text-xs text-slate-400">&ndash;</span>
              <input
                type="time"
                value={newOverrideEnd}
                onChange={(e) => setNewOverrideEnd(e.target.value)}
                className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs bg-white"
              />
            </div>
          )}

          <div>
            <button
              onClick={() => handleAddOverride(false)}
              disabled={saving || !newOverrideDate}
              className="w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
            >
              Add Date Override
            </button>
          </div>
        </div>

        {/* List of active date overrides */}
        {dateOverrides.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No specific date overrides configured.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {dateOverrides.map((ov, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-slate-900">{ov.overrideDate}</span>
                  <span className="ml-3 text-xs text-slate-500">
                    {ov.isAvailable
                      ? `Custom Hours: ${ov.customStartTime?.slice(0, 5)} - ${ov.customEndTime?.slice(0, 5)}`
                      : "Marked as Day Off"}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteOverride(idx)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition"
                  title="Remove Override"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conflict Modal */}
      {conflictModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Conflicts Detected with Existing Bookings</h3>
                <p className="text-xs text-slate-500 mt-1">
                  You have confirmed client bookings on the dates you are modifying.
                </p>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-slate-50 rounded-xl p-3 text-xs">
              {conflictModal.affectedBookings.map((b: any) => (
                <div key={b.id} className="py-2">
                  <div className="font-bold text-slate-800">{b.eventName} with {b.guestName}</div>
                  <div className="text-slate-500">{new Date(b.startAt).toLocaleString()} ({b.guestEmail})</div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setConflictModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                Go Back &amp; Adjust Dates
              </button>
              <button
                onClick={() => {
                  if (conflictModal.overrideData) {
                    handleAddOverride(true);
                  } else {
                    handleSaveWeekly(true);
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold"
              >
                Confirm Day Off &amp; Cancel Bookings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

