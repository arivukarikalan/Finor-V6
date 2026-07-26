-- Comprehensive SQL Setup for Finance Hub Schema Updates
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Ensure linked_tx_id column exists
ALTER TABLE public.finance_transactions 
ADD COLUMN IF NOT EXISTS linked_tx_id UUID REFERENCES public.finance_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_linked_tx_id 
ON public.finance_transactions(linked_tx_id);

-- 2. Ensure company claimable (reimbursable) columns exist
ALTER TABLE public.finance_transactions 
ADD COLUMN IF NOT EXISTS is_claimable BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS claim_status VARCHAR(20) DEFAULT 'UNCLAIMED';

CREATE INDEX IF NOT EXISTS idx_finance_transactions_claim_status 
ON public.finance_transactions(user_id, is_claimable, claim_status);

-- 3. Enable RLS and grant owner policy
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_transactions_owner_policy" ON public.finance_transactions;

CREATE POLICY "finance_transactions_owner_policy" 
ON public.finance_transactions 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
