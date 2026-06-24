import { IconX } from "@tabler/icons-react";
import { colorForKey } from "@/lib/palette";

interface TagProps {
  /** Текст тега. Цвет фона выводится из него детерминированно. */
  label: string;
  /** Размер чипа: sm — на карточке, md — компактный с крестиком, lg — в детали. */
  size?: "sm" | "md" | "lg";
  /** Если задан — рисует крестик удаления. */
  onRemove?: () => void;
}

const SIZE_CLASS: Record<NonNullable<TagProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-2.5 py-0.5 text-sm",
};

/** Маленький цветной чип-тег в «rulebook»-стиле. Цвет — по colorForKey(label). */
export default function Tag({ label, size = "sm", onRemove }: TagProps) {
  return (
    <span
      style={{ backgroundColor: colorForKey(label) }}
      className={`inline-flex items-center gap-1 rounded-full border-2 border-ink font-bold text-ink ${SIZE_CLASS[size]}`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать тег ${label}`}
          className="-mr-1 rounded-full p-0.5 hover:bg-ink/15"
        >
          <IconX size={size === "lg" ? 13 : 12} stroke={3} />
        </button>
      )}
    </span>
  );
}
