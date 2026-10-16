# FrameUI Studio

A browser-local editor for 50 FrameUI shaders and 10 ready-made loading screens. No dependencies, build step, account or internet connection are required. The interface is in English.

This is a standalone website project, separate from the FrameUI plugin. Open `dist/index.html` in a modern browser, or run `npm run dev` to serve it at `http://127.0.0.1:5173`. No dependency installation is needed. Host the `dist/` folder on any static website for standalone editing. The plugin also bundles the same editor on its resource-pack host for direct server imports. The editor uses classic, relative JavaScript files so it also works from `file://`.

The library has exactly three groups: **Animations** (50 animation starting points), **Presets** (10 complete editable screens), and **My Effects** (your saved/imported designs). Editing a starting point automatically creates a copy in My Effects with a unique ID. You can set its name, colors, timing, captions, player presentation and matching rules. Upload your own PNG/JPEG artwork or photo; Studio converts it to PNG and bounds it to 2048 × 2048 pixels and 8 MB. Images remain local in the browser and are embedded in the exported ZIP. The current draft is kept in localStorage when space permits. My Effects stores multiple definitions and their PNG bytes in this browser’s IndexedDB, including after a reload. Drafts stay local until you explicitly import them to a server or export them. Each server origin has its own browser library. Use **Export effect** to retain a portable copy.

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

Direct layout editing: drag the logo/image, text group or loading indicator on the preview. Pull a corner to resize proportionally. Use the element toolbar when objects overlap. Every gesture is one Undo entry; Escape cancels. Focused objects and corner handles support arrows (Shift for 10px steps). Text X and indicator thickness are exported along with the existing positions/scales. The paused canvas shows stable placement while arranging.

Bundled screens range from 1 to 5 seconds, with short fades/wipes and longer atmospheric or photo designs. Original loading previews last 2.5 seconds; its default world-readiness wait plus fade-out is bounded to 5 seconds. Custom definitions retain configurable timing.

The editor category dropdown contains Animations, Presets and My Effects. Cards show only their duration below the name. `/frameui effects` opens All, sorted by duration; selecting a category filters the rows. Only the active selector is highlighted, while table cells retain their category colors. The legacy `designs` filter remains an alias for `presets`. An empty category displays a red error panel.

The first edit to an animation or preset creates an independent copy in My Effects. Subsequent edits update that copy, including canvas placement, images and applied YAML. The Design tab starts with a total duration field in seconds, which scales transition phases together; Behavior retains separate tick controls. My Effects are saved in the current browser; use Import to server from your personal link, or export a portable ZIP.

Copies receive distinct display names such as `Fade Out · Copy`, `Fade Out · Copy 2` and `Fade Out · Copy 3`. Existing duplicate copy names are numbered when the library opens. My Effects cards show full wrapped names and a delete button. Deleted effects move to **Trash**, including their images, and remain recoverable after reloading; open My Effects → Trash to restore them. Restoring a conflicting name assigns the next available number. Deleted IDs stay reserved so a new automatic copy cannot overwrite a recoverable effect.

Trash includes **Delete permanently** for one effect and **Empty Trash** for all deleted effects. Both require a final confirmation and remove the definition and its image. Active effects are excluded from permanent deletion. The footer follows the full-height editor in normal page flow with a 36 px gap below the side panels; the category selector has a separator underneath.

The Design tab includes **When to play**: Join, Teleport and World change. Selections are exported in **play-on** and become active immediately with Import to server (or after manual ZIP installation and /frameui reload); no config.yml setup is needed. All unchecked means manual use only. Existing designs without this field default to no automatic playback. World, permission, cooldown, priority and other rules still apply.

Direct server import: run `/frameui editor` as an administrator and open the personal link. The connected editor is served from the resource-pack host, so both assets and imports share one origin without mixed-content or CORS workarounds. **Import to server** validates the complete YAML/PNG and rebuilt pack before publishing; imported designs enter My Effects and apply their selected events immediately. Stock selections are copied first. Existing custom IDs update with backups under `backups/studio-import/`; malformed imports leave the running catalog and pack intact. Links expire after 30 minutes and a new link revokes the same user's old one. Player links require that account to remain online with `frameui.admin`. Tokens stay in the URL fragment and memory, never browser storage. Configure a pack public URL/bind reachable by the browser; reverse proxies must forward `/studio/` too. The standalone hosted editor offers Connect server instructions and ZIP export.

Background layout **None** makes the shader backing transparent while preserving independent image entrances, captions, decorations and loading indicators. Use contain and image scaling for a logo or photo over the game.

Connected Studio loads custom server definitions into **My Effects**, marked **Server**, including previously imported designs from another browser session. Opening a record fetches its full YAML and original PNG. Edit its duration, layout, image or events, then choose **Save to server** to update that same ID and refresh the pack. Browser draft saving does not publish each keystroke. Drafts without a server link still use **Import to server**. Duplicate IDs and stale revisions are rejected so another saved version cannot be overwritten silently; reopen the server row to load the latest revision. Server records are not moved into the browser-only Trash.
