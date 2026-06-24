import { IconPlus, IconSettings } from "@tabler/icons-react";
import { colorForKey } from "@/lib/palette";
import type { CollectionSummary } from "@/lib/collections";
import { PILL_CLASS, pillStyle } from "@/components/ui";

interface CollectionTabsProps {
  collections: CollectionSummary[];
  activeId: string;
  isAllView: boolean;
  collectionsLoaded: boolean;
  allGamesCount: number;
  onSelect: (id: string) => void;
  /** Открыть настройки коллекции (только для владельца). */
  onOpenSettings: (id: string) => void;
  onCreate: () => void;
}

/** Ряд вкладок коллекций: «Все игры», пилюли коллекций (с шестерёнкой у
 *  владельца) и кнопка создания новой коллекции. */
export default function CollectionTabs({
  collections,
  activeId,
  isAllView,
  collectionsLoaded,
  allGamesCount,
  onSelect,
  onOpenSettings,
  onCreate,
}: CollectionTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {collectionsLoaded && (
        <button
          onClick={() => onSelect("all")}
          style={pillStyle("#fff", isAllView)}
          className={PILL_CLASS}
        >
          Все игры
          <span className="ml-1 transition-opacity group-hover:opacity-0">
            · {allGamesCount}
          </span>
        </button>
      )}
      {collections.map((c) => {
        const active = activeId === c.id;
        const col = colorForKey(c.id);
        const owner = c.role === "owner";
        return (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(c.id);
              }
            }}
            style={pillStyle(col, active)}
            className={`group relative inline-flex items-center ${PILL_CLASS}`}
          >
            {c.name}
            {owner ? (
              /* Счётчик задаёт ширину (на ховере становится прозрачным),
                 шестерёнка прижата к правому краю пилюли — так пилюля не
                 меняет ширину при наведении. */
              <span className="ml-1 transition-opacity group-hover:opacity-0">
                · {c.gameCount}
              </span>
            ) : (
              <span className="ml-1 inline-flex items-center">
                · {c.gameCount}
                <span className="ml-1 opacity-70">
                  {c.role === "viewer" ? "👁" : "✎"}
                </span>
              </span>
            )}
            {owner && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(c.id);
                  onOpenSettings(c.id);
                }}
                aria-label={`Настройки коллекции «${c.name}»`}
                title="Настройки коллекции"
                style={{ "--badge": col } as React.CSSProperties}
                className="absolute right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-(--badge) hover:text-[#0d0d0d] group-hover:flex"
              >
                <IconSettings size={16} stroke={2.5} />
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={onCreate}
        aria-label="Новая коллекция"
        title="Новая коллекция"
        className="icon-btn h-9 w-9"
      >
        <IconPlus size={18} stroke={2.5} />
      </button>
    </div>
  );
}
