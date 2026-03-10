---
trigger: always_on
---

# Verification Procedure
Every new execution plan provided for an implementation step MUST explicitly include the following full validation commands in its Verification Plan section, to ensure zero regressions in typing, formatting, style, or existing functionality:

```bash
npm run format && npm run format:check
npm run lint
npm run typecheck
npm run test
```