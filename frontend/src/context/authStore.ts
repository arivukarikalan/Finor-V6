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
  sms_api_key?: string | null;
  zerodha_api_key?: string | null;
  zerodha_api_secret?: string | null;
  zerodha_pdf_password?: string | null;
  session_expiry_days?: number | null;
  gmail_connected_email?: string | null;
  gmail_filter_from?: string | null;
  gmail_filter_subject?: string | null;
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
        // Self-heal: If this is the master email, force SUPER_ADMIN role in database if not set
        if (user.email === 'arivukarikalan7@gmail.com' && profileData.role !== 'SUPER_ADMIN') {
          console.log('[authStore] Elevating master user to SUPER_ADMIN role in database...');
          const { data: updatedProfile, error: updateError } = await supabase
            .from('profiles')
            .update({ role: 'SUPER_ADMIN' })
            .eq('id', user.id)
            .select()
            .maybeSingle();

          if (!updateError && updatedProfile) {
            set({
              profile: updatedProfile,
              role: 'SUPER_ADMIN'
            });
            return;
          }
        }

        set({
          profile: profileData,
          role: profileData.role || 'USER'
        });
      } else if (!profileData) {
        // Automatically create a profile row if missing (e.g. registered before trigger existed)
        const userEmail = user.email || '';
        const defaultRole = userEmail === 'arivukarikalan7@gmail.com' ? 'SUPER_ADMIN' : 'USER';
        console.log(`[authStore] Profile missing for ${userEmail}. Creating default profile with role ${defaultRole}...`);
        
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: userEmail,
            role: defaultRole,
            username: user.user_metadata?.username || userEmail.split('@')[0] || 'User',
            gender: 'Male',
            country: 'India',
            sms_api_key: 'FinorSMS_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
          })
          .select()
          .maybeSingle();

        if (!insertError && newProfile) {
          set({
            profile: newProfile,
            role: newProfile.role || 'USER'
          });
        } else if (insertError) {
          console.error('[authStore] Failed to insert missing profile:', insertError.message);
        }
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
        
        // Custom Session Expiry Policy Enforcement
        if (!localStorage.getItem('finor_login_timestamp')) {
          localStorage.setItem('finor_login_timestamp', new Date().toISOString());
        } else {
          const loginTs = localStorage.getItem('finor_login_timestamp');
          const maxDays = get().profile?.session_expiry_days ?? 1;
          if (loginTs) {
            const diffTime = Date.now() - new Date(loginTs).getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            if (diffDays > maxDays) {
              console.warn('[authStore] Session expired based on custom user settings policy. Forcing log out...');
              await get().signOut();
              return;
            }
          }
        }
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
          if (!localStorage.getItem('finor_login_timestamp')) {
            localStorage.setItem('finor_login_timestamp', new Date().toISOString());
          }
          set({ loading: true });
          await get().fetchProfile();
          set({ loading: false });

          // Re-enforce policy check on login state refresh
          const loginTs = localStorage.getItem('finor_login_timestamp');
          const maxDays = get().profile?.session_expiry_days ?? 1;
          if (loginTs) {
            const diffTime = Date.now() - new Date(loginTs).getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            if (diffDays > maxDays) {
              console.warn('[authStore] Session expired based on custom user settings policy. Forcing log out...');
              await get().signOut();
              return;
            }
          }
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
      localStorage.removeItem('finor_login_timestamp');
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
      set({ loading: false });
    }
  },
}));
