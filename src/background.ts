class APIClient {
    private static baseUrl = 'https://api.wolframalpha.com/v2/query';
    private static readonly commonParams = {
        format: 'image',
        output: 'json'
    };
    private static readonly timeoutParams = {
        parsetimeout: '10',     // default: 5s
        scantimeout: '10',      // default: 3s
        podtimeout: '10',       // default: 4s
        formattimeout: '20',    // default: 8s
        totaltimeout: '40'      // default: 20s
    };

    private static asyncPodUrls: Set<string> = new Set();


    private static encodeAssumption(str: string): string {
        // this is only based on observations and may not be complete
        const replacements = {
            '->': '_',
            '{': '*',
            '}': '-',
            ',': '.',
            ' ': ''
        };

        // replace characters
        let newStr = str;
        for (const [pattern, repl] of Object.entries(replacements)) {
            // replace everywhere that's not enclosed in double quotes
            const escapedPattern = pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            newStr = newStr.replace(
                new RegExp(`"[^"]+"|(${escapedPattern})`, 'g'),
                (match, group) => {
                    // if group is defined, pattern matched;
                    //   otherwise, left side of alternation matched
                    return group ? repl : match;
                }
            );
        }

        // remove quotes
        newStr = newStr.replace(/"/g, '');

        return newStr;
    }

    static async getJSONDataFromAPI(
        appid: string, query: string, podIDs: string[], assumptions: string[]
    ): Promise<APIResponse> {
        if (podIDs.length === 0) {
            throw new Error('Invalid number of podIDs');
        }

        const params = new URLSearchParams({
            appid: appid,
            input: query,
            ...this.commonParams
        });
        if (await ExtStorage.getOption('increasetimeout')) {
            for (const [k, v] of Object.entries(this.timeoutParams)) {
                params.append(k, v);
            }
        }

        const useIncludePodID = await ExtStorage.getOption('includepodid');
        for (const podID of podIDs) {
            params.append('podstate', `${podID}__Step-by-step solution`);
            if (useIncludePodID) params.append('includepodid', podID);
        }

        const reqAsync = podIDs.length > 1 && await ExtStorage.getOption('consolidate+async');
        if (reqAsync) {
            params.append('async', 'true');
        }

        for (const assumption of assumptions) {
            params.append('assumption', this.encodeAssumption(assumption));
        }

        const url = new URL(this.baseUrl);
        url.search = params.toString();


        const response = await fetch(url.toString());
        const resultJson = (await response.json()).queryresult as APIResponse;
        if (!resultJson.success) {
            const errText = resultJson.error
                ? `API error: ${resultJson.error.msg} (code: ${resultJson.error.code})`
                : 'API request unsuccessful';
            throw new Error(errText);
        }

        // store async pod urls for subsequent verification
        if (reqAsync) {
            const isAsync = (p: APIPod): p is APIPodAsync => 'async' in p;
            resultJson.pods?.filter(isAsync).forEach(p => this.asyncPodUrls.add(p.async));
        }

        return resultJson;
    }

    static async getAsyncPod(url: string): Promise<APIResponseAsync> {
        // messages from the content script are not trusted, only send requests to
        //  previously seen urls to prevent access to arbitrary urls
        if (!this.asyncPodUrls.has(url)) {
            throw new Error(`Refusing to request unknown url \'${url}\'`);
        }

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
                        appID, args.query, args.podIDs, args.assumptions
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

ExtStorage.checkResets();


export {};
