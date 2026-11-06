import { getPool } from "@/db";

export interface CreateMeetOptions {
  hostId: string;
  title: string;
  startAt: string; // ISO
  endAt: string; // ISO
  hostEmail: string;
  guestEmail: string;
  meetingPurpose?: string;
}

export interface MeetResult {
  meetLink: string | null;
  eventId?: string;
  configured: boolean;
  message?: string;
}

export class MeetService {
  /**
   * Legacy / environment-level Google Meet generation fallback.
   */
  static async createMeetLink(options: {
    title: string;
    startAt: string;
    endAt: string;
    hostEmail: string;
    guestEmail: string;
    meetingPurpose?: string;
  }): Promise<MeetResult> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      return {
        meetLink: null,
        configured: false,
        message: "Google Calendar API integration requires GOOGLE_REFRESH_TOKEN to generate live Google Meet links.",
      };
    }

    return {
      meetLink: null,
      configured: false,
      message: "Direct host-specific authorization required.",
    };
  }

  /**
   * Generates a Google Meet video conference link for the specific host who owns the event.
   * Uses that host's stored Google OAuth refresh token.
   * If the host has not connected Google Calendar, returns null gracefully without fabricating URLs.
   */
  static async createMeetLinkForHost(options: CreateMeetOptions): Promise<MeetResult> {
    const { hostId, title, startAt, endAt, hostEmail, guestEmail, meetingPurpose } = options;
    const pool = getPool();

    // 1. Fetch the specific host's Google tokens from PostgreSQL
    const hostRes = await pool.query(
      `SELECT google_refresh_token, google_access_token, google_token_expiry, google_email
       FROM hosts
       WHERE id = $1`,
      [hostId]
    );

    if (hostRes.rows.length === 0) {
      return {
        meetLink: null,
        configured: false,
        message: "Host not found",
      };
    }

    const host = hostRes.rows[0];
    const refreshToken = host.google_refresh_token;

    // If this host has NOT connected Google Calendar, return null cleanly
    if (!refreshToken) {
      return {
        meetLink: null,
        configured: false,
        message: "Host has not connected their Google Calendar account.",
      };
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return {
        meetLink: null,
        configured: false,
        message: "Google OAuth client credentials are not configured on the server.",
      };
    }

    try {
      // 2. Refresh host's access token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        console.error(`[MeetService] Failed to refresh token for host ${hostId}:`, errorText);
        return {
          meetLink: null,
          configured: true,
          message: "Google authorization expired or revoked for this host. Reconnection required.",
        };
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // 3. Create Google Calendar event with conference data
      const requestId = crypto.randomUUID();
      const calendarRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: title,
            description: `Meeting Purpose: ${meetingPurpose || "Scheduled via Slotbook"}\n\nGuest: ${guestEmail}\nHost: ${hostEmail}`,
            start: { dateTime: startAt },
            end: { dateTime: endAt },
            attendees: [
              { email: guestEmail, displayName: "Guest" },
              { email: hostEmail, displayName: "Host", responseStatus: "accepted" },
            ],
            conferenceData: {
              createRequest: {
                requestId,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
        }
      );

      if (!calendarRes.ok) {
        const calError = await calendarRes.text();
        console.error(`[MeetService] Calendar API error for host ${hostId}:`, calError);
        return {
          meetLink: null,
          configured: true,
          message: "Google Calendar API error during conference creation.",
        };
      }

      const eventData = await calendarRes.json();
      const meetUri =
        eventData.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri ||
        eventData.hangoutLink ||
        null;

      return {
        meetLink: meetUri,
        eventId: eventData.id,
        configured: true,
      };
    } catch (err: any) {
      console.error(`[MeetService] Unexpected error creating meeting for host ${hostId}:`, err);
      return {
        meetLink: null,
        configured: true,
        message: err.message || "Failed to create Google Meet event",
      };
    }
  }
}
