import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listMembers,
  shareCollection,
  shareCollectionWithUser,
  removeMember,
  type CollectionRole,
} from "@/lib/collections";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Участники коллекции. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const members = await listMembers(supabase, id);
    return NextResponse.json({ members });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Поделиться коллекцией: пригласить пользователя по email. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const role: Exclude<CollectionRole, "owner"> =
    body?.role === "viewer" ? "viewer" : "editor";
  if (!email && !userId) {
    return NextResponse.json({ error: "Не указан получатель" }, { status: 400 });
  }
  try {
    if (userId) {
      await shareCollectionWithUser(supabase, id, userId, role);
    } else {
      await shareCollection(supabase, id, email, role);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Убрать участника из коллекции. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "Не указан пользователь" }, { status: 400 });
  }
  try {
    await removeMember(supabase, id, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
