"use client";

import { useEffect } from "react";
import { IconX } from "@tabler/icons-react";

interface ModalProps {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function Modal({ title, onClose, children, className }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`surface animate-pop-in max-h-[85vh] w-full max-w-md overflow-y-auto p-6 ${className ?? ""}`}
      >
        {title && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Закрыть"
              className="icon-btn h-9 w-9 shrink-0"
            >
              <IconX size={18} stroke={2.5} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
