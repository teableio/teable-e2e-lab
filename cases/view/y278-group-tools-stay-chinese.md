# view/y278-group-tools-stay-chinese

**T6933 / Y278** - fixed.

## Why this case includes a browser

The affected labels are rendered only by the grouped-grid controls. The API
can create the grouped view and prove its saved state, but it cannot observe
the locale used by the client.

## Fixture proof

The runner creates a real second user, persists Chinese as that user's
language, builds a two-row table, and saves one group rule before opening the
page as that user.

## Checkpoint

The browser must render the active group button in Chinese. Opening it must
keep the settings title and add-group action in Chinese, without an English
singular-group fallback or a page error.
