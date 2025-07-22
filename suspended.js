// suspended.js

document.addEventListener('DOMContentLoaded', () => {
    const restoreButton = document.getElementById('restoreButton');
    const originalTitleSpan = document.getElementById('originalTitle');
    const originalUrlSpan = document.getElementById('originalUrl');

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('url');
    const originalTitle = urlParams.get('title');

    if (originalTitle) {
        originalTitleSpan.textContent = decodeURIComponent(originalTitle);
    } else {
        originalTitleSpan.textContent = "Unknown Title";
    }

    if (originalUrl) {
        originalUrlSpan.textContent = decodeURIComponent(originalUrl);
    } else {
        originalUrlSpan.textContent = "Unknown URL";
    }

    // Restore tab when button is clicked
    restoreButton.addEventListener('click', () => {
        // Send a message to the background script to restore this tab
        // We get the current tab ID from the window, as this script runs in the tab itself
        chrome.runtime.sendMessage({ action: "restoreTab", tabId: chrome.tabs.getCurrent().id }, (response) => {
            if (response && response.success) {
                // If restoration is successful, the page will navigate away
                console.log("Tab restore initiated.");
            } else {
                console.error("Failed to initiate tab restore.");
                // Fallback: If message fails, try direct window.location.replace
                if (originalUrl) {
                    window.location.replace(decodeURIComponent(originalUrl));
                } else {
                    alert("Could not restore tab. Original URL missing.");
                }
            }
        });
    });

    // Apply theme from storage when the page loads
    chrome.storage.local.get('theme', (result) => {
        const currentTheme = result.theme || 'light'; // Default to light
        document.body.classList.add(currentTheme + '-mode');
    });

    // Listen for theme changes from options page in real-time (if suspended page is open)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.theme) {
            document.body.classList.remove('light-mode', 'dark-mode');
            document.body.classList.add(changes.theme.newValue + '-mode');
        }
    });
});