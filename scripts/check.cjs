/* FrameUI Studio - Copyright (c) 2026 Berke Akçen. All rights reserved. */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
function walk(folder) {
    return fs.readdirSync(folder, {withFileTypes:true}).flatMap(entry => {
        const file = path.join(folder, entry.name);
        return entry.isDirectory() ? walk(file) : [file];
    });
}
const sources = ['dist','scripts','test'].flatMap(folder => walk(path.join(root, folder)));
for (const file of sources.filter(file => /\.(?:c?js)$/.test(file))) {
    const result = spawnSync(process.execPath, ['--check',file], {stdio:'inherit'});
    if (result.status !== 0) process.exit(result.status || 1);
}
const html = fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|data:|mailto:)/.test(target)) continue;
    const file = path.resolve(root,'dist',target.split(/[?#]/)[0]);
    if (!file.startsWith(path.join(root,'dist') + path.sep) || !fs.existsSync(file)) throw Error('Missing local asset: '+target);
}
const total = walk(path.join(root,'dist')).reduce((sum,file)=>sum+fs.statSync(file).size,0);
if (total > 100 * 1024 * 1024) throw Error('Static editor unexpectedly exceeds 100 MiB');
console.log('Syntax and static references checked; '+(total/1024/1024).toFixed(1)+' MiB deployable assets.');
