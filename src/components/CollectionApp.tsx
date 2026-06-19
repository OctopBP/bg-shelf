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
  IconFolderSymlink,
  IconChecks,
  IconCircleCheckFilled,
  IconWorld,
  IconUsers,
  IconLock,
} from "@tabler/icons-react";
import VoiceInput from "./VoiceInput";
import PhotoInput from "./PhotoInput";
import ShareDialog from "./ShareDialog";
import PromptDialog from "./PromptDialog";
import ConfirmDialog from "./ConfirmDialog";
import MoveGameDialog from "./MoveGameDialog";
import AddGamesDialog, { type ResolvedGame } from "./AddGamesDialog";
import { colorAt, colorForKey } from "@/lib/palette";
import type {
  CollectionRole,
  CollectionSummary,
  CollectionVisibility,
} from "@/lib/collections";

const VISIBILITY_OPTIONS: {
  value: CollectionVisibility;
  label: string;
  Icon: typeof IconWorld;
}[] = [
  { value: "public", label: "Видна всем", Icon: IconWorld },
  { value: "friends", label: "Только друзьям", Icon: IconUsers },
  { value: "private", label: "Только мне", Icon: IconLock },
];

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

/** Русское склонение слова «игра» по числу: 1 игру, 2 игры, 5 игр. */
function pluralGames(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "игру";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "игры";
  return "игр";
}

// Быстрые фильтры по данным BGG — применяются в связке (И) с фильтром по тегам.
interface QuickFilter {
  key: string;
  label: string;
  test: (g: CollectionGame) => boolean;
}

const supports = (g: CollectionGame, n: number) =>
  g.minPlayers != null && g.maxPlayers != null && g.minPlayers <= n && g.maxPlayers >= n;

const QUICK_FILTERS: QuickFilter[] = [
  { key: "solo", label: "соло", test: (g) => supports(g, 1) },
  { key: "p2", label: "на двоих", test: (g) => supports(g, 2) },
  { key: "p4", label: "вчетвером", test: (g) => supports(g, 4) },
  { key: "party", label: "компания 5+", test: (g) => g.maxPlayers != null && g.maxPlayers >= 5 },
  { key: "short", label: "до 30 мин", test: (g) => g.playingTime != null && g.playingTime <= 30 },
  { key: "long", label: "от 90 мин", test: (g) => g.playingTime != null && g.playingTime >= 90 },
  { key: "r8", label: "рейтинг 8+", test: (g) => g.rating != null && g.rating >= 8 },
  { key: "r9", label: "рейтинг 9+", test: (g) => g.rating != null && g.rating >= 9 },
];

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
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moving, setMoving] = useState<CollectionGame | null>(null);
  // Режим выбора нескольких игр для пакетного перемещения.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoving, setBulkMoving] = useState(false);
  const [proposal, setProposal] = useState<ResolvedGame[] | null>(null);
  // Растёт с каждым новым предложением — служит key, чтобы окно добавления
  // пересоздавалось с чистым состоянием, а не переиспользовало прежнее.
  const [proposalSeq, setProposalSeq] = useState(0);

  const isAllView = activeId === ALL;
  const activeCollection = collections.find((c) => c.id === activeId);
  const role: CollectionRole | undefined = activeCollection?.role;
  const canEdit = role === "owner" || role === "editor";
  const isOwner = role === "owner";
  // Коллекция по умолчанию — сюда уходят игры, добавленные в сводном виде.
  const defaultCollection =
    collections.find((c) => c.isDefault) ?? collections[0];
  // Коллекции, в которые пользователь вправе перемещать игры.
  const editableCollections = collections.filter(
    (c) => c.role === "owner" || c.role === "editor"
  );
  // Можно ли редактировать конкретную игру (важно в сводном виде «Все игры»).
  const canEditGame = (game: CollectionGame) => {
    const c = collections.find((x) => x.id === game.collectionId);
    return c?.role === "owner" || c?.role === "editor";
  };

  const loadCollections = useCallback(async (selectId?: string) => {
    const res = await fetch("/api/collections");
    const data = res.ok ? await res.json() : { collections: [], userId: "" };
    const list = (data.collections as CollectionSummary[]) ?? [];
    setCollections(list);
    setUserId(data.userId ?? "");
    setCollectionsLoaded(true);
    setActiveId((prev) => {
      if (selectId) return selectId;
      if (prev === ALL) return prev;
      if (list.some((c) => c.id === prev)) return prev;
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
    setQuickFilter(null);
    setSelecting(false);
    setSelectedIds(new Set());
    setLoaded(true);
  }, [activeId, isAllView]);

  useEffect(() => {
    if (!collectionsLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGames();
  }, [collectionsLoaded, loadGames]);

  // Куда применять команды/фото. В сводном виде «Все игры» — в коллекцию
  // по умолчанию.
  const commandTarget = isAllView ? (defaultCollection?.id ?? "") : activeId;
  const canRunCommands = canEdit;

  async function runCommand(text: string) {
    if (!text.trim() || busy || !canRunCommands) return;
    setBusy(true);
    setStatus(`Выполняю: «${text}»`);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text, collectionId: commandTarget }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setCommand("");
      // Добавление игр: показываем окно подтверждения вместо мгновенного добавления.
      if (data.kind === "proposal") {
        const found = (data.games as ResolvedGame[]) ?? [];
        if (found.length === 0) {
          setStatus("Не нашёл игр для добавления в запросе.");
        } else {
          setStatus("");
          setProposal(found);
          setProposalSeq((n) => n + 1);
        }
      } else {
        setStatus(data.reply);
        if (data.changed) {
          loadGames();
          loadCollections(activeId);
        }
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  // Перемещает список игр в существующую коллекцию.
  async function moveItemsTo(
    items: { fromCollectionId: string; bggId: number }[],
    targetId: string
  ) {
    const toMove = items.filter((i) => i.fromCollectionId !== targetId);
    if (toMove.length === 0) return;
    await fetch("/api/collection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toCollectionId: targetId, items: toMove }),
    });
    loadGames();
    loadCollections(activeId);
  }

  // Создаёт новую коллекцию и перемещает в неё указанные игры.
  async function createAndMoveItemsTo(
    items: { fromCollectionId: string; bggId: number }[],
    name: string
  ) {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.collection) {
      setStatus(data.error ?? "Не удалось создать коллекцию");
      return;
    }
    await moveItemsTo(items, data.collection.id);
  }

  function gameToItem(g: CollectionGame) {
    return { fromCollectionId: g.collectionId, bggId: g.bggId };
  }

  async function updateVisibility(visibility: CollectionVisibility) {
    if (!activeCollection || activeCollection.visibility === visibility) return;
    setCollections((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, visibility } : c))
    );
    await fetch(`/api/collections/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    loadCollections(activeId);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelection() {
    setSelecting(false);
    setSelectedIds(new Set());
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

  async function createCollection(name: string) {
    setCreating(false);
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

  async function renameCollection(name: string) {
    setRenaming(false);
    if (!activeCollection || name === activeCollection.name) return;
    await fetch(`/api/collections/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadCollections(activeId);
  }

  function requestDeleteCollection() {
    if (!activeCollection) return;
    if (activeCollection.isDefault) {
      setStatus("Нельзя удалить коллекцию по умолчанию.");
      return;
    }
    if (collections.length <= 1) {
      setStatus("Нельзя удалить единственную коллекцию.");
      return;
    }
    setConfirmingDelete(true);
  }

  async function deleteCollection() {
    setConfirmingDelete(false);
    await fetch(`/api/collections/${activeId}`, { method: "DELETE" });
    await loadCollections(ALL);
  }

  const allTags = useMemo(
    () => Array.from(new Set(games.flatMap((g) => g.tags))).sort(),
    [games]
  );

  // Показываем только те быстрые фильтры, под которые есть хотя бы одна игра.
  const quickFilters = useMemo(
    () => QUICK_FILTERS.filter((f) => games.some(f.test)),
    [games]
  );

  const activeQuick = quickFilter
    ? QUICK_FILTERS.find((f) => f.key === quickFilter)
    : undefined;

  const visibleGames = useMemo(
    () =>
      games.filter(
        (g) =>
          (!tagFilter || g.tags.includes(tagFilter)) &&
          (!activeQuick || activeQuick.test(g))
      ),
    [games, tagFilter, activeQuick]
  );

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
          onClick={() => setCreating(true)}
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
              <button onClick={() => setRenaming(true)} className="btn btn-ghost px-3 py-1.5">
                <IconPencil size={16} className="mr-1" /> Переименовать
              </button>
              <button onClick={() => setSharing(true)} className="btn btn-ghost px-3 py-1.5">
                <IconShare3 size={16} className="mr-1" /> Поделиться
              </button>
              {!activeCollection.isDefault && (
                <button
                  onClick={requestDeleteCollection}
                  className="btn btn-ghost px-3 py-1.5 hover:text-coral"
                >
                  <IconTrash size={16} className="mr-1" /> Удалить
                </button>
              )}
              {/* Видимость коллекции */}
              <div className="flex items-center gap-1 rounded-full border-2 border-ink/15 p-1">
                {VISIBILITY_OPTIONS.map(({ value, label, Icon }) => {
                  const active = activeCollection.visibility === value;
                  return (
                    <button
                      key={value}
                      onClick={() => updateVisibility(value)}
                      title={label}
                      aria-pressed={active}
                      className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${
                        active
                          ? "bg-ink text-white"
                          : "text-ink/55 hover:text-ink"
                      }`}
                    >
                      <Icon size={14} stroke={2.5} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  );
                })}
              </div>
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

      {/* Панель команд — при правах на изменение; в «Все игры» добавляет в коллекцию по умолчанию */}
      {canRunCommands && (
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
            collectionId={commandTarget}
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

      {/* Быстрые фильтры по данным BGG */}
      {quickFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((f) => {
            const c = colorForKey(f.key);
            const active = quickFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setQuickFilter(active ? null : f.key)}
                style={
                  active
                    ? { backgroundColor: c, borderColor: c, color: "#0d0d0d" }
                    : { borderColor: c, color: c }
                }
                className="rounded-full border-[3px] px-3.5 py-1.5 text-sm font-bold transition"
              >
                {f.label}
              </button>
            );
          })}
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

      {/* Выбор нескольких игр для перемещения */}
      {loaded && collectionsLoaded && visibleGames.some(canEditGame) && (
        <div className="flex flex-wrap items-center gap-2">
          {!selecting ? (
            <button
              onClick={() => setSelecting(true)}
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              <IconChecks size={16} className="mr-1" /> Выбрать несколько
            </button>
          ) : (
            <>
              <span className="text-sm font-bold text-ink">
                Выбрано: {selectedIds.size}
              </span>
              <button
                onClick={() => setBulkMoving(true)}
                disabled={selectedIds.size === 0}
                className="btn btn-brand px-4 py-1.5 text-sm disabled:opacity-50"
              >
                <IconFolderSymlink size={16} className="mr-1" /> Переместить
              </button>
              <button
                onClick={exitSelection}
                className="btn btn-ghost px-3 py-1.5 text-sm"
              >
                Отмена
              </button>
            </>
          )}
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
              : "Нет игр по выбранному фильтру."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleGames.map((game, i) => {
            const editable = canEditGame(game);
            const selected = selectedIds.has(game.id);
            const selectMode = selecting && editable;
            return (
            <div
              key={game.id}
              style={{ "--ring": colorAt(i) } as React.CSSProperties}
              onClickCapture={
                selecting
                  ? (e) => {
                      e.preventDefault();
                      if (editable) toggleSelected(game.id);
                    }
                  : undefined
              }
              className={`tile group relative overflow-hidden ${
                selectMode ? "cursor-pointer" : ""
              } ${selected ? "ring-4 ring-brand" : ""} ${
                selecting && !editable ? "opacity-40" : ""
              }`}
            >
              {selectMode && (
                <div className="absolute left-2 top-2 z-10">
                  {selected ? (
                    <IconCircleCheckFilled size={26} className="text-brand" />
                  ) : (
                    <span className="block h-[22px] w-[22px] rounded-full border-[3px] border-ink bg-white/80" />
                  )}
                </div>
              )}
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
              {editable && !selecting && (
                <div className="absolute right-2 top-2 hidden flex-col gap-1.5 group-hover:flex">
                  <button
                    onClick={() => setMoving(game)}
                    title="Переместить в другую коллекцию"
                    aria-label={`Переместить ${game.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-ink bg-white text-ink hover:bg-brand hover:text-white"
                  >
                    <IconFolderSymlink size={16} stroke={2.5} />
                  </button>
                  <button
                    onClick={() => removeGame(game)}
                    title="Удалить из коллекции"
                    aria-label={`Удалить ${game.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-ink bg-white text-ink hover:bg-coral hover:text-white"
                  >
                    <IconX size={16} stroke={3} />
                  </button>
                </div>
              )}
            </div>
            );
          })}
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

      {creating && (
        <PromptDialog
          title="Новая коллекция"
          placeholder="Название новой коллекции"
          confirmLabel="Создать"
          onSubmit={createCollection}
          onClose={() => setCreating(false)}
        />
      )}

      {renaming && activeCollection && (
        <PromptDialog
          title="Переименовать коллекцию"
          placeholder="Новое название"
          initialValue={activeCollection.name}
          confirmLabel="Сохранить"
          onSubmit={renameCollection}
          onClose={() => setRenaming(false)}
        />
      )}

      {confirmingDelete && activeCollection && (
        <ConfirmDialog
          title="Удалить коллекцию?"
          message={`Коллекция «${activeCollection.name}» будет удалена со всеми играми. Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          onConfirm={deleteCollection}
          onClose={() => setConfirmingDelete(false)}
        />
      )}

      {moving && (
        <MoveGameDialog
          subject={`«${moving.name}»`}
          currentCollectionId={moving.collectionId}
          collections={editableCollections}
          onMove={(targetId) => {
            const g = moving;
            setMoving(null);
            moveItemsTo([gameToItem(g)], targetId);
          }}
          onCreateAndMove={async (name) => {
            const g = moving;
            setMoving(null);
            await createAndMoveItemsTo([gameToItem(g)], name);
          }}
          onClose={() => setMoving(null)}
        />
      )}

      {bulkMoving && (
        <MoveGameDialog
          subject={`${selectedIds.size} ${pluralGames(selectedIds.size)}`}
          collections={editableCollections}
          onMove={(targetId) => {
            const items = games
              .filter((g) => selectedIds.has(g.id) && canEditGame(g))
              .map(gameToItem);
            setBulkMoving(false);
            exitSelection();
            moveItemsTo(items, targetId);
          }}
          onCreateAndMove={async (name) => {
            const items = games
              .filter((g) => selectedIds.has(g.id) && canEditGame(g))
              .map(gameToItem);
            setBulkMoving(false);
            exitSelection();
            await createAndMoveItemsTo(items, name);
          }}
          onClose={() => setBulkMoving(false)}
        />
      )}

      {proposal && (
        <AddGamesDialog
          key={proposalSeq}
          games={proposal}
          collectionId={commandTarget}
          suggestedTags={allTags}
          onClose={() => setProposal(null)}
          onAdded={() => {
            loadGames();
            loadCollections(activeId);
          }}
          onStatus={setStatus}
        />
      )}
    </div>
  );
}
