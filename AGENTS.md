<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:ponytail-rules -->
# Ponytail Minimalist Development Rules (YAGNI & Decision Ladder)

Enforce the **YAGNI (You Ain't Gonna Need It)** principle and minimalist development standards to prevent over-engineering.

## The Decision Ladder
Before writing any new code or abstractions, evaluate the task using this ladder and stop at the first applicable rung:

1. **Does this need to exist? (YAGNI):** If the feature, abstraction, or utility is not strictly required right now, skip it.
2. **Codebase Re-use:** Search for existing helpers, utilities, components, or patterns in the codebase and reuse them.
3. **Standard Library / Framework:** Use built-in standard library or framework capabilities before custom code.
4. **Native Platform Features:** Favor native APIs (e.g. browser standards, HTML5 attributes) over third-party UI widgets/packages.
5. **Installed Dependencies:** Use packages already declared in `package.json` rather than introducing new ones.
6. **One Line:** Prefer concise, direct implementations over boilerplate wrappers.
7. **Minimal Custom Code:** Write only the exact, minimal code necessary to fulfill requirements.

## Constraints
- Do not install new dependencies unless explicitly requested.
- Do not create speculative abstractions, wrapper utilities, or extra configuration layers.
- Preserve existing working code and scope edits tightly to the task.
<!-- END:ponytail-rules -->
