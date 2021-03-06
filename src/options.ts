const inputField = document.querySelector('#appid') as HTMLInputElement;
const submitButton = document.querySelector('#appid-btn') as HTMLButtonElement;
const statusText = document.querySelector('#status') as HTMLSpanElement;

const placeholder = '**********';

/* eslint-disable @typescript-eslint/no-misused-promises */

// show placeholder if AppID is already set
document.addEventListener('DOMContentLoaded', async () => {
    const currAppID = await ExtStorage.getAppID();
    if (currAppID) {
        inputField.value = placeholder;
    }
    inputField.disabled = false;
});

// remove placeholder once input field is selected
inputField.addEventListener('focus', () => {
    if (inputField.value === placeholder) {
        inputField.value = '';
    }
    submitButton.disabled = false;
});

// save new AppID
submitButton.addEventListener('click', async (e) => {
    e.preventDefault();
    statusText.textContent = 'Saving ...';
    await ExtStorage.setAppID(inputField.value);
    statusText.textContent = 'Saved!';
});


// handle options checkboxes
const optionsDiv = document.getElementById('options') as HTMLDivElement;
const optionsMiscDiv = document.getElementById('options-misc') as HTMLDivElement;
const reloadFuncs: (() => any)[] = [];

/* eslint-disable @typescript-eslint/no-loop-func */
for (const [key, option] of Object.entries(ExtStorage.options) as [OptionName, Option][]) {
    const div = document.createElement('div');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');

    const id = `option-${key}`;

    // create label
    label.htmlFor = id;
    label.textContent = option.text;

    // create checkbox
    checkbox.id = id;
    checkbox.type = 'checkbox';
    checkbox.addEventListener('click', async () => {
        // set new value
        await ExtStorage.setOption(key, checkbox.checked);
        // refresh availability of other options
        reloadFuncs.forEach((f) => f());
    });

    // initialize value
    checkbox.disabled = true;

    const reloadBox = () => {
        void ExtStorage.getOption(key).then((value) => {
            checkbox.checked = value;
        });
        void ExtStorage.isAvailable(key).then((available) => {
            checkbox.disabled = !available;
        });
    };
    reloadFuncs.push(reloadBox);
    reloadBox();

    // add tooltip
    if (option.description) {
        div.title = option.description;
        if (option.resetDays !== undefined) {
            div.title += `\n(Resets to default value [${option.default}] after ${option.resetDays} days)`;
        }
    }

    // indent if suboption
    if (key.includes('+')) div.classList.add('suboption');

    div.appendChild(checkbox);
    div.appendChild(label);

    const targetDiv = key.startsWith('misc-') ? optionsMiscDiv : optionsDiv;
    targetDiv.appendChild(div);
}
/* eslint-enable @typescript-eslint/no-misused-promises */
/* eslint-enable @typescript-eslint/no-loop-func */
