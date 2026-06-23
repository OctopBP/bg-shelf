import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";
import { searchBgg } from "./bgg";
import {
  addGameToCollection,
  removeGameFromCollection,
  updateGameTags,
  listCollection,
} from "./collection";

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `Ты — ассистент для управления коллекцией настольных игр. Пользователь даёт команды голосом или текстом, чаще всего на русском.

Ты работаешь с одной выбранной коллекцией пользователя — все добавления, удаления и изменения тегов относятся к ней.

Твоя задача — выполнить команду пользователя с помощью инструментов:
- Названия игр пользователь может произносить по-русски ("каркасон", "манчкин", "колонизаторы"). В BGG игры хранятся под оригинальными (обычно английскими) названиями — сначала ищи по оригинальному названию ("Carcassonne", "Munchkin", "Catan"). Если не уверен в оригинальном названии, попробуй несколько вариантов поиска.
- При выборе из результатов поиска предпочитай базовую игру, а не дополнения и переиздания, если пользователь явно не просил иное.
- Теги пользователя сохраняй как есть, на языке пользователя, в нижнем регистре (например "пати", "дуэльная", "филлер").
- Если команда содержит несколько игр — обработай каждую.
- Если поиск дал несколько сильно различающихся кандидатов и непонятно, какую игру имел в виду пользователь, выбери наиболее популярную базовую игру и упомяни это в ответе.

В конце дай короткий ответ на русском: что добавлено/удалено/изменено. Если что-то не нашлось — скажи об этом.`;

const tools: Anthropic.Tool[] = [
  {
    name: "search_bgg",
    description:
      "Поиск настольной игры в базе BoardGameGeek. Ищи по оригинальному (английскому) названию игры. Возвращает список кандидатов с id, названием и годом выпуска. Вызывай этот инструмент, когда нужно найти BGG id игры по её названию.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Название игры, желательно оригинальное (английское)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "add_to_collection",
    description:
      "Добавляет игру в коллекцию пользователя по её BGG id (полученному из search_bgg) с необязательными тегами. Данные игры подтягиваются из BGG автоматически.",
    input_schema: {
      type: "object" as const,
      properties: {
        bgg_id: { type: "integer", description: "BGG id игры" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Теги в нижнем регистре, например ['пати']",
        },
      },
      required: ["bgg_id"],
    },
  },
  {
    name: "remove_from_collection",
    description:
      "Удаляет игру из коллекции пользователя по нашему game_id. Сначала найди игру в коллекции через list_collection, чтобы взять правильный game_id.",
    input_schema: {
      type: "object" as const,
      properties: {
        game_id: { type: "integer", description: "Наш id игры (games.id) из list_collection" },
      },
      required: ["game_id"],
    },
  },
  {
    name: "set_tags",
    description:
      "Полностью заменяет теги игры в коллекции пользователя. Чтобы добавить тег к существующим, сначала посмотри текущие теги через list_collection и передай объединённый список.",
    input_schema: {
      type: "object" as const,
      properties: {
        game_id: { type: "integer", description: "Наш id игры (games.id) из list_collection" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Новый полный список тегов",
        },
      },
      required: ["game_id", "tags"],
    },
  },
  {
    name: "list_collection",
    description:
      "Возвращает текущую коллекцию пользователя: game_id, название и теги каждой игры. Вызывай, когда команда ссылается на игру, уже находящуюся в коллекции (удалить, поменять теги).",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];

export interface AgentResult {
  reply: string;
  /** Названия игр, затронутых командой — чтобы клиент обновил список */
  changed: boolean;
}

export async function runCollectionAgent(
  command: string,
  supabase: SupabaseClient,
  collectionId: string,
  userId: string,
  reqId = "????????"
): Promise<AgentResult> {
  const l = logger.child(`agent ${reqId}`);
  const log = (...args: unknown[]) => l.info(...args);
  const logErr = (...args: unknown[]) => l.error(...args);

  log(`старт, модель=${MODEL}, API key задан=${!!process.env.ANTHROPIC_API_KEY}`);
  // baseURL берётся из ANTHROPIC_BASE_URL автоматически. Если он указывает на
  // наш Cloudflare-релей, добавляем секрет, по которому релей пускает запросы.
  const relaySecret = process.env.ANTHROPIC_RELAY_SECRET;
  const anthropic = new Anthropic(
    relaySecret
      ? { defaultHeaders: { "x-relay-secret": relaySecret } }
      : undefined
  );
  let changed = false;

  async function executeTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<string> {
    log(`инструмент → ${name}, вход:`, JSON.stringify(input));
    switch (name) {
      case "search_bgg": {
        const results = await searchBgg(String(input.query));
        log(`search_bgg("${input.query}") → ${results.length} результат(ов)`);
        if (results.length === 0) return "Ничего не найдено";
        return JSON.stringify(results);
      }
      case "add_to_collection": {
        const tags = Array.isArray(input.tags)
          ? input.tags.map((t) => String(t).toLowerCase())
          : [];
        const { name: gameName } = await addGameToCollection(
          supabase,
          collectionId,
          Number(input.bgg_id),
          tags,
          userId
        );
        changed = true;
        return `Игра "${gameName}" добавлена в коллекцию${
          tags.length ? ` с тегами: ${tags.join(", ")}` : ""
        }`;
      }
      case "remove_from_collection": {
        await removeGameFromCollection(supabase, collectionId, Number(input.game_id));
        changed = true;
        return "Игра удалена из коллекции";
      }
      case "set_tags": {
        const tags = (input.tags as string[]).map((t) => t.toLowerCase());
        await updateGameTags(supabase, collectionId, Number(input.game_id), tags);
        changed = true;
        return `Теги обновлены: ${tags.join(", ")}`;
      }
      case "list_collection": {
        // Агенту нужен обзор коллекции для удаления/тегов по названию. Берём
        // одну большую страницу (для типовых коллекций этого достаточно).
        const { items } = await listCollection(supabase, collectionId, {
          limit: 200,
        });
        return JSON.stringify(
          items.map((i) => ({ game_id: i.gameId, name: i.name, tags: i.tags }))
        );
      }
      default:
        return `Неизвестный инструмент: ${name}`;
    }
  }

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: command },
  ];

  // Бюджет агента (верхний предел стоимости/времени, P-7): не больше
  // MAX_ITERATIONS обращений к модели, effort=low (операции простые —
  // поиск/добавление/теги), maxDuration=120с на роуте. Путь добавления игр идёт
  // мимо агента (parseAddCommand → предложение), поэтому здесь обычно 1–3 шага.
  const MAX_ITERATIONS = 8;
  let response: Anthropic.Message | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    log(`итерация ${i + 1}/${MAX_ITERATIONS}: запрос к Anthropic (${messages.length} сообщ.)`);
    const tCall = Date.now();
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });
    } catch (e) {
      logErr(`ошибка вызова Anthropic на итерации ${i + 1}:`, e);
      throw e;
    }
    log(
      `итерация ${i + 1}: ответ за ${Date.now() - tCall}мс, stop_reason=${response.stop_reason}, ` +
        `usage=${JSON.stringify(response.usage)}, блоков=${response.content.length}`
    );

    if (response.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result: string;
      let isError = false;
      const tTool = Date.now();
      try {
        result = await executeTool(
          block.name,
          block.input as Record<string, unknown>
        );
        log(`инструмент ${block.name} ок за ${Date.now() - tTool}мс`);
      } catch (e) {
        result = e instanceof Error ? e.message : String(e);
        isError = true;
        logErr(`инструмент ${block.name} упал за ${Date.now() - tTool}мс:`, e);
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
        is_error: isError,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  const reply =
    response?.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    )?.text ?? "Готово";

  log(`готово, итоговый ответ: «${reply}», changed=${changed}`);
  return { reply, changed };
}
