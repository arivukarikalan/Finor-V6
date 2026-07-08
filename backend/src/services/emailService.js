import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Default values, user can customize this via environment variables or settings
const gmailUser = process.env.GMAIL_USER || 'arivukarikalan7@gmail.com';
const gmailPassword = process.env.GMAIL_APP_PASSWORD;

// Create SMTP transporter
const getTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPassword
    }
  });
};

/**
 * Sends a welcome email containing the auto-generated password
 */
export async function sendWelcomeEmail(toEmail, username, tempPassword) {
  if (!gmailPassword) {
    console.warn('[EmailService] Missing GMAIL_APP_PASSWORD in environment. Welcome email print fallback:', tempPassword);
    return;
  }

  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: `"Finor Wealth" <${gmailUser}>`,
      to: toEmail,
      subject: 'Welcome to Finor Wealth Platform! 🚀',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #4f46e5; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">FINOR WEALTH</h1>
            <p style="color: #64748b; font-size: 12px; margin: 5px 0 0 0;">Zero-Trust Wealth Management Platform</p>
          </div>
          <p>Hi <strong>${username}</strong>,</p>
          <p>Your multi-tenant account has been successfully created. Welcome onboard!</p>
          <p>Here are your temporary login credentials. Please log in and change your password in your profile settings immediately.</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px;"><strong>Email:</strong> ${toEmail}</p>
            <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>Temporary Password:</strong> <code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-family: monospace;">${tempPassword}</code></p>
          </div>
          <p style="font-size: 11px; color: #94a3b8; border-top: 1px solid #cbd5e1; padding-top: 15px; margin-top: 20px;">
            This email was sent automatically. Please do not reply directly to this message.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Welcome email sent successfully to ${toEmail}`);
  } catch (err) {
    console.error('[EmailService] Failed to send welcome email:', err.message);
  }
}

/**
 * Sends a password reset key containing the 2-hour admin generated reset token
 */
export async function sendResetKeyEmail(toEmail, resetKey) {
  if (!gmailPassword) {
    console.warn('[EmailService] Missing GMAIL_APP_PASSWORD in environment. Reset key print fallback:', resetKey);
    return;
  }

  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: `"Finor Security" <${gmailUser}>`,
      to: toEmail,
      subject: 'Your Password Reset Key - Action Required 🔑',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #ef4444; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">SECURITY CHALLENGE</h1>
            <p style="color: #64748b; font-size: 12px; margin: 5px 0 0 0;">Finor Password Reset Utility</p>
          </div>
          <p>Hello,</p>
          <p>The Super Admin has generated a temporary password reset key for your account.</p>
          <p>This key is valid for <strong>exactly 2 hours</strong> from generation. Enter this key on the login screen to set a new password.</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 20px; letter-spacing: 0.1em; font-family: monospace; font-weight: bold; color: #1e293b;">
              ${resetKey}
            </p>
          </div>
          <p>If you did not request this key, please contact support immediately.</p>
          <p style="font-size: 11px; color: #94a3b8; border-top: 1px solid #cbd5e1; padding-top: 15px; margin-top: 20px;">
            This security key expires 2 hours after generation.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Reset key email sent successfully to ${toEmail}`);
  } catch (err) {
    console.error('[EmailService] Failed to send reset key email:', err.message);
  }
}
