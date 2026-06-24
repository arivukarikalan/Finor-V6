import { NSE } from 'nse-bse-api';

async function getYahooCredentials() {
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
    return { cookies, crumb };
  } catch (err) {
    console.error("Failed to get Yahoo cookie/crumb:", err.message);
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
    console.error(`Yahoo upcoming fetch failed for ${ticker}:`, err.message);
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

  // Deduplicate
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

async function main() {
  const nse = new NSE('./tmp_nse_downloads');
  const now = new Date();
  const credentials = await getYahooCredentials();
  
  const testSymbols = ['DABUR', 'EIHOTEL', 'BRITANNIA'];
  
  for (const sym of testSymbols) {
    console.log(`\n=================== ${sym} ===================`);
    
    // 1. Fetch NSE Actions
    let actions = [];
    let meetings = [];
    try {
      actions = await nse.actions({ symbol: sym });
      meetings = await nse.boardMeetings({ symbol: sym });
    } catch (e) {
      console.error("NSE fetch failed:", e.message);
    }
    
    const events = parseNSEActionsAndMeetings(sym, actions, meetings);
    
    // 2. Fetch Yahoo QuoteSummary
    const yahooData = await fetchYahooUpcomingEvents(`${sym}.NS`, credentials);
    if (yahooData) {
      const exDiv = yahooData.summaryDetail?.exDividendDate;
      const earnings = yahooData.calendarEvents?.earnings?.earningsDate;
      
      // Parse upcoming ex-dividend date from Yahoo
      if (exDiv && exDiv.raw) {
        const exDivDate = new Date(exDiv.raw * 1000);
        if (exDivDate > now) {
          // Check if we already have this upcoming dividend from NSE
          const hasUpcomingDiv = events.some(e => 
            e.type === 'Dividend' && 
            e.is_upcoming && 
            Math.abs(new Date(e.date) - exDivDate) < 3 * 24 * 60 * 60 * 1000
          );
          
          if (!hasUpcomingDiv) {
            console.log(`Adding Yahoo upcoming dividend: ${exDivDate.toDateString()}`);
            events.push({
              stock_symbol: sym,
              type: 'Dividend',
              description: `Dividend Ex-Date (Upcoming)`,
              date: exDivDate.toISOString(),
              date_type: 'Ex Date',
              is_upcoming: true
            });
          }
        }
      }
      
      // Parse upcoming earnings date from Yahoo
      if (earnings && earnings[0] && earnings[0].raw) {
        const earnDate = new Date(earnings[0].raw * 1000);
        if (earnDate > now) {
          // Check if we already have this upcoming results date from NSE
          const hasUpcomingResults = events.some(e => 
            e.type === 'Quarterly Results' && 
            e.is_upcoming && 
            Math.abs(new Date(e.date) - earnDate) < 3 * 24 * 60 * 60 * 1000
          );
          
          if (!hasUpcomingResults) {
            console.log(`Adding Yahoo upcoming results: ${earnDate.toDateString()}`);
            events.push({
              stock_symbol: sym,
              type: 'Quarterly Results',
              description: `${sym} Quarterly Results Announcement`,
              date: earnDate.toISOString(),
              date_type: 'Announcement Date',
              is_upcoming: true
            });
          }
        }
      }
    }
    
    // Sort and print
    const upcoming = events.filter(e => e.is_upcoming);
    console.log(`Upcoming Events count: ${upcoming.length}`);
    upcoming.forEach(e => console.log(`  [UPCOMING] ${e.type} on ${new Date(e.date).toDateString()} (${e.date_type}): ${e.description}`));
  }
  
  nse.exit();
}
main();
