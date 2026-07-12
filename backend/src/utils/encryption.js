import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_character_key_finor_v6_secret'; // Must be 32 chars
const IV_LENGTH = 16; // For AES, this is always 16

export function encryptText(text) {
  if (!text) return null;
  // Ensure the key is exactly 32 bytes
  let key = Buffer.from(ENCRYPTION_KEY);
  if (key.length !== 32) {
    key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptText(text) {
  if (!text) return null;
  try {
    const textParts = text.split(':');
    if (textParts.length < 2) {
      // Not encrypted format (no colon); return as plain text directly
      return text;
    }
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let key = Buffer.from(ENCRYPTION_KEY);
    if (key.length !== 32) {
      key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('[Encryption] Decryption failed:', err.message);
    // If decryption fails, it might be plain text from before the migration; return it directly as fallback
    return text;
  }
}
