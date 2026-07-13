-- Migration to add user-specific Zerodha Kite credentials and PDF decryption passwords to public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_api_key TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_api_secret TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_pdf_password TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_access_token TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_session_updated_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_expiry_days INT DEFAULT 1;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gmail_connected_email VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gmail_filter_from VARCHAR(255) DEFAULT 'noreply@zerodha.com';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gmail_filter_subject VARCHAR(255) DEFAULT 'contract note';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gmail_client_id TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gmail_client_secret TEXT DEFAULT NULL;

-- Convert existing columns to TEXT to avoid length restrictions on encrypted values
ALTER TABLE public.profiles ALTER COLUMN zerodha_api_key TYPE TEXT;
ALTER TABLE public.profiles ALTER COLUMN zerodha_api_secret TYPE TEXT;
ALTER TABLE public.profiles ALTER COLUMN zerodha_pdf_password TYPE TEXT;
ALTER TABLE public.profiles ALTER COLUMN zerodha_access_token TYPE TEXT;
ALTER TABLE public.profiles ALTER COLUMN gmail_refresh_token TYPE TEXT;
ALTER TABLE public.profiles ALTER COLUMN gmail_client_id TYPE TEXT;
ALTER TABLE public.profiles ALTER COLUMN gmail_client_secret TYPE TEXT;
