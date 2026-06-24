// Типы зеркалят JSON из /api/command (kind: "proposal"). Держим их здесь,
// как и PhotoInput держит свои — чтобы не тянуть серверный lib в клиентский бандл.
export interface ResolvedCandidate {
  bggId: number;
  name: string;
  yearPublished: number | null;
  isExpansion: boolean;
}

export interface ResolvedExpansion {
  bggId: number;
  name: string;
  thumbnailUrl: string | null;
}

export interface ResolvedGame {
  requestedAs: string;
  searchQuery: string;
  tags: string[];
  candidates: ResolvedCandidate[];
  thumbnailUrl: string | null;
  expansions: ResolvedExpansion[];
  notFound: boolean;
}

/** Подгружённые с BGG данные конкретного кандидата (по bggId). */
export interface CandidateDetails {
  name: string;
  yearPublished: number | null;
  thumbnailUrl: string | null;
  expansions: ResolvedExpansion[];
  loading?: boolean;
}

/** Состояние выбора по одной предложенной игре. */
export interface GameState {
  enabled: boolean;
  selectedBggId: number | null;
  tags: string[];
  tagDraft: string;
  /** bggId выбранных для добавления дополнений. */
  chosenExpansions: Set<number>;
}
