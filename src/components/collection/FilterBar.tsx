import { colorForKey } from "@/lib/palette";
import { Pill } from "@/components/ui";
import type { QuickFilter } from "./types";

interface FilterBarProps {
  quickFilters: QuickFilter[];
  activeQuickKey: string | null;
  onQuickToggle: (key: string) => void;
  allTags: string[];
  tagFilters: string[];
  onTagToggle: (tag: string) => void;
}

/** Полоса фильтров: быстрые фильтры по данным BGG и фильтр по тегам. */
export default function FilterBar({
  quickFilters,
  activeQuickKey,
  onQuickToggle,
  allTags,
  tagFilters,
  onTagToggle,
}: FilterBarProps) {
  if (quickFilters.length === 0 && allTags.length === 0) return null;
  return (
    <div className="space-y-6">
      {/* Быстрые фильтры по данным BGG */}
      {quickFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((f) => (
            <Pill
              key={f.key}
              color={colorForKey(f.key)}
              active={activeQuickKey === f.key}
              onClick={() => onQuickToggle(f.key)}
            >
              {f.label}
            </Pill>
          ))}
        </div>
      )}

      {/* Фильтр по тегам */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <Pill
              key={tag}
              color={colorForKey(tag)}
              active={tagFilters.includes(tag)}
              onClick={() => onTagToggle(tag)}
            >
              {tag}
            </Pill>
          ))}
        </div>
      )}
    </div>
  );
}
