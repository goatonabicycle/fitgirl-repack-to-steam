import "./steam-card.css";
import {
  type DisplayOptions,
  type GameData,
  type SearchGameResponse,
  DEFAULT_DISPLAY_OPTIONS,
  STORAGE_KEYS,
  MESSAGE_ACTIONS,
} from "./shared/types";

export default defineContentScript({
  matches: ["*://*.fitgirl-repacks.site/*"],
  runAt: "document_start",

  main() {
    let options: DisplayOptions = { ...DEFAULT_DISPLAY_OPTIONS };

    async function loadOptions() {
      const result = await browser.storage.local.get(STORAGE_KEYS.DISPLAY_OPTIONS);
      const stored = result[STORAGE_KEYS.DISPLAY_OPTIONS] as Partial<DisplayOptions> | undefined;
      options = { ...DEFAULT_DISPLAY_OPTIONS, ...stored };
    }

    // Load options immediately
    loadOptions();
    function extractGameName(text: string): string {
      let cleanedName = text;

      const cleaningPatterns = [
        /[\[\(]?repack[\]\)]?/i,
        /[\[\(]?fitgirl[\]\)]?/i,
        /[\[\(]?multi\d+[\]\)]?/i,
        /-\s*free\s*download/i,
        /:\s*Supporter Edition/i,
        /:\s*Deluxe Edition/i,
        /\s*Digital\s+Collectors?\s+Edition/i,
      ];

      for (const pattern of cleaningPatterns) {
        cleanedName = cleanedName.replace(pattern, "");
      }

      cleanedName = cleanedName.replace(/\s+\+\s+.*$/i, "");
      cleanedName = cleanedName.replace(/\s+\/\s+.*$/i, "");
      cleanedName = cleanedName.replace(/[,\s]+v\d+[\d.]*.*$/i, "");
      cleanedName = cleanedName.replace(/\s*–\s*v?\d.*$/i, "");
      cleanedName = cleanedName.replace(/\s*–\s*[^–]+$/i, "");
      cleanedName = cleanedName.replace(/\s*\([^)]*\)/g, "");
      cleanedName = cleanedName.replace(/[,;:\s]+$/g, "");
      cleanedName = cleanedName.replace(/\s+/g, " ");

      return cleanedName.trim();
    }

    function getReviewClass(reviewText: string): string {
      return `steam-card-review-${reviewText
        .toLowerCase()
        .replace(/\s+/g, "-")}`;
    }

    function getMetacriticClass(score: number): string {
      if (score >= 75) return "steam-card-metacritic-good";
      if (score >= 50) return "steam-card-metacritic-mixed";
      return "steam-card-metacritic-bad";
    }

    function createInlineSteamLink(result: GameData | null): HTMLElement {
      if (result) {
        const link = document.createElement("a");
        link.href = options.openInSteamClient
          ? `steam://store/${result.id}`
          : `https://store.steampowered.com/app/${result.id}`;
        link.className = "steam-inline-link";
        if (!options.openInSteamClient) {
          link.target = "_blank";
          link.rel = "noopener";
        }

        const parts: string[] = [];
        if (result.reviewText && result.reviewText !== "No user reviews") {
          parts.push(result.reviewText);
        }
        if (result.price?.final) {
          const currency = result.price.currency || "USD";
          const price = new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: currency,
            maximumFractionDigits: 0,
          }).format(result.price.final / 100);
          parts.push(price);
        } else if (result.isFree) {
          parts.push("Free");
        }

        link.textContent = parts.length > 0 ? parts.join(" / ") : "Steam";
        link.title = `View ${result.name} on Steam`;
        return link;
      }

      const notFound = document.createElement("span");
      notFound.className = "steam-inline-not-found";
      notFound.textContent = "?";
      return notFound;
    }

    function createSteamCard(result: GameData | null): HTMLElement {
      if (result) {
        const steamLink = document.createElement("a");
        steamLink.href = options.openInSteamClient
          ? `steam://store/${result.id}`
          : `https://store.steampowered.com/app/${result.id}`;
        steamLink.className = "steam-card";
        steamLink.dataset.processing = "true";
        if (!options.openInSteamClient) {
          steamLink.target = "_blank";
          steamLink.rel = "noopener";
        }

        const createSpan = (className: string, text: string) => {
          const span = document.createElement("span");
          span.className = className;
          span.textContent = text;
          return span;
        };

        const addSeparator = () => steamLink.appendChild(createSpan("steam-card-separator", "•"));

        steamLink.appendChild(createSpan("steam-card-text", "View on Steam"));

        if (options.showPrice) {
          if (result.isFree) {
            addSeparator();
            steamLink.appendChild(createSpan("steam-card-free", "FREE"));
          } else if (result.price?.final) {
            const currency = result.price.currency || "USD";
            const formatPrice = (cents: number) =>
              new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: currency,
              }).format(cents / 100);

            const finalPrice = formatPrice(result.price.final);
            const initialPrice = result.price.initial
              ? formatPrice(result.price.initial)
              : null;
            const isOnSale =
              initialPrice && result.price.initial > result.price.final;

            addSeparator();
            if (isOnSale) {
              const discount = Math.round(
                (1 - result.price.final / result.price.initial) * 100
              );
              steamLink.appendChild(createSpan("steam-card-discount", `-${discount}%`));
              steamLink.appendChild(createSpan("steam-card-price-original", initialPrice));
            }
            steamLink.appendChild(createSpan("steam-card-price", finalPrice));
          }
        }

        if (options.showReviews && result.reviewText) {
          addSeparator();
          steamLink.appendChild(createSpan(`steam-card-review ${getReviewClass(result.reviewText)}`, result.reviewText));
          if (result.reviews) {
            steamLink.appendChild(createSpan("steam-card-review-count", `(${result.reviews.toLocaleString()})`));
          }
        }

        if (options.showMetacritic && result.metacritic) {
          addSeparator();
          steamLink.appendChild(createSpan(`steam-card-metacritic ${getMetacriticClass(result.metacritic)}`, String(result.metacritic)));
        }

        if (options.showReleaseDate && result.releaseDate) {
          addSeparator();
          steamLink.appendChild(createSpan("steam-card-release", result.releaseDate));
        }

        // Create container for both links
        const container = document.createElement("div");
        container.className = "steam-card-container";
        container.dataset.processing = "true";
        container.appendChild(steamLink);

        // Add SteamDB link if enabled
        if (options.showSteamDb) {
          const steamDbLink = document.createElement("a");
          steamDbLink.href = `https://steamdb.info/app/${result.id}/`;
          steamDbLink.className = "steam-card-db";
          steamDbLink.target = "_blank";
          steamDbLink.rel = "noopener";
          steamDbLink.textContent = "SteamDB";
          container.appendChild(steamDbLink);
        }

        return container;
      }

      const notFoundCard = document.createElement("div");
      notFoundCard.className = "steam-card steam-card-not-found";
      notFoundCard.dataset.processing = "true";
      const notFoundText = document.createElement("span");
      notFoundText.className = "steam-card-text";
      notFoundText.textContent = "Not found on Steam";
      notFoundCard.appendChild(notFoundText);
      return notFoundCard;
    }

    function replaceLoadingWithElement(
      parentElement: Element,
      newElement: HTMLElement
    ) {
      const loadingEl = parentElement.querySelector(".steam-card-loading");

      if (loadingEl) {
        loadingEl.replaceWith(newElement);
      } else {
        const insertAfter = parentElement.firstElementChild || null;

        if (insertAfter) {
          insertAfter.after(newElement);
        } else {
          parentElement.prepend(newElement);
        }
      }
    }

    async function processElement(element: Element) {
      const text = element.textContent?.trim() || "";

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
        text.toLowerCase().includes("upcoming repacks"),
        text.toLowerCase().includes("fitgirl"),
        text.toLowerCase().includes("in service"),
      ];

      if (skipConditions.some((condition) => condition)) {
        return;
      }

      const parent = element.parentNode as Element;
      if (!parent) return;

      const siblings = Array.from(parent.children);

      const alreadyProcessed = siblings.some(
        (sibling) =>
          sibling.classList.contains("steam-card") ||
          sibling.classList.contains("steam-card-loading") ||
          (sibling as HTMLElement).dataset?.processing === "true"
      );

      if (alreadyProcessed) {
        return;
      }

      const articleEl = parent.closest("article");
      if (articleEl) {
        const existingCards = articleEl.querySelectorAll(
          ".steam-card, .steam-card-loading"
        );
        if (existingCards.length > 0) {
          return;
        }

        const categoryLink = articleEl.querySelector('a[rel="category tag"]');
        if (categoryLink?.textContent?.toLowerCase() === "uncategorized") {
          return;
        }
      }

      for (const loader of siblings.filter((sibling) =>
        sibling.classList.contains("steam-card-loading")
      )) {
        loader.remove();
      }

      const loadingEl = document.createElement("div");
      loadingEl.className = "steam-card-loading";
      loadingEl.dataset.processing = "true";
      loadingEl.textContent = "Loading Steam info...";
      element.parentNode?.insertBefore(loadingEl, element.nextSibling);

      const gameName = extractGameName(element.textContent?.trim() || "");

      try {
        const response: SearchGameResponse = await browser.runtime.sendMessage({
          action: MESSAGE_ACTIONS.SEARCH_GAME,
          gameName,
        });

        const card = createSteamCard(response.success ? response.result ?? null : null);
        replaceLoadingWithElement(parent, card);
      } catch {
        const errorCard = document.createElement("div");
        errorCard.className = "steam-card";
        errorCard.dataset.processing = "true";
        errorCard.textContent = `Error finding "${gameName}" on Steam`;

        replaceLoadingWithElement(parent, errorCard);
      }
    }

    async function processUpcomingRepack(span: Element) {
      if (span.querySelector(".steam-inline-link, .steam-inline-not-found, .steam-inline-loading")) {
        return;
      }

      const text = span.textContent?.trim() || "";
      if (!text || text.length < 3) return;

      const gameName = extractGameName(text.replace(/^⇢\s*/, ""));
      if (!gameName) return;

      const loading = document.createElement("span");
      loading.className = "steam-inline-loading";
      loading.textContent = "..";
      span.appendChild(loading);

      try {
        const response: SearchGameResponse = await browser.runtime.sendMessage({
          action: MESSAGE_ACTIONS.SEARCH_GAME,
          gameName,
          fast: true,
        });

        const link = createInlineSteamLink(response.success ? response.result ?? null : null);
        loading.replaceWith(link);
      } catch {
        loading.remove();
      }
    }

    function findAndProcessGames() {
      const mainTitles = document.querySelectorAll(
        ".entry-title > a:first-of-type:not(:has(~ .steam-card)):not(.steam-card-skipped)"
      );
      const detailTitle = document.querySelector(
        "article.type-post > .entry-header .entry-title:not(:has(~ .steam-card))"
      );

      const observer = new IntersectionObserver(
        (entries, obs) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              processElement(entry.target);
              obs.unobserve(entry.target);
            }
          }
        },
        {
          rootMargin: "4000px",
          threshold: 0.1,
        }
      );

      for (const title of mainTitles) {
        observer.observe(title);
      }

      if (detailTitle) {
        processElement(detailTitle);
      }

      // Process upcoming repacks - green spans with arrow prefix
      const upcomingSpans = document.querySelectorAll(
        'article.category-uncategorized .entry-content span[style*="color: #339966"]'
      );
      for (const span of upcomingSpans) {
        processUpcomingRepack(span);
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", findAndProcessGames);
    } else {
      findAndProcessGames();
    }
  },
});
