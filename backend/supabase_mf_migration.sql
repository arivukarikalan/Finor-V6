-- ======================================================================
-- MIGRATION: Create Mutual Fund Holdings Table
-- Run this in your Supabase SQL Editor:
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.mutual_fund_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    folio VARCHAR(100),
    scheme_name TEXT NOT NULL,
    tradingsymbol VARCHAR(50) NOT NULL,
    amc VARCHAR(100),
    quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
    average_price NUMERIC(15, 4) NOT NULL DEFAULT 0,
    last_price NUMERIC(15, 4) NOT NULL DEFAULT 0,
    last_price_date DATE,
    pnl NUMERIC(15, 2) NOT NULL DEFAULT 0,
    pnl_percentage NUMERIC(8, 2) NOT NULL DEFAULT 0,
    invested_value NUMERIC(15, 2) NOT NULL DEFAULT 0,
    current_value NUMERIC(15, 2) NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_folio_symbol UNIQUE (user_id, folio, tradingsymbol)
);

-- Index for fast user queries
CREATE INDEX IF NOT EXISTS idx_mf_holdings_user ON public.mutual_fund_holdings(user_id);

-- Disable RLS for backend service role operations (consistent with other Finor tables)
ALTER TABLE public.mutual_fund_holdings DISABLE ROW LEVEL SECURITY;
