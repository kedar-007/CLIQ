import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@comms/types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function resolveChatSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL;

  if (typeof window === 'undefined') {
    return configured || 'http://localhost:3002';
  }

  const hostname = window.location.hostname;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  if (!configured) {
    return `${protocol}//${hostname}:3002`;
  }

  try {
    const url = new URL(configured);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname) && !['localhost', '127.0.0.1'].includes(hostname)) {
      url.hostname = hostname;
    }
    url.protocol = protocol;
    return url.toString();
  } catch {
    return `${protocol}//${hostname}:3002`;
  }
}

function resolveChatSocketPath(): string {
  return process.env.NEXT_PUBLIC_WS_PATH || '/socket.io';
}

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
    if (existing) {
      existing.removeAllListeners();
      existing.disconnect();
    }

    const socket = io(resolveChatSocketUrl(), {
      auth: { token: accessToken },
      path: resolveChatSocketPath(),
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
