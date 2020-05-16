class APIClient {
    private static baseUrl = 'https://api.wolframalpha.com/v2/query';

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

class Messaging {
    private static contentMessageHandler(message: any, sender: any):
            Promise<StepByStepBackgroundMessage['out']> | undefined {
        if (!message.fetchSteps) return;
        const data = (message as StepByStepBackgroundMessage['in']).fetchSteps;

        return ExtStorage.getAppID()
            .then(async (appID) => {
                if (!appID) throw new Error('No AppID set');
                const json = await APIClient.getJSONDataFromAPI(
                    appID, data.query, data.podIDs
                );
                return json;
            });
    }

    static init() {
        // set up listener for content script
        browser.runtime.onMessage.addListener(this.contentMessageHandler.bind(this));
    }
}

Messaging.init();


export {};
