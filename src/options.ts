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
    statusText.style.display = '';
    statusText.textContent = 'Saving ...';
    await ExtStorage.setAppID(inputField.value);
    statusText.textContent = 'Saved!';
});
