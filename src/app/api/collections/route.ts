import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listCollections,
  createCollection,
  countUncollected,
} from "@/lib/collections";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Список коллекций, доступных пользователю. */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  try {
    const [collections, uncollectedCount] = await Promise.all([
      listCollections(supabase),
      countUncollected(supabase),
    ]);
    return NextResponse.json({ collections, uncollectedCount, userId: user.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Создать новую коллекцию. */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Не указано название" }, { status: 400 });
  }
  try {
    const collection = await createCollection(supabase, name);
    return NextResponse.json({ collection });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
