import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** يطلب نصًا (مثل سبب القرار). القيمة المعادة هي النص أو null عند الإلغاء */
  input?: { label: string; placeholder?: string; required?: boolean; multiline?: boolean; initial?: string };
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: string | boolean | null) => void;
}

interface UIState {
  quickAddOpen: boolean;
  quickAddDefaults: { title?: string; dueDate?: string } | null;
  openQuickAdd: (defaults?: { title?: string; dueDate?: string }) => void;
  closeQuickAdd: () => void;
  confirmState: ConfirmState | null;
  setConfirm: (c: ConfirmState | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  quickAddOpen: false,
  quickAddDefaults: null,
  openQuickAdd: (defaults) => set({ quickAddOpen: true, quickAddDefaults: defaults ?? null }),
  closeQuickAdd: () => set({ quickAddOpen: false, quickAddDefaults: null }),
  confirmState: null,
  setConfirm: (c) => set({ confirmState: c }),
}));

/** نافذة تأكيد عامة تعيد true/false */
export function confirmDialog(opts: Omit<ConfirmOptions, 'input'>): Promise<boolean> {
  return new Promise((resolve) => {
    useUIStore.getState().setConfirm({ ...opts, resolve: (v) => resolve(v === true || typeof v === 'string') });
  });
}

/** نافذة تطلب نصًا (سبب/ملاحظة) وتعيد النص أو null عند الإلغاء */
export function promptDialog(opts: ConfirmOptions & { input: NonNullable<ConfirmOptions['input']> }): Promise<string | null> {
  return new Promise((resolve) => {
    useUIStore.getState().setConfirm({ ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) });
  });
}
