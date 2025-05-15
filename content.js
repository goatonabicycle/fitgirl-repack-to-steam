function extractGameName(text) {
  const cleaningPatterns = [
    /[\[\(]?repack[\]\)]?/i,
    /[\[\(]?fitgirl[\]\)]?/i,
    /[\[\(]?multi\d+[\]\)]?/i,
    /-\s*free\s*download/i,
    /\+\s*all\s*dlcs?/i,
    /v\d+\.\d+(\.\d+)?/i,
    /:\s*Supporter Edition/i,
    /:\s*Deluxe Edition/i,
    /\s*Digital\s+Collectors?\s+Edition/i,
    /\s*–\s*[^-]+$/,
    /\s*\+\s*\d+\s*DLCs?.*$/i,
    /\s*Build\s+\d+.*$/i
  ];

  let cleanedName = text;
  for (const pattern of cleaningPatterns) {
    cleanedName = cleanedName.replace(pattern, "");
  }

  cleanedName = cleanedName.replace(/\s+/g, " ");

  return cleanedName.trim();
}

function createSteamCard(result, gameName) {
  if (result) {
    const steamLink = document.createElement("a");
    steamLink.href = `https://store.steampowered.com/app/${result.id}`;
    steamLink.className = "steam-card";
    steamLink.dataset.processing = "true";
    steamLink.target = "_blank";

    const price = result.price?.final ?
      `$${(result.price.final / 100).toFixed(2)}` : "Not available";

    const priceHTML = price !== "Not available"
      ? `<span class="steam-card-separator">•</span>
         <span class="steam-card-price">${price}</span>`
      : "";

    const reviewStatus = result.reviewText || "";
    const reviewHTML = reviewStatus
      ? `<span class="steam-card-separator">•</span>
         <span class="steam-card-review steam-card-review-${reviewStatus.toLowerCase().replace(" ", "-")}">${reviewStatus}</span>`
      : "";

    steamLink.innerHTML = `<span class="steam-card-text">View on Steam</span>
      ${priceHTML}
      ${reviewHTML}
    `;

    return steamLink;
  }

  const notFoundCard = document.createElement("div");
  notFoundCard.className = "steam-card";
  notFoundCard.dataset.processing = "true";
  notFoundCard.innerHTML = `<span class="steam-card-text not-found">Not found on Steam: "${gameName}"</span>`;
  return notFoundCard;
}

function replaceLoadingWithElement(parentElement, newElement) {
  const loadingEl = parentElement.querySelector(".steam-card-loading");

  if (loadingEl) {
    parentElement.insertBefore(newElement, loadingEl);
    loadingEl.remove();
  } else {
    const firstChild = parentElement.firstChild;
    parentElement.insertBefore(newElement, firstChild ? firstChild.nextSibling : null);
  }
}

async function processElement(element) {
  const text = element.textContent.trim();

  const skipConditions = [
    text.length < 4,
    !text.match(/[a-zA-Z]/),
    text.includes("Comment"),
    text.includes("Search"),
    text.includes("Category"),
    text.toLowerCase().includes("download"),
    text.toLowerCase().includes("installation"),
    text.toLowerCase().includes("updates digest"),
    text.toLowerCase().includes("updated"),
    text.toLowerCase().includes("upcoming repacks")
  ];

  if (skipConditions.some(condition => condition)) {
    return;
  }

  const parent = element.parentNode;
  const siblings = Array.from(parent.children);

  const alreadyProcessed = siblings.some(sibling =>
    sibling.classList.contains("steam-card") ||
    sibling.classList.contains("steam-card-loading") ||
    sibling.dataset.processing === "true"
  );

  if (alreadyProcessed) {
    return;
  }

  const articleEl = parent.closest("article");
  if (articleEl) {
    const existingCards = articleEl.querySelectorAll(".steam-card, .steam-card-loading");
    if (existingCards.length > 0) {
      return;
    }
  }

  for (const loader of siblings.filter(sibling => sibling.classList.contains("steam-card-loading"))) {
    loader.remove();
  }

  const loadingId = `loading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const loadingEl = document.createElement("div");
  loadingEl.id = loadingId;
  loadingEl.className = "steam-card-loading";
  loadingEl.dataset.processing = "true";
  loadingEl.textContent = "Loading Steam info...";
  element.parentNode.insertBefore(loadingEl, element.nextSibling);

  const gameName = extractGameName(element.textContent.trim());

  try {
    const response = await chrome.runtime.sendMessage({ action: "searchGame", gameName });

    const card = createSteamCard(response?.success ? response.result : null, gameName);
    replaceLoadingWithElement(element.parentNode, card);
  } catch (error) {
    console.error("Failed to process game:", gameName, error);

    const errorCard = document.createElement("div");
    errorCard.className = "steam-card";
    errorCard.dataset.processing = "true";
    errorCard.innerHTML = `<span class="steam-card-text not-found">Error finding "${gameName}" on Steam</span>`;

    replaceLoadingWithElement(element.parentNode, errorCard);
  }
}

function findAndProcessGames() {
  const mainTitles = document.querySelectorAll(".entry-title > a:first-of-type:not(:has(~ .steam-card)):not(.steam-card-skipped)");
  const detailTitle = document.querySelector("article.type-post > .entry-header .entry-title:not(:has(~ .steam-card))");

  const observer = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        processElement(entry.target);
        observer.unobserve(entry.target);
      }
    }
  }, {
    rootMargin: "2000px",
    threshold: 0.1
  });

  for (const title of mainTitles) {
    observer.observe(title);
  }

  if (detailTitle) {
    processElement(detailTitle);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", findAndProcessGames);
} else {
  findAndProcessGames();
}