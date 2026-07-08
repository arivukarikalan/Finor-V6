import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey || supabaseServiceKey.includes('placeholder') || supabaseServiceKey.includes('your_supabase')) {
  console.error('ERROR: Please replace the placeholder SUPABASE_SERVICE_ROLE_KEY in backend/.env with your actual secret service_role key first.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const email = 'arivukarikalan7@gmail.com';
  console.log(`Upgrading user ${email} to SUPER_ADMIN in profiles table...`);

  const { data, error } = await supabase
    .from('profiles')
    .update({ role: 'SUPER_ADMIN' })
    .eq('email', email)
    .select();

  if (error) {
    console.error('Failed to update role:', error.message);
  } else if (!data || data.length === 0) {
    console.warn(`No profile found for ${email}. Make sure you have signed up first!`);
  } else {
    console.log('Successfully upgraded user profile to SUPER_ADMIN:', data[0]);
  }
}

run();
