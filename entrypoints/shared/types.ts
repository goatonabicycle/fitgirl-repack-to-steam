export interface DisplayOptions {
  showPrice: boolean;
  showReviews: boolean;
  showReleaseDate: boolean;
  showSteamDb: boolean;
  showMetacritic: boolean;
  openInSteamClient: boolean;
}

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  showPrice: true,
  showReviews: true,
  showReleaseDate: true,
  showSteamDb: true,
  showMetacritic: true,
  openInSteamClient: true,
};

export interface GameData {
  id: number;
  name: string;
  price?: { final: number; initial?: number; currency?: string };
  reviews?: number;
  reviewScore?: number;
  reviewText?: string;
  releaseDate?: string;
  metacritic?: number;
  isFree?: boolean;
}

// Storage keys
export const STORAGE_KEYS = {
  DISPLAY_OPTIONS: "displayOptions",
  GAME_PREFIX: "game:",
} as const;

// Message actions
export const MESSAGE_ACTIONS = {
  SEARCH_GAME: "searchGame",
} as const;

export interface SearchGameMessage {
  action: typeof MESSAGE_ACTIONS.SEARCH_GAME;
  gameName: string;
  fast?: boolean;
}

export interface SearchGameResponse {
  success: boolean;
  result?: GameData | null;
  error?: string;
}
