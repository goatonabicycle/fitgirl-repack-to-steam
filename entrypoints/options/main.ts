import {
  type DisplayOptions,
  DEFAULT_DISPLAY_OPTIONS,
  STORAGE_KEYS,
} from "../shared/types";

// Each checkbox id in index.html matches a DisplayOptions key.
const optionKeys = Object.keys(
  DEFAULT_DISPLAY_OPTIONS
) as (keyof DisplayOptions)[];

const checkboxFor = (key: keyof DisplayOptions) =>
  document.getElementById(key) as HTMLInputElement;

async function loadOptions() {
  const result = await browser.storage.local.get(STORAGE_KEYS.DISPLAY_OPTIONS);
  const stored = result[STORAGE_KEYS.DISPLAY_OPTIONS] as
    | Partial<DisplayOptions>
    | undefined;
  const options: DisplayOptions = { ...DEFAULT_DISPLAY_OPTIONS, ...stored };

  for (const key of optionKeys) {
    checkboxFor(key).checked = options[key];
  }
}

async function saveOptions() {
  const options: DisplayOptions = { ...DEFAULT_DISPLAY_OPTIONS };
  for (const key of optionKeys) {
    options[key] = checkboxFor(key).checked;
  }

  await browser.storage.local.set({ [STORAGE_KEYS.DISPLAY_OPTIONS]: options });

  const saved = document.getElementById("saved")!;
  saved.classList.add("visible");
  setTimeout(() => saved.classList.remove("visible"), 1500);
}

document.addEventListener("DOMContentLoaded", loadOptions);

document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
  checkbox.addEventListener("change", saveOptions);
});
