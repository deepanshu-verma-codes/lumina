chrome.commands.onCommand.addListener((command) => {
    if (command === "take-screenshot") {
        captureScreenshot();
    } else if (command === "toggle-recording") {
        // Notify popup if it's open, or handle via injected script
        chrome.runtime.sendMessage({ action: "toggleRecording" });
    }
});

async function captureScreenshot() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }
            
            const timestamp = new Date().getTime();
            chrome.downloads.download({
                url: dataUrl,
                filename: `lumina-screenshot-${timestamp}.png`,
                saveAs: false
            });
        });
    } catch (err) {
        console.error("Failed to capture screenshot:", err);
    }
}
