import { defineConfig } from 'wxt';

export default defineConfig({
  runner: {
    startUrls: ['https://fitgirl-repacks.site/']
  },
  zip: {
    excludeSources: ['dist/**', 'node_modules/**', '.output/**', 'meta/**']
  },
  manifest: {
    name: 'FitGirl Steam Lookup',
    short_name: 'FG Steam Lookup',
    description: 'See if a game is worth buying! Adds Steam links and overall review ratings (from all languages) to FitGirl Repacks listings.',
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png'
    },
    host_permissions: [
      '*://*.steampowered.com/*'
    ],
    permissions: ['storage'],
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: {
          required: ['none']
        }
      }
    }
  }
});
