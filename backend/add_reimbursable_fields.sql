-- Migration to add company-claimable (reimbursable) expense tracking columns to finance_transactions
ALTER TABLE public.finance_transactions 
ADD COLUMN IF NOT EXISTS is_claimable BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS claim_status VARCHAR(20) DEFAULT 'UNCLAIMED';

-- Create an index for claim status filtering
CREATE INDEX IF NOT EXISTS idx_finance_transactions_claim_status 
ON public.finance_transactions(user_id, is_claimable, claim_status);
