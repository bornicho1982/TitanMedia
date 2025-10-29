const canvas = document.getElementById('video-preview');
const ctx = canvas.getContext('2d');
let animationFrameId;

async function setupOBS() {
    try {
        console.log("Starting OBS...");
        await window.core.startup();
        console.log("OBS Started. Creating scene...");
        await window.core.createScene(); // Create a default scene with a game capture
        console.log("Scene created.");
    } catch (error) {
        console.error("Failed to setup OBS:", error);
    }
}

function renderLoop() {
    animationFrameId = requestAnimationFrame(renderLoop);

    window.core.getLatestFrame().then(frame => {
        if (frame && frame.data) {
            // Resize canvas if necessary
            if (canvas.width !== frame.width || canvas.height !== frame.height) {
                canvas.width = frame.width;
                canvas.height = frame.height;
            }

            // Create ImageData and draw to canvas
            const imageData = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
            ctx.putImageData(imageData, 0, 0);
        }
    }).catch(error => {
        console.error("Error getting frame:", error);
    });
}

// Main execution
async function main() {
    await setupOBS();
    renderLoop();
}

main();

// Cleanup on exit
window.addEventListener('beforeunload', async () => {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    try {
        console.log("Shutting down OBS...");
        await window.core.shutdown();
        console.log("OBS Shutdown complete.");
    } catch (error) {
        console.error("Failed to shutdown OBS:", error);
    }
});
