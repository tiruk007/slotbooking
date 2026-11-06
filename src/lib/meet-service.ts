/**
 * Meeting Service
 * 
 * Google Meet and Google Calendar integrations have been removed.
 * All bookings operate directly on confirmed date, time, host and guest details
 * without requiring external video conference providers or fabricating URLs.
 */

export interface CreateMeetOptions {
  hostId?: string;
  title?: string;
  startAt?: string;
  endAt?: string;
  hostEmail?: string;
  guestEmail?: string;
  meetingPurpose?: string;
}

export interface MeetResult {
  meetLink: string | null;
  eventId?: string;
  configured: boolean;
  message?: string;
}

export class MeetService {
  static async createMeetLink(_options?: any): Promise<MeetResult> {
    return {
      meetLink: null,
      configured: false,
    };
  }

  static async createMeetLinkForHost(_options: CreateMeetOptions): Promise<MeetResult> {
    return {
      meetLink: null,
      configured: false,
    };
  }
}
