import { supabase } from '../config/supabase.js';
import crypto from 'crypto';

/**
 * Returns default settings for a stock.
 */
function getDefaultSettings() {
  return {
    stoploss_price: null,
    position_tag: 'TRADING' // 'TRADING' or 'CORE_HOLD'
  };
}

/**
 * Generates a unique, collision-resistant 20-character settings key.
 */
function getSettingsKey(userId, symbol) {
  const hash = crypto.createHash('sha256').update(`${userId}_${symbol.toUpperCase()}`).digest('hex');
  return `SETTINGS_${hash.substring(0, 11)}`;
}

/**
 * Get settings for a specific symbol and user.
 */
export async function getStockSettings(userId, symbol) {
  try {
    const key = getSettingsKey(userId, symbol);
    const { data, error } = await supabase
      .from('news_cache')
      .select('*')
      .eq('stock_symbol', key)
      .maybeSingle();

    if (error) {
      console.error(`[StockSettings] Error fetching settings for ${symbol}:`, error.message);
      return getDefaultSettings();
    }

    if (!data || !data.news_content) {
      return getDefaultSettings();
    }

    return {
      stoploss_price: data.news_content.stoploss_price !== undefined && data.news_content.stoploss_price !== null ? parseFloat(data.news_content.stoploss_price) : null,
      position_tag: data.news_content.position_tag || 'TRADING'
    };
  } catch (err) {
    console.error(`[StockSettings] Exception fetching settings for ${symbol}:`, err.message);
    return getDefaultSettings();
  }
}

/**
 * Get all settings for a user.
 * Returns a map of stock symbols to settings objects.
 */
export async function getAllStockSettings(userId) {
  try {
    const { data, error } = await supabase
      .from('news_cache')
      .select('stock_symbol, news_content')
      .like('stock_symbol', 'SETTINGS_%')
      .eq('news_content->>userId', userId);

    if (error) {
      console.error(`[StockSettings] Error fetching all settings:`, error.message);
      return {};
    }

    const settingsMap = {};
    if (data) {
      for (const row of data) {
        if (row.news_content && row.news_content.symbol) {
          const symbol = row.news_content.symbol.toUpperCase();
          settingsMap[symbol] = {
            stoploss_price: row.news_content.stoploss_price !== undefined && row.news_content.stoploss_price !== null ? parseFloat(row.news_content.stoploss_price) : null,
            position_tag: row.news_content.position_tag || 'TRADING'
          };
        }
      }
    }
    return settingsMap;
  } catch (err) {
    console.error(`[StockSettings] Exception fetching all settings:`, err.message);
    return {};
  }
}

/**
 * Saves/updates settings for a specific symbol and user.
 */
export async function saveStockSettings(userId, symbol, settings) {
  try {
    const key = getSettingsKey(userId, symbol);
    const cleanSettings = {
      userId: userId,
      symbol: symbol.toUpperCase(),
      stoploss_price: settings.stoploss_price !== undefined && settings.stoploss_price !== null ? parseFloat(settings.stoploss_price) : null,
      position_tag: settings.position_tag || 'TRADING'
    };

    const { data, error } = await supabase
      .from('news_cache')
      .upsert({
        stock_symbol: key,
        news_content: cleanSettings,
        sentiment: 'NEUTRAL',
        fetched_at: new Date().toISOString()
      })
      .select();

    if (error) {
      throw error;
    }
    return data[0]?.news_content || cleanSettings;
  } catch (err) {
    console.error(`[StockSettings] Error saving settings for ${symbol}:`, err.message);
    throw err;
  }
}

