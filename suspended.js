document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('originalUrl');
    const originalTitle = urlParams.get('originalTitle');
    const favicon = urlParams.get('favicon');

    const originalUrlLink = document.getElementById('originalUrlLink');
    const originalTitleDisplay = document.getElementById('originalTitleDisplay');
    const originalFavicon = document.getElementById('originalFavicon');
    const whitelistBtn = document.getElementById('whitelistBtn');

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
        const decodedTitle = decodeURIComponent(originalTitle);
        originalTitleDisplay.textContent = decodedTitle;
        // NEW: set the real browser tab title too, so the tab strip shows the
        // page's actual name instead of just "Tab Suspended"
        document.title = decodedTitle;
    } else {
        originalTitleDisplay.textContent = 'Untitled Tab'; // Fallback if title is missing
    }

    // NEW: set the browser tab's favicon (the little icon in the tab strip itself)
    // to match the original site, not the extension's generic icon
    function setTabFavicon(iconUrl) {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = iconUrl;
    }

    // NEW: show the site's real favicon instead of just a generic suspended icon
    if (favicon) {
        const decodedFavicon = decodeURIComponent(favicon);
        if (decodedFavicon) {
            originalFavicon.src = decodedFavicon;
            originalFavicon.style.display = 'inline-block';
            originalFavicon.addEventListener('error', () => {
                originalFavicon.style.display = 'none';
            });
            setTabFavicon(decodedFavicon);
        }
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
        event.stopPropagation();
        // The body click listener will handle the actual restoration.
    });

    // NEW: "Never Suspend This Site" button
    if (whitelistBtn) {
        whitelistBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Don't trigger the body's restore-on-click
            if (originalUrl) {
                whitelistBtn.disabled = true;
                whitelistBtn.textContent = 'Whitelisted \u2014 restoring...';
                chrome.runtime.sendMessage({ action: "whitelistFromSuspendedPage", url: decodeURIComponent(originalUrl) });
            }
        });
    }
});
