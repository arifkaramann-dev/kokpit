import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Uygulama genelinde tek bir onay diyaloğu: native window.confirm() yerine
 * shadcn AlertDialog. `const confirm = useConfirm()` ile çağrılır ve kullanıcı
 * seçimine göre çözülen bir Promise<boolean> döner.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(o => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={o => { if (!o) settle(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title ?? "Emin misiniz?"}</AlertDialogTitle>
            {opts.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts.cancelText ?? "Vazgeç"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={
                opts.destructive
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
            >
              {opts.confirmText ?? "Onayla"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm, ConfirmProvider içinde kullanılmalı");
  return ctx;
}
