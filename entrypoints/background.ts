import {
  type GameData,
  type SearchGameMessage,
  type CacheEntry,
  STORAGE_KEYS,
  MESSAGE_ACTIONS,
} from "./shared/types";

export default defineBackground(() => {
  const CACHE_EXPIRATION = 5 * 24 * 60 * 60 * 1000; // 5 days
  // A failed search can mean Steam was down or blocking us, so try those again sooner.
  const NOT_FOUND_EXPIRATION = 5 * 60 * 60 * 1000; // 5 hours
  const API_DELAY = 500;
  const MAX_RETRIES = 3;

  let lastApiCall = 0;
  let cacheCleanedThisSession = false;

  // Steam lookups run one at a time. Without this, a page full of titles fires them all at once.
  // Card lookups run first. Inline lookups are the "upcoming" links, which are a bonus.
  const cardLookups: (() => Promise<void>)[] = [];
  const inlineLookups: (() => Promise<void>)[] = [];
  let lookupRunning = false;

  function queueLookup<T>(inline: boolean, lookup: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const queue = inline ? inlineLookups : cardLookups;
      queue.push(() => lookup().then(resolve, reject));
      runLookups();
    });
  }

  async function runLookups() {
    if (lookupRunning) return;
    lookupRunning = true;

    while (cardLookups.length > 0 || inlineLookups.length > 0) {
      const next = cardLookups.shift() ?? inlineLookups.shift();
      await next?.();
    }

    lookupRunning = false;
  }

  async function rateLimitedFetch(
    url: string,
    retryCount = 0
  ): Promise<Response> {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;

    if (timeSinceLastCall < API_DELAY) {
      await new Promise((resolve) =>
        setTimeout(resolve, API_DELAY - timeSinceLastCall)
      );
    }

    try {
      lastApiCall = Date.now();
      // Lookups run one at a time, so a request that never answers would block all of them.
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (response.status === 429 && retryCount < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, (retryCount + 1) * API_DELAY)
        );
        return rateLimitedFetch(url, retryCount + 1);
      }

      return response;
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, (retryCount + 1) * API_DELAY)
        );
        return rateLimitedFetch(url, retryCount + 1);
      }
      throw error;
    }
  }

  async function fetchGameDetails(gameId: number) {
    const storeUrl = `https://store.steampowered.com/api/appdetails?appids=${gameId}&l=english`;
    const storeResponse = await rateLimitedFetch(storeUrl);

    if (!storeResponse.ok) {
      throw new Error(`Store API failed: ${storeResponse.status}`);
    }

    const storeData = await storeResponse.json();

    if (!storeData[gameId]?.success) {
      throw new Error("Store data unavailable");
    }

    return storeData[gameId].data;
  }

  async function enrichGameWithReviews(game: GameData): Promise<GameData> {
    // languages=all is silently ignored and returns English only. It must be languages[0]. purchase_type 1 = all.
    const reviewsUrl = `https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?appid=${game.id}&languages%5B0%5D=all&purchase_type=1&num_per_page=1`;
    // Reviews come from a different host than the store details, so both requests go out together.
    const [details, reviewsResponse] = await Promise.all([
      fetchGameDetails(game.id),
      rateLimitedFetch(reviewsUrl),
    ]);

    if (details.release_date?.coming_soon) {
      game.reviewText = "Coming Soon";
      return game;
    }

    if (details.release_date?.date) {
      game.releaseDate = details.release_date.date;
    }

    if (details.metacritic?.score) {
      game.metacritic = details.metacritic.score;
    }

    if (details.is_free) {
      game.isFree = true;
    }

    if (details.price_overview) {
      game.price = {
        final: details.price_overview.final,
        initial: details.price_overview.initial,
        currency: details.price_overview.currency,
      };
    }

    if (reviewsResponse.ok) {
      const reviewData = await reviewsResponse.json();
      if (reviewData.response?.query_summary) {
        const summary = reviewData.response.query_summary;
        game.reviews = summary.total_reviews;
        game.reviewScore =
          summary.total_reviews > 0
            ? Math.round(
                (summary.total_positive / summary.total_reviews) * 100
              )
            : 0;
        game.reviewText = summary.review_score_desc || "No user reviews";
      }
    }

    if (!game.reviewText) {
      game.reviewText = "No user reviews";
    }

    return game;
  }

  interface SteamSearchResult {
    id: number;
    name: string;
    type: string;
    price?: { final: number };
  }

  function findBestMatch(
    gameName: string,
    results: SteamSearchResult[]
  ): SteamSearchResult | null {
    if (!results || results.length === 0) return null;

    const normalizedSearchName = gameName
      .toLowerCase()
      .replace(/\s*[–—-]+\s*-*\s*[\d.]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const exactMatch = results.find(
      (game) => game.name.toLowerCase() === normalizedSearchName
    );
    if (exactMatch) {
      return exactMatch;
    }

    const commonModifiers = [
      "goty",
      "game of the year",
      "complete",
      "definitive",
      "edition",
      "remastered",
      "enhanced",
      "collection",
      "anniversary",
      "ultimate",
      "deluxe",
      "standard",
      "gold",
      "platinum",
      "special",
      "extended",
    ];

    const strippedSearchName = commonModifiers
      .reduce(
        (name, modifier) =>
          name.replace(new RegExp(`\\b${modifier}\\b`, "i"), ""),
        normalizedSearchName
      )
      .trim();

    let baseSearchName = normalizedSearchName;
    if (baseSearchName.includes(":")) {
      baseSearchName = baseSearchName.split(":")[0].trim();
    } else if (baseSearchName.includes("–")) {
      baseSearchName = baseSearchName.split("–")[0].trim();
    } else if (baseSearchName.includes("-")) {
      baseSearchName = baseSearchName.replace(/\s+-\s+.*$/, "").trim();
    }

    const baseNameMatch = results.find(
      (game) => game.name.toLowerCase() === baseSearchName
    );

    if (baseNameMatch) {
      return baseNameMatch;
    }

    const strippedMatch = results.find((game) => {
      const strippedGameName = commonModifiers
        .reduce(
          (name, modifier) =>
            name.replace(new RegExp(`\\b${modifier}\\b`, "i"), ""),
          game.name.toLowerCase()
        )
        .trim();

      return (
        strippedGameName === strippedSearchName ||
        strippedGameName === baseSearchName
      );
    });

    if (strippedMatch) {
      return strippedMatch;
    }

    const simplifiedSearchName = normalizedSearchName
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
    const baseSimplifiedName = baseSearchName
      .replace(/[^a-z0-9\s]/g, "")
      .trim();

    const partialMatch = results.find((game) => {
      const simplifiedGameName = game.name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .trim();

      if (
        simplifiedGameName.includes(simplifiedSearchName) ||
        simplifiedGameName.includes(baseSimplifiedName) ||
        simplifiedSearchName.includes(simplifiedGameName) ||
        baseSimplifiedName.includes(simplifiedGameName)
      ) {
        return true;
      }

      const searchWords = (
        simplifiedSearchName.length <= baseSimplifiedName.length
          ? simplifiedSearchName
          : baseSimplifiedName
      ).split(/\s+/);
      const gameWords = simplifiedGameName.split(/\s+/);

      const matchingWords = searchWords.filter(
        (word) => word.length > 2 && gameWords.includes(word)
      ).length;

      if (searchWords.length === 0) return false;

      const matchPercentage = matchingWords / searchWords.length;

      return matchPercentage >= 0.6;
    });

    if (partialMatch) return partialMatch;

    const firstFewWords = baseSearchName.split(/\s+/).slice(0, 3).join(" ");

    if (firstFewWords.length > 3 && firstFewWords !== baseSearchName) {
      const firstWordsMatch = results.find((game) => {
        const gName = game.name.toLowerCase();
        return gName.includes(firstFewWords) || firstFewWords.includes(gName);
      });

      if (firstWordsMatch) {
        return firstWordsMatch;
      }
    }

    const firstResult = results[0];
    const firstResultName = firstResult.name.toLowerCase();

    const firstResultSimplified = firstResultName
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
    const searchWordsSet = new Set(
      simplifiedSearchName.split(/\s+/).filter((w) => w.length > 2)
    );
    const resultWordsSet = new Set(
      firstResultSimplified.split(/\s+/).filter((w) => w.length > 2)
    );

    const intersection = [...searchWordsSet].filter((x) =>
      resultWordsSet.has(x)
    );

    if (intersection.length > 0) {
      return firstResult;
    }

    return null;
  }

  async function trySearch(searchTerm: string) {
    const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(
      searchTerm
    )}&l=english&cc=US`;

    try {
      const response = await rateLimitedFetch(searchUrl);
      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  async function getCachedGame(
    key: string
  ): Promise<{ data: GameData | null } | null> {
    const result = await browser.storage.local.get([key]);
    if (!result[key]) {
      return null;
    }

    const entry = result[key] as CacheEntry;
    const expiration = entry.data ? CACHE_EXPIRATION : NOT_FOUND_EXPIRATION;

    if (Date.now() - entry.timestamp > expiration) {
      await browser.storage.local.remove([key]);
      return null;
    }

    return { data: entry.data };
  }

  async function cacheResult(key: string, data: GameData | null) {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
    };

    await browser.storage.local.set({ [key]: entry });
    cleanupOldCache();
  }

  async function cleanupOldCache() {
    if (cacheCleanedThisSession) return;
    cacheCleanedThisSession = true;

    const items = await browser.storage.local.get(null);
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, value] of Object.entries(items)) {
      const entry = value as CacheEntry;
      if (key.startsWith(STORAGE_KEYS.GAME_PREFIX) && entry.timestamp) {
        if (now - entry.timestamp > CACHE_EXPIRATION) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await browser.storage.local.remove(keysToRemove);
    }
  }

  async function searchSteam(
    gameName: string,
    fast = false
  ): Promise<GameData | null> {
    const cacheKey = `${STORAGE_KEYS.GAME_PREFIX}${gameName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")}`;

    const cached = await getCachedGame(cacheKey);
    if (cached) {
      return cached.data;
    }

    return queueLookup(fast, () => lookUpSteam(gameName, cacheKey));
  }

  async function lookUpSteam(
    gameName: string,
    cacheKey: string
  ): Promise<GameData | null> {
    let data = await trySearch(gameName);

    if (
      (!data || !data.items || data.items.length === 0) &&
      (gameName.includes("–") || gameName.includes(" - "))
    ) {
      let baseName = gameName;

      if (gameName.includes("–")) {
        baseName = gameName.split("–")[0].trim();
      } else if (gameName.includes(" - ")) {
        baseName = gameName.split(" - ")[0].trim();
      }

      data = await trySearch(baseName);
    }

    if (
      (!data || !data.items || data.items.length === 0) &&
      gameName.includes(":")
    ) {
      const baseName = gameName.split(":")[0].trim();
      data = await trySearch(baseName);
    }

    if (!data || !data.items || data.items.length === 0) {
      await cacheResult(cacheKey, null);
      return null;
    }

    const games = data.items.filter((item: SteamSearchResult) => {
      const name = item.name.toLowerCase();
      return (
        item.type === "app" &&
        !(
          name.endsWith(" demo") ||
          name === "demo" ||
          name.startsWith("demo ") ||
          name.endsWith(" soundtrack") ||
          name.endsWith(" dlc") ||
          name.endsWith(" art book")
        )
      );
    });

    if (games.length === 0) {
      await cacheResult(cacheKey, null);
      return null;
    }

    const matchedGame = findBestMatch(gameName, games);
    if (!matchedGame) {
      await cacheResult(cacheKey, null);
      return null;
    }

    const gameData: GameData = {
      id: matchedGame.id,
      name: matchedGame.name,
      price: matchedGame.price,
    };

    try {
      const enrichedGame = await enrichGameWithReviews(gameData);
      await cacheResult(cacheKey, enrichedGame);
      return enrichedGame;
    } catch {
      gameData.reviewText = "Error fetching reviews";
      return gameData;
    }
  }

  // Drop cached lookups on update so results cached by an older version are refetched.
  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason !== "update") return;

    const items = await browser.storage.local.get(null);
    const gameKeys = Object.keys(items).filter((key) =>
      key.startsWith(STORAGE_KEYS.GAME_PREFIX)
    );

    await browser.storage.local.remove(gameKeys);
  });

  browser.runtime.onMessage.addListener(
    (request: SearchGameMessage, _sender, sendResponse) => {
      if (request.action === MESSAGE_ACTIONS.SEARCH_GAME) {
        searchSteam(request.gameName, request.fast || false)
          .then((result) => {
            sendResponse({ success: true, result });
          })
          .catch((error) => {
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
    }
  );
});
