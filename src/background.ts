const baseUrl = 'https://api.wolframalpha.com/v2/query';
const apiCache: { [key: string]: any } = {};

class ExtStorage {
    private static readonly storage = chrome.storage.sync;
    private static readonly STORAGE_APPID_KEY = 'appid';

    static async getWAAppID(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.storage.get(this.STORAGE_APPID_KEY, data => resolve(data[this.STORAGE_APPID_KEY]));
        });
    }

    static async setWAAppID(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.storage.set({ [this.STORAGE_APPID_KEY]: id }, resolve);
        });
    }
}


function findStepsImg(json: any, podID: string) {
    let img: any;
    for (const pod of json.pods) {
        if (pod.id === podID) {
            for (const subpod of pod.subpods) {
                if (subpod.title.includes('steps') && 'img' in subpod) {
                    img = subpod.img;
                    break;
                }
            }
        }
        if (img) break;
    }

    if (!img) {
        throw new Error('Couldn\'t find step-by-step subpod image in API response');
    }
    return img;
}

async function getStepByStepImageDataFromAPI(appid: string, query: string, podID: string):
        Promise<{ [key: string]: string | null }> {
    const url = new URL(baseUrl);
    url.search = new URLSearchParams({
        appid: appid,
        input: query,
        podstate: `${podID}__Step-by-step solution`,
        format: 'image',
        output: 'json'
    }).toString();

    const response = await fetch(url.toString());
    const resultJson = (await response.json()).queryresult;
    const imgData = findStepsImg(resultJson, podID);
    return { ...imgData, host: resultJson.host };
}


// fix Error serialization
if (!('toJSON' in Error.prototype)) {
    Object.defineProperty(Error.prototype, 'toJSON', {
        value: function () {
            const alt: any = {};
            Object.getOwnPropertyNames(this).forEach(n => alt[n] = this[n]);
            return alt;
        },
        configurable: true,
        writable: true
    });
}


// set up listener for content script
chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (r: any) => void):
        boolean | void => {
    if (!message.fetchSteps) return;
    const data = message.fetchSteps;

    ExtStorage.getWAAppID()
        .then(async (id) => {
            if (!id) throw new Error('No app ID set');

            if (data.query in apiCache) {
                console.debug(`Found data for query \'${data.query}\' in cache`);
                return apiCache[data.query];
            }
            console.debug(`Retrieving data for query \'${data.query}\'`);
            const img = await getStepByStepImageDataFromAPI(id, data.query, data.podID);
            apiCache[data.query] = img;
            console.debug(`Stored data for query \'${data.query}\' in cache`);
            return img;
        })
        .then(img => sendResponse([img, null]))
        .catch(err => sendResponse([null, err]));
    return true;
});


// set up app ID prompt
chrome.browserAction.onClicked.addListener(async (tab) => {
    const oldAppID = await ExtStorage.getWAAppID();
    const newAppID = prompt('Enter your Wolfram|Alpha app ID:', oldAppID);
    if (newAppID === null) return;  // 'cancel' selected

    if (newAppID) await ExtStorage.setWAAppID(newAppID);
    else          alert('Invalid app ID');
});
