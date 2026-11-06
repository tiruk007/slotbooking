import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  time,
  date,
  jsonb,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Custom type for PostgreSQL tstzrange
const tstzrange = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tstzrange";
  },
});

export const hosts = pgTable("hosts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  slug: text("slug").unique(),
  passwordHash: text("password_hash"),
  homeTimezone: text("home_timezone").notNull().default("UTC"),
  status: text("status").notNull().default("ACTIVE"),
  googleRefreshToken: text("google_refresh_token"),
  googleAccessToken: text("google_access_token"),
  googleTokenExpiry: timestamp("google_token_expiry", { withTimezone: true }),
  googleEmail: text("google_email"),
  googleConnectedAt: timestamp("google_connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventTypes = pgTable(
  "event_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    category: text("category").notNull().default("One-on-One"),
    status: text("status").notNull().default("PUBLISHED"),
    durationMinutes: integer("duration_minutes").notNull(), // 15..120
    capacity: integer("capacity").notNull().default(1),
    bufferBefore: integer("buffer_before").notNull().default(0),
    bufferAfter: integer("buffer_after").notNull().default(0),
    minimumNoticeMinutes: integer("minimum_notice_minutes").notNull().default(60),
    bookingHorizonDays: integer("booking_horizon_days").notNull().default(30),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    hostSlugIdx: uniqueIndex("uq_host_slug").on(table.hostId, table.slug),
    hostIdIdx: index("idx_event_types_host_id").on(table.hostId),
    slugIdx: index("idx_event_types_slug").on(table.slug),
  })
);

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 1=Monday .. 7=Sunday
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (table) => ({
    hostWeekdayIdx: index("idx_availability_rules_host_weekday").on(table.hostId, table.weekday),
  })
);

export const dateOverrides = pgTable(
  "date_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    overrideDate: date("override_date").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    customStartTime: time("custom_start_time"),
    customEndTime: time("custom_end_time"),
  },
  (table) => ({
    hostDateIdx: index("idx_date_overrides_host_date").on(table.hostId, table.overrideDate),
  })
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventTypeId: uuid("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "cascade" }),
    guestName: text("guest_name"),
    guestEmail: text("guest_email"),
    meetingPurpose: text("meeting_purpose").notNull().default("General Appointment"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    hostLocalDate: date("host_local_date"),
    status: text("status").notNull(), // HELD, CONFIRMED, CANCELLED, EXPIRED, RESCHEDULED
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    manageTokenHash: text("manage_token_hash").unique(),
    meetLink: text("meet_link"),
    googleCalendarEventId: text("google_calendar_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventStartIdx: index("idx_bookings_event_start").on(table.eventTypeId, table.startAt),
    statusHoldIdx: index("idx_bookings_status_hold").on(table.status, table.holdExpiresAt),
    tokenHashIdx: index("idx_bookings_manage_token").on(table.manageTokenHash),
  })
);

export const activeReservations = pgTable(
  "active_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    eventTypeId: uuid("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" })
      .unique(),
    bufferedRange: tstzrange("buffered_range").notNull(),
  },
  (table) => ({
    hostIdx: index("idx_active_reservations_host").on(table.hostId),
  })
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    purpose: text("purpose").notNull(), // HOST_REGISTER, HOST_LOGIN, HOST_DELETE_ACCOUNT, GUEST_BOOKING
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lookupIdx: index("idx_otp_codes_lookup").on(table.email, table.purpose, table.expiresAt),
  })
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    requestHash: text("request_hash").notNull(),
    responsePayload: jsonb("response_payload").notNull(),
    responseStatus: integer("response_status").notNull().default(200),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    keyIdx: index("idx_idempotency_keys_key").on(table.key),
  })
);

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    recipientEmail: text("recipient_email"),
    subject: text("subject"),
    payload: jsonb("payload").notNull(),
    deliveryStatus: text("delivery_status").notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("idx_notification_outbox_status").on(table.deliveryStatus, table.createdAt),
  })
);

// Relations
export const hostsRelations = relations(hosts, ({ many }) => ({
  eventTypes: many(eventTypes),
  availabilityRules: many(availabilityRules),
  dateOverrides: many(dateOverrides),
}));

export const eventTypesRelations = relations(eventTypes, ({ one, many }) => ({
  host: one(hosts, {
    fields: [eventTypes.hostId],
    references: [hosts.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  eventType: one(eventTypes, {
    fields: [bookings.eventTypeId],
    references: [eventTypes.id],
  }),
}));
