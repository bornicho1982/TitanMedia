const canvas = document.getElementById('video-preview');
const ctx = canvas.getContext('2d');
const sceneList = document.getElementById('scene-list');
const sourceList = document.getElementById('source-list');
const addSceneButton = document.getElementById('add-scene-button');

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
    // For now, this is a placeholder as we haven't implemented getSceneSources yet
    sourceList.innerHTML = `<li class="p-2">Sources for ${sceneName} will show here.</li>`;
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
