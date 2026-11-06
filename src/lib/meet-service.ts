export interface CreateMeetOptions {
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
   * Attempts to generate a Google Meet video conference link if Google Calendar credentials are configured.
   * If credentials or permissions are not available, gracefully returns null and reports clear configuration status.
   */
  static async createMeetLink(options: CreateMeetOptions): Promise<MeetResult> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    // If OAuth or refresh token is not configured, do NOT fabricate a Meet URL
    if (!clientId || !clientSecret || !refreshToken) {
      return {
        meetLink: null,
        configured: false,
        message: "Google Calendar API integration requires GOOGLE_REFRESH_TOKEN to generate live Google Meet links.",
      };
    }

    try {
      // If refresh token is available, exchange for access token
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
        return {
          meetLink: null,
          configured: false,
          message: "Failed to authenticate with Google OAuth token service.",
        };
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Create Calendar event with Google Meet conference
      const calendarRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: options.title,
            description: `Meeting Purpose: ${options.meetingPurpose || "Scheduled via Slotbook"}\nGuest: ${options.guestEmail}\nHost: ${options.hostEmail}`,
            start: { dateTime: options.startAt },
            end: { dateTime: options.endAt },
            attendees: [{ email: options.guestEmail }, { email: options.hostEmail }],
            conferenceData: {
              createRequest: {
                requestId: crypto.randomUUID(),
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
        }
      );

      if (!calendarRes.ok) {
        return {
          meetLink: null,
          configured: true,
          message: "Google Calendar API returned an error when generating Meet conference.",
        };
      }

      const calendarEvent = await calendarRes.json();
      const meetUri =
        calendarEvent.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri ||
        calendarEvent.hangoutLink ||
        null;

      return {
        meetLink: meetUri,
        eventId: calendarEvent.id,
        configured: true,
      };
    } catch (err: any) {
      return {
        meetLink: null,
        configured: false,
        message: err.message || "Failed to communicate with Google Meet service",
      };
    }
  }
}
