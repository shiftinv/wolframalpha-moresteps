/**
 * Script for copying static resources/files and building a browser-specific extension manifest
 *
 * Usage: node scripts/build_target.js chrome|firefox
 */

const fs = require('fs-extra');
const path = require('path');
const merge = require('deepmerge');


const sourceDir = 'src/';
const targetDir = 'dist/';

const manifestExtras = {
    chrome: {
        background: {
            persistent: false
        }
    },
    firefox: {
        browser_specific_settings: {
            gecko: {
                id: 'wolframalpha-moresteps@example.com'
            }
        }
    }
};


const _err = console.error.bind(console, '[-]');
const _log = console.log.bind(console, '[+]');
const _info = console.info.bind(console, '[i]');

function usage() {
    _err('Invalid arguments!');
    _err(`>> Usage: ${process.argv[0]} ${process.argv[1]} (${targets.join('|')})`);
    process.exit(1);
}


// check args
if (process.argv.length !== 3) usage();

const target = process.argv[2];
if (!Object.keys(manifestExtras).includes(target)) usage();

_log(`Building target '${target}'`);

// run build steps
checkDirs();
patchManifest(manifestExtras[target]);
copyStaticFiles();
fixWebExtPolyfill();

_log('Done.');


function checkDirs() {
    _info('Checking directories');

    if (!fs.existsSync(sourceDir)) {
        _err(`Source directory '${sourceDir}' does not exist!`);
        process.exit(1);
    }

    if (!fs.existsSync(targetDir)) {
        _info(`Target directory '${targetDir}' does not exist, creating...`);
        fs.mkdirSync(targetDir);
    }
}

function patchManifest(obj) {
    _info(`Merging manifest.json with:\n${JSON.stringify(obj, null, 4)}`);

    // read base manifest
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'manifest.json'), 'utf8'));

    // merge with extra values
    const newManifest = merge(manifest, obj);

    // write new manifest
    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(newManifest, null, 4), 'utf8');
}

function copyStaticFiles() {
    _info('Copying static files');
    fs.copySync(path.join(sourceDir, 'static'), path.join(targetDir));
}

function fixWebExtPolyfill() {
    if (target === 'firefox') {
        // remove webext polyfill, not required for firefox
        _info('Truncating WebExtension polyfill for Firefox');
        fs.truncateSync(path.join(targetDir, 'js/lib/webextension-polyfill@0.6.0.js'));
    }
}
