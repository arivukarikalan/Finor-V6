-- 1. Create Staging Tables
CREATE TABLE IF NOT EXISTS public.staging_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    raw_data JSONB NOT NULL,
    raw_data_hash VARCHAR(64) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'DUPLICATE', 'FAILED')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.staging_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    raw_data JSONB NOT NULL,
    raw_data_hash VARCHAR(64) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'DUPLICATE', 'FAILED')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Indexing for staging queues
CREATE INDEX IF NOT EXISTS idx_staging_tx_status ON public.staging_transactions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_staging_trades_status ON public.staging_trades(status, created_at);

-- 2. Reconciliation Stored Procedure for Transactions
CREATE OR REPLACE FUNCTION public.reconcile_staging_transactions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    processed_count INT := 0;
    duplicate_count INT := 0;
    failed_count INT := 0;
    tx_user_id UUID;
    tx_date TIMESTAMPTZ;
    tx_amount NUMERIC(15, 2);
    tx_type VARCHAR(20);
    tx_category VARCHAR(50);
    tx_method VARCHAR(50);
    tx_desc TEXT;
    tx_source VARCHAR(20);
    comp_hash VARCHAR(64);
    existing_id UUID;
BEGIN
    -- Select up to 100 pending items, locking them to prevent concurrent cron execution clashes
    FOR rec IN (
        SELECT id, user_id, raw_data, raw_data_hash
        FROM public.staging_transactions
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    ) LOOP
        BEGIN
            tx_user_id := rec.user_id;
            tx_date := COALESCE((rec.raw_data->>'date')::TIMESTAMPTZ, NOW());
            tx_amount := (rec.raw_data->>'amount')::NUMERIC(15, 2);
            tx_type := UPPER(rec.raw_data->>'type');
            tx_category := COALESCE(rec.raw_data->>'category', 'Uncategorized');
            tx_method := COALESCE(rec.raw_data->>'method', 'UPI');
            tx_desc := rec.raw_data->>'description';
            tx_source := COALESCE(rec.raw_data->>'source', 'SMS');

            -- Data sanity validation
            IF tx_amount IS NULL OR tx_type IS NULL OR tx_type NOT IN ('INCOME', 'EXPENSE') THEN
                UPDATE public.staging_transactions
                SET status = 'FAILED',
                    error_message = 'Required transaction fields (amount, type) are missing or corrupt in JSON.',
                    processed_at = NOW()
                WHERE id = rec.id;
                failed_count := failed_count + 1;
                CONTINUE;
            END IF;

            -- Establish deduplication hash key
            comp_hash := rec.raw_data_hash;
            IF comp_hash IS NULL THEN
                comp_hash := md5(concat(
                    tx_user_id::text, '_', 
                    to_char(tx_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'), '_', 
                    tx_type, '_', 
                    tx_amount::text, '_',
                    tx_desc
                ));
            END IF;

            -- Check for duplicates in main finance_transactions table
            SELECT id INTO existing_id
            FROM public.finance_transactions
            WHERE user_id = tx_user_id
              AND date(date AT TIME ZONE 'Asia/Kolkata') = date(tx_date AT TIME ZONE 'Asia/Kolkata')
              AND type = tx_type
              AND amount = tx_amount
              AND (description = tx_desc OR (external_ref_id IS NOT NULL AND external_ref_id = comp_hash))
            LIMIT 1;

            IF existing_id IS NOT NULL THEN
                UPDATE public.staging_transactions
                SET status = 'DUPLICATE',
                    processed_at = NOW()
                WHERE id = rec.id;
                duplicate_count := duplicate_count + 1;
            ELSE
                INSERT INTO public.finance_transactions (
                    user_id, date, amount, type, category, method, description, source, external_ref_id
                ) VALUES (
                    tx_user_id, tx_date, tx_amount, tx_type, tx_category, tx_method, tx_desc, tx_source, comp_hash
                );

                UPDATE public.staging_transactions
                SET status = 'PROCESSED',
                    processed_at = NOW()
                WHERE id = rec.id;
                processed_count := processed_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            UPDATE public.staging_transactions
            SET status = 'FAILED',
                error_message = SQLERRM,
                processed_at = NOW()
            WHERE id = rec.id;
            failed_count := failed_count + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'processed', processed_count,
        'duplicates', duplicate_count,
        'failed', failed_count
    );
END;
$$;

-- 3. Reconciliation Stored Procedure for Trades
CREATE OR REPLACE FUNCTION public.reconcile_staging_trades()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    processed_count INT := 0;
    duplicate_count INT := 0;
    failed_count INT := 0;
    t_user_id UUID;
    t_symbol VARCHAR(50);
    t_date TIMESTAMPTZ;
    t_type VARCHAR(20);
    t_qty INT;
    t_price NUMERIC(12, 2);
    t_order_id VARCHAR(100);
    comp_hash VARCHAR(64);
    existing_id UUID;
BEGIN
    FOR rec IN (
        SELECT id, user_id, raw_data, raw_data_hash
        FROM public.staging_trades
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    ) LOOP
        BEGIN
            t_user_id := rec.user_id;
            t_symbol := UPPER(rec.raw_data->>'stock_symbol');
            t_date := COALESCE((rec.raw_data->>'trade_date')::TIMESTAMPTZ, NOW());
            t_type := UPPER(rec.raw_data->>'trade_type');
            t_qty := (rec.raw_data->>'quantity')::INT;
            t_price := (rec.raw_data->>'price')::NUMERIC(12, 2);
            t_order_id := rec.raw_data->>'order_id';

            IF t_symbol IS NULL OR t_type NOT IN ('BUY', 'SELL') OR t_qty IS NULL OR t_price IS NULL THEN
                UPDATE public.staging_trades
                SET status = 'FAILED',
                    error_message = 'Required trade parameters (symbol, type, qty, price) are missing or corrupt in JSON.',
                    processed_at = NOW()
                WHERE id = rec.id;
                failed_count := failed_count + 1;
                CONTINUE;
            END IF;

            comp_hash := rec.raw_data_hash;
            IF comp_hash IS NULL THEN
                comp_hash := md5(concat(
                    t_user_id::text, '_',
                    t_symbol, '_',
                    to_char(t_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'), '_',
                    t_type, '_',
                    t_qty::text, '_',
                    t_price::text
                ));
            END IF;

            SELECT id INTO existing_id
            FROM public.trades
            WHERE user_id = t_user_id
              AND stock_symbol = t_symbol
              AND date(trade_date AT TIME ZONE 'Asia/Kolkata') = date(t_date AT TIME ZONE 'Asia/Kolkata')
              AND trade_type = t_type
              AND quantity = t_qty
              AND price = t_price
            LIMIT 1;

            IF existing_id IS NOT NULL THEN
                UPDATE public.staging_trades
                SET status = 'DUPLICATE',
                    processed_at = NOW()
                WHERE id = rec.id;
                duplicate_count := duplicate_count + 1;
            ELSE
                INSERT INTO public.trades (
                    user_id, stock_symbol, trade_date, trade_type, quantity, price, order_id
                ) VALUES (
                    t_user_id, t_symbol, t_date, t_type, t_qty, t_price, COALESCE(t_order_id, comp_hash)
                );

                UPDATE public.staging_trades
                SET status = 'PROCESSED',
                    processed_at = NOW()
                WHERE id = rec.id;
                processed_count := processed_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            UPDATE public.staging_trades
            SET status = 'FAILED',
                error_message = SQLERRM,
                processed_at = NOW()
            WHERE id = rec.id;
            failed_count := failed_count + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'processed', processed_count,
        'duplicates', duplicate_count,
        'failed', failed_count
    );
END;
$$;
