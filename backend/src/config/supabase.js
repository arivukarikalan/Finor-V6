import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Missing SUPABASE_URL or SUPABASE_ANON_KEY in backend environment variables.');
}

// Regular client (anon key) - used for user-scoped operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (service role key) - bypasses RLS for backend-only operations
// Used for: saving Gmail tokens, app settings, etc.
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey || supabaseAnonKey  // fallback to anon if service role not set
);
