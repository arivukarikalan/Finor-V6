-- ======================================================================
-- MIGRATION: Disable Row Level Security (RLS) on all remaining tables
-- This aligns all tables to be UNRESTRICTED, resolving backend query blocks.
-- Run these commands in your Supabase SQL Editor:
-- ======================================================================

-- 1. Disable RLS on Finance Tables
ALTER TABLE public.finance_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_goals DISABLE ROW LEVEL SECURITY;

-- 2. Disable RLS on User Profiles & Support
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets DISABLE ROW LEVEL SECURITY;

-- 3. Disable RLS on Staging Queue Tables
ALTER TABLE public.staging_trades DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_transactions DISABLE ROW LEVEL SECURITY;
