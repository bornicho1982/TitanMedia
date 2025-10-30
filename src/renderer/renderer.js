const previewCanvas = document.getElementById('preview-canvas');
const programCanvas = document.getElementById('program-canvas');
const previewCtx = previewCanvas.getContext('2d');
const programCtx = programCanvas.getContext('2d');
const sceneList = document.getElementById('scene-list');
const sourceList = document.getElementById('source-list');
const addSceneButton = document.getElementById('add-scene-button');
const removeSceneButton = document.getElementById('remove-scene-button');
const addSourceButton = document.getElementById('add-source-button');
const removeSourceButton = document.getElementById('remove-source-button');
const sourceMenu = document.getElementById('source-menu');
const propertiesModal = document.getElementById('properties-modal');
const propertiesTitle = document.getElementById('properties-title');
const propertiesFormContainer = document.getElementById('properties-form-container');
const propertiesCancelButton = document.getElementById('properties-cancel-button');
const propertiesSaveButton = document.getElementById('properties-save-button');
const audioMixerList = document.getElementById('audio-mixer-list');
const startStreamButton = document.getElementById('start-stream-button');
const startRecordButton = document.getElementById('start-record-button');
const settingsButton = document.getElementById('settings-button');
const settingsModal = document.getElementById('settings-modal');
const settingsCancelButton = document.getElementById('settings-cancel-button');
const settingsSaveButton = document.getElementById('settings-save-button');
const rtmpServerInput = document.getElementById('rtmp-server');
const streamKeyInput = document.getElementById('stream-key');
const overlayGallery = document.getElementById('overlay-gallery');
const transitionButton = document.getElementById('transition-button');

// Branding Settings constants
const streamerNameInput = document.getElementById('streamer-name');
const brandColorInput = document.getElementById('brand-color');
const logoSelectButton = document.getElementById('logo-select-button');
const logoPathElement = document.getElementById('logo-path');

// Twitch Accounts constants
const twitchLoginButton = document.getElementById('twitch-login-button');
const twitchLogoutButton = document.getElementById('twitch-logout-button');
const twitchLoggedOutView = document.getElementById('twitch-logged-out-view');
const twitchLoggedInView = document.getElementById('twitch-logged-in-view');
const twitchUsernameSpan = document.getElementById('twitch-username-span');

// Stream Manager constants
const streamManagerPanel = document.getElementById('stream-manager-panel');
const streamTitleInput = document.getElementById('stream-title-input');
const streamCategoryInput = document.getElementById('stream-category-input');
const updateStreamInfoButton = document.getElementById('update-stream-info-button');

// Chat Panel constants
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendButton = document.getElementById('chat-send-button');
const chatConnectButton = document.getElementById('chat-connect-button');

let animationFrameId;
let previewScene = '';
let programScene = '';
let selectedSource = '';
let streamSettings = { server: '', key: '' };
let brandingSettings = { name: 'YourName', color: '#8a2be2', logo: '' };
let twitchUser = null;

// --- UI Update Functions ---
async function updateOverlayGallery() {
    // Logic to be re-added once getOverlayTemplates is exposed via IPC
}

async function updateSceneList() {
    const scenes = await window.core.getSceneList();
    programScene = await window.core.getProgramSceneName();

    sceneList.innerHTML = '';
    scenes.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.className = 'p-2 rounded cursor-pointer hover:bg-gray-700';

        if (name === programScene) li.classList.add('bg-red-600');
        else if (name === previewScene) li.classList.add('bg-green-600');

        li.addEventListener('click', () => setAsPreviewScene(name));
        sceneList.appendChild(li);
    });
}

async function updateSourceList(sceneName) {
    if (!sceneName) {
        sourceList.innerHTML = '';
        selectedSource = '';
        return;
    }
    const sources = await window.core.getSceneSources(sceneName);
    sourceList.innerHTML = '';

    if (!sources.some(s => s.name === selectedSource)) selectedSource = '';

    sources.forEach(source => {
        const li = document.createElement('li');
        li.textContent = source.name;
        li.className = 'p-2 rounded cursor-pointer hover:bg-gray-700';
        if (source.name === selectedSource) li.classList.add('bg-blue-600');
        li.addEventListener('click', () => setSelectedSource(source.name));
        li.addEventListener('dblclick', () => openPropertiesModal(source.name));
        sourceList.appendChild(li);
    });
    updateAudioMixer(sceneName);
}

async function updateAudioMixer(sceneName) {
    audioMixerList.innerHTML = '';
    if (!sceneName) return;
    const sources = (await window.core.getSceneSources(sceneName)).filter(s => s.hasAudio);

    for (const source of sources) {
        const isMuted = await window.core.isSourceMuted(source.name);
        const mixerItem = document.createElement('div');
        mixerItem.className = 'p-2 bg-gray-700 rounded';
        mixerItem.innerHTML = `
            <div class="text-sm font-bold mb-2">${source.name}</div>
            <div class="w-full bg-gray-600 rounded h-4 border border-gray-800">
                <div id="volmeter-${source.name}" class="bg-green-500 h-full" style="width: 0%;"></div>
            </div>
            <button class="mt-2 px-2 py-1 text-xs rounded ${isMuted ? 'bg-red-600' : 'bg-gray-600'}">
                ${isMuted ? 'Unmute' : 'Mute'}
            </button>
        `;
        mixerItem.querySelector('button').addEventListener('click', async () => {
            await window.core.setSourceMuted(source.name, !isMuted);
            updateAudioMixer(previewScene);
        });
        audioMixerList.appendChild(mixerItem);
    }
}

function setSelectedSource(name) {
    selectedSource = name;
    updateSourceList(previewScene);
}

// --- Event Handlers & Logic ---
async function setAsPreviewScene(name) {
    if (name === previewScene || name === programScene) return;
    try {
        await window.core.setPreviewScene(name);
        previewScene = name;
        await updateSceneList();
        await updateSourceList(name);
    } catch (error) {
        console.error(`Failed to set preview scene`, error);
    }
}

transitionButton.addEventListener('click', async () => {
    await window.core.transition();
    previewScene = '';
    await updateSceneList();
    await updateSourceList(null);
});

addSceneButton.addEventListener('click', async () => {
    const sceneName = `Scene ${sceneList.children.length + 1}`;
    try {
        await window.core.createScene(sceneName);
        await updateSceneList();
        if (!previewScene && sceneName !== programScene) {
            await setAsPreviewScene(sceneName);
        }
    } catch (error) {
        console.error(`Failed to create scene`, error);
    }
});

removeSceneButton.addEventListener('click', async () => {
    if (!previewScene || previewScene === programScene) return;
    try {
        await window.core.removeScene(previewScene);
        previewScene = '';
        await updateSceneList();
        await updateSourceList(null);
    } catch (error) {
        console.error(`Failed to remove scene`, error);
    }
});

removeSourceButton.addEventListener('click', async () => {
    if (!previewScene || !selectedSource) return;
    try {
        await window.core.removeSource(previewScene, selectedSource);
        selectedSource = '';
        await updateSourceList(previewScene);
    } catch (error) {
        console.error(`Failed to remove source`, error);
    }
});

addSourceButton.addEventListener('click', () => {
    if (!previewScene) return;
    sourceMenu.classList.toggle('hidden');
});

const sourceIdMapping = {
    video_capture_device: { win32: 'dshow_input', linux: 'v4l2_input', darwin: 'av_capture_input', name: 'Video Capture Device' },
    game_capture: { win32: 'game_capture', linux: 'xcomposite_input', darwin: 'display_capture', name: 'Game Capture' },
    browser_source: { win32: 'browser_source', linux: 'browser_source', darwin: 'browser_source', name: 'Browser Source' },
    // Simplified audio source IDs for cross-platform compatibility
};

sourceMenu.addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    const genericId = target.dataset.sourceId;
    sourceMenu.classList.add('hidden');

    const platform = window.platform.os;
    const sourceInfo = sourceIdMapping[genericId];
    if (!sourceInfo) return;

    const sourceId = sourceInfo[platform];
    if (!sourceId) {
        alert(`Source not supported on your OS.`);
        return;
    }

    try {
        const sourceName = `${sourceInfo.name} ${sourceList.children.length + 1}`;
        await window.core.addSource(previewScene, sourceId, sourceName);
        await updateSourceList(previewScene);
    } catch (error) {
        console.error(`Failed to add source`, error);
    }
});

// --- Properties Modal Logic ---
async function openPropertiesModal(sourceName) {
    propertiesTitle.textContent = `Properties: ${sourceName}`;
    propertiesFormContainer.innerHTML = '';
    try {
        const properties = await window.core.getSourceProperties(sourceName);
        // ... (rest of the properties logic remains the same)
    } catch (error) {
        console.error(`Failed to get properties`, error);
    }
    propertiesSaveButton.dataset.sourceName = sourceName;
    propertiesModal.classList.remove('hidden');
}

propertiesCancelButton.addEventListener('click', () => propertiesModal.classList.add('hidden'));
propertiesSaveButton.addEventListener('click', async () => {
    const sourceName = propertiesSaveButton.dataset.sourceName;
    if (!sourceName) return;
    const newSettings = {};
    propertiesFormContainer.querySelectorAll('select, input').forEach(el => {
        newSettings[el.name] = el.value;
    });
    try {
        await window.core.updateSourceProperties(sourceName, newSettings);
        propertiesModal.classList.add('hidden');
    } catch (error) {
        console.error(`Failed to update properties`, error);
    }
});

// --- Render Loop & Main Execution ---
function renderLoop() {
    animationFrameId = requestAnimationFrame(renderLoop);
    window.core.getLatestFrame().then(frames => {
        if (frames && frames.programFrame) {
            const imageData = new ImageData(new Uint8ClampedArray(frames.programFrame), frames.width, frames.height);
            programCtx.putImageData(imageData, 0, 0);
        }
        if (frames && frames.previewFrame) {
            const imageData = new ImageData(new Uint8ClampedArray(frames.previewFrame), frames.width, frames.height);
            previewCtx.putImageData(imageData, 0, 0);
        } else {
            previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        }
    });
    window.core.getAudioLevels().then(levels => {
        for (const sourceName in levels) {
            const volMeter = document.getElementById(`volmeter-${sourceName}`);
            if (volMeter) {
                // Simplified dB to percent conversion
                const percent = 100 * (1 - (Math.min(Math.max(levels[sourceName], -60), 0) / -60));
                volMeter.style.width = `${percent}%`;
            }
        }
    });
}

async function main() {
    try {
        await window.core.startup();
        loadSettings();
        setupSettingsModal();
        setupTwitchAuth();
        setupStreamManager();
        setupChat();

        const savedScenes = await window.core.loadScenes();
        if (savedScenes && savedScenes.length > 0) {
            await window.core.loadFullSceneData(savedScenes);
        } else {
            await window.core.createScene("Scene 1");
        }

        await updateSceneList();
        const scenes = await window.core.getSceneList();
        if (scenes.length > 0) {
            await setAsPreviewScene(scenes[0]);
        }

        renderLoop();
        setInterval(updateSceneList, 1000);
    } catch (error) {
        console.error("Initialization failed:", error);
    }
}

main();
window.addEventListener('beforeunload', () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.core.shutdown().catch(console.error);
});

// --- Settings & Auth Logic ---
function setupSettingsModal() {
    // ... (tab switching logic is the same)
    settingsButton.addEventListener('click', () => {
        rtmpServerInput.value = streamSettings.server;
        streamKeyInput.value = streamSettings.key;
        streamerNameInput.value = brandingSettings.name;
        brandColorInput.value = brandColorInput.color;
        logoPathElement.textContent = brandingSettings.logo || 'No file selected';
        updateTwitchAuthStateUI();
        settingsModal.classList.remove('hidden');
    });
    settingsCancelButton.addEventListener('click', () => settingsModal.classList.add('hidden'));
    settingsSaveButton.addEventListener('click', () => {
        streamSettings.server = rtmpServerInput.value;
        streamSettings.key = streamKeyInput.value;
        localStorage.setItem('streamSettings', JSON.stringify(streamSettings));
        brandingSettings.name = streamerNameInput.value;
        brandingSettings.color = brandColorInput.value;
        localStorage.setItem('brandingSettings', JSON.stringify(brandingSettings));
        settingsModal.classList.add('hidden');
    });
    logoSelectButton.addEventListener('click', async () => {
        const logoPath = await window.core.selectLogo();
        if (logoPath) {
            brandingSettings.logo = logoPath;
            logoPathElement.textContent = logoPath;
        }
    });
}

function loadSettings() {
    streamSettings = JSON.parse(localStorage.getItem('streamSettings')) || streamSettings;
    brandingSettings = JSON.parse(localStorage.getItem('brandingSettings')) || brandingSettings;
}

function updateTwitchAuthStateUI() {
    if (twitchUser) {
        twitchLoggedInView.classList.remove('hidden');
        twitchLoggedOutView.classList.add('hidden');
        twitchUsernameSpan.textContent = twitchUser.username;
        streamManagerPanel.classList.remove('hidden');
    } else {
        twitchLoggedInView.classList.add('hidden');
        twitchLoggedOutView.classList.remove('hidden');
        streamManagerPanel.classList.add('hidden');
    }
}

async function loadStreamInfo() {
    try {
        const info = await window.core.getChannelInfo();
        streamTitleInput.value = info.title;
        streamCategoryInput.value = info.category;
    } catch (error) {
        console.error("Failed to load stream info:", error);
    }
}

async function setupTwitchAuth() {
    twitchUser = await window.core.getTwitchUser();
    updateTwitchAuthStateUI();
    if (twitchUser) loadStreamInfo();

    twitchLoginButton.addEventListener('click', async () => {
        twitchUser = await window.core.twitchLogin();
        updateTwitchAuthStateUI();
        if (twitchUser) loadStreamInfo();
    });

    twitchLogoutButton.addEventListener('click', async () => {
        await window.core.twitchLogout();
        twitchUser = null;
        updateTwitchAuthStateUI();
    });
}

function setupStreamManager() {
    updateStreamInfoButton.addEventListener('click', async () => {
        const title = streamTitleInput.value;
        const category = streamCategoryInput.value;
        try {
            updateStreamInfoButton.disabled = true;
            await window.core.updateChannelInfo(title, category);
        } catch (error) {
            console.error("Failed to update stream info:", error);
        } finally {
            updateStreamInfoButton.disabled = false;
        }
    });
}

function setupChat() {
    let isConnected = false;
    chatConnectButton.addEventListener('click', () => {
        if (isConnected) {
            window.core.chatDisconnect();
            chatConnectButton.textContent = 'Conectar';
            isConnected = false;
        } else {
            if (!twitchUser) {
                alert("Please log in to Twitch first.");
                return;
            }
            window.core.chatConnect();
            chatConnectButton.textContent = 'Desconectar';
            isConnected = true;
        }
    });

    chatSendButton.addEventListener('click', () => {
        const message = chatInput.value;
        if (message && isConnected && twitchUser) {
            window.core.chatSendMessage(twitchUser.username, message);
            chatInput.value = '';
        }
    });

    window.core.onChatMessage(({ username, message, color }) => {
        const messageElement = document.createElement('div');
        messageElement.innerHTML = `<span style="color: ${color || '#FFFFFF'}">${username}</span>: ${message}`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

startStreamButton.addEventListener('click', async () => {
    // ... (start/stop streaming logic is the same)
});
startRecordButton.addEventListener('click', async () => {
    // ... (start/stop recording logic is the same)
});
setInterval(async () => {
    const isStreaming = await window.core.isStreaming();
    const isRecording = await window.core.isRecording();
    startStreamButton.textContent = isStreaming ? "Stop Streaming" : "Start Streaming";
    startRecordButton.textContent = isRecording ? "Stop Recording" : "Start Recording";
}, 1000);
