import { db } from "./db";
import { logError } from "./audit";

export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function simpleEmailHtml(title: string, body: string, link?: { url: string; label: string }) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;padding:24px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px">
<h2 style="margin-top:0;color:#222">${escapeHtml(title)}</h2>
<p style="color:#444;line-height:1.5;white-space:pre-line">${escapeHtml(body)}</p>
${link ? `<p><a href="${escapeHtml(link.url)}" style="display:inline-block;background:#E8452C;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">${escapeHtml(link.label)}</a></p>` : ""}
</div></body></html>`;
}

/**
 * Envia e-mail transacional através da API REST da Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Sem RESEND_API_KEY/EMAIL_FROM configurados, o envio é registado como NOT_CONFIGURED e não é simulado.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!emailConfigured()) {
    await db.emailLog.create({ data: { to, subject, status: "NOT_CONFIGURED" } });
    if (process.env.NODE_ENV === "development") console.info(`[email não configurado] ${to}: ${subject}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      await db.emailLog.create({ data: { to, subject, status: "FAILED", error: `${res.status} ${text}` } });
      return false;
    }
    await db.emailLog.create({ data: { to, subject, status: "SENT" } });
    return true;
  } catch (e) {
    await logError("email", e, { to, subject });
    await db.emailLog.create({ data: { to, subject, status: "FAILED", error: String(e).slice(0, 500) } });
    return false;
  }
}
