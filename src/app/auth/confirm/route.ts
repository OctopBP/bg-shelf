import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/public-url";
import { logger } from "@/lib/logger";

const log = logger.child("auth/confirm");

// Точка приземления для ссылок из писем Supabase (invite / recovery).
// Шаблон письма должен вести сюда:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
// verifyOtp подтверждает токен и устанавливает сессию в куки, после чего
// отправляем пользователя задать пароль.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/auth/set-password";
  const origin = publicOrigin(request);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    // Видно в логах Dokploy — помогает понять, почему ссылка не сработала
    // (истёк / уже использован токен и т.п.).
    log.error("verifyOtp failed:", error.message);
  } else {
    log.error("missing token_hash or type", { tokenHash, type });
  }

  return NextResponse.redirect(new URL("/login?error=invalid_link", origin));
}
