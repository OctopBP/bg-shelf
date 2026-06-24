"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconArrowRight,
  IconChecks,
  IconFolderSymlink,
  IconLoader2,
  IconLock,
  IconMessage2,
  IconPlus,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react";
import VoiceInput from "./VoiceInput";
import PhotoInput from "./PhotoInput";
import Modal from "./Modal";
import CollectionSettingsDialog from "./CollectionSettingsDialog";
import CreateCollectionDialog from "./CreateCollectionDialog";
import ConfirmDialog from "./ConfirmDialog";
import MoveGameDialog from "./MoveGameDialog";
import AddGamesDialog, { type ResolvedGame } from "./AddGamesDialog";
import { CollectionTabs, FilterBar, GameGrid } from "./collection";
import type { GridNode, QuickFilter } from "./collection";
import type { CollectionRole, CollectionVisibility } from "@/lib/collections";
import {
  useCollectionData,
  ALL,
  type CollectionGame,
} from "@/hooks/useCollectionData";
import { pluralGames } from "@/lib/plural";

const VISIBILITY_OPTIONS: {
  value: CollectionVisibility;
  label: string;
  Icon: typeof IconWorld;
}[] = [
  { value: "public", label: "Видна всем", Icon: IconWorld },
  { value: "friends", label: "Только друзьям", Icon: IconUsers },
  { value: "private", label: "Только мне", Icon: IconLock },
];

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
  // Состояние разворота карточки живёт в GameGrid и сбрасывается через key.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTagFilters([]);
    setQuickFilter(null);
    setSelecting(false);
    setSelectedIds(new Set());
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

  const allGamesCount = collections
    .map((c) => c.gameCount)
    .reduce((a, b) => a + b, 0);

  const visibleGames = useMemo(
    () =>
      games.filter(
        (g) =>
          (tagFilters.length === 0 ||
            tagFilters.every((t) => g.tags.includes(t))) &&
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
      <CollectionTabs
        collections={collections}
        activeId={activeId}
        isAllView={isAllView}
        collectionsLoaded={collectionsLoaded}
        allGamesCount={allGamesCount}
        onSelect={setActiveId}
        onOpenSettings={() => setSettingsOpen(true)}
        onCreate={() => setCreating(true)}
      />

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

      {/* Быстрые фильтры и фильтр по тегам */}
      <FilterBar
        quickFilters={quickFilters}
        activeQuickKey={quickFilter}
        onQuickToggle={(key) =>
          setQuickFilter((cur) => (cur === key ? null : key))
        }
        allTags={allTags}
        tagFilters={tagFilters}
        onTagToggle={(tag) =>
          setTagFilters((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
          )
        }
      />

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

      {/* Сетка игр (key сбрасывает разворот карточки при смене вида) */}
      <GameGrid
        key={activeId}
        nodes={nodes}
        loaded={loaded}
        collectionsLoaded={collectionsLoaded}
        gamesCount={games.length}
        visibleCount={visibleGames.length}
        canEdit={canEdit}
        canEditGame={canEditGame}
        selecting={selecting}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
        onMove={setMoving}
        onRemove={removeGame}
        nextCursor={nextCursor}
        loadingMore={loadingMore}
        loadMore={loadMore}
        sentinelRef={sentinelRef}
      />

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
