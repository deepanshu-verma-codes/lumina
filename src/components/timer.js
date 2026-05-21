export const Timer = {
    startTime: null,
    interval: null,
    onTick: null,

    start(onTick) {
        this.startTime = Date.now();
        this.onTick = onTick;
        this.interval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            if (this.onTick) this.onTick(this.format(elapsed));
        }, 1000);
    },

    stop() {
        clearInterval(this.interval);
        this.startTime = null;
        this.interval = null;
    },

    format(ms) {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

        const h = hours > 0 ? `${hours}:` : '';
        const m = minutes < 10 && hours > 0 ? `0${minutes}` : minutes;
        const s = seconds < 10 ? `0${seconds}` : seconds;

        return `${h}${m}:${s}`;
    }
};
