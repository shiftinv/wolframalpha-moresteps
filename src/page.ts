type MessageEventRW = Omit<MessageEvent, 'data'> & { data: any };
type WebSocketListener = (this: WebSocket, ev: MessageEvent) => any;

class WebsocketHook {
    private static currentAssumptions: string[] = [];
    static newImages = new Set<string>();

    private static fixMessageEventData(o: MessageEvent): MessageEventRW {
        const tmpData = o.data;
        Object.defineProperty(o, 'data', { writable: true });
        (o as MessageEventRW).data = tmpData;
        return o;
    }

    private static tryParseJSON(jsonStr: string): any {
        try {
            return JSON.parse(jsonStr);
        } catch (err) {
            ErrorHandler.processError(
                'Error parsing WebSocket json',
                {
                    'Error': err,
                    'JSON string': jsonStr
                }
            );
            throw err;
        }
    }

    private static websocketMessageEventHook(
        event: MessageEventRW, continueProcessing: () => any
    ): boolean {
        let obj: any;
        try {
            obj = this.tryParseJSON(event.data);
        } catch (err) {
            return false;
        }

        switch (obj.type) {
        case 'pods': {
            // collect pods with stepbystep subpods
            const podIDs: string[] = [];
            for (const pod of obj.pods) {
                const sbsState = pod.deploybuttonstates?.find((s: any) => s.stepbystep === true);
                if (sbsState) {
                    podIDs.push(pod.id);
                }
            }

            // prefetch
            if (podIDs.length > 0) {
                void Messaging.sendMessage<StepByStepPrefetchMessage>({
                    type: 'msImageDataPrefetch',
                    query: obj.input,
                    podIDs: podIDs,
                    assumptions: this.currentAssumptions
                });
            }
            return false;
        }

        case 'stepByStep': {
            // don't try to replace solutions with multiple steps
            if ('deploybuttonstates' in obj.pod
                || 'stepbystepcontenttype' in obj.pod.subpods[0]) return false;

            // request image data from content script
            void Messaging.sendMessage<StepByStepContentMessage>({
                type: 'msImageDataReq',
                query: obj.query,
                podID: obj.pod.id,
                assumptions: this.currentAssumptions
            }).then((imageData) => {
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

        default:
            return false;
        }
    }

    private static webSocketSendHook(data: any) {
        // always reset assumptions
        this.currentAssumptions = [];

        // `data` is probably always a string, just making sure
        if (typeof data !== 'string') return;

        let obj: any;
        try {
            obj = this.tryParseJSON(data);
        } catch (err) {
            return;
        }

        // store assumptions from message
        const assumptions = obj.assumption;
        if (!Array.isArray(assumptions) || assumptions.length === 0) return;
        this.currentAssumptions = assumptions;
        console.info('Got query assumptions: ', assumptions);
    }

    private static buildNewListener(origListener: WebSocketListener): WebSocketListener {
        console.info('Hooking websocket message listener');
        return function listener(this: WebSocket, event: MessageEvent) {
            // handle new message
            const newEvent = WebsocketHook.fixMessageEventData(event);

            const continueProcessing = origListener.bind(this, newEvent);

            try {
                // returns true if event will be handled asynchronously
                if (!WebsocketHook.websocketMessageEventHook(newEvent, continueProcessing)) {
                    continueProcessing();
                }
            } catch (e) {
                ErrorHandler.processError(
                    `Error in websocket message hook:\n${e}`,
                    {
                        Error: e,
                        Event: newEvent
                    }
                );
                continueProcessing();
            }
        };
    }

    static init() {
        console.info('Initializing websocket hook');

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const origAddEventListener = window.WebSocket.prototype.addEventListener;
        window.WebSocket.prototype.addEventListener = function event(
            type: string, listener: (this: WebSocket, ev: any) => any, ...args: any[]
        ) {
            const newListener = type === 'message'
                ? WebsocketHook.buildNewListener(listener)  // hook listener
                : listener;
            return origAddEventListener.apply(this, [type, newListener, ...args] as any);
        };

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const origSend = window.WebSocket.prototype.send;
        window.WebSocket.prototype.send = function send(
            data: any
        ): void {
            WebsocketHook.webSocketSendHook(data);
            return origSend.apply(this, [data]);
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

    static async sendMessage<T extends ExtMessage<any, any>>(args: T['in']): Promise<T['out']> {
        const seq = this.sequence;
        this.sequence += 1;
        const promise = new Promise((resolve) => { this.dataCallbacks[seq] = resolve; });
        window.postMessage(
            { seq: seq, ...args },
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
        const isStepByStep = (e: Element | null): boolean => (
            // check if node is step-by-step block based on presence of a header image
            !!(e && e.querySelector('img[alt="SBS_HEADER"]'))
        );

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
                .filter((c) => c.nodeName.toLowerCase() === 'div')
                .forEach((c) => this.fixSectionForDiv(c));
            break;

        case 'div':
            if (!isStepByStep(el.parentElement)) break;
            this.fixSectionForDiv(el);
            break;

        default:
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
