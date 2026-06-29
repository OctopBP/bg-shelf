"use client";

import { useEffect, useState } from "react";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDice5Filled,
  IconLoader2,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";

const PAGE_SIZE = 20;

interface BrowseRow {
  gameId: number;
  bggId: number | null;
  name: string;
  yearPublished: number | null;
  thumbnailUrl: string | null;
  inCollection: boolean;
}

interface GameBrowserProps {
  collectionId: string;
  onAdded: () => void;
  onStatus: (message: string) => void;
}

/** Каталог всех игр БД с постраничным простым (substring) поиском — режим
 *  «Умный поиск выключен» в окне добавления. Каждая строка добавляется в
 *  коллекцию сразу по нажатию «+», без подбора кандидатов и тегов. */
export default function GameBrowser({
  collectionId,
  onAdded,
  onStatus,
}: GameBrowserProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<BrowseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query,
          page: String(page),
          pageSize: String(PAGE_SIZE),
          collectionId,
        });
        const res = await fetch(`/api/games/browse?${params}`);
        const data = await res.json();
        if (!active) return;
        if (res.ok) {
          setRows(data.games ?? []);
          setTotal(data.total ?? 0);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, page, collectionId]);

  async function quickAdd(row: BrowseRow) {
    if (row.bggId == null) return;
    setAddingId(row.bggId);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, items: [{ bggId: row.bggId }] }),
      });
      const data = await res.json();
      if (!res.ok || data.failed?.length) {
        throw new Error(data.error ?? "Не удалось добавить игру");
      }
      setRows((prev) =>
        prev.map((r) => (r.gameId === row.gameId ? { ...r, inCollection: true } : r))
      );
      onStatus(`Добавлено: ${row.name}`);
      onAdded();
    } catch (e) {
      onStatus(e instanceof Error ? e.message : "Ошибка добавления");
    } finally {
      setAddingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative shrink-0">
        <IconSearch
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/40"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Название игры (например, «корни» или «root»)…"
          className="field control-h w-full rounded-full pl-11 pr-4 text-sm"
        />
      </div>

      <div className="min-h-[12rem] flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-10 text-ink/40">
            <IconLoader2 size={28} className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm font-medium text-ink/50">
            Ничего не найдено.
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.gameId}
              className="flex items-center overflow-hidden gap-3 rounded-2xl border-3 border-ink bg-black/[0.02] pr-2.5"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border-r-3 border-ink bg-brand-soft">
                {row.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.thumbnailUrl}
                    alt={row.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <IconDice5Filled size={20} className="text-ink/30" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink" title={row.name}>
                  {row.name}
                </p>
                {row.yearPublished && (
                  <p className="text-xs font-medium text-ink/50">
                    {row.yearPublished}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => quickAdd(row)}
                disabled={row.inCollection || addingId === row.bggId || row.bggId == null}
                aria-label={row.inCollection ? "Уже в коллекции" : "Добавить в коллекцию"}
                className="icon-btn h-9 w-9 shrink-0 disabled:opacity-50"
              >
                {addingId === row.bggId ? (
                  <IconLoader2 size={18} className="animate-spin" />
                ) : row.inCollection ? (
                  <IconCheck size={18} stroke={2.5} />
                ) : (
                  <IconPlus size={18} stroke={2.5} />
                )}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="icon-btn h-8 w-8 disabled:opacity-40"
          aria-label="Предыдущая страница"
        >
          <IconChevronLeft size={16} stroke={2.5} />
        </button>
        <span className="text-xs font-bold text-ink/60">
          Стр. {page} из {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="icon-btn h-8 w-8 disabled:opacity-40"
          aria-label="Следующая страница"
        >
          <IconChevronRight size={16} stroke={2.5} />
        </button>
      </div>
    </div>
  );
}
