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


class APIClient {
    private static baseUrl = 'https://api.wolframalpha.com/v2/query';

    private static findStepsImg(json: any, podID: string) {
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

    static async getStepByStepImageDataFromAPI(appid: string, query: string, podID: string):
            Promise<{ [key: string]: string | null }> {
        const url = new URL(this.baseUrl);
        url.search = new URLSearchParams({
            appid: appid,
            input: query,
            podstate: `${podID}__Step-by-step solution`,
            format: 'image',
            output: 'json'
        }).toString();

        const response = await fetch(url.toString());
        const resultJson = (await response.json()).queryresult;
        const imgData = this.findStepsImg(resultJson, podID);
        return { ...imgData, host: resultJson.host };
    }
}

class Messaging {
    private static contentMessageHandler(message: any, sender: any, sendResponse: (r: any) => void):
            boolean | void {
        if (!message.fetchSteps) return;
        const data = message.fetchSteps;

        ExtStorage.getWAAppID()
            .then(async (id) => {
                if (!id) throw new Error('No app ID set');

                console.debug(`Retrieving data for query \'${data.query}\' (podID: \'${data.podID}\')`);
                const img = await APIClient.getStepByStepImageDataFromAPI(
                    id, data.query, data.podID
                );
                console.debug(`Received data for query: \'${data.query}\' (podID: \'${data.podID}\'):\n${JSON.stringify(img)}`
                );
                return img;
            })
            .then(img => sendResponse([img, null]))
            .catch(err => sendResponse([null, err]));
        return true;
    }

    static init() {
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
        chrome.runtime.onMessage.addListener(this.contentMessageHandler.bind(this));
    }
}


// set up app ID prompt
chrome.browserAction.onClicked.addListener(async (tab) => {
    const oldAppID = await ExtStorage.getWAAppID();
    const newAppID = prompt('Enter your Wolfram|Alpha app ID:', oldAppID);
    if (newAppID === null) return;  // 'cancel' selected

    if (newAppID) await ExtStorage.setWAAppID(newAppID);
    else          alert('Invalid app ID');
});


Messaging.init();


export {};
