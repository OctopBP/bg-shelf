"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconDice5Filled,
  IconStarFilled,
  IconSearch,
} from "@tabler/icons-react";
import { colorAt, colorForKey } from "@/lib/palette";
import type { CollectionSummary } from "@/lib/collections";

interface CollectionGame {
  id: string;
  collectionId: string;
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

export default function FriendCollections({ friendId }: { friendId: string }) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);

  const [games, setGames] = useState<CollectionGame[]>([]);
  const [gamesLoaded, setGamesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/friends/${friendId}/collections`);
      const json = res.ok ? await res.json() : { collections: [] };
      if (cancelled) return;
      const list = (json.collections as CollectionSummary[]) ?? [];
      setCollections(list);
      setActiveId(list[0]?.id ?? null);
      setCollectionsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [friendId]);

  const loadGames = useCallback(async (collectionId: string) => {
    setGamesLoaded(false);
    const res = await fetch(`/api/collection?collectionId=${collectionId}`);
    const json = res.ok ? await res.json() : { games: [] };
    setGames((json.games as CollectionGame[]) ?? []);
    setGamesLoaded(true);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGames(activeId);
  }, [activeId, loadGames]);

  if (collectionsLoaded && collections.length === 0) {
    return (
      <div className="surface mx-auto mt-4 max-w-md px-6 py-12 text-center">
        <IconDice5Filled size={56} className="mx-auto mb-3 text-ink/30" />
        <p className="font-medium text-ink/70">У друга пока нет коллекций.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Вкладки коллекций друга */}
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
            </button>
          );
        })}
      </div>

      {/* Сетка игр (только просмотр) */}
      {!collectionsLoaded || !gamesLoaded ? (
        <p className="py-16 text-center font-semibold text-muted">Загрузка…</p>
      ) : games.length === 0 ? (
        <div className="surface mx-auto mt-4 max-w-md px-6 py-12 text-center">
          <IconSearch size={56} className="mx-auto mb-3 text-ink/30" />
          <p className="font-medium text-ink/70">В этой коллекции пока нет игр.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {games.map((game, i) => (
            <div
              key={game.id}
              style={{ "--ring": colorAt(i) } as React.CSSProperties}
              className="tile group relative overflow-hidden"
            >
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
              <div className="p-3">
                <h3 className="truncate font-bold text-ink" title={game.name}>
                  {game.name}
                </h3>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
