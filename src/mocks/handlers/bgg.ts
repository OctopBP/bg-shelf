// MSW handlers for the BoardGameGeek XML API2. They return real XML built from
// the MOCK_GAMES dataset so the real fast-xml-parser path in lib/bgg.ts runs
// unchanged.
import { http, HttpResponse } from "msw";
import { MOCK_GAMES, type MockGame } from "@/lib/bgg.mock";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlResponse(body: string) {
  return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>${body}`);
}

/** Mirrors lib/bgg.mock matching: by name substring or shared alias. */
function matchGames(query: string): MockGame[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return MOCK_GAMES.filter(
    (g) =>
      g.name.toLowerCase().includes(q) ||
      g.aliases.some((a) => a.includes(q) || q.includes(a))
  );
}

function searchItemXml(g: MockGame): string {
  return (
    `<item type="boardgame" id="${g.bggId}">` +
    `<name type="primary" value="${xmlEscape(g.name)}"/>` +
    (g.yearPublished !== null
      ? `<yearpublished value="${g.yearPublished}"/>`
      : "") +
    `</item>`
  );
}

function thingItemXml(g: MockGame): string {
  const links = [
    ...g.categories.map(
      (c) => `<link type="boardgamecategory" value="${xmlEscape(c)}"/>`
    ),
    ...g.mechanics.map(
      (m) => `<link type="boardgamemechanic" value="${xmlEscape(m)}"/>`
    ),
  ].join("");

  return (
    `<item type="boardgame" id="${g.bggId}">` +
    (g.thumbnailUrl ? `<thumbnail>${xmlEscape(g.thumbnailUrl)}</thumbnail>` : "") +
    (g.imageUrl ? `<image>${xmlEscape(g.imageUrl)}</image>` : "") +
    `<name type="primary" sortindex="1" value="${xmlEscape(g.name)}"/>` +
    (g.nameRu
      ? `<name type="alternate" sortindex="1" value="${xmlEscape(g.nameRu)}"/>`
      : "") +
    (g.yearPublished !== null
      ? `<yearpublished value="${g.yearPublished}"/>`
      : "") +
    (g.minPlayers !== null ? `<minplayers value="${g.minPlayers}"/>` : "") +
    (g.maxPlayers !== null ? `<maxplayers value="${g.maxPlayers}"/>` : "") +
    (g.playingTime !== null ? `<playingtime value="${g.playingTime}"/>` : "") +
    (g.description ? `<description>${xmlEscape(g.description)}</description>` : "") +
    links +
    `<statistics page="1"><ratings>` +
    (g.rating !== null ? `<average value="${g.rating}"/>` : "") +
    (g.weight !== null ? `<averageweight value="${g.weight}"/>` : "") +
    `</ratings></statistics>` +
    `</item>`
  );
}

export const bggHandlers = [
  http.get("*/xmlapi2/search", ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? "";
    const items = matchGames(query).map(searchItemXml).join("");
    return xmlResponse(`<items total="${matchGames(query).length}">${items}</items>`);
  }),

  http.get("*/xmlapi2/thing", ({ request }) => {
    const url = new URL(request.url);
    // BGG accepts a comma-separated list of ids; the app only ever asks for one.
    const ids = (url.searchParams.get("id") ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
    const items = MOCK_GAMES.filter((g) => ids.includes(g.bggId))
      .map(thingItemXml)
      .join("");
    return xmlResponse(`<items>${items}</items>`);
  }),
];
