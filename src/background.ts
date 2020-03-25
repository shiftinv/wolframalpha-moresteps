type MessageType<T> = { backgroundCommand?: T, [key: string]: any };
type RespType<T extends keyof BackgroundCommand> = [BackgroundCommand[T] | null, Error | null];

const baseUrl = 'https://api.wolframalpha.com/v2/query';
const urlCache: { [key: string]: string } = {};

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
chrome.runtime.onMessage.addListener(
<T extends keyof BackgroundCommand>
(message: MessageType<T>, sender: any,
 sendResponse: <K extends keyof BackgroundCommand>(r: RespType<K>) => void): boolean | void => {
    if (!message.backgroundCommand) return;

    // https://github.com/microsoft/TypeScript/issues/31904 :(
    switch (message.backgroundCommand) {
    case 'urlCacheGet':
        sendResponse<'urlCacheGet'>([urlCache[message.query], null]);
        return;
    case 'urlCacheSet':
        urlCache[message.query] = message.url;
        sendResponse<'urlCacheSet'>([null, null]);
        return;
    case 'fetchAPI':
        getWAAppID()
            .then((id) => {
                if (!id) throw new Error('No app ID set');

                const url = new URL(baseUrl);
                url.search = new URLSearchParams({
                    appid: id,
                    ...message.params
                }).toString();

                return fetch(url.toString());
            })
            .then(response => response.text())
            .then(text => sendResponse<'fetchAPI'>([text, null]))
            .catch(err => sendResponse<'fetchAPI'>([null, err]));
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
