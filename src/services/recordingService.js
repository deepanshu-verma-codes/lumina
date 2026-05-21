export const RecordingService = {
    mediaRecorder: null,
    recordedChunks: [],
    screenStream: null,
    micStream: null,
    combinedStream: null,
    audioContext: null,
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
            // 1. Get Screen Stream
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true // This captures system/tab audio
            });

            // 2. Get Mic Stream if requested
            if (options.mic) {
                try {
                    this.micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                } catch (micErr) {
                    console.warn('Microphone access denied or not available:', micErr);
                }
            }

            // 3. Merge Audio Tracks using AudioContext
            this.audioContext = new AudioContext();
            const destination = this.audioContext.createMediaStreamDestination();
            let hasAudio = false;

            if (this.screenStream.getAudioTracks().length > 0) {
                const source = this.audioContext.createMediaStreamSource(new MediaStream([this.screenStream.getAudioTracks()[0]]));
                source.connect(destination);
                hasAudio = true;
            }

            if (this.micStream && this.micStream.getAudioTracks().length > 0) {
                const source = this.audioContext.createMediaStreamSource(new MediaStream([this.micStream.getAudioTracks()[0]]));
                source.connect(destination);
                hasAudio = true;
            }

            const tracks = [...this.screenStream.getVideoTracks()];
            if (hasAudio) {
                tracks.push(...destination.stream.getAudioTracks());
            }

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
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
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
