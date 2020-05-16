interface APIPodBase {
    id: string;
}
interface APIPodSync extends APIPodBase {
    subpods: [{
        title: string,
        img?: any
    }];
}
interface APIPodAsync extends APIPodBase {
    async: string;
}
type APIPod = APIPodSync | APIPodAsync;

interface APIResponseAsync {
    pods: APIPod[];
}
interface APIResponse extends APIResponseAsync {
    host: string;
    success: boolean;
    error: false | { code: number, msg: string };
}

interface APIImageData {
    [key: string]: string;
}


interface ExtMessage<I extends { type: string, [key: string]: any }, O> {
    in: I;
    out: O;
}

// content script <---> background script (main)
interface StepByStepBackgroundMessage extends ExtMessage<
    {
        type: 'fetchSteps',
        query: string,
        podIDs: string[]
    },
    APIResponse
> {}

// content script <---> background script (async pods)
interface StepByStepAsyncPodMessage extends ExtMessage<
    {
        type: 'fetchAsyncPod',
        url: string
    },
    APIResponseAsync
> {}

// page script <---> content script (prefetch)
interface StepByStepPrefetchMessage extends ExtMessage<
    {
        type: 'msImageDataPrefetch',
        query: string,
        podIDs: string[]
    },
    void
> {}

// page script <---> content script (single)
interface StepByStepContentMessage extends ExtMessage<
    {
        type: 'msImageDataReq',
        query: string,
        podID: string
    },
    APIImageData | null
> {}
