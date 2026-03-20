'use client';
import { usePresenceStore } from '@/store/presence.store';
import { useSocket } from './use-socket';

export type PresenceStatus = 'ONLINE' | 'AWAY' | 'BUSY' | 'DND' | 'OFFLINE';

const STATUS_COLORS: Record<PresenceStatus, string> = {
  ONLINE: 'bg-green-500',
  AWAY: 'bg-yellow-500',
  BUSY: 'bg-orange-500',
  DND: 'bg-red-500',
  OFFLINE: 'bg-gray-400',
};

const STATUS_LABELS: Record<PresenceStatus, string> = {
  ONLINE: 'Online',
  AWAY: 'Away',
  BUSY: 'Busy',
  DND: 'Do Not Disturb',
  OFFLINE: 'Offline',
};

export function usePresence(userId?: string) {
  const { emit } = useSocket();
  const presence = usePresenceStore(s => s.presence);
  const presenceMap = presence;

  const status: PresenceStatus = userId
    ? ((presence[userId]?.status as PresenceStatus) ?? 'OFFLINE')
    : 'OFFLINE';

  const setStatus = (newStatus: PresenceStatus) => {
    emit('presence:update', { status: newStatus });
  };

  const getStatusColor = (s: PresenceStatus) => STATUS_COLORS[s] ?? STATUS_COLORS.OFFLINE;
  const getStatusLabel = (s: PresenceStatus) => STATUS_LABELS[s] ?? 'Offline';

  return {
    status,
    setStatus,
    getStatusColor,
    getStatusLabel,
    presenceMap,
    allStatuses: ['ONLINE', 'AWAY', 'BUSY', 'DND', 'OFFLINE'] as PresenceStatus[],
  };
}
