// Русское склонение по числу для слов, используемых в коллекции.

/** Склонение слова «игра» по числу: 1 игру, 2 игры, 5 игр. */
export function pluralGames(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "игру";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return "игры";
  }
  return "игр";
}

/** Склонение «доп» по числу: 1 доп, 2 допа, 5 допов. */
export function pluralExpansions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "доп";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "допа";
  return "допов";
}
