let suspensionSettings = {}; // Global variable to store settings

// Default settings
const defaultSettings = {
    inactivityTimeValue: 15,
    inactivityTimeUnit: 'minutes',
    disableAutoSuspension: false, // CHANGES HERE: NEW SETTING - Default to auto-suspension ON
    neverSuspendPinned: true,
    neverSuspendActiveInWindow: false,
    neverSuspendAudio: true,
    neverSuspendOffline: true,
    neverSuspendPowerConnected: false,
    autoUnsuspendOnView: true,
    excludedUrls: '',
    addContextMenu: true,
    theme: 'light' // Default theme
};

// Helper to convert time to milliseconds
function convertToMilliseconds(value, unit) {
    switch (unit) {
        case 'seconds': return value * 1000;
        case 'minutes': return value * 60 * 1000;
        case 'hours': return value * 60 * 60 * 1000;
        default: return value * 60 * 1000; // Default to minutes
    }
}

// Function to load settings
function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(defaultSettings, (items) => {
            suspensionSettings = items;
            // console.log('Settings loaded:', suspensionSettings);
            updateContextMenu(); // Update context menu on settings load
            resolve(suspensionSettings);
        });
    });
}

// Function to suspend a tab
async function suspendTab(tabId, originalUrl) {
    // console.log(`Attempting to suspend tab: ${tabId}, Original URL: ${originalUrl}`);

    // No need to loadSettings here again, it's called on interval start and startup
    const settings = suspensionSettings; // Use the already loaded global settings

    if (!originalUrl || originalUrl.startsWith('chrome://') || originalUrl.startsWith('about:') || originalUrl.startsWith(chrome.runtime.getURL(''))) {
        // console.log(`Not suspending special tab: ${originalUrl}`);
        return; // Don't suspend internal Chrome pages or already suspended pages
    }

    const suspendedUrl = chrome.runtime.getURL(`suspended.html?originalUrl=${encodeURIComponent(originalUrl)}`);

    try {
        await chrome.tabs.update(tabId, { url: suspendedUrl });
        // console.log(`Tab ${tabId} suspended.`);
    } catch (error) {
        console.error(`Error suspending tab ${tabId}: ${error.message}`);
    }
}

// Function to unsuspend a tab
async function unsuspendTab(tabId, url) {
    if (!url) {
        console.error('No URL provided to unsuspend tab.');
        return;
    }
    try {
        await chrome.tabs.update(tabId, { url: url, active: true });
        // console.log(`Tab ${tabId} unsuspended to: ${url}`);
    } catch (error) {
        console.error(`Error unsuspending tab ${tabId}: ${error.message}`);
    }
}


// --- Tab Suspension Logic ---
let tabActivity = {}; // Stores last active time for each tabId

// Initialize tab activity on startup
chrome.runtime.onInstalled.addListener(() => {
    // console.log("Extension installed or updated.");
    loadSettings(); // Load settings on install/update
    startInactivityCheck(); // Start the inactivity check interval
});

// Load settings when service worker starts or resumes
chrome.runtime.onStartup.addListener(() => {
    // console.log("Extension started up.");
    loadSettings();
    startInactivityCheck();
});

// Listen for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener(activeInfo => {
    tabActivity[activeInfo.tabId] = Date.now();
    // console.log(`Tab ${activeInfo.tabId} activated. Updated activity.`);
});

// Listen for tab updates (when content loads or changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
        tabActivity[tabId] = Date.now();
        // console.log(`Tab ${tabId} updated. Updated activity.`);

        // Auto-unsuspend if setting is enabled and it's a suspended tab
        if (tab.url.startsWith(chrome.runtime.getURL('suspended.html')) && suspensionSettings.autoUnsuspendOnView) {
            const urlParams = new URLSearchParams(tab.url);
            const originalUrl = urlParams.get('originalUrl');
            if (originalUrl) {
                unsuspendTab(tabId, decodeURIComponent(originalUrl));
            }
        }
    }
});

// Listen for tab removal (clean up activity tracking)
chrome.tabs.onRemoved.addListener(tabId => {
    delete tabActivity[tabId];
    // console.log(`Tab ${tabId} removed. Cleaned up activity.`);
});

// --- Inactivity Check Interval ---
let inactivityCheckInterval;

function startInactivityCheck() {
    if (inactivityCheckInterval) {
        clearInterval(inactivityCheckInterval); // Clear existing interval if any
    }

    inactivityCheckInterval = setInterval(async () => {
        await loadSettings(); // Reload settings just in case they changed from options page

        // CHANGES HERE: NEW LOGIC - Check if auto-suspension is disabled
        if (suspensionSettings.disableAutoSuspension) {
            // console.log("Automatic suspension is disabled. Skipping check.");
            return; // Exit early if auto suspension is turned off
        }

        const suspensionThresholdMs = convertToMilliseconds(suspensionSettings.inactivityTimeValue, suspensionSettings.inactivityTimeUnit);
        const now = Date.now();

        chrome.tabs.query({}, async (tabs) => {
            for (const tab of tabs) {
                if (tab.url.startsWith(chrome.runtime.getURL('suspended.html'))) {
                    // Already suspended, skip
                    continue;
                }

                // Check last activity
                const lastActivity = tabActivity[tab.id] || tab.lastAccessed; // Fallback to tab.lastAccessed
                if (now - lastActivity < suspensionThresholdMs) {
                    continue; // Not inactive enough
                }

                // Check exclusion rules
                let shouldSuspend = true;

                if (suspensionSettings.neverSuspendPinned && tab.pinned) {
                    shouldSuspend = false;
                }
                if (suspensionSettings.neverSuspendActiveInWindow && tab.active) { // Only active tab in *its* window
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

                // Check excluded URLs
                const excludedUrlsArray = suspensionSettings.excludedUrls.split('\n').map(url => url.trim()).filter(url => url !== '');
                if (excludedUrlsArray.some(excludedUrl => tab.url.includes(excludedUrl))) {
                    shouldSuspend = false;
                }

                // Offline and Power Connected checks are placeholders and need additional API integration
                // to genuinely detect these states. Without specific API usage and permissions,
                // these checkboxes only exist for user preference but don't actively influence suspension
                // based on system state in the current implementation.

                if (shouldSuspend) {
                    // console.log(`Tab ${tab.id} is inactive and qualifies for suspension.`);
                    const originalUrl = tab.url;
                    if (originalUrl && !originalUrl.startsWith('chrome://') && !originalUrl.startsWith('about:') && !originalUrl.startsWith(chrome.runtime.getURL(''))) {
                        await suspendTab(tab.id, originalUrl);
                    }
                }
            }
        });
    }, 5000); // Check every 5 seconds
}


// --- Context Menu ---
function updateContextMenu() {
    chrome.contextMenus.removeAll(() => { // Clear existing menu items
        if (suspensionSettings.addContextMenu) {
            chrome.contextMenus.create({
                id: "suspendCurrentTab",
                title: "Suspend This Tab",
                // CHANGES HERE: 'tab' is not a valid context in Manifest V3. Use 'page'.
                contexts: ["page"] // Changed from ["page", "tab"] to ["page"]
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

// Listen for messages from popup or options page for manual suspend/unsuspend
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "suspendTabFromPopup" && request.tabId && request.originalUrl) {
        suspendTab(request.tabId, request.originalUrl);
        sendResponse({ status: "ok" });
    } else if (request.action === "unsuspendTabFromPopup" && request.tabId && request.url) {
        unsuspendTab(request.tabId, request.url);
        sendResponse({ status: "ok" });
    } else if (request.action === "bulkSuspend" && request.tabsToSuspend) {
        request.tabsToSuspend.forEach(tab => suspendTab(tab.id, tab.url));
        sendResponse({ status: "ok" });
    } else if (request.action === "bulkUnsuspend" && request.tabsToUnsuspend) {
        request.tabsToUnsuspend.forEach(tab => unsuspendTab(tab.id, tab.url));
        sendResponse({ status: "ok" });
    } else if (request.action === "loadSettingsRequest") {
        loadSettings().then(settings => sendResponse(settings));
        return true; // Indicates async response
    }
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener((command, tab) => {
    if (command === "suspend-current-tab") {
        if (tab && tab.id && tab.url) {
            suspendTab(tab.id, tab.url);
        }
    }
});

// Initial load of settings and start check
loadSettings().then(() => {
    startInactivityCheck();
});
