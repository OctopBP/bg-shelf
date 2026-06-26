interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** Переключатель «вкл/выкл» с подписью — для бинарных режимов (например,
 *  «Умный поиск» в окне добавления игр). */
export default function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm font-bold text-ink"
    >
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-ink p-0.5 transition-colors ${
          checked ? "justify-end bg-brand" : "justify-start bg-black/10"
        }`}
      >
        <span className="h-4 w-4 rounded-full border-2 border-ink bg-white" />
      </span>
      {label}
    </button>
  );
}
