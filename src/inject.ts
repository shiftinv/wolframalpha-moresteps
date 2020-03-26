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

function websocketMessageEventHook(event: MessageEventRW, continueSocket: () => any) {
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
            obj.host = imageData.host;

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


function observerCallback(el: Element) {
    function checkSBS(e: Element) {
        // check if node is step-by-step block based on presence of a header image in parent
        return !!e.querySelector('img[alt="SBS_HEADER"]');
    }

    // layout:
    //   <section>      [1]
    //     <header />
    //     <section />
    //     <div />      [2] (=> contains image)
    //     <section />  [3] (=> contains pro footer)
    //     <button />
    //   </section>
    //
    // handle two separate situations:
    //  1. step-by-step solution was opened before image was loaded:
    //    - div(2) and section(3) are added separately
    //  2. step-by-step solution was opened after image was loaded:
    //    - a new section(1) containing both div(2) and section(3) is added

    switch (el.nodeName.toLowerCase()) {
    case 'section':
        if (checkSBS(el)) {
            // if node itself is the SBS section, call function again with every child
            let hasDiv = false;
            for (const child of el.children) {
                if (child.nodeName.toLowerCase() === 'div') {
                    hasDiv = true;
                    break;
                }
            }
            if (hasDiv) {
                for (const child of el.children) {
                    observerCallback(child);
                }
            }
        } else {
            // remove section if it's the pro footer
            if (!el.querySelector('a[href*="/pro/"]')) break;
            if (!checkSBS(el.parentElement!)) break;
            el.remove();
        }
        break;

    case 'div':
        // replace div containing the original step-by-step image with the image itself
        if (!checkSBS(el.parentElement!)) break;
        const img = el.querySelector('img[src*="Calculate/MSP"]') as HTMLImageElement;
        if (!img) break;

        img.className = el.className;
        img.style.margin = '20px';
        el.replaceWith(img);
        break;
    }
}

function setupObserver() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                observerCallback(node as Element);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });

    console.info('Successfully initialized observer');

    return observer;
}


// initialize websocket hook
setupImageDataResponseHandler();
setupWebsocketHook();


// initialize DOM observer
console.info('Initializing Wolfram|Alpha MoreSteps');
if (document.readyState !== 'loading') {
    setupObserver();
} else {
    document.addEventListener('DOMContentLoaded', setupObserver);
}
