# Skill Registry — login-dash-seed

## User Skills (triggers)
| Skill | Trigger |
|---|---|
| react-19 | Writing React components |
| typescript | Writing TypeScript (types, generics) |
| tailwind-4 | Styling with Tailwind (project uses Tailwind 3.4 — apply with care) |
| zod-4 | Zod validation (project uses zod 3.x — breaking changes differ) |
| zustand-5 | Zustand state (not used here) |
| playwright | E2E tests (not installed) |
| branch-pr / issue-creation / chained-pr / work-unit-commits / comment-writer | PR, issue, commit workflows |
| judgment-day | Adversarial dual review |

## Compact Rules
- react-19: no useMemo/useCallback needed with React Compiler (project is React 18.3 — keep existing hooks).
- typescript: strict types, avoid any, prefer interfaces/const types.
- work-unit-commits: commits as deliverable units, tests beside code; conventional commits, no AI attribution.

## Project Conventions
None found (no CLAUDE.md/AGENTS.md in project root).
