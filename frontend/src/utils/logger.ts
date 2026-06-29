export interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

const LOG_KEY = 'finor_execution_logs';
const CLEAR_KEY = 'finor_logs_last_clear';

export const SystemLogger = {
  getLogs(): LogEntry[] {
    try {
      const stored = localStorage.getItem(LOG_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  },

  log(type: 'info' | 'success' | 'error' | 'warn', message: string) {
    try {
      const logs = this.getLogs();
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        type,
        message
      };
      
      // Limit to last 500 logs to prevent localStorage overflow
      const updated = [entry, ...logs].slice(0, 500);
      localStorage.setItem(LOG_KEY, JSON.stringify(updated));
      
      // Trigger a custom event to notify listeners (e.g. System Logs tab)
      window.dispatchEvent(new CustomEvent('finor-new-log', { detail: entry }));
    } catch (e) {
      console.error('Logger failed to write:', e);
    }
  },

  info(msg: string) { this.log('info', msg); },
  success(msg: string) { this.log('success', msg); },
  error(msg: string) { this.log('error', msg); },
  warn(msg: string) { this.log('warn', msg); },

  clear() {
    localStorage.removeItem(LOG_KEY);
    window.dispatchEvent(new CustomEvent('finor-logs-cleared'));
  },

  checkDailyClear() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const lastClear = localStorage.getItem(CLEAR_KEY);
      
      if (lastClear !== today) {
        this.clear();
        localStorage.setItem(CLEAR_KEY, today);
        this.info(`System logs initialized for date: ${today}`);
      }
    } catch (e) {
      console.error('Logger failed daily check:', e);
    }
  }
};
