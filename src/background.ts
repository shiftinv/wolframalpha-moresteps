class APIClient {
    private static baseUrl = 'https://api.wolframalpha.com/v2/query';
    private static readonly commonParams = {
        format: 'image',
        output: 'json'
    };

    static async getJSONDataFromAPI(appid: string, query: string, podIDs: string[]):
            Promise<APIResponse> {
        if (podIDs.length === 0) {
            throw new Error('Invalid number of podIDs');
        }
        const url = new URL(this.baseUrl);
        const params = new URLSearchParams({
            appid: appid,
            input: query,
            ...this.commonParams
        });
        for (const podID of podIDs) {
            params.append('podstate', `${podID}__Step-by-step solution`);
            params.append('includepodid', podID);
        }

        const reqAsync = await ExtStorage.getOption('consolidate+async');
        if (podIDs.length > 1 && reqAsync) {
            params.append('async', 'true');
        }

        url.search = params.toString();

        const response = await fetch(url.toString());
        const resultJson = (await response.json()).queryresult as APIResponse;
        if (!resultJson.success) {
            const errText = resultJson.error
                ? `API error: ${resultJson.error.msg} (code: ${resultJson.error.code})`
                : 'API request unsuccessful';
            throw new Error(errText);
        }

        return resultJson;
    }

    static async getAsyncPod(url: string): Promise<APIResponseAsync> {
        const reqUrl = new URL(url);
        for (const [k, v] of Object.entries(this.commonParams)) {
            reqUrl.searchParams.append(k, v);
        }

        const response = await fetch(reqUrl.toString());
        return await response.json() as APIResponseAsync;
    }
}

class Messaging {
    private static contentMessageHandler(message: any, sender: any):
            Promise<any> | undefined {
        switch (message.type) {
        case 'fetchSteps': {
            const args = message as StepByStepBackgroundMessage['in'];
            return ExtStorage.getAppID()
                .then(async (appID) => {
                    if (!appID) throw new Error('No AppID set');
                    const json = await APIClient.getJSONDataFromAPI(
                        appID, args.query, args.podIDs
                    );
                    return json as StepByStepBackgroundMessage['out'];
                });
        }
        case 'fetchAsyncPod': {
            const args = message as StepByStepAsyncPodMessage['in'];
            return APIClient.getAsyncPod(args.url) as Promise<StepByStepAsyncPodMessage['out']>;
        }
        }
    }

    static init() {
        // set up listener for content script
        browser.runtime.onMessage.addListener(this.contentMessageHandler.bind(this));
    }
}

Messaging.init();


export {};
