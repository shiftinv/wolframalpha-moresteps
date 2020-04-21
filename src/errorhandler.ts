class ErrorHandler {
    private static readonly ALERT_CONTAINER_ID = `moresteps-alertcontainer`;
    private static readonly ALERT_MODAL_ID = `moresteps-alertmodal`;
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

    static processError(text: string, context: { [key: string]: any }) {
        // print error to console
        const args = [text];
        if (Object.keys(context).length !== 0) {
            args.push('\nContext:');
            Object.keys(context).forEach(k => args.push(`\n\n> ${k}:\n`, context[k]));
        }
        console.error(...args);


        // show error on UI
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
    }
}
