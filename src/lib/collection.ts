import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getBggGameDetails, type BggGameDetails } from "./bgg";
import { logger } from "./logger";
import { DEFAULT_LANG, langName } from "./lang";
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  type Page,
} from "./pagination";

const log = logger.child("collection");

type DB = SupabaseClient<Database>;
type GameRow = Database["public"]["Tables"]["games"]["Row"];

/** Форма строки joined-select (collection_items + games [+ collections]).
 *  После рефактора каталога 28.06 из `games` ушли bgg_id/description/таксономия —
 *  их дотягиваем отдельно (games_bgg, game_tags), а локализованное имя и версия
 *  собираются в enrichRows. */
type CollectionItemRow = {
  id: string;
  collection_id: string;
  game_id: number;
  tags: string[] | null;
  notes: string | null;
  added_at: string;
  version_id: number | null;
  games: GameRow | null;
  collections?: { name: string } | null;
};

export interface CollectionGame {
  id: string;
  /** Коллекция, которой принадлежит эта запись. */
  collectionId: string;
  /** Имя коллекции — заполняется только в сводном виде «Все игры». */
  collectionName?: string;
  /** Наш собственный id игры (games.id) — ключ всех связей и URL. */
  gameId: number;
  /** BGG id, если игра из BGG (для ссылки «открыть на BGG»); иначе null. */
  bggId: number | null;
  /** Название на языке пользователя (версия/локализованное имя), иначе каноническое. */
  name: string;
  /** Оригинальное (обычно английское) название; null, если совпадает с name. */
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
  /** true — сама игра является дополнением (games.is_expansion). */
  isExpansion: boolean;
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

/** Язык пользователя (ISO-код) из профиля; дефолт — русский. */
export async function getUserLang(supabase: DB, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("lang")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    log.error("getUserLang:", error.message);
    return DEFAULT_LANG;
  }
  return data?.lang || DEFAULT_LANG;
}

// ---------------------------------------------------------------------------
// Обогащение строк коллекции данными из сателлитов (BGG-деталь, версия, теги) и
// локализованным именем. Каталог теперь мультиисточниковый, поэтому имя/описание
// собираются из нескольких таблиц.
// ---------------------------------------------------------------------------

type BggExtra = { bgg_id: number | null; description: string | null; primary_name: string };

/** BGG-деталь (bgg_id/описание/оригинальное имя) по нашим game_id. */
async function fetchGamesBgg(
  supabase: DB,
  gameIds: number[]
): Promise<Map<number, BggExtra>> {
  const map = new Map<number, BggExtra>();
  if (gameIds.length === 0) return map;
  const { data, error } = await supabase
    .from("games_bgg")
    .select("game_id, bgg_id, description, primary_name")
    .in("game_id", gameIds);
  if (error) {
    log.error("fetchGamesBgg:", error.message);
    return map;
  }
  for (const r of data ?? []) {
    map.set(r.game_id, {
      bgg_id: r.bgg_id,
      description: r.description,
      primary_name: r.primary_name,
    });
  }
  return map;
}

/** Версии (id → название/год) — для записей коллекции с выбранной версией. */
async function fetchVersions(
  supabase: DB,
  versionIds: number[]
): Promise<Map<number, { canonical_name: string; year_published: number | null }>> {
  const map = new Map<number, { canonical_name: string; year_published: number | null }>();
  if (versionIds.length === 0) return map;
  const { data, error } = await supabase
    .from("game_bgg_versions")
    .select("id, canonical_name, year_published")
    .in("id", versionIds);
  if (error) {
    log.error("fetchVersions:", error.message);
    return map;
  }
  for (const r of data ?? []) {
    map.set(r.id, { canonical_name: r.canonical_name, year_published: r.year_published });
  }
  return map;
}

/** Локализованные имена (game_id → имя на нужном языке). Берём display-имя на
 *  этом языке, иначе любое имя этого языка; чего нет — нет в карте. */
export async function fetchLocalizedNames(
  supabase: DB,
  gameIds: number[],
  language: string
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (gameIds.length === 0) return map;
  const { data, error } = await supabase
    .from("game_names")
    .select("game_id, name, is_display")
    .in("game_id", gameIds)
    .eq("lang", language)
    .order("is_display", { ascending: false });
  if (error) {
    log.error("fetchLocalizedNames:", error.message);
    return map;
  }
  for (const r of data ?? []) {
    if (!map.has(r.game_id)) map.set(r.game_id, r.name); // первое — display (сорт desc)
  }
  return map;
}

/** Категории/механики (game_id → списки) из нормализованной таксономии. */
async function fetchTags(
  supabase: DB,
  gameIds: number[]
): Promise<Map<number, { categories: string[]; mechanics: string[] }>> {
  const map = new Map<number, { categories: string[]; mechanics: string[] }>();
  if (gameIds.length === 0) return map;
  const { data, error } = await supabase
    .from("game_tags")
    .select("game_id, tags(type, name)")
    .in("game_id", gameIds);
  if (error) {
    log.error("fetchTags:", error.message);
    return map;
  }
  for (const r of data ?? []) {
    const tag = r.tags as { type: string; name: string } | null;
    if (!tag) continue;
    const entry = map.get(r.game_id) ?? { categories: [], mechanics: [] };
    if (tag.type === "category") entry.categories.push(tag.name);
    else if (tag.type === "mechanic") entry.mechanics.push(tag.name);
    map.set(r.game_id, entry);
  }
  return map;
}

interface EnrichMaps {
  bggMap: Map<number, BggExtra>;
  versionMap: Map<number, { canonical_name: string; year_published: number | null }>;
  localizedMap: Map<number, string>;
  tagsMap: Map<number, { categories: string[]; mechanics: string[] }>;
}

/** Собирает CollectionGame из строки коллекции и заранее загруженных карт. */
function buildCollectionGame(row: CollectionItemRow, maps: EnrichMaps): CollectionGame {
  const game = row.games;
  if (!game) throw new Error("Запись коллекции без связанной игры в кэше games");
  const bgg = maps.bggMap.get(game.id);
  const version = row.version_id != null ? maps.versionMap.get(row.version_id) : undefined;
  const localized = maps.localizedMap.get(game.id);
  // Приоритет имени: выбранная версия → локализованное имя → каноническое.
  const name = version?.canonical_name ?? localized ?? game.name;
  const primaryName = bgg?.primary_name ?? null;
  const originalName = primaryName && primaryName !== name ? primaryName : null;
  const tags = maps.tagsMap.get(game.id);
  const collection = row.collections ?? undefined;
  return {
    id: row.id,
    collectionId: row.collection_id,
    ...(collection ? { collectionName: collection.name } : {}),
    gameId: game.id,
    bggId: bgg?.bgg_id ?? null,
    name,
    originalName,
    yearPublished: game.year_published,
    thumbnailUrl: game.thumbnail_url,
    imageUrl: game.image_url,
    minPlayers: game.min_players,
    maxPlayers: game.max_players,
    playingTime: game.playing_time,
    rating: game.rating,
    weight: null, // поля weight больше нет в каталоге
    description: bgg?.description ?? null,
    categories: tags?.categories ?? [],
    mechanics: tags?.mechanics ?? [],
    isExpansion: game.is_expansion ?? false,
    tags: row.tags ?? [],
    notes: row.notes ?? null,
    addedAt: row.added_at,
  };
}

/** Обогащает страницу строк коллекции (одним батчем запросов на сателлиты). */
async function enrichRows(
  supabase: DB,
  rows: CollectionItemRow[],
  lang: string,
  withTags = false
): Promise<CollectionGame[]> {
  const gameIds = [...new Set(rows.map((r) => r.games?.id).filter((id): id is number => id != null))];
  const versionIds = [...new Set(rows.map((r) => r.version_id).filter((v): v is number => v != null))];

  const [bggMap, versionMap, localizedMap, tagsMap] = await Promise.all([
    fetchGamesBgg(supabase, gameIds),
    fetchVersions(supabase, versionIds),
    fetchLocalizedNames(supabase, gameIds, langName(lang)),
    withTags
      ? fetchTags(supabase, gameIds)
      : Promise.resolve(new Map<number, { categories: string[]; mechanics: string[] }>()),
  ]);

  const maps: EnrichMaps = { bggMap, versionMap, localizedMap, tagsMap };
  return rows.map((r) => buildCollectionGame(r, maps));
}

/** Пополняет каталог games деталями BGG через SECURITY DEFINER функцию
 *  cache_game и возвращает наш games.id. Кэш игр закрыт на прямую запись
 *  (RLS — только админ); cache_game лишь ВСТАВЛЯЕТ отсутствующую игру и никогда
 *  не перезаписывает существующую (защита от вандализма). */
async function cacheGameFromDetails(
  supabase: DB,
  details: BggGameDetails
): Promise<number> {
  const { data: cached, error } = await supabase.rpc("cache_game", {
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
    p_is_expansion: details.isExpansion,
  });
  if (error) {
    log.error("cache_game упал:", error);
    throw new Error(`Не удалось сохранить игру: ${error.message}`);
  }
  const gameId = cached?.id;
  if (!gameId) throw new Error("cache_game не вернул id игры");
  return gameId;
}

/** Подбирает версию (издание) игры на языке пользователя: самую новую по году.
 *  Нет версии на этом языке — null (игра добавится без привязки к версии). */
async function pickVersionId(
  supabase: DB,
  gameId: number,
  lang: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("game_bgg_versions")
    .select("id, year_published, languages!inner(name)")
    .eq("game_id", gameId)
    .eq("languages.name", langName(lang))
    .order("year_published", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    log.error(`pickVersionId game=${gameId}:`, error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Подтягивает игру из BGG, кладёт в кэш games и добавляет в коллекцию. В записи
 *  коллекции сохраняем конкретную версию (издание) на языке пользователя, если
 *  такая есть. */
export async function addGameToCollection(
  supabase: DB,
  collectionId: string,
  bggId: number,
  tags: string[] = [],
  userId?: string,
  lang: string = DEFAULT_LANG
): Promise<{ name: string }> {
  log.info(`addGameToCollection collection=${collectionId} bggId=${bggId}, lang=${lang}, tags=[${tags.join(", ")}]`);
  const details = await getBggGameDetails(bggId);
  if (!details) {
    log.error(`BGG детали для id=${bggId} не найдены`);
    throw new Error(`Игра с BGG id ${bggId} не найдена`);
  }
  log.info(`детали из BGG: «${details.name}» (${details.yearPublished})`);

  // cache_game возвращает строку games (с нашим id) — по нему привязываем запись
  // коллекции (collection_items.game_id), не зная деталей внутреннего id заранее.
  const gameId = await cacheGameFromDetails(supabase, details);
  const versionId = await pickVersionId(supabase, gameId, lang);

  const { error: itemError } = await supabase.from("collection_items").upsert(
    { collection_id: collectionId, game_id: gameId, tags, added_by: userId ?? null, version_id: versionId },
    { onConflict: "collection_id,game_id" }
  );
  if (itemError) {
    log.error("upsert collection_items упал:", itemError);
    throw new Error(`Не удалось добавить в коллекцию: ${itemError.message}`);
  }

  log.info(`«${details.name}» добавлена в collection=${collectionId} (version=${versionId ?? "—"})`);
  return { name: details.name };
}

export async function removeGameFromCollection(
  supabase: DB,
  collectionId: string,
  gameId: number
): Promise<void> {
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("game_id", gameId)
    .eq("collection_id", collectionId);
  if (error) throw new Error(`Не удалось удалить: ${error.message}`);
}

/** Переносит запись игры из одной коллекции в другую. Теги, заметку и выбранную
 *  версию сохраняем. Каталог games не трогаем — игра уже там. */
export async function moveGameToCollection(
  supabase: DB,
  fromCollectionId: string,
  toCollectionId: string,
  gameId: number,
  userId: string
): Promise<void> {
  if (fromCollectionId === toCollectionId) return;

  const { data: existing, error: selErr } = await supabase
    .from("collection_items")
    .select("tags, notes, version_id")
    .eq("game_id", gameId)
    .eq("collection_id", fromCollectionId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!existing) throw new Error("Игра не найдена в исходной коллекции");
  const tags = existing.tags ?? [];
  const notes = existing.notes ?? null;
  const versionId = existing.version_id ?? null;

  const { error: insErr } = await supabase.from("collection_items").upsert(
    { collection_id: toCollectionId, game_id: gameId, tags, notes, version_id: versionId, added_by: userId },
    { onConflict: "collection_id,game_id" }
  );
  if (insErr) throw new Error(`Не удалось переместить: ${insErr.message}`);

  await removeGameFromCollection(supabase, fromCollectionId, gameId);
}

export async function updateGameTags(
  supabase: DB,
  collectionId: string,
  gameId: number,
  tags: string[]
): Promise<void> {
  const { error } = await supabase
    .from("collection_items")
    .update({ tags })
    .eq("game_id", gameId)
    .eq("collection_id", collectionId);
  if (error) throw new Error(`Не удалось обновить теги: ${error.message}`);
}

/** Обновляет данные записи коллекции (теги и/или заметку). */
export async function updateCollectionItem(
  supabase: DB,
  collectionId: string,
  gameId: number,
  fields: { tags?: string[]; notes?: string | null }
): Promise<void> {
  const patch: Database["public"]["Tables"]["collection_items"]["Update"] = {};
  if (fields.tags !== undefined) patch.tags = fields.tags;
  if (fields.notes !== undefined) patch.notes = fields.notes;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("collection_items")
    .update(patch)
    .eq("game_id", gameId)
    .eq("collection_id", collectionId);
  if (error) throw new Error(`Не удалось сохранить: ${error.message}`);
}

/** Правит кэш игры: имя/год/число игроков/время — в games, описание — в games_bgg. */
export async function updateGameInfo(
  supabase: DB,
  gameId: number,
  info: GameInfoUpdate
): Promise<void> {
  const patch: Database["public"]["Tables"]["games"]["Update"] = {};
  if (info.name !== undefined) patch.name = info.name;
  if (info.yearPublished !== undefined) patch.year_published = info.yearPublished;
  if (info.minPlayers !== undefined) patch.min_players = info.minPlayers;
  if (info.maxPlayers !== undefined) patch.max_players = info.maxPlayers;
  if (info.playingTime !== undefined) patch.playing_time = info.playingTime;
  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from("games").update(patch).eq("id", gameId);
    if (error) throw new Error(`Не удалось обновить игру: ${error.message}`);
  }

  if (info.description !== undefined) {
    const { error } = await supabase
      .from("games_bgg")
      .update({ description: info.description })
      .eq("game_id", gameId);
    if (error) throw new Error(`Не удалось обновить описание: ${error.message}`);
  }
}

const ITEM_SELECT = "id, collection_id, game_id, tags, notes, added_at, version_id, games(*)";

/** Одна игра из коллекции по gameId (для страницы игры). */
export async function getCollectionGame(
  supabase: DB,
  collectionId: string,
  gameId: number,
  lang: string = DEFAULT_LANG
): Promise<CollectionGame | null> {
  const { data, error } = await supabase
    .from("collection_items")
    .select(ITEM_SELECT)
    .eq("game_id", gameId)
    .eq("collection_id", collectionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [game] = await enrichRows(supabase, [data as unknown as CollectionItemRow], lang, true);
  return game;
}

/** Строит страницу из выбранных (limit+1) строк: курсор следующей страницы —
 *  пара (added_at, id) последнего элемента в пределах limit; иначе конец. */
function pageFrom(rows: CollectionGame[], limit: number): Page<CollectionGame> {
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: encodeCursor({ addedAt: last.addedAt, id: last.id }),
    };
  }
  return { items: rows, nextCursor: null };
}

/** Фильтр «строго после курсора» при сортировке (added_at desc, id desc):
 *  added_at < cur.addedAt ИЛИ (added_at = cur.addedAt И id < cur.id). */
function cursorClause(raw: string | null | undefined): string | null {
  const cur = decodeCursor(raw);
  if (!cur) return null;
  return `added_at.lt."${cur.addedAt}",and(added_at.eq."${cur.addedAt}",id.lt."${cur.id}")`;
}

export interface ListOptions {
  cursor?: string | null;
  limit?: number;
  lang?: string;
}

/** Страница игр одной коллекции (курсорная пагинация по added_at+id). */
export async function listCollection(
  supabase: DB,
  collectionId: string,
  opts: ListOptions = {}
): Promise<Page<CollectionGame>> {
  const limit = clampLimit(opts.limit);
  let query = supabase
    .from("collection_items")
    .select(ITEM_SELECT)
    .eq("collection_id", collectionId);
  const clause = cursorClause(opts.cursor);
  if (clause) query = query.or(clause);

  const { data, error } = await query
    .order("added_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(error.message);

  const enriched = await enrichRows(
    supabase,
    (data ?? []) as unknown as CollectionItemRow[],
    opts.lang ?? DEFAULT_LANG
  );
  return pageFrom(enriched, limit);
}

/** Совпадение из нашей БД по основному или альтернативному названию. */
export interface LocalGameMatch {
  /** Наш собственный id игры (games.id) — ключ связей. */
  gameId: number;
  /** BGG id, если игра из BGG; иначе null (не-BGG источник). */
  bggId: number | null;
  name: string;
  yearPublished: number | null;
  thumbnailUrl: string | null;
  isExpansion: boolean;
}

/**
 * Ищет игры в нашей БД по основному И альтернативным названиям (RPC
 * `search_games` — триграммный fuzzy-поиск по таблице game_names). Принимает
 * несколько вариантов запроса и объединяет результаты, сохраняя порядок и убирая
 * дубли по нашему game_id. Имя возвращается на языке пользователя. Best-effort:
 * при ошибке RPC возвращает пустой список, и вызывающий код откатывается на BGG.
 */
export async function searchLocalGames(
  supabase: DB,
  queries: string[],
  limit = 4,
  lang: string = DEFAULT_LANG
): Promise<LocalGameMatch[]> {
  const seen = new Set<number>();
  const out: LocalGameMatch[] = [];
  const uniqueQueries = [
    ...new Set(queries.map((q) => q.trim()).filter(Boolean)),
  ];

  for (const q of uniqueQueries) {
    const { data, error } = await supabase.rpc("search_games", {
      q,
      lim: limit,
      p_lang: langName(lang),
    });
    if (error) {
      logger.child("search_games").error(`«${q}»:`, error.message);
      continue;
    }
    for (const row of data ?? []) {
      const gameId = row.id;
      if (gameId == null || seen.has(gameId)) continue;
      seen.add(gameId);
      out.push({
        gameId,
        bggId: row.bgg_id ?? null,
        name: row.name,
        yearPublished: row.year_published ?? null,
        thumbnailUrl: row.thumbnail_url ?? null,
        isExpansion: row.is_expansion ?? false,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Одна строка каталога игр для постраничного обзора (режим простого поиска). */
export interface BrowseGame {
  gameId: number;
  bggId: number | null;
  name: string;
  yearPublished: number | null;
  thumbnailUrl: string | null;
  inCollection: boolean;
}

export interface BrowsePage {
  items: BrowseGame[];
  total: number;
}

/**
 * Постраничный обзор каталога games (RPC `browse_games`) — обычное
 * substring-совпадение по названию/альт-именам. Имя возвращается на языке
 * пользователя. `collectionId` — чтобы помечать уже добавленные игры.
 */
export async function browseGames(
  supabase: DB,
  opts: { query?: string; collectionId?: string; page?: number; pageSize?: number; lang?: string } = {}
): Promise<BrowsePage> {
  const pageSize = clampLimit(opts.pageSize ?? 20);
  const page = Math.max(1, Math.trunc(opts.page ?? 1));
  const { data, error } = await supabase.rpc("browse_games", {
    p_query: opts.query?.trim() || undefined,
    p_collection_id: opts.collectionId ?? undefined,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_lang: langName(opts.lang),
  });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    items: rows.map((r) => ({
      gameId: r.id,
      bggId: r.bgg_id ?? null,
      name: r.name,
      yearPublished: r.year_published ?? null,
      thumbnailUrl: r.thumbnail_url ?? null,
      inCollection: r.in_collection ?? false,
    })),
    total: rows[0]?.total_count ?? 0,
  };
}

/**
 * Обложки игр из нашего кэша по bgg_id (теперь bgg_id живёт в games_bgg).
 * Возвращает только то, что уже есть в БД — без обращений к BGG.
 */
export async function getLocalThumbnails(
  supabase: DB,
  bggIds: number[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = [...new Set(bggIds)].filter((id) => Number.isFinite(id));
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from("games_bgg")
    .select("bgg_id, thumbnail_url")
    .in("bgg_id", ids);
  if (error) {
    logger.child("getLocalThumbnails").error(error.message);
    return out;
  }
  for (const row of data ?? []) {
    if (row.bgg_id != null && row.thumbnail_url) {
      out.set(row.bgg_id, row.thumbnail_url);
    }
  }
  return out;
}

/** Коллекции, в которых состоит пользователь (как вкладки и сводный вид). */
export async function getMemberCollectionIds(
  supabase: DB,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("collection_members")
    .select("collection_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => m.collection_id);
}

/** Сводка дополнения, присутствующего в коллекции. */
export interface ExpansionSummary {
  gameId: number;
  name: string;
  thumbnailUrl: string | null;
  collectionId: string;
}

/** Сводка базовой игры дополнения (для ч/б карточки осиротевшего дополнения). */
export interface BaseSummary {
  gameId: number;
  name: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  /** Есть ли базовая игра в самой коллекции. */
  present: boolean;
}

/** Карта связей дополнений для группировки на главном экране. */
export interface ExpansionMap {
  /** baseGameId → дополнения этой базы, присутствующие в коллекции. */
  byBase: Record<number, ExpansionSummary[]>;
  /** expansionGameId (в коллекции) → его базовая игра. */
  expansionToBase: Record<number, BaseSummary>;
}

const EMPTY_EXPANSION_MAP: ExpansionMap = { byBase: {}, expansionToBase: {} };

/**
 * Строит карту связей «дополнение↔база» по всей коллекции. В новой схеме
 * game_links для link_type='expansion': **game_id = база, target_game_id =
 * дополнение**. Клиент по карте группирует карточки: прячет дополнения, чья база
 * в коллекции, рисует бейдж «+N допов» у базы и ч/б карточку у осиротевших
 * дополнений. Имена баз/допов — на языке пользователя.
 */
export async function getCollectionExpansionMap(
  supabase: DB,
  collectionIds: string[],
  lang: string = DEFAULT_LANG
): Promise<ExpansionMap> {
  if (collectionIds.length === 0) return EMPTY_EXPANSION_MAP;

  // 1) Все игры коллекции (game_id + откуда). В сводном виде один и тот же
  //    game_id может встретиться в нескольких коллекциях — берём первую.
  const { data: itemRows, error: itemErr } = await supabase
    .from("collection_items")
    .select("collection_id, game_id")
    .in("collection_id", collectionIds);
  if (itemErr) throw new Error(itemErr.message);

  const itemSet = new Set<number>();
  const collectionByGame = new Map<number, string>();
  for (const r of itemRows ?? []) {
    itemSet.add(r.game_id);
    if (!collectionByGame.has(r.game_id)) {
      collectionByGame.set(r.game_id, r.collection_id);
    }
  }
  if (itemSet.size === 0) return EMPTY_EXPANSION_MAP;

  // 2) Связи expansion, у которых хотя бы одна сторона — игра из коллекции.
  //    base = game_id, addon = target_game_id (только связи внутри нашего каталога).
  const ids = [...itemSet];
  const inList = `(${ids.join(",")})`;
  const { data: linkRows, error: linkErr } = await supabase
    .from("game_links")
    .select("game_id, target_game_id")
    .eq("link_type", "expansion")
    .or(`game_id.in.${inList},target_game_id.in.${inList}`);
  if (linkErr) throw new Error(linkErr.message);

  const links = (linkRows ?? [])
    .map((l) => ({ baseId: l.game_id, expId: l.target_game_id }))
    .filter((l): l is { baseId: number; expId: number } => l.expId != null);
  if (links.length === 0) return EMPTY_EXPANSION_MAP;

  // 3) Сводки всех игр, упомянутых в связях (имена/обложки), с локализацией.
  const refIds = new Set<number>();
  for (const l of links) {
    refIds.add(l.baseId);
    refIds.add(l.expId);
  }
  const refIdList = [...refIds];
  const [{ data: gameRows, error: gameErr }, localizedNames] = await Promise.all([
    supabase.from("games").select("id, name, thumbnail_url, image_url").in("id", refIdList),
    fetchLocalizedNames(supabase, refIdList, langName(lang)),
  ]);
  if (gameErr) throw new Error(gameErr.message);
  const gameById = new Map((gameRows ?? []).map((g) => [g.id, g] as const));
  const nameOf = (id: number) => localizedNames.get(id) ?? gameById.get(id)?.name ?? "";

  // BGG иногда привязывает одно дополнение сразу к нескольким «базам» — собираем
  // все базы каждого владеемого дополнения, чтобы решить, как его группировать.
  const basesByExp = new Map<number, Set<number>>();
  for (const { baseId, expId } of links) {
    if (!itemSet.has(expId)) continue;
    (basesByExp.get(expId) ?? basesByExp.set(expId, new Set()).get(expId)!).add(baseId);
  }

  const byBase: Record<number, ExpansionSummary[]> = {};
  const expansionToBase: Record<number, BaseSummary> = {};
  for (const [expId, baseIdSet] of basesByExp) {
    const exp = gameById.get(expId);
    if (!exp) continue;
    const expSummary: ExpansionSummary = {
      gameId: expId,
      name: nameOf(expId),
      thumbnailUrl: exp.thumbnail_url,
      collectionId: collectionByGame.get(expId) ?? collectionIds[0],
    };

    const baseIds = [...baseIdSet];
    const ownedBaseIds = baseIds.filter((id) => itemSet.has(id));

    if (ownedBaseIds.length > 0) {
      // Все владеемые базы получают бейдж «+N допов»; дополнение скрывается.
      for (const baseId of ownedBaseIds) {
        (byBase[baseId] ??= []).push(expSummary);
      }
      const base = gameById.get(ownedBaseIds[0]);
      if (base) {
        expansionToBase[expId] = {
          gameId: base.id,
          name: nameOf(base.id),
          thumbnailUrl: base.thumbnail_url,
          imageUrl: base.image_url,
          present: true,
        };
      }
    } else {
      // Ни одна база не в коллекции — показываем одну «сиротскую» карточку:
      // базу с наименьшим id, а не по одной на каждого кандидата.
      const chosenBaseId = Math.min(...baseIds);
      const base = gameById.get(chosenBaseId);
      if (base) {
        expansionToBase[expId] = {
          gameId: chosenBaseId,
          name: nameOf(chosenBaseId),
          thumbnailUrl: base.thumbnail_url,
          imageUrl: base.image_url,
          present: false,
        };
        (byBase[chosenBaseId] ??= []).push(expSummary);
      }
    }
  }

  return { byBase, expansionToBase };
}

/** Игры из коллекций самого пользователя (сводный вид «Все игры»). */
export async function listAllGames(
  supabase: DB,
  userId: string,
  opts: ListOptions = {}
): Promise<Page<CollectionGame>> {
  const ids = await getMemberCollectionIds(supabase, userId);
  if (ids.length === 0) return { items: [], nextCursor: null };

  const limit = clampLimit(opts.limit);
  let query = supabase
    .from("collection_items")
    .select(`${ITEM_SELECT}, collections(name)`)
    .in("collection_id", ids);
  const clause = cursorClause(opts.cursor);
  if (clause) query = query.or(clause);

  const { data, error } = await query
    .order("added_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(error.message);

  const enriched = await enrichRows(
    supabase,
    (data ?? []) as unknown as CollectionItemRow[],
    opts.lang ?? DEFAULT_LANG
  );
  return pageFrom(enriched, limit);
}
