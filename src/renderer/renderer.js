const canvas = document.getElementById('video-preview');
const ctx = canvas.getContext('2d');
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

let animationFrameId;
let activeScene = '';
let selectedSource = '';
let streamSettings = { server: '', key: '' };

// --- UI Update Functions ---

async function updateSceneList() {
    const scenes = await window.core.getSceneList();
    sceneList.innerHTML = ''; // Clear list
    scenes.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.className = 'p-2 rounded cursor-pointer hover:bg-gray-700';
        if (name === activeScene) {
            li.classList.add('bg-blue-600');
        }
        li.addEventListener('click', () => setActiveScene(name));
        sceneList.appendChild(li);
    });
}

async function updateSourceList(sceneName) {
    if (!sceneName) {
        sourceList.innerHTML = '';
        selectedSource = ''; // Clear selection when scene changes
        return;
    }
    const sources = await window.core.getSceneSources(sceneName);
    sourceList.innerHTML = ''; // Clear list

    // Check if the selected source still exists
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

    updateAudioMixer(sceneName); // Update mixer when sources change
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

async function setActiveScene(name) {
    if (name === activeScene) return;
    try {
        await window.core.setCurrentScene(name);
        activeScene = name;
        console.log(`Set active scene to: ${name}`);
        await Promise.all([updateSceneList(), updateSourceList(name)]); // updateSourceList will call updateAudioMixer
    } catch (error) {
        console.error(`Failed to set active scene: ${name}`, error);
    }
}

addSceneButton.addEventListener('click', async () => {
    const sceneName = `Scene ${sceneList.children.length + 1}`;
    try {
        await window.core.createScene(sceneName);
        console.log(`Created scene: ${sceneName}`);
        await updateSceneList();
        if (!activeScene) {
            await setActiveScene(sceneName);
        }
    } catch (error) {
        console.error(`Failed to create scene: ${sceneName}`, error);
    }
});

removeSourceButton.addEventListener('click', async () => {
    if (!activeScene || !selectedSource) {
        alert("Please select a source to remove.");
        return;
    }
    try {
        await window.core.removeSource(activeScene, selectedSource);
        console.log(`Removed source '${selectedSource}' from scene '${activeScene}'`);
        selectedSource = ''; // Clear selection
        await updateSourceList(activeScene);
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

// Helper to convert dB to a percentage for the volume meter
function dbToPercent(db) {
    const minDb = -60.0;
    const maxDb = 0.0;
    if (db < minDb) db = minDb;
    if (db > maxDb) db = maxDb;
    return 100 * (db - minDb) / (maxDb - minDb);
}

function renderLoop() {
    animationFrameId = requestAnimationFrame(renderLoop);

    // Update video preview
    window.core.getLatestFrame().then(frame => {
        if (frame && frame.data) {
            if (canvas.width !== frame.width || canvas.height !== frame.height) {
                canvas.width = frame.width;
                canvas.height = frame.height;
            }
            const imageData = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
            ctx.putImageData(imageData, 0, 0);
        }
    });

    // Update audio meters
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

        await updateSceneList();
        const scenes = await window.core.getSceneList();
        if (scenes.length > 0) {
            await setActiveScene(scenes[0]);
        }

        renderLoop();
    } catch (error) {
        console.error("Failed to initialize application:", error);
    }
}

main();

window.addEventListener('beforeunload', () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.core.shutdown().catch(console.error);
});

// --- Settings Modal Logic ---
settingsButton.addEventListener('click', () => {
    rtmpServerInput.value = streamSettings.server;
    streamKeyInput.value = streamSettings.key;
    settingsModal.classList.remove('hidden');
});

settingsCancelButton.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

settingsSaveButton.addEventListener('click', () => {
    streamSettings.server = rtmpServerInput.value;
    streamSettings.key = streamKeyInput.value;
    // For a real app, we'd save this to disk (e.g., localStorage)
    console.log("Stream settings saved:", streamSettings);
    settingsModal.classList.add('hidden');
});

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
