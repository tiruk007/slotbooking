import nodemailer, { Transporter } from "nodemailer";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailService {
  private static transporter: Transporter | null = null;

  private static getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const user = process.env.GMAIL_USER?.trim();
    const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "").trim();

    if (!user || !pass) {
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
  }

  /**
   * Sends an email via Gmail SMTP if credentials are configured.
   * If credentials are not configured, logs safely for development/testing without error.
   */
  static async sendEmail(options: SendEmailOptions): Promise<{ delivered: boolean; error?: string }> {
    const { to, subject, text, html } = options;
    const transporter = this.getTransporter();

    if (!transporter) {
      console.log(`[EmailService:Simulated] Email to: ${to} | Subject: "${subject}"`);
      return { delivered: true };
    }

    try {
      const info = await transporter.sendMail({
        from: `"Slotbook Scheduling" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        text,
        html,
      });

      console.log(`[EmailService] Live email delivered to ${to} (MessageId: ${info.messageId})`);
      return { delivered: true };
    } catch (err: any) {
      console.error(`[EmailService] Failed to send email to ${to}:`, err.message);
      return { delivered: false, error: err.message || "Failed to send email" };
    }
  }
}
