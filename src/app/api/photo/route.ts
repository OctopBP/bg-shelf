import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recognizeGamesOnPhoto } from "@/lib/photo";

export const maxDuration = 120;

const SUPPORTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }

  const mediaType = SUPPORTED_TYPES.find((t) => t === file.type);
  if (!mediaType) {
    return NextResponse.json(
      { error: `Неподдерживаемый формат: ${file.type}` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Файл больше 10 МБ" },
      { status: 400 }
    );
  }

  try {
    const matches = await recognizeGamesOnPhoto(
      buffer.toString("base64"),
      mediaType
    );
    return NextResponse.json({ matches });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
