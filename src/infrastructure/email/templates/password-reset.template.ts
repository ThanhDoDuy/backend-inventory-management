export interface PasswordResetEmailParams {
  username: string;
  resetUrl: string;
  expiresMinutes: number;
}

export function buildPasswordResetEmail(params: PasswordResetEmailParams) {
  const { username, resetUrl, expiresMinutes } = params;
  const subject = 'Reset your POS System password';

  const text = [
    `Hi ${username},`,
    '',
    'We received a request to reset your password for POS System.',
    `Click the link below to set a new password. This link expires in ${expiresMinutes} minutes.`,
    '',
    resetUrl,
    '',
    'If you did not request a password reset, you can safely ignore this email.',
    '',
    '— POS System Team',
  ].join('\n');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 8px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#18181b;">POS System</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3f3f46;">Hi ${escapeHtml(username)},</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52525b;">
                We received a request to reset your password. Click the button below to choose a new one.
                This link expires in <strong>${expiresMinutes} minutes</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;" align="center">
              <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
                Reset Password
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#71717a;">Or copy and paste this link into your browser:</p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#2563eb;word-break:break-all;">${resetUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;border-top:1px solid #f4f4f5;">
              <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#a1a1aa;">
                If you did not request this, you can safely ignore this email.
              </p>
              <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">— POS System Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
