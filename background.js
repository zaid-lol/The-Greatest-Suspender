let suspensionSettings = {};

const defaultSettings = {
    inactivityTimeValue: 15,
    inactivityTimeUnit: 'minutes',
    disableAutoSuspension: false,
    neverSuspendPinned: true,
    neverSuspendActiveInWindow: false,
    neverSuspendAudio: true,
    neverSuspendOffline: true,
    autoUnsuspendOnView: true,
    excludedUrls: '',
    addContextMenu: true,
    theme: 'light'
};

function convertToMilliseconds(value, unit) {
    switch (unit) {
        case 'seconds': return value * 1000;
        case 'minutes': return value * 60 * 1000;
        case 'hours': return value * 60 * 60 * 1000;
        default: return value * 60 * 1000; // Default to minutes if unit is unknown
    }
}

function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(defaultSettings, (items) => {
            suspensionSettings = items;
            updateContextMenu();
            resolve(suspensionSettings);
        });
    });
}

// FIX: supports * wildcards (e.g. "*.reddit.com/*"), falls back to plain substring match
function urlMatchesExcluded(url, pattern) {
    if (!pattern) return false;
    if (pattern.includes('*')) {
        const escaped = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape regex special chars except *
            .replace(/\*/g, '.*');
        try {
            return new RegExp(escaped).test(url);
        } catch (e) {
            return url.includes(pattern);
        }
    }
    return url.includes(pattern);
}

function isTabExcluded(url) {
    const excludedUrlsArray = (suspensionSettings.excludedUrls || '')
        .split('\n')
        .map(u => u.trim())
        .filter(u => u !== '');
    return excludedUrlsArray.some(pattern => urlMatchesExcluded(url, pattern));
}

// NEW: keeps the toolbar badge showing how many tabs are currently suspended
function updateBadge() {
    chrome.tabs.query({}, (tabs) => {
        const count = tabs.filter(t => t.url && t.url.startsWith(chrome.runtime.getURL('suspended.html'))).length;
        chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
        chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
    });
}

// CHANGES HERE: Add originalTitle + faviconUrl parameters
async function suspendTab(tabId, originalUrl, originalTitle, faviconUrl) {
    if (!originalUrl || originalUrl.startsWith('chrome://') || originalUrl.startsWith('about:') || originalUrl.startsWith(chrome.runtime.getURL(''))) {
        console.warn(`Background: Not suspending special tab: ${originalUrl} (Tab ID: ${tabId})`);
        return;
    }

    const encodedTitle = originalTitle ? encodeURIComponent(originalTitle) : '';
    const encodedFavicon = faviconUrl ? encodeURIComponent(faviconUrl) : '';
    const suspendedUrl = chrome.runtime.getURL(
        `suspended.html?originalUrl=${encodeURIComponent(originalUrl)}&originalTitle=${encodedTitle}&favicon=${encodedFavicon}`
    );

    try {
        recentlySuspended.add(tabId);
        await chrome.tabs.update(tabId, { url: suspendedUrl });
        console.log(`Background: Tab ${tabId} suspended successfully. Original: ${originalUrl}`);
        updateBadge();
    } catch (error) {
        console.error(`Background: Error suspending tab ${tabId} (URL: ${originalUrl}): ${error.message}`);
    }
}

async function unsuspendTab(tabId, url, makeActive = false) {
    if (!url) {
        console.error('Background: No URL provided to unsuspend tab.');
        return;
    }
    console.log(`Background: unsuspendTab function called for tab ${tabId}. Final makeActive value: ${makeActive}`);
    try {
        const updateProperties = { url: url };
        if (makeActive) {
            updateProperties.active = true; // Only set active if explicitly requested
        }
        await chrome.tabs.update(tabId, updateProperties);
        console.log(`Background: Tab ${tabId} unsuspended to: ${url}`);
        updateBadge();
    } catch (error) {
        console.error(`Background: Error unsuspending tab ${tabId} to URL "${url}": ${error.message}`);
    }
}

let tabActivity = {};
// NEW: tracks tabIds we just navigated to suspended.html ourselves, so the
// onUpdated listener below doesn't mistake that for the user viewing/loading
// an already-suspended tab and instantly auto-unsuspend it.
let recentlySuspended = new Set();

chrome.runtime.onInstalled.addListener(() => {
    loadSettings();
    startInactivityCheck();
    updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
    loadSettings();
    startInactivityCheck();
    updateBadge();
});

chrome.tabs.onActivated.addListener(activeInfo => {
    tabActivity[activeInfo.tabId] = Date.now();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
        tabActivity[tabId] = Date.now();
        if (tab.url.startsWith(chrome.runtime.getURL('suspended.html')) && suspensionSettings.autoUnsuspendOnView) {
            // If we JUST suspended this tab ourselves, this onUpdated event is that
            // navigation completing, not the user viewing an already-suspended tab.
            // Consume the flag and bail so it doesn't instantly un-suspend itself.
            if (recentlySuspended.has(tabId)) {
                recentlySuspended.delete(tabId);
                updateBadge();
                return;
            }
            // BUG FIX: was `new URLSearchParams(tab.url)` which does NOT parse a full URL,
            // it mangles everything before the first "=" and originalUrl always came back null.
            let originalUrl = null;
            try {
                originalUrl = new URL(tab.url).searchParams.get('originalUrl');
            } catch (e) {
                console.error('Background: Failed to parse suspended tab URL:', tab.url, e);
            }
            if (originalUrl) {
                // This makes the tab active when navigating to the suspended page directly
                unsuspendTab(tabId, decodeURIComponent(originalUrl), true);
            }
        }
    }
    updateBadge();
});

chrome.tabs.onRemoved.addListener(tabId => {
    delete tabActivity[tabId];
    recentlySuspended.delete(tabId);
    updateBadge();
});

let inactivityCheckInterval;

function startInactivityCheck() {
    if (inactivityCheckInterval) {
        clearInterval(inactivityCheckInterval);
    }

    inactivityCheckInterval = setInterval(async () => {
        await loadSettings();

        if (suspensionSettings.disableAutoSuspension) {
            return;
        }

        // NEW: actually check offline status now instead of having a setting that does nothing
        let isOffline = false;
        try {
            isOffline = typeof navigator !== 'undefined' && 'onLine' in navigator ? !navigator.onLine : false;
        } catch (e) {
            isOffline = false;
        }

        const suspensionThresholdMs = convertToMilliseconds(suspensionSettings.inactivityTimeValue, suspensionSettings.inactivityTimeUnit);
        const now = Date.now();

        chrome.tabs.query({}, async (tabs) => {
            for (const tab of tabs) {
                if (tab.url.startsWith(chrome.runtime.getURL('suspended.html'))) {
                    continue;
                }

                const lastActivity = tabActivity[tab.id] || tab.lastAccessed;
                if (now - lastActivity < suspensionThresholdMs) {
                    continue;
                }

                let shouldSuspend = true;

                if (suspensionSettings.neverSuspendPinned && tab.pinned) {
                    shouldSuspend = false;
                }
                if (suspensionSettings.neverSuspendActiveInWindow && tab.active) {
                    shouldSuspend = false;
                }
                if (suspensionSettings.neverSuspendAudio && tab.audible) {
                    shouldSuspend = false;
                }
                if (suspensionSettings.neverSuspendOffline && isOffline) {
                    shouldSuspend = false;
                }
                if (isTabExcluded(tab.url)) {
                    shouldSuspend = false;
                }

                if (shouldSuspend) {
                    const originalUrl = tab.url;
                    const originalTitle = tab.title || originalUrl; // Fallback to URL if title is empty
                    if (originalUrl && !originalUrl.startsWith('chrome://') && !originalUrl.startsWith('about:') && !originalUrl.startsWith(chrome.runtime.getURL(''))) {
                        await suspendTab(tab.id, originalUrl, originalTitle, tab.favIconUrl);
                    }
                }
            }
        });
    }, 5000);
}


function updateContextMenu() {
    chrome.contextMenus.removeAll(() => {
        if (suspensionSettings.addContextMenu) {
            chrome.contextMenus.create({
                id: "suspendCurrentTab",
                title: "Suspend This Tab",
                contexts: ["page"]
            });
            chrome.contextMenus.create({
                id: "whitelistThisSite",
                title: "Never Suspend This Site",
                contexts: ["page"]
            });
        }
    });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "suspendCurrentTab") {
        if (tab && tab.id && tab.url) {
            suspendTab(tab.id, tab.url, tab.title || tab.url, tab.favIconUrl);
        }
    } else if (info.menuItemId === "whitelistThisSite") {
        if (tab && tab.url) {
            addUrlToWhitelist(tab.url);
        }
    }
});

// NEW: shared helper to add a hostname to the excluded list and persist it
function addUrlToWhitelist(url) {
    try {
        const hostname = new URL(url).hostname;
        if (!hostname) return;
        chrome.storage.sync.get({ excludedUrls: '' }, (items) => {
            const list = items.excludedUrls.split('\n').map(u => u.trim()).filter(u => u !== '');
            if (!list.includes(hostname)) {
                list.push(hostname);
                chrome.storage.sync.set({ excludedUrls: list.join('\n') }, () => {
                    loadSettings();
                });
            }
        });
    } catch (e) {
        console.error('Background: Could not whitelist URL:', url, e);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "suspendTabFromPopup" && request.tabId && request.originalUrl) {
        suspendTab(request.tabId, request.originalUrl, request.originalTitle, request.faviconUrl);
        sendResponse({ status: "ok" });
    } else if (request.action === "unsuspendTabFromPopup" && request.tabId && request.url) {
        console.log(`Background: Received unsuspendTabFromPopup message for tab ${request.tabId}. Received makeActive: ${request.makeActive}`);
        unsuspendTab(request.tabId, request.url, request.makeActive);
        sendResponse({ status: "ok" });
    } else if (request.action === "bulkSuspend" && request.tabsToSuspend) {
        console.log('Background: Received bulkSuspend request with tabs:', request.tabsToSuspend.map(t => t.url));
        request.tabsToSuspend.forEach(tab => {
            if (tab.url && !tab.url.startsWith(chrome.runtime.getURL('suspended.html'))) {
                suspendTab(tab.id, tab.url, tab.title || tab.url, tab.favIconUrl);
            } else {
                console.warn(`Background: Skipping suspension for already suspended or invalid tab in bulk operation: ${tab.url}`);
            }
        });
        sendResponse({ status: "ok" });
    } else if (request.action === "bulkUnsuspend" && request.tabsToUnsuspend) {
        console.log('Background: Received bulkUnsuspend request with tabs:', request.tabsToUnsuspend.map(t => t.url));
        request.tabsToUnsuspend.forEach(tab => unsuspendTab(tab.id, tab.url, false)); // Unsuspend in background for bulk
        sendResponse({ status: "ok" });
    } else if (request.action === "loadSettingsRequest") {
        loadSettings().then(settings => sendResponse(settings));
        return true; // Indicates async response
    } else if (request.action === "unsuspendTabFromSuspendedPage" && request.url) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url.startsWith(chrome.runtime.getURL('suspended.html'))) {
                unsuspendTab(tabs[0].id, request.url, true); // Make it active
            } else {
                console.warn('Background: unsuspendTabFromSuspendedPage called on non-suspended or inactive tab.');
            }
        });
        sendResponse({ status: "ok" });
    } else if (request.action === "whitelistFromSuspendedPage" && request.url) {
        // NEW: "Never Suspend This Site" button on the suspended page
        addUrlToWhitelist(request.url);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url.startsWith(chrome.runtime.getURL('suspended.html'))) {
                unsuspendTab(tabs[0].id, request.url, true);
            }
        });
        sendResponse({ status: "ok" });
    }
});

chrome.commands.onCommand.addListener((command, tab) => {
    switch (command) {
        case "suspend-current-tab":
            if (tab && tab.id && tab.url) {
                if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('about:') && !tab.url.startsWith(chrome.runtime.getURL('suspended.html'))) {
                    suspendTab(tab.id, tab.url, tab.title || tab.url, tab.favIconUrl);
                } else {
                    console.warn(`Background Command: Cannot suspend special or already suspended tab: ${tab.url}`);
                }
            }
            break;
        case "suspend-all-tabs":
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                const tabsToSuspend = tabs.filter(t =>
                    (t.url.startsWith('http://') || t.url.startsWith('https://')) &&
                    !t.url.startsWith(chrome.runtime.getURL('suspended.html'))
                );
                console.log(`Background Command: Suspending ${tabsToSuspend.length} tabs for 'suspend-all-tabs' command.`);
                tabsToSuspend.forEach(t => suspendTab(t.id, t.url, t.title || t.url, t.favIconUrl));
            });
            break;
        case "suspend-all-but-current-tab":
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                const tabsToSuspend = tabs.filter(t =>
                    (t.url.startsWith('http://') || t.url.startsWith('https://')) &&
                    !t.active && // Exclude the active tab
                    !t.url.startsWith(chrome.runtime.getURL('suspended.html'))
                );
                console.log(`Background Command: Suspending ${tabsToSuspend.length} tabs for 'suspend-all-but-current-tab' command.`);
                tabsToSuspend.forEach(t => suspendTab(t.id, t.url, t.title || t.url, t.favIconUrl));
            });
            break;
        case "unsuspend-all-tabs":
            chrome.tabs.query({ currentWindow: true, url: chrome.runtime.getURL('suspended.html') + '*' }, (tabs) => {
                const tabsToUnsuspend = tabs.map(t => {
                    let originalUrl = null;
                    try {
                        const urlObj = new URL(t.url);
                        const originalUrlEncoded = urlObj.searchParams.get('originalUrl');
                        if (originalUrlEncoded !== null) {
                            originalUrl = decodeURIComponent(originalUrlEncoded);
                        }
                    } catch (e) {
                        console.error('Background Command: Error parsing URL for bulk unsuspend (ID: ' + t.id + '):', t.url, e);
                    }
                    return { id: t.id, url: originalUrl };
                }).filter(t => t.url && t.url !== 'null'); // Filter out invalid original URLs

                console.log(`Background Command: Unsuspending ${tabsToUnsuspend.length} tabs for 'unsuspend-all-tabs' command.`);
                tabsToUnsuspend.forEach(t => unsuspendTab(t.id, t.url, false)); // Unsuspend in background for bulk
            });
            break;
        default:
            console.warn(`Background Command: Unknown command received: ${command}`);
            break;
    }
});

loadSettings().then(() => {
    startInactivityCheck();
    updateBadge();
});
