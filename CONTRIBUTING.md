# Contributing

FrameUI Studio is licensed under GPL-3.0-only. Contributions must be compatible with that license. Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and discuss substantial changes with the maintainer first.

1. Use Node.js 22 or 24. No `npm install` is needed.
2. Run `npm run dev`, then edit the static files in `dist/`.
3. Run `npm test` and `npm run check`.
4. Check changed screens at 320, 390, 768 and desktop widths; include a long translation and Arabic or Hebrew where relevant.
5. Keep generated catalogs, interpolation fields, commands and authored content intact. Add any new interface text to every language catalog.

Never commit tokens, `.env` files, private server links, exported user data or plugin source. Browser libraries are origin-specific; use disposable drafts for testing. Keep PRs focused and describe observed behavior and verification.

The shader/catalog refresh tool accepts an external plugin checkout, but that checkout is optional and must stay outside this repository. Run `npm run refresh -- /path/to/FrameUI` only when intentionally refreshing shader/catalog fixtures.
