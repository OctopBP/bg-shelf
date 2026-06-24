import { IconPlus } from "@tabler/icons-react";

interface TagInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Зафиксировать черновик как тег (по Enter или кнопке «+»). */
  onSubmit: () => void;
  /** sm — компактный (в диалоге добавления), md — крупнее (в детали игры). */
  size?: "sm" | "md";
  placeholder?: string;
}

const SIZES = {
  sm: { input: "w-24 px-2.5 py-1 text-xs", btn: "h-6 w-6", icon: 13 },
  md: { input: "w-28 px-2.5 py-1 text-sm", btn: "h-7 w-7", icon: 15 },
} as const;

/** Поле ввода нового тега с кнопкой «+» (Enter тоже добавляет). */
export default function TagInput({
  value,
  onChange,
  onSubmit,
  size = "md",
  placeholder = "новый тег",
}: TagInputProps) {
  const s = SIZES[size];
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        className={`field ${s.input}`}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim()}
        aria-label="Добавить тег"
        className={`icon-btn ${s.btn} disabled:opacity-40`}
      >
        <IconPlus size={s.icon} stroke={3} />
      </button>
    </span>
  );
}
