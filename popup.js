document.addEventListener('DOMContentLoaded', () => {
    const tabList = document.getElementById('tabList');
    const suspendAllBtn = document.getElementById('suspendAllBtn');
    const suspendAllButCurrentBtn = document.getElementById('suspendAllButCurrentBtn');
    const unsuspendAllBtn = document.getElementById('unsuspendAllBtn');
    const loadingMessage = document.getElementById('loadingMessage');
    const unsuspendInBackgroundCheckbox = document.getElementById('unsuspendInBackground'); // NEW: Get the checkbox

    let currentTabId = null;

    // Load settings when popup opens
    function loadSettings() {
        chrome.storage.sync.get({
            theme: 'light',
            unsuspendInBackground: false // Default to false (unsuspend and activate)
        }, (items) => {
            if (items.theme === 'dark') {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
            // Set checkbox state
            unsuspendInBackgroundCheckbox.checked = items.unsuspendInBackground;
        });
    }

    // Save setting when checkbox changes
    if (unsuspendInBackgroundCheckbox) { // Ensure checkbox exists before adding listener
        unsuspendInBackgroundCheckbox.addEventListener('change', () => {
            chrome.storage.sync.set({
                unsuspendInBackground: unsuspendInBackgroundCheckbox.checked
            });
        });
    }


    function renderTabs() {
        tabList.innerHTML = '';
        loadingMessage.style.display = 'block';

        chrome.tabs.query({ currentWindow: true }, (tabs) => {
            loadingMessage.style.display = 'none';

            if (tabs.length === 0) {
                tabList.innerHTML = '<div class="message">No tabs open in this window.</div>';
                return;
            }

            chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                if (activeTabs.length > 0) {
                    currentTabId = activeTabs[0].id;
                }

                tabs.forEach(tab => {
                    const tabItem = document.createElement('div');
                    tabItem.classList.add('tab-list-item');

                    const tabInfo = document.createElement('div');
                    tabInfo.classList.add('tab-info');

                    const tabTitle = document.createElement('span');
                    tabTitle.classList.add('tab-title');
                    tabTitle.textContent = tab.title || tab.url;

                    const tabUrl = document.createElement('span');
                    tabUrl.classList.add('tab-url');
                    tabUrl.textContent = tab.url;

                    tabInfo.appendChild(tabTitle);
                    tabInfo.appendChild(tabUrl);

                    tabItem.appendChild(tabInfo);

                    let actionButton;
                    const isSuspended = tab.url.startsWith(chrome.runtime.getURL('suspended.html'));

                    if (isSuspended) {
                        actionButton = document.createElement('button');
                        actionButton.classList.add('unsuspend-btn');
                        actionButton.textContent = 'Unsuspend';

                        let originalUrlFromParams = null;
                        try {
                            const urlObj = new URL(tab.url);
                            originalUrlFromParams = urlObj.searchParams.get('originalUrl');
                        } catch (e) {
                            console.error('Popup: [RenderTabs] Error parsing URL object for suspended tab (ID: ' + tab.id + '):', tab.url, e);
                        }

                        console.log(`Popup: [RenderTabs] Processing suspended tab ID: ${tab.id}`);
                        console.log(`Popup: [RenderTabs] Tab URL: ${tab.url}`);
                        console.log(`Popup: [RenderTabs] Extracted originalUrlFromParams (via new URL().searchParams.get()):`, originalUrlFromParams);


                        actionButton.addEventListener('click', () => {
                            if (originalUrlFromParams) {
                                // NEW: Determine makeActive based on checkbox
                                const makeActive = !unsuspendInBackgroundCheckbox.checked;
                                // ADDED LOG HERE
                                console.log(`Popup: Sending unsuspend message for tab ${tab.id}. makeActive: ${makeActive}`); 
                                chrome.runtime.sendMessage({ action: "unsuspendTabFromPopup", tabId: tab.id, url: decodeURIComponent(originalUrlFromParams), makeActive: makeActive }, response => {
                                    if (response && response.status === "ok") {
                                        renderTabs();
                                    }
                                });
                            } else {
                                console.error('Popup: ERROR - Original URL not found for tab (ID: ' + tab.id + '). Tab URL was:', tab.url, 'Extracted param was:', originalUrlFromParams);
                                alert('Error: Original URL not found for this suspended tab.');
                            }
                        });
                    } else {
                        actionButton = document.createElement('button');
                        actionButton.classList.add('suspend-btn');
                        actionButton.textContent = 'Suspend';
                        actionButton.addEventListener('click', () => {
                            chrome.runtime.sendMessage({ action: "suspendTabFromPopup", tabId: tab.id, originalUrl: tab.url }, response => {
                                if (response && response.status === "ok") {
                                    renderTabs();
                                }
                            });
                        });
                    }

                    tabItem.appendChild(actionButton);

                    if (tab.id === currentTabId) {
                        const currentTabMarker = document.createElement('span');
                        currentTabMarker.classList.add('current-tab-marker');
                        currentTabMarker.textContent = '(Current)';
                        tabInfo.appendChild(currentTabMarker);
                        tabItem.style.backgroundColor = 'rgba(52, 152, 219, 0.1)';
                        if (document.body.classList.contains('dark-mode')) {
                           tabItem.style.backgroundColor = 'rgba(135, 206, 235, 0.2)';
                        }
                    }

                    tabList.appendChild(tabItem);
                });
            });
        });
    }

    // Bulk Actions

    if (!suspendAllButCurrentBtn) {
        console.error('Popup: ERROR! "suspendAllButCurrentBtn" element not found in popup.html!');
    } else {
        console.log('Popup: "suspendAllButCurrentBtn" element found. Attaching listener...');
        suspendAllButCurrentBtn.addEventListener('click', () => {
            console.log('Popup: "Suspend All But Current" button CLICKED!');
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                const tabsToSuspend = tabs.filter(tab =>
                    (tab.url.startsWith('http://') || tab.url.startsWith('https://')) &&
                    !tab.active &&
                    !tab.url.startsWith(chrome.runtime.getURL('suspended.html'))
                );
                console.log('Popup: Tabs filtered for "Suspend All Except Current":', tabsToSuspend.map(t => t.url));
                if (tabsToSuspend.length > 0) {
                    chrome.runtime.sendMessage({ action: "bulkSuspend", tabsToSuspend: tabsToSuspend }, response => {
                        if (response && response.status === "ok") {
                            renderTabs();
                        } else {
                            console.error('Popup: Failed to receive OK response for bulkSuspend (Suspend All Except Current):', response);
                        }
                    });
                } else {
                    console.log('Popup: No tabs found to suspend for "Suspend All Except Current".');
                }
            });
        });
    }

    suspendAllBtn.addEventListener('click', () => {
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
            const tabsToSuspend = tabs.filter(tab =>
                (tab.url.startsWith('http://') || tab.url.startsWith('https://')) &&
                !tab.url.startsWith(chrome.runtime.getURL('suspended.html'))
            );
            console.log('Popup: Tabs filtered for "Suspend All":', tabsToSuspend.map(t => t.url));
            if (tabsToSuspend.length > 0) {
                chrome.runtime.sendMessage({ action: "bulkSuspend", tabsToSuspend: tabsToSuspend }, response => {
                    if (response && response.status === "ok") {
                        renderTabs();
                    } else {
                        console.error('Popup: Failed to receive OK response for bulkSuspend (Suspend All):', response);
                    }
                });
            } else {
                console.log('Popup: No tabs found to suspend for "Suspend All".');
            }
        });
    });

    unsuspendAllBtn.addEventListener('click', () => {
        chrome.tabs.query({ currentWindow: true, url: chrome.runtime.getURL('suspended.html') + '*' }, (tabs) => {
            const tabsToUnsuspend = tabs.map(tab => {
                let originalUrl = null;
                try {
                    const urlObj = new URL(tab.url);
                    const originalUrlEncoded = urlObj.searchParams.get('originalUrl');
                    if (originalUrlEncoded !== null) {
                        originalUrl = decodeURIComponent(originalUrlEncoded);
                    }
                } catch (e) {
                    console.error('Popup: Error parsing URL object for bulk unsuspend (ID: ' + tab.id + '):', tab.url, e);
                }

                return { id: tab.id, url: originalUrl };
            }).filter(tab => tab.url && tab.url !== 'null');

            console.log('Popup: Tabs filtered for "Bulk Unsuspend" (after checking for "null" string):', tabsToUnsuspend.map(t => t.url));
            if (tabsToUnsuspend.length > 0) {
                chrome.runtime.sendMessage({ action: "bulkUnsuspend", tabsToUnsuspend: tabsToUnsuspend }, response => {
                    if (response && response.status === "ok") {
                        renderTabs();
                    }
                });
            } else {
                console.log('Popup: No valid suspended tabs found to unsuspend.');
            }
        });
    });

    loadSettings(); // Call loadSettings when the popup opens
    renderTabs();

    chrome.tabs.onActivated.addListener(renderTabs);
    chrome.tabs.onUpdated.addListener(renderTabs);
    chrome.tabs.onRemoved.addListener(renderTabs);
});
