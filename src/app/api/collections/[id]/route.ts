import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  renameCollection,
  deleteCollection,
  setCollectionVisibility,
  type CollectionVisibility,
} from "@/lib/collections";

const VISIBILITIES: CollectionVisibility[] = ["public", "friends", "private"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Обновить коллекцию: название и/или видимость (RLS — только владельцу). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const name =
    body?.name === undefined ? undefined : String(body.name ?? "").trim();
  const visibility =
    body?.visibility === undefined
      ? undefined
      : (body.visibility as CollectionVisibility);

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Не указано название" }, { status: 400 });
  }
  if (visibility !== undefined && !VISIBILITIES.includes(visibility)) {
    return NextResponse.json({ error: "Недопустимая видимость" }, { status: 400 });
  }
  if (name === undefined && visibility === undefined) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  try {
    if (name !== undefined) await renameCollection(supabase, id, name);
    if (visibility !== undefined) {
      await setCollectionVisibility(supabase, id, visibility);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Удалить коллекцию (RLS разрешает только владельцу). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deleteCollection(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
