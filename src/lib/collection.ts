import type { SupabaseClient } from "@supabase/supabase-js";
import { getBggGameDetails } from "./bgg";

export interface CollectionGame {
  id: string;
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
  return {
    id: row.id as string,
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

/** Подтягивает игру из BGG, кладёт в кэш games и добавляет в коллекцию пользователя. */
export async function addGameToCollection(
  supabase: SupabaseClient,
  userId: string,
  bggId: number,
  tags: string[] = []
): Promise<{ name: string }> {
  console.log(`[collection] addGameToCollection bggId=${bggId}, tags=[${tags.join(", ")}]`);
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
    { user_id: userId, bgg_id: bggId, tags },
    { onConflict: "user_id,bgg_id" }
  );
  if (itemError) {
    console.error(`[collection] upsert collection_items упал:`, itemError);
    throw new Error(`Не удалось добавить в коллекцию: ${itemError.message}`);
  }

  console.log(`[collection] «${details.name}» добавлена для user=${userId}`);
  return { name: details.name };
}

export async function removeGameFromCollection(
  supabase: SupabaseClient,
  userId: string,
  bggId: number
): Promise<void> {
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("user_id", userId)
    .eq("bgg_id", bggId);
  if (error) throw new Error(`Не удалось удалить: ${error.message}`);
}

export async function updateGameTags(
  supabase: SupabaseClient,
  userId: string,
  bggId: number,
  tags: string[]
): Promise<void> {
  const { error } = await supabase
    .from("collection_items")
    .update({ tags })
    .eq("user_id", userId)
    .eq("bgg_id", bggId);
  if (error) throw new Error(`Не удалось обновить теги: ${error.message}`);
}

/** Обновляет личные данные записи коллекции (теги и/или заметку). */
export async function updateCollectionItem(
  supabase: SupabaseClient,
  userId: string,
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
    .eq("user_id", userId)
    .eq("bgg_id", bggId);
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

/** Одна игра из коллекции пользователя по bggId (для страницы игры). */
export async function getCollectionGame(
  supabase: SupabaseClient,
  userId: string,
  bggId: number
): Promise<CollectionGame | null> {
  const { data, error } = await supabase
    .from("collection_items")
    .select("id, bgg_id, tags, notes, added_at, games(*)")
    .eq("user_id", userId)
    .eq("bgg_id", bggId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function listCollection(
  supabase: SupabaseClient,
  userId: string
): Promise<CollectionGame[]> {
  const { data, error } = await supabase
    .from("collection_items")
    .select("id, bgg_id, tags, notes, added_at, games(*)")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}
