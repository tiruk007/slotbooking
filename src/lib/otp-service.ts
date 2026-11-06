import crypto from "crypto";
import { getPool } from "@/db";
import { EmailService } from "./email-service";
import { AppError } from "./booking-service";

export type OtpPurpose =
  | "HOST_REGISTER"
  | "HOST_LOGIN"
  | "HOST_DELETE_ACCOUNT"
  | "GUEST_BOOKING";

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

export class OtpService {
  /**
   * Generates, stores, and sends a 6-digit OTP code to the specified email address.
   */
  static async sendOtp(params: {
    email: string;
    purpose: OtpPurpose;
    metadata?: Record<string, any>;
    customUrl?: string;
  }): Promise<{ message: string; email: string }> {
    const { email, purpose, metadata, customUrl } = params;
    const pool = getPool(customUrl);
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Rate limiting & Cooldown check: prevent requesting more than 1 OTP per 30 seconds
    const recentRes = await pool.query(
      `SELECT created_at FROM otp_codes
       WHERE email = $1 AND purpose = $2 AND created_at > clock_timestamp() - interval '30 seconds'
       LIMIT 1`,
      [normalizedEmail, purpose]
    );

    if (recentRes.rows.length > 0) {
      throw new AppError(
        "OTP_COOLDOWN",
        429,
        "A verification code was recently sent. Please wait 30 seconds before requesting a new one."
      );
    }

    // 2. Generate cryptographically secure 6-digit numeric OTP
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = hashOtp(code);

    // 3. Store hashed OTP in database with 5-minute expiry
    await pool.query(
      `INSERT INTO otp_codes (email, purpose, code_hash, expires_at, metadata)
       VALUES ($1, $2, $3, clock_timestamp() + interval '5 minutes', $4)`,
      [normalizedEmail, purpose, codeHash, JSON.stringify(metadata || {})]
    );

    // 4. Send email
    const purposeTitles: Record<OtpPurpose, string> = {
      HOST_REGISTER: "Host Account Registration",
      HOST_LOGIN: "Host Sign In",
      HOST_DELETE_ACCOUNT: "Confirm Account Deletion",
      GUEST_BOOKING: "Verify Your Appointment",
    };

    const title = purposeTitles[purpose] || "Verification";
    const subject = `Your Slotbook Verification Code: ${code}`;
    const text = `
Slotbook ${title}

Your 6-digit verification code is: ${code}

This code will expire in 5 minutes. If you did not request this code, you can safely ignore this email.
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

    await EmailService.sendEmail({
      to: normalizedEmail,
      subject,
      text,
      html,
    });

    return {
      message: "Verification code sent to your email",
      email: normalizedEmail,
    };
  }

  /**
   * Verifies an OTP code, enforces attempt limits, expiration, and one-time consumption.
   */
  static async verifyOtp(params: {
    email: string;
    purpose: OtpPurpose;
    code: string;
    customUrl?: string;
  }): Promise<{ valid: boolean; metadata: any }> {
    const { email, purpose, code, customUrl } = params;
    const pool = getPool(customUrl);
    const normalizedEmail = email.toLowerCase().trim();
    const providedHash = hashOtp(code);

    // Look for unconsumed, unexpired OTP for this email and purpose
    const res = await pool.query(
      `SELECT id, code_hash, attempts, metadata, expires_at
       FROM otp_codes
       WHERE email = $1 
         AND purpose = $2 
         AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedEmail, purpose]
    );

    if (res.rows.length === 0) {
      throw new AppError("INVALID_OTP", 400, "Invalid or expired verification code. Please request a new one.");
    }

    const otpRecord = res.rows[0];

    // Check expiry
    const now = new Date();
    if (new Date(otpRecord.expires_at) <= now) {
      throw new AppError("OTP_EXPIRED", 400, "Verification code has expired. Please request a new one.");
    }

    // Check attempt limits (max 5)
    if (otpRecord.attempts >= 5) {
      throw new AppError(
        "OTP_MAX_ATTEMPTS",
        429,
        "Too many failed verification attempts. Please request a new verification code."
      );
    }

    // Compare hashes
    if (otpRecord.code_hash !== providedHash) {
      await pool.query(
        "UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1",
        [otpRecord.id]
      );
      throw new AppError("INVALID_OTP", 400, "Invalid verification code. Please check and try again.");
    }

    // Mark as consumed (one-time use)
    await pool.query(
      "UPDATE otp_codes SET consumed_at = clock_timestamp() WHERE id = $1",
      [otpRecord.id]
    );

    const metadata = typeof otpRecord.metadata === "string" ? JSON.parse(otpRecord.metadata) : (otpRecord.metadata || {});
    return { valid: true, metadata };
  }
}

