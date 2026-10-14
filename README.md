# FrameUI Studio

A browser-local editor for all 50 FrameUI transition templates. No dependencies, build step, account or internet connection are required. The interface is in English.

Open `dist/index.html` in a modern browser. A running FrameUI pack server also serves the bundled editor at `/studio/`. The editor uses classic, relative JavaScript files so it works from `file://` and under the pack server's restrictive content policy.

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
node --test web-editor/test/core.test.cjs
node --check web-editor/dist/app.js
node web-editor/scripts/generate-preview.cjs
```

Regenerate `dist/shaders.js` and `test/catalog.json` when the plugin's shader functions or built-in catalog change. The generator copies source routines rather than maintaining independent visual approximations.

Copyright (C) 2026 Berke Akçen. GPL-3.0-or-later, matching FrameUI.
