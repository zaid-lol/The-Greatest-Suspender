// suspended.js
document.addEventListener('DOMContentLoaded', () => {
    const originalUrlSpan = document.getElementById('originalUrl');
    const restoreButton = document.getElementById('restoreButton');

    // CHANGES HERE: Function to load settings (specifically theme) and apply it
    function loadSettingsAndApplyTheme() {
        chrome.storage.sync.get({ theme: 'light' }, (items) => {
            if (items.theme === 'dark') {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        });
    }

    // Get the original URL from the URL parameters of the suspended.html page
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('originalUrl');

    if (originalUrl) {
        originalUrlSpan.textContent = decodeURIComponent(originalUrl);
    } else {
        originalUrlSpan.textContent = 'Unknown URL (Error: URL parameter missing)';
        console.error('Original URL not found in URL parameters for suspended.html');
    }

    // Function to restore the tab
    const restoreTab = () => {
        if (originalUrl) {
            // Update the tab's URL to the original one to restore it
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.update(tabs[0].id, { url: decodeURIComponent(originalUrl), active: true }, () => {
                        // Optional: Any cleanup needed after restoration.
                    });
                } else {
                    console.error('Could not find active tab to restore.');
                }
            });
        } else {
            console.error('Cannot restore tab: Original URL not available.');
            alert('Could not restore tab: Original URL not found.');
        }
    };

    // Listen for ANY click on the entire document body
    document.body.addEventListener('click', restoreTab);

    // Also listen for clicks on the specific restore button
    restoreButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent the body click listener from firing twice
        restoreTab();
    });

    // CHANGES HERE: Call the theme loading function on load
    loadSettingsAndApplyTheme();
});
