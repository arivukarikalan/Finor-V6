import express from 'express';
import { google } from 'googleapis';
import { createRequire } from 'module';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/build/pdf.js');

const router = express.Router();

// Zerodha PDF password = investor's PAN number (stored in env var)
const PDF_PASSWORD = process.env.ZERODHA_PDF_PASSWORD || '';

// ─── OAuth2 Client Setup ────────────────────────────────────────────────────
const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
};

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// ─── Helpers: Store/Read Refresh Token ───────────────────────────────────────
const saveRefreshToken = async (token) => {
  const { data: existing, error: selectError } = await supabase
    .from('system_settings')
    .select('key')
    .eq('key', 'gmail_refresh_token')
    .maybeSingle();

  if (selectError) {
    console.error('Error checking existing refresh token:', selectError.message);
    throw selectError;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('system_settings')
      .update({ value: token })
      .eq('key', 'gmail_refresh_token');
    if (updateError) {
      console.error('Error updating refresh token:', updateError.message);
      throw updateError;
    }
    console.log('Refresh token UPDATED in DB');
  } else {
    const { error: insertError } = await supabase
      .from('system_settings')
      .insert({ key: 'gmail_refresh_token', value: token });
    if (insertError) {
      console.error('Error inserting refresh token:', insertError.message);
      throw insertError;
    }
    console.log('Refresh token INSERTED in DB');
  }
};

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

const getAuthorizedClient = async () => {
  const token = await getRefreshToken();
  if (!token) return null;
  const auth = getOAuth2Client();
  auth.setCredentials({ refresh_token: token });
  return auth;
};

// ─── Extract Text from Password-Protected PDF (pdfjs-dist) ───────────────────
const extractPdfText = async (pdfBuffer, password) => {
  try {
    const uint8Array = new Uint8Array(pdfBuffer);
    const loadingTaskOptions = { data: uint8Array };
    if (password) loadingTaskOptions.password = password;

    const loadingTask = pdfjsLib.getDocument(loadingTaskOptions);
    const pdfDoc = await loadingTask.promise;

    let fullText = '';
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  } catch (err) {
    console.error('PDF extraction error:', err.message);
    return null;
  }
};

// ─── GET /api/gmail/status ───────────────────────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  try {
    const token = await getRefreshToken();
    if (!token) return res.json({ connected: false });

    const auth = getOAuth2Client();
    auth.setCredentials({ refresh_token: token });
    const gmail = google.gmail({ version: 'v1', auth });
    await gmail.users.getProfile({ userId: 'me' });

    res.json({ connected: true, email: process.env.GMAIL_USER });
  } catch (err) {
    console.error('Gmail status error:', err.message);
    res.json({ connected: false });
  }
});

// ─── GET /api/gmail/auth ─────────────────────────────────────────────────────
router.get('/auth', (req, res) => {
  const auth = getOAuth2Client();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',   // Always request refresh token
    scope: SCOPES
  });
  res.redirect(url);
});

// ─── GET /api/gmail/callback ─────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, error: oauthError } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://finor-v6.vercel.app';

  if (oauthError) {
    return res.redirect(`${frontendUrl}?gmail_error=${oauthError}`);
  }
  if (!code) {
    return res.redirect(`${frontendUrl}?gmail_error=no_code`);
  }

  try {
    const auth = getOAuth2Client();
    const { tokens } = await auth.getToken(code);

    if (tokens.refresh_token) {
      // Got a new refresh token — save it
      await saveRefreshToken(tokens.refresh_token);
      console.log('Gmail refresh token saved successfully');
    } else {
      // No new refresh token — check if we already have one saved
      const existingToken = await getRefreshToken();
      if (!existingToken) {
        // No token at all — user needs to revoke and re-authorize
        console.error('No refresh token received and none stored');
        return res.redirect(`${frontendUrl}?gmail_error=no_refresh_token`);
      }
      console.log('Using existing refresh token (no new one issued)');
    }

    res.redirect(`${frontendUrl}?gmail_connected=true`);
  } catch (err) {
    console.error('Gmail OAuth callback error:', err.message);
    res.redirect(`${frontendUrl}?gmail_error=${encodeURIComponent(err.message)}`);
  }
});

// ─── PDF Parser: Extract Trades from Zerodha Contract Note ───────────────────
const parseZerodhaContractNote = (pdfText, tradeDateHint) => {
  const trades = [];
  let tradeDate = tradeDateHint;

  if (!tradeDate) {
    const dateMatch = pdfText.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
    if (dateMatch) {
      const parts = dateMatch[1].split(/[\/\-]/);
      if (parts[2]?.length === 4) {
        tradeDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
      }
    }
  }

  // Zerodha contract note trade row pattern
  // Matches: SYMBOL  B/S  QTY  PRICE
  const rawText = pdfText.replace(/\n/g, ' ');
  const tradeRowRegex = /([A-Z][A-Z0-9\s\-&]{1,30}?)\s+(B|S|BUY|SELL)\s+(\d+)\s+([\d,]+\.?\d*)/gi;

  let match;
  while ((match = tradeRowRegex.exec(rawText)) !== null) {
    const symbol = match[1].trim().toUpperCase()
      .replace(/^NSE\s+EQ\s+/i, '')
      .replace(/^BSE\s+EQ\s+/i, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);

    const tradeType = (match[2].toUpperCase() === 'B' || match[2].toUpperCase() === 'BUY') ? 'BUY' : 'SELL';
    const quantity = parseInt(match[3].replace(/,/g, ''));
    const price = parseFloat(match[4].replace(/,/g, ''));

    const excluded = ['TRADE','ORDER','GROSS','NET','TOTAL','TAX','BROKERAGE','AMOUNT','RATE','QUANTITY','PRICE','EQUITY','DEBIT','CREDIT'];
    const isExcluded = excluded.some(ex => symbol.includes(ex));

    if (quantity > 0 && price > 0.5 && price < 1000000 && symbol.length >= 2 && !isExcluded) {
      trades.push({
        stock_symbol: symbol,
        trade_type: tradeType,
        quantity,
        price,
        trade_date: tradeDate || new Date().toISOString().split('T')[0]
      });
    }
  }

  // Deduplicate
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
  const monthNames = {
    january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
    july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'
  };

  const longMatch = subject.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (longMatch) {
    const month = monthNames[longMatch[1].toLowerCase()];
    if (month) return `${longMatch[3]}-${month}-${longMatch[2].padStart(2,'0')}`;
  }

  const shortMatch = subject.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (shortMatch) return `${shortMatch[3]}-${shortMatch[2]}-${shortMatch[1]}`;

  return null;
};

// ─── Recalculate Holdings ─────────────────────────────────────────────────────
const recalculateHoldingsForUser = async (userId) => {
  const { data: allTrades } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('trade_date', { ascending: true });

  if (!allTrades || allTrades.length === 0) return;

  const symbolMap = {};
  for (const trade of allTrades) {
    const sym = trade.stock_symbol;
    if (!symbolMap[sym]) symbolMap[sym] = [];
    symbolMap[sym].push(trade);
  }

  await supabase.from('holdings').delete().eq('user_id', userId);

  const holdingsToInsert = [];
  for (const [symbol, trades] of Object.entries(symbolMap)) {
    let qty = 0, totalCost = 0;
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

    // Broad search — catches both direct Zerodha emails AND forwarded ones
    const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    let messages = [];

    const searches = [
      `subject:"contract note" after:${ninetyDaysAgo}`,
      `subject:"equity contract" after:${ninetyDaysAgo}`,
      `subject:UPC after:${ninetyDaysAgo}`,
    ];

    for (const q of searches) {
      const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 30 });
      const msgs = listRes.data.messages || [];
      for (const m of msgs) {
        if (!messages.find(existing => existing.id === m.id)) {
          messages.push(m);
        }
      }
    }

    if (messages.length === 0) {
      return res.json({
        message: 'No contract note emails found in the last 90 days. Check if emails are forwarded to finorvtrades@gmail.com.',
        newTrades: 0,
        emailsFound: 0
      });
    }

    let totalNewTrades = 0;
    const processedEmails = [];

    for (const msg of messages) {
      try {
        const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
        const headers = fullMsg.data.payload.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const dateHeader = headers.find(h => h.name === 'Date')?.value || '';

        // Skip non-contract-note emails
        const subjectLower = subject.toLowerCase();
        if (!subjectLower.includes('contract note') && !subjectLower.includes('upc0')) continue;

        // Skip already processed
        const { data: existingLog } = await supabase
          .from('system_settings').select('value').eq('key', `gmail_processed_${msg.id}`).maybeSingle();
        if (existingLog) continue;

        const tradeDate = extractDateFromSubject(subject) || new Date(dateHeader).toISOString().split('T')[0];

        // Find PDF attachments recursively
        const findAttachments = (parts) => {
          const attachments = [];
          for (const part of (parts || [])) {
            if (part.parts) attachments.push(...findAttachments(part.parts));
            if (part.filename && (part.mimeType === 'application/pdf' || part.filename.toLowerCase().endsWith('.pdf'))) {
              attachments.push(part);
            }
          }
          return attachments;
        };

        const pdfParts = findAttachments(fullMsg.data.payload.parts || []);
        let parsedTrades = [];

        for (const pdfPart of pdfParts) {
          try {
            let pdfData;
            if (pdfPart.body?.attachmentId) {
              const attachment = await gmail.users.messages.attachments.get({
                userId: 'me', messageId: msg.id, id: pdfPart.body.attachmentId
              });
              const b64 = attachment.data.data.replace(/-/g, '+').replace(/_/g, '/');
              pdfData = Buffer.from(b64, 'base64');
            } else if (pdfPart.body?.data) {
              const b64 = pdfPart.body.data.replace(/-/g, '+').replace(/_/g, '/');
              pdfData = Buffer.from(b64, 'base64');
            }

            if (pdfData) {
              // Try with password first (Zerodha uses PAN as password)
              let pdfText = await extractPdfText(pdfData, PDF_PASSWORD);
              // If failed or empty, try without password
              if (!pdfText || pdfText.trim().length < 50) {
                pdfText = await extractPdfText(pdfData, '');
              }
              if (pdfText) {
                const trades = parseZerodhaContractNote(pdfText, tradeDate);
                parsedTrades.push(...trades);
                console.log(`Parsed ${trades.length} trades from PDF (${pdfPart.filename}), date: ${tradeDate}`);
              }
            }
          } catch (pdfErr) {
            console.error('PDF processing error:', pdfErr.message);
          }
        }

        // Insert new trades
        let emailNewTrades = 0;
        for (const trade of parsedTrades) {
          const { data: existing } = await supabase
            .from('trades').select('id')
            .eq('user_id', userId)
            .eq('stock_symbol', trade.stock_symbol)
            .eq('trade_type', trade.trade_type)
            .eq('quantity', trade.quantity)
            .eq('price', trade.price)
            .eq('trade_date', trade.trade_date)
            .maybeSingle();

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

        // Mark email as processed
        await supabase.from('system_settings').upsert(
          { key: `gmail_processed_${msg.id}`, value: tradeDate },
          { onConflict: 'key' }
        );

        totalNewTrades += emailNewTrades;
        processedEmails.push({ subject, tradeDate, tradesFound: parsedTrades.length, tradesAdded: emailNewTrades });

      } catch (msgErr) {
        console.error('Error processing message:', msg.id, msgErr.message);
      }
    }

    // Recalculate holdings if trades were added
    if (totalNewTrades > 0) {
      await recalculateHoldingsForUser(userId);
      await supabase.from('system_settings').upsert(
        { key: 'gmail_last_sync', value: new Date().toISOString() },
        { onConflict: 'key' }
      );
    }

    res.json({
      message: totalNewTrades > 0
        ? `✅ Synced ${totalNewTrades} new trade(s) from ${processedEmails.length} email(s)`
        : `📭 ${processedEmails.length} email(s) found — all already synced or no trades parsed.`,
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
  const { data } = await supabase.from('system_settings').select('value').eq('key', 'gmail_last_sync').maybeSingle();
  res.json({ lastSync: data?.value || null });
});

export default router;

