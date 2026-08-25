import { supabaseAdmin } from '../config/supabase.js';

/**
 * Normalizes time of day to minutes from midnight in Indian Standard Time (IST)
 */
function getISTMinutesFromMidnight(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 0;
  
  // Convert UTC/local to IST (UTC +5.5 hours)
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const istTime = new Date(utc + (330 * 60000));
  
  return istTime.getHours() * 60 + istTime.getMinutes();
}

/**
 * Checks if a description matches the generic placeholders
 */
function isGenericDescription(description) {
  if (!description) return true;
  const desc = description.toLowerCase().trim();
  return (
    desc === '' ||
    desc === 'uncategorized' ||
    desc.includes('spent via sms alert') ||
    desc.includes('credits via sms alert') ||
    desc.includes('spent via sms') ||
    desc === 'manual entry' ||
    desc === 'unlabeled transaction'
  );
}

/**
 * Scans recent historical transaction ledger to auto-fill generic transaction entries
 * 
 * @param {string} userId - UUID of the user
 * @param {number} amount - Transaction amount
 * @param {string|Date} date - Transaction date/timestamp
 * @returns {Promise<{isMatched: boolean, description?: string, category?: string, confidence?: number}>}
 */
export async function detectRecurringPattern(userId, amount, date) {
  try {
    const targetAmount = parseFloat(amount);
    if (isNaN(targetAmount) || targetAmount <= 0) {
      return { isMatched: false };
    }

    const targetDate = new Date(date || new Date());
    const targetMinutes = getISTMinutesFromMidnight(targetDate);
    const targetDayOfWeek = targetDate.getDay(); // 0-6

    // Fetch the last 150 expense transactions for this user
    const { data: pastTransactions, error } = await supabaseAdmin
      .from('finance_transactions')
      .select('amount, category, description, date, type')
      .eq('user_id', userId)
      .eq('type', 'EXPENSE')
      .order('date', { ascending: false })
      .limit(150);

    if (error) {
      console.error('[RecurringService] Error fetching history:', error.message);
      return { isMatched: false };
    }

    if (!pastTransactions || pastTransactions.length === 0) {
      return { isMatched: false };
    }

    const candidateGroups = {}; // key: "description|category", value: Array of matching past transactions

    for (const tx of pastTransactions) {
      const txDesc = tx.description;
      const txCat = tx.category;

      if (isGenericDescription(txDesc)) continue;

      const txAmount = parseFloat(tx.amount);
      const txDate = new Date(tx.date);
      const txMinutes = getISTMinutesFromMidnight(txDate);
      const txDayOfWeek = txDate.getDay();

      // 1. Amount matching (within 3% tolerance)
      const amtDiffPct = Math.abs(targetAmount - txAmount) / txAmount;
      if (amtDiffPct > 0.03) continue;

      // 2. Time matching (within 2.5 hours / 150 minutes window)
      let timeDiff = Math.abs(targetMinutes - txMinutes);
      if (timeDiff > 12 * 60) {
        timeDiff = 24 * 60 - timeDiff; // handle wrap around midnight
      }
      if (timeDiff > 150) continue;

      // 3. Candidate scoring
      let score = 0;
      
      // Amount closeness score (max 50 points)
      if (targetAmount === txAmount) {
        score += 50;
      } else if (amtDiffPct <= 0.01) {
        score += 40;
      } else {
        score += 30;
      }

      // Time closeness score (max 35 points)
      if (timeDiff <= 15) {
        score += 35;
      } else if (timeDiff <= 30) {
        score += 25;
      } else if (timeDiff <= 60) {
        score += 15;
      } else {
        score += 5;
      }

      // Day of week match score (max 15 points)
      if (targetDayOfWeek === txDayOfWeek) {
        score += 15;
      }

      const key = `${txDesc.trim()}|${txCat.trim()}`;
      if (!candidateGroups[key]) {
        candidateGroups[key] = [];
      }
      candidateGroups[key].push({ score, date: txDate });
    }

    const results = [];
    for (const [key, matches] of Object.entries(candidateGroups)) {
      const [description, category] = key.split('|');
      
      // Calculate total count (frequency) and maximum score
      const frequency = matches.length;
      const maxScore = Math.max(...matches.map(m => m.score));
      
      // Boost score slightly for higher frequency matches to favor established habits
      const frequencyBoost = Math.min(15, (frequency - 1) * 5);
      const finalConfidence = Math.min(100, maxScore + frequencyBoost);

      results.push({
        description,
        category,
        frequency,
        confidence: finalConfidence
      });
    }

    // Sort by confidence score (descending) and frequency (descending)
    results.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return b.frequency - a.frequency;
    });

    if (results.length > 0) {
      const best = results[0];
      // Require a minimum confidence score of 60 points and at least 2 occurrences for high trust
      // OR a very high confidence score of 80+ if occurred once (e.g. identical amount and close time)
      if (best.confidence >= 80 || (best.confidence >= 60 && best.frequency >= 2)) {
        console.log(`[RecurringService] Matched recurring pattern: "${best.description}" (${best.category}) with ${best.confidence}% confidence (Frequency: ${best.frequency})`);
        return {
          isMatched: true,
          description: best.description,
          category: best.category,
          confidence: best.confidence
        };
      }
    }

    return { isMatched: false };
  } catch (err) {
    console.error('[RecurringService] Exception in detectRecurringPattern:', err.message);
    return { isMatched: false };
  }
}
