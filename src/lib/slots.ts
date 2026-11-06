import { DateTime } from "luxon";
import { parseTimeString, createZonedDateTime } from "./timezone";

export interface AvailabilityRule {
  weekday: number; // 1=Mon .. 7=Sun
  startTime: string; // "09:00:00"
  endTime: string; // "17:00:00"
}

export interface DateOverride {
  overrideDate: string; // "YYYY-MM-DD"
  isAvailable: boolean;
  customStartTime?: string | null;
  customEndTime?: string | null;
}

export interface ActiveBooking {
  startAt: Date;
  endAt: Date;
  bufferBefore: number;
  bufferAfter: number;
  eventTypeId: string;
}

export interface EventTypeConfig {
  id?: string;
  durationMinutes: number;
  capacity: number;
  bufferBefore: number;
  bufferAfter: number;
  minimumNoticeMinutes: number;
  bookingHorizonDays: number;
}

export interface AvailableSlot {
  startAt: string; // UTC ISO
  endAt: string; // UTC ISO
  remainingCapacity: number;
}

function advanceSlot(current: DateTime, stepMinutes: number, latest: DateTime): DateTime {
  const next = current.plus({ minutes: stepMinutes });
  if (next > latest && current < latest) {
    return latest;
  }
  return next;
}

/**
 * Calculates available booking slots for a host and event type within a date range.
 * Fully enforces buffer-before, buffer-after, minimum notice, booking horizon (in host calendar),
 * group capacity, weekly availability, and date overrides.
 */
export function calculateAvailableSlots(params: {
  hostTimezone: string;
  from: DateTime;
  to: DateTime;
  eventType: EventTypeConfig;
  rules: AvailabilityRule[];
  overrides: DateOverride[];
  existingBookings: ActiveBooking[];
  now?: DateTime;
}): AvailableSlot[] {
  const {
    hostTimezone,
    from,
    to,
    eventType,
    rules,
    overrides,
    existingBookings,
    now = DateTime.utc(),
  } = params;

  // Authoritative minimum notice instant in UTC
  const minNoticeTimeUtc = now.plus({ minutes: eventType.minimumNoticeMinutes });

  // Authoritative booking horizon calculated using host's local calendar day
  const nowInHostTz = now.setZone(hostTimezone);
  const maxHorizonHostLocalEnd = nowInHostTz
    .startOf("day")
    .plus({ days: eventType.bookingHorizonDays })
    .endOf("day");
  const maxHorizonTimeUtc = maxHorizonHostLocalEnd.toUTC();

  // Map overrides by date string YYYY-MM-DD
  const overrideMap = new Map<string, DateOverride>();
  for (const o of overrides) {
    overrideMap.set(o.overrideDate, o);
  }

  // Group weekly rules by weekday (1..7)
  const rulesByWeekday = new Map<number, AvailabilityRule[]>();
  for (const r of rules) {
    const list = rulesByWeekday.get(r.weekday) || [];
    list.push(r);
    rulesByWeekday.set(r.weekday, list);
  }

  const availableSlots: AvailableSlot[] = [];

  // Iterate calendar days in host's local timezone
  let currentDay = from.setZone(hostTimezone).startOf("day");
  const endDay = to.setZone(hostTimezone).endOf("day");

  // Step interval for slots (e.g. 15 minutes)
  const stepMinutes = Math.min(eventType.durationMinutes, 15);

  while (currentDay <= endDay) {
    const dateStr = currentDay.toISODate(); // "YYYY-MM-DD"
    const weekday = currentDay.weekday; // 1=Mon .. 7=Sun

    let dayWindows: { startHour: number; startMin: number; endHour: number; endMin: number }[] = [];

    // Date override takes strict precedence over weekly availability
    if (overrideMap.has(dateStr!)) {
      const override = overrideMap.get(dateStr!)!;
      if (override.isAvailable) {
        if (override.customStartTime && override.customEndTime) {
          const s = parseTimeString(override.customStartTime);
          const e = parseTimeString(override.customEndTime);
          dayWindows.push({
            startHour: s.hour,
            startMin: s.minute,
            endHour: e.hour,
            endMin: e.minute,
          });
        } else {
          // Available using normal weekday rules
          const weekdayRules = rulesByWeekday.get(weekday) || [];
          for (const r of weekdayRules) {
            const s = parseTimeString(r.startTime);
            const e = parseTimeString(r.endTime);
            dayWindows.push({
              startHour: s.hour,
              startMin: s.minute,
              endHour: e.hour,
              endMin: e.minute,
            });
          }
        }
      }
      // If isAvailable === false (day off), dayWindows remains empty!
    } else {
      // Normal weekday rules
      const weekdayRules = rulesByWeekday.get(weekday) || [];
      for (const r of weekdayRules) {
        const s = parseTimeString(r.startTime);
        const e = parseTimeString(r.endTime);
        dayWindows.push({
          startHour: s.hour,
          startMin: s.minute,
          endHour: e.hour,
          endMin: e.minute,
        });
      }
    }

    // Evaluate each window on this day independently
    for (const win of dayWindows) {
      const windowStart = createZonedDateTime(
        currentDay.year,
        currentDay.month,
        currentDay.day,
        win.startHour,
        win.startMin,
        hostTimezone
      );
      const windowEnd = createZonedDateTime(
        currentDay.year,
        currentDay.month,
        currentDay.day,
        win.endHour,
        win.endMin,
        hostTimezone
      );

      if (!windowStart || !windowEnd) {
        // Skipped due to DST gap
        continue;
      }

      // Valid meeting starts must fit entirely inside the host's availability window after accounting for buffers:
      // Meeting: [slotStart, slotEnd] where slotEnd = slotStart + duration
      // Reserved: [slotStart - bufferBefore, slotEnd + bufferAfter]
      // Requirement:
      // slotStart - bufferBefore >= windowStart => slotStart >= windowStart + bufferBefore
      // slotEnd + bufferAfter <= windowEnd => slotStart <= windowEnd - duration - bufferAfter
      const earliestStart = windowStart.plus({ minutes: eventType.bufferBefore });
      const latestStart = windowEnd.minus({
        minutes: eventType.durationMinutes + eventType.bufferAfter,
      });

      if (earliestStart > latestStart) {
        // Window is too small to host meeting duration + buffers
        continue;
      }

      let slotStart = earliestStart;

      while (slotStart <= latestStart) {
        const slotEnd = slotStart.plus({ minutes: eventType.durationMinutes });
        const slotStartUtc = slotStart.toUTC();
        const slotEndUtc = slotEnd.toUTC();

        // 1. Authoritative minimum notice check
        if (slotStartUtc < minNoticeTimeUtc) {
          slotStart = advanceSlot(slotStart, stepMinutes, latestStart);
          continue;
        }

        // 2. Authoritative booking horizon check
        if (slotStartUtc > maxHorizonTimeUtc) {
          slotStart = advanceSlot(slotStart, stepMinutes, latestStart);
          continue;
        }

        // 3. Existing bookings & cross-event buffer collision check
        // Candidate slot reserved buffered range in UTC milliseconds:
        // [candidateBufStart, candidateBufEnd)
        const candidateBufStart = slotStartUtc.minus({ minutes: eventType.bufferBefore }).toMillis();
        const candidateBufEnd = slotEndUtc.plus({ minutes: eventType.bufferAfter }).toMillis();

        let activeCount = 0;
        let isBlocked = false;

        for (const b of existingBookings) {
          const bookingStartMillis = b.startAt.getTime();
          const bookingEndMillis = b.endAt.getTime();
          const bookingBufStart = bookingStartMillis - b.bufferBefore * 60 * 1000;
          const bookingBufEnd = bookingEndMillis + b.bufferAfter * 60 * 1000;

          // Check if this booking belongs to the exact same group session
          if (
            eventType.capacity > 1 &&
            eventType.id &&
            b.eventTypeId === eventType.id &&
            bookingStartMillis === slotStartUtc.toMillis()
          ) {
            activeCount++;
          } else {
            // Buffer collision: intervals overlap if candidateBufStart < bookingBufEnd AND bookingBufStart < candidateBufEnd
            if (candidateBufStart < bookingBufEnd && bookingBufStart < candidateBufEnd) {
              isBlocked = true;
              break;
            }
          }
        }

        if (!isBlocked && activeCount < eventType.capacity) {
          availableSlots.push({
            startAt: slotStartUtc.toISO()!,
            endAt: slotEndUtc.toISO()!,
            remainingCapacity: eventType.capacity - activeCount,
          });
        }

        slotStart = advanceSlot(slotStart, stepMinutes, latestStart);
      }
    }

    currentDay = currentDay.plus({ days: 1 });
  }

  return availableSlots;
}
