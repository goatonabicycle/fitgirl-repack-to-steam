const OPTIONS_KEY = 'displayOptions';

interface DisplayOptions {
  showPrice: boolean;
  showReviews: boolean;
  showReleaseDate: boolean;
  showSteamDb: boolean;
  showMetacritic: boolean;
  openInSteamClient: boolean;
}

const defaults: DisplayOptions = {
  showPrice: true,
  showReviews: true,
  showReleaseDate: true,
  showSteamDb: true,
  showMetacritic: true,
  openInSteamClient: true
};

async function loadOptions() {
  const result = await browser.storage.local.get(OPTIONS_KEY);
  const stored = result[OPTIONS_KEY] as Partial<DisplayOptions> | undefined;
  const options: DisplayOptions = { ...defaults, ...stored };

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

  await browser.storage.local.set({ [OPTIONS_KEY]: options });

  const saved = document.getElementById('saved')!;
  saved.classList.add('visible');
  setTimeout(() => saved.classList.remove('visible'), 1500);
}

document.addEventListener('DOMContentLoaded', loadOptions);

document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
  checkbox.addEventListener('change', saveOptions);
});
