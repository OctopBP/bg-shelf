"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  IconArrowLeft,
  IconWeight,
  IconDice5Filled,
  IconDeviceFloppy,
  IconExternalLink,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconStarFilled,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { CollectionGame } from "@/lib/collection";
import { colorForKey } from "@/lib/palette";
import ConfirmDialog from "./ConfirmDialog";

interface EditableInfo {
  name: string;
  yearPublished: string;
  minPlayers: string;
  maxPlayers: string;
  playingTime: string;
  description: string;
}

function toForm(game: CollectionGame): EditableInfo {
  return {
    name: game.name ?? "",
    yearPublished: game.yearPublished?.toString() ?? "",
    minPlayers: game.minPlayers?.toString() ?? "",
    maxPlayers: game.maxPlayers?.toString() ?? "",
    playingTime: game.playingTime?.toString() ?? "",
    description: game.description ?? "",
  };
}

export default function GameDetail({
  game,
  canEdit,
}: {
  game: CollectionGame;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<EditableInfo>(() => toForm(game));
  const [tags, setTags] = useState<string[]>(game.tags);
  const [notes, setNotes] = useState(game.notes ?? "");
  const [tagDraft, setTagDraft] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  function startEditing() {
    setForm(toForm(game));
    setTags(game.tags);
    setNotes(game.notes ?? "");
    setTagDraft("");
    setError("");
    setEditing(true);
  }

  function addTag() {
    const t = tagDraft.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/collection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: game.collectionId,
          gameId: game.gameId,
          tags,
          notes,
          info: {
            name: form.name,
            yearPublished: form.yearPublished,
            minPlayers: form.minPlayers,
            maxPlayers: form.maxPlayers,
            playingTime: form.playingTime,
            description: form.description,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setConfirmingRemove(false);
    setSaving(true);
    try {
      await fetch("/api/collection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: game.collectionId,
          gameId: game.gameId,
        }),
      });
      router.push("/");
      router.refresh();
    } catch {
      setSaving(false);
    }
  }

  const players =
    game.minPlayers && game.maxPlayers
      ? game.minPlayers === game.maxPlayers
        ? `${game.minPlayers}`
        : `${game.minPlayers}–${game.maxPlayers}`
      : null;

  return (
    <div className="space-y-6">
      {/* Верхняя панель: назад + действия */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="btn btn-onblack px-4 py-2 text-sm">
          <IconArrowLeft size={18} stroke={2.5} />
          Назад
        </Link>
        {!editing ? (
          <div className="flex items-center gap-2">
            {game.bggId != null && (
              <a
                href={`https://boardgamegeek.com/boardgame/${game.bggId}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-onblack px-4 py-2 text-sm"
              >
                <IconExternalLink size={18} stroke={2.5} />
                <span className="hidden sm:inline">BGG</span>
              </a>
            )}
            {canEdit && (
              <button
                onClick={startEditing}
                className="btn btn-brand px-4 py-2 text-sm"
              >
                <IconPencil size={18} stroke={2.5} />
                Редактировать
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              disabled={saving}
              className="btn btn-onblack px-4 py-2 text-sm"
            >
              Отмена
            </button>
            <button
              onClick={save}
              disabled={saving || !form.name.trim()}
              className="btn btn-brand px-5 py-2 text-sm"
            >
              {saving ? (
                <IconLoader2 size={18} className="animate-spin" />
              ) : (
                <IconDeviceFloppy size={18} stroke={2.5} />
              )}
              Сохранить
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="surface px-4 py-3 text-sm font-semibold text-coral">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* Обложка */}
        <div className="surface overflow-hidden self-start">
          <div className="bg-brand-soft">
            {game.imageUrl || game.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={game.imageUrl ?? game.thumbnailUrl ?? ""}
                alt={game.name}
                className="block h-auto w-full"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center text-ink/30">
                <IconDice5Filled size={64} />
              </div>
            )}
          </div>
        </div>

        {/* Карточка с данными */}
        <div className="surface space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          {/* Название + год */}
          {editing ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/55">
                  Название
                </span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="field px-3 py-2 text-lg font-bold"
                />
              </label>
              <label className="block max-w-[12rem]">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/55">
                  Год выпуска
                </span>
                <input
                  value={form.yearPublished}
                  onChange={(e) =>
                    setForm({ ...form, yearPublished: e.target.value })
                  }
                  inputMode="numeric"
                  className="field px-3 py-2"
                />
              </label>
            </div>
          ) : (
            <div>
              <h1 className="font-display text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
                {game.name}
              </h1>
              {game.originalName && game.originalName !== game.name && (
                <p className="mt-0.5 font-medium text-ink/45">
                  {game.originalName}
                </p>
              )}
              {game.yearPublished && (
                <p className="mt-1 font-semibold text-ink/55">
                  {game.yearPublished}
                </p>
              )}
            </div>
          )}

          {/* Характеристики */}
          {editing ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/55">
                  Игроков от
                </span>
                <input
                  value={form.minPlayers}
                  onChange={(e) =>
                    setForm({ ...form, minPlayers: e.target.value })
                  }
                  inputMode="numeric"
                  className="field px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/55">
                  Игроков до
                </span>
                <input
                  value={form.maxPlayers}
                  onChange={(e) =>
                    setForm({ ...form, maxPlayers: e.target.value })
                  }
                  inputMode="numeric"
                  className="field px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/55">
                  Время, мин
                </span>
                <input
                  value={form.playingTime}
                  onChange={(e) =>
                    setForm({ ...form, playingTime: e.target.value })
                  }
                  inputMode="numeric"
                  className="field px-3 py-2"
                />
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 text-sm font-bold text-ink">
              {players && <Stat label="игроков">{players}</Stat>}
              {game.playingTime && (
                <Stat label="минут">{game.playingTime}</Stat>
              )}
              {game.rating != null && (
                <Stat label="рейтинг BGG">
                  <span className="inline-flex items-center gap-0.5 text-orange">
                    <IconStarFilled size={13} />
                    {Number(game.rating).toFixed(1)}
                  </span>
                </Stat>
              )}
              {game.weight != null && game.weight > 0 && (
                <Stat label="сложность">
                  <span className="inline-flex items-center gap-1">
                    <IconWeight size={13} />
                    {Number(game.weight).toFixed(1)}/5
                  </span>
                </Stat>
              )}
            </div>
          )}

          {/* Теги */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/55">
              Теги
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(editing ? tags : game.tags).map((tag) => (
                <span
                  key={tag}
                  style={{ backgroundColor: colorForKey(tag) }}
                  className="inline-flex items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-sm font-bold text-ink"
                >
                  {tag}
                  {editing && (
                    <button
                      onClick={() => removeTag(tag)}
                      aria-label={`Убрать тег ${tag}`}
                      className="-mr-1 rounded-full p-0.5 hover:bg-ink/15"
                    >
                      <IconX size={13} stroke={3} />
                    </button>
                  )}
                </span>
              ))}
              {!editing && game.tags.length === 0 && (
                <span className="text-sm text-ink/45">нет тегов</span>
              )}
              {editing && (
                <span className="inline-flex items-center gap-1">
                  <input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="новый тег"
                    className="field w-28 px-2.5 py-1 text-sm"
                  />
                  <button
                    onClick={addTag}
                    disabled={!tagDraft.trim()}
                    aria-label="Добавить тег"
                    className="icon-btn h-7 w-7 disabled:opacity-40"
                  >
                    <IconPlus size={15} stroke={3} />
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* Описание */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/55">
              Описание
            </p>
            {editing ? (
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={6}
                className="field resize-y px-3 py-2 text-sm leading-relaxed"
              />
            ) : game.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                {game.description}
              </p>
            ) : (
              <p className="text-sm text-ink/45">нет описания</p>
            )}
          </div>

          {/* Личная заметка */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/55">
              Моя заметка
            </p>
            {editing ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Где стоит, кому одолжил, домашние правила…"
                className="field resize-y px-3 py-2 text-sm leading-relaxed"
              />
            ) : game.notes ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                {game.notes}
              </p>
            ) : (
              <p className="text-sm text-ink/45">нет заметки</p>
            )}
          </div>

          {/* Категории / механики из BGG */}
          {!editing && (game.categories.length > 0 || game.mechanics.length > 0) && (
            <div className="grid gap-4 border-t-[3px] border-dashed border-ink/15 pt-4 sm:grid-cols-2">
              {game.categories.length > 0 && (
                <Meta title="Категории" items={game.categories} />
              )}
              {game.mechanics.length > 0 && (
                <Meta title="Механики" items={game.mechanics} />
              )}
            </div>
          )}

          {/* Удаление */}
          {editing && (
            <div className="border-t-[3px] border-dashed border-ink/15 pt-4">
              <button
                onClick={() => setConfirmingRemove(true)}
                disabled={saving}
                className="btn btn-coral px-4 py-2 text-sm"
              >
                <IconTrash size={18} stroke={2.5} />
                Удалить из коллекции
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmingRemove && (
        <ConfirmDialog
          title="Удалить игру?"
          message={`«${game.name}» будет удалена из коллекции.`}
          confirmLabel="Удалить"
          onConfirm={remove}
          onClose={() => setConfirmingRemove(false)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-brand-soft px-3 py-1">
      <span className="inline-flex items-center">{children}</span>
      <span className="text-xs font-semibold text-ink/55">{label}</span>
    </span>
  );
}

function Meta({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink/55">
        {title}
      </p>
      <p className="text-sm font-medium text-ink/75">{items.join(", ")}</p>
    </div>
  );
}
