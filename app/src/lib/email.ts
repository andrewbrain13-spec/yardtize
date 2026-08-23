import "server-only";

/**
 * Transactional email over Resend's HTTP API.
 *
 * Deliberately no SDK: one fetch call is the whole integration, and a
 * dependency that ships its own retry and error semantics is more surface than
 * this needs.
 *
 * Nothing here may break the thing that triggered it. A homeowner approving a
 * request must get their approval recorded whether or not the confirmation
 * email leaves the building, so every failure is swallowed and reported in the
 * return value instead of thrown.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** Verified sending domain in Resend. */
const DEFAULT_FROM = "Yardtize <notifications@yardtize.com>";

export type EmailResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" | "failed"; detail?: string };

type SendArgs = {
  to: string;
  subject: string;
  /** Bold line at the top of the card. */
  heading: string;
  /** Paragraphs, plain text. Rendered in order. */
  body: string[];
  action?: { label: string; url: string };
  /** Small print under the button. */
  footnote?: string;
};

export async function sendEmail(args: SendArgs): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "not-configured" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
        to: [args.to],
        subject: args.subject,
        html: renderHtml(args),
        text: renderText(args),
      }),
      // A slow mail API must not hold a server action open indefinitely.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { sent: false, reason: "failed", detail: await response.text() };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: "failed", detail: String(error) };
  }
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/*
 * Inline styles and a fixed-width table shell, because Gmail strips <style>
 * blocks and Outlook ignores most modern layout. Palette matches the site.
 */
function renderHtml({ heading, body, action, footnote }: SendArgs): string {
  const paragraphs = body
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3f4a44">${escape(p)}</p>`,
    )
    .join("");

  const button = action
    ? `<p style="margin:22px 0 0"><a href="${escape(action.url)}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${escape(action.label)}</a></p>`
    : "";

  const small = footnote
    ? `<p style="margin:18px 0 0;font-size:12.5px;line-height:1.5;color:#7b857f">${escape(footnote)}</p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:28px 12px;background:#faf9f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:520px;max-width:100%">
<tr><td style="padding:0 0 16px;font-size:18px;font-weight:800;color:#166534;letter-spacing:-0.2px">Yardtize</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e7e3da;border-radius:14px;padding:28px">
<h1 style="margin:0 0 14px;font-size:19px;line-height:1.35;color:#1c211e;letter-spacing:-0.3px">${escape(heading)}</h1>
${paragraphs}${button}${small}
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:11.5px;line-height:1.5;color:#9aa39d">
You're receiving this because you have a Yardtize account. Yardtize is a marketplace for yard sign placements in the Kansas City metro.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function renderText({ heading, body, action, footnote }: SendArgs): string {
  return [
    heading,
    "",
    ...body,
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
    ...(footnote ? ["", footnote] : []),
    "",
    "—",
    "Yardtize · yard sign placements in the Kansas City metro",
  ].join("\n");
}
