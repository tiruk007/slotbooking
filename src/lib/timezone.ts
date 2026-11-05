import { DateTime, IANAZone } from "luxon";

/**
 * Validates whether an IANA time zone identifier is valid.
 */
export function isValidIanaZone(zone: string): boolean {
  if (!zone || typeof zone !== "string") return false;
  return IANAZone.isValidZone(zone);
}

/**
 * Checks whether a requested local wall-clock time actually exists in the target zone.
 * During spring-forward DST transitions, an hour is skipped (e.g. 02:00 -> 03:00 in America/New_York).
 * Times like 02:30 do not exist.
 */
export function isValidWallTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string
): boolean {
  if (!isValidIanaZone(zone)) return false;

  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone }
  );

  if (!dt.isValid) return false;

  // If Luxon had to shift the hour/minute because it fell into a nonexistent DST gap,
  // the resulting wall hour/minute will differ from requested.
  return dt.hour === hour && dt.minute === minute;
}

/**
 * Creates an unambiguous DateTime in the target zone from calendar components.
 * Explicit Policy:
 * 1. Nonexistent wall time (spring forward): Rejects and returns null.
 * 2. Ambiguous wall time (fall back): Consistently resolved using standard IANA rules
 *    to Standard Time (the final settled offset of the transition day).
 */
export function createZonedDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string
): DateTime | null {
  if (!isValidWallTime(year, month, day, hour, minute, zone)) {
    return null;
  }

  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone }
  );

  return dt.isValid ? dt : null;
}

/**
 * Parses time string (e.g. "09:00" or "17:30:00") into hour and minute integers.
 */
export function parseTimeString(timeStr: string): { hour: number; minute: number } {
  const parts = timeStr.split(":");
  return {
    hour: parseInt(parts[0], 10),
    minute: parseInt(parts[1], 10),
  };
}

/**
 * Formats a UTC instant or ISO string into a localized string in the guest's zone.
 */
export function formatInZone(
  utcIso: string | Date,
  zone: string,
  format: string = "ccc, LLL d, yyyy h:mm a"
): string {
  const dt =
    typeof utcIso === "string"
      ? DateTime.fromISO(utcIso, { zone: "utc" }).setZone(zone)
      : DateTime.fromJSDate(utcIso, { zone: "utc" }).setZone(zone);

  return dt.toFormat(format);
}
