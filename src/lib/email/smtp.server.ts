// Send one email through a company's own SMTP mailbox.
//
// Cloudflare Workers (Lovable hosting) can't use nodemailer: raw TCP goes through
// `cloudflare:sockets`, which worker-mailer uses. Node (`build:node`, Docker) uses nodemailer.
// Cloudflare blocks outbound port 25, so mailboxes must use 465 (SSL) or 587 (STARTTLS).

export type SmtpConfig = {
  host: string;
  port: number;
  security: "ssl" | "starttls";
  username: string;
  password: string;
};

export type OutgoingEmail = {
  fromName?: string | null;
  fromEmail: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
};

const onWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/** Strip characters that could break or inject mail headers. */
const headerSafe = (s: string) => s.replace(/[\r\n<>"]/g, "").trim();

export async function sendSmtpEmail(cfg: SmtpConfig, email: OutgoingEmail): Promise<void> {
  if (onWorkers() && cfg.port === 25) {
    throw new Error("Port 25 is blocked on this host. Use port 465 (SSL) or 587 (STARTTLS).");
  }
  const fromName = email.fromName ? headerSafe(email.fromName) : undefined;

  if (onWorkers()) {
    const { WorkerMailer } = await import("worker-mailer");
    await WorkerMailer.send(
      {
        host: cfg.host,
        port: cfg.port,
        secure: cfg.security === "ssl",
        startTls: cfg.security === "starttls",
        credentials: { username: cfg.username, password: cfg.password },
        authType: ["plain", "login"],
        socketTimeoutMs: 15_000,
        responseTimeoutMs: 15_000,
      },
      {
        from: fromName ? { name: fromName, email: email.fromEmail } : email.fromEmail,
        to: email.to,
        reply: email.replyTo ?? undefined,
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
    );
    return;
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === "ssl",
    requireTLS: cfg.security === "starttls",
    auth: { user: cfg.username, pass: cfg.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
  await transport.sendMail({
    from: fromName ? { name: fromName, address: email.fromEmail } : email.fromEmail,
    to: email.to,
    replyTo: email.replyTo ?? undefined,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

/** Turn a raw SMTP/library error into something an admin can act on. */
export function smtpErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/auth|535|534|credentials|username and password/i.test(msg)) {
    return "The mail server rejected the username or password. For Gmail/Outlook use an app password.";
  }
  if (/timed? ?out|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|connect/i.test(msg)) {
    return "Couldn't connect to the mail server. Check the host, the port (465 or 587) and the security setting.";
  }
  if (/certificate|tls|ssl/i.test(msg)) {
    return "Secure connection failed. Try the other security option (SSL for 465, STARTTLS for 587).";
  }
  return `The mail server returned an error: ${msg.slice(0, 200)}`;
}
