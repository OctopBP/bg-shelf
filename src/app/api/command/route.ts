import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validation";
import { logger } from "@/lib/logger";
import { runCollectionAgent } from "@/lib/agent";
import { parseAddCommand, buildProposal } from "@/lib/resolve";
import { getUserLang } from "@/lib/collection";

// LLM + агентный цикл + последовательные обращения к BGG (поиск/детали с 202-
// ретраями) — самый долгий путь приложения, поэтому потолок выше обычного. См.
// docs/database.md §5 (бюджет пайплайна) и docs/architecture.md.
export const maxDuration = 120;

const PostSchema = z.object({
  command: z.string().trim().min(1, "Пустая команда"),
  collectionId: z.string().min(1, "Не указана коллекция"),
});

export async function POST(request: Request) {
  const reqId = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();
  const log = logger.child(`command ${reqId}`);
  log.info("POST /api/command — старт");

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    log.error("ошибка auth.getUser:", authError.message);
  }

  if (!user) {
    log.warn("нет пользователя → 401");
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  log.info(`пользователь: ${user.id}`);

  const { data: parsedBody, error: badBody } = await parseBody(PostSchema, request);
  if (badBody) {
    log.warn("невалидное тело → 400");
    return badBody;
  }
  const command = parsedBody.command;
  const collectionId = parsedBody.collectionId;
  log.info(`команда: «${command.trim()}» в коллекции ${collectionId}`);

  try {
    // Сначала определяем намерение. Добавление игр не выполняем сразу, а
    // возвращаем предложение — клиент покажет окно подтверждения. Остальные
    // команды (удалить, теги и т.п.) обрабатывает агент как раньше.
    const lang = await getUserLang(supabase, user.id);
    const parsed = await parseAddCommand(command.trim(), reqId);
    if (parsed.intent === "add" && parsed.games.length > 0) {
      const games = await buildProposal(parsed.games, supabase, reqId, lang);
      log.info(`предложение за ${Date.now() - t0}мс, игр=${games.length}`);
      return NextResponse.json({ kind: "proposal", games });
    }

    const result = await runCollectionAgent(
      command.trim(),
      supabase,
      collectionId,
      user.id,
      reqId,
      lang
    );
    log.info(`успех за ${Date.now() - t0}мс, changed=${result.changed}`);
    return NextResponse.json({ kind: "reply", ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error(
      `НЕОБРАБОТАННАЯ ОШИБКА за ${Date.now() - t0}мс → 500:`,
      e instanceof Error ? e.stack ?? e.message : e
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
