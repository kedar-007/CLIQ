'use client';
import { useEffect } from 'react';
import { useSocketStore } from '@/store/socket.store';
import { useAuthStore } from '@/store/auth.store';

export function useSocket() {
  const socket = useSocketStore(s => s.socket);
  const connected = useSocketStore(s => s.isConnected);
  const connect = useSocketStore(s => s.connect);
  const disconnect = useSocketStore(s => s.disconnect);
  const accessToken = useAuthStore(s => s.accessToken);

  useEffect(() => {
    if (accessToken && !connected) {
      connect(accessToken);
    }
  }, [accessToken, connected, connect]);

  const emit = (event: string, data?: unknown) => {
    if (socket?.connected) {
      (socket as any).emit(event, data);
    }
  };

  const on = (event: string, handler: (...args: unknown[]) => void) => {
    (socket as any)?.on(event, handler);
    return () => {
      (socket as any)?.off(event, handler);
    };
  };

  return { socket, connected, emit, on, disconnect };
}
