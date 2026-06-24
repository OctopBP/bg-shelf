"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  IconArrowRight,
  IconChecks,
  IconCircleCheckFilled,
  IconDice5Filled,
  IconFolderSymlink,
  IconLoader2,
  IconLock,
  IconMessage2,
  IconPlus,
  IconPuzzle,
  IconSearch,
  IconSettings,
  IconStarFilled,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import VoiceInput from "./VoiceInput";
import PhotoInput from "./PhotoInput";
import Modal from "./Modal";
import CollectionSettingsDialog from "./CollectionSettingsDialog";
import CreateCollectionDialog from "./CreateCollectionDialog";
import ConfirmDialog from "./ConfirmDialog";
import MoveGameDialog from "./MoveGameDialog";
import AddGamesDialog, { type ResolvedGame } from "./AddGamesDialog";
import { colorAt, colorForKey } from "@/lib/palette";
import type { CollectionRole, CollectionVisibility } from "@/lib/collections";
import {
  useCollectionData,
  ALL,
  type CollectionGame,
  type ExpansionSummary,
  type BaseSummary,
} from "@/hooks/useCollectionData";
import ProgressiveImage from "./ProgressiveImage";

const VISIBILITY_OPTIONS: {
  value: CollectionVisibility;
  label: string;
  Icon: typeof IconWorld;
}[] = [
  { value: "public", label: "Видна всем", Icon: IconWorld },
  { value: "friends", label: "Только друзьям", Icon: IconUsers },
  { value: "private", label: "Только мне", Icon: IconLock },
];

/** Русское склонение слова «игра» по числу: 1 игру, 2 игры, 5 игр. */
function pluralGames(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "игру";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return "игры";
  }
  return "игр";
}

/** Склонение «доп» по числу: 1 доп, 2 допа, 5 допов. */
function pluralExpansions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "доп";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "допа";
  return "допов";
}

/** Узел сетки: базовая/обычная игра, либо «осиротевшее» дополнение (базы нет
 *  в коллекции) — тогда главная плитка рисует ч/б обложку отсутствующей базы. */
interface GridNode {
  key: string;
  /** Якорная запись коллекции (база/обычная игра или представитель сирот). */
  game: CollectionGame;
  /** Отсутствующая в коллекции база — рисуем её плитку ч/б. */
  orphanBase?: BaseSummary;
  /** Дополнения этого узла, присутствующие в коллекции. */
  expansions: ExpansionSummary[];
}

// Быстрые фильтры по данным BGG — применяются в связке (И) с фильтром по тегам.
interface QuickFilter {
  key: string;
  label: string;
  test: (g: CollectionGame) => boolean;
}

const supports = (g: CollectionGame, n: number) =>
  g.minPlayers != null &&
  g.maxPlayers != null &&
  g.minPlayers <= n &&
  g.maxPlayers >= n;

const QUICK_FILTERS: QuickFilter[] = [
//   { key: "solo", label: "соло", test: (g) => supports(g, 1) },
//   { key: "p2", label: "на двоих", test: (g) => supports(g, 2) },
//   { key: "p4", label: "вчетвером", test: (g) => supports(g, 4) },
//   { key: "party", label: "компания 5+", test: (g) => g.maxPlayers != null && g.maxPlayers >= 5 },
//   { key: "short", label: "до 30 мин", test: (g) => g.playingTime != null && g.playingTime <= 30 },
//   { key: "long", label: "от 90 мин", test: (g) => g.playingTime != null && g.playingTime >= 90 },
//   { key: "r8", label: "рейтинг 8+", test: (g) => g.rating != null && g.rating >= 8 },
//   { key: "r9", label: "рейтинг 9+", test: (g) => g.rating != null && g.rating >= 9 },
];

export default function CollectionApp() {
  // Данные коллекций/игр и пагинация вынесены в переиспользуемый хук (A-4).
  const {
    collections,
    setCollections,
    userId,
    collectionsLoaded,
    activeId,
    setActiveId,
    isAllView,
    loadCollections,
    games,
    expansionMap,
    loaded,
    nextCursor,
    loadingMore,
    reload: loadGames,
    loadMore,
    sentinelRef,
  } = useCollectionData();

  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addingGames, setAddingGames] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moving, setMoving] = useState<CollectionGame | null>(null);
  // Режим выбора нескольких игр для пакетного перемещения.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Какой узел сетки развёрнут (показывает список дополнений справа) и какой
  // сейчас закрывается — закрывающийся держим в ширину 2 колонок, пока блок
  // ужимается обратно, иначе сетка схлопнулась бы рывком до конца анимации.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [closingKey, setClosingKey] = useState<string | null>(null);
  // Замеренные при открытии ширины (px): всей карточки в одну колонку и её левой
  // части. Левую часть фиксируем на этой ширине на всё время анимации — поэтому
  // обложка и высота карточки не меняются, а сам блок плавно растёт в ширину.
  const [cardColWidth, setCardColWidth] = useState<number | null>(null);
  const [leftColWidth, setLeftColWidth] = useState<number | null>(null);
  // true → ширина карточки должна быть «полной» (2 колонки); запускаем на
  // следующем кадре после старта, чтобы сработал transition ширины.
  const [open, setOpen] = useState(false);

  // Разворот/сворачивание карточки с анимацией ширины самого блока.
  function toggleExpanded(key: string, leftCol: Element | null | undefined) {
    if (expandedKey === key) {
      // Закрытие: ширина едет обратно к одной колонке, затем снимаем span.
      setOpen(false);
      setExpandedKey(null);
      setClosingKey(key);
      window.setTimeout(() => setClosingKey((c) => (c === key ? null : c)), 300);
      return;
    }
    // Открытие: запоминаем ширину одной колонки, стартуем с неё и на следующем
    // кадре разгоняем до полной ширины (2 колонки).
    const tile = leftCol?.parentElement;
    setCardColWidth(tile ? Math.round(tile.getBoundingClientRect().width) : null);
    setLeftColWidth(leftCol ? Math.round(leftCol.getBoundingClientRect().width) : null);
    setOpen(false);
    setExpandedKey(key);
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  }
  const [bulkMoving, setBulkMoving] = useState(false);
  const [proposal, setProposal] = useState<ResolvedGame[] | null>(null);
  // Растёт с каждым новым предложением — служит key, чтобы окно добавления
  // пересоздавалось с чистым состоянием, а не переиспользовало прежнее.
  const [proposalSeq, setProposalSeq] = useState(0);

  const activeCollection = collections.find((c) => c.id === activeId);
  const role: CollectionRole | undefined = activeCollection?.role;
  const canEdit = role === "owner" || role === "editor";
  const isOwner = role === "owner";
  // Коллекция по умолчанию — сюда уходят игры, добавленные в сводном виде.
  const defaultCollection =
    collections.find((c) => c.isDefault) ?? collections[0];
  // Коллекции, в которые пользователь вправе перемещать игры.
  const editableCollections = collections.filter(
    (c) => c.role === "owner" || c.role === "editor",
  );
  // Можно ли редактировать конкретную игру (важно в сводном виде «Все игры»).
  const canEditGame = (game: CollectionGame) => {
    const c = collections.find((x) => x.id === game.collectionId);
    return c?.role === "owner" || c?.role === "editor";
  };

  // Смена активного вида сбрасывает фильтры и режим выбора (данные грузит хук).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTagFilters([]);
    setQuickFilter(null);
    setSelecting(false);
    setSelectedIds(new Set());
    setExpandedKey(null);
    setClosingKey(null);
    setOpen(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeId]);

  // Куда применять команды/фото. В сводном виде «Все игры» — в коллекцию
  // по умолчанию.
  const commandTarget = isAllView ? (defaultCollection?.id ?? "") : activeId;
  const canRunCommands = isAllView ? !!defaultCollection : canEdit;

  async function runCommand(text: string) {
    if (!text.trim() || busy || !canRunCommands) return;
    setBusy(true);
    setStatus(`Выполняю: «${text}»`);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: text,
          collectionId: commandTarget,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setCommand("");
      setAddingGames(false);
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
    items: { fromCollectionId: string; gameId: number }[],
    targetId: string,
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
    items: { fromCollectionId: string; gameId: number }[],
    name: string,
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
    return { fromCollectionId: g.collectionId, gameId: g.gameId };
  }

  async function updateVisibility(visibility: CollectionVisibility) {
    if (!activeCollection || activeCollection.visibility === visibility) {
      return;
    }
    setCollections((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, visibility } : c)),
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
      body: JSON.stringify({
        collectionId: game.collectionId,
        gameId: game.gameId,
      }),
    });
    loadGames();
    loadCollections(activeId);
  }

  async function createCollection(
    name: string,
    visibility: CollectionVisibility,
    friendIds: string[],
    role: Exclude<CollectionRole, "owner">,
  ) {
    setCreating(false);
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, visibility }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.collection) {
      if (friendIds.length > 0) {
        const results = await Promise.allSettled(
          friendIds.map((userId) =>
            fetch(`/api/collections/${data.collection.id}/members`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, role }),
            }).then((r) => (r.ok ? r : Promise.reject(new Error()))),
          ),
        );
        if (results.some((r) => r.status === "rejected")) {
          setStatus("Коллекция создана, но не всех друзей удалось пригласить.");
        }
      }
      await loadCollections(data.collection.id);
    } else {
      setStatus(data.error ?? "Не удалось создать коллекцию");
    }
  }

  async function renameCollection(name: string) {
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
    setSettingsOpen(false);
    setConfirmingDelete(true);
  }

  async function deleteCollection() {
    setConfirmingDelete(false);
    await fetch(`/api/collections/${activeId}`, { method: "DELETE" });
    await loadCollections(ALL);
  }

  const allTags = useMemo(
    () => Array.from(new Set(games.flatMap((g) => g.tags))).sort(),
    [games],
  );

  // Показываем только те быстрые фильтры, под которые есть хотя бы одна игра.
  const quickFilters = useMemo(
    () => QUICK_FILTERS.filter((f) => games.some(f.test)),
    [games],
  );

  const activeQuick = quickFilter
    ? QUICK_FILTERS.find((f) => f.key === quickFilter)
    : undefined;

  const allGamesCount = collections.map(c => c.gameCount).reduce((a, b) => a + b, 0);

  const visibleGames = useMemo(
    () =>
      games.filter(
        (g) =>
          (tagFilters.length === 0 || tagFilters.every(t => g.tags.includes(t))) &&
          (!activeQuick || activeQuick.test(g)),
      ),
    [games, tagFilters, activeQuick],
  );

  // Группировка дополнений: дополнения, чья база есть в коллекции, прячем из
  // сетки (они уйдут в панель базы); осиротевшие дополнения собираем в один узел
  // под ч/б плиткой отсутствующей базы; остальное — обычные узлы.
  const nodes: GridNode[] = useMemo(() => {
    const out: GridNode[] = [];
    const seenOrphanBase = new Set<number>();
    for (const g of visibleGames) {
      const base = expansionMap.expansionToBase[g.gameId];
      if (base?.present) continue; // сгруппировано под своей базой
      if (base && !base.present) {
        if (seenOrphanBase.has(base.gameId)) continue;
        seenOrphanBase.add(base.gameId);
        out.push({
          key: `orphan-${base.gameId}`,
          game: g,
          orphanBase: base,
          expansions: expansionMap.byBase[base.gameId] ?? [],
        });
        continue;
      }
      out.push({
        key: g.id,
        game: g,
        expansions: expansionMap.byBase[g.gameId] ?? [],
      });
    }
    return out;
  }, [visibleGames, expansionMap]);

  return (
    <div
      className="space-y-6"
      style={{ "--lift": "rgba(255,255,255,0.5)" } as React.CSSProperties}
    >
      {/* Вкладки коллекций */}
      <div className="flex flex-wrap items-center gap-2">
        {collectionsLoaded && (
          <button
            onClick={() => setActiveId(ALL)}
            style={
              isAllView
                ? {
                    backgroundColor: "#fff",
                    borderColor: "#fff",
                    color: "#0d0d0d",
                  }
                : { borderColor: "#fff", color: "#fff" }
            }
            className="rounded-full border-[3px] px-3.5 py-1.5 text-sm font-bold transition"
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
              onClick={() => setActiveId(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveId(c.id);
                }
              }}
              style={
                active
                  ? {
                      backgroundColor: col,
                      borderColor: col,
                      color: "#0d0d0d",
                    }
                  : { borderColor: col, color: col }
              }
              className="group relative inline-flex items-center rounded-full border-[3px] px-3.5 py-1.5 text-sm font-bold transition"
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
                    setActiveId(c.id);
                    setSettingsOpen(true);
                  }}
                  aria-label={`Настройки коллекции «${c.name}»`}
                  title="Настройки коллекции"
                  style={
                    {
                      "--badge": col,
                    } as React.CSSProperties
                  }
                  className="absolute right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-(--badge) hover:text-[#0d0d0d] group-hover:flex"
                >
                  <IconSettings size={16} stroke={2.5} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => setCreating(true)}
          aria-label="Новая коллекция"
          title="Новая коллекция"
          className="icon-btn h-9 w-9"
        >
          <IconPlus size={18} stroke={2.5} />
        </button>
      </div>

      {/* Подсказка о доступе для не-владельцев */}
      {!isAllView && activeCollection && !isOwner && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">
            {role === "viewer"
              ? "Доступ только на просмотр"
              : "Общая коллекция · можно редактировать"}
          </span>
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
                    ? {
                        backgroundColor: c,
                        borderColor: c,
                        color: "#0d0d0d",
                      }
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
          {allTags.map((tag) => {
            const c = colorForKey(tag);
            const active = tagFilters.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => setTagFilters(active ? tagFilters.filter((t) => t !== tag) : [...tagFilters, tag])}
                style={
                  active
                    ? {
                        backgroundColor: c,
                        borderColor: c,
                        color: "#0d0d0d",
                      }
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

      {/* Добавление игр и выбор нескольких для перемещения */}
      {loaded &&
        collectionsLoaded &&
        (canRunCommands || visibleGames.some(canEditGame)) && (
          <div className="flex flex-wrap items-center gap-2">
            {visibleGames.some(canEditGame) &&
              (!selecting ? (
                <button
                  onClick={() => setSelecting(true)}
                  className="btn btn-ghost px-3 py-1.5 text-sm"
                >
                  <IconChecks size={16} className="mr-1" /> Выбрать несколько
                </button>
              ) : (
                <>
                  <span className="text-sm font-bold text-white">
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
              ))}
            {canRunCommands && !selecting && (
              <button
                onClick={() => setAddingGames(true)}
                className="btn btn-brand ml-auto px-3 py-1.5 text-sm"
              >
                <IconPlus size={16} className="mr-1" /> Добавить игры
              </button>
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
        <div className="grid grid-flow-row-dense grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {nodes.map((node, i) => {
            const { game, orphanBase, expansions } = node;
            const isOrphan = !!orphanBase;
            const editable = !isOrphan && canEditGame(game);
            const selected = selectedIds.has(game.id);
            const selectMode = selecting && editable;
            const expanded = expandedKey === node.key;
            // Карточка занимает 2 колонки и пока разворачивается, и пока
            // закрывается (чтобы блок успел плавно ужаться обратно).
            const wide = expanded || closingKey === node.key;
            const hasExp = expansions.length > 0;
            // Ширина блока: «полная» (2 колонки) только когда открыт и анимация
            // запущена; иначе — одна колонка (старт открытия / цель закрытия).
            const cardWidth = wide
              ? open && expanded
                ? "100%"
                : cardColWidth != null
                  ? `${cardColWidth}px`
                  : undefined
              : undefined;

            // Что рисуем на главной плитке: для сирот — отсутствующая база (ч/б).
            const coverThumb = isOrphan ? orphanBase!.thumbnailUrl : game.thumbnailUrl;
            const coverLarge = isOrphan ? orphanBase!.imageUrl : game.imageUrl;
            const coverName = isOrphan ? orphanBase!.name : game.name;
            const href = `/game/${game.gameId}?c=${game.collectionId}`;

            const cover = (
              <div className="aspect-square overflow-hidden border-b-[3px] border-ink bg-brand-soft">
                {coverThumb || coverLarge ? (
                  <ProgressiveImage
                    smallUrl={coverThumb}
                    largeUrl={coverLarge}
                    alt={coverName}
                    className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                      isOrphan ? "opacity-60 grayscale" : ""
                    }`}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink/30">
                    <IconDice5Filled size={48} />
                  </div>
                )}
              </div>
            );

            return (
              <div
                key={node.key}
                style={
                  { "--ring": colorAt(i), width: cardWidth } as React.CSSProperties
                }
                onClickCapture={
                  selectMode
                    ? (e) => {
                        e.preventDefault();
                        toggleSelected(game.id);
                      }
                    : undefined
                }
                className={`tile group relative overflow-hidden ${
                  wide
                    ? "col-span-2 justify-self-start transition-[width] duration-300 ease-out"
                    : ""
                } ${selectMode ? "cursor-pointer" : ""} ${
                  selected ? "ring-4 ring-brand" : ""
                } ${selecting && !editable ? "opacity-40" : ""}`}
              >
                {/* Левая часть — задаёт высоту карточки. В развёрнутом виде её
                    ширина зафиксирована на замеренной ширине одной колонки,
                    поэтому квадратная обложка и высота карточки не меняются, пока
                    блок растёт в ширину. */}
                <div
                  className={`relative ${wide ? "shrink-0" : ""}`}
                  style={
                    wide && leftColWidth != null
                      ? { width: `${leftColWidth}px` }
                      : undefined
                  }
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
                    {isOrphan ? cover : <Link href={href}>{cover}</Link>}
                    <div className="p-3">
                      {isOrphan ? (
                        <h3 className="truncate font-bold text-ink/40" title={coverName}>
                          {coverName}
                        </h3>
                      ) : (
                        <Link href={href}>
                          <h3
                            className="truncate font-bold text-ink hover:text-brand"
                            title={coverName}
                          >
                            {coverName}
                          </h3>
                        </Link>
                      )}
                      {isOrphan ? (
                        <p className="mt-1 text-xs font-medium text-ink/40">
                          Базы нет в коллекции
                        </p>
                      ) : (
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
                      )}
                      {!isOrphan && game.tags.length > 0 && (
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
                      {/* Бейдж «+N допов» с превью — разворачивает карточку */}
                      {hasExp && (
                        <button
                          type="button"
                          onClick={(e) =>
                            toggleExpanded(
                              node.key,
                              e.currentTarget.closest(".tile")?.firstElementChild,
                            )
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

                {/* Правая часть — абсолютная панель: высоту задаёт левая колонка
                    (карточка не растёт в высоту), левый край — на границе левой
                    части, правый прижат к краю блока. Раскрывается вместе с ростом
                    ширины блока (клиппится его overflow-hidden). */}
                {hasExp && wide && (
                  <div
                    aria-hidden={!expanded}
                    style={
                      leftColWidth != null
                        ? { left: `${leftColWidth}px` }
                        : undefined
                    }
                    className="absolute bottom-0 right-0 top-0 flex flex-col gap-1 overflow-y-auto border-l-[3px] border-ink bg-brand-soft/30 p-2"
                  >
                    {expansions.map((exp, idx) => (
                      <Link
                        key={exp.gameId}
                        href={`/game/${exp.gameId}?c=${exp.collectionId}`}
                        className={`flex items-center gap-1 ${idx === 0 ? 'rounded-tr-lg' : ''} ${idx === expansions.length - 1 ? 'rounded-br-lg' : ''} border-3 border-ink bg-white transition hover:bg-brand hover:text-white`}
                      >
                        <span className="relative h-14 w-14 shrink-0 overflow-hidden border-r-3 border-ink bg-brand-soft">
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
                        <span className="min-w-0 flex-1 line-clamp-2 leading-none text-xs font-bold">
                          {exp.name}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Маяк бесконечной прокрутки + ручная кнопка (нужна, когда фильтр
          оставил мало строк и автоскролл не срабатывает). */}
      {loaded && nextCursor && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full border-[3px] border-ink bg-white px-5 py-2 font-semibold text-ink hover:bg-brand hover:text-white disabled:opacity-50"
          >
            {loadingMore ? "Загрузка…" : "Показать ещё"}
          </button>
        </div>
      )}

      {addingGames && canRunCommands && (
        <Modal title="Добавить игры" onClose={() => setAddingGames(false)}>
          <div className="space-y-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                runCommand(command);
              }}
            >
              <input
                autoFocus
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                disabled={busy}
                placeholder="Например: «добавь Каркассон и Манчкин, пометь Манчкин как пати»"
                className="field control-h flex-1 rounded-full px-5 text-sm disabled:opacity-50"
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
            <div className="flex items-center gap-2">
              <VoiceInput onTranscript={runCommand} disabled={busy} />
              <PhotoInput
                collectionId={commandTarget}
                onAdded={() => {
                  setAddingGames(false);
                  loadGames();
                  loadCollections(activeId);
                }}
                onStatus={setStatus}
              />
              <span className="text-xs font-medium text-ink/55">
                Или скажите голосом / загрузите фото полки с играми
              </span>
            </div>
          </div>
        </Modal>
      )}

      {settingsOpen && activeCollection && (
        <CollectionSettingsDialog
          collection={activeCollection}
          visibilityOptions={VISIBILITY_OPTIONS}
          currentUserId={userId}
          canDelete={!activeCollection.isDefault && collections.length > 1}
          onRename={renameCollection}
          onUpdateVisibility={updateVisibility}
          onRequestDelete={requestDeleteCollection}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {creating && (
        <CreateCollectionDialog
          options={VISIBILITY_OPTIONS}
          onSubmit={createCollection}
          onClose={() => setCreating(false)}
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
