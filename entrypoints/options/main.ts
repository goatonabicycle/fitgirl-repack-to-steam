import {
  type DisplayOptions,
  DEFAULT_DISPLAY_OPTIONS,
  STORAGE_KEYS,
} from "../shared/types";

async function loadOptions() {
  const result = await browser.storage.local.get(STORAGE_KEYS.DISPLAY_OPTIONS);
  const stored = result[STORAGE_KEYS.DISPLAY_OPTIONS] as Partial<DisplayOptions> | undefined;
  const options: DisplayOptions = { ...DEFAULT_DISPLAY_OPTIONS, ...stored };

  (document.getElementById('showPrice') as HTMLInputElement).checked = options.showPrice;
  (document.getElementById('showReviews') as HTMLInputElement).checked = options.showReviews;
  (document.getElementById('showReleaseDate') as HTMLInputElement).checked = options.showReleaseDate;
  (document.getElementById('showMetacritic') as HTMLInputElement).checked = options.showMetacritic;
  (document.getElementById('showSteamDb') as HTMLInputElement).checked = options.showSteamDb;
  (document.getElementById('openInSteamClient') as HTMLInputElement).checked = options.openInSteamClient;
}

async function saveOptions() {
  const options = {
    showPrice: (document.getElementById('showPrice') as HTMLInputElement).checked,
    showReviews: (document.getElementById('showReviews') as HTMLInputElement).checked,
    showReleaseDate: (document.getElementById('showReleaseDate') as HTMLInputElement).checked,
    showMetacritic: (document.getElementById('showMetacritic') as HTMLInputElement).checked,
    showSteamDb: (document.getElementById('showSteamDb') as HTMLInputElement).checked,
    openInSteamClient: (document.getElementById('openInSteamClient') as HTMLInputElement).checked
  };

  await browser.storage.local.set({ [STORAGE_KEYS.DISPLAY_OPTIONS]: options });

  const saved = document.getElementById('saved')!;
  saved.classList.add('visible');
  setTimeout(() => saved.classList.remove('visible'), 1500);
}

document.addEventListener('DOMContentLoaded', loadOptions);

document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
  checkbox.addEventListener('change', saveOptions);
});
