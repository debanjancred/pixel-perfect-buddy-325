# Browser QA suites

End-to-end checks run in real Chrome at a 360px phone viewport, plus an accessibility
audit (axe-core, WCAG 2.1 AA) of every screen in Bengali/English × light/dark.

```bash
npm run dev -- --port 5199          # in another terminal
npm run qa                          # all suites against http://localhost:5199
npm run qa -- roles audit           # selected suites
```

The offline suite needs a production build with a service worker:

```bash
NITRO_PRESET=node-server npx vite build
PORT=5300 node .output/server/index.mjs   # in another terminal
BASE=http://localhost:5300 node scripts/qa/offline.mjs
```

- Uses the installed Google Chrome (`PW_CHANNEL=chromium` to use Playwright's bundled
  browser after `npx playwright install chromium`).
- Screenshots and downloads go to `.qa-out/` (`QA_OUT` to change; git-ignored).
- The demo acts as the collector কর্মী ০১; suites that need admin rights switch with
  `demoAsAdmin()` from `helpers.mjs`.
