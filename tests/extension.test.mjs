// Loads each build into the installed browser, opens a real FitGirl post, and checks the Steam card renders
// without an error. This uses the live site and live Steam: about 3 Steam requests per browser per run.
// `npm test` builds both versions first. Set HEADED=1 to watch. Set FIREFOX_PATH if Firefox lives elsewhere.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import puppeteer from "puppeteer-core";

// A game that is on Steam, so the card must find it.
const POST = "https://fitgirl-repacks.site/cyberpunk-2077/";

const browsers = {
  chrome: {
    dir: "chrome-mv3",
    launch: { browser: "chrome", channel: "chrome" },
  },
  firefox: {
    dir: "firefox-mv2",
    launch: {
      browser: "firefox",
      executablePath:
        process.env.FIREFOX_PATH ??
        "C:/Program Files/Mozilla Firefox/firefox.exe",
    },
  },
};

for (const [name, { dir, launch }] of Object.entries(browsers)) {
  test(
    `${name}: Steam card renders on a real post without errors`,
    { timeout: 120000 },
    async () => {
      const browser = await puppeteer.launch({
        ...launch,
        headless: !process.env.HEADED,
        enableExtensions: true,
      });
      try {
        await browser.installExtension(resolve(".output", dir));
        const page = await browser.newPage();
        const exceptions = [];
        // The site's own scripts throw too. Keep only exceptions raised in the extension's code.
        page.on("pageerror", (error) => {
          if (/(chrome|moz)-extension:\/\//.test(error.stack ?? ""))
            exceptions.push(error.message);
        });

        await page.goto(POST, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        // The loading placeholder becomes a .steam-card for every outcome: found, not found, or error.
        const card = await page.waitForSelector(".steam-card", {
          timeout: 60000,
        });
        const { text, notFound } = await card.evaluate((element) => ({
          text: element.textContent,
          notFound: element.classList.contains("steam-card-not-found"),
        }));

        assert.doesNotMatch(text, /error/i, "card shows an error");
        assert.equal(notFound, false, "card says the game is not on Steam");
        assert.deepEqual(exceptions, [], "extension threw exceptions");
      } finally {
        await browser.close();
      }
    },
  );
}
