import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./booking-service";

export function apiSuccess(data: any, status: number = 200, headers: Record<string, string> = {}) {
  const payload =
    data !== null && typeof data === "object"
      ? { ...data, data: data.data !== undefined ? data.data : data }
      : { data };
  return NextResponse.json(payload, { status, headers });
}

export function apiError(error: any) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details || null,
        },
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request payload failed schema validation",
          details: error.errors,
        },
      },
      { status: 400 }
    );
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: error.message || "An unexpected internal server error occurred",
      },
    },
    { status: 500 }
  );
}
