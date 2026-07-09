-- ==========================================
-- PHASE 1: DATABASE MIGRATION (Auth, Roles & Ticketing)
-- Upgrades Finor V6 into a public, multi-tenant SaaS application.
-- ==========================================

-- 1. Create public.profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'USER' NOT NULL CHECK (role IN ('USER', 'SUPER_ADMIN')),
    username TEXT,
    country TEXT,
    gender TEXT,
    security_question TEXT,
    security_answer TEXT,
    temp_reset_key TEXT,
    temp_reset_expiry TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_owner_policy" ON public.profiles
    FOR ALL USING (auth.uid() = id);

-- Create security definer function to avoid recursive RLS policy checks
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "profiles_admin_policy" ON public.profiles
    FOR SELECT USING (public.is_admin());

-- 2. Trigger on User Signup to auto-populate profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (new.id, new.email, 'USER');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Support Tickets Table
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWING', 'RESOLVED')),
    admin_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Policy for standard users: access only their own tickets
CREATE POLICY "support_tickets_owner_policy" ON public.support_tickets
    FOR ALL USING (auth.uid() = user_id);

-- Policy for Super Admins: read/write/update all tickets
CREATE POLICY "support_tickets_admin_policy" ON public.support_tickets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'SUPER_ADMIN'
        )
    );

-- 4. Enable Strict RLS on all user financial/ledger data tables
-- A: finance_transactions
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_transactions_owner_policy" ON public.finance_transactions;
CREATE POLICY "finance_transactions_owner_policy" ON public.finance_transactions
    FOR ALL USING (auth.uid() = user_id);

-- B: finance_goals
ALTER TABLE public.finance_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_goals_owner_policy" ON public.finance_goals;
CREATE POLICY "finance_goals_owner_policy" ON public.finance_goals
    FOR ALL USING (auth.uid() = user_id);

-- C: staging_transactions
ALTER TABLE public.staging_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staging_transactions_owner_policy" ON public.staging_transactions;
CREATE POLICY "staging_transactions_owner_policy" ON public.staging_transactions
    FOR ALL USING (auth.uid() = user_id);

-- D: staging_trades
ALTER TABLE public.staging_trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staging_trades_owner_policy" ON public.staging_trades;
CREATE POLICY "staging_trades_owner_policy" ON public.staging_trades
    FOR ALL USING (auth.uid() = user_id);
