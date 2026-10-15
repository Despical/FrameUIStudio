# FrameUI Studio

A browser-local editor for 50 FrameUI shaders and 10 ready-made loading screens. No dependencies, build step, account or internet connection are required. The interface is in English.

This is a standalone website project, separate from the FrameUI plugin. Open `dist/index.html` in a modern browser, or run `npm run dev` to serve it at `http://127.0.0.1:5173`. No dependency installation is needed. Host the `dist/` folder on any static website and set the plugin's `editor.public-url` to that URL. The editor uses classic, relative JavaScript files so it also works from `file://`.

Select a template, click **New custom effect**, then set its ID, name, colors, timing, captions, player presentation and matching rules. Upload your own PNG/JPEG artwork or photo; Studio converts it to PNG and bounds it to 2048 × 2048 pixels and 8 MB. Images remain local in the browser and are embedded in the exported ZIP. Drafts are saved to browser local storage when space permits. Use **Export effect** to retain a portable copy.

The preview uses the plugin's actual GLSL effect functions, including transition masks, animation speed, original/custom palettes, brightness, image cover/contain and opacity. Captions, HUD, hands and the Minecraft scene are illustrative. Check the final effect in Minecraft, where resource packs and title placement determine the result. Systems without WebGL can still edit/import/export definitions; the preview explicitly reports that it is unavailable.

Exported ZIP contents:

```text
effects/my-effect.yml
images/my-effect.png   # when an image is used
INSTALL.txt
```

Extract into `plugins/FrameUI/`, retaining the folder structure. Run `/frameui reload`, accept the refreshed resource pack, then test `/frameui preview my-effect`. A new ID creates an additional effect; an existing ID replaces that effect's configuration. IDs and YAML filenames must match.

Import one `.yml`/`.yaml` definition or one Studio ZIP at a time. Imports validate the same schema and bounds as the plugin. A YAML-only import referencing an image needs that image supplied through **Choose an image** before complete ZIP export. The YAML editor supports mappings, inline/block lists and quoted/plain scalar values; anchors, aliases, tags and multiline blocks are intentionally rejected. ZIP paths are confined to `effects/`, `images/` and `INSTALL.txt`; unencrypted stored entries and browser-supported deflate archives are accepted, with CRC integrity validation.

Undo/redo keeps the latest 32 local edits. Shortcuts: `/` searches templates, `Ctrl+Z` undoes, `Ctrl+Shift+Z` redoes when outside a text field, and `Space` toggles playback from the page background. Reduced-motion preferences pause the initial preview.

Developer checks:

```text
npm test
node --check dist/app.js
npm run refresh -- ../FrameUI
```

Regenerate `dist/shaders.js`, `test/catalog.json` and the reference YAML fixtures when the plugin's shader functions or built-in catalog change. Pass the plugin project directory to `npm run refresh`; it defaults to the sibling `../FrameUI`. The generator copies source routines rather than maintaining independent visual approximations. Serving, editing and tests use this project's own files and do not require the plugin checkout.

Copyright (C) 2026 Berke Akçen. GPL-3.0-or-later, matching FrameUI.

Ready-made layouts include the generated 3D FrameUI logo, six reusable text/indicator layouts, two new landscapes and Overworld. The Design tab edits background style, image entrance/motion/size/position/delay, caption animation/position/scale, loading indicator and decoration. Indicators animate continuously rather than reporting a server loading percentage. The preset artwork is included in complete effect exports; replacing a logo or photo preserves its configurable animation. Run the local HTTP server to load bundled preset images reliably.
