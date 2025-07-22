// options.js

document.addEventListener('DOMContentLoaded', () => {
    const inactivityTimeValueInput = document.getElementById('inactivityTimeValue'); // Renamed from inactivityTimeInput
    const inactivityTimeUnitSelect = document.getElementById('inactivityTimeUnit'); // New element
    const neverSuspendPinnedCheckbox = document.getElementById('neverSuspendPinned');
    const neverSuspendActiveInWindowCheckbox = document.getElementById('neverSuspendActiveInWindow');
    const neverSuspendAudioCheckbox = document.getElementById('neverSuspendAudio');
    const neverSuspendOfflineCheckbox = document.getElementById('neverSuspendOffline');
    const neverSuspendPowerConnectedCheckbox = document.getElementById('neverSuspendPowerConnected');
    const autoUnsuspendOnViewCheckbox = document.getElementById('autoUnsuspendOnView');
    const themeSelect = document.getElementById('theme');
    const addContextMenuCheckbox = document.getElementById('addContextMenu');
    const excludedUrlsTextarea = document.getElementById('excludedUrls');
    const saveButton = document.getElementById('saveButton');
    const statusMessage = document.getElementById('statusMessage');

    // Function to apply theme to the body
    function applyTheme(theme) {
        document.body.classList.remove('light-mode', 'dark-mode');
        document.body.classList.add(theme + '-mode');
    }

    // Load settings when the page opens
    async function loadSettings() {
        try {
            const result = await chrome.storage.local.get({ // Use default values if not found
                inactivityTimeValue: 15, // Default value
                inactivityTimeUnit: 'minutes', // Default unit
                neverSuspendPinned: true,
                neverSuspendActiveInWindow: true,
                neverSuspendAudio: true,
                neverSuspendOffline: false,
                neverSuspendPowerConnected: false,
                autoUnsuspendOnView: true,
                theme: 'light', // Default to light
                addContextMenu: true, // Default to true
                excludedUrls: ""
            });

            inactivityTimeValueInput.value = result.inactivityTimeValue;
            inactivityTimeUnitSelect.value = result.inactivityTimeUnit; // Set the unit
            neverSuspendPinnedCheckbox.checked = result.neverSuspendPinned;
            neverSuspendActiveInWindowCheckbox.checked = result.neverSuspendActiveInWindow;
            neverSuspendAudioCheckbox.checked = result.neverSuspendAudio;
            neverSuspendOfflineCheckbox.checked = result.neverSuspendOffline;
            neverSuspendPowerConnectedCheckbox.checked = result.neverSuspendPowerConnected;
            autoUnsuspendOnViewCheckbox.checked = result.autoUnsuspendOnView;
            themeSelect.value = result.theme;
            addContextMenuCheckbox.checked = result.addContextMenu;
            excludedUrlsTextarea.value = Array.isArray(result.excludedUrls) ? result.excludedUrls.join('\n') : result.excludedUrls;

            // Apply theme immediately on load
            applyTheme(result.theme);
        } catch (e) {
            console.error("Error loading settings in options page:", e);
            statusMessage.textContent = 'Error loading settings.';
            statusMessage.style.color = 'red';
        }
    }

    // Save settings when the button is clicked
    saveButton.addEventListener('click', async () => {
        const inactivityTimeValue = parseInt(inactivityTimeValueInput.value); // Get value
        const inactivityTimeUnit = inactivityTimeUnitSelect.value; // Get unit
        const neverSuspendPinned = neverSuspendPinnedCheckbox.checked;
        const neverSuspendActiveInWindow = neverSuspendActiveInWindowCheckbox.checked;
        const neverSuspendAudio = neverSuspendAudioCheckbox.checked;
        const neverSuspendOffline = neverSuspendOfflineCheckbox.checked;
        const neverSuspendPowerConnected = neverSuspendPowerConnectedCheckbox.checked;
        const autoUnsuspendOnView = autoUnsuspendOnViewCheckbox.checked;
        const theme = themeSelect.value;
        const addContextMenu = addContextMenuCheckbox.checked;
        const excludedUrls = excludedUrlsTextarea.value.split('\n').map(url => url.trim()).filter(url => url !== '');

        if (isNaN(inactivityTimeValue) || inactivityTimeValue < 1) {
            statusMessage.textContent = 'Please enter a valid time (1 or more).';
            statusMessage.style.color = 'red';
            return;
        }

        try {
            await chrome.storage.local.set({
                inactivityTimeValue: inactivityTimeValue, // Save value
                inactivityTimeUnit: inactivityTimeUnit, // Save unit
                neverSuspendPinned: neverSuspendPinned,
                neverSuspendActiveInWindow: neverSuspendActiveInWindow,
                neverSuspendAudio: neverSuspendAudio,
                neverSuspendOffline: neverSuspendOffline,
                neverSuspendPowerConnected: neverSuspendPowerConnected,
                autoUnsuspendOnView: autoUnsuspendOnView,
                theme: theme,
                addContextMenu: addContextMenu,
                excludedUrls: excludedUrls
            });

            statusMessage.textContent = 'Settings saved!';
            statusMessage.style.color = 'green';

            // Apply theme immediately after saving
            applyTheme(theme);

            // Clear status message after a few seconds
            setTimeout(() => {
                statusMessage.textContent = '';
            }, 3000);
        } catch (e) {
            console.error("Error saving settings in options page:", e);
            statusMessage.textContent = 'Error saving settings.';
            statusMessage.style.color = 'red';
        }
    });

    // Listen for theme change on the options page itself (for instant preview)
    themeSelect.addEventListener('change', () => {
        applyTheme(themeSelect.value);
    });

    loadSettings();
});