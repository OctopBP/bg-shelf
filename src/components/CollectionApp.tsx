"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconMessage2,
  IconArrowRight,
  IconLoader2,
  IconDice5Filled,
  IconSearch,
  IconStarFilled,
  IconX,
  IconPlus,
  IconPencil,
  IconTrash,
  IconShare3,
} from "@tabler/icons-react";
import VoiceInput from "./VoiceInput";
import PhotoInput from "./PhotoInput";
import ShareDialog from "./ShareDialog";
import { colorAt, colorForKey } from "@/lib/palette";
import type { CollectionRole, CollectionSummary } from "@/lib/collections";

interface CollectionGame {
  id: string;
  collectionId: string;
  collectionName?: string;
  bggId: number;
  name: string;
  yearPublished: number | null;
  thumbnailUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  rating: number | null;
  tags: string[];
}

const ALL = "all";

export default function CollectionApp() {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [userId, setUserId] = useState("");
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string>(ALL);

  const [games, setGames] = useState<CollectionGame[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const isAllView = activeId === ALL;
  const activeCollection = collections.find((c) => c.id === activeId);
  const role: CollectionRole | undefined = activeCollection?.role;
  const canEdit = role === "owner" || role === "editor";
  const isOwner = role === "owner";

  const loadCollections = useCallback(async (selectId?: string) => {
    const res = await fetch("/api/collections");
    const data = res.ok ? await res.json() : { collections: [], userId: "" };
    const list = (data.collections as CollectionSummary[]) ?? [];
    setCollections(list);
    setUserId(data.userId ?? "");
    setCollectionsLoaded(true);
    setActiveId((prev) => {
      if (selectId) return selectId;
      if (prev !== ALL && list.some((c) => c.id === prev)) return prev;
      return list[0]?.id ?? ALL;
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCollections();
  }, [loadCollections]);

  const loadGames = useCallback(async () => {
    setLoaded(false);
    const url = isAllView
      ? "/api/collection?all=1"
      : `/api/collection?collectionId=${activeId}`;
    const res = await fetch(url);
    const data = res.ok ? await res.json() : { games: [] };
    setGames((data.games as CollectionGame[]) ?? []);
    setTagFilter(null);
    setLoaded(true);
  }, [activeId, isAllView]);

  useEffect(() => {
    if (!collectionsLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGames();
  }, [collectionsLoaded, loadGames]);

  async function runCommand(text: string) {
    if (!text.trim() || busy || isAllView || !canEdit) return;
    setBusy(true);
    setStatus(`Выполняю: «${text}»`);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text, collectionId: activeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setStatus(data.reply);
      setCommand("");
      if (data.changed) {
        loadGames();
        loadCollections(activeId);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function removeGame(game: CollectionGame) {
    await fetch("/api/collection", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: game.collectionId, bggId: game.bggId }),
    });
    loadGames();
    loadCollections(activeId);
  }

  async function createCollection() {
    const name = prompt("Название новой коллекции:")?.trim();
    if (!name) return;
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.collection) {
      await loadCollections(data.collection.id);
    } else {
      setStatus(data.error ?? "Не удалось создать коллекцию");
    }
  }

  async function renameCollection() {
    if (!activeCollection) return;
    const name = prompt("Новое название:", activeCollection.name)?.trim();
    if (!name || name === activeCollection.name) return;
    await fetch(`/api/collections/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadCollections(activeId);
  }

  async function deleteCollection() {
    if (!activeCollection) return;
    if (collections.length <= 1) {
      setStatus("Нельзя удалить единственную коллекцию.");
      return;
    }
    if (!confirm(`Удалить коллекцию «${activeCollection.name}» со всеми играми?`))
      return;
    await fetch(`/api/collections/${activeId}`, { method: "DELETE" });
    await loadCollections(ALL);
  }

  const allTags = useMemo(
    () => Array.from(new Set(games.flatMap((g) => g.tags))).sort(),
    [games]
  );

  const visibleGames = tagFilter
    ? games.filter((g) => g.tags.includes(tagFilter))
    : games;

  return (
    <div className="space-y-6">
      {/* Вкладки коллекций */}
      <div className="flex flex-wrap items-center gap-2">
        {collections.map((c) => {
          const active = activeId === c.id;
          const col = colorForKey(c.id);
          return (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={
                active
                  ? { backgroundColor: col, borderColor: col, color: "#0d0d0d" }
                  : { borderColor: col, color: col }
              }
              className="rounded-full border-[3px] px-3.5 py-1.5 text-sm font-bold transition"
            >
              {c.name} · {c.gameCount}
              {c.role !== "owner" && (
                <span className="ml-1 opacity-70">
                  {c.role === "viewer" ? "👁" : "✎"}
                </span>
              )}
            </button>
          );
        })}
        {collectionsLoaded && (
          <button
            onClick={() => setActiveId(ALL)}
            style={
              isAllView
                ? { backgroundColor: "#fff", borderColor: "#fff", color: "#0d0d0d" }
                : { borderColor: "#fff", color: "#fff" }
            }
            className="rounded-full border-[3px] px-3.5 py-1.5 text-sm font-bold transition"
          >
            Все игры
          </button>
        )}
        <button
          onClick={createCollection}
          aria-label="Новая коллекция"
          title="Новая коллекция"
          className="icon-btn h-9 w-9"
        >
          <IconPlus size={18} stroke={2.5} />
        </button>
      </div>

      {/* Действия над активной коллекцией */}
      {!isAllView && activeCollection && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {isOwner && (
            <>
              <button onClick={renameCollection} className="btn btn-ghost px-3 py-1.5">
                <IconPencil size={16} className="mr-1" /> Переименовать
              </button>
              <button onClick={() => setSharing(true)} className="btn btn-ghost px-3 py-1.5">
                <IconShare3 size={16} className="mr-1" /> Поделиться
              </button>
              <button
                onClick={deleteCollection}
                className="btn btn-ghost px-3 py-1.5 hover:text-coral"
              >
                <IconTrash size={16} className="mr-1" /> Удалить
              </button>
            </>
          )}
          {!isOwner && (
            <span className="text-muted">
              {role === "viewer"
                ? "Доступ только на просмотр"
                : "Общая коллекция · можно редактировать"}
            </span>
          )}
        </div>
      )}

      {/* Панель команд — только когда есть права на изменение */}
      {!isAllView && canEdit && (
        <div
          className="flex items-center gap-2"
          style={{ "--lift": "rgba(255,255,255,0.5)" } as React.CSSProperties}
        >
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              runCommand(command);
            }}
          >
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={busy}
              placeholder='Например: «добавь Каркассон и Манчкин, пометь Манчкин как пати»'
              className="field control-h flex-1 rounded-full px-5 text-sm disabled:opacity-50 sm:text-base"
            />
            <button
              type="submit"
              disabled={busy || !command.trim()}
              aria-label="Выполнить команду"
              className="btn btn-brand control-h shrink-0 px-5"
            >
              {busy ? (
                <IconLoader2 size={22} className="animate-spin" />
              ) : (
                <IconArrowRight size={22} stroke={2.5} />
              )}
            </button>
          </form>
          <VoiceInput onTranscript={runCommand} disabled={busy} />
          <PhotoInput
            collectionId={activeId}
            onAdded={() => {
              loadGames();
              loadCollections(activeId);
            }}
            onStatus={setStatus}
          />
        </div>
      )}

      {status && (
        <div className="surface animate-pop-in flex items-start gap-2 px-4 py-3 text-sm font-medium text-ink">
          <IconMessage2 size={18} className="mt-0.5 shrink-0 text-brand" />
          <span className="whitespace-pre-wrap">{status}</span>
        </div>
      )}

      {/* Фильтр по тегам */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTagFilter(null)}
            style={
              tagFilter === null
                ? { backgroundColor: "#fff", borderColor: "#fff", color: "#0d0d0d" }
                : { borderColor: "#fff", color: "#fff" }
            }
            className="rounded-full border-[3px] px-3.5 py-1.5 text-sm font-bold transition"
          >
            все · {games.length}
          </button>
          {allTags.map((tag) => {
            const c = colorForKey(tag);
            const active = tagFilter === tag;
            return (
              <button
                key={tag}
                onClick={() => setTagFilter(active ? null : tag)}
                style={
                  active
                    ? { backgroundColor: c, borderColor: c, color: "#0d0d0d" }
                    : { borderColor: c, color: c }
                }
                className="rounded-full border-[3px] px-3.5 py-1.5 text-sm font-bold transition"
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Сетка игр */}
      {!loaded || !collectionsLoaded ? (
        <p className="py-16 text-center font-semibold text-muted">Загрузка…</p>
      ) : visibleGames.length === 0 ? (
        <div className="surface mx-auto mt-4 max-w-md px-6 py-12 text-center">
          <div className="mb-3 flex justify-center text-ink/30">
            {games.length === 0 ? (
              <IconDice5Filled size={56} />
            ) : (
              <IconSearch size={56} />
            )}
          </div>
          <p className="font-medium text-ink/70">
            {games.length === 0
              ? canEdit
                ? "Коллекция пуста. Скажите или напишите команду, либо загрузите фото полки с играми."
                : "В этой коллекции пока нет игр."
              : "Нет игр с этим тегом."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleGames.map((game, i) => (
            <div
              key={game.id}
              style={{ "--ring": colorAt(i) } as React.CSSProperties}
              className="tile group relative overflow-hidden"
            >
              <Link href={`/game/${game.bggId}?c=${game.collectionId}`}>
                <div className="aspect-square overflow-hidden border-b-[3px] border-ink bg-brand-soft">
                  {game.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={game.thumbnailUrl}
                      alt={game.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink/30">
                      <IconDice5Filled size={48} />
                    </div>
                  )}
                </div>
              </Link>
              <div className="p-3">
                <Link href={`/game/${game.bggId}?c=${game.collectionId}`}>
                  <h3
                    className="truncate font-bold text-ink hover:text-brand"
                    title={game.name}
                  >
                    {game.name}
                  </h3>
                </Link>
                <p className="mt-1 text-xs font-medium text-ink/55">
                  {game.minPlayers && game.maxPlayers
                    ? game.minPlayers === game.maxPlayers
                      ? `${game.minPlayers} игр.`
                      : `${game.minPlayers}–${game.maxPlayers} игр.`
                    : ""}
                  {game.playingTime ? ` · ${game.playingTime} мин` : ""}
                  {game.rating ? (
                    <span className="inline-flex items-center gap-0.5 align-middle font-bold text-orange">
                      {" · "}
                      <IconStarFilled size={11} />
                      {Number(game.rating).toFixed(1)}
                    </span>
                  ) : (
                    ""
                  )}
                </p>
                {isAllView && game.collectionName && (
                  <p className="mt-1 truncate text-xs font-semibold text-brand">
                    {game.collectionName}
                  </p>
                )}
                {game.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {game.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{ backgroundColor: colorForKey(tag) }}
                        className="rounded-full border-2 border-ink px-2 py-0.5 text-xs font-bold text-ink"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {!isAllView && canEdit && (
                <button
                  onClick={() => removeGame(game)}
                  title="Удалить из коллекции"
                  aria-label={`Удалить ${game.name}`}
                  className="absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-full border-[3px] border-ink bg-white text-ink hover:bg-coral hover:text-white group-hover:flex"
                >
                  <IconX size={16} stroke={3} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {sharing && activeCollection && (
        <ShareDialog
          collectionId={activeCollection.id}
          collectionName={activeCollection.name}
          currentUserId={userId}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}
