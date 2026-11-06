import { z } from "zod";

export const createHoldSchema = z.object({
  eventTypeId: z.string().uuid("Invalid eventTypeId format"),
  startAt: z.string().datetime({ message: "startAt must be a valid ISO-8601 timestamp" }),
  guestName: z.string().min(1, "Guest name is required").max(100).optional(),
  guestEmail: z.string().email("Invalid email address").optional(),
  guestTimezone: z.string().optional(),
  meetingPurpose: z.string().min(3, "Meeting purpose must be at least 3 characters").max(1000).optional(),
});

export const confirmHoldSchema = z.object({
  code: z.string().length(6, "Verification code must be 6 digits").regex(/^\d{6}$/, "Code must be 6 digits").optional(),
  guestName: z.string().min(1, "Guest name is required").max(100).optional(),
  guestEmail: z.string().email("Invalid email address").optional(),
  guestTimezone: z.string().optional(),
  meetingPurpose: z.string().min(3, "Meeting purpose is required").max(1000).optional(),
});

export const rescheduleBookingSchema = z.object({
  newStartAt: z.string().datetime({ message: "newStartAt must be a valid ISO-8601 timestamp" }),
  guestTimezone: z.string().optional(),
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
  description: z.string().max(500).optional().default(""),
  category: z.string().max(50).optional().default("One-on-One"),
  status: z.enum(["PUBLISHED", "DRAFT", "INACTIVE"]).optional().default("PUBLISHED"),
  durationMinutes: z.number().int().min(15).max(120),
  capacity: z.number().int().min(1).default(1),
  bufferBefore: z.number().int().min(0).default(0),
  bufferAfter: z.number().int().min(0).default(0),
  minimumNoticeMinutes: z.number().int().min(0).default(60),
  bookingHorizonDays: z.number().int().min(1).max(365).default(30),
});

export const timeWindowSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Invalid start time format (HH:mm)"),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Invalid end time format (HH:mm)"),
});

export const weeklyDayRuleSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  windows: z.array(timeWindowSchema),
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

export const updateAvailabilityInputSchema = z.object({
  timezone: z.string().optional(),
  homeTimezone: z.string().optional(),
  weeklyRules: z.union([z.array(weeklyDayRuleSchema), z.array(availabilityRuleSchema)]).optional(),
  rules: z.array(availabilityRuleSchema).optional(),
  dateOverrides: z.array(dateOverrideSchema).optional(),
  overrides: z.array(dateOverrideSchema).optional(),
  confirmConflicts: z.boolean().optional(),
  confirmCancellation: z.boolean().optional(),
  cancellationReason: z.string().optional(),
});

export const hostRegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  homeTimezone: z.string().default("UTC"),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms of Service to create an account" }),
  }),
});

export const hostRequestLoginOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const hostVerifyOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
  code: z.string().length(6, "Verification code must be 6 digits").regex(/^\d{6}$/, "Code must be numeric"),
  purpose: z.enum(["HOST_REGISTER", "HOST_LOGIN", "HOST_DELETE_ACCOUNT", "GUEST_BOOKING"]),
});

export const hostDeleteAccountSchema = z.object({
  code: z.string().length(6, "Verification code must be 6 digits").regex(/^\d{6}$/, "Code must be numeric"),
  confirmPhrase: z.literal("DELETE", {
    errorMap: () => ({ message: 'Please type "DELETE" to confirm account deletion' }),
  }),
});
