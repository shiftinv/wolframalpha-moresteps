async function backgroundFetchSteps(query: string, podID: string): Promise<any> {
    // request image data from background script
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { fetchSteps: { query: query, podID: podID } },
            (res) => {
                if (res === undefined) {
                    reject(`Error: ${chrome.runtime.lastError!.message}`);
                    return;
                }

                const [response, err] = res;
                if (err) {
                    if (typeof err === 'object' && typeof err.message === 'string') {
                        reject(Object.assign(new Error(), err));
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(response);
                }
            });
    });
}

function setupImageDataRequestHandler() {
    // handle requests from page script
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        if (event.data.type !== 'msImageDataReq') return;

        // get new image data
        let imageData = null;
        try {
            imageData = await backgroundFetchSteps(event.data.query, event.data.podID);
        } catch (err) {
            console.error(err);
        }

        // send response with (new) data
        window.postMessage(
            { seq: event.data.seq, type: 'msImageDataResp', data: imageData },
            '*'
        );
    });
}


// initialize handler for messages from page script
setupImageDataRequestHandler();

// add page script to DOM
const script = document.createElement('script');
script.src = chrome.runtime.getURL('js/inject.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);
