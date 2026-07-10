-- Update the staging reconciliation function to support advanced description matching
-- by ignoring trailing/internal parenthesized broker/sender suffixes (e.g. "(AD-HDFCBK-S)").

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
              AND (
                description = tx_desc 
                OR trim(regexp_replace(description, '\s*\([A-Za-z0-9-]+\)\s*', ' ', 'g')) = trim(regexp_replace(tx_desc, '\s*\([A-Za-z0-9-]+\)\s*', ' ', 'g'))
                OR (external_ref_id IS NOT NULL AND external_ref_id = comp_hash)
              )
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
