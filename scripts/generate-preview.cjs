/*
 * FrameUI Studio
 * Copyright (C) 2026 Berke Akçen
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 * This program is distributed WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the LICENSE file or <https://www.gnu.org/licenses/> for details.
 */
const fs = require('node:fs');
const path = require('node:path');
const site = path.resolve(__dirname, '..');
const plugin = path.resolve(process.argv[2] || path.join(site, '../FrameUI'));
const source = fs.readFileSync(path.join(plugin, 'src/main/resources/pack/assets/minecraft/shaders/core/text.fsh'), 'utf8');
const java = fs.readFileSync(path.join(plugin, 'src/main/java/dev/despical/frameui/loading/LoadingEffect.java'), 'utf8');
const catalog = [...java.matchAll(/\w+\("([^"]+)", "([^"]+)", "([^"]+)", (\d+), (\d+), (\d+), (\d+), (true|false)\)/g)].map(match => ({ id: match[1], name: match[2], category: match[3], shaderId: Number(match[4]), fadeIn: Number(match[5]), minimum: Number(match[6]), fadeOut: Number(match[7]), captions: match[8] === 'true' }));
if (catalog.length !== 50) throw new Error('Expected 50 stable effect templates.');
// Detect whether each template actually consumes the speed-scaled clock. Transition-only
// shaders use coverage instead, so Studio must not offer a speed slider for those screens.
function templateUsesMotion(id) {
    const body = source.slice(source.indexOf('vec4 frameTemplateEffect(int effect)'), source.indexOf('// FRAMEUI_COMPOSITION_BEGIN'));
    for (const match of body.matchAll(/^    if \((effect [^)\n]+)\)\s*/gm)) {
        const matches = match[1].split('||').some(or => or.split('&&').every(part => {
            const comparison = part.trim().match(/^effect\s*(==|>=|<=|>|<)\s*(\d+)$/);
            if (!comparison) throw new Error('Unrecognized template condition: '+part);
            const number = Number(comparison[2]);
            return comparison[1] === '==' ? id === number : comparison[1] === '>=' ? id >= number : comparison[1] === '<=' ? id <= number : comparison[1] === '>' ? id > number : id < number;
        }));
        if (!matches) continue;
        const start = match.index + match[0].length;
        let end = body.indexOf('\n',start);
        if (body[start] === '{') {
            let depth = 1; end = start + 1;
            while (depth && end < body.length) { if (body[end] === '{') depth++; if (body[end] === '}') depth--; end++; }
        }
        return /\bseconds\b|frameLoadingBackground\s*\(/.test(body.slice(start,end));
    }
    return id === 0;
}
for (const template of catalog) template.ambientMotion = templateUsesMotion(template.shaderId);
const begin = source.indexOf('vec3 frameLoadingBackground()');
const end = source.indexOf('\nvoid main()',begin);
if (begin < 0 || end < 0) throw new Error('Plugin shader routines could not be found.');
// Keep the complete background, image reveal and widget composition routines shared.
// Only texture sampling and vertex placement differ between WebGL and Minecraft.
const functions = source.slice(begin,end)
    .replace(/frameSeconds\(\)\s*\*\s*frameSpeed\(frameLoadingEffect\)/g,'uTime * uSpeed')
    .replace(/vec4 framePicture\(\) \{[\s\S]*?\n\}/,'');
if (/GameTime|Sampler0|texCoord0/.test(functions)) throw new Error('Preview retained a Minecraft texture dependency.');
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
uniform bool uGrowingTitle;
uniform vec4 uPlacement;
uniform vec4 uIndicator;
uniform int uDecoration;
uniform float uProgressScale;
uniform vec2 uImageStretch;
vec4 frameTextPlacement(int effect) { return vec4(0.64, 1.0, 0.5, uProgressScale); }
int frameBackgroundStyle(int effect) { return uBackgroundStyle; }
int frameDecoration(int effect) { return uDecoration; }
vec4 frameIndicator(int effect) { return uIndicator; }
vec3 frameElementBase(int effect) { return uBackground; }
vec3 frameElementAccent(int effect) { return uPrimary; }
int frameTemplate(int effect) { return effect; }
float frameIntensity(int effect) { return uIntensity; }
bool frameGrowingTitle(int effect) { return uGrowingTitle; }
float frameImageMotion(int effect) { return uImageMotion == 2 ? -uSpeed : uImageMotion == 1 ? uSpeed : 0.0; }
int frameImageAnimation(int effect) { return uImageAnimation; }
vec4 frameImagePlacement(int effect) { return uPlacement; }
vec3 frameImage(int effect) { return vec3(uImageSize.x / uImageSize.y, uContain ? 1.0 : 0.0, uImageOpacity); }
vec3 framePalette(int effect, vec3 color) {
    if (uCustom == 0) return color;
    float luma = clamp(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    return luma < 0.5 ? mix(uBackground,uPrimary,luma*2.0) : mix(uPrimary,uSecondary,(luma-0.5)*2.0);
}
${functions}
void main() {
    vec4 effect = frameEffect();
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
        if (uImageAnimation == 7) offset.x = (1.0 - progress) * 0.35;
        if (uImageAnimation == 8) offset.y = -(1.0 - progress) * 0.24;
        float grow = uImageAnimation == 2 ? max(0.001, 1.0 - pow(1.0 - progress, 3.0)) : 1.0;
        vec2 point = (sampleUv - uPlacement.xy - offset) / (uPlacement.z * grow * uImageStretch) * scale + 0.5;
        if (point.x >= 0.0 && point.x <= 1.0 && point.y >= 0.0 && point.y <= 1.0) {
            effect = frameOver(effect,framePictureColor(texture2D(uImage,point)));
        }
    }
    gl_FragColor = frameOver(effect,frameWidgets());
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
const licenseHeader = fs.readFileSync(__filename, 'utf8').split(' */')[0] + ' */\n';
fs.writeFileSync(path.join(site, 'dist/shaders.js'), licenseHeader + output);
fs.writeFileSync(path.join(site, 'test/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
const fixtures = path.join(site, 'test/fixtures/effects');
fs.mkdirSync(fixtures, {recursive: true});
for (const name of fs.readdirSync(path.join(plugin, 'src/main/resources/effects'))) {
    if (name.endsWith('.yml')) fs.copyFileSync(path.join(plugin, 'src/main/resources/effects', name), path.join(fixtures, name));
}
console.log(`Generated preview for 50 shaders and ${catalog.length - 50} ready-made loading screens.`);
