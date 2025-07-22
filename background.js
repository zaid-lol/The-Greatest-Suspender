// background.js

console.log("Simple Tab Suspender: Background script loaded!");

let tabData = {}; // Stores original URLs, titles, and suspension status for tabs
let settings = {}; // Stores all user settings from options page

// Default settings (will be overridden by user saved settings)
const DEFAULT_SETTINGS = {
    inactivityTimeValue: 15, // Changed from inactivityTimeMinutes
    inactivityTimeUnit: 'minutes', // New setting for time unit
    neverSuspendPinned: true,
    neverSuspendActiveInWindow: true,
    neverSuspendAudio: true,
    neverSuspendOffline: false,
    neverSuspendPowerConnected: false,
    autoUnsuspendOnView: true,
    addContextMenu: true,
    theme: 'light', // Default theme
    excludedUrls: []
};

// Base URL for our suspended page, without any parameters
const SUSPENDED_PAGE_BASE_URL = chrome.runtime.getURL("suspended.html");

// --- Settings Management ---
async function loadUserSettings() {
    console.log("Attempting to load user settings...");
    // Load all settings, applying defaults if not found
    try {
        const result = await chrome.storage.local.get(DEFAULT_SETTINGS);
        settings = result;
        console.log("Settings loaded:", settings);

        // Update context menu based on loaded settings
        updateContextMenu(settings.addContextMenu);
    } catch (e) {
        console.error("Error loading settings:", e);
        // Fallback to default settings if loading fails
        settings = { ...DEFAULT_SETTINGS };
        updateContextMenu(settings.addContextMenu); // Try with default
    }
}

// Listen for changes in storage (e.g., from options page)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        let updateContextMenuNeeded = false;
        for (const key in changes) {
            if (changes.hasOwnProperty(key)) {
                settings[key] = changes[key].newValue;
                if (key === 'addContextMenu') {
                    updateContextMenuNeeded = true;
                }
            }
        }
        console.log("Settings updated from storage listener:", settings);
        if (updateContextMenuNeeded) {
            updateContextMenu(settings.addContextMenu);
        }
    }
});

// Load settings when the service worker starts
loadUserSettings();

// --- Context Menu Management ---
const CONTEXT_MENU_ID = "suspendCurrentTab";

function createContextMenu() {
    console.log("Attempting to create context menu...");
    try {
        // Remove existing context menu item first to prevent duplicates
        chrome.contextMenus.remove(CONTEXT_MENU_ID, () => {
            // Ignore error if item didn't exist
            if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Cannot find menu item")) {
                console.error("Error removing old context menu:", chrome.runtime.lastError.message);
            }
            // Now create it
            chrome.contextMenus.create({
                id: CONTEXT_MENU_ID,
                title: "Suspend This Tab",
                contexts: ["page", "tab_strip"] // Shows on page content and on the tab in the tab bar
            });
            console.log("Context menu created successfully.");
        });
    } catch (e) {
        console.error("Error during context menu creation:", e);
    }
}

function removeContextMenu() {
    console.log("Attempting to remove context menu...");
    chrome.contextMenus.remove(CONTEXT_MENU_ID, () => {
        if (chrome.runtime.lastError) {
            // Ignore "Cannot find menu item" error if it didn't exist
            if (!chrome.runtime.lastError.message.includes("Cannot find menu item")) {
                console.error("Error removing context menu:", chrome.runtime.lastError.message);
            } else {
                console.log("Context menu was already removed or didn't exist.");
            }
        } else {
            console.log("Context menu removed successfully.");
        }
    });
}

function updateContextMenu(shouldAdd) {
    console.log(`Updating context menu. Should add: ${shouldAdd}`);
    if (shouldAdd) {
        createContextMenu();
    } else {
        removeContextMenu();
    }
}

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === CONTEXT_MENU_ID && tab && tab.id) {
        console.log(`Context menu clicked for tab ${tab.id}.`);
        suspendTab(tab.id); // Use our general suspend function
    }
});

// --- Command Listener for Ctrl+Shift+S ---
chrome.commands.onCommand.addListener((command) => {
    if (command === "suspend-current-tab") {
        console.log("Command 'suspend-current-tab' received.");
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const activeTab = tabs[0];
                console.log(`Suspending active tab: ${activeTab.id}`);
                suspendTab(activeTab.id);
            } else {
                console.log("No active tab found to suspend.");
            }
        });
    }
});


// --- Tab Activity Tracking ---
chrome.tabs.onActivated.addListener(activeInfo => {
    const tabId = activeInfo.tabId;
    // console.log(`Tab ${tabId} activated.`); // This log can be noisy

    // If autoUnsuspendOnView is true and the activated tab is our suspended page
    if (settings.autoUnsuspendOnView && tabData[tabId] && tabData[tabId].isSuspended) {
        // Restore the tab automatically
        console.log(`Auto-unsuspending tab ${tabId} on view.`);
        restoreTab(tabId); // This will update the tab URL
        return; // Don't update lastActive yet for auto-suspended tabs, restore handles it
    }

    // Update lastActive for normal, non-suspended tabs
    tabData[tabId] = {
        ...tabData[tabId],
        lastActive: Date.now(),
    };
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only process if status is 'complete' and it's not an internal browser page
    if (changeInfo.status === 'complete' && tab.url &&
        !(tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:"))) {

        // Check if the tab just navigated away from our suspended page
        if (tabData[tabId] && tabData[tabId].isSuspended && !tab.url.startsWith(SUSPENDED_PAGE_BASE_URL)) {
            tabData[tabId].isSuspended = false;
            tabData[tabId].lastActive = Date.now(); // Reset last active on user navigation
            console.log(`Tab ${tabId} implicitly restored by user navigation.`);
        }

        // If it's not our suspended page, update original URL/title if not already known or changed
        if (!tab.url.startsWith(SUSPENDED_PAGE_BASE_URL) && (!tabData[tabId] || tabData[tabId].originalUrl !== tab.url)) {
            tabData[tabId] = {
                lastActive: Date.now(),
                originalUrl: tab.url,
                originalTitle: tab.title,
                currentUrl: tab.url,
                isSuspended: false
            };
        } else if (tabData[tabId]) {
            // Update currentUrl even if suspended, useful for checking if it's our suspended page
            tabData[tabId].currentUrl = tab.url;
        }
    }
});

chrome.tabs.onRemoved.addListener(tabId => {
    console.log(`Tab ${tabId} removed.`);
    delete tabData[tabId];
});

// --- Suspension Logic ---
async function checkAndSuspendTabs() {
    const tabs = await chrome.tabs.query({});
    const now = Date.now();

    // Determine the inactivity threshold in milliseconds
    let inactivityThresholdMs = 0;
    if (settings.inactivityTimeUnit === 'seconds') {
        inactivityThresholdMs = settings.inactivityTimeValue * 1000;
    } else if (settings.inactivityTimeUnit === 'minutes') {
        inactivityThresholdMs = settings.inactivityTimeValue * 60 * 1000;
    } else if (settings.inactivityTimeUnit === 'hours') {
        inactivityThresholdMs = settings.inactivityTimeValue * 60 * 60 * 1000;
    } else {
        // Fallback to minutes if unit is undefined or invalid
        inactivityThresholdMs = DEFAULT_SETTINGS.inactivityTimeValue * 60 * 1000;
        console.warn("Invalid inactivity time unit, defaulting to minutes.");
    }

    for (const tab of tabs) {
        if (tab.id === chrome.tabs.TAB_ID_NONE || !tab.url) {
            continue; // Skip invalid or undefined tabs
        }

        // --- Rules for NEVER suspending tabs automatically ---
        if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
            continue; // Don't suspend internal browser pages
        }
        if (tab.url.startsWith(SUSPENDED_PAGE_BASE_URL)) {
            continue; // Don't suspend our own suspended page
        }
        if (tab.pinned && settings.neverSuspendPinned) {
            continue;
        }
        if (tab.active && settings.neverSuspendActiveInWindow) {
            continue;
        }
        if (tab.audible && settings.neverSuspendAudio) {
            continue;
        }
        if (settings.neverSuspendOffline && !navigator.onLine) {
            // console.log(`Skipping suspension of tab ${tab.id} because offline.`); // Can be noisy
            continue;
        }
        if (settings.neverSuspendPowerConnected) {
            try {
                const battery = await navigator.getBattery();
                if (battery.charging) {
                    // console.log(`Skipping suspension of tab ${tab.id} because on power.`); // Can be noisy
                    continue;
                }
            } catch (e) {
                console.warn("Could not access battery status API for suspension check:", e);
                // If API fails, default to suspending (or handle based on preference)
            }
        }
        // Excluded URLs check
        // Ensure settings.excludedUrls is an array before using .some
        const excludedUrlsArray = Array.isArray(settings.excludedUrls) ? settings.excludedUrls : [];
        const isExcluded = excludedUrlsArray.some(excludedUrl => tab.url.includes(excludedUrl));
        if (isExcluded) {
            // console.log(`Skipping suspension of tab ${tab.id} because URL is excluded.`); // Can be noisy
            continue;
        }

        // Initialize tabData if not present or needs update (e.g., after browser restart)
        if (!tabData[tab.id]) {
            tabData[tab.id] = {
                lastActive: now,
                originalUrl: tab.url,
                originalTitle: tab.title,
                currentUrl: tab.url,
                isSuspended: false
            };
        }

        const data = tabData[tab.id];

        // If already suspended by us, or hasn't met inactivity threshold
        if (data.isSuspended || (now - data.lastActive <= inactivityThresholdMs)) {
            continue;
        }

        // If we reach here, the tab should be suspended
        console.log(`Attempting to auto-suspend tab ${tab.id} (URL: ${data.originalUrl}) after ${settings.inactivityTimeValue} ${settings.inactivityTimeUnit} of inactivity.`);
        await suspendTab(tab.id); // Use the general suspend function
    }
}

setInterval(checkAndSuspendTabs, 5 * 1000); // Check every 5 seconds

// --- Manual Suspension/Restoration Functions ---

// Function to suspend a specific tab
async function suspendTab(tabId) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.pinned) {
        console.log(`Cannot suspend tab ${tabId}: invalid, internal, or pinned.`);
        return false;
    }
    if (tab.url.startsWith(SUSPENDED_PAGE_BASE_URL)) {
        console.log(`Tab ${tabId} is already suspended.`);
        return true;
    }

    // Ensure originalUrl and originalTitle are set for manual suspension
    // (This also updates lastActive, as a manual suspend is an "action")
    tabData[tabId] = {
        ...tabData[tabId],
        lastActive: Date.now(),
        originalUrl: tab.url,
        originalTitle: tab.title
    };

    const encodedUrl = encodeURIComponent(tabData[tabId].originalUrl || "");
    const encodedTitle = encodeURIComponent(tabData[tabId].originalTitle || "");
    const suspendedPageWithParams = `${SUSPENDED_PAGE_BASE_URL}?url=${encodedUrl}&title=${encodedTitle}`;

    try {
        await chrome.tabs.update(tabId, { url: suspendedPageWithParams });
        tabData[tabId].isSuspended = true;
        tabData[tabId].currentUrl = suspendedPageWithParams;
        console.log(`Manually suspended tab ${tabId}.`);
        return true;
    } catch (e) {
        console.error(`Error manually suspending tab ${tabId}:`, e);
        return false;
    }
}

// Function to restore a specific tab
async function restoreTab(tabId) {
    if (tabData[tabId] && tabData[tabId].isSuspended && tabData[tabId].originalUrl) {
        try {
            await chrome.tabs.update(tabId, { url: tabData[tabId].originalUrl });
            tabData[tabId].isSuspended = false;
            tabData[tabId].currentUrl = tabData[tabId].originalUrl;
            tabData[tabId].lastActive = Date.now(); // Mark as active after restoring
            console.log(`Manually restored tab ${tabId}.`);
            return true;
        } catch (e) {
            console.error(`Error restoring tab ${tabId}:`, e);
            return false;
        }
    }
    console.log(`Cannot restore tab ${tabId}: not suspended or no original URL.`);
    return false;
}

// --- Global Actions (These use suspendTab/restoreTab) ---

// Suspend all tabs except the current one
async function suspendAllExceptCurrent() {
    const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTabId = currentTabs[0]?.id; // Use optional chaining for safety

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tab.id !== currentTabId && !tab.pinned) { // Respect pinned tabs even for manual suspend all
            await suspendTab(tab.id);
        }
    }
    console.log("Suspended all tabs except the current one.");
}

// Suspend all tabs
async function suspendAllTabs() {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (!tab.pinned) { // Respect pinned tabs
            await suspendTab(tab.id);
        }
    }
    console.log("Suspended all active tabs.");
}

// Unsuspend all tabs
async function unsuspendAllTabs() {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tabData[tab.id] && tabData[tab.id].isSuspended) {
            await restoreTab(tab.id);
        }
    }
    console.log("Unsuspended all tabs.");
}

// --- Message Listener for Popup and Suspended Page ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getTabData") {
        sendResponse(tabData);
    } else if (request.action === "suspendTab" && request.tabId) {
        suspendTab(request.tabId).then(success => sendResponse({ success }));
        return true; // Indicates async response
    } else if (request.action === "restoreTab" && request.tabId) {
        restoreTab(request.tabId).then(success => sendResponse({ success }));
        return true; // Indicates async response
    } else if (request.action === "suspendAllExceptCurrent") {
        suspendAllExceptCurrent().then(() => sendResponse({ success: true }));
        return true;
    } else if (request.action === "suspendAllTabs") {
        suspendAllTabs().then(() => sendResponse({ success: true }));
        return true;
    } else if (request.action === "unsuspendAllTabs") {
        unsuspendAllTabs().then(() => sendResponse({ success: true }));
        return true;
    }
    // No response sent for unhandled actions
});

// Initialize tab data for currently open tabs when the extension starts
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed or updated. Populating initial tab data and creating context menu.");
    chrome.tabs.query({}, (tabs) => {
        const now = Date.now();
        tabs.forEach(tab => {
            if (tab.id && !(tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:"))) {
                tabData[tab.id] = {
                    lastActive: now,
                    originalUrl: tab.url,
                    originalTitle: tab.title,
                    currentUrl: tab.url,
                    isSuspended: false
                };
            }
        });
        console.log("Initial tab data populated:", tabData);
    });

    // Create context menu on first install or update based on default setting
    if (DEFAULT_SETTINGS.addContextMenu) {
        createContextMenu();
    }
});

// Handle cases where service worker might terminate and restart
// This ensures context menu is re-created if it should be
chrome.runtime.onStartup.addListener(() => {
    console.log("Browser started up. Reloading settings and re-initializing context menu.");
    loadUserSettings(); // Reload settings to ensure context menu status is correct
});