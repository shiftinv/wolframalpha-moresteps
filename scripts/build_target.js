const fs = require('fs');
const path = require('path');
const merge = require('deepmerge');


const targets = ['chrome', 'firefox'];

const sourceDir = 'src/';
const targetDir = 'dist/';


const webextPolyfill = 'js/lib/webextension-polyfill@0.6.0.js'

const manifestExtras = {
    chrome: {},
    firefox: {
        browser_specific_settings: {
            gecko: {
                id: 'wolframalpha-moresteps@example.com'
            }
        }
    }
};


function usage() {
    console.error('Invalid arguments!');
    console.error(
        `>> Usage: ${process.argv[0]} ${process.argv[1]} (${targets.join('|')})`
    );
    process.exit(1);
}

function patchManifest(obj) {
    // read base manifest
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'manifest.json'), 'utf8'));

    // merge with extra values
    console.log(`Merging manifest.json with:\n${JSON.stringify(obj, null, 4)}`);
    const newManifest = merge(manifest, obj);

    // write new manifest
    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(newManifest, null, 4), 'utf8');
}

// check args
if (process.argv.length !== 3) usage();

const target = process.argv[2];
if (!targets.includes(target)) usage();


// handle targets
patchManifest(manifestExtras[target]);

switch (target) {
case 'chrome':
    break;
case 'firefox':
    // remove webext polyfill, not required for firefox
    fs.truncateSync(path.join(targetDir, webextPolyfill));
    break;
}

