-- Migration to add user-specific Zerodha Kite credentials and PDF decryption passwords to public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_api_key VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_api_secret VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_pdf_password VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_access_token VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zerodha_session_updated_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_expiry_days INT DEFAULT 1;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gmail_refresh_token VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gmail_connected_email VARCHAR(255) DEFAULT NULL;
