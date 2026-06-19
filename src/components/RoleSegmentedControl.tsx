"use client";

import type { CollectionRole } from "@/lib/collections";

type InviteRole = Exclude<CollectionRole, "owner">;

const ROLE_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: "editor", label: "Полный доступ" },
  { value: "viewer", label: "Только просмотр" },
];

interface RoleSegmentedControlProps {
  value: InviteRole;
  onChange: (role: InviteRole) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/** Выбор доступа приглашённого участника: «Полный доступ» или «Только просмотр». */
export default function RoleSegmentedControl({
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: RoleSegmentedControlProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex gap-1 rounded-full border-2 border-ink/15 bg-black/[0.04] p-1 ${className ?? ""}`}
    >
      {ROLE_OPTIONS.map(({ value: v, label }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            disabled={disabled}
            aria-pressed={active}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
              active ? "bg-ink text-white" : "text-ink/60 hover:text-ink"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
