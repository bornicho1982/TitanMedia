const canvas = document.getElementById('video-preview');
const ctx = canvas.getContext('2d');
const sceneList = document.getElementById('scene-list');
const sourceList = document.getElementById('source-list');
const addSceneButton = document.getElementById('add-scene-button');
const addSourceButton = document.getElementById('add-source-button');
const sourceMenu = document.getElementById('source-menu');

let animationFrameId;
let activeScene = '';

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
        return;
    }
    const sources = await window.core.getSceneSources(sceneName);
    sourceList.innerHTML = ''; // Clear list
    sources.forEach(source => {
        const li = document.createElement('li');
        li.textContent = source.name;
        li.className = 'p-2 rounded';
        sourceList.appendChild(li);
    });
}

// --- Event Handlers & Logic ---

async function setActiveScene(name) {
    if (name === activeScene) return;
    try {
        await window.core.setCurrentScene(name);
        activeScene = name;
        console.log(`Set active scene to: ${name}`);
        await Promise.all([updateSceneList(), updateSourceList(name)]);
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

// --- Render Loop & Main Execution ---

function renderLoop() {
    animationFrameId = requestAnimationFrame(renderLoop);
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
