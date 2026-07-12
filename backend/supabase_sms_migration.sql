-- 1. Add sms_api_key column to public.profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS sms_api_key VARCHAR(255) UNIQUE;

-- 2. Populate existing users with a unique key
UPDATE public.profiles 
SET sms_api_key = 'FinorSMS_' || substring(md5(random()::text) from 1 for 16)
WHERE sms_api_key IS NULL;

-- 3. Update public.handle_new_user() trigger function to auto-generate a unique key for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    unique_key VARCHAR(255);
BEGIN
    unique_key := 'FinorSMS_' || substring(md5(random()::text) from 1 for 16);
    INSERT INTO public.profiles (id, email, role, sms_api_key)
    VALUES (new.id, new.email, 'USER', unique_key);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
