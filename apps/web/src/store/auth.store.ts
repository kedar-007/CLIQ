import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@comms/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  login: (user: User, accessToken: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setAccessToken: (token: string) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  bootstrapSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      hasHydrated: false,

      login: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),

      logout: () => {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        set({ user: null, accessToken: null, isAuthenticated: false });
        if (typeof window !== 'undefined') window.location.href = '/login';
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      setAccessToken: (accessToken) => set({ accessToken }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      bootstrapSession: async () => {
        const state = useAuthStore.getState();
        if (state.accessToken) return;

        try {
          const refreshRes = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
          });

          if (!refreshRes.ok) {
            set({ user: null, accessToken: null, isAuthenticated: false });
            return;
          }

          const refreshJson = await refreshRes.json();
          const accessToken = refreshJson?.data?.accessToken;
          if (!accessToken) {
            set({ user: null, accessToken: null, isAuthenticated: false });
            return;
          }

          const meRes = await fetch('/api/auth/me', {
            credentials: 'include',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!meRes.ok) {
            set({ user: null, accessToken: null, isAuthenticated: false });
            return;
          }

          const meJson = await meRes.json();
          set({
            accessToken,
            user: meJson.data,
            isAuthenticated: true,
          });
        } catch {
          set({ user: null, accessToken: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: 'comms-auth',
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
