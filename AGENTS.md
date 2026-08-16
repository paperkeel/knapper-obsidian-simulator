# Development rules

## Scope

- Build a local Obsidian plugin simulator.
- Keep the runtime independent from any one plugin.
- Use Sigla Writer as the first compatibility target.
- Do not read Markdown file contents from an Obsidian vault during tests or capture work.

## Architecture

- Keep browser runtime code under `src/runtime/`.
- Keep local server and file-system code under `src/server/`.
- Keep artifact validation under `src/artifacts/`.
- Keep simulator interface code under `src/components/simulator/`.
- Keep generated Obsidian theme data under `src/theme/fixtures/`.
- Preserve server and browser boundaries. Do not import Node modules into browser code.
- Add short and accurate JSDoc comments to exported APIs.

## Toolchain

- Use `pnpm` and Vite+.
- Use Tailwind CSS v4 and the installed shadcn primitives.
- Use Oxfmt through `vp fmt`.
- Use Oxlint and type checking through `vp check`.
- Do not add a dependency without user approval.

## Tests

- Write a failing test before each runtime capability.
- Use temporary directories for file-system tests.
- Test path containment, symlink handling, and mutation ordering.
- Test plugin load, unload, and repeated reload behavior.
- Use built plugin artifacts for end-to-end compatibility tests.

## Commands

- Check: `pnpm run check`
- Autofix: `pnpm run check:fix`
- Test: `pnpm run test`
- Build: `pnpm run build`
- Full gate: `pnpm run ci`
