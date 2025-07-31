let suspensionSettings = {};

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

// CHANGES HERE: Add originalTitle parameter
async function suspendTab(tabId, originalUrl, originalTitle) {
    if (!originalUrl || originalUrl.startsWith('chrome://') || originalUrl.startsWith('about:') || originalUrl.startsWith(chrome.runtime.getURL(''))) {
        console.warn(`Background: Not suspending special tab: ${originalUrl} (Tab ID: ${tabId})`);
        return;
    }

    // NEW: Encode the originalTitle for URL parameter
    const encodedTitle = originalTitle ? encodeURIComponent(originalTitle) : '';
    // CHANGES HERE: Pass originalTitle in the URL
    const suspendedUrl = chrome.runtime.getURL(`suspended.html?originalUrl=${encodeURIComponent(originalUrl)}&originalTitle=${encodedTitle}`);

    try {
        await chrome.tabs.update(tabId, { url: suspendedUrl });
        console.log(`Background: Tab ${tabId} suspended successfully. Original: ${originalUrl}`);
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
    } catch (error) {
        console.error(`Background: Error unsuspending tab ${tabId} to URL "${url}": ${error.message}`);
    }
}

let tabActivity = {};

chrome.runtime.onInstalled.addListener(() => {
    loadSettings();
    startInactivityCheck();
});

chrome.runtime.onStartup.addListener(() => {
    loadSettings();
    startInactivityCheck();
});

chrome.tabs.onActivated.addListener(activeInfo => {
    tabActivity[activeInfo.tabId] = Date.now();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
        tabActivity[tabId] = Date.now();
        if (tab.url.startsWith(chrome.runtime.getURL('suspended.html')) && suspensionSettings.autoUnsuspendOnView) {
            const urlParams = new URLSearchParams(tab.url);
            const originalUrl = urlParams.get('originalUrl');
            if (originalUrl) {
                // This makes the tab active when navigating to the suspended page directly
                unsuspendTab(tabId, decodeURIComponent(originalUrl), true);
            }
        }
    }
});

chrome.tabs.onRemoved.addListener(tabId => {
    delete tabActivity[tabId];
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

                // Check for active tab in current window specifically if neverSuspendActiveInWindow is true
                if (tab.active && suspensionSettings.neverSuspendActiveInWindow) {
                    shouldSuspend = false;
                }


                const excludedUrlsArray = suspensionSettings.excludedUrls.split('\n').map(url => url.trim()).filter(url => url !== '');
                if (excludedUrlsArray.some(excludedUrl => tab.url.includes(excludedUrl))) {
                    shouldSuspend = false;
                }

                if (shouldSuspend) {
                    const originalUrl = tab.url;
                    // CHANGES HERE: Get the original title for auto-suspension
                    const originalTitle = tab.title || originalUrl; // Fallback to URL if title is empty
                    if (originalUrl && !originalUrl.startsWith('chrome://') && !originalUrl.startsWith('about:') && !originalUrl.startsWith(chrome.runtime.getURL(''))) {
                        // CHANGES HERE: Pass originalTitle to suspendTab
                        await suspendTab(tab.id, originalUrl, originalTitle);
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
        }
    });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "suspendCurrentTab") {
        if (tab && tab.id && tab.url) {
            // CHANGES HERE: Pass tab.title for context menu suspension
            suspendTab(tab.id, tab.url, tab.title || tab.url);
        }
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // CHANGES HERE: Expect originalTitle from popup
    if (request.action === "suspendTabFromPopup" && request.tabId && request.originalUrl) {
        suspendTab(request.tabId, request.originalUrl, request.originalTitle);
        sendResponse({ status: "ok" });
    } else if (request.action === "unsuspendTabFromPopup" && request.tabId && request.url) {
        console.log(`Background: Received unsuspendTabFromPopup message for tab ${request.tabId}. Received makeActive: ${request.makeActive}`);
        unsuspendTab(request.tabId, request.url, request.makeActive);
        sendResponse({ status: "ok" });
    } else if (request.action === "bulkSuspend" && request.tabsToSuspend) {
        console.log('Background: Received bulkSuspend request with tabs:', request.tabsToSuspend.map(t => t.url));
        request.tabsToSuspend.forEach(tab => {
            if (tab.url && !tab.url.startsWith(chrome.runtime.getURL('suspended.html'))) {
                // CHANGES HERE: Pass tab.title for bulk suspension
                suspendTab(tab.id, tab.url, tab.title || tab.url);
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
    } else if (request.action === "unsuspendTabFromSuspendedPage" && request.url) { // NEW: Handle unsuspend from the suspended page itself
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url.startsWith(chrome.runtime.getURL('suspended.html'))) { // Ensure it's the suspended page
                unsuspendTab(tabs[0].id, request.url, true); // Make it active
            } else {
                console.warn('Background: unsuspendTabFromSuspendedPage called on non-suspended or inactive tab.');
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
                    // CHANGES HERE: Pass tab.title for command suspension
                    suspendTab(tab.id, tab.url, tab.title || tab.url);
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
                // CHANGES HERE: Pass t.title for bulk command suspension
                tabsToSuspend.forEach(t => suspendTab(t.id, t.url, t.title || t.url));
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
                // CHANGES HERE: Pass t.title for bulk command suspension
                tabsToSuspend.forEach(t => suspendTab(t.id, t.url, t.title || t.url));
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
});
