import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { HistoryEntry, TransferItem, TransferProgressModel } from '@/types';

interface TransferState {
  queue: TransferItem[];
  active: TransferProgressModel | null;
  history: HistoryEntry[];
  speedSeries: number[];
  addFiles(files: TransferItem[]): void;
  removeFile(id: string): void;
  clearQueue(): void;
  setActive(active: TransferProgressModel | null): void;
  addHistory(entry: HistoryEntry): void;
  resetSpeedSeries(): void;
  pushSpeed(speedMBps: number): void;
  restoreQueue(items: TransferItem[]): void;
}

const storage = createJSONStorage(() => localStorage);

export const useTransferStore = create<TransferState>()(
  persist(
    (set) => ({
      queue: [],
      active: null,
      history: [],
      speedSeries: [0],
      addFiles: (files) => set((state) => ({ queue: [...state.queue, ...files] })),
      removeFile: (id) => set((state) => ({ queue: state.queue.filter((file) => file.id !== id) })),
      clearQueue: () => set({ queue: [] }),
      setActive: (active) => set({ active }),
      addHistory: (entry) => set((state) => ({ history: [entry, ...state.history] })),
      resetSpeedSeries: () => set({ speedSeries: [0] }),
      pushSpeed: (speedMBps) => set((state) => ({ speedSeries: [...state.speedSeries.slice(-59), speedMBps] })),
      restoreQueue: (items) => set({ queue: items }),
    }),
    {
      name: 'filebeam-transfer-store',
      storage,
      partialize: (state) => {
        const persistedQueue = state.queue
          .filter((item) => Boolean(item.path))
          .map(({ file: _file, ...item }) => item);
        const persistableIds = new Set(persistedQueue.map((item) => item.id));
        const persistedActive = state.active && ((state.active.direction === 'send' && persistableIds.has(state.active.transferId)) || state.active.direction === 'receive')
          ? state.active
          : null;
        return {
          queue: persistedQueue,
          active: persistedActive,
          history: state.history.slice(0, 250),
          speedSeries: [0],
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<TransferState>;
        return {
          ...currentState,
          ...persisted,
          queue: persisted.queue ?? currentState.queue,
          active: persisted.active ?? currentState.active,
          history: persisted.history ?? currentState.history,
          speedSeries: [0],
        };
      },
    },
  ),
);
