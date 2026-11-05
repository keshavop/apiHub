import "server-only";

type Mail = { to: string; subject: string; text: string };

/** Sends through Resend when RESEND_API_KEY is set, otherwise logs the mail. */
export async function sendMail(mail: Mail): Promise<{ delivered: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return { delivered: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "apiHub <no-reply@example.com>",
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!res.ok) {
    console.error(`[email] Resend failed: ${res.status} ${await res.text()}`);
    return { delivered: false };
  }
  return { delivered: true };
}

export function appUrl(path: string) {
  return new URL(path, process.env.APP_URL ?? "http://localhost:3000").toString();
}
