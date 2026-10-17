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

FrameUI Studio is a free browser editor for FrameUI loading screens, with 50 animations, 10 editable presets and your own saved designs.

## Features

- Preview loading screens and edit colors, timing, text, images and indicators.
- Drag and resize screen elements directly on the preview, with undo and redo.
- Import YAML or Studio ZIPs; export a complete effect with its PNG and installation instructions.
- Keep drafts and image libraries in your browser. No Studio account or subscription is required.
- Connect to your Minecraft server with `/frameui editor` and save effects directly.
- Choose from 28 interface languages.
- Edit on desktop, tablet or mobile.
- Allow all cookies or essential storage only; reopen **Cookie settings** in the footer at any time.

Check your finished effect in Minecraft to confirm its appearance and positioning.

## Run locally

Install Node.js 22 or 24, then run:

```sh
git clone https://github.com/Despical/FrameUIStudio.git
cd FrameUIStudio
npm run dev
```

Open **http://127.0.0.1:5173** in your browser.

To run the project checks:

```sh
npm test
npm run check
```

## Languages

English is the default. Choose a language in the header; Studio remembers your choice. Your effect names and text stay as you wrote them.

English · Spanish · Russian · German · French · Portuguese · Polish · Turkish · Chinese · Indonesian · Italian · Vietnamese · Dutch · Korean · Czech · Thai · Hungarian · Arabic · Japanese · Ukrainian · Swedish · Danish · Romanian · Slovak · Hebrew · Lithuanian · Malay · Tamil

## Connect your server

1. Run `/frameui editor` in Minecraft and open your personal link.
2. Create an effect or open one from **My Effects**.
3. Click **Import to server** or **Save to server** to apply your changes.

Keep your Minecraft account online while editing. Personal links last 30 minutes; run the command again for a new one. Keep these links private.

You can also use Studio on its own and export effects as ZIP files.

## Security and support

Report vulnerabilities privately using [SECURITY.md](SECURITY.md). For bugs, open an issue with the steps to reproduce the problem, your browser and your interface language.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards, and [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES) for bundled asset notices.

## License

Copyright © 2026 Berke Akçen. FrameUI Studio is licensed under the GNU General Public License version 3 ([GPL-3.0-only](LICENSE)). Third-party assets retain their own terms and notices.
