# Project Roadmap

This document outlines the planned features and improvements for the MSTY Average Price Reducer project.

## Features

- [x] **Historical Price Chart**: Display a historical price chart for MSTY to help users visualize price trends. (Completed on 2025-08-28)
- [ ] **"What If" Scenarios**: Allow users to calculate the new average price after buying a certain number of shares at a specific price.
- [ ] **Support for Other Stocks**: Make the calculator generic to support any stock symbol.
- [ ] **Dividend Adjustment**: Add a feature to account for dividends in the cost basis calculation.
- [ ] **Localization**: Add support for other languages.
- [ ] **Save/Load Portfolio**: Allow users to save and load their portfolio data.
- [ ] **UI/UX Improvements**: Enhance the user interface with better styling and a more modern look and feel.

## Completed

- 2025-08-28: Initial Historical Price Chart shipped.
- 2025-08-29: Client-only data fetching for GitHub Pages
  - Live price: Stooq CSV → Yahoo Quote JSON via `https://r.jina.ai/` mirror (no server required).
  - Historical chart: Stooq CSV → Yahoo Chart JSON via the same mirror; dates ordered oldest→newest; y-axis as dollars.
  - Robust fallbacks: if both APIs fail, show a static Finviz chart image as a last resort.
  - Noise reduction: quiet error handling with optional DEBUG flag; pinned Chart.js CDN version to avoid sourcemap warnings.
  - Note: `server.js` exists for local dev proxying but is not required for GitHub Pages.
- 2025-08-29: Copy improvements + in-page Quick Guide
  - Refined field labels and helper texts for clarity (S/C/Avg/P/T).
  - Added “Quick Guide: How to fill the form” with concise explanations and tips.
  - Kept design intact; no server dependency.
 - 2025-08-29: Modernize Tailwind styles (dark theme)
   - Switched to a cleaner zinc-based dark palette (backgrounds, text, borders).
   - Updated inputs, buttons, cards, and helper text for consistent, modern look.
   - Tuned chart axis colors to match the new palette.
## Backed Out

- 2025-08-29: Light theme + Theme toggle (removed)
  - Attempted light/dark support via Tailwind CDN config and toggle, but reverted due to instability in production.
  - UI restored to dark theme only for reliability. Revisit later with a build step if needed.
