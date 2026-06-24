interface GameMetaListProps {
  title: string;
  items: string[];
}

/** Список метаданных BGG (категории/механики) — заголовок + перечисление. */
export default function GameMetaList({ title, items }: GameMetaListProps) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink/55">
        {title}
      </p>
      <p className="text-sm font-medium text-ink/75">{items.join(", ")}</p>
    </div>
  );
}
