class Messaging {
    private static stepsPromises: { [key: string]: Promise<any> } = {};

    private static async backgroundFetchSteps(query: string, podID: string): Promise<any> {
        const cacheKey = `${query}:::${podID}`;
        const prev = this.stepsPromises[cacheKey];
        if (prev) {
            console.info(`Found existing promise for query \'${query}\' (podID: \'${podID}\')`);
            return prev;
        }

        // request image data from background script
        const p = browser.runtime.sendMessage({ fetchSteps: { query: query, podID: podID } });
        this.stepsPromises[cacheKey] = p;
        return p;
    }

    static init() {
        // handle requests from page script
        window.addEventListener('message', async (event) => {
            if (event.source !== window) return;
            if (event.data.type !== 'msImageDataReq') return;

            // get new image data
            let imageData = null;
            try {
                imageData = await this.backgroundFetchSteps(event.data.query, event.data.podID);
            } catch (err) {
                console.error(
                    'Background script error:\n',
                    err
                );
            }

            // send response with (new) data
            window.postMessage(
                { seq: event.data.seq, type: 'msImageDataResp', data: imageData },
                '*'
            );
        });
    }
}


const version = browser.runtime.getManifest().version;
console.info(`Initializing Wolfram|Alpha MoreSteps v${version}`);

// initialize handler for messages from page script
Messaging.init();

// add page script to DOM
const script = document.createElement('script');
script.src = browser.runtime.getURL('js/page.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);


export {};
