import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setMyUsername } from "@/lib/friends";

/** Сменить собственный ник. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  try {
    await setMyUsername(supabase, user.id, username);
    return NextResponse.json({ ok: true, username: username.trim().toLowerCase() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
