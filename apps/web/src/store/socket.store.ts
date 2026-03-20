import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@comms/types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketState {
  socket: TypedSocket | null;
  isConnected: boolean;
  connect: (accessToken: string) => void;
  disconnect: () => void;
  emit: <K extends keyof ClientToServerEvents>(event: K, data: Parameters<ClientToServerEvents[K]>[0]) => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,

  connect: (accessToken: string) => {
    const existing = get().socket;
    if (existing?.connected) return;

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002', {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }) as TypedSocket;

    socket.on('connect', () => {
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, isConnected: false });
  },

  emit: (event, data) => {
    const { socket, isConnected } = get();
    if (socket && isConnected) {
      (socket as any).emit(event, data);
    }
  },
}));
