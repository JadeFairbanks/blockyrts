// Sending email, behind an interface so tests can read what was sent and a
// self-hoster can log links instead of sending them.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Keeps every message, for tests. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];

  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
}

/** Writes the message to the server log: for local runs with no email service. */
export class LogMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.log(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
  }
}

export interface HttpMailerOptions {
  apiKey: string;
  from: string;
  /** Defaults to Resend's endpoint; any API taking { from, to, subject, text } with a Bearer key works. */
  url?: string;
}

/** Sends through a transactional email API (Resend by default). */
export class HttpMailer implements Mailer {
  private readonly opts: Required<HttpMailerOptions>;

  constructor(opts: HttpMailerOptions) {
    this.opts = { url: 'https://api.resend.com/emails', ...opts };
  }

  async send(mail: Mail): Promise<void> {
    const res = await fetch(this.opts.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.opts.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) throw new Error(`email API answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
