"use client";

import { useEffect, useState } from "react";
import {
  IconX,
  IconCheck,
  IconDice5Filled,
  IconLoader2,
  IconPlus,
  IconPuzzle,
} from "@tabler/icons-react";
import { colorForKey } from "@/lib/palette";

// Типы зеркалят JSON из /api/command (kind: "proposal"). Держим их здесь,
// как и PhotoInput держит свои — чтобы не тянуть серверный lib в клиентский бандл.
export interface ResolvedCandidate {
  bggId: number;
  name: string;
  yearPublished: number | null;
  isExpansion: boolean;
}

export interface ResolvedExpansion {
  bggId: number;
  name: string;
  thumbnailUrl: string | null;
}

export interface ResolvedGame {
  requestedAs: string;
  searchQuery: string;
  tags: string[];
  candidates: ResolvedCandidate[];
  thumbnailUrl: string | null;
  expansions: ResolvedExpansion[];
  notFound: boolean;
}

interface AddGamesDialogProps {
  games: ResolvedGame[];
  collectionId: string;
  /** Уже существующие теги для подсказок выбора. */
  suggestedTags: string[];
  onClose: () => void;
  onAdded: () => void;
  onStatus: (message: string) => void;
}

/** Подгружённые с BGG данные конкретного кандидата (по bggId). */
interface CandidateDetails {
  name: string;
  yearPublished: number | null;
  thumbnailUrl: string | null;
  expansions: ResolvedExpansion[];
  loading?: boolean;
}

interface GameState {
  enabled: boolean;
  selectedBggId: number | null;
  tags: string[];
  tagDraft: string;
  /** bggId выбранных для добавления дополнений. */
  chosenExpansions: Set<number>;
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
        className="surface animate-pop-in max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">
            Нашёл {games.length}{" "}
            {plural(games.length, "игру", "игры", "игр")} — что добавить?
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
            const selBgg = s.selectedBggId;
            const d = selBgg !== null ? details[selBgg] : undefined;
            const selCandidate = game.candidates.find(
              (c) => c.bggId === selBgg
            );
            const name = d?.name || selCandidate?.name || game.requestedAs;
            const year = d?.yearPublished ?? selCandidate?.yearPublished ?? null;
            const expansions = d?.expansions ?? [];

            return (
              <div
                key={i}
                className={`rounded-2xl border-2 border-ink p-3 transition ${
                  s.enabled ? "bg-black/[0.04]" : "bg-black/[0.02] opacity-60"
                }`}
              >
                <div className="flex gap-3">
                  {/* Обложка / переключатель «добавлять?» */}
                  <button
                    type="button"
                    onClick={() =>
                      !game.notFound && patch(i, { enabled: !s.enabled })
                    }
                    disabled={game.notFound}
                    aria-label={s.enabled ? "Не добавлять" : "Добавить"}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-ink bg-brand-soft"
                  >
                    {d?.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.thumbnailUrl}
                        alt={name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-ink/30">
                        {d?.loading ? (
                          <IconLoader2 size={24} className="animate-spin" />
                        ) : (
                          <IconDice5Filled size={28} />
                        )}
                      </div>
                    )}
                    {s.enabled && !game.notFound && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink bg-brand text-white">
                        <IconCheck size={12} stroke={3} />
                      </span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <h3 className="truncate font-bold text-ink" title={name}>
                        {name}
                      </h3>
                      {year && (
                        <span className="shrink-0 text-xs font-medium text-ink/45">
                          {year}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-ink/45">
                      запрос: «{game.requestedAs}»
                    </p>

                    {game.notFound ? (
                      <p className="mt-1 text-sm font-medium text-coral">
                        В BGG не найдено
                      </p>
                    ) : (
                      <>
                        {/* Альтернативы — если кандидатов больше одного */}
                        {game.candidates.length > 1 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {game.candidates.map((c) => {
                              const active = c.bggId === selBgg;
                              return (
                                <button
                                  key={c.bggId}
                                  type="button"
                                  onClick={() => selectCandidate(i, c.bggId)}
                                  className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-0.5 text-xs font-bold transition ${
                                    active
                                      ? "border-ink bg-ink text-white"
                                      : "border-ink/30 text-ink/70 hover:border-ink"
                                  }`}
                                  title={
                                    c.isExpansion ? `Дополнение: ${c.name}` : c.name
                                  }
                                >
                                  {c.isExpansion && (
                                    <IconPuzzle
                                      size={13}
                                      stroke={2.5}
                                      className="shrink-0 opacity-80"
                                      aria-label="дополнение"
                                    />
                                  )}
                                  <span>
                                    {c.name}
                                    {c.yearPublished
                                      ? ` (${c.yearPublished})`
                                      : ""}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Теги: чипы + поле ввода + подсказки */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {s.tags.map((tag) => (
                            <span
                              key={tag}
                              style={{ backgroundColor: colorForKey(tag) }}
                              className="inline-flex items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold text-ink"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => removeTag(i, tag)}
                                aria-label={`Убрать тег ${tag}`}
                                className="-mr-1 rounded-full p-0.5 hover:bg-ink/15"
                              >
                                <IconX size={12} stroke={3} />
                              </button>
                            </span>
                          ))}
                          <span className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              value={s.tagDraft}
                              onChange={(e) =>
                                patch(i, { tagDraft: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addTag(i, s.tagDraft);
                                }
                              }}
                              placeholder="новый тег"
                              className="field w-24 px-2.5 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => addTag(i, s.tagDraft)}
                              disabled={!s.tagDraft.trim()}
                              aria-label="Добавить тег"
                              className="icon-btn h-6 w-6 disabled:opacity-40"
                            >
                              <IconPlus size={13} stroke={3} />
                            </button>
                          </span>
                        </div>

                        {/* Подсказки из уже существующих тегов */}
                        {suggestedTags.filter((t) => !s.tags.includes(t))
                          .length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-ink/40">
                              из ваших:
                            </span>
                            {suggestedTags
                              .filter((t) => !s.tags.includes(t))
                              .map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => addTag(i, tag)}
                                  style={{ borderColor: colorForKey(tag) }}
                                  className="rounded-full border-2 px-2 py-0.5 text-xs font-bold text-ink/70 transition hover:text-ink"
                                  title={`Добавить тег «${tag}»`}
                                >
                                  + {tag}
                                </button>
                              ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Дополнения выбранного кандидата */}
                {!game.notFound && (expansions.length > 0 || d?.loading) && (
                  <div className="mt-3 border-t-2 border-ink/10 pt-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink/55">
                      <IconPuzzle size={14} />
                      Дополнения
                    </div>
                    {d?.loading ? (
                      <p className="text-xs text-ink/40">Загружаю…</p>
                    ) : (
                      <div className="space-y-1.5">
                        {expansions.map((exp) => {
                          const chosen = s.chosenExpansions.has(exp.bggId);
                          return (
                            <button
                              key={exp.bggId}
                              type="button"
                              onClick={() => toggleExpansion(i, exp.bggId)}
                              className={`flex w-full items-center gap-2.5 rounded-xl border-2 p-1.5 text-left transition ${
                                chosen
                                  ? "border-ink bg-brand/15"
                                  : "border-ink/20 hover:border-ink"
                              }`}
                              title={exp.name}
                            >
                              {/* Превью дополнения — как у основной игры */}
                              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border-2 border-ink bg-brand-soft">
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
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                                {exp.name}
                              </span>
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink ${
                                  chosen
                                    ? "bg-brand text-white"
                                    : "text-ink/50"
                                }`}
                              >
                                {chosen ? (
                                  <IconCheck size={13} stroke={3} />
                                ) : (
                                  <IconPlus size={13} stroke={3} />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
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

/** Русское склонение: «1 игру», «2 игры», «5 игр». */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
