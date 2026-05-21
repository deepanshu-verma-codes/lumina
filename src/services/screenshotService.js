export const ScreenshotService = {
    async captureTab() {
        return new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(dataUrl);
            });
        });
    },

    download(dataUrl, filename = 'screenshot.png') {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();
    }
};
