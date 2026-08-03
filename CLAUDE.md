# CLAUDE.md

## Project Context

Define the project purpose and primary tech stack here.

> Example: AI Monsoon — prompt management SaaS. Stack: Next.js, TypeScript, Supabase, Cloudflare AI, Stripe, Netlify.

## Repository Structure

```
/src          # application source
/tests        # all test files, mirroring /src structure
/docs         # requirements.md and other reference docs
/supabase     # migration scripts only — no ad-hoc schema changes
/.claude      # hooks, agents, settings.json
```

## Core Rules

**Requirements**

- All requirements live in `docs/{page.md}` - documents are split based on the page
- For planned changes, create a new requirement document under docs/ and include the creation timestamp.
- Update it before starting any new feature or scope change
- See [requirements.md](./docs/requirements.md) acts as the content page
- Always keep documentation aligned with the implemented code and tests.

**Planning**

- For any complex or multi-step change: plan first, implement second
- Use `/plan` mode — do not write code until the approach is confirmed

**Git Workflow**

- Never commit or push directly to `main`. Create a feature/fix branch for every change (`feature/<slug>`, `fix/<slug>`, `chore/<slug>`) and open a pull request (MR) for review before merging.
- Enforced by `.husky/pre-push` (blocks direct pushes to `main`) and `.husky/post-commit` (skips auto-push while on `main`).
- Do not bypass this with `--no-verify`; if the hook is wrong, fix the hook.

**FrontEnd**

- Add meaniful unique testids for all the input elements helping ui based test automation
- Enforce formatting, code quality, and code analysis through ESLint rather than relying on manual review alone.
- Reduce duplication in logic, strings, and component behavior with clear extraction rules and static analysis.
- Custom hooks should encapsulate reusable stateful logic, not act as dumping grounds.
- Hooks must follow the Rules of Hooks; enforce with react-hooks/rules-of-hooks.
- Dependency arrays must be reviewed instead of suppressed; use react-hooks/exhaustive-deps as a warning or error depending on team tolerance.
- A hook should expose a small, intention-revealing API.

Anti-Patterns - Avoid the following:
- Type-based top-level structure only, such as one giant components/, hooks/, and services/ tree for the whole app, once the app becomes large.
- Massive reusable components with too many flags.
- Repeated useEffect fetching logic across pages.
- Shared utility files that mix unrelated concerns.
- Disabling hook dependency warnings without a documented reason.
- Copy-pasted business logic or string literals that should become constants, config, or shared functions.
- Using TypeScript and still duplicating runtime prop validation with react/prop-types.

Duplication control
Only extract shared code after duplication is real, not hypothetical. Feature-local duplication is acceptable briefly; cross-feature duplication should be reduced once patterns stabilize.

Extract when:
- The same business rule appears in multiple places.
- The same transform or validation logic appears more than twice.
- The same string literal appears repeatedly and should become a constant, enum, translation key, or config value.
- Two functions are structurally identical and differ only by small values or selectors.

Do not extract when:
- The abstraction would hide business meaning.
- The shared helper name becomes more generic than the duplicated code.
- The code is only coincidentally similar and likely to diverge soon.

Naming
- Use domain names, not vague names like data, item, helper, or temp.
- Components: ProjectCard.tsx, CustomerForm.tsx
- Hooks: useProjectFilters.ts
- Utilities: formatCurrency.ts, mapLeadToPayload.ts
- Avoid generic utils.ts and helpers.ts files that become junk drawers.

ESLint Standard
Use ESLint as the single entry point for code formatting guardrails, correctness checks, React rules, hook safety, accessibility, TypeScript discipline, and duplication analysis.

Formatting Standard
Use Prettier for formatting and ESLint for code-quality enforcement. Keep these responsibilities separate to avoid rule conflicts and config churn.

Formatting rules:
- Auto-format on save in the editor.
- Run lint and format checks in pre-commit or CI.
- Do not bikeshed style in reviews when the formatter can decide it.
- Avoid custom stylistic ESLint rules unless they encode a real engineering constraint.

**Testing**

- Every change gets a test in `/tests`
- Update existing tests when behaviour changes
- Framework: Vitest (`vi.fn()`, `vi.mock()`)
- Follow the testing pyramid to have a good coverage of unit tests followed by integrations and finally playwright tests

**Database**

- All schema changes via migration scripts in `/supabase/migrations/`
- Never alter tables manually in the Supabase dashboard
- By default, RLS policies are restricted. Always create RLS policies as required for database operations.

**Deployment**

- CI/CD: GitHub Actions → Netlify
- Do not introduce deployment steps outside this pipeline

## Code Review

When generating or reviewing React code, apply these checks in order:

- Is the code placed in the correct feature boundary?
- Is state owned by the nearest sensible component or hook?
- Can rendering logic be simpler through composition?
- Is there duplicated transform, validation, JSX structure, or string content that should be extracted?
- Would ESLint flag hooks, type safety, JSX correctness, or duplication issues?
- Are imports clean, type-only where appropriate, and free of dead code?
- Is the code readable without hidden abstractions or generic helper names?

## Non-negotiable rules

- Every code change must be followed by a requirements update under docs/requirements/.
- Every code change must be followed by test additions or test updates in src/test/.
- Never stop at implementation only.
- If tests cannot be added, explain why before finishing.
- For bug fixes, update the existing relevant document and keep the change history upto date.

## Hooks

See `.claude/settings.json` for mandatory pre/post tool hooks.
