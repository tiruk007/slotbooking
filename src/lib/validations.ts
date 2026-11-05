import { z } from "zod";

export const createHoldSchema = z.object({
  eventTypeId: z.string().uuid("Invalid eventTypeId format"),
  startAt: z.string().datetime({ message: "startAt must be a valid ISO-8601 timestamp" }),
});

export const confirmHoldSchema = z.object({
  guestName: z.string().min(1, "Guest name is required").max(100),
  guestEmail: z.string().email("Invalid email address"),
});

export const rescheduleBookingSchema = z.object({
  newStartAt: z.string().datetime({ message: "newStartAt must be a valid ISO-8601 timestamp" }),
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const slotsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  tz: z.string().default("UTC"),
});

export const eventTypeSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens"),
  durationMinutes: z.number().int().min(15).max(120),
  capacity: z.number().int().min(1).default(1),
  bufferBefore: z.number().int().min(0).default(0),
  bufferAfter: z.number().int().min(0).default(0),
  minimumNoticeMinutes: z.number().int().min(0).default(60),
  bookingHorizonDays: z.number().int().min(1).max(365).default(30),
});

export const availabilityRuleSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Invalid start time format (HH:mm)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Invalid end time format (HH:mm)"),
});

export const dateOverrideSchema = z.object({
  overrideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  isAvailable: z.boolean(),
  customStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
  customEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
