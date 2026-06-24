import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validation";
import {
  addGameToCollection,
  removeGameFromCollection,
  moveGameToCollection,
  updateCollectionItem,
  updateGameInfo,
  listCollection,
  listAllGames,
  getCollectionExpansionMap,
  getMemberCollectionIds,
  type GameInfoUpdate,
} from "@/lib/collection";

// Потолок задаёт самый долгий метод роута — POST (добавление: BGG-детали по
// каждой игре с 202-ретраями) и PUT (пакетное перемещение). GET/DELETE быстрые,
// но maxDuration задаётся на роут целиком. См. docs/database.md §5.
export const maxDuration = 120;

const PostSchema = z.object({
  collectionId: z.string().min(1, "Не указана коллекция"),
  items: z
    .array(
      z.object({
        bggId: z.coerce.number().int().positive(),
        tags: z.array(z.string()).optional(),
      })
    )
    .min(1, "Список игр пуст"),
});

const DeleteSchema = z.object({
  collectionId: z.string().min(1, "Не указана коллекция"),
  gameId: z.coerce.number().int().positive("Не указан gameId"),
});

const PutSchema = z.object({
  toCollectionId: z.string().min(1, "Не указана коллекция"),
  items: z
    .array(
      z.object({
        fromCollectionId: z.string(),
        gameId: z.coerce.number().int().positive(),
      })
    )
    .optional(),
  fromCollectionId: z.string().optional(),
  gameId: z.coerce.number().int().positive().optional(),
});

const PatchSchema = z
  .object({
    collectionId: z.string().min(1, "Не указана коллекция"),
    gameId: z.coerce.number().int().positive("Не указан gameId"),
    tags: z.array(z.string()).optional(),
    notes: z.string().nullable().optional(),
    info: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (b) => b.tags !== undefined || b.notes !== undefined || b.info !== undefined,
    { message: "Нечего обновлять" }
  );

/** Игры одной коллекции (?collectionId=…) или всех коллекций (?all=1). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const collectionId = searchParams.get("collectionId");
  const all = searchParams.get("all");
  const cursor = searchParams.get("cursor");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    if (all) {
      const ids = await getMemberCollectionIds(supabase, user.id);
      const [{ items, nextCursor }, expansionMap] = await Promise.all([
        listAllGames(supabase, user.id, { cursor, limit }),
        getCollectionExpansionMap(supabase, ids),
      ]);
      return NextResponse.json({ games: items, nextCursor, expansionMap });
    }
    if (!collectionId) {
      return NextResponse.json({ error: "Не указана коллекция" }, { status: 400 });
    }
    const [{ items, nextCursor }, expansionMap] = await Promise.all([
      listCollection(supabase, collectionId, { cursor, limit }),
      getCollectionExpansionMap(supabase, [collectionId]),
    ]);
    return NextResponse.json({ games: items, nextCursor, expansionMap });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Добавление игр (например, подтверждённых после распознавания фото) */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data, error: badBody } = await parseBody(PostSchema, request);
  if (badBody) return badBody;

  const added: string[] = [];
  const failed: number[] = [];
  for (const item of data.items) {
    try {
      const { name } = await addGameToCollection(
        supabase,
        data.collectionId,
        item.bggId,
        item.tags ?? [],
        user.id
      );
      added.push(name);
    } catch {
      failed.push(item.bggId);
    }
  }

  return NextResponse.json({ added, failed });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data, error: badBody } = await parseBody(DeleteSchema, request);
  if (badBody) return badBody;

  try {
    await removeGameFromCollection(supabase, data.collectionId, data.gameId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Перемещение игр между коллекциями. Поддерживает одну игру
 *  ({ fromCollectionId, bggId }) или несколько за раз
 *  ({ items: [{ fromCollectionId, bggId }] }). В обоих случаях нужна
 *  целевая коллекция toCollectionId. */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data, error: badBody } = await parseBody(PutSchema, request);
  if (badBody) return badBody;
  const toCollectionId = data.toCollectionId;

  // Нормализуем вход в список { from, gameId }: либо массив items, либо одиночные
  // поля fromCollectionId/gameId.
  const rawItems =
    data.items ??
    [{ fromCollectionId: data.fromCollectionId, gameId: data.gameId }];

  const moves = rawItems
    .map((it) => ({ from: it.fromCollectionId ?? "", gameId: it.gameId ?? 0 }))
    .filter((m) => m.from && m.gameId);

  if (moves.length === 0) {
    return NextResponse.json({ error: "Нечего перемещать" }, { status: 400 });
  }

  const moved: number[] = [];
  const failed: number[] = [];
  for (const m of moves) {
    try {
      await moveGameToCollection(supabase, m.from, toCollectionId, m.gameId, user.id);
      moved.push(m.gameId);
    } catch {
      failed.push(m.gameId);
    }
  }

  return NextResponse.json({ moved, failed });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data, error: badBody } = await parseBody(PatchSchema, request);
  if (badBody) return badBody;

  const tags: string[] | undefined = data.tags
    ? data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)
    : undefined;
  const notes = data.notes;
  const info: GameInfoUpdate | undefined = data.info
    ? sanitizeInfo(data.info)
    : undefined;

  try {
    if (tags !== undefined || notes !== undefined) {
      await updateCollectionItem(supabase, data.collectionId, data.gameId, {
        tags,
        notes: notes === undefined ? undefined : notes || null,
      });
    }
    if (info) {
      await updateGameInfo(supabase, data.gameId, info);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Преобразует сырой объект info из тела запроса в GameInfoUpdate. */
function sanitizeInfo(raw: Record<string, unknown>): GameInfoUpdate {
  const info: GameInfoUpdate = {};
  const num = (v: unknown): number | null => {
    if (v === null || v === "" || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  if (raw.name !== undefined) info.name = String(raw.name).trim();
  if (raw.yearPublished !== undefined) info.yearPublished = num(raw.yearPublished);
  if (raw.minPlayers !== undefined) info.minPlayers = num(raw.minPlayers);
  if (raw.maxPlayers !== undefined) info.maxPlayers = num(raw.maxPlayers);
  if (raw.playingTime !== undefined) info.playingTime = num(raw.playingTime);
  if (raw.description !== undefined)
    info.description = String(raw.description).trim() || null;
  return info;
}
