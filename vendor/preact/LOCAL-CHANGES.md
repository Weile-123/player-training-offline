# Game renderer fork

Upstream: Preact 10.29.8, MIT (see LICENSE). Source copied from the exact npm release, not edited in node_modules. Core, compat, hooks, JSX runtime and test utilities all use source modules to avoid mixing mangled/private property names.

Changes:

- constants.js: internal HTML/SVG/Math context uses numeric tags rather than URI strings.
- game-dom.js: HTML uses createElement; SVG uses cloneNode on browser-parsed, fixed prototypes from index.html. Unknown SVG tags and MathML fail explicitly. The prototype bank is inert, contains no user content, and is cached per template element.
- diff/index.js: routes element creation through that factory; rejects raw HTML instead of writing innerHTML. Ordinary children use text nodes and existing Preact reconciliation.
- render.js and component.js: infer internal context from the actual parent element, including portal parents and foreignObject boundaries.

This is a game-specific renderer, not a general-purpose drop-in Preact distribution. Additional SVG tags require a prototype and a DOM test. Raw HTML and MathML are intentionally unsupported. Keep these changes under review when upgrading Preact.

vendor/use-sync-external-store contains the installed MIT selector implementation adapted from CJS to ESM and bound to the same compatibility hooks. Its algorithm is unchanged.
