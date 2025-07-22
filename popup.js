// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const tabList = document.getElementById('tabList');
    const suspendAllExceptCurrentButton = document.getElementById('suspendAllExceptCurrentButton');
    const suspendAllButton = document.getElementById('suspendAllButton');
    const unsuspendAllButton = document.getElementById('unsuspendAllButton');
    const settingsButton = document.getElementById('settingsButton');

    // Function to apply theme to the popup body
    function applyThemeToPopup(theme) {
        document.body.classList.remove('light-mode', 'dark-mode');
        document.body.classList.add(theme + '-mode');
    }

    // Load theme setting and apply it when popup opens
    chrome.storage.local.get('theme', (result) => {
        const currentTheme = result.theme || 'light'; // Default to light
        applyThemeToPopup(currentTheme);
    });

    // Listen for theme changes from options page in real-time
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.theme) {
            applyThemeToPopup(changes.theme.newValue);
        }
    });


    // Function to render the list of tabs
    function renderTabList(tabData) {
        tabList.innerHTML = ''; // Clear previous list

        chrome.tabs.query({}, tabs => {
            tabs.forEach(tab => {
                const li = document.createElement('li');
                const tabInfoDiv = document.createElement('div');
                tabInfoDiv.classList.add('tab-info');

                const titleSpan = document.createElement('span');
                titleSpan.classList.add('tab-title');

                const urlSpan = document.createElement('span');
                urlSpan.classList.add('tab-url');

                const button = document.createElement('button');
                const data = tabData[tab.id];

                // Determine button text and action based on suspension status
                if (data && data.isSuspended) {
                    // This tab is suspended
                    titleSpan.textContent = tab.title || "Suspended Tab"; // Current title of suspended.html or fallback
                    urlSpan.textContent = data.originalUrl || "URL Not Found"; // Show original URL
                    button.textContent = 'Restore';
                    button.classList.add('restore');

                    // Add a visual indicator
                    const suspendedIndicator = document.createElement('span');
                    suspendedIndicator.classList.add('suspended-indicator');
                    suspendedIndicator.textContent = '[Suspended]';
                    tabInfoDiv.appendChild(suspendedIndicator);


                    button.addEventListener('click', () => {
                        chrome.runtime.sendMessage({ action: "restoreTab", tabId: tab.id }, (response) => {
                            if (response && response.success) {
                                console.log(`Requested restore for tab ${tab.id}`);
                                window.close(); // Close popup after action
                            }
                        });
                    });
                } else {
                    // This tab is active
                    titleSpan.textContent = tab.title || tab.url; // Show current title or URL
                    button.textContent = 'Suspend';
                    button.addEventListener('click', () => {
                        chrome.runtime.sendMessage({ action: "suspendTab", tabId: tab.id }, (response) => {
                            if (response && response.success) {
                                console.log(`Requested suspend for tab ${tab.id}`);
                                window.close(); // Close popup after action
                            }
                        });
                    });
                }

                tabInfoDiv.appendChild(titleSpan);
                if (urlSpan.textContent) {
                    tabInfoDiv.appendChild(urlSpan);
                }
                li.appendChild(tabInfoDiv);
                li.appendChild(button);
                tabList.appendChild(li);
            });
        });
    }

    // Request tab data from the background script when the popup opens
    chrome.runtime.sendMessage({ action: "getTabData" }, (response) => {
        if (response) {
            renderTabList(response);
        } else {
            console.error("Failed to get tab data from background script.");
        }
    });

    // Add event listeners for global action buttons
    suspendAllExceptCurrentButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "suspendAllExceptCurrent" }, (response) => {
            if (response && response.success) {
                console.log("Requested suspend all except current.");
                window.close();
            }
        });
    });

    suspendAllButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "suspendAllTabs" }, (response) => {
            if (response && response.success) {
                console.log("Requested suspend all tabs.");
                window.close();
            }
        });
    });

    unsuspendAllButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "unsuspendAllTabs" }, (response) => {
            if (response && response.success) {
                console.log("Requested unsuspend all tabs.");
                window.close();
            }
        });
    });

    // Event listener for the Extension Settings button
    settingsButton.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
});