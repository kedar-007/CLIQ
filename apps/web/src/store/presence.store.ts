import { create } from 'zustand';
import type { UserStatus } from '@comms/types';

interface PresenceState {
  presence: Record<string, { status: UserStatus; lastSeen?: Date; customStatusEmoji?: string; customStatusText?: string }>;
  updatePresence: (userId: string, data: { status: UserStatus; lastSeen?: Date; customStatusEmoji?: string; customStatusText?: string }) => void;
  getStatus: (userId: string) => UserStatus;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  presence: {},

  updatePresence: (userId, data) =>
    set((state) => ({
      presence: { ...state.presence, [userId]: data },
    })),

  getStatus: (userId) => get().presence[userId]?.status || 'OFFLINE',
}));
