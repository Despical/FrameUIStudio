<p align="center">
  <img src="dist/icon.svg" width="96" height="96" alt="FrameUI Studio icon">
</p>
<h1 align="center">FrameUI Studio</h1>
<p align="center">Make every transition your own.</p>
<p align="center">
  <a href="https://github.com/Despical/FrameUIStudio/actions/workflows/ci.yml"><img alt="Checks" src="https://github.com/Despical/FrameUIStudio/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/Despical/FrameUIStudio/actions/workflows/pages.yml"><img alt="Deployment" src="https://github.com/Despical/FrameUIStudio/actions/workflows/pages.yml/badge.svg"></a>
  <img alt="28 languages" src="https://img.shields.io/badge/languages-28-75e8dc">
  <img alt="60 templates" src="https://img.shields.io/badge/templates-60-75e8dc">
  <img alt="Vanilla JavaScript" src="https://img.shields.io/badge/JavaScript-vanilla-f7df1e">
  <a href="LICENSE"><img alt="GPLv3 license" src="https://img.shields.io/badge/license-GPLv3-blue"></a>
</p>
<p align="center">
  <a href="https://frameui.despical.dev/">Open Studio</a> ·
  <a href="https://hub.despical.dev/">Get FrameUI</a> ·
  <a href="https://discord.gg/uXVU8jmtpU">Discord</a>
</p>

FrameUI Studio is a free browser editor for FrameUI loading screens: 50 animated shaders, 10 editable presets, and your own saved designs. This repository contains the website only. The paid Minecraft plugin has its own project and is not included here.

## Features

- Preview the plugin's shader functions and edit colors, timing, captions, images and indicators.
- Drag and resize screen elements directly on the preview, with undo and redo.
- Import YAML or Studio ZIPs; export a complete effect with its PNG and installation instructions.
- Keep drafts and image libraries in your browser. No Studio account, backend or subscription is required.
- Use 28 bundled interface languages, translated language names, flags, and Arabic/Hebrew RTL layouts.
- Edit on desktop, tablet or mobile. Longer dialogs scroll inside the viewport.
- Allow all cookies or essential storage only; reopen **Cookie settings** in the footer at any time.

The shader preview is illustrative: check HUD, hands, captions and final positioning in Minecraft. Optional Google Analytics starts only after consent on the published editor; authored content and personal server links are excluded.

## Run locally

Use a current Node.js LTS release (22 or 24). No dependency installation or build step is required.

```sh
git clone https://github.com/Despical/FrameUIStudio.git
cd FrameUIStudio
npm run dev
```

Open **http://127.0.0.1:5173**. The static files are in `dist/`. Editing and exporting also work offline; a local HTTP server is recommended for bundled preset images.

```sh
npm test
npm run check
```

Neither serving nor testing requires the plugin checkout. Shader/catalog regeneration is an optional maintainer operation: `npm run refresh -- /path/to/FrameUI`.

## Languages

English is the default. Choose a language in the header or open `?lang=tr`. Explicit preferences persist in this browser; authored names, captions, IDs and exported effect values keep their original content.

English · Spanish · Russian · German · French · Portuguese · Polish · Turkish · Chinese · Indonesian · Italian · Vietnamese · Dutch · Korean · Czech · Thai · Hungarian · Arabic · Japanese · Ukrainian · Swedish · Danish · Romanian · Slovak · Hebrew · Lithuanian · Malay · Tamil

## Deployment

The public editor is available at **https://frameui.despical.dev/**. Cloudflare DNS connects this subdomain to GitHub Pages. GitHub Actions validates the project before deploying only `dist/` to GitHub Pages. Pull requests run checks without deployment privileges. Pushes to `main` and manual dispatches publish the verified static artifact. No deployment token is stored in this repository: Pages uses GitHub's short-lived OIDC credentials.

The website is independent of the plugin project. Deploying this repository does not publish plugin source code or JARs. Browser storage belongs to each origin: export designs from another hosted copy before moving them to this URL.

## Security and support

Report vulnerabilities privately using [SECURITY.md](SECURITY.md). For ordinary bugs, use the issue templates and include the browser, screen size and interface language. Never post a personal `/frameui editor` link, private server address, or exported private artwork in a public issue.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards, and [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES) for bundled asset notices.

## License

Copyright © 2026 Berke Akçen. FrameUI Studio source code is licensed under the GNU General Public License version 3 ([GPL-3.0-only](LICENSE)). Third-party assets retain their own terms and notices. This license applies to Studio; the separate FrameUI plugin is not included or relicensed by this repository.
