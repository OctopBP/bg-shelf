import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validation";
import {
  renameCollection,
  deleteCollection,
  setCollectionVisibility,
} from "@/lib/collections";

const PatchSchema = z
  .object({
    name: z.string().trim().min(1, "Не указано название").optional(),
    visibility: z.enum(["public", "friends", "private"]).optional(),
  })
  .refine((b) => b.name !== undefined || b.visibility !== undefined, {
    message: "Нечего обновлять",
  });

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
  const { data, error: badBody } = await parseBody(PatchSchema, request);
  if (badBody) return badBody;

  try {
    if (data.name !== undefined) await renameCollection(supabase, id, data.name);
    if (data.visibility !== undefined) {
      await setCollectionVisibility(supabase, id, data.visibility);
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
