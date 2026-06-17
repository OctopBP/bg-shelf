import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { searchBgg, type BggSearchResult } from "./bgg";

const MODEL = "claude-opus-4-8";

const RecognizedGamesSchema = z.object({
  games: z.array(
    z.object({
      title: z
        .string()
        .describe(
          "Оригинальное (обычно английское) название игры для поиска в BGG"
        ),
      title_on_box: z
        .string()
        .describe("Название так, как оно написано на коробке на фото"),
      confidence: z
        .enum(["high", "medium", "low"])
        .describe("Уверенность в распознавании"),
    })
  ),
});

export interface PhotoMatch {
  titleOnBox: string;
  searchedTitle: string;
  confidence: "high" | "medium" | "low";
  candidates: BggSearchResult[];
}

type SupportedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export async function recognizeGamesOnPhoto(
  imageBase64: string,
  mediaType: SupportedMediaType
): Promise<PhotoMatch[]> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "На фото — настольные игры (коробки на полке, столе и т.п.). Определи все игры, которые видно на фото. Для каждой укажи оригинальное название для поиска в базе BoardGameGeek (если на коробке локализованное название, например русское — переведи в оригинальное), название как на коробке и уверенность распознавания.",
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(RecognizedGamesSchema) },
  });

  const recognized = response.parsed_output;
  if (!recognized || recognized.games.length === 0) return [];

  // Для каждой распознанной игры ищем кандидатов в BGG (последовательно — BGG не любит частые запросы)
  const matches: PhotoMatch[] = [];
  for (const game of recognized.games) {
    let candidates: BggSearchResult[] = [];
    try {
      candidates = (await searchBgg(game.title)).slice(0, 5);
    } catch {
      // поиск не удался — вернём игру без кандидатов
    }
    matches.push({
      titleOnBox: game.title_on_box,
      searchedTitle: game.title,
      confidence: game.confidence,
      candidates,
    });
  }

  return matches;
}
