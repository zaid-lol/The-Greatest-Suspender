document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('originalUrl');
    const originalTitle = urlParams.get('originalTitle');

    const originalUrlLink = document.getElementById('originalUrlLink');
    const originalTitleDisplay = document.getElementById('originalTitleDisplay');
    // Removed: const restoreButton = document.getElementById('restoreButton');

    // NEW: Load theme setting and apply dark mode class to the body
    chrome.storage.sync.get({ theme: 'light' }, (items) => {
        if (items.theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    });

    if (originalUrl) {
        originalUrlLink.href = decodeURIComponent(originalUrl);
        originalUrlLink.textContent = decodeURIComponent(originalUrl);
    } else {
        originalUrlLink.textContent = 'Original URL not found.';
        // No button to disable, the whole page will act as a restore trigger if URL exists.
    }

    if (originalTitle) {
        originalTitleDisplay.textContent = decodeURIComponent(originalTitle);
    } else {
        originalTitleDisplay.textContent = 'Untitled Tab'; // Fallback if title is missing
    }

    // NEW: Add click listener to the entire body for restoration
    document.body.addEventListener('click', () => {
        if (originalUrl) {
            chrome.runtime.sendMessage({ action: "unsuspendTabFromSuspendedPage", url: decodeURIComponent(originalUrl) });
        }
    });

    // Keep the URL link's event listener to prevent default browser navigation
    originalUrlLink.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent default link behavior
        // The body click listener will handle the actual restoration.
    });
});
