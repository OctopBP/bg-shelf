import type { CSSProperties, ReactNode } from "react";

/** Базовые классы пилюли (вкладки, фильтры) в «rulebook»-стиле. */
export const PILL_CLASS =
  "rounded-full border-[3px] px-3.5 py-1.5 text-sm font-bold transition";

/** Инлайн-цвета пилюли: активная — залита цветом, неактивная — обведена им. */
export function pillStyle(color: string, active: boolean): CSSProperties {
  return active
    ? { backgroundColor: color, borderColor: color, color: "#0d0d0d" }
    : { borderColor: color, color };
}

interface PillProps {
  color: string;
  active: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

/** Переключаемая пилюля-кнопка. Для сложных случаев (вкладка с шестерёнкой)
 *  используйте PILL_CLASS + pillStyle напрямую на нужном элементе. */
export default function Pill({
  color,
  active,
  onClick,
  children,
  className,
}: PillProps) {
  return (
    <button
      onClick={onClick}
      style={pillStyle(color, active)}
      className={`${PILL_CLASS}${className ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );
}
