import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBggGameDetails } from "@/lib/bgg";

// Один запрос деталей к BGG с 202-ретраями — 60с с запасом хватает.
export const maxDuration = 60;

/** Лёгкие данные кандидата для окна подтверждения: имя, год, обложка,
 *  дополнения. Используется при выборе альтернативного кандидата. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const bggId = Number(request.nextUrl.searchParams.get("id"));
  if (!bggId) {
    return NextResponse.json({ error: "Не указан id" }, { status: 400 });
  }

  try {
    const details = await getBggGameDetails(bggId);
    if (!details) {
      return NextResponse.json({ error: "Игра не найдена" }, { status: 404 });
    }
    return NextResponse.json({
      name: details.name,
      yearPublished: details.yearPublished,
      thumbnailUrl: details.thumbnailUrl,
      expansions: details.expansions.slice(0, 8),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
