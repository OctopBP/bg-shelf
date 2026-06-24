import type {
  CollectionGame,
  ExpansionSummary,
  BaseSummary,
} from "@/hooks/useCollectionData";

/** Узел сетки: базовая/обычная игра, либо «осиротевшее» дополнение (базы нет
 *  в коллекции) — тогда главная плитка рисует ч/б обложку отсутствующей базы. */
export interface GridNode {
  key: string;
  /** Якорная запись коллекции (база/обычная игра или представитель сирот). */
  game: CollectionGame;
  /** Отсутствующая в коллекции база — рисуем её плитку ч/б. */
  orphanBase?: BaseSummary;
  /** Дополнения этого узла, присутствующие в коллекции. */
  expansions: ExpansionSummary[];
}

/** Быстрый фильтр по данным BGG — применяется в связке (И) с фильтром по тегам. */
export interface QuickFilter {
  key: string;
  label: string;
  test: (g: CollectionGame) => boolean;
}
