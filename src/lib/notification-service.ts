import { PoolClient } from "pg";
import { DateTime } from "luxon";
import { getPool } from "@/db";
import { EmailService } from "./email-service";

export type DomainEventType =
  | "HOST_SIGNUP_OTP"
  | "HOST_LOGIN_OTP"
  | "GUEST_EMAIL_VERIFICATION_OTP"
  | "BOOKING_CONFIRMED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED"
  | "HOST_CANCELLED_BOOKING"
  | "EVENT_CANCELLED"
  | "HOST_CANCELLED_EVENT"
  | "EVENT_CREATED"
  | "EVENT_UPDATED"
  | "EVENT_DELETED"
  | "HOST_REGISTERED"
  | "HOST_ACCOUNT_DELETED";

export interface OutboxPayload {
  bookingId?: string;
  bookingReference?: string;
  eventTypeId?: string;
  eventName?: string;
  eventDescription?: string;
  durationMinutes?: number;
  capacity?: number;
  bufferBefore?: number;
  bufferAfter?: number;
  minimumNoticeMinutes?: number;
  bookingHorizonDays?: number;
  publicUrl?: string;
  hostName?: string;
  hostEmail?: string;
  guestName?: string;
  guestEmail?: string;
  meetingPurpose?: string;
  startAt?: string;
  endAt?: string;
  hostTimezone?: string;
  guestTimezone?: string;
  previousStartAt?: string;
  newStartAt?: string;
  newEndAt?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  status?: string;
  manageUrl?: string;
  code?: string;
  recipientRole?: "GUEST" | "HOST";
  affectedBookingsCount?: number;
  guestsNotifiedCount?: number;
  deletedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  [key: string]: any;
}

function emailShell(contentHtml: string, previewText: string = "Slotbook Notification"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${previewText}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
    <!-- Header -->
    <div style="padding: 24px 32px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between;">
      <div style="font-size: 20px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px;">
        Slotbook
      </div>
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; background: #f1f5f9; padding: 4px 10px; border-radius: 6px;">
        Scheduling
      </div>
    </div>

    <!-- Main Content -->
    <div style="padding: 32px;">
      ${contentHtml}
    </div>

    <!-- Footer -->
    <div style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8;">
      <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">Slotbook &bull; Simple scheduling. Seamless meetings.</p>
      <p style="margin: 0;">This is an automated appointment notification. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`.trim();
}

export function formatAppointmentInTimezone(startIso?: string, endIso?: string, tz: string = "UTC"): {
  dateStr: string;
  timeRangeStr: string;
  fullStr: string;
} {
  if (!startIso) return { dateStr: "N/A", timeRangeStr: "N/A", fullStr: "N/A" };
  try {
    const s = DateTime.fromISO(startIso, { zone: "utc" }).setZone(tz);
    const dateStr = s.toFormat("cccc, LLLL d, yyyy");
    const tzAbbr = s.offsetNameShort || s.toFormat("ZZZZ") || tz;
    const sTime = s.toFormat("hh:mm a");

    if (endIso) {
      const e = DateTime.fromISO(endIso, { zone: "utc" }).setZone(tz);
      const eTime = e.toFormat("hh:mm a");
      const timeRangeStr = `${sTime} – ${eTime} ${tzAbbr} (${tz})`;
      return {
        dateStr,
        timeRangeStr,
        fullStr: `${dateStr} • ${timeRangeStr}`,
      };
    } else {
      const timeRangeStr = `${sTime} ${tzAbbr} (${tz})`;
      return {
        dateStr,
        timeRangeStr,
        fullStr: `${dateStr} • ${timeRangeStr}`,
      };
    }
  } catch {
    return { dateStr: startIso, timeRangeStr: "", fullStr: startIso };
  }
}

function formatDisplayDate(iso: string | undefined, tz: string = "UTC"): string {
  if (!iso) return "N/A";
  try {
    const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);
    const tzAbbr = dt.offsetNameShort || dt.toFormat("ZZZZ") || tz;
    return `${dt.toFormat("cccc, LLLL d, yyyy 'at' hh:mm a")} ${tzAbbr} (${tz})`;
  } catch {
    return iso;
  }
}

export class NotificationService {
  /**
   * Enqueues a notification into the database outbox table within an existing transaction.
   */
  static async enqueue(
    client: PoolClient,
    params: {
      bookingId?: string | null;
      relatedHostId?: string | null;
      eventType: DomainEventType;
      recipientEmail: string;
      subject: string;
      payload: OutboxPayload;
    }
  ) {
    const { bookingId, relatedHostId, eventType, recipientEmail, subject, payload } = params;

    await client.query(
      `INSERT INTO notification_outbox 
       (booking_id, related_host_id, event_type, recipient_email, subject, payload, delivery_status, attempt_count)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0)`,
      [bookingId || null, relatedHostId || null, eventType, recipientEmail, subject, JSON.stringify(payload)]
    );
  }

  /**
   * Processes pending notifications from the outbox table.
   * Safe, idempotent delivery with retry tracking.
   */
  static async processOutbox(customUrl?: string): Promise<{ processed: number; succeeded: number; failed: number }> {
    const pool = getPool(customUrl);
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    const res = await pool.query(
      `SELECT id, booking_id, related_host_id, event_type, recipient_email, subject, payload, attempt_count
       FROM notification_outbox
       WHERE delivery_status IN ('PENDING', 'FAILED')
         AND attempt_count < 5
       ORDER BY created_at ASC
       LIMIT 25`
    );

    for (const row of res.rows) {
      processed++;
      const payload: OutboxPayload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      const recipient = row.recipient_email || payload.guestEmail || payload.hostEmail;
      const subject = row.subject || `Slotbook Notification: ${row.event_type}`;

      const { text, html } = this.renderEmail(row.event_type as DomainEventType, payload, recipient);

      const result = await EmailService.sendEmail({
        to: recipient,
        subject,
        text,
        html,
      });

      if (result.delivered) {
        succeeded++;
        await pool.query(
          `UPDATE notification_outbox
           SET delivery_status = 'DELIVERED', delivered_at = clock_timestamp(), last_error = NULL
           WHERE id = $1`,
          [row.id]
        );
      } else {
        failed++;
        await pool.query(
          `UPDATE notification_outbox
           SET delivery_status = 'FAILED', attempt_count = attempt_count + 1, last_error = $1
           WHERE id = $2`,
          [result.error || "Delivery failed", row.id]
        );
      }
    }

    return { processed, succeeded, failed };
  }

  /**
   * Renders professional HTML and plain text templates for each domain event.
   */
  static renderEmail(
    eventType: DomainEventType,
    p: OutboxPayload,
    recipientEmail?: string
  ): { text: string; html: string } {
    const appUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const fullManageUrl = p.manageUrl
      ? (p.manageUrl.startsWith("http") ? p.manageUrl : `${appUrl}${p.manageUrl.startsWith("/") ? "" : "/"}${p.manageUrl}`)
      : "";

    // Determine recipient role (Guest vs Host)
    const isHostRecipient =
      p.recipientRole === "HOST" ||
      (recipientEmail && p.hostEmail && recipientEmail.toLowerCase() === p.hostEmail.toLowerCase());

    const displayTz = isHostRecipient
      ? (p.hostTimezone || "UTC")
      : (p.guestTimezone || p.hostTimezone || "UTC");
    const bookingRef = p.bookingReference || p.bookingId || "N/A";

    switch (eventType) {
      // 1. OTP Verification
      case "HOST_SIGNUP_OTP":
      case "HOST_LOGIN_OTP":
      case "GUEST_EMAIL_VERIFICATION_OTP": {
        const title =
          eventType === "HOST_SIGNUP_OTP"
            ? "Host Account Registration"
            : eventType === "HOST_LOGIN_OTP"
            ? "Host Portal Sign In"
            : "Verify Your Appointment";
        const code = p.code || "------";

        const text = `
Slotbook ${title}

Your 6-digit verification code is: ${code}

This code will expire in 5 minutes. If you did not request this verification, you can safely ignore this email.
        `.trim();

        const contentHtml = `
          <div style="text-align: center;">
            <h1 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 0 0 8px 0;">${title}</h1>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 28px 0;">Enter the one-time code below to verify your email address.</p>
            
            <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px 32px; display: inline-block; margin-bottom: 24px;">
              <span style="font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #1e293b; font-family: monospace;">${code}</span>
            </div>

            <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 12px 0;">
              This code will expire in <strong>5 minutes</strong>.
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              If you did not request this code, no action is needed and you can safely ignore this message.
            </p>
          </div>
        `;

        return { text, html: emailShell(contentHtml, title) };
      }

      // 2. Booking Confirmed (Unified Template, Recipient-Aware Presentation)
      case "BOOKING_CONFIRMED": {
        const headline = isHostRecipient ? "You have a new appointment." : "Your appointment is confirmed.";
        const subheadline = isHostRecipient
          ? `You have a confirmed booking with <strong>${p.guestName || "Guest"}</strong>.`
          : `You are scheduled with <strong>${p.hostName || "Host"}</strong>.`;

        const appt = formatAppointmentInTimezone(p.startAt, p.endAt, displayTz);

        const text = `
Slotbook — ${headline}

${subheadline.replace(/<[^>]*>/g, "")}

Appointment Details:
• Booking Reference: ${bookingRef}
• Event: ${p.eventName}
• Date: ${appt.dateStr}
• Time: ${appt.timeRangeStr}
• Host: ${p.hostName} (${p.hostEmail || ""})
• Guest: ${p.guestName} (${p.guestEmail || ""})
• Meeting Purpose: ${p.meetingPurpose || "General Appointment"}
• Status: Confirmed

${
  !isHostRecipient && fullManageUrl
    ? `Manage your booking (Reschedule or Cancel):\n${fullManageUrl}\n`
    : ""
}
Thank you,
The Slotbook Team
        `.trim();

        const contentHtml = `
          <div style="margin-bottom: 24px;">
            <div style="display: inline-block; background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px;">
              Confirmed
            </div>
            <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0 0 6px 0; letter-spacing: -0.5px;">
              ${headline}
            </h1>
            <p style="color: #475569; font-size: 14px; margin: 0;">
              ${subheadline}
            </p>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Booking Ref:</td>
                <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-weight: 700;">${bookingRef}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Event:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${p.eventName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Date:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">
                  ${appt.dateStr}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Time:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">
                  ${appt.timeRangeStr}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Host:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.hostName} (${p.hostEmail || ""})</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Guest:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.guestName} (${p.guestEmail || ""})</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Meeting Purpose:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.meetingPurpose || "General Appointment"}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Status:</td>
                <td style="padding: 6px 0; color: #059669; font-weight: 700;">Confirmed</td>
              </tr>
            </table>
          </div>

          ${
            !isHostRecipient && fullManageUrl
              ? `
          <div style="text-align: center; margin-top: 24px;">
            <a href="${fullManageUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">
              Manage Appointment
            </a>
            <p style="font-size: 12px; color: #94a3b8; margin: 10px 0 0 0;">
              Need to reschedule or cancel? You can change your appointment at any time using this link.
            </p>
          </div>
          `
              : isHostRecipient
              ? `
          <div style="text-align: center; margin-top: 24px;">
            <a href="${appUrl}/host/bookings" style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">
              View in Host Portal
            </a>
          </div>
          `
              : ""
          }
        `;

        return { text, html: emailShell(contentHtml, headline) };
      }

      // 3. Booking Rescheduled
      case "BOOKING_RESCHEDULED": {
        const headline = "Appointment Rescheduled";
        const prevAppt = formatAppointmentInTimezone(p.previousStartAt, undefined, displayTz);
        const newAppt = formatAppointmentInTimezone(p.newStartAt, p.newEndAt, displayTz);

        const text = `
Slotbook — Appointment Rescheduled

Hello,
The appointment for "${p.eventName}" has been rescheduled.

• Booking Reference: ${bookingRef}
• Event: ${p.eventName}
• Previous Time: ${prevAppt.fullStr}
• New Date: ${newAppt.dateStr}
• New Time: ${newAppt.timeRangeStr}
• Host: ${p.hostName}
• Guest: ${p.guestName}
• Purpose: ${p.meetingPurpose || "General Appointment"}

${!isHostRecipient && fullManageUrl ? `Manage Appointment:\n${fullManageUrl}\n` : ""}
        `.trim();

        const contentHtml = `
          <div style="margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 0 0 6px 0;">Appointment Rescheduled</h1>
            <p style="color: #475569; font-size: 14px; margin: 0;">The meeting time has been updated.</p>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; font-size: 13px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Booking Ref:</td>
                <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${bookingRef}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Event:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${p.eventName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Previous Time:</td>
                <td style="padding: 6px 0; color: #94a3b8; text-decoration: line-through;">${prevAppt.fullStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">New Date:</td>
                <td style="padding: 6px 0; color: #059669; font-weight: 700;">${newAppt.dateStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">New Time:</td>
                <td style="padding: 6px 0; color: #059669; font-weight: 700;">${newAppt.timeRangeStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Meeting Purpose:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.meetingPurpose || "General Appointment"}</td>
              </tr>
            </table>
          </div>

          ${
            !isHostRecipient && fullManageUrl
              ? `
          <div style="text-align: center;">
            <a href="${fullManageUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">
              View Appointment
            </a>
          </div>
          `
              : ""
          }
        `;

        return { text, html: emailShell(contentHtml, headline) };
      }

      // 4. Cancellation (Unified Template, Recipient-Aware Presentation)
      case "BOOKING_CANCELLED":
      case "HOST_CANCELLED_BOOKING":
      case "EVENT_CANCELLED":
      case "HOST_CANCELLED_EVENT": {
        const headline = isHostRecipient
          ? `Appointment cancellation — ${p.guestName || "Guest"}`
          : "Your Slotbook appointment has been cancelled";

        const cancelAppt = formatAppointmentInTimezone(p.startAt, p.endAt, displayTz);

        const text = `
Slotbook — ${headline}

The appointment for "${p.eventName}" originally scheduled for:
${cancelAppt.dateStr}
${cancelAppt.timeRangeStr}
has been cancelled.

Details:
• Booking Reference: ${bookingRef}
• Event: ${p.eventName}
• Host: ${p.hostName}
• Guest: ${p.guestName}
• Scheduled Time: ${cancelAppt.fullStr}
• Purpose: ${p.meetingPurpose || "General Appointment"}
• Cancellation Reason: ${p.cancellationReason || "No reason specified"}
• Initiated By: ${p.cancelledBy || (isHostRecipient ? "Guest" : "Host")}
• Status: Cancelled
        `.trim();

        const contentHtml = `
          <div style="margin-bottom: 24px;">
            <div style="display: inline-block; background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px;">
              Cancelled
            </div>
            <h1 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 0 0 6px 0;">
              ${headline}
            </h1>
            <p style="color: #475569; font-size: 14px; margin: 0 0 16px 0;">
              The appointment originally scheduled for <strong>${cancelAppt.dateStr}</strong> at <strong>${cancelAppt.timeRangeStr}</strong> has been cancelled and removed from the schedule.
            </p>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; font-size: 13px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Booking Ref:</td>
                <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${bookingRef}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Event:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${p.eventName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Host:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.hostName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Guest:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.guestName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Date:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${cancelAppt.dateStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Time:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${cancelAppt.timeRangeStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Cancellation Reason:</td>
                <td style="padding: 6px 0; color: #dc2626; font-weight: 600;">${p.cancellationReason || "Cancelled"}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Initiated By:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.cancelledBy || (isHostRecipient ? "Guest" : "Host")}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Status:</td>
                <td style="padding: 6px 0; color: #dc2626; font-weight: 700;">Cancelled</td>
              </tr>
            </table>
          </div>
        `;

        return { text, html: emailShell(contentHtml, headline) };
      }

      // 5. Host Event Created Email
      case "EVENT_CREATED": {
        const headline = "Your new Slotbook event is ready";
        const publicUrl = p.publicUrl || `${appUrl}/events`;

        const text = `
Slotbook — Your new event is ready!

Hello ${p.hostName || "Host"},
Your new appointment type "${p.eventName}" is published and ready for scheduling.

Event Details:
• Event Name: ${p.eventName}
• Description: ${p.eventDescription || "None"}
• Duration: ${p.durationMinutes} minutes
• Capacity: ${p.capacity || 1} guest(s) per slot
• Buffer Before: ${p.bufferBefore || 0} minutes
• Buffer After: ${p.bufferAfter || 0} minutes
• Minimum Notice: ${p.minimumNoticeMinutes || 0} minutes
• Booking Horizon: ${p.bookingHorizonDays || 30} days
• Public Booking URL: ${publicUrl}
• Created: ${p.createdAt || new Date().toISOString()}

View Your Event:
${publicUrl}
        `.trim();

        const contentHtml = `
          <div style="margin-bottom: 24px;">
            <div style="display: inline-block; background: #e0e7ff; color: #4338ca; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px;">
              Event Ready
            </div>
            <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0 0 6px 0;">
              Your new Slotbook event is ready
            </h1>
            <p style="color: #475569; font-size: 14px; margin: 0;">
              Hello <strong>${p.hostName || "Host"}</strong>, your event type <strong>"${p.eventName}"</strong> is now live.
            </p>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; font-size: 13px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Event Name:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${p.eventName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Description:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.eventDescription || "None"}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Duration:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.durationMinutes} minutes</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Capacity:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.capacity || 1} guest(s) per slot</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Buffers:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.bufferBefore || 0}m before / ${p.bufferAfter || 0}m after</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Minimum Notice:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.minimumNoticeMinutes || 0} minutes</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Booking Horizon:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.bookingHorizonDays || 30} days</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin-top: 24px;">
            <a href="${publicUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">
              View Your Event
            </a>
          </div>
        `;

        return { text, html: emailShell(contentHtml, headline) };
      }

      // 6. Host Event Deletion Email
      case "EVENT_DELETED": {
        const headline = "Your Slotbook event has been deleted";
        const text = `
Slotbook — ${headline}

Hello ${p.hostName || "Host"},
Your event "${p.eventName}" has been permanently deleted.

Deletion Summary:
• Event Name: ${p.eventName}
• Deletion Timestamp: ${p.deletedAt || new Date().toISOString()}
• Reason for Deletion: ${p.reason || "Discontinued by host"}
• Affected Bookings Cancelled: ${p.affectedBookingsCount || 0}
• Guests Notified: ${p.guestsNotifiedCount || 0}
• Final Status: Deleted
        `.trim();

        const contentHtml = `
          <div style="margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 0 0 6px 0;">
              Your Slotbook event has been deleted
            </h1>
            <p style="color: #475569; font-size: 14px; margin: 0;">
              The event type <strong>"${p.eventName}"</strong> has been removed from your account.
            </p>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; font-size: 13px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 160px;">Event Name:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${p.eventName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Deletion Timestamp:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.deletedAt || new Date().toISOString()}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Reason:</td>
                <td style="padding: 6px 0; color: #0f172a;">${p.reason || "Discontinued by host"}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Bookings Cancelled:</td>
                <td style="padding: 6px 0; color: #dc2626; font-weight: 700;">${p.affectedBookingsCount || 0}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Guests Notified:</td>
                <td style="padding: 6px 0; color: #059669; font-weight: 700;">${p.guestsNotifiedCount || 0}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Final Status:</td>
                <td style="padding: 6px 0; color: #64748b; font-weight: 700;">Deleted</td>
              </tr>
            </table>
          </div>
        `;

        return { text, html: emailShell(contentHtml, headline) };
      }

      // 7. Event Updated Email
      case "EVENT_UPDATED": {
        const headline = "Your Slotbook event has been updated";
        const text = `
Slotbook — ${headline}

Hello ${p.hostName || "Host"},
Your event "${p.eventName}" configuration has been updated.
Timestamp: ${p.updatedAt || new Date().toISOString()}
        `.trim();

        const contentHtml = `
          <div style="margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 0 0 6px 0;">
              ${headline}
            </h1>
            <p style="color: #475569; font-size: 14px; margin: 0;">
              Your event <strong>"${p.eventName}"</strong> configuration has been saved.
            </p>
          </div>
        `;

        return { text, html: emailShell(contentHtml, headline) };
      }

      // 8. Host Registered
      case "HOST_REGISTERED": {
        const headline = "Welcome to Slotbook";
        const text = `
Welcome to Slotbook!

Hello ${p.hostName},
Your host account has been created.
Open your dashboard: ${appUrl}/host/dashboard
        `.trim();

        const contentHtml = `
          <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0 0 8px 0;">Welcome to Slotbook</h1>
          <p style="color: #475569; font-size: 14px; margin: 0 0 24px 0;">Hello <strong>${p.hostName}</strong>, your host portal is ready.</p>
          <div style="text-align: center;">
            <a href="${appUrl}/host/dashboard" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">
              Open Host Dashboard
            </a>
          </div>
        `;

        return { text, html: emailShell(contentHtml, headline) };
      }

      // 9. Host Account Deleted
      case "HOST_ACCOUNT_DELETED": {
        const headline = "Slotbook Account Deleted";
        const text = `
Slotbook — Account Deleted

Hello ${p.hostName || "Host"},
Your Slotbook host account and associated data have been permanently deleted as requested.
        `.trim();

        const contentHtml = `
          <h1 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 0 0 8px 0;">Account Deleted</h1>
          <p style="color: #475569; font-size: 14px;">Your Slotbook host account and associated data have been permanently deleted as requested.</p>
        `;

        return { text, html: emailShell(contentHtml, headline) };
      }

      default: {
        const text = `Slotbook Notification: ${eventType}\n${JSON.stringify(p, null, 2)}`;
        const html = emailShell(`<p style="white-space: pre-wrap;">${text}</p>`, `Slotbook Notification: ${eventType}`);
        return { text, html };
      }
    }
  }
}
