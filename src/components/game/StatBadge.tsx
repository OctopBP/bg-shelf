import type { ReactNode } from "react";

interface StatBadgeProps {
  label: string;
  children: ReactNode;
}

/** Бейдж характеристики игры: значение + подпись (игроки, минуты, рейтинг…). */
export default function StatBadge({ label, children }: StatBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-brand-soft px-3 py-1">
      <span className="inline-flex items-center">{children}</span>
      <span className="text-xs font-semibold text-ink/55">{label}</span>
    </span>
  );
}
