class PriceCache {
  constructor(defaultTTLMs = 3 * 60 * 1000) {
    this.cache = new Map(); // Key: symbol (uppercase), Value: { ltp, previousClose, timestamp }
    this.defaultTTL = defaultTTLMs;
  }

  /**
   * Sets prices for multiple tickers
   * @param {Object} tickerData - Format: { SYMBOL: { ltp: 100, previousClose: 99 } }
   */
  setPrices(tickerData) {
    const now = Date.now();
    Object.entries(tickerData).forEach(([symbol, data]) => {
      if (data && data.ltp !== undefined && data.ltp !== null) {
        this.cache.set(symbol.toUpperCase(), {
          ltp: data.ltp,
          previousClose: data.previousClose || null,
          timestamp: now
        });
      }
    });

    // Proactive memory cleanup of expired keys
    this.cleanup();
  }

  /**
   * Gets prices for a list of symbols
   * @param {Array<string>} symbols
   * @returns {Object} - Matched symbol data, with missing or expired items omitted
   */
  getPrices(symbols) {
    const now = Date.now();
    const result = {};

    symbols.forEach(symbol => {
      const symUpper = symbol.toUpperCase();
      const cached = this.cache.get(symUpper);

      if (cached) {
        // Check if item has expired
        if (now - cached.timestamp < this.defaultTTL) {
          result[symUpper] = {
            ltp: cached.ltp,
            previousClose: cached.previousClose
          };
        } else {
          // Remove expired item
          this.cache.delete(symUpper);
        }
      }
    });

    return result;
  }

  /**
   * Proactive cache memory leak prevention
   */
  cleanup() {
    const now = Date.now();
    for (const [symbol, cached] of this.cache.entries()) {
      if (now - cached.timestamp >= this.defaultTTL) {
        this.cache.delete(symbol);
      }
    }
  }

  /**
   * Clear all items in the cache
   */
  clear() {
    this.cache.clear();
  }
}

export const priceCache = new PriceCache();
