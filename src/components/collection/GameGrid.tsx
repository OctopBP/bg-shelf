"use client";

import { useState, type RefObject } from "react";
import { IconDice5Filled, IconSearch } from "@tabler/icons-react";
import { colorAt } from "@/lib/palette";
import type { CollectionGame } from "@/hooks/useCollectionData";
import GameCard from "./GameCard";
import type { GridNode } from "./types";

interface GameGridProps {
  nodes: GridNode[];
  loaded: boolean;
  collectionsLoaded: boolean;
  /** Всего игр в активном виде (для текста пустого состояния). */
  gamesCount: number;
  /** Игр после фильтров (условие «нет по фильтру»). */
  visibleCount: number;
  /** Можно ли редактировать активную коллекцию (текст пустого состояния). */
  canEdit: boolean;
  canEditGame: (g: CollectionGame) => boolean;
  selecting: boolean;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onMove: (g: CollectionGame) => void;
  onRemove: (g: CollectionGame) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  loadMore: () => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
}

/** Сетка игр: плитки, состояния загрузки/пустоты, анимация разворота карточки
 *  и маяк бесконечной прокрутки. Состояние разворота локально — нужно только
 *  сетке (сбрасывается при смене вида через key в родителе). */
export default function GameGrid({
  nodes,
  loaded,
  collectionsLoaded,
  gamesCount,
  visibleCount,
  canEdit,
  canEditGame,
  selecting,
  selectedIds,
  onToggleSelected,
  onMove,
  onRemove,
  nextCursor,
  loadingMore,
  loadMore,
  sentinelRef,
}: GameGridProps) {
  // Какой узел развёрнут (показывает список дополнений справа) и какой
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

  if (!loaded || !collectionsLoaded) {
    return (
      <p className="py-16 text-center font-semibold text-muted">Загрузка…</p>
    );
  }

  if (visibleCount === 0) {
    return (
      <div className="surface mx-auto mt-4 max-w-md px-6 py-12 text-center">
        <div className="mb-3 flex justify-center text-ink/30">
          {gamesCount === 0 ? (
            <IconDice5Filled size={56} />
          ) : (
            <IconSearch size={56} />
          )}
        </div>
        <p className="font-medium text-ink/70">
          {gamesCount === 0
            ? canEdit
              ? "Коллекция пуста. Скажите или напишите команду, либо загрузите фото полки с играми."
              : "В этой коллекции пока нет игр."
            : "Нет игр по выбранному фильтру."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-flow-row-dense grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {nodes.map((node, i) => {
          const { game, orphanBase, expansions } = node;
          const isOrphan = !!orphanBase;
          const editable = !isOrphan && canEditGame(game);
          const expanded = expandedKey === node.key;
          // Карточка занимает 2 колонки и пока разворачивается, и пока
          // закрывается (чтобы блок успел плавно ужаться обратно).
          const wide = expanded || closingKey === node.key;
          return (
            <GameCard
              key={node.key}
              game={game}
              orphanBase={orphanBase}
              expansions={expansions}
              ringColor={colorAt(i)}
              editable={editable}
              selecting={selecting}
              selected={selectedIds.has(game.id)}
              expanded={expanded}
              wide={wide}
              open={open}
              cardColWidth={cardColWidth}
              leftColWidth={leftColWidth}
              onToggleExpanded={(leftCol) => toggleExpanded(node.key, leftCol)}
              onMove={() => onMove(game)}
              onRemove={() => onRemove(game)}
              onToggleSelected={() => onToggleSelected(game.id)}
            />
          );
        })}
      </div>

      {/* Маяк бесконечной прокрутки + ручная кнопка (нужна, когда фильтр
          оставил мало строк и автоскролл не срабатывает). */}
      {nextCursor && (
        <div ref={sentinelRef} className="mt-6 flex justify-center py-6">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full border-[3px] border-ink bg-white px-5 py-2 font-semibold text-ink hover:bg-brand hover:text-white disabled:opacity-50"
          >
            {loadingMore ? "Загрузка…" : "Показать ещё"}
          </button>
        </div>
      )}
    </>
  );
}
