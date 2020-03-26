type MessageType<T> = { backgroundCommand?: T, [key: string]: any };
type RespType<T extends keyof BackgroundCommand>
    = [ReturnType<BackgroundCommand[T]> | null, Error | null];

const baseUrl = 'https://api.wolframalpha.com/v2/query';
const apiCache: { [key: string]: object } = {};

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


async function getStepByStepImageDataFromAPI(appid: string, query: string, podID: string):
        Promise<{ [key: string]: string | null }> {
    const url = new URL(baseUrl);
    url.search = new URLSearchParams({
        appid: appid,
        input: query,
        podstate: `${podID}__Step-by-step solution`,
        format: 'image'
    }).toString();

    const response = await fetch(url.toString());
    const text = await response.text();
    const xml = (new DOMParser()).parseFromString(text, 'text/xml');
    const stepsImg = xml.querySelector(`pod[id="${podID}"] subpod[title~="steps"] img`);
    if (!stepsImg) {
        throw new Error('Couldn\'t find step-by-step subpod image in API response');
    }

    return [...stepsImg.attributes].reduce(
        (attrs, a) => {
            attrs[a.nodeName] = a.nodeValue;
            return attrs;
        },
        {} as { [key: string]: string | null }
    );
}


// set up listener for content script
chrome.runtime.onMessage.addListener(<T extends keyof BackgroundCommand>(
    message: MessageType<T>,
    sender: any,
    sendResponse: <K extends keyof BackgroundCommand>(r: RespType<K>) => void
): boolean | void => {
    if (!message.backgroundCommand) return;

    // https://github.com/microsoft/TypeScript/issues/31904 :(
    switch (message.backgroundCommand) {
    case 'fetchStepsAPI':
        getWAAppID()
            .then(async (id) => {
                if (!id) throw new Error('No app ID set');

                if (message.query in apiCache) {
                    console.debug(`Found data for query \'${message.query}\' in cache`);
                    return apiCache[message.query];
                }
                console.debug(`Retrieving data for query \'${message.query}\'`);
                const img = await getStepByStepImageDataFromAPI(id, message.query, message.podID);
                apiCache[message.query] = img;
                console.debug(`Stored data for query \'${message.query}\' in cache`);
                return img;
            })
            .then(img => sendResponse<'fetchStepsAPI'>([img, null]))
            .catch(err => sendResponse<'fetchStepsAPI'>([null, err]));
        return true;
    default:
        throw new Error(`Unknown command ${message.backgroundCommand}`);
    }
});


// set up app ID prompt
chrome.browserAction.onClicked.addListener(async (tab) => {
    const oldAppID = await getWAAppID();
    const newAppID = prompt('Enter your Wolfram|Alpha app ID:', oldAppID);
    if (newAppID === null) return;  // 'cancel' selected

    if (newAppID) await setWAAppID(newAppID);
    else          alert('Invalid app ID');
});
