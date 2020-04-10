type APIImageData = { [key: string]: string | null };

class APIClient {
    private static baseUrl = 'https://api.wolframalpha.com/v2/query';

    private static findStepsImg(json: any, podID: string) {
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
            throw new Error('Couldn\'t find step-by-step subpod image in API response');
        }
        return img;
    }

    static async getStepByStepImageDataFromAPI(appid: string, query: string, podID: string):
            Promise<APIImageData> {
        const url = new URL(this.baseUrl);
        url.search = new URLSearchParams({
            appid: appid,
            input: query,
            podstate: `${podID}__Step-by-step solution`,
            format: 'image',
            output: 'json'
        }).toString();

        const response = await fetch(url.toString());
        const resultJson = (await response.json()).queryresult;
        if (!resultJson.success) {
            const errText = resultJson.error
                ? `API error: ${resultJson.error.msg} (code: ${resultJson.error.code})`
                : 'API request unsuccessful';
            throw new Error(errText);
        }

        const imgData = this.findStepsImg(resultJson, podID);
        return { ...imgData, host: resultJson.host };
    }
}

class Messaging {
    private static contentMessageHandler(message: any, sender: any):
            Promise<APIImageData> | undefined {
        if (!message.fetchSteps) return;
        const data = message.fetchSteps;

        return ExtStorage.getAppID()
            .then(async (id) => {
                if (!id) throw new Error('No app ID set');

                console.debug(`Retrieving data for query \'${data.query}\' (podID: \'${data.podID}\')`);
                const img = await APIClient.getStepByStepImageDataFromAPI(
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
