/* Copies plugin shader routines into the browser preview without Minecraft imports. */
const fs = require('node:fs');
const path = require('node:path');
const site = path.resolve(__dirname, '..');
const plugin = path.resolve(process.argv[2] || path.join(site, '../FrameUI'));
const source = fs.readFileSync(path.join(plugin, 'src/main/resources/pack/assets/minecraft/shaders/core/text.fsh'), 'utf8');
const java = fs.readFileSync(path.join(plugin, 'src/main/java/dev/despical/frameui/loading/LoadingEffect.java'), 'utf8');
const catalog = [...java.matchAll(/\w+\("([^"]+)", "([^"]+)", "([^"]+)", (\d+), (\d+), (\d+), (\d+), (true|false)\)/g)].map(match => ({ id: match[1], name: match[2], category: match[3], shaderId: Number(match[4]), fadeIn: Number(match[5]), minimum: Number(match[6]), fadeOut: Number(match[7]), captions: match[8] === 'true' }));
if (catalog.length !== 50) throw new Error('Expected 50 stable effect templates.');
const begin = source.indexOf('vec3 frameLoadingBackground()');
const modern = source.includes('vec4 frameTemplateEffect(int effect)');
const end = source.indexOf('\n// FRAMEUI_COMPOSITION_BEGIN', begin);
if (begin < 0 || end < 0) throw new Error('Plugin shader routines could not be found.');
const functions = source.slice(begin, end)
    .replace(/GameTime\s*\*\s*1200\.0(?:\s*\*\s*frameSpeed\(frameLoadingEffect\))?/g, 'uTime * uSpeed')
    .replace('vec4 frameTemplateEffect(int effect) {', 'vec4 frameEffect() {\n    int effect = frameLoadingEffect;');
if (/GameTime|frameSpeed\(|frameTemplate\(|framePalette\(|frameIntensity\(|frameImage\(|Sampler0|texCoord0/.test(functions)) {
    throw new Error('Preview extraction retained a Minecraft-specific shader dependency.');
}
const fragment = `precision highp float;
uniform vec2 ScreenSize;
uniform float uTime;
uniform float uSpeed;
uniform int frameLoadingEffect;
uniform float frameLoadingTransition;
uniform int uCustom;
uniform vec3 uBackground;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform float uIntensity;
uniform sampler2D uImage;
uniform bool uHasImage;
uniform vec2 uImageSize;
uniform bool uContain;
uniform float uImageOpacity;
uniform int uBackgroundStyle;
uniform int uImageAnimation;
uniform int uImageMotion;
uniform vec4 uPlacement;
uniform vec4 uIndicator;
uniform int uDecoration;
uniform float uProgressScale;
vec4 frameTextPlacement(int effect) { return vec4(0.64, 1.0, 0.5, uProgressScale); }
int frameBackgroundStyle(int effect) { return uBackgroundStyle; }
int frameDecoration(int effect) { return uDecoration; }
vec4 frameIndicator(int effect) { return uIndicator; }
vec3 frameElementBase(int effect) { return uBackground; }
vec3 frameElementAccent(int effect) { return uPrimary; }

${functions}
${source.slice(source.indexOf('// FRAMEUI_COMPOSITION_BEGIN'), source.indexOf('// FRAMEUI_COMPOSITION_END')).replace(/GameTime\s*\*\s*1200\.0\s*\*\s*frameSpeed\(frameLoadingEffect\)/g, 'uTime * uSpeed')}
void main() {
    vec4 effect = uBackgroundStyle > 0 ? frameCompositionBackground() : frameEffect();
    if (uImageMotion == 2 && uBackgroundStyle == 0) effect.a = 0.0;
    vec3 color = effect.rgb;
    if (uCustom == 1 && uBackgroundStyle == 0) {
        float luma = clamp(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
        color = luma < 0.5 ? mix(uBackground, uPrimary, luma * 2.0) : mix(uPrimary, uSecondary, (luma - 0.5) * 2.0);
    }
    color = clamp(color * uIntensity, 0.0, 1.0);
    if (uHasImage) {
        vec2 uv = vec2(gl_FragCoord.x / ScreenSize.x, 1.0 - gl_FragCoord.y / ScreenSize.y);
        float screenAspect = ScreenSize.x / ScreenSize.y;
        float imageAspect = uImageSize.x / uImageSize.y;
        vec2 scale = vec2(1.0);
        if (uContain) {
            if (screenAspect > imageAspect) scale.x = screenAspect / imageAspect; else scale.y = imageAspect / screenAspect;
        } else {
            if (screenAspect > imageAspect) scale.y = imageAspect / screenAspect; else scale.x = screenAspect / imageAspect;
        }
        float progress = clamp((abs(frameLoadingTransition) - uPlacement.w) / max(0.01, 1.0 - uPlacement.w), 0.0, 1.0);
        vec2 sampleUv = uv;
        if (uImageMotion == 1) {
            float seconds = uTime * uSpeed;
            float zoom = 1.12 + 0.025 * sin(seconds * 0.22);
            vec2 drift = vec2(sin(seconds * 0.13) * 0.025, cos(seconds * 0.11) * 0.012);
            sampleUv = (sampleUv - 0.5 - drift) / zoom + 0.5;
        }
        vec2 offset = vec2(0.0);
        if (uImageAnimation == 3) offset.y = (1.0 - progress) * 0.24;
        if (uImageAnimation == 4) offset.x = -(1.0 - progress) * 0.35;
        float grow = uImageAnimation == 2 ? max(0.001, 1.0 - pow(1.0 - progress, 3.0)) : 1.0;
        vec2 point = (sampleUv - uPlacement.xy - offset) / (uPlacement.z * grow) * scale + 0.5;
        if (point.x >= 0.0 && point.x <= 1.0 && point.y >= 0.0 && point.y <= 1.0) {
            vec4 picture = texture2D(uImage, point);
            float reveal = effect.a;
            if (uImageAnimation > 0) {
                reveal *= uImageAnimation == 1 ? progress : smoothstep(0.0, 0.15, progress);
                if (uImageAnimation == 5) reveal *= frameCover(uv.x, progress);
                if (uImageAnimation == 6) reveal *= frameCover(uv.x * 0.65 + uv.y * 0.35, progress);
            } else if (uImageMotion == 2) {
                float edge = abs(frameLoadingTransition) * 1.12 - 0.06;
                reveal = 1.0 - smoothstep(edge - 0.025, edge + 0.025, uv.x * 0.65 + uv.y * 0.35);
            }
            float pictureAlpha = picture.a * uImageOpacity * reveal;
            float combinedAlpha = effect.a + pictureAlpha * (1.0 - effect.a);
            vec3 premultiplied = picture.rgb * pictureAlpha + color * effect.a * (1.0 - pictureAlpha);
            color = combinedAlpha > 0.00001 ? premultiplied / combinedAlpha : vec3(0.0);
            effect.a = combinedAlpha;
        }
    }
    vec4 widget = frameWidgets();
    float alpha = effect.a + widget.a * (1.0 - effect.a);
    color = alpha > 0.00001 ? (widget.rgb * widget.a + color * effect.a * (1.0 - widget.a)) / alpha : vec3(0.0);
    gl_FragColor = vec4(color, alpha);
}`;
// Ship the ready-made compositions and their replaceable images beside the standalone editor.
const core = require(path.join(site, 'dist/core.js'));
core.configureCatalog(catalog);
const assets = path.join(site, 'dist/assets'); fs.mkdirSync(assets, {recursive: true});
for (const name of fs.readdirSync(path.join(plugin, 'src/main/resources/effects'))) {
    const id = name.replace(/\.yml$/, '');
    if (!name.endsWith('.yml') || catalog.some(entry => entry.id === id)) continue;
    const definition = core.fromYaml(fs.readFileSync(path.join(plugin, 'src/main/resources/effects', name), 'utf8'));
    const preset = {id, name: definition.name, category: definition.category, template: definition.template,
        fadeIn: definition.timing['fade-in-ticks'], minimum: definition.timing['minimum-ticks'],
        fadeOut: definition.timing['fade-out-ticks'], captions: definition.captions.enabled, definition};
    if (definition.appearance.image) {
        const imageName = path.basename(definition.appearance.image);
        fs.copyFileSync(path.join(plugin, 'src/main/resources/images', imageName), path.join(assets, imageName));
        preset.image = 'assets/' + imageName;
    }
    catalog.push(preset);
}
catalog.sort((a,b) => Number(b.id === 'frameui') - Number(a.id === 'frameui') || Number(!!b.definition) - Number(!!a.definition));
const output = `/* Generated from the FrameUI plugin shader; run npm run refresh -- <FrameUI project path>. */\nwindow.FrameStudioCatalog = ${JSON.stringify(catalog)};\nwindow.FrameStudioShader = ${JSON.stringify(fragment)};\n`;
fs.writeFileSync(path.join(site, 'dist/shaders.js'), output);
fs.writeFileSync(path.join(site, 'test/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
const fixtures = path.join(site, 'test/fixtures/effects');
fs.mkdirSync(fixtures, {recursive: true});
for (const name of fs.readdirSync(path.join(plugin, 'src/main/resources/effects'))) {
    if (name.endsWith('.yml')) fs.copyFileSync(path.join(plugin, 'src/main/resources/effects', name), path.join(fixtures, name));
}
console.log(`Generated preview for 50 shaders and ${catalog.length - 50} ready-made loading screens.`);
