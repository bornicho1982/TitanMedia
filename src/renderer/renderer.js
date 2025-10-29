const previewCanvas = document.getElementById('preview-canvas');
const programCanvas = document.getElementById('program-canvas');
const previewCtx = previewCanvas.getContext('2d');
const programCtx = programCanvas.getContext('2d');
const sceneList = document.getElementById('scene-list');
const sourceList = document.getElementById('source-list');
const addSceneButton = document.getElementById('add-scene-button');
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

// Branding Settings constants
const streamerNameInput = document.getElementById('streamer-name');
const brandColorInput = document.getElementById('brand-color');
const logoSelectButton = document.getElementById('logo-select-button');
const logoPathElement = document.getElementById('logo-path');

// Twitch Accounts constants
const twitchChannelInput = document.getElementById('twitch-channel');
const twitchOauthInput = document.getElementById('twitch-oauth');

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
let twitchSettings = { channel: '', oauth: '' };
const transitionButton = document.getElementById('transition-button');

// --- UI Update Functions ---

async function updateOverlayGallery() {
    const overlays = await window.core.getOverlayTemplates();
    overlayGallery.innerHTML = ''; // Clear gallery

    overlays.forEach(overlay => {
        const overlayItem = document.createElement('div');
        overlayItem.className = 'cursor-pointer rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500';
        overlayItem.addEventListener('click', () => addOverlayToScene(overlay));

        const img = document.createElement('img');
        img.src = overlay.thumbnail;
        img.className = 'w-full h-auto object-cover';

        const name = document.createElement('p');
        name.textContent = overlay.name;
        name.className = 'text-center text-xs p-1 bg-gray-900 bg-opacity-75';

        overlayItem.appendChild(img);
        overlayItem.appendChild(name);
        overlayGallery.appendChild(overlayItem);
    });
}

async function updateSceneList() {
    const scenes = await window.core.getSceneList();
    programScene = await window.core.getProgramSceneName();

    sceneList.innerHTML = ''; // Clear list
    scenes.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.className = 'p-2 rounded cursor-pointer hover:bg-gray-700';

        if (name === programScene) {
            li.classList.add('bg-red-600'); // Program scene
        } else if (name === previewScene) {
            li.classList.add('bg-green-600'); // Preview scene
        }

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

    const selectedSourceExists = sources.some(s => s.name === selectedSource);
    if (!selectedSourceExists) {
        selectedSource = '';
    }

    sources.forEach(source => {
        const li = document.createElement('li');
        li.textContent = source.name;
        li.className = 'p-2 rounded cursor-pointer hover:bg-gray-700';
        if (source.name === selectedSource) {
            li.classList.add('bg-blue-600');
        }
        li.addEventListener('click', () => setSelectedSource(source.name));
        li.addEventListener('dblclick', () => openPropertiesModal(source.name));
        sourceList.appendChild(li);
    });

    updateAudioMixer(sceneName);
}

async function updateAudioMixer(sceneName) {
    audioMixerList.innerHTML = ''; // Clear old controls
    if (!sceneName) return;

    const sources = await window.core.getSceneSources(sceneName);
    const audioSources = sources.filter(s => s.hasAudio);

    for (const source of audioSources) {
        const isMuted = await window.core.isSourceMuted(source.name);

        const mixerItem = document.createElement('div');
        mixerItem.className = 'p-2 bg-gray-700 rounded';

        const nameLabel = document.createElement('div');
        nameLabel.textContent = source.name;
        nameLabel.className = 'text-sm font-bold mb-2';

        // Volume meter will be implemented in the next step
        const volMeter = document.createElement('div');
        volMeter.className = 'w-full bg-gray-600 rounded h-4 border border-gray-800';
        volMeter.innerHTML = `<div id="volmeter-${source.name}" class="bg-green-500 h-full" style="width: 0%;"></div>`;

        const muteButton = document.createElement('button');
        muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
        muteButton.className = `mt-2 px-2 py-1 text-xs rounded ${isMuted ? 'bg-red-600' : 'bg-gray-600'}`;

        muteButton.addEventListener('click', async () => {
            const currentlyMuted = await window.core.isSourceMuted(source.name);
            await window.core.setSourceMuted(source.name, !currentlyMuted);
            updateAudioMixer(activeScene); // Refresh mixer to show new state
        });

        mixerItem.appendChild(nameLabel);
        mixerItem.appendChild(volMeter);
        mixerItem.appendChild(muteButton);
        audioMixerList.appendChild(mixerItem);
    }
}

function setSelectedSource(name) {
    selectedSource = name;
    updateSourceList(activeScene); // Re-render to show selection
}

// --- Event Handlers & Logic ---

async function setAsPreviewScene(name) {
    if (name === previewScene || name === programScene) return;
    try {
        await window.core.setPreviewScene(name);
        previewScene = name;
        console.log(`Set preview scene to: ${name}`);
        await updateSceneList();
        await updateSourceList(name);
    } catch (error) {
        console.error(`Failed to set preview scene: ${name}`, error);
    }
}

transitionButton.addEventListener('click', async () => {
    await window.core.executeTransition();
    previewScene = '';
    await updateSceneList();
    // Update source list to reflect the new empty preview scene
    await updateSourceList(null);
});


addSceneButton.addEventListener('click', async () => {
    const sceneName = `Scene ${sceneList.children.length + 1}`;
    try {
        await window.core.createScene(sceneName);
        console.log(`Created scene: ${sceneName}`);
        await updateSceneList();
        // If there's no preview scene, set the new one as preview
        if (!previewScene && sceneName !== programScene) {
            await setAsPreviewScene(sceneName);
        }
    } catch (error) {
        console.error(`Failed to create scene: ${sceneName}`, error);
    }
});

removeSourceButton.addEventListener('click', async () => {
    if (!previewScene || !selectedSource) {
        alert("Please select a source to remove from the preview scene.");
        return;
    }
    try {
        await window.core.removeSource(previewScene, selectedSource);
        console.log(`Removed source '${selectedSource}' from scene '${previewScene}'`);
        selectedSource = ''; // Clear selection
        await updateSourceList(previewScene);
    } catch (error) {
        console.error(`Failed to remove source:`, error);
        alert(`Error removing source: ${error.message}`);
    }
});

addSourceButton.addEventListener('click', () => {
    if (!activeScene) {
        alert("Please select a scene first!");
        return;
    }
    sourceMenu.classList.toggle('hidden');
});

const sourceIdMapping = {
    video_capture_device: {
        win32: 'dshow_input',
        linux: 'v4l2_input',
        darwin: 'av_capture_input',
        name: 'Dispositivo de Captura de Video'
    },
    game_capture: {
        win32: 'game_capture',
        linux: 'xcomposite_input', // A reasonable equivalent
        darwin: 'display_capture', // Game capture not directly available on macOS
        name: 'Captura de Juego'
    },
    browser_source: {
        win32: 'browser_source',
        linux: 'browser_source',
        darwin: 'browser_source',
        name: 'Fuente de Navegador'
    },
    audio_input_capture: {
        win32: 'wasapi_input_capture',
        linux: 'pulse_input_capture',
        darwin: 'coreaudio_input_capture',
        name: 'Entrada de Audio'
    },
    audio_output_capture: {
        win32: 'wasapi_output_capture',
        linux: 'pulse_output_capture',
        darwin: 'coreaudio_output_capture',
        name: 'Salida de Audio'
    }
};

sourceMenu.addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    const genericId = target.dataset.sourceId;
    if (!genericId) return;

    sourceMenu.classList.add('hidden');

    const platform = window.platform.os;
    const sourceInfo = sourceIdMapping[genericId];
    if (!sourceInfo) {
        console.error(`Unknown source ID: ${genericId}`);
        return;
    }

    const sourceId = sourceInfo[platform];
    if (!sourceId) {
        alert(`La fuente '${sourceInfo.name}' no está soportada en tu sistema operativo (${platform}).`);
        return;
    }

    try {
        const existingSources = await window.core.getSceneSources(activeScene);
        const count = existingSources.filter(s => s.name.startsWith(sourceInfo.name)).length;
        const sourceName = `${sourceInfo.name} ${count + 1}`;

        await window.core.addSource(activeScene, sourceId, sourceName);
        console.log(`Added source '${sourceName}' (${sourceId}) to scene '${activeScene}'`);
        await updateSourceList(activeScene);
    } catch (error) {
        console.error(`Failed to add source to scene:`, error);
        alert(`Error al añadir la fuente: ${error.message}`);
    }
});

// --- Properties Modal Logic ---

// OBS Property Types Enum (for clarity)
const OBS_PROPERTY_LIST = 4;

async function openPropertiesModal(sourceName) {
    propertiesTitle.textContent = `Propiedades de: ${sourceName}`;
    propertiesFormContainer.innerHTML = ''; // Clear old form

    try {
        const properties = await window.core.getSourceProperties(sourceName);
        if (!properties) {
            propertiesFormContainer.innerHTML = '<p>Esta fuente no tiene propiedades configurables.</p>';
            propertiesModal.classList.remove('hidden');
            return;
        }

        properties.forEach(prop => {
            const propContainer = document.createElement('div');
            const label = document.createElement('label');
            label.textContent = prop.description;
            label.className = 'block mb-1 text-sm font-medium';
            propContainer.appendChild(label);

            if (prop.type === OBS_PROPERTY_LIST) {
                const select = document.createElement('select');
                select.name = prop.name;
                select.className = 'bg-gray-700 border border-gray-600 rounded w-full p-2';
                prop.options.forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option.value;
                    opt.textContent = option.name;
                    select.appendChild(opt);
                });
                propContainer.appendChild(select);
            }
            // TODO: Add handlers for other property types (bool, int, etc.)

            propertiesFormContainer.appendChild(propContainer);
        });

        // Store the source name for the save handler
        propertiesSaveButton.dataset.sourceName = sourceName;
        propertiesModal.classList.remove('hidden');

    } catch (error) {
        console.error(`Failed to get source properties:`, error);
        alert(`Error al obtener las propiedades: ${error.message}`);
    }
}

propertiesCancelButton.addEventListener('click', () => {
    propertiesModal.classList.add('hidden');
});

propertiesSaveButton.addEventListener('click', async () => {
    const sourceName = propertiesSaveButton.dataset.sourceName;
    if (!sourceName) return;

    const newSettings = {};
    const formElements = propertiesFormContainer.querySelectorAll('select, input');
    formElements.forEach(el => {
        // For now, we only handle select (string) values
        if (el.tagName === 'SELECT') {
            newSettings[el.name] = el.value;
        }
        // TODO: Handle other input types
    });

    try {
        await window.core.updateSourceProperties(sourceName, newSettings);
        console.log(`Updated properties for ${sourceName}`);
        propertiesModal.classList.add('hidden');
    } catch (error) {
        console.error(`Failed to update properties:`, error);
        alert(`Error al actualizar las propiedades: ${error.message}`);
    }
});


// --- Render Loop & Main Execution ---

function dbToPercent(db) {
    const minDb = -60.0;
    if (db < minDb) db = minDb;
    if (db > 0.0) db = 0.0;
    return 100 * (1 - (db / minDb));
}

function renderLoop() {
    animationFrameId = requestAnimationFrame(renderLoop);

    window.core.getLatestFrame().then(frames => {
        if (!frames) return;

        if (frames.programFrame) {
             if (programCanvas.width !== frames.width || programCanvas.height !== frames.height) {
                programCanvas.width = frames.width;
                programCanvas.height = frames.height;
            }
            const imageData = new ImageData(new Uint8ClampedArray(frames.programFrame), frames.width, frames.height);
            programCtx.putImageData(imageData, 0, 0);
        }

        if (frames.previewFrame) {
            if (previewCanvas.width !== frames.width || previewCanvas.height !== frames.height) {
                previewCanvas.width = frames.width;
                previewCanvas.height = frames.height;
            }
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
                const percent = dbToPercent(levels[sourceName]);
                volMeter.style.width = `${percent}%`;
            }
        }
    });
}

async function main() {
    try {
        console.log("Starting OBS...");
        await window.core.startup();
        console.log("OBS Started.");

        loadSettings();
        setupSettingsModal();
        setupChat();

        await updateSceneList();
        await updateOverlayGallery(); // Populate overlays on startup
        const scenes = await window.core.getSceneList();
        if (scenes.length > 0) {
            // Set the first scene as the active one for editing
            await setAsPreviewScene(scenes[0]);
        }

        renderLoop();
        setInterval(updateSceneList, 1000); // Periodically update scene highlights
    } catch (error) {
        console.error("Failed to initialize application:", error);
    }
}

async function addOverlayToScene(overlay) {
    if (!previewScene) {
        alert("Por favor, selecciona una escena de previsualización antes de añadir un overlay.");
        return;
    }
    try {
        const sourceName = `${overlay.name} Overlay`;
        await window.core.addSource(previewScene, 'browser_source', sourceName);

        const url = new URL(overlay.url);
        url.searchParams.append('name', brandingSettings.name);
        url.searchParams.append('color', brandingSettings.color);
        // Logo would be handled inside the overlay's JS if it needs to display it

        const settings = {
            url: url.href,
            width: 1920,
            height: 1080
        };
        await window.core.updateSourceProperties(sourceName, settings);

        console.log(`Added and configured overlay '${sourceName}' to scene '${previewScene}'`);
        await updateSourceList(previewScene);
    } catch (error) {
        console.error(`Failed to add overlay:`, error);
        alert(`Error al añadir el overlay: ${error.message}`);
    }
}

main();

window.addEventListener('beforeunload', () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.core.shutdown().catch(console.error);
});

// --- Settings Modal Logic ---

function setupSettingsModal() {
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab styles
            tabs.forEach(t => t.classList.remove('active-tab'));
            tab.classList.add('active-tab');

            // Show/hide content
            const tabName = tab.dataset.tab;
            tabContents.forEach(content => {
                if (content.id === `tab-content-${tabName}`) {
                    content.classList.remove('hidden');
                } else {
                    content.classList.add('hidden');
                }
            });
        });
    });

    settingsButton.addEventListener('click', () => {
        // Load current settings into the modal
        rtmpServerInput.value = streamSettings.server;
        streamKeyInput.value = streamSettings.key;
        streamerNameInput.value = brandingSettings.name;
        brandColorInput.value = brandingSettings.color;
        logoPathElement.textContent = brandingSettings.logo || 'Ningún archivo seleccionado.';
        twitchChannelInput.value = twitchSettings.channel;
        twitchOauthInput.value = twitchSettings.oauth;

        settingsModal.classList.remove('hidden');
    });

    settingsCancelButton.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    settingsSaveButton.addEventListener('click', () => {
        // Save stream settings
        streamSettings.server = rtmpServerInput.value;
        streamSettings.key = streamKeyInput.value;
        localStorage.setItem('streamSettings', JSON.stringify(streamSettings));

        // Save branding settings
        brandingSettings.name = streamerNameInput.value;
        brandingSettings.color = brandColorInput.value;
        // The logo path is saved by the logo selection logic
        localStorage.setItem('brandingSettings', JSON.stringify(brandingSettings));

        // Save Twitch settings
        twitchSettings.channel = twitchChannelInput.value;
        twitchSettings.oauth = twitchOauthInput.value;
        localStorage.setItem('twitchSettings', JSON.stringify(twitchSettings));

        console.log("Settings saved:", { streamSettings, brandingSettings, twitchSettings });
        settingsModal.classList.add('hidden');
    });

    logoSelectButton.addEventListener('click', async () => {
        const logoPath = await window.core.selectLogo();
        if (logoPath) {
            logoPathElement.textContent = logoPath;
            brandingSettings.logo = logoPath;
        }
    });
}

function loadSettings() {
    const savedStreamSettings = localStorage.getItem('streamSettings');
    if (savedStreamSettings) {
        streamSettings = JSON.parse(savedStreamSettings);
    }
    const savedBrandingSettings = localStorage.getItem('brandingSettings');
    if (savedBrandingSettings) {
        brandingSettings = JSON.parse(savedBrandingSettings);
    }
    const savedTwitchSettings = localStorage.getItem('twitchSettings');
    if (savedTwitchSettings) {
        twitchSettings = JSON.parse(savedTwitchSettings);
    }
}


// --- Chat Logic ---
function setupChat() {
    let isConnected = false;

    chatConnectButton.addEventListener('click', () => {
        if (isConnected) {
            // Disconnect
            window.core.chatDisconnect();
            chatConnectButton.textContent = 'Conectar';
            chatConnectButton.classList.remove('bg-red-600');
            chatConnectButton.classList.add('bg-green-600');
            isConnected = false;
        } else {
            // Connect
            if (!twitchSettings.channel || !twitchSettings.oauth) {
                alert("Por favor, configura tu canal de Twitch y tu token OAuth en Ajustes.");
                return;
            }
            const options = {
                options: { debug: true },
                identity: {
                    username: twitchSettings.channel, // In tmi, username and channel are often the same for chat bots
                    password: twitchSettings.oauth,
                },
                channels: [twitchSettings.channel],
            };
            window.core.chatConnect(options);
            chatConnectButton.textContent = 'Desconectar';
            chatConnectButton.classList.remove('bg-green-600');
            chatConnectButton.classList.add('bg-red-600');
            isConnected = true;
        }
    });

    chatSendButton.addEventListener('click', () => {
        const message = chatInput.value;
        if (message && isConnected) {
            window.core.chatSendMessage(twitchSettings.channel, message);
            chatInput.value = '';
        }
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            chatSendButton.click();
        }
    });

    window.core.onChatMessage(({ username, message, color }) => {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';

        const usernameSpan = document.createElement('span');
        usernameSpan.className = 'username';
        usernameSpan.textContent = username;
        usernameSpan.style.color = color;

        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        contentSpan.textContent = `: ${message}`;

        messageElement.appendChild(usernameSpan);
        messageElement.appendChild(contentSpan);

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to bottom
    });
}


// --- Output Control Logic ---

startStreamButton.addEventListener('click', async () => {
    const streaming = await window.core.isStreaming();
    if (streaming) {
        await window.core.stopStreaming();
    } else {
        if (!streamSettings.server || !streamSettings.key) {
            alert("Please set the RTMP server and stream key in Settings first.");
            return;
        }
        await window.core.startStreaming(streamSettings.server, streamSettings.key);
    }
});

startRecordButton.addEventListener('click', async () => {
    const recording = await window.core.isRecording();
    if (recording) {
        await window.core.stopRecording();
    } else {
        await window.core.startRecording();
    }
});

async function updateControlState() {
    const isStreaming = await window.core.isStreaming();
    const isRecording = await window.core.isRecording();

    if (isStreaming) {
        startStreamButton.textContent = "Detener Transmisión";
        startStreamButton.classList.remove('bg-blue-600');
        startStreamButton.classList.add('bg-red-600');
    } else {
        startStreamButton.textContent = "Iniciar Transmisión";
        startStreamButton.classList.remove('bg-red-600');
        startStreamButton.classList.add('bg-blue-600');
    }

    if (isRecording) {
        startRecordButton.textContent = "Detener Grabación";
        startRecordButton.classList.remove('bg-gray-600');
        startRecordButton.classList.add('bg-red-600');
    } else {
        startRecordButton.textContent = "Iniciar Grabación";
        startRecordButton.classList.remove('bg-red-600');
        startRecordButton.classList.add('bg-gray-600');
    }
}

setInterval(updateControlState, 1000); // Check status every second
