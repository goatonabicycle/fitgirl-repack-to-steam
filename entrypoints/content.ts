import "./steam-card.css";

interface DisplayOptions {
  showPrice: boolean;
  showReviews: boolean;
  showReleaseDate: boolean;
  showSteamDb: boolean;
  showMetacritic: boolean;
  openInSteamClient: boolean;
}

const defaultOptions: DisplayOptions = {
  showPrice: true,
  showReviews: true,
  showReleaseDate: true,
  showSteamDb: true,
  showMetacritic: true,
  openInSteamClient: true,
};

export default defineContentScript({
  matches: ["*://*.fitgirl-repacks.site/*"],
  runAt: "document_start",

  main() {
    let options: DisplayOptions = { ...defaultOptions };

    async function loadOptions() {
      const result = await browser.storage.local.get("displayOptions");
      const stored = result.displayOptions as Partial<DisplayOptions> | undefined;
      options = { ...defaultOptions, ...stored };
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

    function createInlineSteamLink(result: any): HTMLElement {
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

    function createSteamCard(result: any): HTMLElement {
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

        let priceHTML = "";
        if (options.showPrice) {
          if (result.isFree) {
            priceHTML = `<span class="steam-card-separator">•</span>
              <span class="steam-card-free">FREE</span>`;
          } else if (result.price?.final) {
            const currency = result.price.currency || "USD";
            const formatPrice = (cents: number) => {
              return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: currency,
              }).format(cents / 100);
            };
            const finalPrice = formatPrice(result.price.final);
            const initialPrice = result.price.initial
              ? formatPrice(result.price.initial)
              : null;
            const isOnSale =
              initialPrice && result.price.initial > result.price.final;

            if (isOnSale) {
              const discount = Math.round(
                (1 - result.price.final / result.price.initial) * 100
              );
              priceHTML = `<span class="steam-card-separator">•</span>
                <span class="steam-card-discount">-${discount}%</span>
                <span class="steam-card-price-original">${initialPrice}</span>
                <span class="steam-card-price">${finalPrice}</span>`;
            } else {
              priceHTML = `<span class="steam-card-separator">•</span>
                <span class="steam-card-price">${finalPrice}</span>`;
            }
          }
        }

        // Reviews - using Steam's exact review_score_desc from the API
        let reviewHTML = "";
        if (options.showReviews) {
          const reviewText = result.reviewText || "";
          const reviewCount = result.reviews
            ? `(${result.reviews.toLocaleString()})`
            : "";
          reviewHTML = reviewText
            ? `<span class="steam-card-separator">•</span>
               <span class="steam-card-review ${getReviewClass(
                 reviewText
               )}">${reviewText}</span>
               <span class="steam-card-review-count">${reviewCount}</span>`
            : "";
        }

        // Metacritic score
        const metacriticHTML =
          options.showMetacritic && result.metacritic
            ? `<span class="steam-card-separator">•</span>
             <span class="steam-card-metacritic ${getMetacriticClass(
               result.metacritic
             )}">${result.metacritic}</span>`
            : "";

        // Release date
        const releaseDateHTML =
          options.showReleaseDate && result.releaseDate
            ? `<span class="steam-card-separator">•</span>
             <span class="steam-card-release">${result.releaseDate}</span>`
            : "";

        steamLink.innerHTML = `<span class="steam-card-text">View on Steam</span>
          ${priceHTML}
          ${reviewHTML}
          ${metacriticHTML}
          ${releaseDateHTML}
        `;

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
      notFoundCard.innerHTML = `<span class="steam-card-text">Not found on Steam</span>`;
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

      const loadingId = `loading-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;
      const loadingEl = document.createElement("div");
      loadingEl.id = loadingId;
      loadingEl.className = "steam-card-loading";
      loadingEl.dataset.processing = "true";
      loadingEl.textContent = "Loading Steam info...";
      element.parentNode?.insertBefore(loadingEl, element.nextSibling);

      const gameName = extractGameName(element.textContent?.trim() || "");

      try {
        const response = await browser.runtime.sendMessage({
          action: "searchGame",
          gameName,
        });

        const card = createSteamCard(
          response?.success ? response.result : null
        );
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
        const response = await browser.runtime.sendMessage({
          action: "searchGame",
          gameName,
          fast: true,
        });

        const link = createInlineSteamLink(response?.success ? response.result : null);
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
