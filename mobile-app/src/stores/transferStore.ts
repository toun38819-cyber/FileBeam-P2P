import { create } from 'zustand';
import type { TransferProgressModel } from '../types';
interface TransferState { active: TransferProgressModel | null; setActive(active: TransferProgressModel | null): void; }
export const useTransferStore = create<TransferState>((set) => ({ active: null, setActive: (active) => set({ active }) }));
