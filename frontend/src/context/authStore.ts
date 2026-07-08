import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { User, Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  email: string;
  role: 'USER' | 'SUPER_ADMIN';
  username: string | null;
  country: string | null;
  gender: string | null;
  security_question: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  role: string | null;
  profile: Profile | null;
  loading: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  role: null,
  profile: null,
  loading: true,

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && profileData) {
        set({
          profile: profileData,
          role: profileData.role || 'USER'
        });
      }
    } catch (e) {
      console.error('Error fetching profile:', e);
    }
  },

  initialize: async () => {
    try {
      // Get initial session
      const { data: { session } } = await supabase.auth.getSession();
      
      set({
        session,
        user: session?.user ?? null,
        loading: !session?.user // keep loading if we need to fetch profile details
      });

      if (session?.user) {
        await get().fetchProfile();
      }

      set({ loading: false });

      // Listen for auth state changes (login, logout, token refresh)
      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        set({
          session: newSession,
          user: newSession?.user ?? null,
          role: newSession ? get().role : null,
          profile: newSession ? get().profile : null
        });

        if (newSession?.user) {
          set({ loading: true });
          await get().fetchProfile();
          set({ loading: false });
        }
      });
    } catch (error) {
      console.error('Error initializing auth store:', error);
      set({ loading: false });
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await supabase.auth.signOut();
      set({ user: null, session: null, role: null, profile: null, loading: false });
    } catch (error) {
      console.error('Error signing out:', error);
      set({ loading: false });
    }
  },
}));
