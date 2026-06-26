"use client";

import { useEffect } from "react";
import { IconX } from "@tabler/icons-react";

interface ModalProps {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** "md" (по умолчанию) — компактные диалоги; "xl" — крупные окна со списками. */
  size?: "md" | "xl";
  /** Доп. контент в шапке рядом с заголовком (например, переключатель). */
  headerExtra?: React.ReactNode;
  /** true (по умолчанию) — модалка сама скроллит весь контент целиком (шапка
   *  всегда видна). false — отдаёт скролл содержимому: используйте, когда
   *  внутри есть свои закреплённые части (например, поиск и пагинация вокруг
   *  скроллящегося списка), чтобы скроллился только список, а не всё окно. */
  bodyScroll?: boolean;
}

const SIZE_CLASS: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "max-w-md",
  xl: "max-w-4xl",
};

export default function Modal({
  title,
  onClose,
  children,
  className,
  size = "md",
  headerExtra,
  bodyScroll = true,
}: ModalProps) {
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
        className={`surface animate-pop-in flex max-h-[85vh] w-full flex-col overflow-hidden p-6 ${SIZE_CLASS[size]} ${className ?? ""}`}
      >
        {(title || headerExtra) && (
          <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
            {title && (
              <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">
                {title}
              </h2>
            )}
            <div className="ml-auto flex items-center gap-3">
              {headerExtra}
              <button
                onClick={onClose}
                aria-label="Закрыть"
                className="icon-btn h-9 w-9 shrink-0"
              >
                <IconX size={18} stroke={2.5} />
              </button>
            </div>
          </div>
        )}
        <div
          className={`flex min-h-0 flex-1 flex-col gap-3 ${bodyScroll ? "overflow-y-auto overscroll-contain" : ""}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
