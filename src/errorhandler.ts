// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ErrorHandler {
    private static readonly ALERT_CONTAINER_ID = 'moresteps-alertcontainer';
    private static container?: HTMLDivElement;

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

    private static createNewModal(text: string): void {
        const container = this.getContainer();

        const modal = document.createElement('div');
        const modalContent = document.createElement('div');
        const closeButton = document.createElement('span');

        modal.classList.add('moresteps-alertmodal');
        modalContent.classList.add('modal-content');
        modalContent.textContent = text;

        closeButton.onclick = () => modal.remove();
        closeButton.innerHTML = '&times;';
        closeButton.classList.add('modal-close');

        modal.appendChild(modalContent);
        modal.appendChild(closeButton);
        container.appendChild(modal);
    }

    private static incrementLastRepeatCount(modal: HTMLElement): void {
        let repeatCountElem = modal.querySelector('.modal-repeat-count');
        if (!repeatCountElem) {
            repeatCountElem = document.createElement('span');
            repeatCountElem.classList.add('modal-repeat-count');
            modal.prepend(repeatCountElem);
        }

        const repeatCount = parseInt(
            repeatCountElem.textContent ? repeatCountElem.textContent : '1',
            10
        );
        repeatCountElem.textContent = `${repeatCount + 1}`;
    }

    static processError(text: string, context: { [key: string]: any }) {
        // print error to console
        const args = [text];
        if (Object.keys(context).length !== 0) {
            args.push('\nContext:');
            Object.keys(context).forEach((k) => args.push(`\n\n> ${k}:\n`, context[k]));
        }
        console.error(...args);

        const lastErrorModal = this.getContainer().lastElementChild as HTMLDivElement | null;

        if (lastErrorModal?.querySelector('.modal-content')?.textContent === text) {
            // increment repeat counter if error is identical to previous one
            this.incrementLastRepeatCount(lastErrorModal);
        } else {
            // show error on UI
            this.createNewModal(text);
        }
    }
}
