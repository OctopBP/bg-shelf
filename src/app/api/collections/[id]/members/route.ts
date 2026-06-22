import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validation";
import {
  listMembers,
  shareCollection,
  shareCollectionWithUser,
  removeMember,
} from "@/lib/collections";

const PostSchema = z
  .object({
    email: z.string().trim().optional().default(""),
    userId: z.string().trim().optional().default(""),
    role: z.enum(["editor", "viewer"]).default("editor"),
  })
  .refine((b) => Boolean(b.email) || Boolean(b.userId), {
    message: "Не указан получатель",
  });

const DeleteSchema = z.object({
  userId: z.string().min(1, "Не указан пользователь"),
});

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
  const { data, error: badBody } = await parseBody(PostSchema, request);
  if (badBody) return badBody;
  try {
    if (data.userId) {
      await shareCollectionWithUser(supabase, id, data.userId, data.role);
    } else {
      await shareCollection(supabase, id, data.email, data.role);
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
  const { data, error: badBody } = await parseBody(DeleteSchema, request);
  if (badBody) return badBody;
  try {
    await removeMember(supabase, id, data.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
