import { supabase } from './supabase';
import { SystemLogger } from '../utils/logger';

const rawBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';
// Defensive check: Remove trailing slash if any, and append '/api' if not present
let sanitizedBaseUrl = rawBaseUrl.trim().replace(/\/$/, '');
if (!sanitizedBaseUrl.endsWith('/api')) {
  sanitizedBaseUrl += '/api';
}
const BASE_URL = sanitizedBaseUrl;

// In-memory API cache mapping URLs to their cached values and expiry times
const apiCache = new Map<string, { data: any; expiry: number }>();

/**
 * Custom fetch wrapper that automatically appends the user's Supabase JWT access token.
 * Integrates a 30-second cache for GET requests to enable instantaneous tab switching.
 */
export async function apiRequest(endpoint: string, options: RequestInit & { bypassCache?: boolean } = {}) {
  const method = options.method || 'GET';
  const cacheKey = `${endpoint}_${options.body ? JSON.stringify(options.body) : ''}`;

  // If GET and cache exists & is still valid, return cached data
  if (method === 'GET' && !options.bypassCache) {
    const cached = apiCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
  }

  // If mutating request, clear all cached GET values to ensure real-time data integrity
  if (method !== 'GET') {
    apiCache.clear();
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

    // Cache GET requests for 30 seconds
    if (method === 'GET') {
      apiCache.set(cacheKey, { data, expiry: Date.now() + 30000 });
    }

    return data;
  } catch (err: any) {
    if (err.message && !err.message.includes('API Failed')) {
      SystemLogger.error(`Network Exception: ${err.message}`);
    }
    throw err;
  }
}

