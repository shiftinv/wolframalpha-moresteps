type APIImageData = { [key: string]: string | null };

class APIClient {
    private static baseUrl = 'https://api.wolframalpha.com/v2/query';

    static findStepsImg(json: any, podID: string) {
        let img: any;
        for (const pod of json.pods) {
            if (pod.id === podID) {
                for (const subpod of pod.subpods) {
                    if (subpod.title.includes('steps') && 'img' in subpod) {
                        img = subpod.img;
                        break;
                    }
                }
            }
            if (img) break;
        }

        if (!img) {
            throw new Error(`Couldn\'t find step-by-step image subpod in API response for podID '${podID}'`);
        }
        return img;
    }

    static async getJSONDataFromAPI(appid: string, query: string, podIDs: string[]):
            Promise<any> {
        if (podIDs.length === 0) {
            throw new Error('Invalid number of podIDs');
        }
        const url = new URL(this.baseUrl);
        const params = new URLSearchParams({
            appid: appid,
            input: query,
            format: 'image',
            output: 'json'
        });
        for (const podID of podIDs) {
            params.append('podstate', `${podID}__Step-by-step solution`);
            params.append('includepodid', podID);
        }
        url.search = params.toString();

        const response = await fetch(url.toString());
        const resultJson = (await response.json()).queryresult;
        if (!resultJson.success) {
            const errText = resultJson.error
                ? `API error: ${resultJson.error.msg} (code: ${resultJson.error.code})`
                : 'API request unsuccessful';
            throw new Error(errText);
        }

        return resultJson;
    }
}

class APIRequestConsolidator {
    // make sure to update description in storage.ts when updating this value
    private static bufferTimeMs = 500;

    private static currentAppID: string;
    private static currentQuery: { query: string, timer: number } | null;
    private static currentPodRequests: [string, (d: APIImageData) => void, (e: any) => void][] = [];

    private static sendRequest() {
        // store variables locally for later use, clear stored values
        const query = this.currentQuery!.query;
        const podRequests = this.currentPodRequests;
        this.currentQuery = null;
        this.currentPodRequests = [];

        console.log(`Sending request for ${podRequests.length} pod(s)`);

        APIClient.getJSONDataFromAPI(
            this.currentAppID, query, podRequests.map(r => r[0])
        ).then((json) => {
            // try finding image subpod for each podID separately
            for (const [podID, resolve, reject] of podRequests) {
                try {
                    const imgData = APIClient.findStepsImg(json, podID);
                    resolve({ ...imgData, host: json.host });
                } catch (e) {
                    reject(e);
                }
            }
        }).catch((err) => {
            // reject all promises if request error occurred
            podRequests.map(r => r[2]).forEach(reject => reject(err));
        });
    }

    private static startNewRequest(appid: string, query: string) {
        console.log('Starting new set of podIDs');
        this.currentAppID = appid;
        this.currentQuery = {
            query: query,
            timer: setTimeout(this.sendRequest.bind(this), this.bufferTimeMs)
        };
    }

    static async getStepByStepImageDataFromAPI(appid: string, query: string, podID: string):
            Promise<APIImageData> {
        if (this.currentQuery) {
            if (this.currentQuery.query !== query) {
                // finish previous set of podIDs if new query is received
                console.log('Received new query, sending request for accumulated podIDs');
                clearTimeout(this.currentQuery.timer);
                this.sendRequest();
                this.startNewRequest(appid, query);
            }
        } else {
            // start new set of requests if no query is in progress
            this.startNewRequest(appid, query);
        }

        // add new request
        return new Promise(
            (resolve, reject) => this.currentPodRequests.push([podID, resolve, reject])
        );
    }
}

class Messaging {
    private static contentMessageHandler(message: any, sender: any):
            Promise<APIImageData> | undefined {
        if (!message.fetchSteps) return;
        const data = message.fetchSteps;

        return ExtStorage.getAppID()
            .then(async (id) => {
                if (!id) throw new Error('No AppID set');

                console.debug(`Retrieving data for query \'${data.query}\' (podID: \'${data.podID}\')`);
                const img = await APIRequestConsolidator.getStepByStepImageDataFromAPI(
                    id, data.query, data.podID
                );
                console.debug(`Received data for query: \'${data.query}\' (podID: \'${data.podID}\'):\n${JSON.stringify(img)}`);
                return img;
            });
    }

    static init() {
        // set up listener for content script
        browser.runtime.onMessage.addListener(this.contentMessageHandler.bind(this));
    }
}

Messaging.init();


export {};
