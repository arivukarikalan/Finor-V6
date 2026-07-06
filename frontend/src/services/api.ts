import { supabase } from './supabase';
import { SystemLogger } from '../utils/logger';
import { useToastStore } from '../context/toastStore';
import Dexie, { type Table } from 'dexie';

const rawBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';
// Defensive check: Remove trailing slash if any, and append '/api' if not present
let sanitizedBaseUrl = rawBaseUrl.trim().replace(/\/$/, '');
if (!sanitizedBaseUrl.endsWith('/api')) {
  sanitizedBaseUrl += '/api';
}
const BASE_URL = sanitizedBaseUrl;

// IndexedDB Caching Schema
interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
}

class FinorDatabase extends Dexie {
  apiCache!: Table<CacheEntry>;

  constructor() {
    super('FinorDatabase');
    this.version(1).stores({
      apiCache: 'key, timestamp'
    });
  }
}

export const db = new FinorDatabase();

async function saveToCache(key: string, data: any) {
  try {
    await db.apiCache.put({ key, data, timestamp: Date.now() });
  } catch (e) {
    console.error('Failed to write to IndexedDB:', e);
  }
}

async function getFromCache(key: string) {
  try {
    const entry = await db.apiCache.get(key);
    return entry ? entry.data : null;
  } catch (e) {
    console.error('Failed to read from IndexedDB:', e);
    return null;
  }
}

async function clearCache() {
  try {
    await db.apiCache.clear();
  } catch (e) {
    console.error('Failed to clear IndexedDB:', e);
  }
}

// In-memory cache fallback for instant tab switching within 30s
const apiCache = new Map<string, { data: any; expiry: number }>();

/**
 * Custom fetch wrapper that automatically appends the user's Supabase JWT access token.
 * Integrates an IndexedDB Stale-While-Revalidate (SWR) cache for GET requests to achieve sub-50ms loading times.
 */
export async function apiRequest(endpoint: string, options: RequestInit & { bypassCache?: boolean } = {}) {
  const method = options.method || 'GET';
  const cacheKey = `${endpoint}_${options.body ? JSON.stringify(options.body) : ''}`;

  // If GET and cache exists & is still valid, return cached data
  if (method === 'GET' && !options.bypassCache) {
    // 1. Check in-memory first for instant return
    const memCached = apiCache.get(cacheKey);
    if (memCached && memCached.expiry > Date.now()) {
      return memCached.data;
    }

    // 2. Check IndexedDB cache
    const dbCached = await getFromCache(cacheKey);
    if (dbCached) {
      // Background revalidation fetch (non-blocking)
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          const headers = new Headers(options.headers || {});
          if (token) headers.set('Authorization', `Bearer ${token}`);
          if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

          const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
          if (response.ok) {
            const freshData = await response.json();
            apiCache.set(cacheKey, { data: freshData, expiry: Date.now() + 30000 });
            await saveToCache(cacheKey, freshData);

            // Compare cached data with fresh data. If different, trigger global event
            if (JSON.stringify(dbCached) !== JSON.stringify(freshData)) {
              window.dispatchEvent(new CustomEvent('finor-cache-updated', {
                detail: { endpoint, data: freshData }
              }));
            }
          }
        } catch (e) {
          console.warn('[BackgroundRevalidation] Failed to refresh:', e);
        }
      })();

      return dbCached;
    }
  }

  // If mutating request, clear caches to ensure real-time data integrity
  if (method !== 'GET') {
    apiCache.clear();
    await clearCache();
  }

  // Get the session directly from Supabase, which triggers background token refreshes automatically if expired
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  SystemLogger.info(`API Request: [${method}] ${endpoint}`);

  // Show loading toast if request takes more than 600ms (only for explicit long-running user sync actions)
  let loadingToastId: string | null = null;
  const timeoutId = setTimeout(() => {
    const displayEndpoints = ['/gmail/sync'];
    if (displayEndpoints.some(e => endpoint.includes(e))) {
      let displayName = 'Syncing Gmail trade confirmations';
      loadingToastId = useToastStore.getState().addToast(`${displayName}...`, 'loading');
    }
  }, 600);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error || `Request failed with status ${response.status}`;
      SystemLogger.error(`API Failed: [${method}] ${endpoint} — ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const data = await response.json();
    SystemLogger.success(`API Success: [${method}] ${endpoint}`);

    // If backend returns logs or sync summaries, write details to logger
    if (data && data.message) {
      SystemLogger.info(`API Message: ${data.message}`);
    }
    if (data && data.details && Array.isArray(data.details.processed)) {
      SystemLogger.info(`Trades parsed: ${data.details.processed.length} entries`);
    }

    // Cache GET requests for 30 seconds (in-memory) and persistently (IndexedDB)
    if (method === 'GET') {
      apiCache.set(cacheKey, { data, expiry: Date.now() + 30000 });
      await saveToCache(cacheKey, data);
    }

    clearTimeout(timeoutId);
    if (loadingToastId) {
      useToastStore.getState().removeToast(loadingToastId);
    }

    return data;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (loadingToastId) {
      useToastStore.getState().removeToast(loadingToastId);
    }
    if (err.message && !err.message.includes('API Failed')) {
      SystemLogger.error(`Network Exception: ${err.message}`);
    }
    throw err;
  }
}
