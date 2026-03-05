import { Resend } from "resend";
import { render } from "@react-email/components";
import NewsletterTemplate from "@/emails/NewsletterTemplate";
import SimpleTemplate from "@/emails/SimpleTemplate";

export const maxDuration = 60;

export async function POST(request) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@saldoredo.se";
  const SENDER_NAME = process.env.RESEND_SENDER_NAME || "Saldoredo";
  try {
    const body = await request.json().catch(() => ({}));
    const { recipients = [], subject, templateId = "simple", bodyText = "" } = body;

    if (!subject?.trim()) {
      return Response.json({ ok: false, error: "Ämnesrad saknas." }, { status: 400 });
    }

    const validRecipients = recipients.filter(r => r?.email && r.email.includes("@"));
    if (validRecipients.length === 0) {
      return Response.json({ ok: false, error: "Inga giltiga mottagare med e-postadress." }, { status: 400 });
    }

    const TemplateComponent = templateId === "newsletter" ? NewsletterTemplate : SimpleTemplate;

    let sent = 0;
    let failed = 0;
    const errors = [];

    // Resend free tier: max 100/day. Send one at a time to control errors.
    for (const recipient of validRecipients) {
      try {
        const html = await render(
          TemplateComponent({
            subject,
            body: bodyText,
            recipientName: recipient.name || "",
            senderName: SENDER_NAME,
          })
        );

        await resend.emails.send({
          from: `${SENDER_NAME} <${FROM_EMAIL}>`,
          to: recipient.email,
          subject,
          html,
        });

        sent++;
      } catch (err) {
        failed++;
        errors.push({ email: recipient.email, error: String(err?.message || "okänt fel") });
      }
    }

    return Response.json({
      ok: true,
      sent,
      failed,
      skipped: recipients.length - validRecipients.length,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Okänt fel vid mailutskick" }, { status: 500 });
  }
}
