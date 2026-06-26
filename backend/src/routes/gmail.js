import express from 'express';
import { google } from 'googleapis';
import { createRequire } from 'module';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const router = express.Router();

// ─── OAuth2 Client Setup ────────────────────────────────────────────────────
const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
};

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// ─── Helpers: Store/Read Refresh Token in Supabase app_settings ─────────────
const saveRefreshToken = async (token) => {
  await supabase.from('app_settings').upsert(
    { key: 'gmail_refresh_token', value: token, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
};

const getRefreshToken = async () => {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gmail_refresh_token')
    .single();
  return data?.value || null;
};

const getAuthorizedClient = async () => {
  const token = await getRefreshToken();
  if (!token) return null;
  const auth = getOAuth2Client();
  auth.setCredentials({ refresh_token: token });
  return auth;
};

// ─── GET /api/gmail/status ───────────────────────────────────────────────────
// Check if Gmail is connected
router.get('/status', requireAuth, async (req, res) => {
  try {
    const token = await getRefreshToken();
    if (!token) return res.json({ connected: false });

    const auth = getOAuth2Client();
    auth.setCredentials({ refresh_token: token });
    const gmail = google.gmail({ version: 'v1', auth });
    await gmail.users.getProfile({ userId: 'me' });

    res.json({ connected: true, email: process.env.GMAIL_USER });
  } catch {
    res.json({ connected: false });
  }
});

// ─── GET /api/gmail/auth ─────────────────────────────────────────────────────
// Start OAuth flow — redirect to Google
router.get('/auth', (req, res) => {
  const auth = getOAuth2Client();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });
  res.redirect(url);
});

// ─── GET /api/gmail/callback ─────────────────────────────────────────────────
// Google redirects here after user grants permission
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No auth code received');

  try {
    const auth = getOAuth2Client();
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) {
      return res.status(400).send('No refresh token received. Please revoke access and try again.');
    }

    await saveRefreshToken(tokens.refresh_token);

    // Redirect back to the frontend with success flag
    const frontendUrl = process.env.FRONTEND_URL || 'https://finor-v6.vercel.app';
    res.redirect(`${frontendUrl}?gmail_connected=true`);
  } catch (err) {
    console.error('Gmail OAuth callback error:', err);
    res.status(500).send('Failed to complete Gmail authentication: ' + err.message);
  }
});

// ─── PDF Parser: Extract Trades from Zerodha Contract Note ───────────────────
const parseZerodhaContractNote = (pdfText, tradeDateHint) => {
  const trades = [];
  const lines = pdfText.split('\n').map(l => l.trim()).filter(Boolean);

  // Zerodha contract note structure:
  // Lines often contain: SYMBOL B/S QTY PRICE ...
  // We look for recognizable patterns

  // Pattern 1: Lines matching "NSE EQ SYMBOL" or just "SYMBOL" followed by B/S/Buy/Sell
  // Pattern 2: Table rows with stock info

  // Extract date from PDF text if not provided
  let tradeDate = tradeDateHint;
  if (!tradeDate) {
    const dateMatch = pdfText.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
    if (dateMatch) {
      const parts = dateMatch[1].split(/[\/\-]/);
      if (parts[2].length === 4) {
        tradeDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
      }
    }
  }

  // Look for trade rows — Zerodha contract note PDF text pattern:
  // After text extraction, rows often appear as:
  // "[Trade#] [Order#] [Time] [Symbol] [B/S] [Qty] [Price] ..."
  // We use a broad regex to capture symbol + B/S + qty + price

  // Regex: word(s) as symbol, B or S, number as qty, decimal as price
  const tradeRowRegex = /([A-Z][A-Z0-9\s\-&]{1,30}?)\s+(B|S|BUY|SELL)\s+(\d+)\s+([\d,]+\.?\d*)/gi;

  let match;
  const rawText = pdfText.replace(/\n/g, ' ');

  while ((match = tradeRowRegex.exec(rawText)) !== null) {
    const symbol = match[1].trim().toUpperCase()
      .replace(/^NSE\s+EQ\s+/i, '')   // Remove "NSE EQ" prefix
      .replace(/^BSE\s+EQ\s+/i, '')   // Remove "BSE EQ" prefix  
      .replace(/\s+/g, '_')            // Replace spaces with underscore
      .substring(0, 30);               // Max 30 chars

    const tradeType = (match[2].toUpperCase() === 'B' || match[2].toUpperCase() === 'BUY') ? 'BUY' : 'SELL';
    const quantity = parseInt(match[3].replace(/,/g, ''));
    const price = parseFloat(match[4].replace(/,/g, ''));

    // Filter out obvious non-trade rows (headers, totals, etc.)
    if (
      quantity > 0 &&
      price > 0.5 &&
      price < 1000000 &&
      symbol.length >= 2 &&
      !symbol.includes('TRADE') &&
      !symbol.includes('ORDER') &&
      !symbol.includes('GROSS') &&
      !symbol.includes('NET') &&
      !symbol.includes('TOTAL') &&
      !symbol.includes('TAX') &&
      !symbol.includes('BROKERAGE')
    ) {
      trades.push({
        stock_symbol: symbol,
        trade_type: tradeType,
        quantity,
        price,
        trade_date: tradeDate || new Date().toISOString().split('T')[0]
      });
    }
  }

  // Deduplicate (same symbol + type + qty + price)
  const seen = new Set();
  return trades.filter(t => {
    const key = `${t.stock_symbol}-${t.trade_type}-${t.quantity}-${t.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ─── Extract trade date from email subject ────────────────────────────────────
const extractDateFromSubject = (subject) => {
  // "Contract Note for UPC038 – June 25, 2026"
  // "Contract Note - 25-06-2026"
  const monthNames = {
    january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
    july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'
  };

  // Format: "June 25, 2026"
  const longMatch = subject.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (longMatch) {
    const month = monthNames[longMatch[1].toLowerCase()];
    if (month) {
      return `${longMatch[3]}-${month}-${longMatch[2].padStart(2,'0')}`;
    }
  }

  // Format: "25-06-2026" or "25/06/2026"
  const shortMatch = subject.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (shortMatch) {
    return `${shortMatch[3]}-${shortMatch[2]}-${shortMatch[1]}`;
  }

  return null;
};

// ─── Insert trades via the same recalculation logic as CSV upload ─────────────
const recalculateHoldingsForUser = async (userId) => {
  // Fetch all trades sorted by date
  const { data: allTrades } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('trade_date', { ascending: true });

  if (!allTrades || allTrades.length === 0) return;

  // Group by symbol
  const symbolMap = {};
  for (const trade of allTrades) {
    const sym = trade.stock_symbol;
    if (!symbolMap[sym]) symbolMap[sym] = [];
    symbolMap[sym].push(trade);
  }

  // Delete existing holdings for user
  await supabase.from('holdings').delete().eq('user_id', userId);

  const holdingsToInsert = [];
  for (const [symbol, trades] of Object.entries(symbolMap)) {
    let qty = 0;
    let totalCost = 0;

    for (const t of trades) {
      if (t.trade_type === 'BUY') {
        totalCost += t.quantity * t.price;
        qty += t.quantity;
      } else {
        const avgBuy = qty > 0 ? totalCost / qty : 0;
        totalCost -= avgBuy * Math.min(t.quantity, qty);
        qty = Math.max(0, qty - t.quantity);
      }
    }

    if (qty > 0) {
      holdingsToInsert.push({
        user_id: userId,
        stock_symbol: symbol,
        stock_name: symbol,
        average_buy_price: qty > 0 ? totalCost / qty : 0,
        quantity: qty,
        last_updated: new Date().toISOString()
      });
    }
  }

  if (holdingsToInsert.length > 0) {
    await supabase.from('holdings').upsert(holdingsToInsert, { onConflict: 'user_id,stock_symbol' });
  }
};

// ─── POST /api/gmail/sync ─────────────────────────────────────────────────────
// Fetch unread Zerodha contract notes, parse, insert trades
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const auth = await getAuthorizedClient();
    if (!auth) {
      return res.status(401).json({
        error: 'Gmail not connected. Please connect your Gmail account first.',
        needsConnection: true
      });
    }

    const gmail = google.gmail({ version: 'v1', auth });
    const userId = req.user.id;

    // Search broadly — catches both direct Zerodha emails AND forwarded contract notes
    const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    const searchQuery = `subject:"contract note" after:${ninetyDaysAgo}`;

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: searchQuery,
      maxResults: 50
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) {
      // Try even broader search as fallback
      const fallbackRes = await gmail.users.messages.list({
        userId: 'me',
        q: `subject:contract after:${ninetyDaysAgo}`,
        maxResults: 50
      });
      const fallbackMsgs = fallbackRes.data.messages || [];
      if (fallbackMsgs.length === 0) {
        return res.json({ message: 'No contract note emails found in the last 90 days. Make sure emails are forwarded to finorvtrades@gmail.com.', newTrades: 0, emailsFound: 0 });
      }
      messages.push(...fallbackMsgs);
    }

    let totalNewTrades = 0;
    const processedEmails = [];

    for (const msg of messages) {
      try {
        const fullMsg = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });

        const headers = fullMsg.data.payload.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const dateHeader = headers.find(h => h.name === 'Date')?.value || '';

        // Skip if not a contract note
        if (!subject.toLowerCase().includes('contract note')) continue;

        // Check if we've already processed this email
        const { data: existingLog } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', `gmail_processed_${msg.id}`)
          .single();

        if (existingLog) continue; // Already processed

        // Extract trade date from subject
        const tradeDate = extractDateFromSubject(subject) ||
          new Date(dateHeader).toISOString().split('T')[0];

        // Find PDF attachment
        const parts = fullMsg.data.payload.parts || [];
        let parsedTrades = [];

        // Process all parts recursively to find PDF
        const findAttachments = (parts) => {
          const attachments = [];
          for (const part of parts) {
            if (part.parts) attachments.push(...findAttachments(part.parts));
            if (part.filename && (
              part.mimeType === 'application/pdf' ||
              part.filename.toLowerCase().endsWith('.pdf')
            )) {
              attachments.push(part);
            }
          }
          return attachments;
        };

        const pdfParts = findAttachments(parts);

        for (const pdfPart of pdfParts) {
          try {
            let pdfData;

            if (pdfPart.body?.attachmentId) {
              const attachment = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: msg.id,
                id: pdfPart.body.attachmentId
              });
              const base64Data = attachment.data.data.replace(/-/g, '+').replace(/_/g, '/');
              pdfData = Buffer.from(base64Data, 'base64');
            } else if (pdfPart.body?.data) {
              const base64Data = pdfPart.body.data.replace(/-/g, '+').replace(/_/g, '/');
              pdfData = Buffer.from(base64Data, 'base64');
            }

            if (pdfData) {
              const pdfResult = await pdf(pdfData);
              const trades = parseZerodhaContractNote(pdfResult.text, tradeDate);
              parsedTrades.push(...trades);
            }
          } catch (pdfErr) {
            console.error('PDF parse error for part:', pdfErr.message);
          }
        }

        // Insert new trades into database
        let emailNewTrades = 0;
        for (const trade of parsedTrades) {
          // Check if this trade already exists (same symbol + type + qty + price + date)
          const { data: existing } = await supabase
            .from('trades')
            .select('id')
            .eq('user_id', userId)
            .eq('stock_symbol', trade.stock_symbol)
            .eq('trade_type', trade.trade_type)
            .eq('quantity', trade.quantity)
            .eq('price', trade.price)
            .eq('trade_date', trade.trade_date)
            .single();

          if (!existing) {
            await supabase.from('trades').insert({
              user_id: userId,
              stock_symbol: trade.stock_symbol,
              stock_name: trade.stock_symbol,
              trade_type: trade.trade_type,
              quantity: trade.quantity,
              price: trade.price,
              trade_date: trade.trade_date,
              order_id: `GMAIL_${msg.id}_${trade.stock_symbol}`,
              created_at: new Date().toISOString()
            });
            emailNewTrades++;
          }
        }

        // Mark this email as processed
        await supabase.from('app_settings').upsert(
          { key: `gmail_processed_${msg.id}`, value: tradeDate, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );

        totalNewTrades += emailNewTrades;
        processedEmails.push({ subject, tradeDate, tradesFound: parsedTrades.length, tradesAdded: emailNewTrades });

      } catch (msgErr) {
        console.error('Error processing message:', msg.id, msgErr.message);
      }
    }

    // Recalculate holdings if any new trades were added
    if (totalNewTrades > 0) {
      await recalculateHoldingsForUser(userId);

      // Update last sync timestamp
      await supabase.from('app_settings').upsert(
        { key: 'gmail_last_sync', value: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    }

    res.json({
      message: totalNewTrades > 0
        ? `✅ Synced ${totalNewTrades} new trade(s) from ${processedEmails.length} email(s)`
        : `📭 All ${processedEmails.length} email(s) already synced — no new trades found.`,
      newTrades: totalNewTrades,
      emailsFound: messages.length,
      emailsProcessed: processedEmails.length,
      details: processedEmails
    });

  } catch (err) {
    console.error('Gmail sync error:', err);
    res.status(500).json({ error: 'Gmail sync failed: ' + err.message });
  }
});

// ─── GET /api/gmail/last-sync ─────────────────────────────────────────────────
router.get('/last-sync', requireAuth, async (req, res) => {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gmail_last_sync')
    .single();
  res.json({ lastSync: data?.value || null });
});

export default router;
