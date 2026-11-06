import { NextRequest } from "next/server";
import { OtpService } from "@/lib/otp-service";
import { getPool } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT id, guest_email, guest_name, status, hold_expires_at
       FROM bookings
       WHERE id = $1`,
      [params.id]
    );

    if (res.rows.length === 0) {
      throw new AppError("NOT_FOUND", 404, "Booking hold not found");
    }

    const booking = res.rows[0];
    if (booking.status !== "HELD") {
      throw new AppError("INVALID_STATE", 400, "Booking hold is no longer active");
    }

    if (!booking.guest_email) {
      throw new AppError("NO_EMAIL", 400, "No guest email associated with this hold");
    }

    const result = await OtpService.sendOtp({
      email: booking.guest_email,
      purpose: "GUEST_BOOKING",
      metadata: { holdId: booking.id, guestName: booking.guest_name },
    });

    return apiSuccess(result, 200);
  } catch (err) {
    return apiError(err);
  }
}
