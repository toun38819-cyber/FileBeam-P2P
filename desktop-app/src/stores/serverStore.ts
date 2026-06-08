import { create } from 'zustand';

export type ServerBannerTone = 'info' | 'success' | 'warning' | 'error';
export type ServerLifecycleStatus = 'starting' | 'running' | 'reconnecting' | 'offline' | 'recovered';

export interface ServerBanner {
  id: number;
  tone: ServerBannerTone;
  title: string;
  message: string;
}

interface ServerState {
  running: boolean;
  status: ServerLifecycleStatus;
  port: number | null;
  activeTransfers: number;
  pausedTransfers: number;
  lastRecoveryAt: number | null;
  banner: ServerBanner | null;
  setHealth(payload: { running: boolean; port: number | null; activeTransfers?: number; pausedTransfers?: number; status?: ServerLifecycleStatus }): void;
  setStatus(status: ServerLifecycleStatus): void;
  markRecovered(port: number | null, activeTransfers?: number, pausedTransfers?: number): void;
  showBanner(tone: ServerBannerTone, title: string, message: string): void;
  clearBanner(): void;
}

export const useServerStore = create<ServerState>((set) => ({
  running: false,
  status: 'starting',
  port: null,
  activeTransfers: 0,
  pausedTransfers: 0,
  lastRecoveryAt: null,
  banner: null,
  setHealth: ({ running, port, activeTransfers = 0, pausedTransfers = 0, status }) => set((state) => ({
    running,
    port,
    activeTransfers,
    pausedTransfers,
    status: status ?? (running ? (state.status === 'recovered' ? 'recovered' : 'running') : 'offline'),
  })),
  setStatus: (status) => set({ status }),
  markRecovered: (port, activeTransfers = 0, pausedTransfers = 0) => set({
    running: true,
    port,
    activeTransfers,
    pausedTransfers,
    status: 'recovered',
    lastRecoveryAt: Date.now(),
  }),
  showBanner: (tone, title, message) => set({
    banner: {
      id: Date.now(),
      tone,
      title,
      message,
    },
  }),
  clearBanner: () => set({ banner: null }),
}));
