import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { logger } from "./logger";
import { searchBgg, getBggGameDetails } from "./bgg";
import { searchLocalGames } from "./collection";

// Разбор намерения — это классификация + извлечение полей со структурированным
// выходом (zod). Haiku 4.5 справляется и кратно дешевле/быстрее Opus (P-6).
const MODEL = "claude-haiku-4-5";

// Сколько кандидатов-альтернатив показываем на каждую запрошенную игру и сколько
// дополнений тянем для выбранного кандидата.
const MAX_CANDIDATES = 4;
const MAX_EXPANSIONS = 8;

const ParseSchema = z.object({
  intent: z
    .enum(["add", "other"])
    .describe(
      "add — пользователь хочет добавить одну или несколько игр в коллекцию. " +
        "other — любое другое намерение (удалить игру, изменить теги, вопрос и т.п.)."
    ),
  games: z
    .array(
      z.object({
        search_query: z
          .string()
          .describe(
            "Оригинальное (обычно английское) название игры для поиска в " +
              "BoardGameGeek. Русские названия переводи в оригинал: " +
              "«каркассон» → «Carcassonne», «колонизаторы» → «Catan»."
          ),
        requested_as: z
          .string()
          .describe("Название игры так, как его произнёс/написал пользователь."),
        tags: z
          .array(z.string())
          .describe(
            "Теги для этой игры в нижнем регистре, если пользователь их указал; " +
              "иначе пустой массив."
          ),
      })
    )
    .describe("Список игр для добавления. Пустой массив, если intent не add."),
});

const SYSTEM_PROMPT = `Ты разбираешь команды пользователя для приложения-коллекции настольных игр (команды на русском, голосом или текстом).

Определи намерение:
- Если пользователь хочет добавить игры в коллекцию (перечисляет названия, «добавь…», «закинь…», «есть такие игры…») — intent = "add" и перечисли каждую игру.
- Иначе (удалить игру, поменять теги, вопрос) — intent = "other", games пустой.

Для каждой игры дай оригинальное (английское) название для поиска в BoardGameGeek, исходное название как сказал пользователь, и теги, если он их назвал. Если в одной команде несколько игр — перечисли все.`;

export interface ParsedAddGame {
  searchQuery: string;
  requestedAs: string;
  tags: string[];
}

export interface ParsedCommand {
  intent: "add" | "other";
  games: ParsedAddGame[];
}

/** Разбирает команду пользователя: намерение + список игр для добавления. */
export async function parseAddCommand(
  command: string,
  reqId = "????????"
): Promise<ParsedCommand> {
  const log = (...args: unknown[]) => logger.child(`resolve ${reqId}`).info(...args);
  const relaySecret = process.env.ANTHROPIC_RELAY_SECRET;
  const anthropic = new Anthropic(
    relaySecret
      ? { defaultHeaders: { "x-relay-secret": relaySecret } }
      : undefined
  );

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: command }],
    output_config: { format: zodOutputFormat(ParseSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    log("разбор не дал результата → intent=other");
    return { intent: "other", games: [] };
  }
  log(`intent=${parsed.intent}, игр=${parsed.games.length}`);
  return {
    intent: parsed.intent,
    games: parsed.games.map((g) => ({
      searchQuery: g.search_query,
      requestedAs: g.requested_as,
      tags: g.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    })),
  };
}

export interface ResolvedCandidate {
  bggId: number;
  name: string;
  yearPublished: number | null;
}

export interface ResolvedExpansion {
  bggId: number;
  name: string;
}

/** Одна запрошенная игра с кандидатами BGG и дополнениями лучшего кандидата. */
export interface ResolvedGame {
  requestedAs: string;
  searchQuery: string;
  tags: string[];
  /** Кандидаты BGG, первый — лучшая догадка. */
  candidates: ResolvedCandidate[];
  /** Обложка лучшего кандидата. */
  thumbnailUrl: string | null;
  /** Дополнения лучшего кандидата. */
  expansions: ResolvedExpansion[];
  notFound: boolean;
}

/** По распознанным играм собирает предложение: кандидаты + дополнения.
 *  Сначала ищем в нашей БД (по основному И альтернативным названиям — так
 *  «Бирмингем» находит Brass: Birmingham), затем дополняем поиском BGG для игр,
 *  которых ещё нет в базе. BGG-запросы делаем последовательно — API не любит
 *  частые обращения. */
export async function buildProposal(
  games: ParsedAddGame[],
  supabase: SupabaseClient,
  reqId = "????????"
): Promise<ResolvedGame[]> {
  const log = (...args: unknown[]) => logger.child(`resolve ${reqId}`).info(...args);
  const out: ResolvedGame[] = [];

  for (const g of games) {
    const candidates: ResolvedCandidate[] = [];
    const seen = new Set<number>();

    // 1) Локальная БД: поиск по основному и альтернативным названиям. Ищем и по
    // тому, как сказал пользователь (часто это локальное/альт-название), и по
    // переведённому searchQuery. Точные альт-совпадения встают первыми.
    try {
      const local = await searchLocalGames(
        supabase,
        [g.requestedAs, g.searchQuery],
        MAX_CANDIDATES
      );
      for (const m of local) {
        if (seen.has(m.bggId)) continue;
        seen.add(m.bggId);
        candidates.push({
          bggId: m.bggId,
          name: m.name,
          yearPublished: m.yearPublished,
        });
      }
    } catch (e) {
      log(`локальный поиск «${g.requestedAs}» упал:`, e);
    }

    // 2) BGG: дополняем кандидатами из BGG (новые игры, которых нет в нашей БД).
    if (candidates.length < MAX_CANDIDATES) {
      try {
        for (const c of await searchBgg(g.searchQuery)) {
          if (seen.has(c.bggId)) continue;
          seen.add(c.bggId);
          candidates.push({
            bggId: c.bggId,
            name: c.name,
            yearPublished: c.yearPublished,
          });
          if (candidates.length >= MAX_CANDIDATES) break;
        }
      } catch (e) {
        log(`поиск «${g.searchQuery}» упал:`, e);
      }
    }

    let thumbnailUrl: string | null = null;
    let expansions: ResolvedExpansion[] = [];
    if (candidates.length > 0) {
      try {
        const details = await getBggGameDetails(candidates[0].bggId);
        if (details) {
          thumbnailUrl = details.thumbnailUrl;
          // Лучшему кандидату подставляем локализованное (русское) название.
          candidates[0] = { ...candidates[0], name: details.name };
          expansions = details.expansions.slice(0, MAX_EXPANSIONS);
        }
      } catch (e) {
        log(`детали для ${candidates[0].bggId} упали:`, e);
      }
    }

    out.push({
      requestedAs: g.requestedAs,
      searchQuery: g.searchQuery,
      tags: g.tags,
      candidates,
      thumbnailUrl,
      expansions,
      notFound: candidates.length === 0,
    });
  }

  return out;
}
