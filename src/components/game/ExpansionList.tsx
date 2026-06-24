import Link from "next/link";
import { IconPuzzle } from "@tabler/icons-react";
import type { ExpansionSummary } from "@/lib/collection";

interface ExpansionListProps {
  expansions: ExpansionSummary[];
}

/** Блок «Дополнения в коллекции» на странице игры: карточки-ссылки с превью. */
export default function ExpansionList({ expansions }: ExpansionListProps) {
  if (expansions.length === 0) return null;
  return (
    <div className="surface space-y-3 px-5 py-5 sm:px-7 sm:py-6">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink/55">
        Дополнения в коллекции · {expansions.length}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {expansions.map((exp) => (
          <Link
            key={exp.gameId}
            href={`/game/${exp.gameId}?c=${exp.collectionId}`}
            className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-brand-soft/40 p-2 transition hover:bg-brand-soft"
          >
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 border-ink bg-brand-soft">
              {exp.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={exp.thumbnailUrl}
                  alt={exp.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-ink/30">
                  <IconPuzzle size={22} />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
              {exp.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
