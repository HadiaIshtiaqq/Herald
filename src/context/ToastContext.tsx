import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { CheckCircle2, XCircle, AlertCircle, AlertTriangle } from "lucide-react";

export type ToastType = "error" | "info" | "success" | "warning";
interface Toast { id: number; msg: string; type: ToastType }
interface ToastContextValue { showToast: (msg: string, type?: ToastType) => void }

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const showToast = useCallback((msg: string, type: ToastType = "error") => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const dismiss = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => {
            const cfg = {
              error:   { bg: "bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-800",     text: "text-red-700 dark:text-red-300",     Icon: XCircle },
              success: { bg: "bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 },
              info:    { bg: "bg-blue-50 dark:bg-blue-950/90 border-blue-200 dark:border-blue-800",  text: "text-blue-700 dark:text-blue-300",   Icon: AlertCircle },
              warning: { bg: "bg-amber-50 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-300", Icon: AlertTriangle },
            }[t.type];
            return (
              <div
                key={t.id}
                onClick={() => dismiss(t.id)}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold cursor-pointer pointer-events-auto max-w-xs animate-in slide-in-from-right duration-200 ${cfg.bg} ${cfg.text}`}
              >
                <cfg.Icon className="w-4 h-4 shrink-0" />
                <span>{t.msg}</span>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}
