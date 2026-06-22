import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validation";
import {
  getFriendData,
  getMyUsername,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
} from "@/lib/friends";

const PostSchema = z.object({ username: z.string() });
const IdSchema = z.object({ id: z.string().min(1, "Не указан запрос") });

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
  const { data, error: badBody } = await parseBody(PostSchema, request);
  if (badBody) return badBody;
  try {
    const result = await sendFriendRequest(supabase, user.id, data.username);
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
  const { data, error: badBody } = await parseBody(IdSchema, request);
  if (badBody) return badBody;
  try {
    await acceptFriendRequest(supabase, data.id);
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
  const { data, error: badBody } = await parseBody(IdSchema, request);
  if (badBody) return badBody;
  try {
    await removeFriendship(supabase, data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
