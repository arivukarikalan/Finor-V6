import express from 'express';
import crypto from 'crypto';
import { google } from 'googleapis';
import { createRequire } from 'module';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { encryptText, decryptText } from '../utils/encryption.js';

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
const saveRefreshToken = async (userId, token, email = null) => {
  const encryptedToken = encryptText(token);
  const updatePayload = { gmail_refresh_token: encryptedToken };
  if (email) {
    updatePayload.gmail_connected_email = email;
  }
  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId);

  if (error) {
    console.error('Error saving Gmail refresh token:', error.message);
    throw error;
  }
  console.log(`Gmail refresh token saved for user ${userId}`);
};

const getRefreshToken = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('gmail_refresh_token')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error reading user refresh token:', error.message);
    throw error;
  }
  return decryptText(data?.gmail_refresh_token) || null;
};

const getAuthorizedClient = async (userId) => {
  const token = await getRefreshToken(userId);
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
    const token = await getRefreshToken(req.user.id);
    if (!token) return res.json({ connected: false });

    const auth = getOAuth2Client();
    auth.setCredentials({ refresh_token: token });
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('gmail_connected_email')
      .eq('id', req.user.id)
      .maybeSingle();

    res.json({ 
      connected: true, 
      email: profile?.gmail_connected_email || 'Connected Gmail' 
    });
  } catch (err) {
    console.error('Gmail status error:', err.message);
    res.json({ connected: false });
  }
});

// ─── GET /api/gmail/auth ─────────────────────────────────────────────────────
router.get('/auth', (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).send('Missing userId query parameter for state mapping.');
  }

  const auth = getOAuth2Client();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',   // Always request refresh token
    scope: SCOPES,
    state: userId as string
  });
  res.redirect(url);
});

// ─── GET /api/gmail/callback ─────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state: userId, error: oauthError } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://finor-v6.vercel.app';

  if (oauthError) {
    return res.redirect(`${frontendUrl}?gmail_error=${oauthError}`);
  }
  if (!code) {
    return res.redirect(`${frontendUrl}?gmail_error=no_code`);
  }
  if (!userId) {
    return res.redirect(`${frontendUrl}?gmail_error=no_user_context`);
  }

  try {
    const auth = getOAuth2Client();
    const { tokens } = await auth.getToken(code as string);

    if (tokens.refresh_token) {
      // Resolve connected Gmail address to store in profile
      auth.setCredentials({ refresh_token: tokens.refresh_token });
      const gmail = google.gmail({ version: 'v1', auth });
      const gmailProfile = await gmail.users.getProfile({ userId: 'me' });
      const connectedEmail = gmailProfile.data.emailAddress || null;

      // Save token scoped to this user
      await saveRefreshToken(userId, tokens.refresh_token, connectedEmail);
      console.log(`Gmail refresh token saved for user context ${userId}`);
    } else {
      // No new refresh token — check if we already have one saved
      const existingToken = await getRefreshToken(userId);
      if (!existingToken) {
        console.error('No refresh token received and none stored for user context:', userId);
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

  const rawText = pdfText.replace(/\n/g, ' ');

  // Regex 1: Annexure style (highly specific and matches the exact executions table)
  // Matches: SYMBOL-EQ/ISIN or SYMBOL/ISIN followed by B/S, Exchange (NSE/BSE), Qty, Brokerage, Net Price
  // Example: HAL-EQ/INE066F01020   S   NSE   3   0.0000   4490.40
  const annexureRegex = /([A-Z0-9\-&]+)(?:-EQ|-BE)?\/[A-Z0-9]+\s+(B|S|BUY|SELL)\s+(NSE|BSE)\s+(\d+)\s+[\d\.]+\s+([\d\.,]+)/gi;
  
  // Regex 2: Fallback broad table matching
  const fallbackRegex = /([A-Z0-9\-&]+)\s+(B|S|BUY|SELL)\s+(NSE|BSE)\s+(\d+)\s+[\d\.]+\s+([\d\.,]+)/gi;

  // Regex 3: Legacy match rules
  const legacyRegex = /([A-Z][A-Z0-9\s\-&]{1,30}?)\s+(B|S|BUY|SELL)\s+(\d+)\s+([\d,]+\.?\d*)/gi;

  let match;
  
  // Try Regex 1 (Annexure)
  while ((match = annexureRegex.exec(rawText)) !== null) {
    const rawSymbol = match[1].trim().toUpperCase();
    const symbol = rawSymbol.split('-')[0]; // Extract "HAL" from "HAL-EQ"
    const typeChar = match[2].toUpperCase();
    const tradeType = (typeChar === 'B' || typeChar === 'BUY') ? 'BUY' : 'SELL';
    const quantity = parseInt(match[4].replace(/,/g, ''));
    const price = parseFloat(match[5].replace(/,/g, ''));

    if (quantity > 0 && price > 0.5) {
      trades.push({
        stock_symbol: symbol,
        trade_type: tradeType,
        quantity,
        price,
        trade_date: tradeDate || new Date().toISOString().split('T')[0]
      });
    }
  }

  // Try Regex 2 (Fallback)
  if (trades.length === 0) {
    while ((match = fallbackRegex.exec(rawText)) !== null) {
      const symbol = match[1].trim().toUpperCase().split('-')[0];
      const typeChar = match[2].toUpperCase();
      const tradeType = (typeChar === 'B' || typeChar === 'BUY') ? 'BUY' : 'SELL';
      const quantity = parseInt(match[4].replace(/,/g, ''));
      const price = parseFloat(match[5].replace(/,/g, ''));

      if (quantity > 0 && price > 0.5) {
        trades.push({
          stock_symbol: symbol,
          trade_type: tradeType,
          quantity,
          price,
          trade_date: tradeDate || new Date().toISOString().split('T')[0]
        });
      }
    }
  }

  // Try Regex 3 (Legacy)
  if (trades.length === 0) {
    const excluded = ['TRADE','ORDER','GROSS','NET','TOTAL','TAX','BROKERAGE','AMOUNT','RATE','QUANTITY','PRICE','EQUITY','DEBIT','CREDIT'];
    while ((match = legacyRegex.exec(rawText)) !== null) {
      const symbol = match[1].trim().toUpperCase()
        .replace(/^NSE\s+EQ\s+/i, '')
        .replace(/^BSE\s+EQ\s+/i, '')
        .replace(/\s+/g, '_')
        .substring(0, 30);

      const typeChar = match[2].toUpperCase();
      const tradeType = (typeChar === 'B' || typeChar === 'BUY') ? 'BUY' : 'SELL';
      const quantity = parseInt(match[3].replace(/,/g, ''));
      const price = parseFloat(match[4].replace(/,/g, ''));

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
    const auth = await getAuthorizedClient(req.user.id);
    if (!auth) {
      return res.status(401).json({
        error: 'Gmail not connected. Please connect your Gmail account first.',
        needsConnection: true
      });
    }

    const gmail = google.gmail({ version: 'v1', auth });
    const userId = req.user.id;

    // Retrieve user-specific PAN password for PDF contract note decryption
    const { data: profile } = await supabase
      .from('profiles')
      .select('zerodha_pdf_password')
      .eq('id', userId)
      .maybeSingle();

    const pdfPassword = profile?.zerodha_pdf_password || process.env.ZERODHA_PDF_PASSWORD || '';

    // Dynamic search duration: limit to custom range (default 30, max 30)
    const daysParam = parseInt(req.body.days || req.query.days || 30);
    const syncDays = Math.min(30, Math.max(1, daysParam));
    const syncTimeAgo = Math.floor((Date.now() - syncDays * 24 * 60 * 60 * 1000) / 1000);
    
    let messages = [];

    const searches = [
      `subject:"contract note" after:${syncTimeAgo}`,
      `subject:"equity contract" after:${syncTimeAgo}`,
      `subject:UPC after:${syncTimeAgo}`,
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

        // Check if we've already processed this email
        const { data: existingLog } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', `gmail_processed_${msg.id}`)
          .maybeSingle();

        const tradeDate = extractDateFromSubject(subject) || new Date(dateHeader).toISOString().split('T')[0];

        if (existingLog) {
          processedEmails.push({
            subject,
            tradeDate,
            status: 'Already Synced',
            tradesFound: 0,
            tradesAdded: 0,
            trades: []
          });
          continue;
        }

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
              let pdfText = await extractPdfText(pdfData, pdfPassword);
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
        const tradeLogs = [];

        for (const trade of parsedTrades) {
          const txDateStr = new Date(trade.trade_date).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).split('/').reverse().join('-');
          const amountStr = parseFloat(trade.price || 0).toFixed(2);

          const defaultHash = crypto
            .createHash('md5')
            .update(`${userId}_${trade.stock_symbol}_${txDateStr}_${trade.trade_type}_${trade.quantity}_${amountStr}`)
            .digest('hex');

          const stagingPayload = {
            user_id: userId,
            raw_data: {
              stock_symbol: trade.stock_symbol,
              trade_date: trade.trade_date,
              trade_type: trade.trade_type,
              quantity: trade.quantity,
              price: trade.price,
              order_id: `GMAIL_${msg.id}_${trade.stock_symbol}`
            },
            raw_data_hash: defaultHash,
            status: 'PENDING'
          };

          const { error: insertError } = await supabase
            .from('staging_trades')
            .insert(stagingPayload);

          if (!insertError) {
            emailNewTrades++;
            tradeLogs.push({ ...trade, status: 'Synced (Staged)' });
          } else if (insertError.code === '23505') {
            tradeLogs.push({ ...trade, status: 'Duplicate' });
          } else {
            console.error('[GmailIngestion] Staging insert error:', insertError.message);
            tradeLogs.push({ ...trade, status: 'Failed', error: insertError.message });
          }
        }

        // Reconcile and import newly staged trades immediately
        if (emailNewTrades > 0) {
          const { error: rErr } = await supabase.rpc('reconcile_staging_trades');
          if (rErr) console.error('[GmailIngestion] Immediate reconciliation failed:', rErr.message);
        }

        // Mark email as processed
        await supabase.from('system_settings').upsert(
          { key: `gmail_processed_${msg.id}`, value: tradeDate },
          { onConflict: 'key' }
        );

        totalNewTrades += emailNewTrades;
        processedEmails.push({
          subject,
          tradeDate,
          status: 'Processed',
          tradesFound: parsedTrades.length,
          tradesAdded: emailNewTrades,
          trades: tradeLogs
        });

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
        ? `✅ Synced ${totalNewTrades} new trade(s) from ${processedEmails.filter(e => e.status === 'Processed').length} email(s)`
        : `📭 Checked ${processedEmails.length} email(s) — all already synced or no trades parsed.`,
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

