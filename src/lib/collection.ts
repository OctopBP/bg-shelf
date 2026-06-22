import type { SupabaseClient } from "@supabase/supabase-js";
import { getBggGameDetails } from "./bgg";

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
function mapRow(row: Record<string, unknown>): CollectionGame {
  const game = row.games as unknown as Record<string, unknown>;
  const collection = row.collections as Record<string, unknown> | undefined;
  return {
    id: row.id as string,
    collectionId: row.collection_id as string,
    ...(collection ? { collectionName: collection.name as string } : {}),
    bggId: row.bgg_id as number,
    name: game.name as string,
    originalName: (game.original_name as string | null) ?? null,
    yearPublished: game.year_published as number | null,
    thumbnailUrl: game.thumbnail_url as string | null,
    imageUrl: game.image_url as string | null,
    minPlayers: game.min_players as number | null,
    maxPlayers: game.max_players as number | null,
    playingTime: game.playing_time as number | null,
    rating: game.rating as number | null,
    weight: game.weight as number | null,
    description: (game.description as string | null) ?? null,
    categories: (game.categories as string[]) ?? [],
    mechanics: (game.mechanics as string[]) ?? [],
    tags: (row.tags as string[]) ?? [],
    notes: (row.notes as string | null) ?? null,
    addedAt: row.added_at as string,
  };
}

/** Подтягивает игру из BGG, кладёт в кэш games и добавляет в коллекцию. */
export async function addGameToCollection(
  supabase: SupabaseClient,
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

  const { error: gameError } = await supabase.from("games").upsert({
    bgg_id: details.bggId,
    name: details.name,
    original_name: details.originalName,
    year_published: details.yearPublished,
    image_url: details.imageUrl,
    thumbnail_url: details.thumbnailUrl,
    min_players: details.minPlayers,
    max_players: details.maxPlayers,
    playing_time: details.playingTime,
    rating: details.rating,
    weight: details.weight,
    description: details.description,
    categories: details.categories,
    mechanics: details.mechanics,
    updated_at: new Date().toISOString(),
  });
  if (gameError) {
    console.error(`[collection] upsert games упал:`, gameError);
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  const tags = (existing.tags as string[]) ?? [];
  const notes = (existing.notes as string | null) ?? null;

  const { error: insErr } = await supabase.from("collection_items").upsert(
    { collection_id: toCollectionId, bgg_id: bggId, tags, notes, added_by: userId },
    { onConflict: "collection_id,bgg_id" }
  );
  if (insErr) throw new Error(`Не удалось переместить: ${insErr.message}`);

  await removeGameFromCollection(supabase, fromCollectionId, bggId);
}

export async function updateGameTags(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  collectionId: string,
  bggId: number,
  fields: { tags?: string[]; notes?: string | null }
): Promise<void> {
  const patch: Record<string, unknown> = {};
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
  supabase: SupabaseClient,
  bggId: number,
  info: GameInfoUpdate
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
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
  supabase: SupabaseClient,
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
  return mapRow(data as Record<string, unknown>);
}

export async function listCollection(
  supabase: SupabaseClient,
  collectionId: string
): Promise<CollectionGame[]> {
  const { data, error } = await supabase
    .from("collection_items")
    .select("id, collection_id, bgg_id, tags, notes, added_at, games(*)")
    .eq("collection_id", collectionId)
    .order("added_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
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
  supabase: SupabaseClient,
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
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const bggId = row.bgg_id as number | null;
      if (bggId == null || seen.has(bggId)) continue;
      seen.add(bggId);
      out.push({
        bggId,
        name: row.name as string,
        yearPublished: (row.year_published as number | null) ?? null,
        thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
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
  supabase: SupabaseClient
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

  const ids = (memberships ?? []).map(
    (m) => (m as { collection_id: string }).collection_id
  );
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("collection_items")
    .select("id, collection_id, bgg_id, tags, notes, added_at, games(*), collections(name)")
    .in("collection_id", ids)
    .order("added_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}
