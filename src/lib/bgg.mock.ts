import type { BggGameDetails } from "./bgg";

// Seed dataset for demo/offline mode (USE_MOCK=true). Used by the MSW BGG
// handler (src/mocks/handlers/bgg.ts) to build XML responses and by the
// in-memory store (src/lib/mock/store.ts) to pre-fill the collection.
// bggId values are real BoardGameGeek ids.
// В моке `name` — это оригинальное (англ.) название игры, а `nameRu` —
// локализованное. Поле originalName реального BggGameDetails мок не хранит:
// его вычисляет lib/bgg.ts из primary-имени, которое мок-обработчик строит
// именно из `name`.
export interface MockGame
  extends Omit<BggGameDetails, "originalName" | "expansions"> {
  /** Подстроки для распознавания игры в запросе/команде (нижний регистр) */
  aliases: string[];
  /** Русское (кириллическое) название — отдаётся как alternate-имя BGG */
  nameRu?: string;
  /** Дополнения — отдаются как ссылки boardgameexpansion в thing-ответе. */
  expansions?: { bggId: number; name: string }[];
  /** Сама запись — дополнение (BGG-тип boardgameexpansion). */
  isExpansion?: boolean;
}

// Заглушки обложек — самодостаточные inline-SVG в палитре приложения
// (детерминированный цвет по названию). Никаких внешних запросов, поэтому демо
// работает полностью офлайн и выглядит ярко в едином стиле.
const COVER_COLORS = [
  "ff5a1f",
  "21b24c",
  "2f9be0",
  "ec5fa6",
  "ffc400",
  "9b5de5",
  "ec2b2b",
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function img(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  const bg = COVER_COLORS[Math.abs(h) % COVER_COLORS.length];

  // Разбиваем длинные названия максимум на две строки.
  const words = title.split(" ");
  const lines =
    words.length > 1
      ? [
          words.slice(0, Math.ceil(words.length / 2)).join(" "),
          words.slice(Math.ceil(words.length / 2)).join(" "),
        ]
      : [title];
  const ys = lines.length > 1 ? [255, 370] : [315];
  const fontSize = lines.length > 1 ? 84 : title.length > 9 ? 80 : 104;
  const tspans = lines
    .map((l, i) => `<tspan x="300" y="${ys[i]}">${escapeXml(l)}</tspan>`)
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">` +
    `<rect width="600" height="600" fill="#${bg}"/>` +
    `<text fill="#0d0d0d" font-family="Arial, Helvetica, sans-serif" font-weight="800" ` +
    `font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${tspans}</text>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const MOCK_GAMES: MockGame[] = [
  {
    bggId: 822,
    name: "Carcassonne",
    yearPublished: 2000,
    imageUrl: img("Carcassonne"),
    thumbnailUrl: img("Carcassonne"),
    minPlayers: 2,
    maxPlayers: 5,
    playingTime: 45,
    rating: 7.4,
    weight: 1.9,
    description: "[мок] Классика с выкладыванием тайлов: строим города и дороги.",
    categories: ["City Building", "Medieval", "Territory Building"],
    mechanics: ["Tile Placement", "Area Majority / Influence"],
    aliases: ["каркассон", "каркасон", "carcassonne"],
    nameRu: "Каркассон",
    expansions: [
      { bggId: 5404, name: "Carcassonne: Inns & Cathedrals" },
      { bggId: 5405, name: "Carcassonne: Traders & Builders" },
    ],
  },
  {
    bggId: 13,
    name: "CATAN",
    yearPublished: 1995,
    imageUrl: img("CATAN"),
    thumbnailUrl: img("CATAN"),
    minPlayers: 3,
    maxPlayers: 4,
    playingTime: 120,
    rating: 7.1,
    weight: 2.3,
    description: "[мок] Колонизаторы: добываем ресурсы и строим поселения.",
    categories: ["Economic", "Negotiation"],
    mechanics: ["Dice Rolling", "Trading", "Modular Board"],
    aliases: ["колонизатор", "катан", "catan", "settlers"],
    nameRu: "Колонизаторы",
    expansions: [
      { bggId: 325, name: "Catan: Seafarers" },
      { bggId: 926, name: "Catan: Cities & Knights" },
    ],
  },
  {
    bggId: 1927,
    name: "Munchkin",
    yearPublished: 2001,
    imageUrl: img("Munchkin"),
    thumbnailUrl: img("Munchkin"),
    minPlayers: 3,
    maxPlayers: 6,
    playingTime: 90,
    rating: 5.8,
    weight: 1.6,
    description: "[мок] Юмористическая карточная игра про подземелья и подлянки.",
    categories: ["Card Game", "Fantasy", "Humor"],
    mechanics: ["Hand Management", "Take That"],
    aliases: ["манчкин", "munchkin"],
    nameRu: "Манчкин",
  },
  {
    bggId: 30549,
    name: "Pandemic",
    yearPublished: 2008,
    imageUrl: img("Pandemic"),
    thumbnailUrl: img("Pandemic"),
    minPlayers: 2,
    maxPlayers: 4,
    playingTime: 45,
    rating: 7.5,
    weight: 2.4,
    description: "[мок] Кооператив: вместе спасаем мир от эпидемий.",
    categories: ["Medical"],
    mechanics: ["Cooperative Game", "Point to Point Movement", "Set Collection"],
    aliases: ["пандеми", "pandemic"],
    nameRu: "Пандемия",
  },
  {
    bggId: 9209,
    name: "Ticket to Ride",
    yearPublished: 2004,
    imageUrl: img("Ticket to Ride"),
    thumbnailUrl: img("Ticket to Ride"),
    minPlayers: 2,
    maxPlayers: 5,
    playingTime: 60,
    rating: 7.4,
    weight: 1.8,
    description: "[мок] Строим железнодорожные маршруты по карте.",
    categories: ["Trains"],
    mechanics: ["Set Collection", "Route/Network Building"],
    aliases: ["билет на поезд", "билеты на поезд", "ticket to ride", "тикет"],
    nameRu: "Билет на поезд",
  },
  {
    bggId: 178900,
    name: "Codenames",
    yearPublished: 2015,
    imageUrl: img("Codenames"),
    thumbnailUrl: img("Codenames"),
    minPlayers: 2,
    maxPlayers: 8,
    playingTime: 15,
    rating: 7.6,
    weight: 1.3,
    description: "[мок] Командная игра на ассоциации со словами-агентами.",
    categories: ["Card Game", "Deduction", "Party Game", "Word Game"],
    mechanics: ["Communication Limits", "Team-Based Game"],
    aliases: ["кодовые имена", "кодовые", "codenames", "коднеймс"],
    nameRu: "Кодовые имена",
  },
  {
    bggId: 68448,
    name: "7 Wonders",
    yearPublished: 2010,
    imageUrl: img("7 Wonders"),
    thumbnailUrl: img("7 Wonders"),
    minPlayers: 2,
    maxPlayers: 7,
    playingTime: 30,
    rating: 7.7,
    weight: 2.3,
    description: "[мок] Драфтим карты и строим античную цивилизацию.",
    categories: ["Ancient", "Card Game", "City Building", "Civilization"],
    mechanics: ["Closed Drafting", "Set Collection"],
    aliases: ["7 чудес", "семь чудес", "7 wonders", "чудеса света"],
    nameRu: "7 чудес",
  },
  {
    bggId: 39856,
    name: "Dixit",
    yearPublished: 2008,
    imageUrl: img("Dixit"),
    thumbnailUrl: img("Dixit"),
    minPlayers: 3,
    maxPlayers: 6,
    playingTime: 30,
    rating: 7.3,
    weight: 1.2,
    description: "[мок] Ассоциации по сюрреалистичным картинкам.",
    categories: ["Card Game", "Humor", "Party Game"],
    mechanics: ["Storytelling", "Voting"],
    aliases: ["диксит", "dixit"],
    nameRu: "Диксит",
  },
  {
    bggId: 266192,
    name: "Wingspan",
    yearPublished: 2019,
    imageUrl: img("Wingspan"),
    thumbnailUrl: img("Wingspan"),
    minPlayers: 1,
    maxPlayers: 5,
    playingTime: 70,
    rating: 8.1,
    weight: 2.4,
    description: "[мок] Привлекаем птиц в свои вольеры и запускаем комбо-движок.",
    categories: ["Animals", "Card Game"],
    mechanics: ["Engine Building", "Set Collection", "Dice Rolling"],
    aliases: ["крылья", "wingspan", "вингспан"],
    nameRu: "Крылья",
  },
  {
    bggId: 230802,
    name: "Azul",
    yearPublished: 2017,
    imageUrl: img("Azul"),
    thumbnailUrl: img("Azul"),
    minPlayers: 2,
    maxPlayers: 4,
    playingTime: 45,
    rating: 7.8,
    weight: 1.8,
    description: "[мок] Выкладываем красивую мозаику из плиток-азулежу.",
    categories: ["Abstract Strategy", "Renaissance"],
    mechanics: ["Pattern Building", "Tile Placement", "Drafting"],
    aliases: ["азул", "azul"],
    nameRu: "Азул",
  },
  {
    bggId: 148228,
    name: "Splendor",
    yearPublished: 2014,
    imageUrl: img("Splendor"),
    thumbnailUrl: img("Splendor"),
    minPlayers: 2,
    maxPlayers: 4,
    playingTime: 30,
    rating: 7.4,
    weight: 1.8,
    description: "[мок] Копим драгоценности и строим экономический движок.",
    categories: ["Card Game", "Economic", "Renaissance"],
    mechanics: ["Engine Building", "Set Collection"],
    aliases: ["великолепие", "splendor", "сплендор"],
    nameRu: "Великолепие",
  },
  {
    bggId: 167791,
    name: "Terraforming Mars",
    yearPublished: 2016,
    imageUrl: img("Terraforming Mars"),
    thumbnailUrl: img("Terraforming Mars"),
    minPlayers: 1,
    maxPlayers: 5,
    playingTime: 120,
    rating: 8.4,
    weight: 3.3,
    description: "[мок] Корпорациями преображаем Марс: вода, кислород, тепло.",
    categories: ["Economic", "Environmental", "Science Fiction"],
    mechanics: ["Engine Building", "Drafting", "Tile Placement"],
    aliases: ["покорение марса", "терраформирование марса", "terraforming mars", "марс"],
    nameRu: "Покорение Марса",
  },
  {
    bggId: 169786,
    name: "Scythe",
    yearPublished: 2016,
    imageUrl: img("Scythe"),
    thumbnailUrl: img("Scythe"),
    minPlayers: 1,
    maxPlayers: 5,
    playingTime: 115,
    rating: 8.2,
    weight: 3.4,
    description: "[мок] Альтернативные 1920-е: меха, ресурсы и контроль территорий.",
    categories: ["Economic", "Fighting", "Science Fiction"],
    mechanics: ["Area Control", "Engine Building", "Variable Player Powers"],
    aliases: ["серп", "scythe", "сайт"],
    nameRu: "Серп",
  },
  {
    bggId: 199792,
    name: "Everdell",
    yearPublished: 2018,
    imageUrl: img("Everdell"),
    thumbnailUrl: img("Everdell"),
    minPlayers: 1,
    maxPlayers: 4,
    playingTime: 80,
    rating: 8.0,
    weight: 2.8,
    description: "[мок] Зверушки строят город в уютном лесу Эверделл.",
    categories: ["Animals", "City Building", "Card Game"],
    mechanics: ["Worker Placement", "Engine Building"],
    aliases: ["эверделл", "everdell"],
    nameRu: "Эверделл",
  },
  {
    bggId: 162886,
    name: "Spirit Island",
    yearPublished: 2017,
    imageUrl: img("Spirit Island"),
    thumbnailUrl: img("Spirit Island"),
    minPlayers: 1,
    maxPlayers: 4,
    playingTime: 120,
    rating: 8.3,
    weight: 4.0,
    description: "[мок] Кооператив-наоборот: духи острова прогоняют колонизаторов.",
    categories: ["Fantasy", "Fighting", "Mythology"],
    mechanics: ["Cooperative Game", "Area Control", "Variable Player Powers"],
    aliases: ["дух острова", "духи острова", "spirit island"],
    nameRu: "Дух острова",
  },
  // --- Дополнения (демо для окна добавления). Базовые игры ссылаются на них
  // через поле expansions; здесь они существуют как самостоятельные thing, чтобы
  // их можно было добавить одним кликом. ---
  {
    bggId: 5404,
    name: "Carcassonne: Inns & Cathedrals",
    yearPublished: 2002,
    imageUrl: img("Inns & Cathedrals"),
    thumbnailUrl: img("Inns & Cathedrals"),
    minPlayers: 2,
    maxPlayers: 6,
    playingTime: 45,
    rating: 7.5,
    weight: 1.9,
    description: "[мок] Первое большое дополнение к Каркассону: трактиры и соборы.",
    categories: ["City Building", "Medieval"],
    mechanics: ["Tile Placement"],
    aliases: ["трактиры и соборы", "inns and cathedrals"],
    nameRu: "Каркассон: Трактиры и соборы",
    isExpansion: true,
  },
  {
    bggId: 5405,
    name: "Carcassonne: Traders & Builders",
    yearPublished: 2003,
    imageUrl: img("Traders & Builders"),
    thumbnailUrl: img("Traders & Builders"),
    minPlayers: 2,
    maxPlayers: 6,
    playingTime: 45,
    rating: 7.4,
    weight: 1.9,
    description: "[мок] Дополнение к Каркассону: торговцы, строители и товары.",
    categories: ["City Building", "Medieval"],
    mechanics: ["Tile Placement"],
    aliases: ["торговцы и строители", "traders and builders"],
    nameRu: "Каркассон: Торговцы и строители",
    isExpansion: true,
  },
  {
    bggId: 325,
    name: "Catan: Seafarers",
    yearPublished: 1997,
    imageUrl: img("Seafarers"),
    thumbnailUrl: img("Seafarers"),
    minPlayers: 3,
    maxPlayers: 4,
    playingTime: 120,
    rating: 7.2,
    weight: 2.4,
    description: "[мок] Дополнение к Колонизаторам: острова, корабли и открытия.",
    categories: ["Economic", "Negotiation"],
    mechanics: ["Dice Rolling", "Modular Board"],
    aliases: ["мореходы", "seafarers"],
    nameRu: "Колонизаторы: Мореходы",
    isExpansion: true,
  },
  {
    bggId: 926,
    name: "Catan: Cities & Knights",
    yearPublished: 1998,
    imageUrl: img("Cities & Knights"),
    thumbnailUrl: img("Cities & Knights"),
    minPlayers: 3,
    maxPlayers: 4,
    playingTime: 150,
    rating: 7.6,
    weight: 3.0,
    description: "[мок] Дополнение к Колонизаторам: города, рыцари и варвары.",
    categories: ["Economic", "Negotiation"],
    mechanics: ["Dice Rolling", "Modular Board"],
    aliases: ["города и рыцари", "cities and knights"],
    nameRu: "Колонизаторы: Города и рыцари",
    isExpansion: true,
  },
];
