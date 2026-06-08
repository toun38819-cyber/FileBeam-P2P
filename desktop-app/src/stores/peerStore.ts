import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ConnectionMode, ConnectionStatus, DeviceInfo } from '@/types';

interface PeerState {
  peer: DeviceInfo | null;
  status: ConnectionStatus;
  mode: ConnectionMode;
  ping: number;
  speedMBps: number;
  setPeer(peer: DeviceInfo | null): void;
  setStatus(status: ConnectionStatus): void;
  setMode(mode: ConnectionMode): void;
  setMetrics(ping: number, speedMBps: number): void;
}

const storage = createJSONStorage(() => localStorage);

export const usePeerStore = create<PeerState>()(
  persist(
    (set) => ({
      peer: null,
      status: 'disconnected',
      mode: 'local',
      ping: 0,
      speedMBps: 0,
      setPeer: (peer) => set({ peer }),
      setStatus: (status) => set({ status }),
      setMode: (mode) => set({ mode }),
      setMetrics: (ping, speedMBps) => set({ ping, speedMBps }),
    }),
    {
      name: 'filebeam-peer-store',
      storage,
      partialize: (state) => ({
        peer: state.peer,
        status: state.status === 'connecting' || state.status === 'reconnecting' ? 'disconnected' : state.status,
        mode: state.mode,
        ping: state.ping,
        speedMBps: state.speedMBps,
      }),
    },
  ),
);
