import { XMLParser } from "fast-xml-parser";
import { logger } from "./logger";

const BGG_API = "https://boardgamegeek.com/xmlapi2";
const log = logger.child("bgg");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export interface BggSearchResult {
  bggId: number;
  name: string;
  yearPublished: number | null;
  /** BGG-тип записи — дополнение (boardgameexpansion) или базовая игра. */
  isExpansion: boolean;
}

export interface BggExpansion {
  bggId: number;
  name: string;
}

export interface BggGameDetails {
  bggId: number;
  /** Название на языке запроса (сейчас русское, если есть) */
  name: string;
  /** Оригинальное название игры (primary в BGG, обычно английское) */
  originalName: string;
  yearPublished: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  rating: number | null;
  weight: number | null;
  description: string | null;
  categories: string[];
  mechanics: string[];
  /** Дополнения к этой игре (по ссылкам boardgameexpansion в BGG) */
  expansions: BggExpansion[];
  /** true — сама эта запись является дополнением (есть inbound-ссылка на базу). */
  isExpansion: boolean;
  /** Базовые игры, к которым это дополнение (inbound boardgameexpansion-ссылки).
   *  У базовой игры пустой. */
  baseGames: BggExpansion[];
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * Выбирает название игры на языке запроса. Сейчас запросы всегда русские, а BGG
 * не помечает язык альтернативных названий — поэтому русское распознаём по
 * кириллице. Если кириллического названия нет, откатываемся на основное
 * (обычно оригинальное/английское).
 */
function pickLocalizedName(
  names: Array<Record<string, string>>
): string {
  const russian = names.find((n) => CYRILLIC.test(n["@_value"] ?? ""));
  if (russian) return russian["@_value"];
  return pickOriginalName(names);
}

/** Оригинальное (primary) название BGG, с откатом на первое доступное. */
function pickOriginalName(names: Array<Record<string, string>>): string {
  const primary = names.find((n) => n["@_type"] === "primary");
  return primary?.["@_value"] ?? names[0]?.["@_value"] ?? "Unknown";
}

async function bggFetch(path: string, retries = 3): Promise<string> {
  // С 2025 года BGG требует Bearer-токен: https://boardgamegeek.com/using_the_xml_api
  const token = process.env.BGG_API_TOKEN;
  if (!token) {
    log.error("BGG_API_TOKEN не задан");
    throw new Error(
      "Не задан BGG_API_TOKEN. Зарегистрируйте приложение на boardgamegeek.com/using_the_xml_api и добавьте токен в .env.local"
    );
  }

  // BGG отвечает 202, пока готовит ответ — нужно повторить запрос
  for (let attempt = 0; attempt <= retries; attempt++) {
    log.info(`GET ${path} (попытка ${attempt + 1}/${retries + 1})`);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${BGG_API}${path}`, {
        headers: {
          Accept: "application/xml",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (e) {
      log.error(`сетевая ошибка fetch ${path}:`, e);
      throw e;
    }
    log.info(`${path} → ${res.status} за ${Date.now() - t0}мс`);
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.error(`ошибка ${path}: ${res.status} ${res.statusText} — ${text.slice(0, 300)}`);
      throw new Error(`BGG API error: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }
  log.error(`${path}: превышено число попыток (202)`);
  throw new Error("BGG API: превышено число попыток (ответ 202)");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * BGG отдаёт результаты поиска по алфавиту, а не по релевантности. Чтобы
 * запрошенная игра не утонула среди однокоренных названий, поднимаем наверх
 * точные и префиксные совпадения. Сортировка стабильная — внутри группы
 * сохраняется исходный (алфавитный) порядок BGG.
 */
function rankByRelevance(
  query: string,
  results: BggSearchResult[]
): BggSearchResult[] {
  const q = query.trim().toLowerCase();
  const wordRe = new RegExp(`\\b${escapeRegExp(q)}\\b`);
  const score = (name: string): number => {
    const n = name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(`${q} `) || n.startsWith(`${q}:`)) return 1;
    if (n.startsWith(q)) return 2;
    if (wordRe.test(n)) return 3;
    return 4;
  };
  return results
    .map((r, i) => ({ r, i, s: score(r.name) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.r);
}

async function rawSearch(
  query: string,
  exact: boolean
): Promise<BggSearchResult[]> {
  // Ищем и базовые игры, и дополнения: тогда «Каркассон» в кандидатах
  // соседствует со своими дополнениями, а UI помечает их по isExpansion.
  const xml = await bggFetch(
    `/search?query=${encodeURIComponent(query)}&type=boardgame,boardgameexpansion${
      exact ? "&exact=1" : ""
    }`
  );
  const doc = parser.parse(xml);
  const items = asArray(doc.items?.item);

  return items.map((item: Record<string, unknown>) => {
    const nameNode = asArray(item.name)[0] as Record<string, string>;
    const yearNode = item.yearpublished as Record<string, string> | undefined;
    return {
      bggId: Number(item["@_id"]),
      name: nameNode?.["@_value"] ?? "Unknown",
      yearPublished: yearNode ? Number(yearNode["@_value"]) : null,
      isExpansion: item["@_type"] === "boardgameexpansion",
    };
  });
}

export async function searchBgg(query: string): Promise<BggSearchResult[]> {
  // Поиск BGG ищет подстроку и сортирует по алфавиту, поэтому очевидная игра
  // прячется далеко вниз: запрос «Oath» отдаёт «Blood Oath», «Oathbreaker» и
  // т.п., но не саму «Oath» в первой десятке. Сначала запрашиваем точные
  // совпадения по имени (exact=1) — это и есть искомая игра, — затем дополняем
  // обычным поиском, ранжированным по близости к запросу.
  const [exact, fuzzy] = await Promise.all([
    rawSearch(query, true).catch(() => [] as BggSearchResult[]),
    rawSearch(query, false),
  ]);

  const seen = new Set<number>();
  const merged: BggSearchResult[] = [];
  for (const r of [...exact, ...rankByRelevance(query, fuzzy)]) {
    if (Number.isNaN(r.bggId) || seen.has(r.bggId)) continue;
    seen.add(r.bggId);
    merged.push(r);
  }
  return merged.slice(0, 10);
}

export async function getBggGameDetails(
  bggId: number
): Promise<BggGameDetails | null> {
  const xml = await bggFetch(`/thing?id=${bggId}&stats=1`);
  const doc = parser.parse(xml);
  const item = asArray(doc.items?.item)[0] as
    | Record<string, unknown>
    | undefined;
  if (!item) return null;

  const names = asArray(item.name) as Array<Record<string, string>>;
  const localizedName = pickLocalizedName(names);
  const originalName = pickOriginalName(names);

  const links = asArray(item.link) as Array<Record<string, string>>;
  const linkValues = (type: string) =>
    links.filter((l) => l["@_type"] === type).map((l) => l["@_value"]);

  // Дополнения: outbound-ссылки boardgameexpansion (на странице базовой игры у
  // них нет inbound="true" — он стоит на обратной ссылке со страницы дополнения).
  const expansions: BggExpansion[] = links
    .filter(
      (l) => l["@_type"] === "boardgameexpansion" && l["@_inbound"] !== "true"
    )
    .map((l) => ({ bggId: Number(l["@_id"]), name: l["@_value"] }))
    .filter((e) => !Number.isNaN(e.bggId) && !!e.name);

  // Базовые игры: inbound boardgameexpansion-ссылки (стоят на странице самого
  // дополнения и ведут на базу). Их наличие и есть признак того, что эта запись —
  // дополнение.
  const baseGames: BggExpansion[] = links
    .filter(
      (l) => l["@_type"] === "boardgameexpansion" && l["@_inbound"] === "true"
    )
    .map((l) => ({ bggId: Number(l["@_id"]), name: l["@_value"] }))
    .filter((e) => !Number.isNaN(e.bggId) && !!e.name);

  const stats = item.statistics as
    | { ratings?: Record<string, unknown> }
    | undefined;
  const ratings = stats?.ratings;
  const attrNum = (node: unknown): number | null => {
    const v = (node as Record<string, string> | undefined)?.["@_value"];
    const n = Number(v);
    return v !== undefined && !Number.isNaN(n) ? n : null;
  };

  return {
    bggId,
    name: localizedName,
    originalName,
    yearPublished: attrNum(item.yearpublished),
    imageUrl: typeof item.image === "string" ? item.image : null,
    thumbnailUrl: typeof item.thumbnail === "string" ? item.thumbnail : null,
    minPlayers: attrNum(item.minplayers),
    maxPlayers: attrNum(item.maxplayers),
    playingTime: attrNum(item.playingtime),
    rating: ratings ? attrNum(ratings.average) : null,
    weight: ratings ? attrNum(ratings.averageweight) : null,
    description:
      typeof item.description === "string"
        ? decodeHtmlEntities(item.description).slice(0, 2000)
        : null,
    categories: linkValues("boardgamecategory"),
    mechanics: linkValues("boardgamemechanic"),
    expansions,
    isExpansion: baseGames.length > 0,
    baseGames,
  };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
}
