"use client";

import { useEffect, useState } from "react";
import { IconX, IconLoader2 } from "@tabler/icons-react";
import { CandidateCard } from "./add-games";
import { pluralGames } from "@/lib/plural";
import type {
  ResolvedGame,
  CandidateDetails,
  GameState,
} from "./add-games/types";

// Реэкспорт для потребителей (CollectionApp импортирует ResolvedGame отсюда).
export type {
  ResolvedGame,
  ResolvedCandidate,
  ResolvedExpansion,
} from "./add-games/types";

interface AddGamesDialogProps {
  games: ResolvedGame[];
  collectionId: string;
  /** Уже существующие теги для подсказок выбора. */
  suggestedTags: string[];
  onClose: () => void;
  onAdded: () => void;
  onStatus: (message: string) => void;
}

export default function AddGamesDialog({
  games,
  collectionId,
  suggestedTags,
  onClose,
  onAdded,
  onStatus,
}: AddGamesDialogProps) {
  const [adding, setAdding] = useState(false);
  const [states, setStates] = useState<GameState[]>(() =>
    games.map((g) => ({
      enabled: !g.notFound,
      selectedBggId: g.candidates[0]?.bggId ?? null,
      tags: [...g.tags],
      tagDraft: "",
      chosenExpansions: new Set<number>(),
    }))
  );
  // Кэш данных кандидатов: предзаполняем лучшим кандидатом из предложения.
  const [details, setDetails] = useState<Record<number, CandidateDetails>>(
    () => {
      const seed: Record<number, CandidateDetails> = {};
      for (const g of games) {
        const top = g.candidates[0];
        if (top) {
          seed[top.bggId] = {
            name: top.name,
            yearPublished: top.yearPublished,
            thumbnailUrl: g.thumbnailUrl,
            expansions: g.expansions,
          };
        }
      }
      return seed;
    }
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !adding) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, adding]);

  function patch(index: number, p: Partial<GameState>) {
    setStates((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...p } : s))
    );
  }

  /** Добавляет тег к игре (из черновика или подсказки), без дублей. */
  function addTag(index: number, raw: string) {
    const tag = raw.trim().toLowerCase();
    setStates((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (!tag || s.tags.includes(tag)) return { ...s, tagDraft: "" };
        return { ...s, tags: [...s.tags, tag], tagDraft: "" };
      })
    );
  }

  function removeTag(index: number, tag: string) {
    setStates((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, tags: s.tags.filter((t) => t !== tag) } : s
      )
    );
  }

  /** Выбор другого кандидата: грузим его данные, если ещё не в кэше. */
  async function selectCandidate(index: number, bggId: number) {
    patch(index, { selectedBggId: bggId, chosenExpansions: new Set() });
    if (details[bggId]) return;
    setDetails((prev) => ({
      ...prev,
      [bggId]: { name: "", yearPublished: null, thumbnailUrl: null, expansions: [], loading: true },
    }));
    try {
      const res = await fetch(`/api/bgg/details?id=${bggId}`);
      const data = await res.json();
      if (res.ok) {
        setDetails((prev) => ({
          ...prev,
          [bggId]: {
            name: data.name,
            yearPublished: data.yearPublished ?? null,
            thumbnailUrl: data.thumbnailUrl ?? null,
            expansions: data.expansions ?? [],
          },
        }));
        return;
      }
    } catch {
      /* ниже снимем loading */
    }
    setDetails((prev) => ({
      ...prev,
      [bggId]: { name: "", yearPublished: null, thumbnailUrl: null, expansions: [], loading: false },
    }));
  }

  function toggleExpansion(index: number, bggId: number) {
    setStates((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const next = new Set(s.chosenExpansions);
        if (next.has(bggId)) next.delete(bggId);
        else next.add(bggId);
        return { ...s, chosenExpansions: next };
      })
    );
  }

  async function confirm() {
    const items: Array<{ bggId: number; tags?: string[] }> = [];
    states.forEach((s) => {
      if (!s.enabled || s.selectedBggId === null) return;
      const tags = s.tags;
      items.push({ bggId: s.selectedBggId, tags });
      for (const expId of s.chosenExpansions) {
        items.push({ bggId: expId, tags });
      }
    });

    if (items.length === 0) {
      onClose();
      return;
    }

    setAdding(true);
    onStatus("Добавляю игры…");
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка добавления");
      onStatus(
        `Добавлено: ${data.added.join(", ")}` +
          (data.failed.length ? `. Не удалось: ${data.failed.length}` : "")
      );
      onAdded();
      onClose();
    } catch (e) {
      onStatus(e instanceof Error ? e.message : "Ошибка добавления");
      setAdding(false);
    }
  }

  const selectedCount = states.filter(
    (s) => s.enabled && s.selectedBggId !== null
  ).length;
  const expansionCount = states.reduce(
    (n, s) => n + (s.enabled ? s.chosenExpansions.size : 0),
    0
  );
  const total = selectedCount + expansionCount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={() => !adding && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="surface animate-pop-in max-h-[85vh] w-full max-w-2xl overflow-y-auto overscroll-contain p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">
            Нашёл {games.length} {pluralGames(games.length)} — что добавить?
          </h2>
          <button
            onClick={() => !adding && onClose()}
            aria-label="Закрыть"
            className="icon-btn h-9 w-9 shrink-0"
          >
            <IconX size={18} stroke={2.5} />
          </button>
        </div>

        <div className="space-y-3">
          {games.map((game, i) => {
            const s = states[i];
            const d =
              s.selectedBggId !== null ? details[s.selectedBggId] : undefined;
            return (
              <CandidateCard
                key={i}
                game={game}
                state={s}
                details={d}
                suggestedTags={suggestedTags}
                onToggleEnabled={() => patch(i, { enabled: !s.enabled })}
                onSelectCandidate={(bggId) => selectCandidate(i, bggId)}
                onAddTag={(raw) => addTag(i, raw)}
                onRemoveTag={(tag) => removeTag(i, tag)}
                onDraftChange={(value) => patch(i, { tagDraft: value })}
                onToggleExpansion={(bggId) => toggleExpansion(i, bggId)}
              />
            );
          })}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={confirm}
            disabled={adding || total === 0}
            className="btn btn-brand flex-1 py-2.5"
          >
            {adding ? (
              <>
                <IconLoader2 size={18} className="mr-1.5 animate-spin" />
                Добавляю…
              </>
            ) : total === 0 ? (
              "Ничего не выбрано"
            ) : (
              `Добавить (${total})`
            )}
          </button>
          <button
            onClick={() => !adding && onClose()}
            disabled={adding}
            className="btn btn-ghost px-4 py-2.5"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
