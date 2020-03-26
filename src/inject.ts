type MessageEventRW = Omit<MessageEvent, 'data'> & { data: any };

// tslint:disable-next-line: function-name
function fixMessageEventData(o: MessageEvent): MessageEventRW {
    const tmpData = o.data;
    Object.defineProperty(o, 'data', { writable: true });
    (o as MessageEventRW).data = tmpData;
    return o;
}


let sequence = 0;
const imageDataCallbacks: { [key: number]: (data: any) => void } = {};

function websocketMessageEventHook(event: MessageEventRW, continueSocket: () => {}) {
    let obj: any;
    try {
        obj = JSON.parse(event.data);
    } catch (err) {
        console.error(err);
        return true;
    }

    if (obj.type !== 'stepByStep') return true;

    // request image data from content script
    const seq = sequence++;
    imageDataCallbacks[seq] = (imageData) => {
        if (imageData) {
            const wsImg = obj.pod.subpods[0].img;
            wsImg.src = imageData.src;
            wsImg.width = imageData.width;
            wsImg.height = imageData.height;
            event.data = JSON.stringify(obj);
        }
        continueSocket();
    };
    window.postMessage(
        { seq: seq, type: 'msImageDataReq', query: obj.query, podID: obj.pod.id },
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

function setupImageDataResponseHandler() {
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data.type !== 'msImageDataResp') return;

        const handler = imageDataCallbacks[event.data.seq];
        if (handler) {
            handler(event.data.imageData);
            delete imageDataCallbacks[event.data.seq];
        }
    });
}


setupImageDataResponseHandler();
setupWebsocketHook();
