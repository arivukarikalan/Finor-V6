import express from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { google } from 'googleapis';
import { fetchLTPYahoo } from '../services/yahooFinance.js';

const router = express.Router();

// Helper to get OAuth client for Gmail Pull
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
}

// Read refresh token from DB
const getRefreshToken = async () => {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'gmail_refresh_token')
    .maybeSingle();
  if (error) {
    console.error('Error reading refresh token:', error.message);
    throw error;
  }
  return data?.value || null;
};

// Retrieve authorized Gmail client
const getAuthorizedClient = async () => {
  const token = await getRefreshToken();
  if (!token) return null;
  const auth = getOAuth2Client();
  auth.setCredentials({ refresh_token: token });
  return auth;
};

// Get body text recursively from message payload parts
function getBodyText(payload) {
  let body = '';
  if (payload.body && payload.body.data) {
    const b64 = payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
    body = Buffer.from(b64, 'base64').toString('utf8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      body += getBodyText(part);
    }
  }
  return body;
}

// Smart keyword mapping to auto-categorize transaction alerts
function autoCategorize(description) {
  const desc = (description || '').toLowerCase();
  
  if (desc.includes('zomato') || desc.includes('swiggy') || desc.includes('food') || desc.includes('restaurant') || desc.includes('eat') || desc.includes('cafe') || desc.includes('dominos') || desc.includes('pizza') || desc.includes('dhaba') || desc.includes('bakery')) {
    return 'Food';
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

    // 6. Manage SMS Webhook configuration
    let smsSecret = '';
    try {
      const { data: configData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'sms_webhook_config')
        .maybeSingle();

      if (!configData) {
        // Automatically provision a unique secret
        const randomSecret = 'finor_sms_' + Math.random().toString(36).substring(2, 15);
        const newConfig = { secret: randomSecret, user_id: userId };
        await supabase
          .from('system_settings')
          .insert({ key: 'sms_webhook_config', value: JSON.stringify(newConfig) });
        smsSecret = randomSecret;
      } else {
        const config = typeof configData.value === 'string' ? JSON.parse(configData.value) : configData.value;
        smsSecret = config.secret;
      }
    } catch (e) {
      console.warn('[FinanceRoute] SMS config initialization failed:', e.message);
    }

    res.json({
      transactions: transactions || [],
      debts: debts || [],
      goals: goals || [],
      smsWebhook: {
        url: `${req.protocol}://${req.get('host')}/api/finance/sms-webhook`,
        secret: smsSecret
      },
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
    const { id, date, amount, type, category, method, description, source } = req.body;

    const payload = {
      user_id: userId,
      date: date || new Date().toISOString(),
      amount: parseFloat(amount),
      type,
      category: category || 'Uncategorized',
      method: method || 'Cash',
      description,
      source: source || 'MANUAL'
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
      // Insert
      const { data, error } = await supabase
        .from('finance_transactions')
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) throw error;
      result = data;
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

// ─── POST /api/finance/sync-gmail ────────────────────────────────────────────
router.post('/sync-gmail', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const gmail = google.gmail({ version: 'v1', auth: await getAuthorizedClient() });
    
    if (!gmail.context && !gmail.auth) {
      return res.status(400).json({ error: 'Gmail connection missing. Connect your account first.' });
    }

    // Fetch messages from past 30 days (broader sync window)
    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const q = `after:${thirtyDaysAgo} (subject:"debited" OR subject:"credited" OR subject:"transaction alert" OR "google pay" OR "upi" OR "gpay" OR "spent" OR "received" OR "payment")`;

    const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100 });
    const messages = listRes.data.messages || [];

    let countAdded = 0;
    const newTransactions = [];

    for (const msg of messages) {
      try {
        // Check if we've already synced this Gmail message to avoid duplicates
        const refId = `gmail_tx_${msg.id}`;
        const { data: existingTx } = await supabase
          .from('finance_transactions')
          .select('id')
          .eq('external_ref_id', refId)
          .maybeSingle();

        if (existingTx) continue;

        const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
        const payload = fullMsg.data.payload || {};
        const headers = payload.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const dateHeader = headers.find(h => h.name === 'Date')?.value || '';

        const body = getBodyText(payload);
        
        let amount = null;
        let type = null;
        let description = '';

        // Check if transaction is debit or credit
        const textToAnalyze = (subject + ' ' + body).toLowerCase();
        const isDebit = /debit|spent|paid|sent|withdrawn|payment/i.test(textToAnalyze);
        const isCredit = /credit|received|deposited|added|refund/i.test(textToAnalyze);

        // Extract currency amount
        const amtMatch = textToAnalyze.match(/(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{2})?)/i) || 
                         textToAnalyze.match(/(?:amt|amount)\s*(?:of)?\s*(?:rs\.?|inr|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);

        if (amtMatch) {
          amount = parseFloat(amtMatch[1].replace(/,/g, ''));
          type = isCredit ? 'INCOME' : 'EXPENSE'; // Default to expense if not explicitly credit
          
          const merchantMatch = body.match(/(?:to|at|from|towards|merchant)\s+([a-zA-Z0-9\s&*]{3,25})/i);
          if (type === 'EXPENSE') {
            description = merchantMatch ? `UPI to ${merchantMatch[1].trim()}` : `Debit Alert: ${subject}`;
          } else {
            description = merchantMatch ? `Credits from ${merchantMatch[1].trim()}` : `Credit Alert: ${subject}`;
          }
        }

        if (amount && type) {
          const category = autoCategorize(description);
          
          const { data, error } = await supabase
            .from('finance_transactions')
            .insert({
              user_id: userId,
              date: new Date(dateHeader).toISOString(),
              amount,
              type,
              category,
              method: 'UPI',
              description,
              source: 'GMAIL',
              external_ref_id: refId
            })
            .select()
            .maybeSingle();

          if (!error && data) {
            countAdded++;
            newTransactions.push(data);
          }
        }

      } catch (innerErr) {
        console.error(`Error processing Gmail message ${msg.id}:`, innerErr.message);
      }
    }

    res.json({
      message: `Sync complete. Synced ${countAdded} new transactions.`,
      newCount: countAdded,
      transactions: newTransactions
    });

  } catch (err) {
    console.error('[FinanceRoute] Gmail transaction sync failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/finance/sms-webhook ───────────────────────────────────────────
router.post('/sms-webhook', async (req, res) => {
  try {
    const sender = req.body.sender || req.body.from;
    const body = req.body.body || req.body.text;
    const timestamp = req.body.timestamp || req.body.sentStamp || req.body.receivedStamp;
    const secret = req.body.secret;

    if (!secret) return res.status(401).json({ error: 'Missing webhook secret.' });

    // Lookup webhook config in system_settings
    const { data: configData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'sms_webhook_config')
      .maybeSingle();

    const config = configData?.value ? (typeof configData.value === 'string' ? JSON.parse(configData.value) : configData.value) : null;
    
    if (!config || config.secret !== secret) {
      return res.status(401).json({ error: 'Invalid webhook secret.' });
    }

    const userId = config.user_id;

    // Run parse logic on SMS text
    const textToAnalyze = (body || '').toLowerCase();
    const isDebit = /debit|spent|paid|sent|withdrawn|payment/i.test(textToAnalyze);
    const isCredit = /credit|received|deposited|added|refund/i.test(textToAnalyze);

    const amtMatch = textToAnalyze.match(/(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{2})?)/i) || 
                     textToAnalyze.match(/(?:amt|amount)\s*(?:of)?\s*(?:rs\.?|inr|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);

    if (!amtMatch) {
      return res.status(400).json({ error: 'Could not extract amount from SMS.' });
    }

    const amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    const type = isCredit ? 'INCOME' : 'EXPENSE';

    const merchantMatch = (body || '').match(/(?:to|at|from|towards|merchant)\s+([a-zA-Z0-9\s&*]{3,25})/i);
    let description = '';
    if (type === 'EXPENSE') {
      description = merchantMatch ? `UPI to ${merchantMatch[1].trim()}` : `Debit Alert (SMS from ${sender || 'Bank'})`;
    } else {
      description = merchantMatch ? `Credits from ${merchantMatch[1].trim()}` : `Credit Alert (SMS from ${sender || 'Bank'})`;
    }

    const category = autoCategorize(description);

    // Generate a unique ref ID based on a hash of body + timestamp to prevent duplicate imports
    const crypto = await import('crypto');
    const hash = crypto.createHash('md5').update((body || '') + (timestamp || '')).digest('hex');
    const refId = `sms_tx_${hash}`;

    // Check if already synced
    const { data: existing } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('external_ref_id', refId)
      .maybeSingle();

    if (existing) {
      return res.json({ message: 'Transaction already synced.', status: 'DUPLICATE' });
    }

    const { data: newTx, error: txErr } = await supabase
      .from('finance_transactions')
      .insert({
        user_id: userId,
        date: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        amount,
        type,
        category,
        method: 'UPI',
        description,
        source: 'GMAIL', // Store under GMAIL source to satisfy CHECK constraints
        external_ref_id: refId
      })
      .select()
      .maybeSingle();

    if (txErr) throw txErr;

    res.json({ message: 'SMS transaction synced successfully.', transaction: newTx, status: 'SUCCESS' });

  } catch (err) {
    console.error('[SMSWebhook] Failed to process SMS:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
