import Link from "next/link";
import {
  IconCircleCheckFilled,
  IconClockFilled,
  IconFolderSymlink,
  IconStarFilled,
  IconUserFilled,
  IconX,
} from "@tabler/icons-react";
import type {
  CollectionGame,
  ExpansionSummary,
  BaseSummary,
} from "@/hooks/useCollectionData";
import { Tag } from "@/components/ui";
import GameCover from "./GameCover";
import ExpansionBadge from "./ExpansionBadge";
import ExpansionPanel from "./ExpansionPanel";

interface GameCardProps {
  game: CollectionGame;
  /** Отсутствующая в коллекции база — плитка рисуется ч/б. */
  orphanBase?: BaseSummary;
  expansions: ExpansionSummary[];
  /** Цвет кольца плитки (--ring). */
  ringColor: string;
  editable: boolean;
  selecting: boolean;
  selected: boolean;
  expanded: boolean;
  /** Карточка занимает 2 колонки (открыта или закрывается). */
  wide: boolean;
  /** Анимация ширины запущена (целевая ширина = 2 колонки). */
  open: boolean;
  /** Замеренная ширина одной колонки (px) — старт/цель анимации. */
  cardColWidth: number | null;
  /** Замеренная ширина левой части карточки (px) — фикс при анимации. */
  leftColWidth: number | null;
  onToggleExpanded: (leftCol: Element | null | undefined) => void;
  onMove: () => void;
  onRemove: () => void;
  onToggleSelected: () => void;
}

/** Плитка игры в сетке: обложка, мета, теги, бейдж и панель дополнений,
 *  кнопки действий и чекбокс выбора. Презентационный компонент — вся логика
 *  анимации и данных приходит пропсами из GameGrid. */
export default function GameCard({
  game,
  orphanBase,
  expansions,
  ringColor,
  editable,
  selecting,
  selected,
  expanded,
  wide,
  open,
  cardColWidth,
  leftColWidth,
  onToggleExpanded,
  onMove,
  onRemove,
  onToggleSelected,
}: GameCardProps) {
  const isOrphan = !!orphanBase;
  const selectMode = selecting && editable;
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
    <GameCover
      smallUrl={coverThumb}
      largeUrl={coverLarge}
      alt={coverName}
      dimmed={isOrphan}
    />
  );

  return (
    <div
      style={{ "--ring": ringColor, width: cardWidth } as React.CSSProperties}
      onClickCapture={
        selectMode
          ? (e) => {
              e.preventDefault();
              onToggleSelected();
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
      {/* Левая часть — задаёт высоту карточки. В развёрнутом виде её ширина
          зафиксирована на замеренной ширине одной колонки, поэтому квадратная
          обложка и высота карточки не меняются, пока блок растёт в ширину. */}
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
                className="truncate font-bold leading-none text-ink hover:text-brand"
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
            <p className="inline-flex items-center gap-1 align-middle text-xs font-medium text-ink/55">
              {game.minPlayers && game.maxPlayers
                ? <p className="inline-flex items-center gap-0.5 font-bold">
                  <IconUserFilled size={11} />
                {game.minPlayers === game.maxPlayers
                  ? `${game.minPlayers}`
                  : `${game.minPlayers}–${game.maxPlayers}`
                }
                </p>
                : ""}
              {game.playingTime ? (
                <>
                  <p>•</p>
                  <p className="inline-flex items-center gap-0.5 font-bold">
                  <IconClockFilled size={11} />
                  <p>{`${game.playingTime}`}</p>
                  </p>
                </>
              ) : (
                ""
              )}
              {game.rating ? (
                <>
                  <p>•</p>
                  <p className="inline-flex items-center gap-0.5 text-orange font-bold">
                    <IconStarFilled size={11} />
                    {Number(game.rating).toFixed(1)}
                  </p>
                </>
              ) : (
                ""
              )}
            </p>
          )}
          {!isOrphan && game.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {game.tags.map((tag) => (
                <Tag key={tag} label={tag} size="sm" />
              ))}
            </div>
          )}
          {/* Бейдж «+N допов» с превью — разворачивает карточку */}
          {hasExp && (
            <ExpansionBadge
              expansions={expansions}
              expanded={expanded}
              onToggle={onToggleExpanded}
            />
          )}
        </div>
        {editable && !selecting && (
          <div className="absolute right-2 top-2 hidden flex-col gap-1.5 group-hover:flex">
            <button
              onClick={onMove}
              title="Переместить в другую коллекцию"
              aria-label={`Переместить ${game.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-ink bg-white text-ink hover:bg-brand hover:text-white"
            >
              <IconFolderSymlink size={16} stroke={2.5} />
            </button>
            <button
              onClick={onRemove}
              title="Удалить из коллекции"
              aria-label={`Удалить ${game.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-ink bg-white text-ink hover:bg-coral hover:text-white"
            >
              <IconX size={16} stroke={3} />
            </button>
          </div>
        )}
      </div>

      {/* Правая часть — абсолютная панель дополнений. Раскрывается вместе с
          ростом ширины блока (клиппится его overflow-hidden). */}
      {hasExp && wide && (
        <ExpansionPanel
          expansions={expansions}
          leftColWidth={leftColWidth}
          expanded={expanded}
        />
      )}
    </div>
  );
}
