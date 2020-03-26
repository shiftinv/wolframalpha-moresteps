type MessageEventRW = Omit<MessageEvent, 'data'> & { data: any };

class WebsocketHook {
    static newImages = new Set<string>();

    private static fixMessageEventData(o: MessageEvent): MessageEventRW {
        const tmpData = o.data;
        Object.defineProperty(o, 'data', { writable: true });
        (o as MessageEventRW).data = tmpData;
        return o;
    }

    private static websocketMessageEventHook(event: MessageEventRW, continueSocket: () => any) {
        let obj: any;
        try {
            obj = JSON.parse(event.data);
        } catch (err) {
            console.error(err);
            return true;
        }

        // handle stepByStep packets only
        if (obj.type !== 'stepByStep') return true;
        // don't try to replace solutions with multiple steps
        if ('deploybuttonstates' in obj.pod
            || 'stepbystepcontenttype' in obj.pod.subpods[0]) return true;

        // request image data from content script
        Messaging.sendMessage({ type: 'msImageDataReq', query: obj.query, podID: obj.pod.id })
            .then((imageData) => {
                if (imageData) {
                    obj.host = imageData.host;

                    const wsImg = obj.pod.subpods[0].img;
                    wsImg.src = imageData.src;
                    wsImg.width = imageData.width;
                    wsImg.height = imageData.height;

                    event.data = JSON.stringify(obj);

                    this.newImages.add(wsImg.src);
                }
                continueSocket();
            });

        return false;
    }

    static init() {
        console.log('Initializing websocket hook');
        const origAddEventListener = window.WebSocket.prototype.addEventListener;
        window.WebSocket.prototype.addEventListener =
            function (type: string, listener: (this: WebSocket, ev: any) => any, ...args: any[]) {
                let newListener = listener;
                if (type === 'message') {
                    // hook listener
                    const origListener = listener;
                    newListener = (event, ...args2) => {
                        const newEvent = WebsocketHook.fixMessageEventData(event);
                        const continueSocket = origListener.bind(this, newEvent, ...args2);

                        // returns false if event will be handled asynchronously
                        if (WebsocketHook.websocketMessageEventHook(newEvent, continueSocket)) {
                            continueSocket();
                        }
                    };
                }
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
        const isStepByStep = (e: Element) => {
            // check if node is step-by-step block based on presence of a header image in parent
            return !!e.querySelector('img[alt="SBS_HEADER"]');
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
            if (!isStepByStep(el.parentElement!)) break;
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


// initialize websocket hook
Messaging.init();
WebsocketHook.init();

// initialize DOM observer
if (document.readyState !== 'loading') {
    Observer.init();
} else {
    document.addEventListener('DOMContentLoaded', () => Observer.init());
}


export {};
