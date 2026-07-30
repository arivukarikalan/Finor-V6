import { apiRequest } from './api';

export interface StockPriceItem {
  symbol: string;
  ltp: number | null;
  previousClose: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  priceTick?: 'up' | 'down' | 'same';
}

type PriceUpdateListener = (prices: Record<string, StockPriceItem>) => void;

class PriceSyncEngine {
  private symbolsToTrack: Set<string> = new Set();
  private lastPrices: Record<string, StockPriceItem> = {};
  private listeners: Set<PriceUpdateListener> = new Set();
  private pollIntervalId: any = null;
  private isRunning: boolean = false;

  constructor() {
    this.setupVisibilityListener();
  }

  /**
   * Register a set of symbols to keep auto-syncing in background
   */
  public trackSymbols(symbols: string[]) {
    let addedNew = false;
    symbols.forEach(sym => {
      if (sym && !this.symbolsToTrack.has(sym.toUpperCase())) {
        this.symbolsToTrack.add(sym.toUpperCase());
        addedNew = true;
      }
    });

    if (addedNew && this.symbolsToTrack.size > 0 && !this.isRunning) {
      this.startPolling();
    }
  }

  /**
   * Subscribe a UI component to live price updates
   */
  public subscribe(listener: PriceUpdateListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current cached prices if available
    if (Object.keys(this.lastPrices).length > 0) {
      listener(this.lastPrices);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get latest prices snapshot
   */
  public getPrices(): Record<string, StockPriceItem> {
    return this.lastPrices;
  }

  /**
   * Force manual trigger background refresh without blocking UI
   */
  public async refreshNow() {
    await this.fetchPricesBatch();
  }

  private startPolling() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Initial fetch immediately
    this.fetchPricesBatch();

    // Poll every 10 seconds silently
    this.pollIntervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && this.symbolsToTrack.size > 0) {
        this.fetchPricesBatch();
      }
    }, 10000);
  }

  public stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.isRunning = false;
  }

  private setupVisibilityListener() {
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (!this.isRunning && this.symbolsToTrack.size > 0) {
            this.startPolling();
          } else {
            this.fetchPricesBatch();
          }
        }
      });
    }
  }

  private async fetchPricesBatch() {
    if (this.symbolsToTrack.size === 0) return;

    const symbolsArray = Array.from(this.symbolsToTrack);
    try {
      const res = await apiRequest('/holdings/ltp-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbolsArray }),
        bypassCache: true
      });

      if (res && res.prices) {
        const updatedPrices: Record<string, StockPriceItem> = { ...this.lastPrices };
        let hasPriceChange = false;

        Object.entries(res.prices).forEach(([symbol, item]: [string, any]) => {
          const prevLtp = this.lastPrices[symbol]?.ltp || null;
          const newLtp = typeof item.ltp === 'number' ? item.ltp : prevLtp;

          let tick: 'up' | 'down' | 'same' = 'same';
          if (prevLtp !== null && newLtp !== null) {
            if (newLtp > prevLtp) tick = 'up';
            else if (newLtp < prevLtp) tick = 'down';
          }

          if (prevLtp !== newLtp || !this.lastPrices[symbol]) {
            hasPriceChange = true;
          }

          updatedPrices[symbol] = {
            symbol,
            ltp: newLtp,
            previousClose: typeof item.previousClose === 'number' ? item.previousClose : this.lastPrices[symbol]?.previousClose || null,
            fiftyTwoWeekHigh: typeof item.fiftyTwoWeekHigh === 'number' ? item.fiftyTwoWeekHigh : this.lastPrices[symbol]?.fiftyTwoWeekHigh || null,
            fiftyTwoWeekLow: typeof item.fiftyTwoWeekLow === 'number' ? item.fiftyTwoWeekLow : this.lastPrices[symbol]?.fiftyTwoWeekLow || null,
            priceTick: tick
          };
        });

        this.lastPrices = updatedPrices;

        // Emit update to all subscribed UI components
        this.listeners.forEach(listener => listener(this.lastPrices));

        // Dispatch window event for legacy components
        if (hasPriceChange && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('finor-live-prices-updated', {
            detail: { prices: this.lastPrices }
          }));
        }
      }
    } catch (err) {
      console.warn('[PriceSyncEngine] Silent batch fetch failed:', err);
    }
  }
}

export const priceSyncEngine = new PriceSyncEngine();
