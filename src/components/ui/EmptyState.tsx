import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Крупная иконка-заглушка. */
  icon: ReactNode;
  /** Текст состояния. */
  message: ReactNode;
}

/** Карточка пустого/неуспешного состояния: иконка + текст по центру. */
export default function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className="surface mx-auto mt-4 max-w-md px-6 py-12 text-center">
      <div className="mb-3 flex justify-center text-ink/30">{icon}</div>
      <p className="font-medium text-ink/70">{message}</p>
    </div>
  );
}
