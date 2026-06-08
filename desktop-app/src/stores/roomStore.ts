import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RoomData } from '@/types';

interface RoomState {
  room: RoomData | null;
  hosting: boolean;
  recentRooms: string[];
  savedRooms: Record<string, RoomData>;
  setRoom(room: RoomData | null): void;
  setHosting(hosting: boolean): void;
  remember(code: string): void;
  saveRoom(room: RoomData): void;
}

const storage = createJSONStorage(() => localStorage);

export const useRoomStore = create<RoomState>()(
  persist(
    (set, get) => ({
      room: null,
      hosting: true,
      recentRooms: [],
      savedRooms: {},
      setRoom: (room) => set({ room }),
      setHosting: (hosting) => set({ hosting }),
      remember: (code) => set({ recentRooms: [code, ...get().recentRooms.filter((item) => item !== code)].slice(0, 5) }),
      saveRoom: (room) => set((state) => ({
        savedRooms: {
          ...state.savedRooms,
          [room.room_id]: room,
          [room.room_code]: room,
        },
        recentRooms: [room.room_id, ...state.recentRooms.filter((item) => item !== room.room_id)].slice(0, 5),
      })),
    }),
    {
      name: 'filebeam-room-store',
      storage,
      partialize: (state) => ({
        room: state.room,
        hosting: state.hosting,
        recentRooms: state.recentRooms,
        savedRooms: state.savedRooms,
      }),
    },
  ),
);
