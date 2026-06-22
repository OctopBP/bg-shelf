import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validation";
import { listCollections, createCollection } from "@/lib/collections";

const PostSchema = z.object({
  name: z.string().trim().min(1, "Не указано название"),
  visibility: z.enum(["public", "friends", "private"]).default("public"),
});

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Список коллекций, доступных пользователю. */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  try {
    const collections = await listCollections(supabase);
    return NextResponse.json({ collections, userId: user.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Создать новую коллекцию. */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { data, error: badBody } = await parseBody(PostSchema, request);
  if (badBody) return badBody;
  try {
    const collection = await createCollection(
      supabase,
      data.name,
      data.visibility
    );
    return NextResponse.json({ collection });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
