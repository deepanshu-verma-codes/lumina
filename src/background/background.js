// BACKGROUND ORCHESTRATOR
// Since recording is now handled in popup.js, background.js is primarily for content script messaging if needed, or screenshots.

console.log('[BACKGROUND] Service Worker Started');

chrome.runtime.onInstalled.addListener(() => {
    console.log('[BACKGROUND] Extension installed');
});

// We can keep this minimal as popup.js now owns the MediaRecorder pipeline.
// If content scripts still need to send messages to background, they can be handled here.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Left for future messaging (e.g. screenshot handling)
    if (request.action === 'takeScreenshot') {
        // Screenshot logic would go here
        sendResponse({ success: true });
    }
    return true;
});
