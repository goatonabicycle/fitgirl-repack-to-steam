const OPTIONS_KEY = 'displayOptions';

const defaults = {
  showPrice: true,
  showReviews: true,
  showReleaseDate: true,
  showSteamDb: true,
  showMetacritic: true
};

async function loadOptions() {
  const result = await browser.storage.local.get(OPTIONS_KEY);
  const options = result[OPTIONS_KEY] || defaults;

  (document.getElementById('showPrice') as HTMLInputElement).checked = options.showPrice;
  (document.getElementById('showReviews') as HTMLInputElement).checked = options.showReviews;
  (document.getElementById('showReleaseDate') as HTMLInputElement).checked = options.showReleaseDate;
  (document.getElementById('showMetacritic') as HTMLInputElement).checked = options.showMetacritic;
  (document.getElementById('showSteamDb') as HTMLInputElement).checked = options.showSteamDb;
}

async function saveOptions() {
  const options = {
    showPrice: (document.getElementById('showPrice') as HTMLInputElement).checked,
    showReviews: (document.getElementById('showReviews') as HTMLInputElement).checked,
    showReleaseDate: (document.getElementById('showReleaseDate') as HTMLInputElement).checked,
    showMetacritic: (document.getElementById('showMetacritic') as HTMLInputElement).checked,
    showSteamDb: (document.getElementById('showSteamDb') as HTMLInputElement).checked
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
