import { defineConfig } from 'wxt';

export default defineConfig({
  runner: {
    startUrls: ['https://fitgirl-repacks.site/']
  },
  manifest: {
    name: 'Fitgirl Repack to Steam',
    short_name: 'FGR-to-Steam',
    description: 'See if a game is worth buying! Adds Steam links and overall review ratings (from all languages) to FitGirl Repacks listings.',
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png'
    },
    host_permissions: [
      '*://*.fitgirl-repacks.site/*',
      '*://*.steampowered.com/*'
    ],
    permissions: ['storage']
  }
});
