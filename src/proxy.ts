import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-url";
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  USE_MOCK,
} from "@/lib/mock/config";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname.startsWith("/login");
  // /auth/* — обработка ссылки-приглашения и установка пароля: должны быть
  // доступны без сессии, иначе редирект на /login сорвёт подтверждение токена.
  const isPublicRoute = isLoginRoute || pathname.startsWith("/auth");

  // Прокси Next исполняется в рантайме, который MSW не патчит, поэтому в
  // мок-режиме сетевой getUser недоступен (ушёл бы в реальный Supabase). Считаем
  // авторизацией наличие session-куки: логин её ставит, выход — убирает.
  if (USE_MOCK) {
    const hasSession = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    if (!hasSession && !isPublicRoute) {
      return NextResponse.redirect(new URL("/login", publicOrigin(request)));
    }
    if (hasSession && isLoginRoute) {
      return NextResponse.redirect(new URL("/", publicOrigin(request)));
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Не убирать: обновляет сессию и держит auth-токен живым
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", publicOrigin(request)));
  }

  if (user && isLoginRoute) {
    return NextResponse.redirect(new URL("/", publicOrigin(request)));
  }

  return supabaseResponse;
}

export const config = {
  // Exclude the MSW worker script too: it must be served directly, never
  // redirected (a redirected service-worker script fails registration).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|mockServiceWorker.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
