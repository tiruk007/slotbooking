import { PoolClient } from "pg";
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
  eventTypeId?: string;
  eventName?: string;
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
  manageUrl?: string;
  code?: string;
  [key: string]: any;
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

      const { text, html } = this.renderEmail(row.event_type as DomainEventType, payload);

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
  static renderEmail(eventType: DomainEventType, p: OutboxPayload): { text: string; html: string } {
    const appUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const fullManageUrl = p.manageUrl
      ? (p.manageUrl.startsWith("http") ? p.manageUrl : `${appUrl}${p.manageUrl.startsWith("/") ? "" : "/"}${p.manageUrl}`)
      : "";

    switch (eventType) {
      case "HOST_SIGNUP_OTP":
      case "HOST_LOGIN_OTP":
      case "GUEST_EMAIL_VERIFICATION_OTP": {
        const title =
          eventType === "HOST_SIGNUP_OTP"
            ? "Host Account Registration"
            : eventType === "HOST_LOGIN_OTP"
            ? "Host Sign In"
            : "Verify Your Appointment";
        const code = p.code || "------";

        const text = `
Slotbook ${title}

Your 6-digit verification code is: ${code}

This code will expire in 5 minutes. If you did not request this verification, you can safely ignore this email.
        `.trim();

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); text-align: center;">
    <h2 style="color: #4f46e5; margin: 0 0 8px 0; font-size: 24px;">Slotbook</h2>
    <p style="color: #64748b; font-size: 14px; margin-top: 0;">${title}</p>
    <div style="margin: 32px 0;">
      <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1e293b; background: #f1f5f9; padding: 16px 24px; border-radius: 8px; display: inline-block; border: 1px dashed #cbd5e1;">
        ${code}
      </div>
    </div>
    <p style="color: #475569; font-size: 14px; line-height: 1.5; margin-bottom: 8px;">
      Enter this code to complete your verification. It is valid for <strong>5 minutes</strong>.
    </p>
    <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
      If you did not request this code, please ignore this email.
    </p>
  </div>
</body>
</html>
        `.trim();

        return { text, html };
      }

      case "BOOKING_CONFIRMED": {
        const text = `
Slotbook — Appointment Confirmed!

Hello ${p.guestName || "Guest"},
Your appointment for "${p.eventName}" with ${p.hostName || "your host"} has been confirmed.

Details:
• Event: ${p.eventName}
• Host: ${p.hostName} (${p.hostEmail || ""})
• Date & Time: ${p.startAt} - ${p.endAt}
• Timezone: ${p.guestTimezone || p.hostTimezone || "UTC"}
• Meeting Purpose: ${p.meetingPurpose || "Not specified"}

Manage your booking (Reschedule or Cancel):
${fullManageUrl}

Thank you,
The Slotbook Team
        `.trim();

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="color: #4f46e5; margin: 0; font-size: 24px;">Slotbook</h2>
      <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Simple scheduling. Seamless meetings.</p>
    </div>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
      <h3 style="color: #166534; margin: 0 0 6px 0; font-size: 18px;">Appointment Confirmed!</h3>
      <p style="color: #15803d; margin: 0; font-size: 14px;">You're scheduled with <strong>${p.hostName || "Host"}</strong>.</p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 18px; margin-bottom: 24px; font-size: 14px; line-height: 1.6;">
      <p style="margin: 4px 0;"><strong>Appointment:</strong> ${p.eventName}</p>
      <p style="margin: 4px 0;"><strong>Date &amp; Time:</strong> ${p.startAt} &ndash; ${p.endAt}</p>
      <p style="margin: 4px 0;"><strong>Timezone:</strong> ${p.guestTimezone || p.hostTimezone || "UTC"}</p>
      <p style="margin: 4px 0;"><strong>Meeting Purpose:</strong> ${p.meetingPurpose || "General Appointment"}</p>
    </div>

    ${
      fullManageUrl
        ? `
    <div style="text-align: center; margin-top: 24px;">
      <a href="${fullManageUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Manage Appointment</a>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 10px;">Need to change plans? You can reschedule or cancel at any time.</p>
    </div>
    `
        : ""
    }
  </div>
</body>
</html>
        `.trim();

        return { text, html };
      }

      case "BOOKING_RESCHEDULED": {
        const text = `
Slotbook — Appointment Rescheduled

Hello,
Your appointment for "${p.eventName}" has been rescheduled.

• Previous Time: ${p.previousStartAt}
• New Time: ${p.newStartAt} - ${p.newEndAt}
• Meeting Purpose: ${p.meetingPurpose || "Not specified"}

Manage your booking:
${fullManageUrl}
        `.trim();

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
    <h3 style="color: #4f46e5; margin-top: 0;">Appointment Rescheduled</h3>
    <p>Your appointment for <strong>${p.eventName}</strong> has been updated.</p>
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 14px;">
      <p style="margin: 4px 0; color: #94a3b8; text-decoration: line-through;">Previous: ${p.previousStartAt}</p>
      <p style="margin: 4px 0; color: #047857; font-weight: bold;">New Time: ${p.newStartAt} &ndash; ${p.newEndAt}</p>
      <p style="margin: 4px 0;">Purpose: ${p.meetingPurpose || "General Appointment"}</p>
    </div>
    ${fullManageUrl ? `<a href="${fullManageUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none;">View Details</a>` : ""}
  </div>
</body>
</html>
        `.trim();

        return { text, html };
      }

      case "BOOKING_CANCELLED":
      case "HOST_CANCELLED_BOOKING": {
        const title = eventType === "HOST_CANCELLED_BOOKING" ? "Appointment Cancelled by Host" : "Appointment Cancelled";
        const text = `
Slotbook — ${title}

The appointment for "${p.eventName}" on ${p.startAt} has been cancelled.
Reason: ${p.cancellationReason || "No reason specified"}

If you need to book another time, please visit the host's booking page.
        `.trim();

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
    <h3 style="color: #dc2626; margin-top: 0;">${title}</h3>
    <p>The appointment for <strong>${p.eventName}</strong> originally scheduled for ${p.startAt} has been cancelled.</p>
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 14px; color: #991b1b;">
      <strong>Reason:</strong> ${p.cancellationReason || "Cancelled"}
    </div>
  </div>
</body>
</html>
        `.trim();

        return { text, html };
      }

      case "EVENT_CANCELLED":
      case "HOST_CANCELLED_EVENT": {
        const text = `
Slotbook — Event Cancellation Notice

Hello,
The host has cancelled the event "${p.eventName}".
As a result, your scheduled appointment on ${p.startAt} has been cancelled.
Reason: ${p.cancellationReason || "Event discontinued by host"}
        `.trim();

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f8fafc; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
    <h3 style="color: #dc2626;">Event Cancelled by Host</h3>
    <p>The host has cancelled <strong>${p.eventName}</strong>. Your upcoming appointment on ${p.startAt} has been cancelled.</p>
    <p><strong>Host's note:</strong> ${p.cancellationReason || "Event schedule updated"}</p>
  </div>
</body>
</html>
        `.trim();

        return { text, html };
      }

      case "HOST_REGISTERED": {
        const text = `
Welcome to Slotbook!

Hello ${p.hostName},
Your host account (${p.hostEmail}) has been successfully created.
Visit your dashboard to set your availability and create events:
${appUrl}/host/dashboard
        `.trim();

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f8fafc; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
    <h2 style="color: #4f46e5;">Welcome to Slotbook!</h2>
    <p>Hello <strong>${p.hostName}</strong>,</p>
    <p>Your host account has been created. You can now configure your schedule, customize your appointment types, and share your personal booking link.</p>
    <div style="margin-top: 24px;">
      <a href="${appUrl}/host/dashboard" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Open Host Dashboard</a>
    </div>
  </div>
</body>
</html>
        `.trim();

        return { text, html };
      }

      case "HOST_ACCOUNT_DELETED": {
        const text = `
Slotbook — Account Deleted

Hello ${p.hostName || "Host"},
Your Slotbook account has been permanently deleted as requested. All upcoming appointments have been cancelled and affected guests have been notified.
        `.trim();

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f8fafc; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
    <h3 style="color: #334155;">Account Deleted</h3>
    <p>Your Slotbook host account and associated scheduling data have been successfully deleted.</p>
  </div>
</body>
</html>
        `.trim();

        return { text, html };
      }

      default: {
        const text = `Slotbook Notification: ${eventType}\n${JSON.stringify(p, null, 2)}`;
        const html = `<p>${text}</p>`;
        return { text, html };
      }
    }
  }
}
