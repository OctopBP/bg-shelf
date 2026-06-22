import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getBggGameDetails } from "./bgg";

type DB = SupabaseClient<Database>;
type GameRow = Database["public"]["Tables"]["games"]["Row"];

/** Форма строки joined-select (collection_items + games [+ collections]). */
type CollectionItemRow = Pick<
  Database["public"]["Tables"]["collection_items"]["Row"],
  "id" | "collection_id" | "bgg_id" | "tags" | "notes" | "added_at"
> & {
  games: GameRow | null;
  collections?: { name: string } | null;
};

export interface CollectionGame {
  id: string;
  /** Коллекция, которой принадлежит эта запись. */
  collectionId: string;
  /** Имя коллекции — заполняется только в сводном виде «Все игры». */
  collectionName?: string;
  bggId: number;
  name: string;
  /** Оригинальное название (обычно английское); null, если совпадает с name */
  originalName: string | null;
  yearPublished: number | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  rating: number | null;
  weight: number | null;
  description: string | null;
  categories: string[];
  mechanics: string[];
  tags: string[];
  notes: string | null;
  addedAt: string;
}

/** Поля игры, которые пользователь может править вручную. */
export interface GameInfoUpdate {
  name?: string;
  yearPublished?: number | null;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  playingTime?: number | null;
  description?: string | null;
}

/** Приводит строку joined-select (collection_items + games) к CollectionGame. */
function mapRow(row: CollectionItemRow): CollectionGame {
  const game = row.games;
  if (!game) throw new Error("Запись коллекции без связанной игры в кэше games");
  const collection = row.collections ?? undefined;
  return {
    id: row.id,
    collectionId: row.collection_id,
    ...(collection ? { collectionName: collection.name } : {}),
    bggId: row.bgg_id,
    name: game.name,
    originalName: game.original_name ?? null,
    yearPublished: game.year_published,
    thumbnailUrl: game.thumbnail_url,
    imageUrl: game.image_url,
    minPlayers: game.min_players,
    maxPlayers: game.max_players,
    playingTime: game.playing_time,
    rating: game.rating,
    weight: game.weight,
    description: game.description ?? null,
    categories: game.categories ?? [],
    mechanics: game.mechanics ?? [],
    tags: row.tags ?? [],
    notes: row.notes ?? null,
    addedAt: row.added_at,
  };
}

/** Подтягивает игру из BGG, кладёт в кэш games и добавляет в коллекцию. */
export async function addGameToCollection(
  supabase: DB,
  collectionId: string,
  bggId: number,
  tags: string[] = [],
  userId?: string
): Promise<{ name: string }> {
  console.log(`[collection] addGameToCollection collection=${collectionId} bggId=${bggId}, tags=[${tags.join(", ")}]`);
  const details = await getBggGameDetails(bggId);
  if (!details) {
    console.error(`[collection] BGG детали для id=${bggId} не найдены`);
    throw new Error(`Игра с BGG id ${bggId} не найдена`);
  }
  console.log(`[collection] детали из BGG: «${details.name}» (${details.yearPublished})`);

  // Кэш игр закрыт на прямую запись (RLS — только админ). Обычный пользователь
  // пополняет каталог через SECURITY DEFINER функцию cache_game: она лишь
  // ВСТАВЛЯЕТ отсутствующую игру и никогда не перезаписывает существующую
  // запись (защита от вандализма). См. миграцию 20260622150000.
  const { error: gameError } = await supabase.rpc("cache_game", {
    p_bgg_id: details.bggId,
    p_name: details.name,
    p_original_name: details.originalName ?? undefined,
    p_year_published: details.yearPublished ?? undefined,
    p_image_url: details.imageUrl ?? undefined,
    p_thumbnail_url: details.thumbnailUrl ?? undefined,
    p_min_players: details.minPlayers ?? undefined,
    p_max_players: details.maxPlayers ?? undefined,
    p_playing_time: details.playingTime ?? undefined,
    p_rating: details.rating ?? undefined,
    p_weight: details.weight ?? undefined,
    p_description: details.description ?? undefined,
    p_categories: details.categories,
    p_mechanics: details.mechanics,
  });
  if (gameError) {
    console.error(`[collection] cache_game упал:`, gameError);
    throw new Error(`Не удалось сохранить игру: ${gameError.message}`);
  }

  const { error: itemError } = await supabase.from("collection_items").upsert(
    { collection_id: collectionId, bgg_id: bggId, tags, added_by: userId ?? null },
    { onConflict: "collection_id,bgg_id" }
  );
  if (itemError) {
    console.error(`[collection] upsert collection_items упал:`, itemError);
    throw new Error(`Не удалось добавить в коллекцию: ${itemError.message}`);
  }

  console.log(`[collection] «${details.name}» добавлена в collection=${collectionId}`);
  return { name: details.name };
}

export async function removeGameFromCollection(
  supabase: DB,
  collectionId: string,
  bggId: number
): Promise<void> {
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("bgg_id", bggId)
    .eq("collection_id", collectionId);
  if (error) throw new Error(`Не удалось удалить: ${error.message}`);
}

/** Переносит запись игры из одной коллекции в другую. Теги и заметку
 *  сохраняем. BGG не трогаем — игра уже есть в кэше games. */
export async function moveGameToCollection(
  supabase: DB,
  fromCollectionId: string,
  toCollectionId: string,
  bggId: number,
  userId: string
): Promise<void> {
  if (fromCollectionId === toCollectionId) return;

  const { data: existing, error: selErr } = await supabase
    .from("collection_items")
    .select("tags, notes")
    .eq("bgg_id", bggId)
    .eq("collection_id", fromCollectionId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!existing) throw new Error("Игра не найдена в исходной коллекции");
  const tags = existing.tags ?? [];
  const notes = existing.notes ?? null;

  const { error: insErr } = await supabase.from("collection_items").upsert(
    { collection_id: toCollectionId, bgg_id: bggId, tags, notes, added_by: userId },
    { onConflict: "collection_id,bgg_id" }
  );
  if (insErr) throw new Error(`Не удалось переместить: ${insErr.message}`);

  await removeGameFromCollection(supabase, fromCollectionId, bggId);
}

export async function updateGameTags(
  supabase: DB,
  collectionId: string,
  bggId: number,
  tags: string[]
): Promise<void> {
  const { error } = await supabase
    .from("collection_items")
    .update({ tags })
    .eq("bgg_id", bggId)
    .eq("collection_id", collectionId);
  if (error) throw new Error(`Не удалось обновить теги: ${error.message}`);
}

/** Обновляет данные записи коллекции (теги и/или заметку). */
export async function updateCollectionItem(
  supabase: DB,
  collectionId: string,
  bggId: number,
  fields: { tags?: string[]; notes?: string | null }
): Promise<void> {
  const patch: Database["public"]["Tables"]["collection_items"]["Update"] = {};
  if (fields.tags !== undefined) patch.tags = fields.tags;
  if (fields.notes !== undefined) patch.notes = fields.notes;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("collection_items")
    .update(patch)
    .eq("bgg_id", bggId)
    .eq("collection_id", collectionId);
  if (error) throw new Error(`Не удалось сохранить: ${error.message}`);
}

/** Правит общий кэш игры (games) — название, год, число игроков, время, описание. */
export async function updateGameInfo(
  supabase: DB,
  bggId: number,
  info: GameInfoUpdate
): Promise<void> {
  const patch: Database["public"]["Tables"]["games"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (info.name !== undefined) patch.name = info.name;
  if (info.yearPublished !== undefined) patch.year_published = info.yearPublished;
  if (info.minPlayers !== undefined) patch.min_players = info.minPlayers;
  if (info.maxPlayers !== undefined) patch.max_players = info.maxPlayers;
  if (info.playingTime !== undefined) patch.playing_time = info.playingTime;
  if (info.description !== undefined) patch.description = info.description;

  const { error } = await supabase
    .from("games")
    .update(patch)
    .eq("bgg_id", bggId);
  if (error) throw new Error(`Не удалось обновить игру: ${error.message}`);
}

/** Одна игра из коллекции по bggId (для страницы игры). */
export async function getCollectionGame(
  supabase: DB,
  collectionId: string,
  bggId: number
): Promise<CollectionGame | null> {
  const { data, error } = await supabase
    .from("collection_items")
    .select("id, collection_id, bgg_id, tags, notes, added_at, games(*)")
    .eq("bgg_id", bggId)
    .eq("collection_id", collectionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data);
}

export async function listCollection(
  supabase: DB,
  collectionId: string
): Promise<CollectionGame[]> {
  const { data, error } = await supabase
    .from("collection_items")
    .select("id, collection_id, bgg_id, tags, notes, added_at, games(*)")
    .eq("collection_id", collectionId)
    .order("added_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map(mapRow);
}

/** Совпадение из нашей БД по основному или альтернативному названию. */
export interface LocalGameMatch {
  bggId: number;
  name: string;
  yearPublished: number | null;
  thumbnailUrl: string | null;
}

/**
 * Ищет игры в нашей БД по основному И альтернативным названиям (RPC
 * `search_games` — триграммный fuzzy-поиск по таблице game_names). Принимает
 * несколько вариантов запроса (например, как сказал пользователь и переведённое
 * на оригинал название) и объединяет результаты, сохраняя порядок и убирая дубли
 * по bgg_id. Игры без bgg_id пропускаем — их пока нельзя положить в коллекцию
 * (collection_items ссылается на games.bgg_id). Best-effort: при ошибке RPC
 * (например, демо-режим) возвращает пустой список, и вызывающий код откатывается
 * на поиск BGG. */
export async function searchLocalGames(
  supabase: DB,
  queries: string[],
  limit = 4
): Promise<LocalGameMatch[]> {
  const seen = new Set<number>();
  const out: LocalGameMatch[] = [];
  const uniqueQueries = [
    ...new Set(queries.map((q) => q.trim()).filter(Boolean)),
  ];

  for (const q of uniqueQueries) {
    const { data, error } = await supabase.rpc("search_games", { q, lim: limit });
    if (error) {
      console.error(`[search_games] «${q}»:`, error.message);
      continue;
    }
    for (const row of data ?? []) {
      const bggId = row.bgg_id;
      if (bggId == null || seen.has(bggId)) continue;
      seen.add(bggId);
      out.push({
        bggId,
        name: row.name,
        yearPublished: row.year_published ?? null,
        thumbnailUrl: row.thumbnail_url ?? null,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Игры из коллекций самого пользователя (сводный вид «Все игры»).
 *  Берём только коллекции, в которых пользователь состоит (как и список вкладок),
 *  иначе RLS отдал бы ещё и чужие публичные коллекции и коллекции друзей.
 *  Имя коллекции приходит из joined-select. */
export async function listAllGames(
  supabase: DB
): Promise<CollectionGame[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");

  const { data: memberships, error: memErr } = await supabase
    .from("collection_members")
    .select("collection_id")
    .eq("user_id", user.id);
  if (memErr) throw new Error(memErr.message);

  const ids = (memberships ?? []).map((m) => m.collection_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("collection_items")
    .select("id, collection_id, bgg_id, tags, notes, added_at, games(*), collections(name)")
    .in("collection_id", ids)
    .order("added_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map(mapRow);
}
