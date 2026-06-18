import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFriendUsername } from "@/lib/friends";
import { listCollectionsByOwner } from "@/lib/collections";

/** Коллекции друга (только если между нами принятая дружба). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ friendId: string }> }
) {
  const { friendId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const username = await getFriendUsername(supabase, user.id, friendId);
    if (!username) {
      return NextResponse.json({ error: "Это не ваш друг" }, { status: 403 });
    }
    const collections = await listCollectionsByOwner(supabase, friendId);
    return NextResponse.json({ username, collections });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
