class ErrorHandler {
    private static readonly ALERT_CONTAINER_ID = `moresteps-alertcontainer`;
    private static readonly ALERT_MODAL_ID = `moresteps-alertmodal`;
    private static container?: HTMLDivElement;
    private static lastError?: {
        modal: HTMLDivElement,
        text: string,
        repeatCount?: {
            element: HTMLSpanElement,
            count: number
        }
    };

    private static getContainer(): HTMLDivElement {
        if (!this.container) {
            this.container = document
                .getElementById(this.ALERT_CONTAINER_ID) as HTMLDivElement | undefined;
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = this.ALERT_CONTAINER_ID;
                document.body.appendChild(this.container);
            }
        }
        return this.container;
    }

    private static createNewModal(text: string): HTMLDivElement {
        const container = this.getContainer();

        const modal = document.createElement('div');
        const modalContent = document.createElement('div');
        const closeButton = document.createElement('span');

        modal.id = this.ALERT_MODAL_ID;
        modalContent.classList.add('modal-content');
        modalContent.textContent = text;

        closeButton.onclick = () => modal.remove();
        closeButton.innerHTML = '&times;';
        closeButton.classList.add('modal-close');

        modal.appendChild(modalContent);
        modal.appendChild(closeButton);
        container.appendChild(modal);

        return modal;
    }

    private static incrementLastRepeatCount(): void {
        const last = this.lastError!;
        if (!last.repeatCount) {
            const repeatElem = document.createElement('span');
            repeatElem.classList.add('modal-repeat-count');
            last.modal.prepend(repeatElem);

            last.repeatCount = {
                element: repeatElem,
                count: 1
            };
        }

        last.repeatCount.element.textContent = `${++last.repeatCount.count}`;

        const container = this.getContainer();
        if (!container.contains(last.modal)) {
            container.appendChild(last.modal);
        }
    }

    static processError(text: string, context: { [key: string]: any }) {
        // print error to console
        const args = [text];
        if (Object.keys(context).length !== 0) {
            args.push('\nContext:');
            Object.keys(context).forEach(k => args.push(`\n\n> ${k}:\n`, context[k]));
        }
        console.error(...args);

        if (this.lastError?.text === text) {
            // increment repeat counter if error is identical to previous one
            this.incrementLastRepeatCount();
        } else {
            // show error on UI
            const newModal = this.createNewModal(text);
            this.lastError = {
                modal: newModal,
                text: text
            };
        }
    }
}
