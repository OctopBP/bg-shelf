import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { browseGames, getUserLang } from "@/lib/collection";

/** Постраничный каталог games для простого (не-NLP) поиска в окне добавления игр. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q") ?? undefined;
  const collectionId = searchParams.get("collectionId") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");

  try {
    const lang = await getUserLang(supabase, user.id);
    const { items, total } = await browseGames(supabase, {
      query,
      collectionId,
      page,
      pageSize,
      lang,
    });
    return NextResponse.json({ games: items, total, page, pageSize });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
