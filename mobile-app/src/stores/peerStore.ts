import { create } from 'zustand';
import type { ConnectionMode, DeviceInfo } from '../types';
interface PeerState { peer: DeviceInfo | null; mode: ConnectionMode; connected: boolean; setPeer(peer: DeviceInfo | null): void; setMode(mode: ConnectionMode): void; setConnected(connected: boolean): void; }
export const usePeerStore = create<PeerState>((set) => ({ peer: null, mode: 'local', connected: false, setPeer: (peer) => set({ peer }), setMode: (mode) => set({ mode }), setConnected: (connected) => set({ connected }) }));
