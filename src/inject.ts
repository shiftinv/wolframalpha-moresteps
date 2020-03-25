type MessageEventRW = Omit<MessageEvent, 'data'> & { data: any };

// tslint:disable-next-line: function-name
function fixMessageEventData(o: MessageEvent): MessageEventRW {
    const tmpData = o.data;
    Object.defineProperty(o, 'data', { writable: true });
    (o as MessageEventRW).data = tmpData;
    return o;
}


let sequence = 0;
const imageUrlCallbacks: { [key: number]: (url: string) => void } = {};

function websocketMessageEventHook(event: MessageEventRW, continueSocket: () => {}) {
    let obj: any;
    try {
        obj = JSON.parse(event.data);
    } catch (err) {
        console.error(err);
        return true;
    }

    if (obj.type !== 'stepByStep') return true;

    // request image url from content script
    const seq = sequence++;
    imageUrlCallbacks[seq] = (url) => {
        if (url) {
            obj.pod.subpods[0].img.src = url;
            event.data = JSON.stringify(obj);
        }
        continueSocket();
    };
    window.postMessage(
        { seq: seq, type: 'msImageUrlReq', query: obj.query, podID: obj.pod.id },
        '*'
    );

    return false;
}

function setupWebsocketHook() {
    console.log('initializing websocket hook');
    const origAddEventListener = window.WebSocket.prototype.addEventListener;
    window.WebSocket.prototype.addEventListener =
        function (type: string, listener: (this: WebSocket, ev: any) => any, ...args: any[]) {
            let newListener = listener;
            if (type === 'message') {
                // hook listener
                const origListener = listener;
                newListener = (event, ...args2) => {
                    const newEvent = fixMessageEventData(event);
                    const continueSocket = origListener.bind(this, newEvent, ...args2);

                    // returns false if event will be handled asynchronously
                    if (websocketMessageEventHook(newEvent, continueSocket)) {
                        continueSocket();
                    }
                };
            }
            return origAddEventListener.apply(this, [type, newListener, ...args] as any);
        };
}

function setupImageUrlResponseHandler() {
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data.type !== 'msImageUrlResp') return;

        const handler = imageUrlCallbacks[event.data.seq];
        if (handler) {
            handler(event.data.url);
            delete imageUrlCallbacks[event.data.seq];
        }
    });
}


setupImageUrlResponseHandler();
setupWebsocketHook();
