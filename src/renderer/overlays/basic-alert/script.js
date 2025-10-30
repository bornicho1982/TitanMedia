document.addEventListener('DOMContentLoaded', () => {
    const alertBox = document.getElementById('alert-box');
    const usernameSpan = document.getElementById('username');

    let timeoutId = null;

    function showAlert(username) {
        // Clear any existing animation timeout
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        // 1. Set the username
        usernameSpan.textContent = username;

        // 2. Show the alert with slideIn animation
        alertBox.classList.remove('hidden', 'hide');
        alertBox.classList.add('show');

        // 3. Set a timeout to hide the alert after 5 seconds
        timeoutId = setTimeout(() => {
            alertBox.classList.remove('show');
            alertBox.classList.add('hide');
        }, 5000); // 5 seconds visible
    }

    function checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const username = urlParams.get('username');

        if (username) {
            showAlert(username);
        }
    }

    // Initial check
    checkUrlParams();

    // Although browser sources in OBS don't have URL bars,
    // we can re-trigger by setting the source URL again.
    // This logic isn't strictly needed for OBS, but is good practice.
    // A simple way to re-trigger would be to simply reload the source properties.
});
