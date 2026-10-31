import { useEffect, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/form';

/** نافذة التأكيد/طلب السبب العامة (تُستدعى عبر confirmDialog / promptDialog) */
export function ConfirmHost() {
  const state = useUIStore((s) => s.confirmState);
  const setConfirm = useUIStore((s) => s.setConfirm);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(state?.input?.initial ?? '');
    setError(null);
  }, [state]);

  if (!state) return null;

  const finish = (result: string | boolean | null) => {
    state.resolve(result);
    setConfirm(null);
  };

  const onConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (state.input) {
      if (state.input.required && !value.trim()) {
        setError('هذا الحقل إلزامي');
        return;
      }
      finish(value.trim());
    } else finish(true);
  };

  return (
    <AlertDialog.Root open onOpenChange={(o) => !o && finish(state.input ? null : false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <AlertDialog.Content
          dir="rtl"
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl"
        >
          <form onSubmit={onConfirm}>
            <AlertDialog.Title className="text-base font-semibold">{state.title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{state.description ?? ' '}</AlertDialog.Description>
            {state.input && (
              <div className="mt-4 flex flex-col gap-1.5">
                <Label htmlFor="confirm-input">
                  {state.input.label}
                  {state.input.required && <span className="text-danger"> *</span>}
                </Label>
                {state.input.multiline ? (
                  <Textarea
                    id="confirm-input"
                    autoFocus
                    value={value}
                    placeholder={state.input.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    aria-invalid={!!error}
                  />
                ) : (
                  <Input
                    id="confirm-input"
                    autoFocus
                    value={value}
                    placeholder={state.input.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    aria-invalid={!!error}
                  />
                )}
                {error && (
                  <p role="alert" className="text-xs text-danger">
                    {error}
                  </p>
                )}
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">{state.cancelText ?? 'إلغاء'}</Button>
              </AlertDialog.Cancel>
              <Button type="submit" variant={state.destructive ? 'destructive' : 'default'} autoFocus={!state.input}>
                {state.confirmText ?? 'تأكيد'}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
