import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runCollectionAgent } from "@/lib/agent";
import { parseAddCommand, buildProposal } from "@/lib/resolve";

export const maxDuration = 120;

export async function POST(request: Request) {
  const reqId = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();
  console.log(`[command ${reqId}] POST /api/command — старт`);

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error(`[command ${reqId}] ошибка auth.getUser:`, authError.message);
  }

  if (!user) {
    console.warn(`[command ${reqId}] нет пользователя → 401`);
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  console.log(`[command ${reqId}] пользователь: ${user.id}`);

  const body = await request.json().catch((e) => {
    console.error(`[command ${reqId}] не удалось распарсить JSON тела:`, e);
    return null;
  });
  const command = body?.command;
  if (typeof command !== "string" || !command.trim()) {
    console.warn(
      `[command ${reqId}] пустая/невалидная команда (тип ${typeof command}) → 400`
    );
    return NextResponse.json({ error: "Пустая команда" }, { status: 400 });
  }
  const collectionId = body?.collectionId;
  if (typeof collectionId !== "string" || !collectionId) {
    console.warn(`[command ${reqId}] не указана коллекция → 400`);
    return NextResponse.json({ error: "Не указана коллекция" }, { status: 400 });
  }
  console.log(`[command ${reqId}] команда: «${command.trim()}» в коллекции ${collectionId}`);

  try {
    // Сначала определяем намерение. Добавление игр не выполняем сразу, а
    // возвращаем предложение — клиент покажет окно подтверждения. Остальные
    // команды (удалить, теги и т.п.) обрабатывает агент как раньше.
    const parsed = await parseAddCommand(command.trim(), reqId);
    if (parsed.intent === "add" && parsed.games.length > 0) {
      const games = await buildProposal(parsed.games, reqId);
      console.log(
        `[command ${reqId}] предложение за ${Date.now() - t0}мс, игр=${games.length}`
      );
      return NextResponse.json({ kind: "proposal", games });
    }

    const result = await runCollectionAgent(
      command.trim(),
      supabase,
      collectionId,
      user.id,
      reqId
    );
    console.log(
      `[command ${reqId}] успех за ${Date.now() - t0}мс, changed=${result.changed}`
    );
    return NextResponse.json({ kind: "reply", ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    console.error(
      `[command ${reqId}] НЕОБРАБОТАННАЯ ОШИБКА за ${Date.now() - t0}мс → 500:`,
      e instanceof Error ? e.stack ?? e.message : e
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
