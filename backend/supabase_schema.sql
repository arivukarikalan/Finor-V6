-- 1. Create finance_transactions table
CREATE TABLE IF NOT EXISTS public.finance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount NUMERIC(15, 2) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    category VARCHAR(50) NOT NULL,
    method VARCHAR(50) NOT NULL,
    description TEXT,
    source VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'GMAIL')),
    external_ref_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and create policy for transactions
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to manage their own transactions" 
ON public.finance_transactions
FOR ALL 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Index for user transactions queries
CREATE INDEX IF NOT EXISTS idx_finance_transactions_user_date ON public.finance_transactions(user_id, date DESC);


-- 2. Create finance_debts table
CREATE TABLE IF NOT EXISTS public.finance_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    person_name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('LENT', 'BORROWED')),
    amount NUMERIC(15, 2) NOT NULL,
    remaining_amount NUMERIC(15, 2) NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SETTLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and create policy for debts
ALTER TABLE public.finance_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to manage their own debts" 
ON public.finance_debts
FOR ALL 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Index for user debts queries
CREATE INDEX IF NOT EXISTS idx_finance_debts_user_status ON public.finance_debts(user_id, status);


-- 3. Create finance_goals table
CREATE TABLE IF NOT EXISTS public.finance_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_class VARCHAR(50) NOT NULL CHECK (asset_class IN ('LIQUID_CASH', 'MUTUAL_FUND', 'GOLD_SILVER', 'EQUITY_STOCKS', 'US_STOCKS', 'ETF')),
    current_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    target_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    gold_grams NUMERIC(10, 3) DEFAULT 0.000,
    silver_grams NUMERIC(10, 3) DEFAULT 0.000,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, asset_class)
);

-- Enable RLS and create policy for goals
ALTER TABLE public.finance_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to manage their own goals" 
ON public.finance_goals
FOR ALL 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
