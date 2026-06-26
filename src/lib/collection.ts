import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getBggGameDetails, type BggGameDetails } from "./bgg";
import { logger } from "./logger";
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  type Page,
} from "./pagination";

const log = logger.child("collection");

type DB = SupabaseClient<Database>;
type GameRow = Database["public"]["Tables"]["games"]["Row"];

/** Форма строки joined-select (collection_items + games [+ collections]). */
type CollectionItemRow = Pick<
  Database["public"]["Tables"]["collection_items"]["Row"],
  "id" | "collection_id" | "game_id" | "tags" | "notes" | "added_at"
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
  /** Наш собственный id игры (games.id) — ключ всех связей и URL. */
  gameId: number;
  /** BGG id, если игра из BGG (для ссылки «открыть на BGG»); иначе null. */
  bggId: number | null;
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

/** Приводит строку joined-select (collection_items + games) к CollectionGame. */
function mapRow(row: CollectionItemRow): CollectionGame {
  const game = row.games;
  if (!game) throw new Error("Запись коллекции без связанной игры в кэше games");
  const collection = row.collections ?? undefined;
  return {
    id: row.id,
    collectionId: row.collection_id,
    ...(collection ? { collectionName: collection.name } : {}),
    gameId: game.id,
    bggId: game.bgg_id,
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
    isExpansion: game.is_expansion ?? false,
    tags: row.tags ?? [],
    notes: row.notes ?? null,
    addedAt: row.added_at,
  };
}

/** Пополняет каталог games деталями BGG через SECURITY DEFINER функцию
 *  cache_game и возвращает наш games.id. Кэш игр закрыт на прямую запись
 *  (RLS — только админ); cache_game лишь ВСТАВЛЯЕТ отсутствующую игру и никогда
 *  не перезаписывает существующую (защита от вандализма). См. 20260622150000. */
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

/** Если игра — дополнение, кэширует её базовые игры и создаёт связи в game_links
 *  (через SECURITY DEFINER link_expansion). Best-effort: ошибки не валят
 *  добавление самой игры. Базу кэшируем, чтобы её обложку/название можно было
 *  показать (в т.ч. ч/б) даже когда базовой игры нет в коллекции. */
async function linkExpansionBases(
  supabase: DB,
  expansionGameId: number,
  details: BggGameDetails
): Promise<void> {
  if (!details.isExpansion || details.baseGames.length === 0) return;
  for (const base of details.baseGames) {
    try {
      const baseDetails = await getBggGameDetails(base.bggId);
      if (!baseDetails) continue;
      const baseGameId = await cacheGameFromDetails(supabase, baseDetails);
      const { error } = await supabase.rpc("link_expansion", {
        p_addon_game_id: expansionGameId,
        p_base_game_id: baseGameId,
      });
      if (error) log.error(`link_expansion ${expansionGameId}→${baseGameId}:`, error.message);
    } catch (e) {
      log.error(`связь с базой bggId=${base.bggId} не создана:`, e);
    }
  }
}

/** Подтягивает игру из BGG, кладёт в кэш games и добавляет в коллекцию. */
export async function addGameToCollection(
  supabase: DB,
  collectionId: string,
  bggId: number,
  tags: string[] = [],
  userId?: string
): Promise<{ name: string }> {
  log.info(`addGameToCollection collection=${collectionId} bggId=${bggId}, tags=[${tags.join(", ")}]`);
  const details = await getBggGameDetails(bggId);
  if (!details) {
    log.error(`BGG детали для id=${bggId} не найдены`);
    throw new Error(`Игра с BGG id ${bggId} не найдена`);
  }
  log.info(`детали из BGG: «${details.name}» (${details.yearPublished})`);

  // cache_game возвращает строку games (с нашим id) — по нему привязываем запись
  // коллекции (collection_items.game_id), не зная деталей внутреннего id заранее.
  const gameId = await cacheGameFromDetails(supabase, details);

  const { error: itemError } = await supabase.from("collection_items").upsert(
    { collection_id: collectionId, game_id: gameId, tags, added_by: userId ?? null },
    { onConflict: "collection_id,game_id" }
  );
  if (itemError) {
    log.error("upsert collection_items упал:", itemError);
    throw new Error(`Не удалось добавить в коллекцию: ${itemError.message}`);
  }

  // Дополнение — связываем с базовыми играми (после добавления, best-effort).
  await linkExpansionBases(supabase, gameId, details);

  log.info(`«${details.name}» добавлена в collection=${collectionId}`);
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

/** Переносит запись игры из одной коллекции в другую. Теги и заметку
 *  сохраняем. Каталог games не трогаем — игра уже там. */
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
    .select("tags, notes")
    .eq("game_id", gameId)
    .eq("collection_id", fromCollectionId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!existing) throw new Error("Игра не найдена в исходной коллекции");
  const tags = existing.tags ?? [];
  const notes = existing.notes ?? null;

  const { error: insErr } = await supabase.from("collection_items").upsert(
    { collection_id: toCollectionId, game_id: gameId, tags, notes, added_by: userId },
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

/** Правит общий кэш игры (games) — название, год, число игроков, время, описание. */
export async function updateGameInfo(
  supabase: DB,
  gameId: number,
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
    .eq("id", gameId);
  if (error) throw new Error(`Не удалось обновить игру: ${error.message}`);
}

/** Одна игра из коллекции по gameId (для страницы игры). */
export async function getCollectionGame(
  supabase: DB,
  collectionId: string,
  gameId: number
): Promise<CollectionGame | null> {
  const { data, error } = await supabase
    .from("collection_items")
    .select("id, collection_id, game_id, tags, notes, added_at, games(*)")
    .eq("game_id", gameId)
    .eq("collection_id", collectionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data);
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
    .select("id, collection_id, game_id, tags, notes, added_at, games(*)")
    .eq("collection_id", collectionId);
  const clause = cursorClause(opts.cursor);
  if (clause) query = query.or(clause);

  const { data, error } = await query
    .order("added_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(error.message);

  return pageFrom((data ?? []).map(mapRow), limit);
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
 * несколько вариантов запроса (например, как сказал пользователь и переведённое
 * на оригинал название) и объединяет результаты, сохраняя порядок и убирая дубли
 * по нашему game_id. Возвращает и не-BGG игры (bggId = null) — теперь
 * collection_items ссылается на games.id, поэтому они полноправны. Best-effort:
 * при ошибке RPC (например, демо-режим) возвращает пустой список, и вызывающий
 * код откатывается на поиск BGG. */
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

/**
 * Обложки игр из нашего кэша `games` по bgg_id. Возвращает только то, что уже
 * есть в БД — без обращений к BGG. Используется, чтобы показать превью
 * дополнений, не делая лишних запросов за теми, которых в каталоге ещё нет.
 */
export async function getLocalThumbnails(
  supabase: DB,
  bggIds: number[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = [...new Set(bggIds)].filter((id) => Number.isFinite(id));
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from("games")
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
 * Строит карту связей «дополнение↔база» по всей коллекции (одним проходом, без
 * пагинации — payload лёгкий, только сводки). Клиент по ней группирует карточки:
 * прячет дополнения, чья база в коллекции, рисует бейдж «+N допов» у базы и ч/б
 * карточку у осиротевших дополнений.
 */
export async function getCollectionExpansionMap(
  supabase: DB,
  collectionIds: string[]
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
  const ids = [...itemSet];
  const inList = `(${ids.join(",")})`;
  const { data: linkRows, error: linkErr } = await supabase
    .from("game_links")
    .select("addon_game_id, base_game_id")
    .eq("link_type", "expansion")
    .or(`addon_game_id.in.${inList},base_game_id.in.${inList}`);
  if (linkErr) throw new Error(linkErr.message);
  if (!linkRows || linkRows.length === 0) return EMPTY_EXPANSION_MAP;

  // 3) Сводки всех игр, упомянутых в связях (для названий/обложек баз).
  const refIds = new Set<number>();
  for (const l of linkRows) {
    refIds.add(l.addon_game_id);
    refIds.add(l.base_game_id);
  }
  const { data: gameRows, error: gameErr } = await supabase
    .from("games")
    .select("id, name, thumbnail_url, image_url")
    .in("id", [...refIds]);
  if (gameErr) throw new Error(gameErr.message);
  const gameById = new Map(
    (gameRows ?? []).map((g) => [g.id, g] as const)
  );

  // BGG иногда привязывает одно дополнение сразу к нескольким «базам» (см.
  // docs/expansions-investigation.md, дефект #3) — собираем все базы каждого
  // владеемого дополнения, чтобы решить, как его группировать, одним проходом.
  const basesByExp = new Map<number, Set<number>>();
  for (const { addon_game_id: expId, base_game_id: baseId } of linkRows) {
    if (!itemSet.has(expId)) continue;
    (basesByExp.get(expId) ?? basesByExp.set(expId, new Set()).get(expId)!).add(
      baseId
    );
  }

  const byBase: Record<number, ExpansionSummary[]> = {};
  const expansionToBase: Record<number, BaseSummary> = {};
  for (const [expId, baseIdSet] of basesByExp) {
    const exp = gameById.get(expId);
    if (!exp) continue;
    const expSummary: ExpansionSummary = {
      gameId: expId,
      name: exp.name,
      thumbnailUrl: exp.thumbnail_url,
      collectionId: collectionByGame.get(expId) ?? collectionIds[0],
    };

    const baseIds = [...baseIdSet];
    const ownedBaseIds = baseIds.filter((id) => itemSet.has(id));

    if (ownedBaseIds.length > 0) {
      // Все владеемые базы получают бейдж «+N допов»; дополнение скрывается
      // из общей сетки (present: true), под какой именно базой его искать —
      // не важно для текущей логики скрытия.
      for (const baseId of ownedBaseIds) {
        (byBase[baseId] ??= []).push(expSummary);
      }
      const base = gameById.get(ownedBaseIds[0]);
      if (base) {
        expansionToBase[expId] = {
          gameId: base.id,
          name: base.name,
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
          name: base.name,
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

/** Игры из коллекций самого пользователя (сводный вид «Все игры»).
 *  Берём только коллекции, в которых пользователь состоит (как и список вкладок),
 *  иначе RLS отдал бы ещё и чужие публичные коллекции и коллекции друзей.
 *  Имя коллекции приходит из joined-select. */
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
    .select("id, collection_id, game_id, tags, notes, added_at, games(*), collections(name)")
    .in("collection_id", ids);
  const clause = cursorClause(opts.cursor);
  if (clause) query = query.or(clause);

  const { data, error } = await query
    .order("added_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(error.message);

  return pageFrom((data ?? []).map(mapRow), limit);
}
