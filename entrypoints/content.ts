import './steam-card.css';

export default defineContentScript({
  matches: ['*://*.fitgirl-repacks.site/*'],
  runAt: 'document_start',

  main() {
    function extractGameName(text: string): string {
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
        /\s*Build\s+\d+.*$/i,
        /\s*\+\s*Bonus\s+Soundtrack/i,
        /\s*\+\s*Soundtrack/i,
        /\s*\+\s*OST/i,
        /\s*\+\s*Artbook/i,
        /\s*\+\s*Art\s+Book/i,
        /\s*\+\s*Bonus\s+Content/i,
        /\s*\+\s*Extras/i
      ];

      let cleanedName = text;
      for (const pattern of cleaningPatterns) {
        cleanedName = cleanedName.replace(pattern, "");
      }

      cleanedName = cleanedName.replace(/\s+/g, " ");

      return cleanedName.trim();
    }

    function getReviewClass(reviewText: string): string {
      return `steam-card-review-${reviewText.toLowerCase().replace(/\s+/g, "-")}`;
    }

    function createSteamCard(result: any, gameName: string): HTMLElement {
      if (result) {
        const steamLink = document.createElement("a");
        steamLink.href = `https://store.steampowered.com/app/${result.id}`;
        steamLink.className = "steam-card";
        steamLink.dataset.processing = "true";
        steamLink.target = "_blank";

        let priceHTML = "";
        if (result.price?.final) {
          const finalPrice = `$${(result.price.final / 100).toFixed(2)}`;
          const initialPrice = result.price.initial ? (result.price.initial / 100).toFixed(2) : null;
          const isOnSale = initialPrice && result.price.initial > result.price.final;

          if (isOnSale) {
            const discount = Math.round((1 - result.price.final / result.price.initial) * 100);
            priceHTML = `<span class="steam-card-separator">•</span>
              <span class="steam-card-discount">-${discount}%</span>
              <span class="steam-card-price-original">$${initialPrice}</span>
              <span class="steam-card-price">${finalPrice}</span>`;
          } else {
            priceHTML = `<span class="steam-card-separator">•</span>
              <span class="steam-card-price">${finalPrice}</span>`;
          }
        }

        // Reviews - using Steam's exact review_score_desc from the API
        const reviewText = result.reviewText || "";
        const reviewCount = result.reviews ? `(${result.reviews.toLocaleString()})` : "";
        const reviewHTML = reviewText
          ? `<span class="steam-card-separator">•</span>
             <span class="steam-card-review ${getReviewClass(reviewText)}">${reviewText}</span>
             <span class="steam-card-review-count">${reviewCount}</span>`
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
      notFoundCard.textContent = `Not found on Steam: "${gameName}"`;
      return notFoundCard;
    }

    function replaceLoadingWithElement(parentElement: Element, newElement: HTMLElement) {
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
        text.toLowerCase().includes("upcoming repacks")
      ];

      if (skipConditions.some(condition => condition)) {
        return;
      }

      const parent = element.parentNode as Element;
      if (!parent) return;

      const siblings = Array.from(parent.children);

      const alreadyProcessed = siblings.some(sibling =>
        sibling.classList.contains("steam-card") ||
        sibling.classList.contains("steam-card-loading") ||
        (sibling as HTMLElement).dataset?.processing === "true"
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
      element.parentNode?.insertBefore(loadingEl, element.nextSibling);

      const gameName = extractGameName(element.textContent?.trim() || "");

      try {
        const response = await browser.runtime.sendMessage({ action: "searchGame", gameName });

        const card = createSteamCard(response?.success ? response.result : null, gameName);
        replaceLoadingWithElement(parent, card);
      } catch (error) {
        console.error("Failed to process game:", gameName, error);

        const errorCard = document.createElement("div");
        errorCard.className = "steam-card";
        errorCard.dataset.processing = "true";
        errorCard.textContent = `Error finding "${gameName}" on Steam`;

        replaceLoadingWithElement(parent, errorCard);
      }
    }

    function findAndProcessGames() {
      const mainTitles = document.querySelectorAll(".entry-title > a:first-of-type:not(:has(~ .steam-card)):not(.steam-card-skipped)");
      const detailTitle = document.querySelector("article.type-post > .entry-header .entry-title:not(:has(~ .steam-card))");

      const observer = new IntersectionObserver((entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            processElement(entry.target);
            obs.unobserve(entry.target);
          }
        }
      }, {
        rootMargin: "4000px",
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
  }
});
