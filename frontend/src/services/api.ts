import { supabase } from './supabase';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';

/**
 * Custom fetch wrapper that automatically appends the user's Supabase JWT access token.
 */
export async function apiRequest(endpoint: string, options: RequestInit = {}) {
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

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}
