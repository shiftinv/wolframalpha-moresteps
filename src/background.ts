type MessageType<T> = { backgroundCommand?: T, [key: string]: any };
type RespType<T extends keyof BackgroundCommand> = [BackgroundCommand[T] | null, Error | null];

const urlCache: { [key: string]: string } = {};

chrome.runtime.onMessage.addListener(
<T extends keyof BackgroundCommand>
(message: MessageType<T>, sender: any,
 sendResponse: <K extends keyof BackgroundCommand>(r: RespType<K>) => void) => {
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
    case 'fetch':
        fetch(message.input, message.info)
            .then(response => response.text())
            .then(text => sendResponse<'fetch'>([text, null]))
            .catch(err => sendResponse<'fetch'>([null, err]));
        return true;
    default:
        throw new Error(`Unknown command ${message.backgroundCommand}`);
    }
});


chrome.browserAction.onClicked.addListener(async (tab) => {
    const oldAppID = await getWAAppID();
    const newAppID = prompt('Enter your Wolfram|Alpha app ID:', oldAppID);
    if (newAppID === null) return;  // 'cancel' selected

    if (newAppID) await setWAAppID(newAppID);
    else          alert('Invalid app ID');
});
