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
        default: return value * 60 * 1000;
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

async function suspendTab(tabId, originalUrl) {
    if (!originalUrl || originalUrl.startsWith('chrome://') || originalUrl.startsWith('about:') || originalUrl.startsWith(chrome.runtime.getURL(''))) {
        console.warn(`Background: Not suspending special tab: ${originalUrl} (Tab ID: ${tabId})`);
        return;
    }

    const suspendedUrl = chrome.runtime.getURL(`suspended.html?originalUrl=${encodeURIComponent(originalUrl)}`);

    try {
        await chrome.tabs.update(tabId, { url: suspendedUrl });
        console.log(`Background: Tab ${tabId} suspended successfully. Original: ${originalUrl}`);
    } catch (error) {
        console.error(`Background: Error suspending tab ${tabId} (URL: ${originalUrl}): ${error.message}`);
    }
}

// CHANGES HERE: Added makeActive parameter with default false
async function unsuspendTab(tabId, url, makeActive = false) {
    if (!url) {
        console.error('Background: No URL provided to unsuspend tab.');
        return;
    }
    // ADDED LOG HERE
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

                if (tab.active) {
                    const activeTabsInWindow = tabs.filter(t => t.windowId === tab.windowId && t.active);
                    if (activeTabsInWindow.length > 0 && activeTabsInWindow[0].id === tab.id && suspensionSettings.neverSuspendActiveInWindow) {
                        shouldSuspend = false;
                    }
                }

                const excludedUrlsArray = suspensionSettings.excludedUrls.split('\n').map(url => url.trim()).filter(url => url !== '');
                if (excludedUrlsArray.some(excludedUrl => tab.url.includes(excludedUrl))) {
                    shouldSuspend = false;
                }

                if (shouldSuspend) {
                    const originalUrl = tab.url;
                    if (originalUrl && !originalUrl.startsWith('chrome://') && !originalUrl.startsWith('about:') && !originalUrl.startsWith(chrome.runtime.getURL(''))) {
                        await suspendTab(tab.id, originalUrl);
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
            suspendTab(tab.id, tab.url);
        }
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "suspendTabFromPopup" && request.tabId && request.originalUrl) {
        suspendTab(request.tabId, request.originalUrl);
        sendResponse({ status: "ok" });
    } else if (request.action === "unsuspendTabFromPopup" && request.tabId && request.url) {
        // ADDED LOG HERE
        console.log(`Background: Received unsuspendTabFromPopup message for tab ${request.tabId}. Received makeActive: ${request.makeActive}`);
        // THIS IS THE CRITICAL FIX: Pass the makeActive value from the request
        unsuspendTab(request.tabId, request.url, request.makeActive);
        sendResponse({ status: "ok" });
    } else if (request.action === "bulkSuspend" && request.tabsToSuspend) {
        console.log('Background: Received bulkSuspend request with tabs:', request.tabsToSuspend.map(t => t.url));
        request.tabsToSuspend.forEach(tab => {
            if (tab.url && !tab.url.startsWith(chrome.runtime.getURL('suspended.html'))) {
                suspendTab(tab.id, tab.url);
            } else {
                console.warn(`Background: Skipping suspension for already suspended or invalid tab in bulk operation: ${tab.url}`);
            }
        });
        sendResponse({ status: "ok" });
    } else if (request.action === "bulkUnsuspend" && request.tabsToUnsuspend) {
        console.log('Background: Received bulkUnsuspend request with tabs:', request.tabsToUnsuspend.map(t => t.url));
        // This defaults to makeActive = false in unsuspendTab if not provided, which is good for bulk
        request.tabsToUnsuspend.forEach(tab => unsuspendTab(tab.id, tab.url));
        sendResponse({ status: "ok" });
    } else if (request.action === "loadSettingsRequest") {
        loadSettings().then(settings => sendResponse(settings));
        return true; // Indicates async response
    }
});

chrome.commands.onCommand.addListener((command, tab) => {
    if (command === "suspend-current-tab") {
        if (tab && tab.id && tab.url) {
            suspendTab(tab.id, tab.url);
        }
    }
});

loadSettings().then(() => {
    startInactivityCheck();
});
