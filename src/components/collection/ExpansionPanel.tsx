import Link from "next/link";
import { IconPuzzle } from "@tabler/icons-react";
import type { ExpansionSummary } from "@/hooks/useCollectionData";

interface ExpansionPanelProps {
  expansions: ExpansionSummary[];
  /** Левый край панели = ширине левой части карточки (фикс при анимации). */
  leftColWidth: number | null;
  expanded: boolean;
}

/** Выезжающая справа панель со списком дополнений базовой игры. */
export default function ExpansionPanel({
  expansions,
  leftColWidth,
  expanded,
}: ExpansionPanelProps) {
  return (
    <div
      aria-hidden={!expanded}
      style={leftColWidth != null ? { left: `${leftColWidth}px` } : undefined}
      className="absolute bottom-0 right-0 top-0 flex flex-col gap-1 overflow-y-auto border-l-[3px] border-ink bg-brand-soft/30 p-2"
    >
      {expansions.map((exp, idx) => (
        <Link
          key={exp.gameId}
          href={`/game/${exp.gameId}?c=${exp.collectionId}`}
          className={`flex items-center gap-1 ${idx === 0 ? "rounded-tr-lg" : ""} ${idx === expansions.length - 1 ? "rounded-br-lg" : ""} border-3 border-ink bg-white transition hover:bg-brand hover:text-white`}
        >
          <span className="relative h-14 w-14 shrink-0 overflow-hidden border-r-3 border-ink bg-brand-soft">
            {exp.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={exp.thumbnailUrl}
                alt={exp.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-ink/30">
                <IconPuzzle size={20} />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1 line-clamp-2 leading-none text-xs font-bold">
            {exp.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
