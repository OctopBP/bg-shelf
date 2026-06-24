import {
  IconCheck,
  IconDice5Filled,
  IconLoader2,
  IconPlus,
  IconPuzzle,
} from "@tabler/icons-react";
import { colorForKey } from "@/lib/palette";
import { Tag, TagInput } from "@/components/ui";
import type { ResolvedGame, GameState, CandidateDetails } from "./types";

interface CandidateCardProps {
  game: ResolvedGame;
  state: GameState;
  /** Данные выбранного кандидата (имя/превью/дополнения). */
  details: CandidateDetails | undefined;
  /** Уже существующие теги коллекции для подсказок. */
  suggestedTags: string[];
  onToggleEnabled: () => void;
  onSelectCandidate: (bggId: number) => void;
  onAddTag: (raw: string) => void;
  onRemoveTag: (tag: string) => void;
  onDraftChange: (value: string) => void;
  onToggleExpansion: (bggId: number) => void;
}

/** Карточка одной предложенной игры в окне добавления: обложка-переключатель,
 *  выбор кандидата BGG, теги с подсказками и список дополнений. */
export default function CandidateCard({
  game,
  state: s,
  details: d,
  suggestedTags,
  onToggleEnabled,
  onSelectCandidate,
  onAddTag,
  onRemoveTag,
  onDraftChange,
  onToggleExpansion,
}: CandidateCardProps) {
  const selBgg = s.selectedBggId;
  const selCandidate = game.candidates.find((c) => c.bggId === selBgg);
  const name = d?.name || selCandidate?.name || game.requestedAs;
  const year = d?.yearPublished ?? selCandidate?.yearPublished ?? null;
  const expansions = d?.expansions ?? [];
  const tagHints = suggestedTags.filter((t) => !s.tags.includes(t));

  return (
    <div
      className={`rounded-2xl border-2 border-ink p-3 transition ${
        s.enabled ? "bg-black/[0.04]" : "bg-black/[0.02] opacity-60"
      }`}
    >
      <div className="flex gap-3">
        {/* Обложка / переключатель «добавлять?» */}
        <button
          type="button"
          onClick={() => !game.notFound && onToggleEnabled()}
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
                        onClick={() => onSelectCandidate(c.bggId)}
                        className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-0.5 text-xs font-bold transition ${
                          active
                            ? "border-ink bg-ink text-white"
                            : "border-ink/30 text-ink/70 hover:border-ink"
                        }`}
                        title={c.isExpansion ? `Дополнение: ${c.name}` : c.name}
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
                          {c.yearPublished ? ` (${c.yearPublished})` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Теги: чипы + поле ввода */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {s.tags.map((tag) => (
                  <Tag
                    key={tag}
                    label={tag}
                    size="md"
                    onRemove={() => onRemoveTag(tag)}
                  />
                ))}
                <TagInput
                  value={s.tagDraft}
                  onChange={onDraftChange}
                  onSubmit={() => onAddTag(s.tagDraft)}
                  size="sm"
                />
              </div>

              {/* Подсказки из уже существующих тегов */}
              {tagHints.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink/40">
                    из ваших:
                  </span>
                  {tagHints.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onAddTag(tag)}
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
                    onClick={() => onToggleExpansion(exp.bggId)}
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
                        chosen ? "bg-brand text-white" : "text-ink/50"
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
}
