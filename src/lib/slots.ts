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
  id: string;
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

/**
 * Calculates available booking slots for a host and event type within a date range.
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

  const minNoticeTime = now.plus({ minutes: eventType.minimumNoticeMinutes });
  const maxHorizonTime = now.plus({ days: eventType.bookingHorizonDays });

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

  // Iterate calendar days in host's timezone
  let currentDay = from.setZone(hostTimezone).startOf("day");
  const endDay = to.setZone(hostTimezone).endOf("day");

  // Step interval for slots (e.g. 30 min or duration if less than 30)
  const stepMinutes = Math.min(eventType.durationMinutes, 30);

  while (currentDay <= endDay) {
    const dateStr = currentDay.toISODate(); // "YYYY-MM-DD"
    const weekday = currentDay.weekday; // 1=Mon .. 7=Sun

    let dayWindows: { startHour: number; startMin: number; endHour: number; endMin: number }[] = [];

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
          // Available using normal rules
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

    // Evaluate each window on this day
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
        // Skipped due to DST nonexistent gap
        continue;
      }

      let slotStart = windowStart;

      while (slotStart.plus({ minutes: eventType.durationMinutes }) <= windowEnd) {
        const slotEnd = slotStart.plus({ minutes: eventType.durationMinutes });
        const slotStartUtc = slotStart.toUTC();
        const slotEndUtc = slotEnd.toUTC();

        // 1. Notice check
        if (slotStartUtc < minNoticeTime) {
          slotStart = slotStart.plus({ minutes: stepMinutes });
          continue;
        }

        // 2. Horizon check
        if (slotStartUtc > maxHorizonTime) {
          slotStart = slotStart.plus({ minutes: stepMinutes });
          continue;
        }

        // 3. Existing bookings & capacity check
        // Candidate slot reserved buffered range:
        const candidateBufStart = slotStartUtc.minus({ minutes: eventType.bufferBefore }).toMillis();
        const candidateBufEnd = slotEndUtc.plus({ minutes: eventType.bufferAfter }).toMillis();

        let activeCount = 0;
        let isBlocked = false;

        for (const b of existingBookings) {
          const bookingStartMillis = b.startAt.getTime();
          const bookingEndMillis = b.endAt.getTime();
          const bookingBufStart = bookingStartMillis - b.bufferBefore * 60 * 1000;
          const bookingBufEnd = bookingEndMillis + b.bufferAfter * 60 * 1000;

          if (eventType.capacity === 1) {
            // Any overlap with buffered range blocks this 1-on-1 slot
            // Ranges overlap if: start1 < end2 AND start2 < end1
            if (candidateBufStart < bookingBufEnd && bookingBufStart < candidateBufEnd) {
              isBlocked = true;
              break;
            }
          } else {
            // Group booking: count bookings matching this exact slot start
            if (b.eventTypeId === eventType.id && bookingStartMillis === slotStartUtc.toMillis()) {
              activeCount++;
            } else if (b.eventTypeId !== eventType.id) {
              // Another event overlaps host's schedule
              if (candidateBufStart < bookingBufEnd && bookingBufStart < candidateBufEnd) {
                isBlocked = true;
                break;
              }
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

        slotStart = slotStart.plus({ minutes: stepMinutes });
      }
    }

    currentDay = currentDay.plus({ days: 1 });
  }

  return availableSlots;
}
