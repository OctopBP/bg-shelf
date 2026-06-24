"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionSummary } from "@/lib/collections";

/** Поля игры, нужные списку коллекции (подмножество CollectionGame из lib). */
export interface CollectionGame {
  id: string;
  collectionId: string;
  collectionName?: string;
  gameId: number;
  bggId: number | null;
  name: string;
  yearPublished: number | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  rating: number | null;
  isExpansion: boolean;
  tags: string[];
}

/** Сводка дополнения, присутствующего в коллекции (зеркалит lib/collection). */
export interface ExpansionSummary {
  gameId: number;
  name: string;
  thumbnailUrl: string | null;
  collectionId: string;
}

/** Сводка базовой игры дополнения. */
export interface BaseSummary {
  gameId: number;
  name: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  present: boolean;
}

/** Карта связей дополнений активного вида. */
export interface ExpansionMap {
  byBase: Record<number, ExpansionSummary[]>;
  expansionToBase: Record<number, BaseSummary>;
}

const EMPTY_EXPANSION_MAP: ExpansionMap = { byBase: {}, expansionToBase: {} };

/** Сводный вид «Все игры». */
export const ALL = "all";

/**
 * Переиспользуемая загрузка данных коллекций (A-4): список коллекций, активная
 * вкладка, игры активного вида и курсорная пагинация. UI-состояние (фильтры,
 * выбор, диалоги) остаётся в компоненте — хук отвечает только за данные.
 */
export function useCollectionData() {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [userId, setUserId] = useState("");
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string>(ALL);

  const [games, setGames] = useState<CollectionGame[]>([]);
  const [expansionMap, setExpansionMap] =
    useState<ExpansionMap>(EMPTY_EXPANSION_MAP);
  const [loaded, setLoaded] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const isAllView = activeId === ALL;

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

  // Базовый URL списка игр (одна коллекция или сводный вид «Все игры»).
  const gamesUrl = useCallback(
    (cursor?: string | null) => {
      const base = isAllView
        ? "/api/collection?all=1"
        : `/api/collection?collectionId=${activeId}`;
      return cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
    },
    [activeId, isAllView],
  );

  const loadGames = useCallback(async () => {
    setLoaded(false);
    const res = await fetch(gamesUrl());
    const data = res.ok
      ? await res.json()
      : { games: [], nextCursor: null, expansionMap: EMPTY_EXPANSION_MAP };
    setGames((data.games as CollectionGame[]) ?? []);
    setNextCursor((data.nextCursor as string | null) ?? null);
    setExpansionMap((data.expansionMap as ExpansionMap) ?? EMPTY_EXPANSION_MAP);
    setLoaded(true);
  }, [gamesUrl]);

  // Догрузка следующей страницы: добавляем к уже загруженным играм.
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(gamesUrl(nextCursor));
      const data = res.ok ? await res.json() : { games: [], nextCursor: null };
      const more = (data.games as CollectionGame[]) ?? [];
      setGames((prev) => {
        const seen = new Set(prev.map((g) => g.id));
        return [...prev, ...more.filter((g) => !seen.has(g.id))];
      });
      setNextCursor((data.nextCursor as string | null) ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, gamesUrl]);

  useEffect(() => {
    if (!collectionsLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGames();
  }, [collectionsLoaded, loadGames]);

  // Бесконечная подгрузка: когда «маяк» в конце списка попадает в зону
  // видимости — тянем следующую страницу.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadMore]);

  return {
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
  };
}
