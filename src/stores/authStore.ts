import { create } from 'zustand';
import type { ID } from '@/types/entities';

interface AuthState {
  /** ملف العمل الذي سجّل الدخول في هذا التبويب (null = شاشة الدخول) */
  userId: ID | null;
  setUser: (id: ID | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  setUser: (userId) => set({ userId }),
}));
