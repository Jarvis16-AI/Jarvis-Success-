import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

export async function sendOtpEmail({
  to,
  otp,
  purpose = "signin",
}: {
  to: string;
  otp: string;
  purpose?: "signin" | "register";
}): Promise<void> {
  const resend = getResend();
  const isRegister = purpose === "register";
  const subject = isRegister
    ? `${otp} — Verify your Jarvis account`
    : `${otp} — Your Jarvis sign-in code`;
  const codeLabel = isRegister ? "Your account verification code:" : "Your one-time sign-in code:";
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Jarvis AI <onboarding@resend.dev>",
    to,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="background:#0a0a0a;color:#ffffff;font-family:sans-serif;max-width:480px;margin:40px auto;padding:32px;border-radius:16px;border:1px solid rgba(255,255,255,0.08)">
          <h1 style="font-size:22px;margin-bottom:4px;letter-spacing:0.15em;color:#ffffff">JARVIS</h1>
          <p style="color:rgba(255,255,255,0.4);margin-bottom:28px;font-size:13px">AI Assistant</p>
          <p style="color:rgba(255,255,255,0.75);font-size:15px;margin-bottom:8px">${codeLabel}</p>
          <div style="background:rgba(37,99,235,0.15);border:1px solid rgba(37,99,235,0.3);border-radius:12px;padding:24px;text-align:center;margin:16px 0">
            <span style="font-size:40px;font-weight:700;letter-spacing:0.25em;color:#60a5fa">${otp}</span>
          </div>
          <p style="color:rgba(255,255,255,0.4);font-size:13px;line-height:1.6;margin-top:16px">
            This code expires in <strong style="color:rgba(255,255,255,0.6)">10 minutes</strong>.
            If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0"/>
          <p style="color:rgba(255,255,255,0.2);font-size:11px">Jarvis AI · Powered by Groq</p>
        </body>
      </html>
    `,
  });
}

export async function sendPasswordResetEmail({
  to,
  username,
  resetUrl,
}: {
  to: string;
  username: string;
  resetUrl: string;
}): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Jarvis AI <onboarding@resend.dev>",
    to,
    subject: "Reset your Jarvis AI password",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="background:#0a0a0a;color:#ffffff;font-family:sans-serif;max-width:480px;margin:40px auto;padding:32px;border-radius:16px;border:1px solid rgba(255,255,255,0.08)">
          <h1 style="font-size:22px;margin-bottom:8px;letter-spacing:0.15em;color:#ffffff">JARVIS</h1>
          <p style="color:rgba(255,255,255,0.5);margin-bottom:24px;font-size:14px">AI Assistant</p>
          <p style="color:rgba(255,255,255,0.8);font-size:15px">Hi <strong>${username}</strong>,</p>
          <p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.6">
            We received a request to reset your password. Click the button below to set a new one.
            This link expires in <strong>1 hour</strong>.
          </p>
          <a href="${resetUrl}"
            style="display:inline-block;margin:24px 0;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:500">
            Reset Password
          </a>
          <p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.6">
            If you didn't request this, you can safely ignore this email.
            Your password won't change until you click the link above.
          </p>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0"/>
          <p style="color:rgba(255,255,255,0.2);font-size:11px">Jarvis AI · Powered by Groq</p>
        </body>
      </html>
    `,
  });
}
