import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validation";
import { setMyUsername } from "@/lib/friends";

const PatchSchema = z.object({ username: z.string() });

/** Сменить собственный ник. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { data, error } = await parseBody(PatchSchema, request);
  if (error) return error;
  try {
    await setMyUsername(supabase, user.id, data.username);
    return NextResponse.json({
      ok: true,
      username: data.username.trim().toLowerCase(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
