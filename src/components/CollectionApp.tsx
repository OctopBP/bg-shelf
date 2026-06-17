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
} from "@tabler/icons-react";
import VoiceInput from "./VoiceInput";
import PhotoInput from "./PhotoInput";
import { colorAt, colorForKey } from "@/lib/palette";

interface CollectionGame {
  id: string;
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

export default function CollectionApp() {
  const [games, setGames] = useState<CollectionGame[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const loadCollection = useCallback(async () => {
    const res = await fetch("/api/collection");
    const data = res.ok ? await res.json() : { games: [] };
    setGames((data.games as CollectionGame[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // setState происходит после await внутри loadCollection, а не синхронно
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCollection();
  }, [loadCollection]);

  async function runCommand(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setStatus(`Выполняю: «${text}»`);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setStatus(data.reply);
      setCommand("");
      if (data.changed) loadCollection();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function removeGame(bggId: number) {
    await fetch("/api/collection", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bggId }),
    });
    loadCollection();
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
      {/* Панель команд */}
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
        <PhotoInput onAdded={loadCollection} onStatus={setStatus} />
      </div>

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
      {!loaded ? (
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
              ? "Коллекция пуста. Скажите или напишите команду, либо загрузите фото полки с играми."
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
              <Link href={`/game/${game.bggId}`}>
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
                <Link href={`/game/${game.bggId}`}>
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
              <button
                onClick={() => removeGame(game.bggId)}
                title="Удалить из коллекции"
                aria-label={`Удалить ${game.name}`}
                className="absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-full border-[3px] border-ink bg-white text-ink hover:bg-coral hover:text-white group-hover:flex"
              >
                <IconX size={16} stroke={3} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
