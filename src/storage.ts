const __storage = chrome.storage.sync;  // tslint:disable-line: variable-name
const __STORAGE_APPID_KEY = 'appid';

async function getWAAppID(): Promise<string> {
    return new Promise((resolve, reject) => {
        __storage.get(__STORAGE_APPID_KEY, data => resolve(data[__STORAGE_APPID_KEY]));
    });
}

async function setWAAppID(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
        __storage.set({ [__STORAGE_APPID_KEY]: id }, resolve);
    });
}
