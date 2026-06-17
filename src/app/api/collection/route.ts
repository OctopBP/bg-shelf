import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  addGameToCollection,
  removeGameFromCollection,
  updateCollectionItem,
  updateGameInfo,
  listCollection,
  listAllGames,
  type GameInfoUpdate,
} from "@/lib/collection";

export const maxDuration = 120;

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

  try {
    if (all) {
      const games = await listAllGames(supabase);
      return NextResponse.json({ games });
    }
    if (!collectionId) {
      return NextResponse.json({ error: "Не указана коллекция" }, { status: 400 });
    }
    const games = await listCollection(supabase, collectionId);
    return NextResponse.json({ games });
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

  const body = await request.json().catch(() => null);
  const collectionId = body?.collectionId;
  if (typeof collectionId !== "string" || !collectionId) {
    return NextResponse.json({ error: "Не указана коллекция" }, { status: 400 });
  }
  const items: Array<{ bggId: number; tags?: string[] }> = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Список игр пуст" }, { status: 400 });
  }

  const added: string[] = [];
  const failed: number[] = [];
  for (const item of items) {
    try {
      const { name } = await addGameToCollection(
        supabase,
        collectionId,
        Number(item.bggId),
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

  const body = await request.json().catch(() => null);
  const collectionId = body?.collectionId;
  if (typeof collectionId !== "string" || !collectionId) {
    return NextResponse.json({ error: "Не указана коллекция" }, { status: 400 });
  }
  const bggId = Number(body?.bggId);
  if (!bggId) {
    return NextResponse.json({ error: "Не указан bggId" }, { status: 400 });
  }

  try {
    await removeGameFromCollection(supabase, collectionId, bggId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const collectionId = body?.collectionId;
  if (typeof collectionId !== "string" || !collectionId) {
    return NextResponse.json({ error: "Не указана коллекция" }, { status: 400 });
  }
  const bggId = Number(body?.bggId);
  if (!bggId) {
    return NextResponse.json({ error: "Не указан bggId" }, { status: 400 });
  }

  const tags: string[] | undefined = Array.isArray(body?.tags)
    ? body.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean)
    : undefined;
  const notes: string | undefined =
    body?.notes === undefined ? undefined : String(body.notes ?? "");
  const info: GameInfoUpdate | undefined = body?.info
    ? sanitizeInfo(body.info)
    : undefined;

  if (tags === undefined && notes === undefined && info === undefined) {
    return NextResponse.json(
      { error: "Нечего обновлять" },
      { status: 400 }
    );
  }

  try {
    if (tags !== undefined || notes !== undefined) {
      await updateCollectionItem(supabase, collectionId, bggId, {
        tags,
        notes: notes === undefined ? undefined : notes || null,
      });
    }
    if (info) {
      await updateGameInfo(supabase, bggId, info);
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
