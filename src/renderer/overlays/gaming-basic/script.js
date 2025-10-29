document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);

    const name = params.get('name');
    const color = params.get('color');

    if (name) {
        const nameDisplay = document.getElementById('streamer-name-display');
        if (nameDisplay) {
            nameDisplay.textContent = name;
        }
    }

    if (color) {
        const webcamFrame = document.getElementById('webcam-frame');
        if (webcamFrame) {
            webcamFrame.style.borderColor = color;
        }

        // Example of applying color to other elements if needed in the future
        // const eventText = document.querySelector('#latest-event .font-bold');
        // if(eventText) {
        //     eventText.style.color = color;
        // }
    }
});
