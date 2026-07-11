import express from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { google } from 'googleapis';
import { fetchLTPYahoo } from '../services/yahooFinance.js';

const router = express.Router();



// Smart keyword mapping to auto-categorize transaction alerts
function autoCategorize(description) {
  const desc = (description || '').toLowerCase();
  
  if (desc.includes('zomato') || desc.includes('swiggy') || desc.includes('food') || desc.includes('restaurant') || desc.includes('eat') || desc.includes('cafe') || desc.includes('dominos') || desc.includes('pizza') || desc.includes('dhaba') || desc.includes('bakery')) {
    if (desc.includes('breakfast')) return 'Food (Breakfast)';
    if (desc.includes('lunch')) return 'Food (Lunch)';
    if (desc.includes('dinner')) return 'Food (Dinner)';
    if (desc.includes('snacks') || desc.includes('tea') || desc.includes('coffee') || desc.includes('snack') || desc.includes('chai')) return 'Food (Snacks)';
    return 'Food';
  }
  if (desc.includes('lent') || desc.includes('friends') || desc.includes('borrowed') || desc.includes('splitwise') || desc.includes('friend') || desc.includes('lent to')) {
    return 'Lent/Friends';
  }
  if (desc.includes('payment link') || desc.includes('paylink') || desc.includes('razorpay.me') || desc.includes('instamojo')) {
    return 'Payment Link';
  }
  if (desc.includes('uber') || desc.includes('ola') || desc.includes('petrol') || desc.includes('metro') || desc.includes('irctc') || desc.includes('flight') || desc.includes('taxi') || desc.includes('rapido') || desc.includes('fuel') || desc.includes('indian oil') || desc.includes('hpcl') || desc.includes('bpcl')) {
    return 'Travel';
  }
  if (desc.includes('amazon') || desc.includes('flipkart') || desc.includes('myntra') || desc.includes('shopping') || desc.includes('retail') || desc.includes('grocery') || desc.includes('supermarket') || desc.includes('mart') || desc.includes('billing') || desc.includes('clothing') || desc.includes('apparel')) {
    return 'Shopping';
  }
  if (desc.includes('groww') || desc.includes('zerodha') || desc.includes('mutual fund') || desc.includes('smallcase') || desc.includes('investment') || desc.includes('stocks') || desc.includes('etf') || desc.includes('deposit') || desc.includes('wazirx') || desc.includes('coinswitch')) {
    return 'Investments';
  }
  if (desc.includes('rent') || desc.includes('electricity') || desc.includes('broadband') || desc.includes('recharge') || desc.includes('airtel') || desc.includes('jio') || desc.includes('water bill') || desc.includes('insurance') || desc.includes('netflix') || desc.includes('spotify') || desc.includes('disney')) {
    return 'Bills/Utilities';
  }
  if (desc.includes('salary') || desc.includes('dividend') || desc.includes('interest') || desc.includes('refund') || desc.includes('cashback')) {
    return 'Salary/Income';
  }
  
  return 'Uncategorized';
}

// ─── GET /api/finance/dashboard ──────────────────────────────────────────────
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch transactions
    const { data: transactions, error: tErr } = await supabase
      .from('finance_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    if (tErr) throw tErr;

    // 2. Fetch debts
    const { data: debts, error: dErr } = await supabase
      .from('finance_debts')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    if (dErr) throw dErr;

    // 3. Fetch goals
    const { data: goals, error: gErr } = await supabase
      .from('finance_goals')
      .select('*')
      .eq('user_id', userId);
    if (gErr) throw gErr;

    // 4. Fetch stock holdings to auto-calculate equity and ETF values
    const { data: holdings, error: hErr } = await supabase
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
    const { id, date, amount, type, category, method, description, source, linked_tx_id } = req.body;

    const payload = {
      user_id: userId,
      date: date || new Date().toISOString(),
      amount: parseFloat(amount),
      type,
      category: category || 'Uncategorized',
      method: method || 'Cash',
      description,
      source: source || 'MANUAL',
      linked_tx_id: linked_tx_id || null
    };

    let result;
    if (id) {
      // Update
      const { data, error } = await supabase
        .from('finance_transactions')
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .maybeSingle();
      if (error) throw error;
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

      const { error: insertError } = await supabase
        .from('staging_transactions')
        .insert(stagingPayload);

      if (insertError && insertError.code !== '23505') {
        throw insertError;
      }

      // Immediately reconcile
      const { error: reconcileError } = await supabase.rpc('reconcile_staging_transactions');
      if (reconcileError) {
        console.error('[FinanceRoute] Immediate manual reconciliation failed:', reconcileError.message);
      }

      // Fetch back the reconciled transaction
      const { data: insertedTx, error: fetchError } = await supabase
        .from('finance_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('external_ref_id', defaultHash)
        .maybeSingle();

      if (fetchError) throw fetchError;
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

// ─── DELETE /api/finance/transaction/:id ─────────────────────────────────────
router.delete('/transaction/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { error } = await supabase
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

    const { error } = await supabase
      .from('finance_transactions')
      .delete()
      .in('id', ids)
      .eq('user_id', userId);
    if (error) throw error;

    res.json({ message: `Successfully deleted ${ids.length} transactions.` });

  } catch (err) {
    console.error('[FinanceRoute] Bulk delete transactions failed:', err.message);
    res.status(500).json({ error: err.message });
});


// ─── POST /api/finance/transaction/bulk-map-category ──────────────────────────
router.post('/transaction/bulk-map-category', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ids, category } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0 || !category) {
      return res.status(400).json({ error: 'Invalid payload.' });
    }

    const { data, error } = await supabase
      .from('finance_transactions')
      .update({ category })
      .in('id', ids)
      .eq('user_id', userId)
      .select();

    if (error) throw error;

    // Trigger auto-sync to debt ledger if mapped to Lent/Friends
    for (const tx of (data || [])) {
      await syncTransactionToDebts(tx);
    }

    res.json({ message: `Successfully mapped ${ids.length} transactions to ${category}.`, transactions: data });
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
      const { data: oldDebt } = await supabase
        .from('finance_debts')
        .select('amount, remaining_amount')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      const diff = parsedAmount - (oldDebt ? oldDebt.amount : 0);
      payload.remaining_amount = Math.max(0, (oldDebt ? oldDebt.remaining_amount : 0) + diff);

      const { data, error } = await supabase
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
      const { data, error } = await supabase
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

    const { data: debt, error: fetchErr } = await supabase
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
    const { data: updatedDebt, error: updateErr } = await supabase
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

    const { error: txErr } = await supabase
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

    const { error } = await supabase
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
    const { data: existing } = await supabase
      .from('finance_goals')
      .select('id')
      .eq('user_id', userId)
      .eq('asset_class', asset_class)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('finance_goals')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
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

    // Get key from DB, generate default if missing
    let { data: dbKey } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'sms_ingestion_api_key')
      .maybeSingle();

    if (!dbKey) {
      // Insert default key
      await supabase
        .from('system_settings')
        .insert({ key: 'sms_ingestion_api_key', value: 'FinorSMS_8d2f7a9c3e' });
      dbKey = { value: 'FinorSMS_8d2f7a9c3e' };
    }

    if (apiKeyHeader !== dbKey.value) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key.' });
    }

    const { sender, message, timestamp } = req.body;
    
    // Handle test connection requests
    if (!message || message === 'TEST_CONNECTION' || req.body.test === true) {
      return res.status(200).json({ success: true, message: 'Connection verified successfully.' });
    }

    // 1. Get userId dynamically
    let userId = '56fdfb1f-1068-4120-9e1c-18ef69d837d0'; // Fallback
    const { data: sampleGoal } = await supabase
      .from('finance_goals')
      .select('user_id')
      .limit(1)
      .maybeSingle();
    if (sampleGoal?.user_id) {
      userId = sampleGoal.user_id;
    }

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

    const merchantMatch = message.match(/(?:to|at|from|towards|merchant)\s+([a-zA-Z0-9\s&*]{3,25})/i);
    let description = '';
    if (type === 'EXPENSE') {
      description = merchantMatch ? `UPI to ${merchantMatch[1].trim()}` : `Spent via SMS alert`;
    } else {
      description = merchantMatch ? `Credits from ${merchantMatch[1].trim()}` : `Credits via SMS alert`;
    }

    // Append sender header detail
    description += ` (${sender || 'Unknown'})`;

    const category = autoCategorize(description);
    const txDate = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

    const txDateObj = new Date(txDate);
    const dateStr = txDateObj.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split('/').reverse().join('-');
    const amountStr = parseFloat(amount || 0).toFixed(2);

    const defaultHash = crypto
      .createHash('md5')
      .update(`${userId}_${dateStr}_${type}_${amountStr}_${description}`)
      .digest('hex');

    const stagingPayload = {
      user_id: userId,
      raw_data: {
        date: txDate,
        amount,
        type,
        category,
        method: 'UPI',
        description,
        source: 'SMS'
      },
      raw_data_hash: defaultHash,
      status: 'PENDING'
    };

    const { error: insertError } = await supabase
      .from('staging_transactions')
      .insert(stagingPayload);

    if (insertError && insertError.code !== '23505') {
      throw insertError;
    }

    // Immediately trigger reconciliation
    const { error: reconcileError } = await supabase.rpc('reconcile_staging_transactions');
    if (reconcileError) {
      console.error('[SMSWebhookRoute] Immediate reconciliation failed:', reconcileError.message);
    }

    // Retrieve the processed transaction by its external_ref_id
    const { data: insertedTx } = await supabase
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

    const { data, error } = await supabase
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
async function syncTransactionToDebts(tx) {
  try {
    const userId = tx.user_id;
    const amount = parseFloat(tx.amount);
    
    if (tx.category === 'Lent/Friends') {
      if (tx.type === 'EXPENSE') {
        // 1. Check if debt already exists for this tx
        const noteTag = `tx_id: ${tx.id}`;
        const { data: existing } = await supabase
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
          const { error } = await supabase
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
        const { data: existing } = await supabase
          .from('finance_debts')
          .select('id')
          .eq('user_id', userId)
          .like('notes', `%${noteTag}%`)
          .maybeSingle();

        if (!existing) {
          // Find the oldest active LENT debt for this user
          const { data: activeDebts } = await supabase
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

              const { error } = await supabase
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

export default router;
