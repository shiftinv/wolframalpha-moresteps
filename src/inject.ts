// tslint:disable-next-line: function-name
function MessageEventRW(o: MessageEvent & { [key: string]: any }): MessageEvent {
    const newobj: any = {};
    newobj.bubbles = o.bubbles || false;
    newobj.cancelBubble = o.cancelBubble || false;
    newobj.cancelable = o.cancelable || false;
    newobj.currentTarget = o.currentTarget || null;
    newobj.data = o.data || null;
    newobj.defaultPrevented = o.defaultPrevented || false;
    newobj.eventPhase = o.eventPhase || 0;
    newobj.lastEventId = o.lastEventId || '';
    newobj.origin = o.origin || '';
    newobj.path = o.path || [];
    newobj.ports = o.parts || [];
    newobj.returnValue = o.returnValue || true;
    newobj.source = o.source || null;
    newobj.srcElement = o.srcElement || null;
    newobj.target = o.target || null;
    newobj.timeStamp = o.timeStamp || null;
    newobj.type = o.type || 'message';
    newobj.__proto__ = o.__proto__ || (MessageEvent as any).__proto__;
    return newobj;
}


let sequence = 0;
const imageUrlCallbacks: { [key: number]: (url: string) => void } = {};

function websocketMessageEventHook(event: MessageEvent, continueSocket: () => {}) {
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
            (event as any).data = JSON.stringify(obj);
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
                console.log('hooking listener');
                const origListener = listener;
                newListener = (event, ...args2) => {
                    const newEvent = MessageEventRW(event);
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
