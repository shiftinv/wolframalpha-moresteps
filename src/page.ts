type MessageEventRW = Omit<MessageEvent, 'data'> & { data: any };
type WebSocketListener = (this: WebSocket, ev: MessageEvent) => any;

class WebsocketHook {
    private static webSocketQueues = new Map<WebSocketListener, Map<MessageEvent, boolean>>();
    static newImages = new Set<string>();

    private static fixMessageEventData(o: MessageEvent): MessageEventRW {
        const tmpData = o.data;
        Object.defineProperty(o, 'data', { writable: true });
        (o as MessageEventRW).data = tmpData;
        return o;
    }

    private static websocketMessageEventHook(event: MessageEventRW, continueProcessing: () => any):
            boolean {
        let obj: any;
        try {
            obj = JSON.parse(event.data);
        } catch (err) {
            ErrorHandler.processError(
                `Error parsing WebSocket json`,
                {
                    'Error': err,
                    'JSON string': event.data
                }
            );
            return false;
        }

        // handle stepByStep packets only
        if (obj.type !== 'stepByStep') return false;
        // don't try to replace solutions with multiple steps
        if ('deploybuttonstates' in obj.pod
            || 'stepbystepcontenttype' in obj.pod.subpods[0]) return false;

        console.info(
            'got packet:\n',
            obj
        );

        // request image data from content script
        Messaging.sendMessage({ type: 'msImageDataReq', query: obj.query, podID: obj.pod.id })
            .then((imageData) => {
                try {
                    if (imageData) {
                        obj.host = imageData.host;

                        const wsImg = obj.pod.subpods[0].img;
                        wsImg.src = imageData.src;
                        wsImg.width = imageData.width;
                        wsImg.height = imageData.height;

                        event.data = JSON.stringify(obj);

                        this.newImages.add(wsImg.src);
                    }
                } catch (e) {
                    ErrorHandler.processError(
                        `Error reading new image data:\n${e}`,
                        {
                            'Error': e,
                            'Image data': imageData
                        }
                    );
                }

                continueProcessing();
            });

        return true;
    }

    private static enqueueMessageForListener(listener: WebSocketListener, ev: MessageEvent) {
        if (!this.webSocketQueues.has(listener)) {
            this.webSocketQueues.set(listener, new Map());
        }
        const queue = this.webSocketQueues.get(listener)!;
        queue.set(ev, false);
    }

    private static handleMessageForListener(
        listener: WebSocketListener,
        ev: MessageEvent,
        thisArg: WebSocket
    ) {
        const queue = this.webSocketQueues.get(listener)!;
        const currStatus = queue.get(ev);
        if (currStatus !== false) {
            // don't handle
            //   - already finished messages (status: true)
            //   - messages not contained in queue (status: undefined)
            // (just to make sure, in theory this should never happen)
            ErrorHandler.processError(
                `Unexpected status for event in queue: ${currStatus}`,
                {
                    'Event data': ev
                }
            );
            return;
        }
        queue.set(ev, true);

        // process queue from the start until incomplete entry is found
        //  (this relies on the fact that Map entries are iterated in insertion order)
        for (const [currEv, isDone] of queue) {
            if (!isDone) break;
            queue.delete(currEv);
            listener.apply(thisArg, [currEv]);
        }
    }

    private static buildNewListener(origListener: WebSocketListener): WebSocketListener {
        console.info('Hooking websocket message listener');
        return function (this: WebSocket, event: MessageEvent) {
            // handle new message
            const newEvent = WebsocketHook.fixMessageEventData(event);

            WebsocketHook.enqueueMessageForListener(origListener, newEvent);
            const continueProcessing = () =>
                WebsocketHook.handleMessageForListener(origListener, newEvent, this);

            try {
                // returns true if event will be handled asynchronously
                if (!WebsocketHook.websocketMessageEventHook(newEvent, continueProcessing)) {
                    continueProcessing();
                }
            } catch (e) {
                ErrorHandler.processError(
                    `Error in websocket message hook:\n${e}`,
                    {
                        'Error': e,
                        'Event': newEvent
                    }
                );
            }
        };
    }

    static init() {
        console.info('Initializing websocket hook');
        const origAddEventListener = window.WebSocket.prototype.addEventListener;
        window.WebSocket.prototype.addEventListener =
            function (type: string, listener: (this: WebSocket, ev: any) => any, ...args: any[]) {
                const newListener = type === 'message'
                    ? WebsocketHook.buildNewListener(listener)  // hook listener
                    : listener;
                return origAddEventListener.apply(this, [type, newListener, ...args] as any);
            };
    }
}


class Messaging {
    private static sequence = 0;
    private static dataCallbacks: { [key: number]: (data: any) => void } = {};

    static init() {
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            if (event.data.type !== 'msImageDataResp') return;

            const handler = this.dataCallbacks[event.data.seq];
            if (handler) {
                handler(event.data.data);
                delete this.dataCallbacks[event.data.seq];
            }
        });
    }

    static async sendMessage(data: { [key: string]: any }): Promise<any> {
        const seq = this.sequence++;
        const promise = new Promise(resolve => this.dataCallbacks[seq] = resolve);
        window.postMessage(
            { seq: seq, ...data },
            '*'
        );
        return promise;
    }
}


class Observer {
    private static fixSectionForDiv(div: Element) {
        const img = div.querySelector('img[src*="Calculate/MSP"]') as HTMLImageElement;
        if (!img || !WebsocketHook.newImages.has(img.src)) return;

        console.info('found div with image');

        // remove pro footer
        for (const child of div.parentElement!.children) {
            if (child.nodeName.toLowerCase() === 'section'
                    && child.querySelector('a[href*="/pro/"]')) {
                child.remove();
            }
        }

        // replace div with new image
        img.className = div.className;
        img.style.margin = '20px';
        div.replaceWith(img);
    }

    private static observerCallback(el: Element) {
        const isStepByStep = (e: Element | null): boolean => {
            // check if node is step-by-step block based on presence of a header image
            return !!(e && e.querySelector('img[alt="SBS_HEADER"]'));
        };

        // container layout:
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
        //    - div(2) is added separately
        //  2. step-by-step solution was opened after image was loaded:
        //    - a new section(1) containing the div(2) is added

        switch (el.nodeName.toLowerCase()) {
        case 'section':
            // if node itself is the SBS section, call function on the div children
            if (!isStepByStep(el)) break;
            [...el.children]
                .filter(c => c.nodeName.toLowerCase() === 'div')
                .forEach(c => this.fixSectionForDiv(c));
            break;

        case 'div':
            if (!isStepByStep(el.parentElement)) break;
            this.fixSectionForDiv(el);
            break;
        }
    }

    static init() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    this.observerCallback(node as Element);
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
}


Messaging.init();
WebsocketHook.init();

// initialize DOM observer
if (document.readyState !== 'loading') {
    Observer.init();
} else {
    document.addEventListener('DOMContentLoaded', () => Observer.init());
}


export {};
