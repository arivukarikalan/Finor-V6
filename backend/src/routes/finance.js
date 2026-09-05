import express from 'express';
import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { google } from 'googleapis';
import { reconcileAllStagingTransactions } from '../utils/reconcile.js';
import { fetchLTPYahoo } from '../services/yahooFinance.js';
import { detectRecurringPattern } from '../services/recurringService.js';
import { cleanAndClassifyTransaction } from '../utils/textClassifier.js';


const router = express.Router();





// ─── GET /api/finance/dashboard ──────────────────────────────────────────────
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch transactions
    const { data: transactions, error: tErr } = await supabaseAdmin
      .from('finance_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    if (tErr) throw tErr;

    // 2. Fetch debts
    const { data: debts, error: dErr } = await supabaseAdmin
      .from('finance_debts')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    if (dErr) throw dErr;

    // 3. Fetch goals
    const { data: goals, error: gErr } = await supabaseAdmin
      .from('finance_goals')
      .select('*')
      .eq('user_id', userId);
    if (gErr) throw gErr;

    // 4. Fetch stock holdings to auto-calculate equity and ETF values
    const { data: holdings, error: hErr } = await supabaseAdmin
      .from('holdings')
      .select('*')
      .eq('user_id', userId);
    if (hErr) throw hErr;

    let equityValue = 0;
    let etfValue = 0;

    if (holdings && holdings.length > 0) {
      holdings.forEach(h => {
        const value = (h.ltp || h.average_buy_price) * h.quantity;
        const symbolUpper = h.stock_symbol.toUpperCase();
        
        // Simple heuristic: If symbol contains "BEES" or "ETF", classify as ETF, else Equity
        if (symbolUpper.includes('BEES') || symbolUpper.includes('ETF') || symbolUpper === 'NIFTYBEES' || symbolUpper === 'GOLDBEES') {
          etfValue += value;
        } else {
          equityValue += value;
        }
      });
    }

    // 4b. Fetch Mutual Fund holdings valuation
    let mutualFundValue = 0;
    try {
      const { data: mfHoldings, error: mfErr } = await supabaseAdmin
        .from('mutual_fund_holdings')
        .select('current_value')
        .eq('user_id', userId);

      if (!mfErr && Array.isArray(mfHoldings)) {
        mutualFundValue = mfHoldings.reduce((sum, h) => sum + (parseFloat(h.current_value) || 0), 0);
      } else {
        // Fallback to system_settings cache if table not yet created
        const { data: fallbackMf } = await supabaseAdmin
          .from('system_settings')
          .select('value')
          .eq('key', `mutual_funds_${userId}`)
          .maybeSingle();

        if (fallbackMf?.value) {
          const parsed = typeof fallbackMf.value === 'string' ? JSON.parse(fallbackMf.value) : fallbackMf.value;
          if (Array.isArray(parsed)) {
            mutualFundValue = parsed.reduce((sum, h) => sum + (parseFloat(h.current_value) || 0), 0);
          }
        }
      }
    } catch (mfEx) {
      console.error('[FinanceRoute] Mutual fund valuation fetch failed:', mfEx.message);
    }

    // 5. Fetch live commodity prices for Gold & Silver
    let goldPricePerGram = 0;
    let silverPricePerGram = 0;
    
    try {
      const goldData = await fetchLTPYahoo('GC=F');
      const silverData = await fetchLTPYahoo('SI=F');
      const usdinrData = await fetchLTPYahoo('USDINR=X');

      const usdToInr = usdinrData?.ltp || 83.50; // Fallback to 83.5
      
      if (goldData?.ltp) {
        // GC=F price is per troy ounce (31.1035 grams)
        goldPricePerGram = (goldData.ltp / 31.1035) * usdToInr;
      }
      if (silverData?.ltp) {
        silverPricePerGram = (silverData.ltp / 31.1035) * usdToInr;
      }
    } catch (err) {
      console.error('[FinanceRoute] Commodity price fetch failed:', err.message);
      // Fallback prices in INR if APIs fail
      goldPricePerGram = 7200; // ~₹7,200 per gram
      silverPricePerGram = 88;  // ~₹88 per gram
    }

    res.json({
      transactions: transactions || [],
      debts: debts || [],
      goals: goals || [],
      autoValuations: {
        equity: equityValue,
        etf: etfValue,
        mutual_fund: mutualFundValue,
        goldPricePerGram,
        silverPricePerGram
      }
    });

  } catch (err) {
    console.error('[FinanceRoute] Dashboard fetch failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/finance/transaction ───────────────────────────────────────────
router.post('/transaction', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, date, amount, type, category, method, description, source, linked_tx_id, is_claimable, claim_status, is_auto_filled, needs_review } = req.body;

    const payload = {
      user_id: userId,
      date: date || new Date().toISOString(),
      amount: parseFloat(amount),
      type,
      category: category || 'Uncategorized',
      method: method || 'Cash',
      description,
      source: source || 'MANUAL',
      linked_tx_id: linked_tx_id || null,
      is_claimable: typeof is_claimable === 'boolean' ? is_claimable : false,
      claim_status: claim_status || 'UNCLAIMED',
      is_auto_filled: typeof is_auto_filled === 'boolean' ? is_auto_filled : false,
      needs_review: typeof needs_review === 'boolean' ? needs_review : false
    };


    let result;
    if (id && !id.startsWith('temp_')) {
      // Update existing record
      let { data, error } = await supabaseAdmin
        .from('finance_transactions')
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .maybeSingle();

      if (error && error.message && error.message.includes('column')) {
        // Fallback for legacy DB schema missing newly added columns
        console.warn('[FinanceRoute] Legacy DB schema detected, stripping optional columns for update:', error.message);
        const fallbackPayload = {
          user_id: userId,
          date: payload.date,
          amount: payload.amount,
          type: payload.type,
          category: payload.category,
          method: payload.method,
          description: payload.description,
          source: payload.source
        };
        const fallbackRes = await supabaseAdmin
          .from('finance_transactions')
          .update(fallbackPayload)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .maybeSingle();
        if (fallbackRes.error) throw fallbackRes.error;
        data = fallbackRes.data;
      } else if (error) {
        throw error;
      }

      result = data;
    } else {
      // Insert via staging
      const txDateObj = new Date(payload.date);
      const dateStr = txDateObj.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split('/').reverse().join('-');
      const amountStr = parseFloat(payload.amount || 0).toFixed(2);

      const defaultHash = crypto
        .createHash('md5')
        .update(`${userId}_${dateStr}_${payload.type}_${amountStr}_${payload.description || ''}`)
        .digest('hex');

      const stagingPayload = {
        user_id: userId,
        raw_data: payload,
        raw_data_hash: defaultHash,
        status: 'PENDING'
      };

      const { error: insertError } = await supabaseAdmin
        .from('staging_transactions')
        .insert(stagingPayload);

      if (insertError && insertError.code !== '23505') {
        throw insertError;
      }

      // Immediately reconcile
      try {
        await reconcileAllStagingTransactions();
      } catch (reconcileError) {
        console.error('[FinanceRoute] Immediate manual reconciliation failed:', reconcileError.message);
      }

      // Fetch back the reconciled transaction
      const { data: insertedTx, error: fetchError } = await supabaseAdmin
        .from('finance_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('external_ref_id', defaultHash)
        .maybeSingle();

      if (fetchError) throw fetchError;
      result = insertedTx;
    }

    if (result && result.id) {
      await syncTransactionToDebts(result);
    }

    res.json({ message: 'Transaction saved successfully.', transaction: result });

  } catch (err) {
    console.error('[FinanceRoute] Save transaction failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/finance/transaction/:id/toggle-claim ─────────────────────────
router.post('/transaction/:id/toggle-claim', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { is_claimable, claim_status } = req.body;

    const { data: tx, error: fetchErr } = await supabaseAdmin
      .from('finance_transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr || !tx) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const updatedClaimable = typeof is_claimable === 'boolean' ? is_claimable : tx.is_claimable;
    const updatedStatus = claim_status || (tx.claim_status === 'CLAIMED' ? 'UNCLAIMED' : 'CLAIMED');

    const { data, error } = await supabaseAdmin
      .from('finance_transactions')
      .update({
        is_claimable: updatedClaimable,
        claim_status: updatedStatus
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json({ message: 'Claim status updated.', transaction: data });
  } catch (err) {
    console.error('[FinanceRoute] Toggle claim failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/finance/transaction/:id ─────────────────────────────────────
router.delete('/transaction/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('finance_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;

    res.json({ message: 'Transaction deleted successfully.' });

  } catch (err) {
    console.error('[FinanceRoute] Delete transaction failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/finance/transaction/bulk-delete ───────────────────────────────
router.post('/transaction/bulk-delete', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid list of transaction IDs.' });
    }

    const { error } = await supabaseAdmin
      .from('finance_transactions')
      .delete()
      .in('id', ids)
      .eq('user_id', userId);
    if (error) throw error;

    res.json({ message: `Successfully deleted ${ids.length} transactions.` });

  } catch (err) {
    console.error('[FinanceRoute] Bulk delete transactions failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/finance/transaction/bulk-map-category ──────────────────────────
router.post('/transaction/bulk-map-category', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ids, category } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0 || !category) {
      return res.status(400).json({ error: 'Invalid payload.' });
    }

    const validIds = ids.filter(id => id && !id.startsWith('temp_'));

    if (validIds.length === 0) {
      return res.json({ message: 'No valid stored transaction IDs to map.', transactions: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('finance_transactions')
      .update({ category })
      .in('id', validIds)
      .eq('user_id', userId)
      .select();

    if (error) throw error;

    // Trigger auto-sync to debt ledger if mapped to Lent/Friends
    for (const tx of (data || [])) {
      await syncTransactionToDebts(tx);
    }

    res.json({ message: `Successfully mapped ${validIds.length} transactions to ${category}.`, transactions: data });
  } catch (err) {
    console.error('[FinanceRoute] Bulk map category failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/finance/debt ──────────────────────────────────────────────────
router.post('/debt', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, person_name, type, amount, notes, date, status } = req.body;

    const parsedAmount = parseFloat(amount);

    const payload = {
      user_id: userId,
      person_name,
      type,
      amount: parsedAmount,
      date: date || new Date().toISOString(),
      notes,
      status: status || 'ACTIVE'
    };

    let result;
    if (id) {
      // Update
      const { data: oldDebt } = await supabaseAdmin
        .from('finance_debts')
        .select('amount, remaining_amount')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      const diff = parsedAmount - (oldDebt ? oldDebt.amount : 0);
      payload.remaining_amount = Math.max(0, (oldDebt ? oldDebt.remaining_amount : 0) + diff);

      const { data, error } = await supabaseAdmin
        .from('finance_debts')
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .maybeSingle();
      if (error) throw error;
      result = data;
    } else {
      // Insert
      payload.remaining_amount = parsedAmount;
      const { data, error } = await supabaseAdmin
        .from('finance_debts')
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) throw error;
      result = data;
    }

    res.json({ message: 'Debt entry saved successfully.', debt: result });

  } catch (err) {
    console.error('[FinanceRoute] Save debt failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/finance/debt/:id/repay ────────────────────────────────────────
router.post('/debt/:id/repay', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { amount, date, method, description } = req.body;

    const repayAmt = parseFloat(amount);

    const { data: debt, error: fetchErr } = await supabaseAdmin
      .from('finance_debts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!debt) return res.status(404).json({ error: 'Debt record not found.' });

    const newRemaining = Math.max(0, debt.remaining_amount - repayAmt);
    const newStatus = newRemaining === 0 ? 'SETTLED' : 'ACTIVE';

    // 1. Update debt
    const { data: updatedDebt, error: updateErr } = await supabaseAdmin
      .from('finance_debts')
      .update({
        remaining_amount: newRemaining,
        status: newStatus
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (updateErr) throw updateErr;

    // 2. Automatically log repayment transaction
    const isLent = debt.type === 'LENT';
    const txType = isLent ? 'INCOME' : 'EXPENSE'; // Repaying a lent debt increases money (income); paying back a borrow reduces money (expense)
    const txCategory = 'Debt Repayment';
    const txDesc = description || (isLent 
      ? `Debt repayment from ${debt.person_name}` 
      : `Repaid debt to ${debt.person_name}`
    );

    const { error: txErr } = await supabaseAdmin
      .from('finance_transactions')
      .insert({
        user_id: userId,
        date: date || new Date().toISOString(),
        amount: repayAmt,
        type: txType,
        category: txCategory,
        method: method || 'UPI',
        description: txDesc,
        source: 'MANUAL'
      });

    if (txErr) console.error('[FinanceRoute] Repayment auto-transaction failed:', txErr.message);

    res.json({ message: 'Repayment recorded successfully.', debt: updatedDebt });

  } catch (err) {
    console.error('[FinanceRoute] Record repayment failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/finance/debt/:id ────────────────────────────────────────────
router.delete('/debt/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('finance_debts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;

    res.json({ message: 'Debt entry deleted successfully.' });

  } catch (err) {
    console.error('[FinanceRoute] Delete debt failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/finance/goals ─────────────────────────────────────────────────
router.post('/goals', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { asset_class, current_value, target_value, gold_grams, silver_grams } = req.body;

    const payload = {
      user_id: userId,
      asset_class,
      current_value: parseFloat(current_value) || 0.00,
      target_value: parseFloat(target_value) || 0.00,
      gold_grams: parseFloat(gold_grams) || 0.000,
      silver_grams: parseFloat(silver_grams) || 0.000,
      last_updated: new Date().toISOString()
    };

    // Check if goal settings already exist for this user & asset class
    const { data: existing } = await supabaseAdmin
      .from('finance_goals')
      .select('id')
      .eq('user_id', userId)
      .eq('asset_class', asset_class)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('finance_goals')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('finance_goals')
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) throw error;
      result = data;
    }

    res.json({ message: 'Wealth goal settings updated successfully.', goal: result });

  } catch (err) {
    console.error('[FinanceRoute] Update wealth goal failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/finance/sms-webhook ───────────────────────────────────────────
router.post('/sms-webhook', async (req, res) => {
  try {
    const apiKeyHeader = req.headers['x-api-key'];
    if (!apiKeyHeader) {
      return res.status(401).json({ error: 'API key missing in x-api-key header.' });
    }

    const { sender, message, timestamp } = req.body;
    
    // Handle test connection requests
    if (!message || message === 'TEST_CONNECTION' || req.body.test === true) {
      return res.status(200).json({ success: true, message: 'Connection verified successfully.' });
    }

    // 1. Get userId dynamically by looking up key in profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('sms_api_key', apiKeyHeader)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired API key.' });
    }

    const userId = profile.id;

    // 2. Parse raw SMS text
    const textToAnalyze = message.toLowerCase();
    const isDebit = /debit|spent|paid|sent|withdrawn|payment/i.test(textToAnalyze);
    const isCredit = /credit|received|deposited|added|refund/i.test(textToAnalyze);

    // Extract currency amount
    const amtMatch = textToAnalyze.match(/(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{2})?)/i) || 
                     textToAnalyze.match(/(?:amt|amount)\s*(?:of)?\s*(?:rs\.?|inr|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);

    if (!amtMatch) {
      return res.status(422).json({ error: 'Failed to extract amount from SMS text.' });
    }

    const amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    const type = isCredit ? 'INCOME' : 'EXPENSE';

    const merchantMatch = message.match(/(?:to|at|from|towards|merchant)\s+([a-zA-Z0-9\s&*()-]{3,80})/i);
    let description = '';
    let category = 'Other';

    if (merchantMatch) {
      const classification = cleanAndClassifyTransaction(merchantMatch[1]);
      description = classification.description;
      category = classification.category;
    } else {
      description = type === 'EXPENSE' ? 'Spent via SMS alert' : 'Credits via SMS alert';
      category = type === 'EXPENSE' ? 'Other' : 'Salary';
    }

    // Append sender header detail
    description += ` (${sender || 'Unknown'})`;

    const txDate = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

    // Map description and category
    let finalDescription = description;
    let finalCategory = category;
    let isAutoFilled = false;
    let needsReview = false;

    if (type === 'EXPENSE') {
      try {
        const autoFill = await detectRecurringPattern(userId, amount, txDate);
        if (autoFill.isMatched) {
          finalDescription = autoFill.description;
          finalCategory = autoFill.category;
          isAutoFilled = true;
        }
      } catch (autoErr) {
        console.error('[SMS Webhook] Recurring pattern detection failed:', autoErr.message);
      }
    }

    const txDateObj = new Date(txDate);
    const dateStr = txDateObj.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split('/').reverse().join('-');
    const amountStr = parseFloat(amount || 0).toFixed(2);

    // Hash based on final description/amount to prevent duplicate insertions
    const defaultHash = crypto
      .createHash('md5')
      .update(`${userId}_${dateStr}_${type}_${amountStr}_${finalDescription}`)
      .digest('hex');

    const stagingPayload = {
      user_id: userId,
      raw_data: {
        date: txDate,
        amount,
        type,
        category: finalCategory,
        method: 'UPI',
        description: finalDescription,
        source: 'SMS',
        is_auto_filled: isAutoFilled,
        needs_review: needsReview
      },
      raw_data_hash: defaultHash,
      status: 'PENDING'
    };

    const { error: insertError } = await supabaseAdmin
      .from('staging_transactions')
      .insert(stagingPayload);

    if (insertError && insertError.code !== '23505') {
      throw insertError;
    }

    // Immediately trigger reconciliation
    try {
      await reconcileAllStagingTransactions();
    } catch (reconcileError) {
      console.error('[SMSWebhookRoute] Immediate reconciliation failed:', reconcileError.message);
    }

    // Retrieve the processed transaction by its external_ref_id
    const { data: insertedTx } = await supabaseAdmin
      .from('finance_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('external_ref_id', defaultHash)
    if (insertedTx) {
      await syncTransactionToDebts(insertedTx);
    }

    res.status(201).json({
      success: true,
      message: 'Transaction successfully processed and logged from SMS webhook.',
      transaction: insertedTx || { amount, type, category, date: txDate, description, source: 'SMS' }
    });

  } catch (err) {
    console.error('[SMSWebhookRoute] Ingestion failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/finance/import-staging ──────────────────────────────────────────
router.post('/import-staging', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Missing or invalid transaction data array.' });
    }

    if (transactions.length === 0) {
      return res.json({ message: 'No transactions to import.', count: 0 });
    }

    // Map input objects to staging schema: user_id, raw_data, raw_data_hash
    const stagingPayload = transactions.map(tx => {
      // Calculate a unique composite hash for early deduplication check if not supplied
      const txDate = tx.date || new Date().toISOString();
      const txAmount = parseFloat(tx.amount || 0).toFixed(2);
      const txType = (tx.type || 'EXPENSE').toUpperCase();
      const txDesc = tx.description || '';
      
      const dateStr = new Date(txDate).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split('/').reverse().join('-'); // YYYY-MM-DD format
      
      const defaultHash = crypto
        .createHash('md5')
        .update(`${userId}_${dateStr}_${txType}_${txAmount}_${txDesc}`)
        .digest('hex');

      return {
        user_id: userId,
        raw_data: tx,
        raw_data_hash: tx.raw_data_hash || defaultHash,
        status: 'PENDING'
      };
    });

    const { data, error } = await supabaseAdmin
      .from('staging_transactions')
      .insert(stagingPayload)
      .select('id');

    if (error) {
      // If error is unique constraint violation (duplicate payload raw_data_hash)
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Duplicate records detected. Some or all payloads have already been staged.' });
      }
      throw error;
    }

    res.json({
      message: `Successfully staged ${stagingPayload.length} transactions.`,
      count: stagingPayload.length
    });

  } catch (err) {
    console.error('[FinanceRoute] Import staging failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function syncTransactionToDebts(tx) {
  try {
    const userId = tx.user_id;
    const amount = parseFloat(tx.amount);
    
    if (tx.category === 'Lent/Friends') {
      if (tx.type === 'EXPENSE') {
        // 1. Check if debt already exists for this tx
        const noteTag = `tx_id: ${tx.id}`;
        const { data: existing } = await supabaseAdmin
          .from('finance_debts')
          .select('id')
          .eq('user_id', userId)
          .like('notes', `%${noteTag}%`)
          .maybeSingle();

        if (!existing) {
          // Parse name from description (e.g. "Lent to Sanjay" -> "Sanjay", or "Sent to Vignesh" -> "Vignesh")
          let name = 'Friend';
          const desc = (tx.description || '').toLowerCase();
          
          // Match common formats like "lent to Name", "sent to Name", "given to Name", "to Name"
          const match = tx.description.match(/(?:lent to|sent to|given to|to|friends?|friend)\s+([A-Za-z0-9]+)/i);
          if (match && match[1]) {
            name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
          } else {
            // Check if name is the first word after common payment tags
            const words = tx.description.split(/\s+/).filter(w => w.length > 0);
            if (words.length > 0) {
              const firstWord = words[0];
              if (!['upi', 'to', 'transfer', 'rent', 'sent', 'lent', 'paid'].includes(firstWord.toLowerCase())) {
                name = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
              }
            }
          }

          // Insert new Lent entry
          const { error } = await supabaseAdmin
            .from('finance_debts')
            .insert({
              user_id: userId,
              person_name: name,
              type: 'LENT',
              amount: amount,
              remaining_amount: amount,
              date: tx.date,
              notes: `${noteTag} | Auto-generated from transaction ledger: "${tx.description || ''}"`,
              status: 'ACTIVE'
            });
          if (error) console.error('[FinanceRoute] Auto-debt LENT insert failed:', error.message);
        }
      } else if (tx.type === 'INCOME') {
        // Repayment received!
        // 1. Check if repayment tag already exists
        const noteTag = `repayment_tx_id: ${tx.id}`;
        const { data: existing } = await supabaseAdmin
          .from('finance_debts')
          .select('id')
          .eq('user_id', userId)
          .like('notes', `%${noteTag}%`)
          .maybeSingle();

        if (!existing) {
          // Find the oldest active LENT debt for this user
          const { data: activeDebts } = await supabaseAdmin
            .from('finance_debts')
            .select('*')
            .eq('user_id', userId)
            .eq('type', 'LENT')
            .eq('status', 'ACTIVE')
            .order('date', { ascending: true });

          if (activeDebts && activeDebts.length > 0) {
            // Apply repayment to oldest active debt
            let repaymentRemaining = amount;
            for (const debt of activeDebts) {
              if (repaymentRemaining <= 0) break;

              const deduct = Math.min(repaymentRemaining, parseFloat(debt.remaining_amount));
              const newRemaining = Math.max(0, parseFloat(debt.remaining_amount) - deduct);
              repaymentRemaining -= deduct;

              const updatedNotes = `${debt.notes || ''}\n[Repayment of ₹${deduct.toFixed(2)} received - ${noteTag}]`;
              const updatedStatus = newRemaining === 0 ? 'SETTLED' : 'ACTIVE';

              const { error } = await supabaseAdmin
                .from('finance_debts')
                .update({
                  remaining_amount: newRemaining,
                  status: updatedStatus,
                  notes: updatedNotes
                })
                .eq('id', debt.id);

              if (error) console.error('[FinanceRoute] Auto-debt repayment update failed:', error.message);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[syncTransactionToDebts] unexpected error:', err.message);
  }
}

// ─── GET /api/finance/recurring-suggestions ──────────────────────────────────
router.get('/recurring-suggestions', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = parseFloat(req.query.amount);
    const date = req.query.date ? new Date(req.query.date) : new Date();

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount query parameter is required.' });
    }

    const autoFill = await detectRecurringPattern(userId, amount, date);
    res.json(autoFill);
  } catch (err) {
    console.error('[FinanceRoute] Suggestion error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/finance/create-mock-sms ───────────────────────────────────────
router.post('/create-mock-sms', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = parseFloat(req.body.amount || 40);
    const mockDescription = req.body.description || 'Transport';
    
    // Simulate SMS timestamp (current time in IST)
    const txDate = new Date().toISOString();
    const type = 'EXPENSE';

    // Heuristics pattern auto-fill detection
    const classification = cleanAndClassifyTransaction(mockDescription);
    let finalDescription = classification.description;
    let finalCategory = classification.category;
    let isAutoFilled = false;
    let needsReview = false;

    try {
      const autoFill = await detectRecurringPattern(userId, amount, new Date(txDate));
      if (autoFill.isMatched) {
        finalDescription = autoFill.description;
        finalCategory = autoFill.category;
        isAutoFilled = true;
      }
    } catch (autoErr) {
      console.error('[MockSMS] Recurring pattern detection failed:', autoErr.message);
    }

    const txDateObj = new Date(txDate);
    const dateStr = txDateObj.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split('/').reverse().join('-');
    const amountStr = amount.toFixed(2);

    // Create unique hash to avoid duplicate constraints if run multiple times
    const uniqueSalt = Math.floor(Math.random() * 1000000).toString();
    const defaultHash = crypto
      .createHash('md5')
      .update(`${userId}_${dateStr}_${type}_${amountStr}_${finalDescription}_mock_${uniqueSalt}`)
      .digest('hex');

    const stagingPayload = {
      user_id: userId,
      raw_data: {
        date: txDate,
        amount,
        type,
        category: finalCategory,
        method: 'UPI',
        description: finalDescription,
        source: 'SMS',
        is_auto_filled: isAutoFilled,
        needs_review: needsReview
      },
      raw_data_hash: defaultHash,
      status: 'PENDING'
    };

    const { error: insertError } = await supabaseAdmin
      .from('staging_transactions')
      .insert(stagingPayload);

    if (insertError) {
      throw insertError;
    }

    // Call the immediate reconciliation helper
    await reconcileAllStagingTransactions();

    res.status(201).json({
      success: true,
      message: 'Mock SMS logged and reconciled successfully.'
    });
  } catch (err) {
    console.error('[MockSMS] Ingestion failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/finance/monthly-report ──────────────────────────────────────────
router.get('/monthly-report', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Default to current month in Indian Standard Time (IST)
    const d = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffset);
    const defaultMonth = istDate.toISOString().substring(0, 7); // YYYY-MM
    
    const targetMonth = req.query.month || defaultMonth;
    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      return res.status(400).json({ error: 'Month must be in YYYY-MM format.' });
    }

    const [year, month] = targetMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    
    // Construct local-time ISO bounds
    const startDate = `${targetMonth}-01T00:00:00+05:30`;
    const endDate = `${targetMonth}-${String(lastDay).padStart(2, '0')}T23:59:59+05:30`;

    // Fetch transactions
    const { data: txs, error } = await supabaseAdmin
      .from('finance_transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw error;

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryMap = {};
    const dayMap = {};

    // Filter and aggregate transactions
    (txs || []).forEach(tx => {
      const amt = parseFloat(tx.amount || 0);
      if (tx.type === 'INCOME') {
        totalIncome += amt;
      } else if (tx.type === 'EXPENSE') {
        totalExpense += amt;

        // Category breakdown
        const cat = tx.category || 'Uncategorized';
        if (!categoryMap[cat]) {
          categoryMap[cat] = { amount: 0, count: 0 };
        }
        categoryMap[cat].amount += amt;
        categoryMap[cat].count += 1;

        // Daily breakdown
        const txDate = new Date(tx.date);
        const txIst = new Date(txDate.getTime() + istOffset);
        const dateKey = txIst.toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (!dayMap[dateKey]) {
          dayMap[dateKey] = { amount: 0, count: 0 };
        }
        dayMap[dateKey].amount += amt;
        dayMap[dateKey].count += 1;
      }
    });

    const categoryWise = Object.keys(categoryMap).map(cat => ({
      category: cat,
      amount: parseFloat(categoryMap[cat].amount.toFixed(2)),
      count: categoryMap[cat].count
    })).sort((a, b) => b.amount - a.amount);

    // Calculate days elapsed for averages
    const isCurrentMonth = (year === istDate.getFullYear() && month === (istDate.getMonth() + 1));
    const daysElapsed = isCurrentMonth ? istDate.getDate() : lastDay;

    const spendPerDay = totalExpense / daysElapsed;
    const expenseTxCount = (txs || []).filter(tx => tx.type === 'EXPENSE').length;
    const transactionsPerDay = expenseTxCount / daysElapsed;

    // Find peak spending and transaction days
    let maxSpendDay = null;
    let maxSpendAmount = 0;
    let maxTxDay = null;
    let maxTxCount = 0;

    Object.keys(dayMap).forEach(day => {
      if (dayMap[day].amount > maxSpendAmount) {
        maxSpendAmount = dayMap[day].amount;
        maxSpendDay = day;
      }
      if (dayMap[day].count > maxTxCount) {
        maxTxCount = dayMap[day].count;
        maxTxDay = day;
      }
    });

    // Calculate previous month statistics
    let prevYear = year;
    let prevMonthVal = month - 1;
    if (prevMonthVal === 0) {
      prevMonthVal = 12;
      prevYear -= 1;
    }
    const prevMonthStr = `${prevYear}-${String(prevMonthVal).padStart(2, '0')}`;
    const prevLastDay = new Date(prevYear, prevMonthVal, 0).getDate();
    const prevStartDate = `${prevMonthStr}-01T00:00:00+05:30`;
    const prevEndDate = `${prevMonthStr}-${String(prevLastDay).padStart(2, '0')}T23:59:59+05:30`;

    const { data: prevTxs } = await supabaseAdmin
      .from('finance_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'EXPENSE')
      .gte('date', prevStartDate)
      .lte('date', prevEndDate);

    const prevTotalExpense = (prevTxs || []).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const percentDiff = prevTotalExpense > 0 ? parseFloat((((totalExpense - prevTotalExpense) / prevTotalExpense) * 100).toFixed(2)) : 0;

    res.json({
      month: targetMonth,
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      totalExpense: parseFloat(totalExpense.toFixed(2)),
      netSavings: parseFloat((totalIncome - totalExpense).toFixed(2)),
      categoryWise,
      dailyAverages: {
        spendPerDay: parseFloat(spendPerDay.toFixed(2)),
        transactionsPerDay: parseFloat(transactionsPerDay.toFixed(2))
      },
      peaks: {
        maxSpendDay,
        maxSpendAmount: parseFloat(maxSpendAmount.toFixed(2)),
        maxTxDay,
        maxTxCount
      },
      comparison: {
        prevMonth: prevMonthStr,
        prevTotalExpense: parseFloat(prevTotalExpense.toFixed(2)),
        percentDiff
      }
    });
  } catch (err) {
    console.error('[FinanceRoute] Monthly report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
