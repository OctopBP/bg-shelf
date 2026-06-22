import { NextResponse } from "next/server";
import { z } from "zod";

/** Результат parseBody: либо валидные данные, либо готовый 400-ответ. */
export type ParseResult<T> =
  | { data: T; error: null }
  | { data: null; error: NextResponse };

/**
 * Единая точка валидации тел API-роутов. Парсит JSON и проверяет его zod-схемой.
 * При невалидном JSON или несоответствии схеме возвращает готовый ответ 400 —
 * роут просто делает `if (error) return error;` и дальше работает с типизированными
 * данными.
 */
export async function parseBody<T>(
  schema: z.ZodType<T>,
  request: Request
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      data: null,
      error: NextResponse.json(
        { error: "Некорректный JSON в теле запроса" },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Некорректные данные";
    return {
      data: null,
      error: NextResponse.json({ error: message }, { status: 400 }),
    };
  }

  return { data: result.data, error: null };
}
