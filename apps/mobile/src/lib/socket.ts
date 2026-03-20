import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type { ClientToServerEvents, ServerToClientEvents } from '@comms/types';

const API_URL = (Constants.expoConfig?.extra?.apiUrl as string) ?? 'http://localhost:3000';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket | null {
  return socket;
}

export async function connectSocket(): Promise<AppSocket> {
  if (socket?.connected) return socket;

  const token = await SecureStore.getItemAsync('accessToken');

  socket = io(API_URL, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  }) as AppSocket;

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export { socket };
