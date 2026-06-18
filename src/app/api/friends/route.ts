import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getFriendData,
  getMyUsername,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
} from "@/lib/friends";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Ник + друзья, входящие и исходящие запросы текущего пользователя. */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  try {
    const [username, data] = await Promise.all([
      getMyUsername(supabase, user.id),
      getFriendData(supabase, user.id),
    ]);
    return NextResponse.json({ username, ...data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Отправить запрос в друзья по нику. */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  try {
    const result = await sendFriendRequest(supabase, user.id, username);
    return NextResponse.json({ result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Принять входящий запрос. */
export async function PATCH(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Не указан запрос" }, { status: 400 });
  try {
    await acceptFriendRequest(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Отклонить / отменить запрос или удалить из друзей. */
export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Не указан запрос" }, { status: 400 });
  try {
    await removeFriendship(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
