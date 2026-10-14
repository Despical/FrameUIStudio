/* Copies plugin shader routines into the browser preview without Minecraft imports. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/main/resources/pack/assets/minecraft/shaders/core/text.fsh'), 'utf8');
const java = fs.readFileSync(path.join(root, 'src/main/java/dev/despical/frameui/loading/LoadingEffect.java'), 'utf8');
const catalog = [...java.matchAll(/\w+\("([^"]+)", "([^"]+)", "([^"]+)", (\d+), (\d+), (\d+), (\d+), (true|false)\)/g)].map(match => ({ id: match[1], name: match[2], category: match[3], shaderId: Number(match[4]), fadeIn: Number(match[5]), minimum: Number(match[6]), fadeOut: Number(match[7]), captions: match[8] === 'true' }));
if (catalog.length !== 50) throw new Error('Expected 50 stable effect templates.');
const begin = source.indexOf('vec3 frameLoadingBackground()');
const modern = source.includes('vec4 frameTemplateEffect(int effect)');
const end = source.indexOf(modern ? '\nvec4 frameEffect()' : '\nvoid main()', begin);
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
${functions}
void main() {
    vec4 effect = frameEffect();
    vec3 color = effect.rgb;
    if (uCustom == 1) {
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
        vec2 point = (uv - 0.5) * scale + 0.5;
        if (point.x >= 0.0 && point.x <= 1.0 && point.y >= 0.0 && point.y <= 1.0) {
            vec4 picture = texture2D(uImage, point);
            float pictureAlpha = picture.a * uImageOpacity * effect.a;
            float combinedAlpha = effect.a + pictureAlpha * (1.0 - effect.a);
            vec3 premultiplied = picture.rgb * pictureAlpha + color * effect.a * (1.0 - pictureAlpha);
            color = combinedAlpha > 0.00001 ? premultiplied / combinedAlpha : vec3(0.0);
            effect.a = combinedAlpha;
        }
    }
    gl_FragColor = vec4(color, effect.a);
}`;
const output = `/* Generated from the FrameUI plugin shader; run node web-editor/scripts/generate-preview.cjs. */\nwindow.FrameStudioCatalog = ${JSON.stringify(catalog)};\nwindow.FrameStudioShader = ${JSON.stringify(fragment)};\n`;
fs.writeFileSync(path.join(root, 'web-editor/dist/shaders.js'), output);
fs.writeFileSync(path.join(root, 'web-editor/test/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Generated preview for ${catalog.length} templates.`);
