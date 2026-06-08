import { create } from 'zustand';
import type { RoomData } from '../types';
interface RoomState { room: RoomData | null; recents: string[]; setRoom(room: RoomData | null): void; addRecent(code: string): void; }
export const useRoomStore = create<RoomState>((set, get) => ({ room: null, recents: [], setRoom: (room) => set({ room }), addRecent: (code) => set({ recents: [code, ...get().recents.filter((item) => item !== code)].slice(0, 5) }) }));
