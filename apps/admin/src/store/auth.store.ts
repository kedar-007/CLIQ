import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN';
  avatarUrl?: string;
}

interface AuthState {
  adminUser: AdminUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (token: string, user: AdminUser) => void;
  logout: () => void;
  setToken: (token: string) => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      adminUser: null,
      accessToken: null,
      isAuthenticated: false,

      login: (token, user) =>
        set({
          accessToken: token,
          adminUser: user,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          accessToken: null,
          adminUser: null,
          isAuthenticated: false,
        }),

      setToken: (token) =>
        set({
          accessToken: token,
        }),
    }),
    {
      name: 'admin-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        adminUser: state.adminUser,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
