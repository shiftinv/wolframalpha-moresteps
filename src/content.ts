class APIHandler {
    private static stepsPromises: { [key: string]: Promise<any> } = {};

    private static findStepsImg(pod: APIPodSync): APIImageData {
        const img = pod.subpods.find((s) => s.title.includes('steps') && 'img' in s)?.img;
        if (!img) {
            throw new Error(`Couldn't find step-by-step image subpod in API response for podID '${pod.id}'`);
        }
        return img;
    }

    private static async handleResponse(json: APIResponse, podID: string): Promise<APIImageData> {
        const { pods } = json;
        if (!pods) {
            // this can sometimes happen when the includepodid/excludepodid parameters are broken;
            //  there's nothing one can do about it, apart from waiting for the API to get fixed :/
            throw new Error(`Response for pod ID '${podID}' didn't contain any result pods`
                + `\nTry temporarily disabling the "${ExtStorage.options.includepodid.text}" option`);
        }
        let pod = pods.find((p) => p.id === podID);
        if (!pod) {
            throw new Error(`Couldn't find pod ID '${podID}' in API response`);
        }

        const isAsync = (p: APIPod): p is APIPodAsync => 'async' in p;
        if (isAsync(pod)) {
            // load pod contents asynchronously
            const result = await Messaging.sendMessage<StepByStepAsyncPodMessage>({
                type: 'fetchAsyncPod',
                url: pod.async
            });
            if (!result.pods || result.pods.length === 0) {
                throw new Error(`Received empty async response for podID '${pod.id}'`);
            }
            pod = result.pods[0] as APIPodSync;
        }
        return this.findStepsImg(pod);
    }

    private static getPromise(
        query: string,
        podID: string,
        assumptions: string[],
        initHandler: (resolve: (data: APIImageData) => void, reject: (error: any) => void) => any
    ): Promise<APIImageData> {
        const cacheKey = `${query}:::${podID}:::${assumptions}`;
        const prev = this.stepsPromises[cacheKey];
        if (prev !== undefined) {
            console.debug(`Found existing promise for query '${query}' (podID: '${podID}')`);
            return prev;
        }

        const p = new Promise(initHandler);
        this.stepsPromises[cacheKey] = p;
        return p;
    }

    static getMultiple(
        query: string, podIDs: string[], assumptions: string[]
    ): Promise<APIImageData>[] {
        // array of promises, returned to caller
        const promises: Promise<APIImageData>[] = [];
        // used for resolving the promises, {podID: [resolve, reject]}
        const subQueries: {
            [key: string]: [(data: APIImageData) => void, (error: any) => void]
        } = {};

        // build array of promises
        for (const podID of podIDs) {
            // getPromise returns an existing promise, or creates a new one and
            //  calls the handler, in which case the podID also gets added to `subQueries`
            promises.push(this.getPromise(query, podID, assumptions, (resolve, reject) => {
                subQueries[podID] = [resolve, reject];
            }));
        }

        const requestPodIDs = Object.keys(subQueries);
        // if length === 0, everything is already cached/in progress
        if (requestPodIDs.length > 0) {
            // send message to background script
            console.log(`Retrieving data for query '${query}' (podIDs: ${requestPodIDs})`);
            Messaging.sendMessage<StepByStepBackgroundMessage>({
                type: 'fetchSteps',
                query: query,
                podIDs: requestPodIDs,
                assumptions: assumptions
            }).then((json) => {
                console.debug(`Received data for query: '${query}' (podIDs: ${requestPodIDs}):\n${JSON.stringify(json)}`);
                // try finding image subpod for each podID individually
                for (const [podID, [resolve, reject]] of Object.entries(subQueries)) {
                    try {
                        this.handleResponse(json, podID)
                            .then((imgData) => resolve({ ...imgData, host: json.host }))
                            .catch(reject);
                    } catch (e) {
                        reject(e);
                    }
                }
            }).catch((err) => {
                // reject all promises if message error occurred
                Object.values(subQueries).map((s) => s[1]).forEach((reject) => reject(err));
            });
        }

        return promises;
    }

    static getOne(query: string, podID: string, assumptions: string[]): Promise<APIImageData> {
        return this.getMultiple(query, [podID], assumptions)[0];
    }
}

class Messaging {
    static async sendMessage<T extends ExtMessage<any, any>>(args: T['in']): Promise<T['out']> {
        return browser.runtime.sendMessage(args);
    }

    static init() {
        // handle requests from page script
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        window.addEventListener('message', async (event) => {
            if (event.source !== window) return;

            switch (event.data.type) {
            case 'msImageDataPrefetch': {
                // TODO: handle errors
                const args = event.data as StepByStepPrefetchMessage['in'];
                // don't really care about results, any errors will be sent back later on
                //  as the promises (and therefore results/errors) are cached
                void (async () => {
                    const prefetch = await ExtStorage.getOption('prefetch');
                    if (!prefetch) return;

                    console.info(`Prefetching ${args.podIDs.length} stepByStep image(s)`);
                    const consolidate = await ExtStorage.getOption('consolidate');
                    if (consolidate) {
                        // send as one request
                        await Promise.all(
                            APIHandler.getMultiple(args.query, args.podIDs, args.assumptions)
                        );
                    } else {
                        // send as multiple requests
                        await Promise.all(args.podIDs.map(
                            (podID) => APIHandler.getOne(args.query, podID, args.assumptions)
                        ));
                    }
                })();
                break;
            }
            case 'msImageDataReq': {
                const args = event.data as StepByStepContentMessage['in'];

                // get image data
                let imageData: StepByStepContentMessage['out'] = null;
                try {
                    imageData = await APIHandler.getOne(args.query, args.podID, args.assumptions);
                } catch (err) {
                    ErrorHandler.processError(
                        `API processing failed:\n${err}`,
                        {
                            Error: err
                        }
                    );
                }

                // send response
                window.postMessage(
                    { seq: event.data.seq, type: 'msImageDataResp', data: imageData },
                    '*'
                );
                break;
            }

            default:
                break;
            }
        });
    }
}


function injectScript(path: string) {
    const script = document.createElement('script');
    script.src = browser.runtime.getURL(path);
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
}


const { version } = browser.runtime.getManifest();
console.info(`Initializing Wolfram|Alpha MoreSteps v${version}`);

// initialize handler for messages from page script
Messaging.init();

// add page script to DOM
injectScript('js/errorhandler.js');
injectScript('js/page.js');

// hide top banner by default
// (this can lose the race to componentDidMount if storage access takes longer than ~50ms :/ )
ExtStorage.getOption('misc-hidebanner').then((hide) => {
    if (hide) {
        sessionStorage.setItem('banner', 'true');
    }
}).catch((err) => {
    ErrorHandler.processError(`Couldn't load banner option:${err}`, { Error: err });
});

export {};
