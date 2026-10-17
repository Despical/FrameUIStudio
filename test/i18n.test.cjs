const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture(query = '', stored, browser = ['en']) {
    const events = [], writes = [];
    const location = new URL('http://localhost/studio/' + query + '#server=' + 'a'.repeat(43));
    const context = {window:{dispatchEvent:event => events.push(event)}, URL, URLSearchParams, navigator:{languages:browser}, location,
        localStorage:{getItem:()=>stored,setItem:(key,value)=>writes.push({key,value})},
        history:{replaceState:(_a,_b,url)=>{location.href=String(url);}},
        CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}, NodeFilter:{SHOW_TEXT:4},
        document:{documentElement:{},title:'',getElementById:()=>null,createTreeWalker:()=>({nextNode:()=>false}),querySelectorAll:()=>[]}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../dist/i18n-data.js'),'utf8'),context);
    vm.runInNewContext(fs.readFileSync(require.resolve('../dist/i18n.js'),'utf8'),context);
    return {api:context.window.FrameStudioI18n,data:context.window.FrameStudioTranslations,context,events,writes};
}
test('all 28 catalogs contain the same complete UI and preserve interpolation fields', () => {
    const {data}=fixture(), codes=Object.keys(data.languages), keys=Object.keys(data.messages.en);
    assert.equal(codes.length,28); assert.ok(keys.length>=700);
    const placeholders=value=>(value.match(/\{\d+\}/g)||[]).sort();
    for(const code of codes) {
        assert.deepEqual(Object.keys(data.messages[code]).sort(),[...keys].sort(),code);
        for(const key of keys) assert.deepEqual(placeholders(data.messages[code][key]),placeholders(key),code+': '+key);
        for(const brand of ['Discord','BuiltByBit','Hub','GitHub','SpigotMC']) assert.equal(data.messages[code][brand],brand,code);
    }
});
test('server language takes precedence and Singapore regional codes normalize', () => {
    assert.equal(fixture('?lang=ms-SG','tr',['en']).api.language,'ms');
    assert.equal(fixture('?lang=ta_SG').api.language,'ta');
    assert.equal(fixture('?lang=zh-SG').api.language,'zh');
    assert.equal(fixture('?lang=unknown','de',['tr']).api.language,'de');
    assert.equal(fixture('','unknown',['ja-JP']).api.language,'en');
    assert.equal(fixture('',undefined,['tr-TR']).api.language,'en');
    assert.equal(fixture('','tr',['en']).api.language,'tr');
    assert.equal(fixture('','unknown',['xx']).api.language,'en');
});
test('language switches preserve the server fragment and only persist a language preference', () => {
    const {api,context,writes,events}=fixture('?lang=en');
    api.setLanguage('ar');
    assert.equal(context.document.documentElement.dir,'rtl');
    assert.equal(context.location.hash,'#server='+'a'.repeat(43));
    assert.equal(context.location.search,'?lang=ar');
    assert.deepEqual(writes,[{key:'frameui-studio-language',value:'ar'}]);
    api.setLanguage('he'); assert.equal(context.document.documentElement.dir,'rtl');
    api.setLanguage('tr'); assert.equal(context.document.documentElement.dir,'ltr');
    assert.equal(events.length,3);
    assert.equal(api.t('Export effect'),'Efekti dışa aktar');
    const injected='<img src=x onerror=alert(1)>$&';
    assert.ok(api.t('Delete {0}',injected).includes(injected));
    assert.equal(api.t('Permanently delete “My Effect”? This action cannot be undone.'),'“My Effect” kalıcı olarak silinsin mi? Bu işlem geri alınamaz.');
});

test('every language translates destructive dialogs and has localized language names and offline flags', () => {
    const {api,data}=fixture();
    for (const code of Object.keys(data.languages)) {
        api.setLanguage(code);
        for (const key of ['Delete permanently?','Cancel','Delete permanently','Connect your server','Close server connection']) {
            assert.ok(data.messages[code][key],code+': '+key);
            if(code !== 'en') assert.notEqual(api.t(key),key,code+': '+key);
        }
        for (const language of Object.keys(data.languages)) {
            assert.ok(data.languageNames[code][language],code+': '+language);
            assert.ok(fs.existsSync(require('node:path').join(__dirname,'../dist/flags',api.flags[language]+'.svg')));
        }
    }
    api.setLanguage('tr');
    assert.equal(api.languageName('en'),'İngilizce');
    assert.equal(api.languageName('de'),'Almanca');
    api.setLanguage('de');
    assert.equal(api.languageName('tr'),'Türkisch');
});

test('translated stock labels and copy badges preserve authored effect names and command values', () => {
    const {api}=fixture('?lang=tr');
    assert.equal(api.displayName('Square Zoom'),'Kare Yakınlaştırma');
    assert.equal(api.displayName('Square Zoom · Copy 2'),'Kare Yakınlaştırma · Kopya 2');
    const custom='My <server> effect · Copy 2';
    assert.equal(api.displayName(custom),custom);
    assert.equal(api.t('Run {0} in Minecraft.','/frameui editor'),'Minecraft içinde /frameui editor komutunu çalıştır.');
    assert.ok(api.seconds(1.5).includes('sn'));
    api.setLanguage('en');
    assert.equal(api.displayName('Square Zoom · Copy 2'),'Square Zoom · Copy 2');
});
