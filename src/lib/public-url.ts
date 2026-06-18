import type { NextRequest } from "next/server";

// За обратным прокси (Traefik у Dokploy) standalone-сервер запущен с
// HOSTNAME=0.0.0.0, поэтому request.url / nextUrl.origin указывают на
// 0.0.0.0:PORT. Реальный внешний адрес приходит в заголовках x-forwarded-*.
// Используем их при построении redirect'ов, иначе браузер уходит на 0.0.0.0.
export function publicOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}
