# Mobile layout verification

Verified on 2026-10-17 with Chromium viewport emulation. These are layout checks, not a claim of testing physical iOS or Android devices.

| Viewport | Interface languages | Result |
| --- | --- | --- |
| 320 × 568 | All 28 bundled languages | Footer groups and page have no horizontal overflow; cookie and install dialogs stay inside the viewport and have no horizontal content overflow. |
| 390 × 844 | Turkish, German, Arabic | Same bounds and overflow checks pass. |
| 768 × 844 | Turkish, German, Arabic | Same bounds and overflow checks pass. |

Changes made during verification:

- Dialog width and height explicitly respect the viewport; longer content scrolls internally.
- Essential-storage explanations and status stack on narrow screens.
- Cookie actions become full-width touch targets and retain the two-choice consent flow.
- Long translated timing summaries wrap; narrow color controls stack instead of overflowing.
- Footer cookie settings remains 18 px above the separator.
- Dialog titles and close buttons share the same header row.

`npm test` checks YAML/ZIP imports, rendering models, browser library behavior, server capabilities, consent and localization. `npm run check` validates JavaScript syntax and static entrypoint references. Recheck responsive layouts when adding longer labels or changing dialog/footer structure.
