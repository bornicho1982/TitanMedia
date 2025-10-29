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

document.getElementById('add-mic-button').addEventListener('click', async () => {
    try {
        await window.core.addMicSource();
        statusDiv.textContent = 'SUCCESS: Mic source added.';
    } catch (error) {
        statusDiv.textContent = `ERROR: ${error.message}`;
    }
});

document.getElementById('add-desktop-audio-button').addEventListener('click', async () => {
    try {
        await window.core.addDesktopAudioSource();
        statusDiv.textContent = 'SUCCESS: Desktop audio source added.';
    } catch (error) {
        statusDiv.textContent = `ERROR: ${error.message}`;
    }
});

document.getElementById('add-browser-source-button').addEventListener('click', async () => {
    try {
        const url = document.getElementById('browser-url').value;
        const width = parseInt(document.getElementById('browser-width').value, 10);
        const height = parseInt(document.getElementById('browser-height').value, 10);

        if (!url || !width || !height) {
            statusDiv.textContent = 'ERROR: URL, width, and height are required for browser source.';
            return;
        }

        await window.core.addBrowserSource(url, width, height);
        statusDiv.textContent = 'SUCCESS: Browser source added.';
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
