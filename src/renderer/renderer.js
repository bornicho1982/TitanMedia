const statusDiv = document.getElementById('status');

document.getElementById('hello-button').addEventListener('click', async () => {
    try {
        const message = await window.core.hello();
        statusDiv.textContent = `SUCCESS: ${message}`;
    } catch (error) {
        statusDiv.textContent = `ERROR: ${error.message}`;
    }
});

document.getElementById('startup-button').addEventListener('click', async () => {
    try {
        await window.core.startup();
        statusDiv.textContent = 'SUCCESS: OBS startup sequence initiated.';
    } catch (error) {
        statusDiv.textContent = `ERROR: ${error.message}`;
    }
});

document.getElementById('create-scene-button').addEventListener('click', async () => {
    try {
        await window.core.createScene();
        statusDiv.textContent = 'SUCCESS: Scene created and game capture source added.';
    } catch (error) {
        statusDiv.textContent = `ERROR: ${error.message}`;
    }
});

document.getElementById('add-video-capture-button').addEventListener('click', async () => {
    try {
        await window.core.addVideoCapture();
        statusDiv.textContent = 'SUCCESS: Video capture source added.';
    } catch (error) {
        statusDiv.textContent = `ERROR: ${error.message}`;
    }
});

document.getElementById('shutdown-button').addEventListener('click', async () => {
    try {
        await window.core.shutdown();
        statusDiv.textContent = 'SUCCESS: OBS shutdown sequence initiated.';
    } catch (error) {
        statusDiv.textContent = `ERROR: ${error.message}`;
    }
});
