import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { sendWelcomeEmail } from '../services/emailService.js';
import { encryptText, decryptText } from '../utils/encryption.js';

const router = express.Router();

/**
 * Helper to generate a random password
 */
function generateRandomPassword(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * POST /api/auth/signup
 * Custom multi-tenant signup with metadata fields and auto-generated passwords.
 */
router.post('/signup', async (req, res) => {
  try {
    const { username, email, country, gender, security_question, security_answer } = req.body;

    if (!username || !email || !country || !gender || !security_question || !security_answer) {
      return res.status(400).json({ error: 'All signup fields are required.' });
    }

    console.log(`[AuthRoute] signup request received for email: ${email}, username: ${username}`);

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      console.warn(`[AuthRoute] signup aborted: user with email ${email} already exists.`);
      return res.status(400).json({ error: 'A user with this email address already exists.' });
    }

    const randomPassword = generateRandomPassword();

    // Create user in Supabase Auth via admin client
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true // bypass confirmation steps
    });

    if (authError || !authData.user) {
      console.error('[AuthRoute] Auth user creation failed:', authError);
      throw authError || new Error('Failed to create auth user record.');
    }

    const userId = authData.user.id;
    console.log(`[AuthRoute] Auth user created successfully. ID: ${userId}`);

    // Update profiles table with signup details
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        username,
        country,
        gender,
        security_question,
        security_answer
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[AuthRoute] Profile metadata update failed:', profileError);
      throw profileError;
    }

    console.log(`[AuthRoute] Profile metadata updated successfully for ID: ${userId}`);

    // Send Welcome Email containing the password (non-blocking)
    console.log(`[AuthRoute] Dispatching welcome email to ${email} (pass: ${randomPassword})...`);
    sendWelcomeEmail(email, username, randomPassword).catch(err => {
      console.error('[AuthRoute] Welcome email dispatch failed:', err.message);
    });

    res.json({
      success: true,
      message: 'Account created successfully. Temporary password has been sent to your email.'
    });
  } catch (err) {
    console.error('[AuthRoute] Signup catch block error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/challenge-question
 * Retrieves the security question for a given email address
 */
router.post('/challenge-question', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('security_question')
      .eq('email', email)
      .maybeSingle();

    if (error || !profile) {
      return res.status(404).json({ error: 'No profile found matching this email address.' });
    }

    if (!profile.security_question) {
      return res.status(400).json({ error: 'No security question configured for this account. Please raise a support ticket.' });
    }

    res.json({ security_question: profile.security_question });
  } catch (err) {
    console.error('[AuthRoute] Challenge failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/verify-question
 * Verifies security answer and updates password
 */
router.post('/verify-question', async (req, res) => {
  try {
    const { email, security_answer, new_password } = req.body;

    if (!email || !security_answer || !new_password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !profile) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    const isMatch = profile.security_answer && 
      (profile.security_answer.toLowerCase().trim() === security_answer.toLowerCase().trim());

    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect answer to the security question.' });
    }

    // Reset password
    const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: new_password
    });

    if (resetError) throw resetError;

    res.json({ success: true, message: 'Password reset successfully. You can now login.' });
  } catch (err) {
    console.error('[AuthRoute] Verification failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/reset-by-key
 * Resets password using a 2-hour admin generated reset key
 */
router.post('/reset-by-key', async (req, res) => {
  try {
    const { email, reset_key, new_password } = req.body;

    if (!email || !reset_key || !new_password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !profile) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    const isValidKey = profile.temp_reset_key && 
      (profile.temp_reset_key === reset_key) &&
      (new Date(profile.temp_reset_expiry) > new Date());

    if (!isValidKey) {
      return res.status(400).json({ error: 'Invalid or expired temporary reset key.' });
    }

    // Update password
    const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: new_password
    });

    if (resetError) throw resetError;

    // Clear reset key data
    await supabaseAdmin
      .from('profiles')
      .update({
        temp_reset_key: null,
        temp_reset_expiry: null
      })
      .eq('id', profile.id);

    res.json({ success: true, message: 'Password reset successfully using recovery key.' });
  } catch (err) {
    console.error('[AuthRoute] Recovery key verify failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/profile
 * Retrieves active user profile information
 */
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;
    res.json(profile);
  } catch (err) {
    console.error('[AuthRoute] Fetch profile failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/update-profile
 * Updates profile metadata
 */
router.post('/update-profile', requireAuth, async (req, res) => {
  try {
    const { username, country, gender, session_expiry_days } = req.body;

    const updatePayload = { username, country, gender };
    if (typeof session_expiry_days !== 'undefined') {
      // Clamp values between 1 and 30 days
      updatePayload.session_expiry_days = Math.max(1, Math.min(30, parseInt(session_expiry_days) || 1));
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      status: 'SUCCESS',
      message: 'Profile updated successfully.',
      profile: updated
    });
  } catch (err) {
    console.error('[AuthRoute] Update profile failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/change-password
 * Updates password requiring correct verification of the old password first
 */
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password) {
      return res.status(400).json({ error: 'Old password and new password are required.' });
    }

    // Verify old password by attempting a sign-in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password: old_password
    });

    if (signInError) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    // Proceed to update password via admin client
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      password: new_password
    });

    if (updateError) throw updateError;

    res.json({
      status: 'SUCCESS',
      message: 'Password updated successfully.'
    });
  } catch (err) {
    console.error('[AuthRoute] Change password failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/ticket-recovery
 * Public ticket recovery route allowing users to submit password reset tickets without logging in.
 */
router.post('/ticket-recovery', async (req, res) => {
  try {
    const { email, subject, description } = req.body;

    if (!email || !subject || !description) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // Lookup user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'No user profile found matching this email address.' });
    }

    // Insert support ticket on behalf of the user using the admin client
    const { error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        user_id: profile.id,
        subject: `[Password Reset Request] ${subject}`,
        description,
        status: 'OPEN'
      });

    if (ticketError) throw ticketError;

    res.json({
      success: true,
      message: 'Support ticket submitted successfully. The admin will review and send a reset key to your email.'
    });
  } catch (err) {
    console.error('[AuthRoute] Public ticket recovery failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/decrypted-profile
 * Returns the decrypted credentials of the active user for profile page configuration forms.
 */
router.get('/decrypted-profile', requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('zerodha_api_key, zerodha_api_secret, zerodha_pdf_password')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    res.json({
      zerodha_api_key: decryptText(profile?.zerodha_api_key) || '',
      zerodha_api_secret: decryptText(profile?.zerodha_api_secret) || '',
      zerodha_pdf_password: decryptText(profile?.zerodha_pdf_password) || ''
    });
  } catch (err) {
    console.error('[AuthRoute] Decrypted profile fetch failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/disconnect-gmail
 * Clears the user's saved Gmail sync credentials.
 */
router.post('/disconnect-gmail', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        gmail_refresh_token: null,
        gmail_connected_email: null
      })
      .eq('id', req.user.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Gmail connection disconnected successfully.'
    });
  } catch (err) {
    console.error('[AuthRoute] Disconnect Gmail failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/update-zerodha-credentials
 * Updates the user's specific Zerodha Kite credentials and statement password
 */
router.post('/update-zerodha-credentials', requireAuth, async (req, res) => {
  try {
    const { zerodha_api_key, zerodha_api_secret, zerodha_pdf_password } = req.body;

    const encryptedKey = encryptText(zerodha_api_key);
    const encryptedSecret = encryptText(zerodha_api_secret);
    const encryptedPdfPassword = encryptText(zerodha_pdf_password);

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({ 
        zerodha_api_key: encryptedKey || null, 
        zerodha_api_secret: encryptedSecret || null, 
        zerodha_pdf_password: encryptedPdfPassword || null 
      })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Zerodha Kite credentials updated successfully.',
      profile: {
        zerodha_api_key: decryptText(updated.zerodha_api_key),
        zerodha_pdf_password: decryptText(updated.zerodha_pdf_password)
      }
    });
  } catch (err) {
    console.error('[AuthRoute] Update Zerodha credentials failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/regenerate-sms-key
 * Regenerates the user-specific SMS ingestion key
 */
router.post('/regenerate-sms-key', requireAuth, async (req, res) => {
  try {
    const crypto = await import('crypto');
    const newKey = 'FinorSMS_' + crypto.randomBytes(8).toString('hex');

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({ sms_api_key: newKey })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'SMS Ingestion key regenerated successfully.',
      sms_api_key: updated.sms_api_key
    });
  } catch (err) {
    console.error('[AuthRoute] Regenerate SMS key failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
