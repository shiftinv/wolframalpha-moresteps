interface APIResponse {
    host: string,
    pods: [{
        id: string,
        subpods: [{
            title: string,
            img?: any
        }]
    }]
}

interface APIImageData {
    [key: string]: string
}


interface ExtMessage<I extends { [key: string]: any }, O> {
    in: I;
    out: O;
}

// content script <---> background script
interface StepByStepBackgroundMessage extends ExtMessage<
    {
        fetchSteps: {
            query: string,
            podIDs: string[]
        }
    },
    APIResponse
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
