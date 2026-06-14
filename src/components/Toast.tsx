"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { LuCheck, LuX, LuTriangleAlert, LuInfo } from "react-icons/lu";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <LuCheck size={14} strokeWidth={2.5} />,
  error:   <LuX size={14} strokeWidth={2.5} />,
  warning: <LuTriangleAlert size={14} strokeWidth={2.5} />,
  info:    <LuInfo size={14} strokeWidth={2.5} />,
};

const COLORS: Record<ToastType, string> = {
  success: "#4CAF50",
  error:   "#D32F2F",
  warning: "#FF8F00",
  info:    "#9E9E9E",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: "fixed", bottom: "5.5rem", left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, display: "flex", flexDirection: "column", gap: "0.5rem",
        alignItems: "center", pointerEvents: "none", width: "min(92vw, 380px)",
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: "#111111",
            color: "#FFFFFF",
            padding: "0.75rem 1.125rem",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            boxShadow: "0 16px 40px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2)",
            width: "100%",
            animation: "slideUp 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
            borderLeft: `3px solid ${COLORS[t.type]}`,
          }}>
            <span style={{ color: COLORS[t.type], flexShrink: 0, display: "flex", alignItems: "center" }}>
              {ICONS[t.type]}
            </span>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.4 }}>{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </ToastContext.Provider>
  );
}
