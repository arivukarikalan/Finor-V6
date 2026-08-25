/**
 * Text Classifier & Cleaner Utility
 * Processes raw transaction descriptions to extract clean merchant/payee names
 * and auto-categorize transactions using keyword matching heuristics.
 */

export function cleanAndClassifyTransaction(rawDescription) {
  if (!rawDescription) {
    return { description: 'Spent via SMS alert', category: 'Other' };
  }

  // 1. Clean description (remove UPI prefix and parenthesized bank tags)
  let cleanDesc = rawDescription.trim();

  // Remove "UPI to " prefix (case-insensitive)
  if (cleanDesc.toLowerCase().startsWith('upi to ')) {
    cleanDesc = cleanDesc.substring(7).trim();
  }

  // Remove trailing bank tags like "(AD-HDFCBK-S)", "(JM-KVBUPI-S)", "(JD-KVBUPI-S)", "(BZ-IOBCHN-S)", "(VA-KVBUPI-S)", "(JD-HDFCBK-S)"
  // This matches any parenthesized text containing KVB, HDFC, IOB, AXIS, PAYTM, UPI, BANK, OKAXIS, SBI, ICICI
  const parenthesizedBankPattern = /\s*\([^)]*(kvb|hdfc|iob|axis|paytm|upi|bank|okaxis|sbi|icici)[^)]*\)\s*$/i;
  cleanDesc = cleanDesc.replace(parenthesizedBankPattern, '').trim();

  // Strip trailing " info" or " trans" or similar noise
  if (cleanDesc.toLowerCase().endsWith(' info')) {
    cleanDesc = cleanDesc.substring(0, cleanDesc.length - 5).trim();
  }
  if (cleanDesc.toLowerCase().endsWith(' tran')) {
    cleanDesc = cleanDesc.substring(0, cleanDesc.length - 5).trim();
  }
  if (cleanDesc.toLowerCase().endsWith(' trans')) {
    cleanDesc = cleanDesc.substring(0, cleanDesc.length - 6).trim();
  }

  // Ensure description is capitalized nicely if it was clean
  if (cleanDesc.length > 0) {
    // If it's a generic bank phrase, keep it, otherwise capitalize words nicely
    const genericPhrases = ['hdfc bank a', 'your bank immediately', 'spent via sms alert'];
    const isGeneric = genericPhrases.some(phrase => cleanDesc.toLowerCase().includes(phrase));
    if (!isGeneric) {
      // Capitalize first letter of each word
      cleanDesc = cleanDesc
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // 2. Classify Category based on keywords in description
  const lowerDesc = cleanDesc.toLowerCase();
  let category = 'Other'; // Fallback category

  // Keyword rules matching frontend CATEGORIES
  if (/\b(cafe|tea|coffee|chai|snacks|bakery|sweets|juice|baker|lassi|chat)\b/i.test(lowerDesc)) {
    category = 'Food (Snacks)';
  } else if (/\b(restaurant|hotel|dharbar|dining|caterer|caterers|pizza|burger|kitchen|dhaba|biryani|foods|food)\b/i.test(lowerDesc)) {
    category = 'Food (Dinner)';
  } else if (/\b(kirana|general st|general store|supermarket|mart|grocery|groceries|provisions|store|stores)\b/i.test(lowerDesc)) {
    category = 'Food';
  } else if (/\b(road tran|bus|taxi|metro|train|auto|cab|cabs|rail|transport|irctc|ola|uber|travel|flight|airline|airlines)\b/i.test(lowerDesc)) {
    category = 'Travel';
  } else if (/\b(pharmacy|pharmacies|medical|clinic|hospital|healthcare|doctor|medicine|chemist|chemists|meds)\b/i.test(lowerDesc)) {
    category = 'Medical';
  } else if (/\b(fuel|petrol|diesel|shell|hpcl|bpcl|iocl|bunk|gas)\b/i.test(lowerDesc)) {
    category = 'Travel'; // Map fuel to Travel
  } else if (/\b(rent|pg|owner|landlord)\b/i.test(lowerDesc)) {
    category = 'Rent';
  } else if (/\b(electricity|power|bill|recharge|jio|airtel|broadband|utility|water|gas bill|dth)\b/i.test(lowerDesc)) {
    category = 'Bills/Utilities';
  } else if (/\b(netflix|spotify|prime|youtube|hotstar|premium|subscription|subscriptions)\b/i.test(lowerDesc)) {
    category = 'Subscriptions';
  } else if (/\b(amazon|flipkart|myntra|zara|shopping|mall|clothe|clothes|fashion|wear)\b/i.test(lowerDesc)) {
    category = 'Shopping';
  } else if (/\b(cinema|movie|movies|multiplex|pvr|inox|entertainment|theatre|theater|ticket|tickets)\b/i.test(lowerDesc)) {
    category = 'Entertainment';
  } else if (/\b(investment|investments|mutual fund|zerodha|groww|stocks|stock|etf|gold|silver|sip)\b/i.test(lowerDesc)) {
    category = 'Investments';
  } else if (/\b(friend|repayment|lent|borrowed|splitwise)\b/i.test(lowerDesc)) {
    category = 'Lent/Friends';
  }

  // If description is a generic transaction message
  if (lowerDesc.includes('hdfc bank a') || lowerDesc.includes('your bank immediately')) {
    category = 'Transfer';
  }

  return {
    description: cleanDesc,
    category
  };
}
