import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOtpToEmail = async (email, otp) => {
  try {
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>WhatsApp Clone OTP Verification</title>
</head>
<body style="margin:0; padding:0; font-family:'Inter', Arial, sans-serif; background:#f0fdf4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:40px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background:#ffffff; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.15); overflow:hidden;">

          <!--//^ Brand Header -->
          <tr>
            <td style="text-align:center; padding:24px 16px; background:linear-gradient(135deg, #22c55e, #facc15); border-bottom:1px solid #e5f4d7;">
              <div style="font-size:26px; font-weight:700; color:#ffffff;">WhatsApp Clone</div>
              <div style="font-size:14px; color:#f0fdf4; margin-top:4px;">Secure Messaging Platform</div>
            </td>
          </tr>

          <!--//^ OTP Header -->
          <tr>
            <td style="padding:28px 24px; text-align:center; background:linear-gradient(135deg, #a7f3d0, #d9f99d); color:#064e3b;">
              <div style="font-size:22px; font-weight:700;">OTP Verification</div>
              <div style="opacity:.9; font-size:14px; margin-top:6px;">Use this code to sign in to your account</div>
            </td>
          </tr>

          <!--//^ Body -->
          <tr>
            <td style="padding:36px 28px 24px 28px; color:#064e3b; font-size:15px; line-height:1.7; background:linear-gradient(135deg,#a7f3d0,#d9f99d); border-radius:0 0 16px 16px;">
              <p style="margin:0 0 12px;">Hi there,</p>
              <p style="margin:0 0 20px;">Your one-time password(OTP) to verify your WhatsApp Web Account is:</p>

              <!--//* OTP Pill -->
              <div style="margin:28px 0; text-align:center;">
                <span style="display:inline-block; background:linear-gradient(135deg, #22c55e, #facc15); color:#000; font-size:32px; letter-spacing:12px; padding:18px 32px; border-radius:16px; font-weight:900; box-shadow:0 6px 20px rgba(0,0,0,0.25);">
                  ${otp}
                </span>
              </div>

              <p style="text-align:center; font-size:13px; color:#065f46; margin:10px 0 0;">
                ⚠️ The code expires in <b>5 minutes</b>.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
                <tr>
                  <td style="background:#dcfce7; border-radius:12px; padding:16px 18px; color:#064e3b; font-size:13px;">
                    If you didn’t request this, you can safely ignore this email.
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 12px;">With ❤️,<br><b>Team WhatsApp Clone</b></p>
            </td>
          </tr>

          <!--//^ Footer -->
          <tr>
            <td style="background:#047857; padding:20px 16px; text-align:center; font-size:12px; color:#d9fdf5;">
              <p style="margin:0 0 8px;">Need help? <a href="mailto:support@whatsappclone.com" style="color:#fef08a; text-decoration:none;">Contact Support</a></p>
              <p style="margin:0;">This is an automated message, please do not reply.</p>
              <p style="margin:0;">© ${new Date().getFullYear()} WhatsApp Clone. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const { data, error } = await resend.emails.send({
      from: 'WhatsApp Clone <onboarding@resend.dev>', // Resend free sandbox domain
      to: [email],
      subject: 'Your WhatsApp Verification OTP Code',
      html: htmlContent,
    });

    if (error) {
      console.error('❌ Resend Error:', error);
      throw new Error(error.message);
    }

    console.log('✅ OTP Email Sent via Resend:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Error Sending OTP Email:', error.message);
    throw new Error('Failed to send OTP email. Please try again.');
  }
};

export { sendOtpToEmail };