const getBrowserAPI = () => {
  return typeof chrome !== 'undefined' ? chrome : browser;
};

const CACHE_EXPIRATION = 30 * 24 * 60 * 60 * 1000;
const API_DELAY = 1000;
const MAX_RETRIES = 3;

let lastApiCall = 0;
async function rateLimitedFetch(url, retryCount = 0) {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;

  if (timeSinceLastCall < API_DELAY) {
    await new Promise(resolve => setTimeout(resolve, API_DELAY - timeSinceLastCall));
  }

  try {
    lastApiCall = Date.now();

    const response = await fetch(url);

    if (response.status === 429 && retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * API_DELAY));
      return rateLimitedFetch(url, retryCount + 1);
    }

    return response;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * API_DELAY));
      return rateLimitedFetch(url, retryCount + 1);
    }
    throw error;
  }
}

async function fetchGameDetails(gameId) {
  const storeUrl = `https://store.steampowered.com/api/appdetails?appids=${gameId}&cc=US&l=english`;

  const storeResponse = await rateLimitedFetch(storeUrl);

  if (!storeResponse.ok) {
    console.error("Store API error:", storeResponse.status, storeResponse.statusText);
    throw new Error(`Store API failed: ${storeResponse.status}`);
  }

  const storeData = await storeResponse.json();

  if (!storeData[gameId]?.success) {
    throw new Error("Store data unavailable");
  }

  return storeData[gameId].data;
}

async function fetchReviews(gameId) {
  const reviewsUrl = `https://store.steampowered.com/appreviews/${gameId}?json=1&language=all&purchase_type=all&num_per_page=0&filter=all`;
  const reviewsResponse = await rateLimitedFetch(reviewsUrl);

  if (!reviewsResponse.ok) {
    throw new Error("Reviews API failed");
  }

  const reviewData = await reviewsResponse.json();
  if (!reviewData.success || !reviewData.query_summary) {
    throw new Error("Review data unavailable");
  }

  return reviewData.query_summary;
}

async function enrichGameWithReviews(game) {
  try {
    const details = await fetchGameDetails(game.id);

    if (details.release_date?.coming_soon) {
      game.reviewText = "Coming Soon";
      return game;
    }

    const reviewSummary = await fetchReviews(game.id);
    const { total_positive, total_reviews, review_score_desc } = reviewSummary;
    game.reviews = total_reviews;

    if (total_reviews > 0) {
      game.reviewScore = Math.round((total_positive / total_reviews) * 100);
      game.reviewText = review_score_desc;
    } else {
      game.reviewText = "No Reviews Yet";
    }

    return game;
  } catch (err) {
    console.error("Error fetching reviews:", err.message);
    game.reviewText = err.message;
    return game;
  }
}

getBrowserAPI().runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);

  if (request.action === "searchGame") {
    console.log("Starting Steam search for:", request.gameName);

    searchSteam(request.gameName)
      .then(async result => {
        if (result?.id) {
          result = await enrichGameWithReviews(result);
        }
        console.log("Final result for:", request.gameName, result);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error("Steam search error:", error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

function findBestMatch(gameName, results) {
  if (!results || results.length === 0) return null;

  console.log("Finding match for:", gameName);

  const normalizedSearchName = gameName.toLowerCase()
    .replace(/\s*[–—-]+\s*-*\s*[\d.]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  console.log("Normalized search name:", normalizedSearchName);

  const exactMatch = results.find(game =>
    game.name.toLowerCase() === normalizedSearchName
  );
  if (exactMatch) {
    console.log("Found exact match:", exactMatch.name);
    return exactMatch;
  }

  const commonModifiers = [
    "goty", "game of the year", "complete", "definitive", "edition",
    "remastered", "enhanced", "collection", "anniversary", "ultimate",
    "deluxe", "standard", "gold", "platinum", "special", "extended"
  ];

  const strippedSearchName = commonModifiers.reduce(
    (name, modifier) => name.replace(new RegExp(`\\b${modifier}\\b`, "i"), ""),
    normalizedSearchName
  ).trim();

  let baseSearchName = normalizedSearchName;
  if (baseSearchName.includes(":")) {
    baseSearchName = baseSearchName.split(":")[0].trim();
  } else if (baseSearchName.includes("–")) {
    baseSearchName = baseSearchName.split("–")[0].trim();
  } else if (baseSearchName.includes("-")) {
    baseSearchName = baseSearchName.replace(/\s+-\s+.*$/, "").trim();
  }

  console.log("Base search name:", baseSearchName);

  const baseNameMatch = results.find(game =>
    game.name.toLowerCase() === baseSearchName
  );

  if (baseNameMatch) {
    console.log("Found base name match:", baseNameMatch.name);
    return baseNameMatch;
  }

  const strippedMatch = results.find(game => {
    const strippedGameName = commonModifiers.reduce(
      (name, modifier) => name.replace(new RegExp(`\\b${modifier}\\b`, "i"), ""),
      game.name.toLowerCase()
    ).trim();

    return strippedGameName === strippedSearchName ||
      strippedGameName === baseSearchName;
  });

  if (strippedMatch) {
    console.log("Found stripped match:", strippedMatch.name);
    return strippedMatch;
  }

  const simplifiedSearchName = normalizedSearchName.replace(/[^a-z0-9\s]/g, "").trim();
  const baseSimplifiedName = baseSearchName.replace(/[^a-z0-9\s]/g, "").trim();

  console.log("Simplified search name:", simplifiedSearchName);
  console.log("Simplified base name:", baseSimplifiedName);

  const partialMatch = results.find(game => {
    const simplifiedGameName = game.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    if (simplifiedGameName.includes(simplifiedSearchName) ||
      simplifiedGameName.includes(baseSimplifiedName) ||
      simplifiedSearchName.includes(simplifiedGameName) ||
      baseSimplifiedName.includes(simplifiedGameName)) {
      console.log("Found partial match via inclusion:", game.name);
      return true;
    }

    const searchWords = (simplifiedSearchName.length <= baseSimplifiedName.length ?
      simplifiedSearchName : baseSimplifiedName).split(/\s+/);
    const gameWords = simplifiedGameName.split(/\s+/);

    const matchingWords = searchWords.filter(word =>
      word.length > 2 && gameWords.includes(word)
    ).length;

    if (searchWords.length === 0) return false;

    const matchPercentage = matchingWords / searchWords.length;

    if (matchPercentage >= 0.6) {
      console.log("Found partial match via words:", game.name, "matching", matchPercentage);
      return true;
    }

    return false;
  });

  if (partialMatch) return partialMatch;

  const firstFewWords = baseSearchName.split(/\s+/).slice(0, 3).join(" ");

  if (firstFewWords.length > 3 && firstFewWords !== baseSearchName) {
    console.log("Trying with first few words:", firstFewWords);

    const firstWordsMatch = results.find(game => {
      const gameName = game.name.toLowerCase();
      return gameName.includes(firstFewWords) || firstFewWords.includes(gameName);
    });

    if (firstWordsMatch) {
      console.log("Found match using first few words:", firstWordsMatch.name);
      return firstWordsMatch;
    }
  }

  const firstResult = results[0];
  const firstResultName = firstResult.name.toLowerCase();

  const firstResultSimplified = firstResultName.replace(/[^a-z0-9\s]/g, "").trim();
  const searchWordsSet = new Set(simplifiedSearchName.split(/\s+/).filter(w => w.length > 2));
  const resultWordsSet = new Set(firstResultSimplified.split(/\s+/).filter(w => w.length > 2));

  const intersection = [...searchWordsSet].filter(x => resultWordsSet.has(x));

  if (intersection.length > 0) {
    console.log("Using first result with word overlap:", firstResult.name);
    return firstResult;
  }

  console.log("No reasonable match found");
  return null;
}

async function searchSteam(gameName) {
  console.log("Received game name:", gameName);

  const cacheKey = `game:${gameName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  console.log("Using cache key:", cacheKey);

  const cached = await getCachedGame(cacheKey);
  if (cached) return cached;

  let data = await trySearch(gameName);

  if ((!data || !data.items || data.items.length === 0) &&
    (gameName.includes("–") || gameName.includes(" - "))) {
    let baseName = gameName;

    if (gameName.includes("–")) {
      baseName = gameName.split("–")[0].trim();
    } else if (gameName.includes(" - ")) {
      baseName = gameName.split(" - ")[0].trim();
    }

    console.log("No results with full name, trying base name:", baseName);
    data = await trySearch(baseName);
  }

  if ((!data || !data.items || data.items.length === 0) && gameName.includes(":")) {
    const baseName = gameName.split(":")[0].trim();
    console.log("No results, trying name before colon:", baseName);
    data = await trySearch(baseName);
  }

  if (!data || !data.items || data.items.length === 0) {
    console.log("No results found for any search attempt");
    await cacheResult(cacheKey, null);
    return null;
  }

  const games = data.items.filter(item => {
    const name = item.name.toLowerCase();
    return item.type === "app" &&
      !(name.endsWith(" demo") ||
        name === "demo" ||
        name.startsWith("demo ") ||
        name.endsWith(" soundtrack") ||
        name.endsWith(" dlc") ||
        name.endsWith(" art book"));
  });

  if (games.length === 0) {
    console.log("No valid games after filtering");
    await cacheResult(cacheKey, null);
    return null;
  }

  const matchedGame = findBestMatch(gameName, games);
  if (!matchedGame) {
    console.log("No match found after best match search");
    await cacheResult(cacheKey, null);
    return null;
  }

  const gameData = {
    id: matchedGame.id,
    name: matchedGame.name,
    price: matchedGame.price
  };

  try {
    const enrichedGame = await enrichGameWithReviews(gameData);
    await cacheResult(cacheKey, enrichedGame);
    return enrichedGame;
  } catch (error) {
    console.error("Review fetch error:", error.message);
    gameData.reviewText = "Error fetching reviews";
    await cacheResult(cacheKey, gameData);
    return gameData;
  }
}

async function trySearch(searchTerm) {
  const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(searchTerm)}&l=english&cc=US`;
  console.log("Searching Steam for:", searchTerm);
  console.log("Search URL:", searchUrl);

  try {
    const response = await rateLimitedFetch(searchUrl);
    if (!response.ok) {
      console.error("Steam API error:", response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Search failed:", error.message);
    return null;
  }
}

async function getCachedGame(key) {
  return new Promise(resolve => {
    getBrowserAPI().storage.local.get([key], result => {
      if (!result[key]) {
        resolve(null);
        return;
      }

      const entry = result[key];

      if (Date.now() - entry.timestamp > CACHE_EXPIRATION) {
        getBrowserAPI().storage.local.remove([key]);
        resolve(null);
        return;
      }

      resolve(entry.data);
    });
  });
}

async function cacheResult(key, data) {
  return new Promise(resolve => {
    const entry = {
      data,
      timestamp: Date.now()
    };

    getBrowserAPI().storage.local.set({ [key]: entry }, () => {
      cleanupOldCache();
      resolve();
    });
  });
}

async function cleanupOldCache() {
  getBrowserAPI().storage.local.get(null, (items) => {
    const now = Date.now();
    const keysToRemove = [];
    
    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith('game:') && value.timestamp) {
        if (now - value.timestamp > CACHE_EXPIRATION) {
          keysToRemove.push(key);
        }
      }
    }
    
    if (keysToRemove.length > 0) {
      getBrowserAPI().storage.local.remove(keysToRemove);
    }
  });
}