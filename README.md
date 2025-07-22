# The Greatest Suspender

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/YOUR_USERNAME/The-Greatest-Suspender/blob/main/LICENSE)
Reclaim your browser's memory and boost performance by intelligently suspending inactive tabs.

## Overview

Are you tired of Chrome hogging all your RAM? Do too many open tabs slow down your Browse experience and drain your battery? **The Greatest Suspender** is here to help!

This lightweight and highly customizable Chrome extension intelligently suspends inactive tabs, freeing up valuable system resources without closing your pages. Whether you prefer a fully automated approach or want manual control, The Greatest Suspender offers the flexibility you need for a smoother, faster Browse session.

## Features

* **Automatic Suspension:** Set a custom inactivity time (in seconds, minutes, or hours) after which tabs will automatically suspend.
* **Manual Suspension:**
    * Quickly suspend the current tab via `Ctrl+Shift+S` keyboard shortcut.
    * Right-click any tab or anywhere on a page to suspend instantly.
    * Use the extension popup to suspend individual tabs.
* **Smart Exclusion Rules:** Prevent suspension for important tabs like:
    * Pinned tabs
    * The active tab in each window
    * Tabs playing audio
    * Tabs when offline or connected to a power source
    * Custom URLs you define (e.g., mail.google.com, youtube.com).
* **Effortless Restoration:** Click a suspended tab or its "Restore" button to instantly bring it back to life.
* **Batch Actions:** Suspend all tabs, suspend all except the current one, or unsuspend all tabs with a single click from the popup.
* **Customizable Theme:** Choose between light and dark modes for the extension's interface in the options page.

## Benefits

* **Save Memory & CPU:** Significantly reduce resource consumption, especially with many tabs open.
* **Improve Performance:** Enjoy a faster, more responsive browser.
* **Extend Battery Life:** Lower CPU usage can mean longer battery life for laptops.
* **Reduce Clutter:** Keep your tab bar clean without losing your pages.

## Installation (Loading as an Unpacked Extension)

Since this extension is not on the Chrome Web Store, you can easily install it by loading it as an "unpacked" extension in Chrome's Developer Mode.

1.  **Download:** Click the green **"<> Code"** button on this GitHub repository page (usually near the top right) and select **"Download ZIP"**.
2.  **Unzip:** Extract the downloaded ZIP file to a convenient location on your computer (e.g., create a new folder named `The-Greatest-Suspender` and extract its contents there).
3.  **Open Chrome Extensions:** Open your Chrome browser and type `chrome://extensions/` into the address bar, then press Enter.
4.  **Enable Developer Mode:** In the top right corner of the Extensions page, toggle on the **"Developer mode"** switch.
5.  **Load Unpacked:** Click the **"Load unpacked"** button that now appears.
6.  **Select Folder:** Navigate to the folder where you unzipped the extension (the one containing `manifest.json`, `background.js`, `popup.html`, etc.) and select that folder.

Your extension, "The Greatest Suspender," should now appear in your list of installed extensions and its icon will be visible in your browser's toolbar!

## Usage

* **Extension Popup:** Click the extension icon in your toolbar to see open tabs and manually suspend/restore them, or use the batch action buttons.
* **Keyboard Shortcut:** Press `Ctrl + Shift + S` (or `Command + Shift + S` on Mac) to instantly suspend the currently active tab.
* **Context Menu:** Right-click on any tab in the tab bar or on any webpage to find the "Suspend This Tab" option.
* **Options Page:** Right-click the extension icon and select "Options" to configure automatic suspension settings, exclusion rules, and theme.
