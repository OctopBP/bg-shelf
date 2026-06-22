// Переиспользуемый помощник курсорной пагинации. Курсор — пара (added_at, id):
// стабильна при равных added_at (id уникален) и совпадает с сортировкой списков
// игр (added_at desc, id desc). Закладываем в контракт всех будущих списков
// (лента, предзаказы), чтобы пагинация была единообразной с первого дня.

/** Размер страницы по умолчанию для списков игр. */
export const DEFAULT_PAGE_SIZE = 60;
export const MAX_PAGE_SIZE = 200;

/** Непрозрачный курсор. Кодируем в строку для передачи через query/JSON. */
export interface Cursor {
  addedAt: string;
  id: string;
}

/** Страница результатов: элементы + курсор на следующую страницу (null — конец). */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Кодирует курсор в строку `<added_at>|<id>` (base64url, чтобы не зависеть от
 *  экранирования в URL). */
export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.addedAt}|${c.id}`, "utf8").toString("base64url");
}

/** Декодирует курсор; возвращает null для пустого/битого значения. */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const sep = decoded.lastIndexOf("|");
    if (sep <= 0) return null;
    const addedAt = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!addedAt || !id) return null;
    return { addedAt, id };
  } catch {
    return null;
  }
}

/** Нормализует запрошенный размер страницы в допустимый диапазон. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
}
