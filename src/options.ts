const inputField = document.querySelector('#appid') as HTMLInputElement;
const submitButton = document.querySelector('#appid-btn') as HTMLButtonElement;
const statusText = document.querySelector('#status') as HTMLSpanElement;

const placeholder = '**********';


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
    checkbox.addEventListener('click', () => ExtStorage.setOption(key, checkbox.checked));

    // initialize value
    checkbox.disabled = true;
    ExtStorage.getOption(key).then((value) => {
        checkbox.checked = value;
        checkbox.disabled = false;
    });

    if (option.description) div.title = option.description;

    div.appendChild(checkbox);
    div.appendChild(label);
    optionsDiv.appendChild(div);
}
