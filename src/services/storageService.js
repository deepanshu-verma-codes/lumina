export const StorageService = {
    async set(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, () => {
                resolve();
            });
        });
    },

    async get(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key]);
            });
        });
    },

    async addHistory(item) {
        const history = (await this.get('recording_history')) || [];
        history.unshift({
            id: Date.now(),
            date: new Date().toISOString(),
            ...item
        });
        // Limit to last 10 items
        const limitedHistory = history.slice(0, 10);
        await this.set('recording_history', limitedHistory);
        return limitedHistory;
    },

    async getHistory() {
        return (await this.get('recording_history')) || [];
    }
};
