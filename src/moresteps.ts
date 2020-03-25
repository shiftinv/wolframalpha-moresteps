async function callBackground
<T extends keyof BackgroundCommand>(command: T, params: {}): Promise<BackgroundCommand[T]> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { backgroundCommand: command, ...params },
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

async function getStepByStepImageUrl(query: string, podID: string) {
    const cachedUrl = await callBackground('urlCacheGet', { query: query });
    if (cachedUrl) {
        console.debug(`Found url for query \'${query}\' in cache`);
        return cachedUrl;
    }

    // build API request
    const params = {
        input: query,
        podstate: `${podID}__Step-by-step solution`,
        format: 'image'
    };

    // retrieve image url from xml response
    const text = await callBackground('fetchAPI', { params: params });
    const xml = (new DOMParser()).parseFromString(text, 'text/xml');
    const stepsImg = xml.querySelector(`pod[id="${podID}"] subpod[title~="steps"] img`);
    if (!stepsImg) {
        throw new Error('Couldn\'t find step-by-step subpod image in API response');
    }

    // add to cache
    const imgUrl = stepsImg.getAttribute('src');
    callBackground('urlCacheSet', { query: query, url: imgUrl });
    return imgUrl;
}

function observerCallback(el: Element) {
    function checkSBS(e: Element) {
        // check if node is step-by-step block based on presence of a header image in parent
        return !!e.querySelector('img[alt="SBS_HEADER"]');
    }

    // layout:
    //   <section>      [1]
    //     <header />
    //     <section />
    //     <div />      [2] (=> contains image)
    //     <section />  [3] (=> contains pro footer)
    //     <button />
    //   </section>
    //
    // handle two separate situations:
    //  1. step-by-step solution was opened before image was loaded:
    //    - div(2) and section(3) are added separately
    //  2. step-by-step solution was opened after image was loaded:
    //    - a new section(1) containing both div(2) and section(3) is added

    switch (el.nodeName.toLowerCase()) {
    case 'section':
        if (checkSBS(el)) {
            // if node itself is the SBS section, call function again with every child
            let hasDiv = false;
            for (const child of el.children) {
                if (child.nodeName.toLowerCase() === 'div') {
                    hasDiv = true;
                    break;
                }
            }
            if (hasDiv) {
                for (const child of el.children) {
                    observerCallback(child);
                }
            }
        } else {
            // remove section if it's the pro footer
            if (!el.querySelector('a[href*="/pro/"]')) break;
            if (!checkSBS(el.parentElement!)) break;
            el.remove();
        }
        break;

    case 'div':
        // replace div containing the original step-by-step image with the image itself
        if (!checkSBS(el.parentElement!)) break;
        const img = el.querySelector('img[src*="Calculate/MSP"]') as HTMLImageElement;
        if (!img) break;

        img.className = el.className;
        img.style.margin = '20px';
        el.replaceWith(img);
        break;
    }
}

function setupObserver() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                observerCallback(node as Element);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });

    console.info('Successfully initialized observer');

    return observer;
}


function setupImageUrlRequestHandler() {
    // handle requests from page script
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        if (event.data.type !== 'msImageUrlReq') return;

        // get new image url
        let imageUrl = null;
        try {
            imageUrl = await getStepByStepImageUrl(event.data.query, event.data.podID);
        } catch (err) {
            console.error(err);
        }
        // send response with (new) url
        window.postMessage({ seq: event.data.seq, type: 'msImageUrlResp', url: imageUrl }, '*');
    });
}


// initialize DOM observer
console.info('Initializing Wolfram|Alpha MoreSteps');
if (document.readyState !== 'loading') {
    setupObserver();
} else {
    document.addEventListener('DOMContentLoaded', setupObserver);
}


// initialize handler for messages from page script
setupImageUrlRequestHandler();

// add page script to DOM
const script = document.createElement('script');
script.src = chrome.runtime.getURL('js/inject.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);
