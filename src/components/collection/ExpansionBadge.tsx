import { IconArrowRight, IconPuzzle } from "@tabler/icons-react";
import type { ExpansionSummary } from "@/hooks/useCollectionData";
import { pluralExpansions } from "@/lib/plural";

interface ExpansionBadgeProps {
  expansions: ExpansionSummary[];
  expanded: boolean;
  /** Разворачивает карточку. Передаёт левую колонку плитки для замера ширины. */
  onToggle: (leftCol: Element | null | undefined) => void;
}

/** Бейдж «+N допов» с превью-кружками — разворачивает карточку игры. */
export default function ExpansionBadge({
  expansions,
  expanded,
  onToggle,
}: ExpansionBadgeProps) {
  return (
    <button
      type="button"
      onClick={(e) =>
        onToggle(e.currentTarget.closest(".tile")?.firstElementChild)
      }
      aria-expanded={expanded}
      className="mt-2 flex items-center -space-x-2 rounded-full p-1 text-left transition hover:bg-brand-soft"
    >
      <span className="rounded-full border-2 border-ink px-2 py-0.5 text-xs font-bold text-ink bg-brand">
        +{expansions.length} {pluralExpansions(expansions.length)}
      </span>
      {expansions.slice(0, 3).map((exp) => (
        <span
          key={exp.gameId}
          className="h-6 w-6 shrink-0 overflow-hidden rounded-full border-2 border-ink bg-brand-soft"
        >
          {exp.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={exp.thumbnailUrl}
              alt={exp.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-ink/40">
              <IconPuzzle size={13} />
            </span>
          )}
        </span>
      ))}
      <span className="flex items-center justify-center h-6 w-6 shrink-0 overflow-hidden rounded-full border-2 border-ink bg-white text-ink">
        <IconArrowRight size={16} />
      </span>
    </button>
  );
}
