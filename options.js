document.addEventListener('DOMContentLoaded', () => {
    const inactivityTimeValueInput = document.getElementById('inactivityTimeValue');
    const inactivityTimeUnitSelect = document.getElementById('inactivityTimeUnit');
    const disableAutoSuspensionCheckbox = document.getElementById('disableAutoSuspension');
    const neverSuspendPinnedCheckbox = document.getElementById('neverSuspendPinned');
    const neverSuspendActiveInWindowCheckbox = document.getElementById('neverSuspendActiveInWindow');
    const neverSuspendAudioCheckbox = document.getElementById('neverSuspendAudio');
    const neverSuspendOfflineCheckbox = document.getElementById('neverSuspendOffline');
    const neverSuspendPowerConnectedCheckbox = document.getElementById('neverSuspendPowerConnected');
    const autoUnsuspendOnViewCheckbox = document.getElementById('autoUnsuspendOnView');
    const addContextMenuCheckbox = document.getElementById('addContextMenu');
    const excludedUrlsTextarea = document.getElementById('excludedUrls');
    const themeSelect = document.getElementById('theme');
    const saveButton = document.getElementById('saveButton');
    const statusMessageDiv = document.getElementById('statusMessage');
    const openShortcutsBtn = document.getElementById('openShortcutsBtn'); // NEW: Get the shortcut button

    // Default settings (must match background.js defaults)
    const defaultSettings = {
        inactivityTimeValue: 15,
        inactivityTimeUnit: 'minutes',
        disableAutoSuspension: false,
        neverSuspendPinned: true,
        neverSuspendActiveInWindow: false,
        neverSuspendAudio: true,
        neverSuspendOffline: true,
        neverSuspendPowerConnected: false,
        autoUnsuspendOnView: true,
        excludedUrls: '',
        addContextMenu: true,
        theme: 'light'
    };

    // Load settings from storage
    function loadSettings() {
        chrome.storage.sync.get(defaultSettings, (items) => {
            inactivityTimeValueInput.value = items.inactivityTimeValue;
            inactivityTimeUnitSelect.value = items.inactivityTimeUnit;
            disableAutoSuspensionCheckbox.checked = items.disableAutoSuspension;
            neverSuspendPinnedCheckbox.checked = items.neverSuspendPinned;
            neverSuspendActiveInWindowCheckbox.checked = items.neverSuspendActiveInWindow;
            neverSuspendAudioCheckbox.checked = items.neverSuspendAudio;
            neverSuspendOfflineCheckbox.checked = items.neverSuspendOffline;
            neverSuspendPowerConnectedCheckbox.checked = items.neverSuspendPowerConnected;
            autoUnsuspendOnViewCheckbox.checked = items.autoUnsuspendOnView;
            addContextMenuCheckbox.checked = items.addContextMenu;
            excludedUrlsTextarea.value = items.excludedUrls;
            themeSelect.value = items.theme;
            applyTheme(items.theme);
        });
    }

    // Save settings to storage
    function saveSettings() {
        const settings = {
            inactivityTimeValue: parseInt(inactivityTimeValueInput.value),
            inactivityTimeUnit: inactivityTimeUnitSelect.value,
            disableAutoSuspension: disableAutoSuspensionCheckbox.checked,
            neverSuspendPinned: neverSuspendPinnedCheckbox.checked,
            neverSuspendActiveInWindow: neverSuspendActiveInWindowCheckbox.checked,
            neverSuspendAudio: neverSuspendAudioCheckbox.checked,
            neverSuspendOffline: neverSuspendOfflineCheckbox.checked,
            neverSuspendPowerConnected: neverSuspendPowerConnectedCheckbox.checked,
            autoUnsuspendOnView: autoUnsuspendOnViewCheckbox.checked,
            addContextMenu: addContextMenuCheckbox.checked,
            excludedUrls: excludedUrlsTextarea.value,
            theme: themeSelect.value
        };

        chrome.storage.sync.set(settings, () => {
            statusMessageDiv.textContent = 'Settings saved!';
            setTimeout(() => {
                statusMessageDiv.textContent = '';
            }, 2000); // Clear message after 2 seconds

            applyTheme(settings.theme); // Apply theme immediately on save

            // Inform background script that settings have changed and it should reload
            chrome.runtime.sendMessage({ action: "loadSettingsRequest" });
        });
    }

    // Apply theme to the body
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    // Event Listeners
    if (saveButton) {
        saveButton.addEventListener('click', saveSettings);
    }
    if (themeSelect) {
        themeSelect.addEventListener('change', () => applyTheme(themeSelect.value)); // Live preview of theme
    }

    // NEW: Event listener for the shortcut button
    if (openShortcutsBtn) {
        openShortcutsBtn.addEventListener('click', () => {
            // This opens Chrome's built-in shortcuts page for extensions
            chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        });
    }

    // Load settings when the options page is opened
    loadSettings();
});
