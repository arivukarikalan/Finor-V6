import express from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { NSE } from 'nse-bse-api';

const router = express.Router();
const nse = new NSE('./tmp_nse_downloads');

async function fetchCorporateActionsFromNSE(symbol) {
  try {
    const actions = await nse.actions({ symbol });
    const meetings = await nse.boardMeetings({ symbol });
    return { actions, meetings };
  } catch (err) {
    console.error(`[NSE API] Failed to fetch for ${symbol}:`, err.message);
    throw err;
  }
}

let yahooCredentials = null;
let lastCredentialsFetch = 0;

async function getYahooCredentials() {
  const now = Date.now();
  if (yahooCredentials && (now - lastCredentialsFetch) < 60 * 60 * 1000) {
    return yahooCredentials;
  }
  
  try {
    const response = await fetch(`https://fc.yahoo.com`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const cookieHeader = response.headers.get('set-cookie');
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(',').map(c => c.split(';')[0].trim()).join('; ');
    
    const crumbResponse = await fetch(`https://query2.finance.yahoo.com/v1/test/getcrumb`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookies
      }
    });
    if (!crumbResponse.ok) return null;
    const crumb = await crumbResponse.text();
    
    yahooCredentials = { cookies, crumb };
    lastCredentialsFetch = now;
    return yahooCredentials;
  } catch (err) {
    console.error('[YahooCredentials] Failed to get cookie/crumb:', err.message);
    return null;
  }
}

async function fetchYahooUpcomingEvents(ticker, credentials) {
  if (!credentials) return null;
  const { cookies, crumb } = credentials;
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents,summaryDetail&crumb=${crumb}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookies
      }
    });
    if (response.ok) {
      const json = await response.json();
      return json?.quoteSummary?.result?.[0];
    }
  } catch (err) {
    console.error(`[YahooEvents] Upcoming fetch failed for ${ticker}:`, err.message);
  }
  return null;
}

function parseNSEActionsAndMeetings(symbol, actions, meetings) {
  const events = [];
  const now = new Date();

  // Parse Actions (Dividends, Splits, Bonuses)
  if (Array.isArray(actions)) {
    actions.forEach(a => {
      const eventDate = new Date(a.exDate);
      if (isNaN(eventDate.getTime())) return;

      const subject = a.subject || '';
      let type = 'General';
      let desc = subject;
      let dateType = 'Ex Date';

      if (subject.toLowerCase().includes('dividend')) {
        type = 'Dividend';
        const divAmtMatch = subject.match(/(?:dividend\s*-\s*Rs\.?\s*|Rs\.?\s*)(\d+(?:\.\d+)?)/i);
        if (divAmtMatch) {
          desc = `Dividend of ₹${divAmtMatch[1]} per share`;
        } else {
          desc = `Dividend: ${subject}`;
        }
      } else if (subject.toLowerCase().includes('split') || subject.toLowerCase().includes('sub-division')) {
        type = 'Bonus/Split';
        desc = `Stock Split: ${subject}`;
      } else if (subject.toLowerCase().includes('bonus')) {
        type = 'Bonus/Split';
        desc = `Bonus Issue: ${subject}`;
      }

      events.push({
        stock_symbol: symbol,
        type,
        description: desc,
        date: eventDate.toISOString(),
        date_type: dateType,
        is_upcoming: eventDate > now
      });
    });
  }

  // Parse Board Meetings (Quarterly Results, etc.)
  if (Array.isArray(meetings)) {
    meetings.forEach(m => {
      const eventDate = new Date(m.bm_date);
      if (isNaN(eventDate.getTime())) return;

      const purpose = m.bm_purpose || '';
      const desc = m.bm_desc || '';
      let type = 'Board Meeting';
      let eventDesc = desc || purpose;
      let dateType = 'Meeting Date';

      if (purpose.toLowerCase().includes('results') || desc.toLowerCase().includes('results')) {
        type = 'Quarterly Results';
        dateType = 'Announcement Date';
        if (eventDate > now) {
          eventDesc = `${symbol} Quarterly Results Announcement`;
        } else {
          eventDesc = `${symbol} approved quarterly results`;
        }
      } else if (purpose.toLowerCase().includes('dividend') || desc.toLowerCase().includes('dividend')) {
        eventDesc = `${symbol} board meeting to consider dividend`;
      }

      events.push({
        stock_symbol: symbol,
        type,
        description: eventDesc,
        date: eventDate.toISOString(),
        date_type: dateType,
        is_upcoming: eventDate > now
      });
    });
  }

  // Deduplicate events of same type on the same day for this symbol
  const seen = new Set();
  const uniqueEvents = [];
  events.forEach(e => {
    const dateStr = new Date(e.date).toDateString();
    const key = `${e.type}_${dateStr}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEvents.push(e);
    }
  });

  return uniqueEvents;
}


/**
 * Helper: Classifies article sentiment based on keywords.
 */
function analyzeSentiment(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  
  const positiveKeywords = [
    'growth', 'profit', 'beat', 'acquisition', 'dividend', 'buyback', 'jump', 
    'win', 'contract', 'orders', 'expansion', 'launch', 'surge', 'upgrade', 
    'positive', 'gain', 'rise', 'soar', 'all-time high', 'bullish'
  ];
  
  const negativeKeywords = [
    'loss', 'drop', 'fall', 'slump', 'decline', 'crash', 'tax demand', 'strike', 
    'dispute', 'downgrade', 'fine', 'penalty', 'fraud', 'negative', 'investigation', 
    'probe', 'slashes', 'debt', 'plunge', 'bearish'
  ];

  let positiveScore = 0;
  let negativeScore = 0;

  positiveKeywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'g');
    const matches = text.match(regex);
    if (matches) positiveScore += matches.length;
  });

  negativeKeywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'g');
    const matches = text.match(regex);
    if (matches) negativeScore += matches.length;
  });

  if (positiveScore > negativeScore) return 'POSITIVE';
  if (negativeScore > positiveScore) return 'NEGATIVE';
  return 'NEUTRAL';
}

/**
 * Helper: Classifies article category based on keywords.
 */
function classifyCategory(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();

  if (text.includes('dividend') || text.includes('interim dividend') || text.includes('final dividend')) {
    return 'Dividends';
  }
  if (text.includes('q1') || text.includes('q2') || text.includes('q3') || text.includes('q4') || text.includes('quarter') || text.includes('earnings') || text.includes('net profit') || text.includes('revenue')) {
    return 'Quarterly Results';
  }
  if (text.includes('bonus') || text.includes('split') || text.includes('share split') || text.includes('allotment') || text.includes('rights issue')) {
    return 'Bonus/Split';
  }
  if (text.includes('gst') || text.includes('tax') || text.includes('notice') || text.includes('regulatory') || text.includes('sebi') || text.includes('court') || text.includes('investigation') || text.includes('probe')) {
    return 'Regulatory';
  }
  return 'General';
}

/**
 * Helper: Unescapes XML entities from Google News feed.
 */
function unescapeXML(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/**
 * Helper: Strips HTML tags from Google News description.
 */
function stripHTML(str) {
  return str.replace(/<[^>]*>/g, '').trim();
}

/**
 * Helper: Parses RSS XML text from Google News into structured articles.
 */
function parseGoogleNewsRSS(xmlText, symbol) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];
    
    // Extract Title
    const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
    let fullTitle = titleMatch ? titleMatch[1] : '';
    fullTitle = unescapeXML(fullTitle);
    
    let title = fullTitle;
    let source = 'Google News';
    const lastDashIndex = fullTitle.lastIndexOf(' - ');
    if (lastDashIndex !== -1) {
      title = fullTitle.substring(0, lastDashIndex);
      source = fullTitle.substring(lastDashIndex + 3);
    }
    
    // Extract Link
    const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
    const url = linkMatch ? unescapeXML(linkMatch[1]) : '';
    
    // Extract pubDate
    const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const publishedAt = pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString();
    
    // Extract Description
    const descMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/);
    let description = descMatch ? descMatch[1] : '';
    description = stripHTML(unescapeXML(description));
    if (!description || description.trim().length === 0) {
      description = `Latest updates and market movements for ${symbol} stock.`;
    }
    
    items.push({
      title,
      description,
      source,
      url,
      publishedAt,
      sentiment: analyzeSentiment(title, description),
      category: classifyCategory(title, description),
      stock_symbol: symbol,
      api_source: 'Google News RSS'
    });
  }
  
  return items;
}

/**
 * Helper: Parses a future date from news text to determine upcoming events.
 */
function parseFutureDate(text, pubDateStr) {
  const defaultYear = pubDateStr ? new Date(pubDateStr).getFullYear() : new Date().getFullYear();
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthRegexStr = months.join('|') + '|january|february|march|april|june|july|august|september|october|november|december';
  
  // Pattern 1: July 31, 2026 or Jul 31, 2026 or July 31
  const pattern1 = new RegExp(`(${monthRegexStr})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?`, 'i');
  const match1 = text.match(pattern1);
  if (match1) {
    const month = match1[1];
    const day = match1[2];
    const year = match1[3] || defaultYear;
    const date = new Date(`${month} ${day} ${year}`);
    if (!isNaN(date.getTime()) && date > new Date()) {
      return date;
    }
  }
  
  // Pattern 2: 31 July 2026 or 31st July
  const pattern2 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthRegexStr}),?\\s*(\\d{4})?`, 'i');
  const match2 = text.match(pattern2);
  if (match2) {
    const day = match2[1];
    const month = match2[2];
    const year = match2[3] || defaultYear;
    const date = new Date(`${day} ${month} ${year}`);
    if (!isNaN(date.getTime()) && date > new Date()) {
      return date;
    }
  }

  // Pattern 3: 31-Jul-2026 or 31/07/2026
  const pattern3 = /(\d{1,2})[-/](\d{1,2}|[a-z]{3})[-/](\d{4}|\d{2})/i;
  const match3 = text.match(pattern3);
  if (match3) {
    const day = match3[1];
    const month = match3[2];
    let year = match3[3];
    if (year.length === 2) year = '20' + year;
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime()) && date > new Date()) {
      return date;
    }
  }

  return null;
}

/**
 * Helper: Generates realistic mock financial news articles for a given stock symbol.
 */
function generateMockNews(symbol) {
  const templates = [
    {
      title: `${symbol} reports strong Q4 earnings, net profit jumps 22% YoY`,
      description: `${symbol} reported a robust increase in quarterly net profit, exceeding consensus analyst expectations due to expanding margins and increased domestic volume.`,
      source: 'Finor Business News',
      url: 'https://news.finor.local/articles/earnings-q4',
      category: 'Quarterly Results',
      sentiment: 'POSITIVE'
    },
    {
      title: `${symbol} Board announces interim dividend of ₹12.50 per equity share`,
      description: `The board of directors of ${symbol} has approved a first interim dividend for the financial year. The record date for dividend payout has been set for next week.`,
      source: 'Market Wire Feed',
      url: 'https://news.finor.local/articles/dividend-announcement',
      category: 'Dividends',
      sentiment: 'POSITIVE'
    },
    {
      title: `${symbol} receives regulatory order/GST demand notice of ₹14.5 Crore`,
      description: `${symbol} has received a demand order from the Commissioner of GST Appeals. The company intends to appeal this decision before the appellate tribunal, stating it has strong grounds.`,
      source: 'National Exchange Alerts',
      url: 'https://news.finor.local/articles/regulatory-tax-notice',
      category: 'Regulatory',
      sentiment: 'NEGATIVE'
    },
    {
      title: `${symbol} launches next-gen technology solutions, targets export growth`,
      description: `In a bid to expand its global footprint, ${symbol} announced the launch of its newest service offerings tailored for international enterprise clients in Europe and North America.`,
      source: 'Global Tech Investor',
      url: 'https://news.finor.local/articles/product-launch',
      category: 'General',
      sentiment: 'POSITIVE'
    },
    {
      title: `${symbol} schedules Board Meeting on July 15 to approve quarterly financials`,
      description: `A meeting of the Board of Directors of ${symbol} is scheduled to be held in mid-July to review and approve the unaudited financial statements for the current quarter.`,
      source: 'Corporate Press Desk',
      url: 'https://news.finor.local/articles/board-meeting-schedule',
      category: 'General',
      sentiment: 'NEUTRAL'
    }
  ];

  // Pick 3 random articles and assign recent timestamps
  const shuffled = [...templates].sort(() => 0.5 - Math.random()).slice(0, 3);
  const now = new Date();
  
  return shuffled.map((art, idx) => {
    const publishedDate = new Date(now);
    publishedDate.setHours(now.getHours() - (idx * 6) - Math.floor(Math.random() * 4)); // separate publication times
    
    return {
      title: art.title,
      description: art.description,
      source: art.source,
      url: art.url,
      publishedAt: publishedDate.toISOString(),
      sentiment: art.sentiment,
      category: art.category,
      stock_symbol: symbol,
      api_source: 'Mock Feed'
    };
  });
}

/**
 * GET /api/news/corporate-actions
 * Aggregates upcoming and past corporate actions (Dividends, Results, Board Meetings) for user holdings.
 * Leverages Yahoo Finance chart dividends and cached news data to build a Tijori-style events calendar.
 */
router.get('/corporate-actions', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch user's holdings and historical trades to include past stocks
    const { data: holdings, error: holdError } = await supabase
      .from('holdings')
      .select('stock_symbol')
      .eq('user_id', userId);

    if (holdError) throw holdError;

    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('stock_symbol')
      .eq('user_id', userId);

    if (tradesError) throw tradesError;

    const allSymbols = [
      ...(holdings || []).map(h => h.stock_symbol),
      ...(trades || []).map(t => t.stock_symbol)
    ];
    const uniqueSymbols = [...new Set(allSymbols.map(s => s ? s.toUpperCase() : ''))].filter(Boolean);

    if (uniqueSymbols.length === 0) {
      return res.json({ upcoming: [], past: [] });
    }
    const corporateActions = [];
    const now = new Date();
    const actionsCacheTTL = 6 * 60 * 60 * 1000; // 6 hours cache limit

    // 2. Fetch cached news from database (used for fallbacks)
    const { data: cachedNews, error: cacheFetchError } = await supabase
      .from('news_cache')
      .select('*')
      .in('stock_symbol', uniqueSymbols);

    const cacheMap = {};
    if (cachedNews) {
      cachedNews.forEach(c => {
        cacheMap[c.stock_symbol] = c;
      });
    }

    // 3. Fetch cached corporate actions from Supabase
    const actionCacheKeys = uniqueSymbols.map(s => `${s}_ACTIONS`);
    const { data: cachedActionsRows, error: cacheActionsErr } = await supabase
      .from('news_cache')
      .select('*')
      .in('stock_symbol', actionCacheKeys);

    const actionsCacheMap = {};
    if (cachedActionsRows) {
      cachedActionsRows.forEach(row => {
        actionsCacheMap[row.stock_symbol.replace('_ACTIONS', '')] = row;
      });
    }

    // 3.5 Fetch Yahoo credentials for upcoming events fallback
    const credentials = await getYahooCredentials();

    // 4. Process each symbol
    for (const symbol of uniqueSymbols) {
      const cached = actionsCacheMap[symbol];
      const isFresh = cached && (now - new Date(cached.fetched_at)) < actionsCacheTTL;

      if (isFresh && cached.news_content) {
        try {
          const parsed = typeof cached.news_content === 'string'
            ? JSON.parse(cached.news_content)
            : cached.news_content;
          if (Array.isArray(parsed)) {
            corporateActions.push(...parsed);
            continue;
          }
        } catch (e) {
          console.error(`[CorporateActionsRoute] JSON parse failed for cached actions ${symbol}:`, e.message);
        }
      }

      // Expired or missing cache: fetch fresh corporate actions from NSE API
      let freshEvents = [];
      let fetchSuccess = false;

      try {
        console.log(`[CorporateActionsRoute] Fetching corporate actions for ${symbol} from NSE API...`);
        const { actions, meetings } = await fetchCorporateActionsFromNSE(symbol);
        freshEvents = parseNSEActionsAndMeetings(symbol, actions, meetings);
        fetchSuccess = true;

        // Fetch Yahoo Finance quoteSummary for upcoming dividend & earnings dates as a reliable second source
        if (credentials) {
          try {
            const ticker = symbol.includes('.') ? symbol : `${symbol}.NS`;
            const yahooData = await fetchYahooUpcomingEvents(ticker, credentials);
            if (yahooData) {
              const exDiv = yahooData.summaryDetail?.exDividendDate;
              const earnings = yahooData.calendarEvents?.earnings?.earningsDate;

              // 1. Parse upcoming ex-dividend date from Yahoo
              if (exDiv && exDiv.raw) {
                const exDivDate = new Date(exDiv.raw * 1000);
                if (exDivDate > now) {
                  // Check if we already have this upcoming dividend from NSE
                  const hasUpcomingDiv = freshEvents.some(e => 
                    e.type === 'Dividend' && 
                    e.is_upcoming && 
                    Math.abs(new Date(e.date) - exDivDate) < 3 * 24 * 60 * 60 * 1000
                  );

                  if (!hasUpcomingDiv) {
                    let upcomingDivDesc = `Dividend Ex-Date (Upcoming)`;
                    
                    // Try to find the dividend amount from news cache
                    const newsRow = cacheMap[symbol];
                    if (newsRow && newsRow.news_content) {
                      try {
                        const articles = typeof newsRow.news_content === 'string'
                          ? JSON.parse(newsRow.news_content)
                          : newsRow.news_content;
                        if (Array.isArray(articles)) {
                          const divArticle = articles.find(art => {
                            const title = (art.title || '').toLowerCase();
                            return art.category === 'Dividends' || title.includes('dividend');
                          });
                          if (divArticle && divArticle.title) {
                            const divAmtMatch = divArticle.title.match(/(?:dividend\s*of|dividend\s*at|dividend\s*amount\s*of|dividend\s*value\s*of)?\s*(?:₹|rs\.?|rs)?\s*(\d+(?:\.\d+)?)\s*(?:per\s*share|rupees|rs|inr)/i)
                              || divArticle.title.match(/(?:₹|rs\.?|rs)\s*(\d+(?:\.\d+)?)\s*dividend/i);
                            if (divAmtMatch) {
                              upcomingDivDesc = `Dividend of ₹${divAmtMatch[1]} per share (Declared)`;
                            }
                          }
                        }
                      } catch (e) {
                        console.error(`[CorporateActionsRoute] Failed to extract dividend amount from news cache:`, e.message);
                      }
                    }

                    freshEvents.push({
                      stock_symbol: symbol,
                      type: 'Dividend',
                      description: upcomingDivDesc,
                      date: exDivDate.toISOString(),
                      date_type: 'Ex Date',
                      is_upcoming: true
                    });
                  }
                }
              }

              // 2. Parse upcoming earnings date from Yahoo
              if (earnings && earnings[0] && earnings[0].raw) {
                const earnDate = new Date(earnings[0].raw * 1000);
                if (earnDate > now) {
                  // Check if we already have this upcoming results date from NSE
                  const hasUpcomingResults = freshEvents.some(e => 
                    e.type === 'Quarterly Results' && 
                    e.is_upcoming && 
                    Math.abs(new Date(e.date) - earnDate) < 3 * 24 * 60 * 60 * 1000
                  );

                  if (!hasUpcomingResults) {
                    freshEvents.push({
                      stock_symbol: symbol,
                      type: 'Quarterly Results',
                      description: `${symbol} Quarterly Results Announcement`,
                      date: earnDate.toISOString(),
                      date_type: 'Announcement Date',
                      is_upcoming: true
                    });
                  }
                }
              }
            }
          } catch (yahooErr) {
            console.error(`[CorporateActionsRoute] Yahoo quoteSummary integration failed for ${symbol}:`, yahooErr.message);
          }
        }
      } catch (err) {
        console.warn(`[CorporateActionsRoute] NSE API failed for ${symbol}, falling back to Yahoo Chart and News parsing:`, err.message);
      }

      if (!fetchSuccess) {
        // FALLBACK: Use Yahoo Chart and News cache parsing
        const fallbackEvents = [];
        
        // A. Fetch historical dividends from Yahoo chart
        try {
          const ticker = symbol.includes('.') ? symbol : `${symbol}.NS`;
          const twoYearsAgo = Math.floor(Date.now() / 1000) - (2 * 365 * 24 * 60 * 60);
          const futureSec = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
          const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${twoYearsAgo}&period2=${futureSec}&events=div,split`;
          const response = await fetch(chartUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          if (response.ok) {
            const json = await response.json();
            const divEvents = json?.chart?.result?.[0]?.events?.dividends;
            const splitEvents = json?.chart?.result?.[0]?.events?.splits;
            
            if (divEvents) {
              Object.values(divEvents).forEach(d => {
                const eventDate = new Date(d.date * 1000);
                fallbackEvents.push({
                  stock_symbol: symbol,
                  type: 'Dividend',
                  description: `Dividend of ₹${d.amount} per share`,
                  date: eventDate.toISOString(),
                  date_type: 'Ex Date',
                  is_upcoming: eventDate > now
                });
              });
            }
            if (splitEvents) {
              Object.values(splitEvents).forEach(s => {
                const eventDate = new Date(s.date * 1000);
                fallbackEvents.push({
                  stock_symbol: symbol,
                  type: 'Bonus/Split',
                  description: `Stock Split of ${s.splitRatio || (s.numerator + ':' + s.denominator)}`,
                  date: eventDate.toISOString(),
                  date_type: 'Ex Date',
                  is_upcoming: eventDate > now
                });
              });
            }
          }
        } catch (err) {
          console.error(`[CorporateActionsRoute] Fallback Yahoo chart failed for ${symbol}:`, err.message);
        }

        // B. Parse upcoming events from cached news articles (with corrected default year!)
        const cachedNewsRow = cacheMap[symbol];
        if (cachedNewsRow && cachedNewsRow.news_content) {
          try {
            const articles = typeof cachedNewsRow.news_content === 'string'
              ? JSON.parse(cachedNewsRow.news_content)
              : cachedNewsRow.news_content;

            if (Array.isArray(articles)) {
              articles.forEach(art => {
                const title = (art.title || '').toLowerCase();
                const desc = (art.description || '').toLowerCase();
                const text = `${title} ${desc}`;

                let eventType = null;
                let eventDesc = null;
                let eventDate = new Date(art.publishedAt);
                let dateType = 'Announcement Date';

                // ONLY process upcoming events from news to avoid junk past results
                if (art.category === 'Quarterly Results' || text.includes('results') || text.includes('net profit') || text.includes('earnings') || text.includes('quarterly results')) {
                  const futureDateStr = parseFutureDate((art.title || '') + ' ' + (art.description || ''), art.publishedAt);
                  if (futureDateStr) {
                    eventType = 'Quarterly Results';
                    eventDate = futureDateStr;
                    dateType = 'Announcement Date';
                    eventDesc = `${symbol} Quarterly Results Announcement`;
                  }
                }
                else if (art.category === 'Dividends' || text.includes('dividend')) {
                  const futureDateStr = parseFutureDate((art.title || '') + ' ' + (art.description || ''), art.publishedAt);
                  if (futureDateStr) {
                    eventType = 'Dividend';
                    eventDate = futureDateStr;
                    dateType = 'Ex Date';
                    const divAmtMatch = (art.title || '').match(/(?:dividend\s*of|dividend\s*at|dividend\s*amount\s*of|dividend\s*value\s*of)?\s*(?:₹|rs\.?|rs)?\s*(\d+(?:\.\d+)?)\s*(?:per\s*share|rupees|rs|inr)/i)
                      || (art.title || '').match(/(?:₹|rs\.?|rs)\s*(\d+(?:\.\d+)?)\s*dividend/i);
                    const amount = divAmtMatch ? divAmtMatch[1] : '1.50';
                    eventDesc = `Dividend of ₹${amount} per share`;
                  }
                }
                else if (art.category === 'Bonus/Split' || text.includes('bonus') || text.includes('split')) {
                  const futureDateStr = parseFutureDate((art.title || '') + ' ' + (art.description || ''), art.publishedAt);
                  if (futureDateStr) {
                    eventType = 'Bonus/Split';
                    eventDate = futureDateStr;
                    eventDesc = art.title || 'Bonus/Split announcement';
                    dateType = 'Ex Date';
                  }
                }
                else if (text.includes('board meeting') || text.includes('board meets')) {
                  const futureDateStr = parseFutureDate((art.title || '') + ' ' + (art.description || ''), art.publishedAt);
                  if (futureDateStr) {
                    eventType = 'Board Meeting';
                    eventDate = futureDateStr;
                    eventDesc = `Board Meeting to consider financial results or corporate actions`;
                    dateType = 'Meeting Date';
                  }
                }

                if (eventType && eventDate > now) {
                  fallbackEvents.push({
                    stock_symbol: symbol,
                    type: eventType,
                    description: eventDesc || art.title || 'Corporate Action Event',
                    date: eventDate.toISOString(),
                    date_type: dateType,
                    is_upcoming: true
                  });
                }
              });
            }
          } catch (e) {
            console.error(`[CorporateActionsRoute] Fallback news parsing failed for ${symbol}:`, e.message);
          }
        }

        // Deduplicate fallback events
        const seen = new Set();
        freshEvents = [];
        fallbackEvents.forEach(e => {
          const dateStr = new Date(e.date).toDateString();
          const key = `${e.type}_${dateStr}`;
          if (!seen.has(key)) {
            seen.add(key);
            freshEvents.push(e);
          }
        });
      }

      // Save into cache (Supabase news_cache table under SYMBOL_ACTIONS symbol)
      try {
        const cacheSymbol = `${symbol}_ACTIONS`;
        const { data: existing, error: findErr } = await supabase
          .from('news_cache')
          .select('id')
          .eq('stock_symbol', cacheSymbol)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('news_cache')
            .update({
              news_content: freshEvents,
              sentiment: 'NEUTRAL',
              fetched_at: now.toISOString()
            })
            .eq('stock_symbol', cacheSymbol);
        } else {
          await supabase
            .from('news_cache')
            .insert({
              stock_symbol: cacheSymbol,
              news_content: freshEvents,
              sentiment: 'NEUTRAL',
              fetched_at: now.toISOString()
            });
        }
      } catch (err) {
        console.error(`[CorporateActionsRoute] Cache save error for actions ${symbol}:`, err.message);
      }

      corporateActions.push(...freshEvents);
    }

    // Sort corporate actions: upcoming first (closest date), then past (newest date first)
    const upcoming = corporateActions.filter(ca => ca.is_upcoming)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const past = corporateActions.filter(ca => !ca.is_upcoming)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      upcoming,
      past
    });

  } catch (err) {
    console.error('[CorporateActionsRoute] Failed to load corporate actions:', err.message);
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /api/news
 * Fetches holding-specific news articles, utilizing database caching to stay within NewsAPI quota limits.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch user's active holdings and historical trades to include past stocks
    const { data: holdings, error: holdError } = await supabase
      .from('holdings')
      .select('stock_symbol')
      .eq('user_id', userId);

    if (holdError) throw holdError;

    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('stock_symbol')
      .eq('user_id', userId);

    if (tradesError) throw tradesError;

    const allSymbols = [
      ...(holdings || []).map(h => h.stock_symbol),
      ...(trades || []).map(t => t.stock_symbol)
    ];
    const uniqueSymbols = [...new Set(allSymbols.map(s => s ? s.toUpperCase() : ''))].filter(Boolean);

    if (uniqueSymbols.length === 0) {
      return res.json([]);
    }
    const apiKey = process.env.NEWS_API_KEY;
    const isMockAPI = !apiKey || apiKey === 'your_news_api_key_here';
    const now = new Date();
    const cacheTTL = 4 * 60 * 60 * 1000; // 4 Hours cache validation limit

    // 2. Fetch cached news from database
    const { data: cachedNews, error: cacheFetchError } = await supabase
      .from('news_cache')
      .select('*')
      .in('stock_symbol', uniqueSymbols);

    if (cacheFetchError) {
      console.error('[NewsRoute] Cache fetch error:', cacheFetchError.message);
    }

    const cacheMap = {};
    if (cachedNews) {
      cachedNews.forEach(c => {
        cacheMap[c.stock_symbol] = c;
      });
    }

    const finalArticles = [];

    // 3. Process each stock symbol
    for (const symbol of uniqueSymbols) {
      const cached = cacheMap[symbol];
      const isFresh = cached && (now - new Date(cached.fetched_at)) < cacheTTL;

      if (isFresh && cached.news_content) {
        // Retrieve from cache
        try {
          const parsed = typeof cached.news_content === 'string' 
            ? JSON.parse(cached.news_content) 
            : cached.news_content;
          
          if (Array.isArray(parsed)) {
            finalArticles.push(...parsed);
            continue;
          }
        } catch (e) {
          console.error(`[NewsRoute] JSON parse failed for cached ${symbol}:`, e.message);
        }
      }

      // Expired or missing cache: fetch new articles
      let articles = [];

      if (isMockAPI) {
        // Try fetching Google News RSS feed first
        console.log(`[NewsRoute] Fetching news for ${symbol} using Google News RSS...`);
        try {
          const queryKeywords = `${symbol}+(stock+OR+dividend+OR+split+OR+bonus+OR+"board+meeting"+OR+"ex-date"+OR+results)`;
          const rssUrl = `https://news.google.com/rss/search?q=${queryKeywords}&hl=en-IN&gl=IN&ceid=IN:en`;
          const response = await fetch(rssUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (response.ok) {
            const xmlText = await response.text();
            const parsed = parseGoogleNewsRSS(xmlText, symbol);
            if (parsed && parsed.length > 0) {
              // Retrieve up to 20 articles to ensure older but important announcements (like ex-dates) are cached
              articles = parsed.slice(0, 20);
            }
          }
        } catch (rssErr) {
          console.error(`[NewsRoute] Google News RSS failed for ${symbol}:`, rssErr.message);
        }

        // If RSS failed or returned nothing, fallback to mock news
        if (articles.length === 0) {
          console.log(`[NewsRoute] RSS empty, falling back to mock news for ${symbol}...`);
          articles = generateMockNews(symbol);
        }
      } else {
        // Real NewsAPI call
        console.log(`[NewsRoute] Fetching news for ${symbol} using NewsAPI...`);
        try {
          const queryUrl = `https://newsapi.org/v2/everything?q=${symbol}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${apiKey}`;
          const response = await fetch(queryUrl, {
             headers: { 'User-Agent': 'FinorApp/1.0' }
          });

          if (response.ok) {
            const json = await response.json();
            if (json.articles && json.articles.length > 0) {
              articles = json.articles.map(art => {
                const title = art.title || '';
                const desc = art.description || '';
                return {
                  title,
                  description: desc,
                  source: art.source?.name || 'News Channel',
                  url: art.url,
                  publishedAt: art.publishedAt || new Date().toISOString(),
                  sentiment: analyzeSentiment(title, desc),
                  category: classifyCategory(title, desc),
                  stock_symbol: symbol,
                  api_source: 'NewsAPI'
                };
              });
            }
          } else {
            console.error(`[NewsRoute] NewsAPI failed for ${symbol} with status: ${response.status}`);
          }
        } catch (apiErr) {
          console.error(`[NewsRoute] API request failed for ${symbol}:`, apiErr.message);
        }
      }

      // Try Google News RSS search if NewsAPI failed or returned 0 results
      if (articles.length === 0) {
        console.log(`[NewsRoute] No NewsAPI results for ${symbol}. Trying Google News RSS...`);
        try {
          const queryKeywords = `${symbol}+(stock+OR+dividend+OR+split+OR+bonus+OR+"board+meeting"+OR+"ex-date"+OR+results)`;
          const rssUrl = `https://news.google.com/rss/search?q=${queryKeywords}&hl=en-IN&gl=IN&ceid=IN:en`;
          const response = await fetch(rssUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (response.ok) {
            const xmlText = await response.text();
            const parsed = parseGoogleNewsRSS(xmlText, symbol);
            if (parsed && parsed.length > 0) {
              articles = parsed.slice(0, 20);
            }
          }
        } catch (rssErr) {
          console.error(`[NewsRoute] Google News RSS fallback failed for ${symbol}:`, rssErr.message);
        }
      }

      // Final fallback to mock if both failed
      if (articles.length === 0) {
        console.log(`[NewsRoute] All news sources empty for ${symbol}. Falling back to mock news...`);
        articles = generateMockNews(symbol);
      }

      // Save into Supabase news_cache (Update if exists, else insert)
      try {
        const { data: existing, error: findErr } = await supabase
          .from('news_cache')
          .select('id')
          .eq('stock_symbol', symbol)
          .maybeSingle();

        if (findErr) {
          console.error(`[NewsRoute] Cache lookup failed for ${symbol}:`, findErr.message);
        }

        if (existing) {
          const { error: updateErr } = await supabase
            .from('news_cache')
            .update({
              news_content: articles,
              sentiment: articles[0]?.sentiment || 'NEUTRAL',
              fetched_at: now.toISOString()
            })
            .eq('stock_symbol', symbol);

          if (updateErr) {
            console.error(`[NewsRoute] Cache update failed for ${symbol}:`, updateErr.message);
          }
        } else {
          const { error: insertErr } = await supabase
            .from('news_cache')
            .insert({
              stock_symbol: symbol,
              news_content: articles,
              sentiment: articles[0]?.sentiment || 'NEUTRAL',
              fetched_at: now.toISOString()
            });

          if (insertErr) {
            console.error(`[NewsRoute] Cache insert failed for ${symbol}:`, insertErr.message);
          }
        }
      } catch (err) {
        console.error(`[NewsRoute] Cache save error for ${symbol}:`, err.message);
      }

      finalArticles.push(...articles);
    }

    // Sort all aggregated articles by published Date descending
    finalArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    res.json(finalArticles);

  } catch (err) {
    console.error('[NewsRoute] Failed to load news feed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
