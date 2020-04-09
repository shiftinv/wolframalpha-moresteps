const inputField = document.querySelector('#appid') as HTMLInputElement;
const submitButton = document.querySelector('#appid-btn') as HTMLButtonElement;
const statusText = document.querySelector('#status') as HTMLSpanElement;

document.addEventListener('DOMContentLoaded', async () => {
    const oldAppID = await ExtStorage.getAppID();
    if (oldAppID) inputField.value = oldAppID;

    inputField.disabled = false;
    submitButton.disabled = false;
});

submitButton.addEventListener('click', async (e) => {
    e.preventDefault();
    statusText.style.display = '';
    statusText.textContent = 'Saving ...';
    await ExtStorage.setAppID(inputField.value);
    statusText.textContent = 'Saved!';
});
