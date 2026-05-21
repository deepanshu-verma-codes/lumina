export const RecordingService = {
    mediaRecorder: null,
    recordedChunks: [],
    screenStream: null,
    micStream: null,
    combinedStream: null,
    state: 'inactive', // inactive, recording, paused

    async ensurePermissions() {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT']
        });

        if (existingContexts.length > 0) return;

        await chrome.offscreen.createDocument({
            url: 'src/offscreen/offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'To request microphone access for recording.'
        });

        // Send message to trigger the prompt
        await chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'getMicrophone'
        });
    },

    async startRecording(options = { mic: true }) {
        try {
            const tracks = [];

            // 1. Get Mic Stream first if requested
            if (options.mic) {
                try {
                    this.micStream = await navigator.mediaDevices.getUserMedia({
                        audio: true
                    });
                    
                    const micTrack = this.micStream.getAudioTracks()[0];
                    if (micTrack) {
                        tracks.push(micTrack);
                    }
                } catch (micErr) {
                    console.warn('Microphone access denied or not available:', micErr);
                }
            }

            // 2. Get Screen Stream
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true // This captures system/tab audio
            });

            tracks.push(...this.screenStream.getTracks());

            this.combinedStream = new MediaStream(tracks);
            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(this.combinedStream);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.handleStop();
            };

            this.mediaRecorder.start(1000); 
            this.state = 'recording';
            return this.combinedStream;
        } catch (error) {
            console.error('Error starting recording:', error);
            this.cleanup();
            throw error;
        }
    },

    pauseRecording() {
        if (this.mediaRecorder && this.state === 'recording') {
            this.mediaRecorder.pause();
            this.state = 'paused';
        }
    },

    resumeRecording() {
        if (this.mediaRecorder && this.state === 'paused') {
            this.mediaRecorder.resume();
            this.state = 'recording';
        }
    },

    stopRecording() {
        if (this.mediaRecorder && this.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.state = 'inactive';
        }
        this.cleanup();
    },

    cleanup() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        this.combinedStream = null;
    },

    handleStop() {
        if (this.recordedChunks.length === 0) return;
        
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        this.download(url);
        this.recordedChunks = [];
    },

    download(url, filename) {
        if (!filename) {
            filename = 'lumina-snap-' + Date.now() + '.webm';
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },

    getState() {
        return this.state;
    },

    isRecording() {
        return this.state === 'recording' || this.state === 'paused';
    }
};
