// OFFSCREEN RECORDING ENGINE
// This is the SINGLE SOURCE OF TRUTH for the MediaRecorder

let recorder = null;
let stream = null;
let chunks = [];

console.log('[OFFSCREEN] Pipeline Initialized');

// Notify background that we are ready
chrome.runtime.sendMessage({ action: 'offscreenReady' });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return;

    console.log('[OFFSCREEN] Received action:', message.action);

    if (message.action === 'START_RECORDING_REAL') {
        startRecording(message.streamId, message.options)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.action === 'STOP_RECORDING_REAL') {
        stopRecording();
        sendResponse({ success: true });
    }

    if (message.action === 'PAUSE_RECORDING_REAL') {
        if (recorder && recorder.state === 'recording') {
            recorder.pause();
            console.log('[OFFSCREEN] Recorder PAUSED');
        }
    }

    if (message.action === 'RESUME_RECORDING_REAL') {
        if (recorder && recorder.state === 'paused') {
            recorder.resume();
            console.log('[OFFSCREEN] Recorder RESUMED');
        }
    }
    return true;
});

async function startRecording(streamId, options) {
    console.log('[OFFSCREEN] startRecording() called with streamId:', streamId);
    
    try {
        // 1. Acquire Screen Stream
        const screenStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId
                }
            }
        });

        console.log('[OFFSCREEN] Screen stream acquired');

        // 2. Acquire Mic Stream if requested
        let micStream = null;
        if (options.mic) {
            try {
                console.log('[OFFSCREEN] Acquiring microphone...');
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
                console.log('[OFFSCREEN] Microphone acquired');
            } catch (e) {
                console.error('[OFFSCREEN] Mic access failed:', e);
            }
        }

        // 3. Merge Audio Tracks using AudioContext
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        let hasAudio = false;

        // Connect Screen Audio
        if (screenStream.getAudioTracks().length > 0) {
            const screenSource = audioContext.createMediaStreamSource(new MediaStream([screenStream.getAudioTracks()[0]]));
            screenSource.connect(destination);
            hasAudio = true;
            console.log('[OFFSCREEN] Screen audio connected to mixer');
        }

        // Connect Mic Audio
        if (micStream && micStream.getAudioTracks().length > 0) {
            const micSource = audioContext.createMediaStreamSource(new MediaStream([micStream.getAudioTracks()[0]]));
            micSource.connect(destination);
            hasAudio = true;
            console.log('[OFFSCREEN] Microphone audio connected to mixer');
        }

        // 4. Create Final Combined Stream
        const tracks = [...screenStream.getVideoTracks()];
        if (hasAudio) {
            tracks.push(...destination.stream.getAudioTracks());
        }
        
        stream = new MediaStream(tracks);
        
        // Store references for cleanup
        stream.originalScreenStream = screenStream;
        stream.originalMicStream = micStream;
        stream.audioContext = audioContext;

        console.log('[OFFSCREEN] Final stream created with', stream.getTracks().length, 'tracks');

        // 5. Setup Recorder
        chunks = [];
        const mimeType = 'video/webm; codecs=vp9';
        recorder = new MediaRecorder(stream, { 
            mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm' 
        });

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                chunks.push(e.data);
            }
        };

        recorder.onstop = async () => {
            console.log('[OFFSCREEN] recorder.onstop fired');
            await finalizeRecording();
        };

        // 6. Start
        recorder.start(1000);
        console.log('[OFFSCREEN] Recorder started');

        stream.getVideoTracks()[0].onended = () => {
            console.log('[OFFSCREEN] Stream ended via UI');
            stopRecording();
        };

    } catch (err) {
        console.error('[OFFSCREEN] Critical start error:', err);
        throw err;
    }
}

function stopRecording() {
    console.log('[OFFSCREEN] stopRecording() called');
    if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
    }

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        
        // Cleanup original streams and audio context
        if (stream.originalScreenStream) {
            stream.originalScreenStream.getTracks().forEach(t => t.stop());
        }
        if (stream.originalMicStream) {
            stream.originalMicStream.getTracks().forEach(t => t.stop());
        }
        if (stream.audioContext) {
            stream.audioContext.close();
        }
    }
}

async function finalizeRecording() {
    console.log('[OFFSCREEN] Finalizing recording...');
    if (chunks.length === 0) {
        console.error('[OFFSCREEN] Cannot finalize: NO CHUNKS COLLECTED');
        return;
    }

    const blob = new Blob(chunks, { type: 'video/webm' });
    console.log('[OFFSCREEN] Blob created, size:', blob.size);

    const url = URL.createObjectURL(blob);
    const filename = `recording-${Date.now()}.webm`;

    console.log('[OFFSCREEN] Requesting download via chrome.downloads...');
    
    // Using chrome.downloads for more reliability in extensions
    chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
    }, (downloadId) => {
        if (chrome.runtime.lastError) {
            console.error('[OFFSCREEN] Download failed:', chrome.runtime.lastError);
        } else {
            console.log('[OFFSCREEN] Download started, ID:', downloadId);
        }
        
        // Clean up
        setTimeout(() => {
            URL.revokeObjectURL(url);
            chunks = [];
            console.log('[OFFSCREEN] Pipeline cleaned up');
            chrome.runtime.sendMessage({ action: 'RECORDING_DOWNLOADED' });
        }, 5000);
    });
}
