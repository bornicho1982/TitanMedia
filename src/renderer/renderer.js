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
const enableAlertsCheckbox = document.getElementById('enable-alerts');

// Twitch Accounts constants
const twitchLoginButton = document.getElementById('twitch-login-button');
const twitchLogoutButton = document.getElementById('twitch-logout-button');
const twitchLoggedOutView = document.getElementById('twitch-logged-out-view');
const twitchLoggedInView = document.getElementById('twitch-logged-in-view');
const twitchUsernameSpan = document.getElementById('twitch-username');

// Stream Manager constants
const streamManagerPanel = document.getElementById('stream-manager-panel');
const streamTitleInput = document.getElementById('stream-title');
const streamCategoryInput = document.getElementById('stream-category');
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
let alertSettings = { enabled: false };
let twitchUser = null;
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

// OBS Property Types Enum (for clarity, must match obs-properties.h)
const OBS_PROPERTY_BOOL = 0;
const OBS_PROPERTY_INT = 1;
const OBS_PROPERTY_FLOAT = 2;
const OBS_PROPERTY_TEXT = 3;
const OBS_PROPERTY_LIST = 4;
const OBS_PROPERTY_COLOR = 7;

async function openPropertiesModal(sourceName) {
    propertiesTitle.textContent = `Propiedades de: ${sourceName}`;
    propertiesFormContainer.innerHTML = '';

    try {
        const properties = await window.core.getSourceProperties(sourceName);
        if (!properties || properties.length === 0) {
            propertiesFormContainer.innerHTML = '<p>Esta fuente no tiene propiedades configurables.</p>';
        } else {
            properties.forEach(prop => {
                const propContainer = document.createElement('div');
                propContainer.className = 'mb-4';
                const label = document.createElement('label');
                label.textContent = prop.description;
                label.className = 'block mb-1 text-sm font-medium';
                propContainer.appendChild(label);

                let control;
                switch (prop.type) {
                    case OBS_PROPERTY_BOOL:
                        control = document.createElement('input');
                        control.type = 'checkbox';
                        control.name = prop.name;
                        control.checked = prop.value;
                        control.className = 'h-6 w-6 rounded text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500';
                        break;
                    case OBS_PROPERTY_INT:
                    case OBS_PROPERTY_FLOAT:
                        control = document.createElement('input');
                        control.type = 'range';
                        control.name = prop.name;
                        control.min = prop.min;
                        control.max = prop.max;
                        control.step = prop.step;
                        control.value = prop.value;
                        control.className = 'w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer';
                        // Add a label to show the current value
                        const valueLabel = document.createElement('span');
                        valueLabel.textContent = ` (${prop.value})`;
                        valueLabel.className = 'text-xs text-gray-400';
                        label.appendChild(valueLabel);
                        control.addEventListener('input', () => valueLabel.textContent = ` (${control.value})`);
                        break;
                    case OBS_PROPERTY_TEXT:
                        control = document.createElement('input');
                        control.type = 'text';
                        control.name = prop.name;
                        control.value = prop.value;
                        control.className = 'bg-gray-700 border border-gray-600 rounded w-full p-2';
                        break;
                    case OBS_PROPERTY_COLOR:
                        control = document.createElement('input');
                        control.type = 'color';
                        control.name = prop.name;
                        // Convert integer color to hex
                        control.value = `#${(prop.value & 0xFFFFFF).toString(16).padStart(6, '0')}`;
                        control.className = 'bg-gray-700 border border-gray-600 rounded h-10 w-full p-1';
                        break;
                    case OBS_PROPERTY_LIST:
                        control = document.createElement('select');
                        control.name = prop.name;
                        control.className = 'bg-gray-700 border border-gray-600 rounded w-full p-2';
                        prop.options.forEach(option => {
                            const opt = document.createElement('option');
                            opt.value = option.value;
                            opt.textContent = option.name;
                            if (option.value === prop.value) {
                                opt.selected = true;
                            }
                            control.appendChild(opt);
                        });
                        break;
                }
                if (control) {
                    propContainer.appendChild(control);
                }
                propertiesFormContainer.appendChild(propContainer);
            });
        }
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
        const name = el.name;
        switch (el.type) {
            case 'checkbox':
                newSettings[name] = el.checked;
                break;
            case 'range':
            case 'number':
                newSettings[name] = parseFloat(el.value);
                break;
            case 'color':
                // Convert hex color #RRGGBB to an integer
                newSettings[name] = parseInt(el.value.substring(1), 16);
                break;
            case 'text':
            case 'select-one':
            default:
                newSettings[name] = el.value;
                break;
        }
    });

    try {
        await window.core.updateSourceProperties(sourceName, newSettings);
        console.log(`Updated properties for ${sourceName}`, newSettings);
        propertiesModal.classList.add('hidden');
        // A quick refresh of the source list can be good if names change, etc.
        updateSourceList(activeScene);
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
        setupTwitchAuth();
        setupStreamManager();
        setupAlerts(); // New function for Alerts
        setupChat();

        const savedScenes = await window.core.loadScenes();
        if (savedScenes && savedScenes.length > 0) {
            await window.core.loadFullSceneData(savedScenes);
            console.log("Loaded scenes from database.");
        } else {
            // If no scenes are loaded, create a default one
            await window.core.createScene("Scene 1");
             console.log("No saved scenes found. Created a default scene.");
        }

        await updateSceneList();
        await updateOverlayGallery();
        const scenes = await window.core.getSceneList();
        if (scenes.length > 0) {
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
            tabs.forEach(t => t.classList.remove('active-tab'));
            tab.classList.add('active-tab');

            const tabName = tab.dataset.tab;
            tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== `tab-content-${tabName}`);
            });
        });
    });

    settingsButton.addEventListener('click', () => {
        rtmpServerInput.value = streamSettings.server;
        streamKeyInput.value = streamSettings.key;
        streamerNameInput.value = brandingSettings.name;
        brandColorInput.value = brandingSettings.color;
        logoPathElement.textContent = brandingSettings.logo || 'Ningún archivo seleccionado.';

        updateTwitchAuthStateUI();
        settingsModal.classList.remove('hidden');
    });

    settingsCancelButton.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    settingsSaveButton.addEventListener('click', () => {
        streamSettings.server = rtmpServerInput.value;
        streamSettings.key = streamKeyInput.value;
        localStorage.setItem('streamSettings', JSON.stringify(streamSettings));

        brandingSettings.name = streamerNameInput.value;
        brandingSettings.color = brandColorInput.value;
        localStorage.setItem('brandingSettings', JSON.stringify(brandingSettings));

        alertSettings.enabled = enableAlertsCheckbox.checked;
        localStorage.setItem('alertSettings', JSON.stringify(alertSettings));

        console.log("Settings saved:", { streamSettings, brandingSettings, alertSettings });
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
    const savedAlertSettings = localStorage.getItem('alertSettings');
    if (savedAlertSettings) {
        alertSettings = JSON.parse(savedAlertSettings);
    }
}

// --- Twitch, Stream Manager & Chat Logic ---

function updateTwitchAuthStateUI() {
    if (twitchUser) {
        twitchLoggedInView.classList.remove('hidden');
        twitchLoggedOutView.classList.add('hidden');
        twitchUsernameSpan.textContent = twitchUser.username;
        streamManagerPanel.classList.remove('hidden'); // Show manager
    } else {
        twitchLoggedInView.classList.add('hidden');
        twitchLoggedOutView.classList.remove('hidden');
        streamManagerPanel.classList.add('hidden'); // Hide manager
    }
    enableAlertsCheckbox.checked = alertSettings.enabled;
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
    if (twitchUser) {
        loadStreamInfo(); // Load info on startup if logged in
    }

    twitchLoginButton.addEventListener('click', async () => {
        twitchUser = await window.core.twitchLogin();
        updateTwitchAuthStateUI();
        if (twitchUser) {
            console.log(`Logged in as ${twitchUser.username}`);
            loadStreamInfo(); // Load info after login
        } else {
            console.log("Login flow was cancelled.");
        }
    });

    twitchLogoutButton.addEventListener('click', async () => {
        await window.core.twitchLogout();
        twitchUser = null;
        updateTwitchAuthStateUI();
        streamTitleInput.value = '';
        streamCategoryInput.value = '';
        console.log("Logged out.");
    });
}

function setupStreamManager() {
    updateStreamInfoButton.addEventListener('click', async () => {
        const title = streamTitleInput.value;
        const category = streamCategoryInput.value;

        if (!title || !category) {
            alert("El título y la categoría no pueden estar vacíos.");
            return;
        }

        try {
            updateStreamInfoButton.textContent = "Actualizando...";
            updateStreamInfoButton.disabled = true;
            await window.core.updateChannelInfo(title, category);
            alert("Información del stream actualizada con éxito.");
        } catch (error) {
            console.error("Failed to update stream info:", error);
            alert(`Error al actualizar: ${error.message}`);
        } finally {
            updateStreamInfoButton.textContent = "Actualizar";
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
            chatConnectButton.classList.replace('bg-red-600', 'bg-green-600');
            isConnected = false;
        } else {
            if (!twitchUser) {
                alert("Por favor, inicia sesión con tu cuenta de Twitch en Ajustes.");
                return;
            }
            window.core.chatConnect();
            chatConnectButton.textContent = 'Desconectar';
            chatConnectButton.classList.replace('bg-green-600', 'bg-red-600');
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

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            chatSendButton.click();
        }
    });

    window.core.onChatMessage(({ username, message, color }) => {
        const messageElement = document.createElement('div');
        const usernameSpan = document.createElement('span');
        usernameSpan.className = 'font-bold';
        usernameSpan.textContent = username;
        usernameSpan.style.color = color || '#FFFFFF';

        const contentSpan = document.createElement('span');
        contentSpan.textContent = `: ${message}`;

        messageElement.appendChild(usernameSpan);
        messageElement.appendChild(contentSpan);

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
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

// --- Alerts Logic ---

const ALERT_SOURCE_NAME = "TitanMedia Alert Box";
let alertTimeoutId = null;

async function triggerAlert(username) {
    if (!alertSettings.enabled || !programScene) return;

    try {
        const alertOverlay = await window.core.getOverlayTemplates().then(o => o.find(t => t.name === 'Basic Alert'));
        if (!alertOverlay) {
            console.error("Basic Alert overlay template not found.");
            return;
        }

        // 1. Update the URL with the new username and a timestamp to force reload
        const newUrl = new URL(alertOverlay.url);
        newUrl.searchParams.set('username', username);
        newUrl.searchParams.set('t', Date.now());

        await window.core.updateSourceProperties(ALERT_SOURCE_NAME, { url: newUrl.href });

        // 2. Show the source
        await window.core.setSceneItemVisible(programScene, ALERT_SOURCE_NAME, true);

        // 3. Hide the source after a delay
        if (alertTimeoutId) clearTimeout(alertTimeoutId);
        alertTimeoutId = setTimeout(() => {
            window.core.setSceneItemVisible(programScene, ALERT_SOURCE_NAME, false);
        }, 6000); // Hide after 6 seconds

    } catch (error) {
        console.error("Failed to trigger alert:", error);
    }
}


function setupAlerts() {
    // Listen for incoming follow events
    window.core.onTwitchFollow(({ username }) => {
        console.log(`Received follow event for ${username}. Triggering alert.`);
        triggerAlert(username);
    });

    // Handle the user enabling/disabling alerts
    enableAlertsCheckbox.addEventListener('change', async () => {
        alertSettings.enabled = enableAlertsCheckbox.checked;
        localStorage.setItem('alertSettings', JSON.stringify(alertSettings));

        if (!programScene && alertSettings.enabled) {
            alert("Por favor, selecciona una escena de programa (en vivo) antes de activar las alertas.");
            enableAlertsCheckbox.checked = false; // Revert checkbox
            return;
        }

        try {
            if (alertSettings.enabled) {
                const alertOverlay = await window.core.getOverlayTemplates().then(o => o.find(t => t.name === 'Basic Alert'));
                await window.core.addSource(programScene, 'browser_source', ALERT_SOURCE_NAME);
                await window.core.updateSourceProperties(ALERT_SOURCE_NAME, {
                    url: alertOverlay.url,
                    width: 1920,
                    height: 1080
                });
                await window.core.setSceneItemVisible(programScene, ALERT_SOURCE_NAME, false);
                console.log("Alert source added to program scene.");
            } else {
                await window.core.removeSource(programScene, ALERT_SOURCE_NAME);
                console.log("Alert source removed from program scene.");
            }
        } catch (error) {
            console.warn("Could not add/remove alert source:", error.message);
        }
    });
}
