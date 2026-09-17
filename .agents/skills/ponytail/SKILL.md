---
name: ponytail
description: Enforce YAGNI principles and the Ponytail Decision Ladder to minimize code bloat and prevent over-engineering.
---

# Ponytail Skill

Use this skill when developing or refactoring features to keep code minimal, efficient, and maintainable.

## Decision Ladder
1. **YAGNI Check:** Is this feature or complexity strictly required right now?
2. **Re-use Check:** Is there existing logic in the project that can be reused?
3. **Standard API:** Can this be solved with native language/framework APIs?
4. **Platform Native:** Can standard HTML5/CSS/DOM features solve this?
5. **Existing Deps:** Can existing `package.json` dependencies satisfy this?
6. **Minimal Code:** Write the absolute minimal implementation required.
