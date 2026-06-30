/**
 * Язык пользователя. На профиле (`profiles.lang`) храним ISO-код ('ru'), а в
 * каталоге язык записан полным именем ('Russian'/'English' — так его отдаёт BGG
 * и так лежит в `game_names.lang` / `languages.name`). Мостик между ними здесь.
 */
export const DEFAULT_LANG = "ru";

const LANG_NAME_BY_CODE: Record<string, string> = {
  ru: "Russian",
  en: "English",
};

/** ISO-код языка пользователя → полное имя языка в каталоге. Неизвестный код или
 *  пусто → 'English' (язык оригинала большинства BGG-карточек). */
export function langName(code: string | null | undefined): string {
  return LANG_NAME_BY_CODE[code ?? ""] ?? "English";
}
