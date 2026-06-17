// MSW handler for the Anthropic Messages API. It emulates just enough of the
// wire protocol for the two flows the app uses:
//
//  - Command flow (lib/agent.ts): a tool-use loop. The fake "Claude" parses the
//    user's command (alias + tag matching ported from the old agent.mock.ts),
//    emits add/remove/set_tags tool calls with a known BGG id, then — once the
//    real agent has executed them and posted tool_result blocks — returns a
//    final text summary. The real agent loop, tools, collection.ts, Supabase and
//    BGG all run for real (the latter two also via MSW).
//
//  - Photo flow (lib/photo.ts): messages.parse() + zodOutputFormat expect a text
//    block whose text is the JSON of the schema. We return a pretend pair of
//    games; the SDK JSON-parses the text into `parsed_output`.
import { http, HttpResponse } from "msw";
import { MOCK_GAMES, type MockGame } from "@/lib/bgg.mock";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

interface AnthropicRequestBody {
  messages: Array<{ role: string; content: string | ContentBlock[] }>;
  tools?: unknown[];
  output_config?: { format?: unknown } | null;
}

function message(content: ContentBlock[], stopReason: "tool_use" | "end_turn") {
  return HttpResponse.json({
    id: `msg_mock_${Math.random().toString(36).slice(2, 10)}`,
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    container: null,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
}

// --- Command parsing (ported from the former lib/agent.mock.ts) --------------
interface ParsedCommand {
  remove: boolean;
  games: { game: MockGame; tags: string[] }[];
}

function parseCommand(command: string): ParsedCommand {
  const text = command.toLowerCase();
  const remove = /удал|убер|выкин/.test(text);

  const mentions: { game: MockGame; index: number }[] = [];
  for (const game of MOCK_GAMES) {
    let first = -1;
    for (const alias of game.aliases) {
      const idx = text.indexOf(alias);
      if (idx !== -1 && (first === -1 || idx < first)) first = idx;
    }
    if (first !== -1) mentions.push({ game, index: first });
  }
  mentions.sort((a, b) => a.index - b.index);

  // Tags: "... как <тег>", "с тегом <тег>", "тег <тег>". Each tag binds to the
  // nearest game mentioned to its left.
  const tagsByGame = new Map<number, string[]>();
  const tagRe = /(?:как|с\s+тегом|тегом|тег)\s+([a-zа-яё][a-zа-яё-]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(text)) !== null) {
    const tag = match[1]
      .toLowerCase()
      .replace(/(игру|игрой|игры|игра)$/, "")
      .trim();
    if (!tag || mentions.length === 0) continue;
    let owner = mentions[0].game;
    for (const m of mentions) {
      if (m.index < match.index) owner = m.game;
    }
    const list = tagsByGame.get(owner.bggId) ?? [];
    if (!list.includes(tag)) list.push(tag);
    tagsByGame.set(owner.bggId, list);
  }

  const seen = new Set<number>();
  const games: { game: MockGame; tags: string[] }[] = [];
  for (const { game } of mentions) {
    if (seen.has(game.bggId)) continue;
    seen.add(game.bggId);
    games.push({ game, tags: tagsByGame.get(game.bggId) ?? [] });
  }
  return { remove, games };
}

function firstUserCommand(body: AnthropicRequestBody): string {
  const first = body.messages.find((m) => m.role === "user");
  if (!first) return "";
  return typeof first.content === "string" ? first.content : "";
}

function lastMessageHasToolResult(body: AnthropicRequestBody): boolean {
  const last = body.messages[body.messages.length - 1];
  return (
    !!last &&
    Array.isArray(last.content) &&
    last.content.some((c) => c.type === "tool_result")
  );
}

function summarize({ remove, games }: ParsedCommand): string {
  if (games.length === 0) {
    return (
      "[мок] Не нашёл знакомых игр в команде. Доступны: " +
      MOCK_GAMES.map((g) => g.name).join(", ")
    );
  }
  const done = games.map(({ game, tags }) =>
    remove
      ? `удалена «${game.name}»`
      : `добавлена «${game.name}»` +
        (tags.length ? ` (теги: ${tags.join(", ")})` : "")
  );
  return `[мок] ${done.join("; ")}.`;
}

export const anthropicHandlers = [
  http.post("*/v1/messages", async ({ request }) => {
    const body = (await request.json()) as AnthropicRequestBody;

    // Photo flow: structured output requested.
    if (body.output_config?.format) {
      const games = [
        {
          title: "Carcassonne",
          title_on_box: "Каркассон",
          confidence: "high",
        },
        { title: "CATAN", title_on_box: "Колонизаторы", confidence: "medium" },
      ];
      return message(
        [{ type: "text", text: JSON.stringify({ games }) }],
        "end_turn"
      );
    }

    const parsed = parseCommand(firstUserCommand(body));

    // Second turn: the agent has executed our tool calls and posted results —
    // wrap up with a text summary.
    if (lastMessageHasToolResult(body) || parsed.games.length === 0) {
      return message([{ type: "text", text: summarize(parsed) }], "end_turn");
    }

    // First turn: emit one tool call per matched game.
    const toolCalls: ContentBlock[] = parsed.games.map(({ game, tags }, i) => ({
      type: "tool_use",
      id: `toolu_mock_${i}_${game.bggId}`,
      name: parsed.remove ? "remove_from_collection" : "add_to_collection",
      input: parsed.remove
        ? { bgg_id: game.bggId }
        : { bgg_id: game.bggId, tags },
    }));
    return message(toolCalls, "tool_use");
  }),
];
