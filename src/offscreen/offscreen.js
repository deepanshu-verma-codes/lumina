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
        // 1. Acquire Stream
        stream = await navigator.mediaDevices.getUserMedia({
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

        console.log('[OFFSCREEN] Stream acquired, tracks:', stream.getTracks().length);

        // 2. Add Mic if requested
        if (options.mic) {
            try {
                console.log('[OFFSCREEN] Adding microphone track...');
                const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                micStream.getAudioTracks().forEach(track => stream.addTrack(track));
                console.log('[OFFSCREEN] Microphone track added');
            } catch (e) {
                console.error('[OFFSCREEN] Mic access failed:', e);
            }
        }

        // 3. Setup Recorder
        chunks = [];
        const mimeType = 'video/webm; codecs=vp9';
        recorder = new MediaRecorder(stream, { 
            mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm' 
        });

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                chunks.push(e.data);
                console.log('[OFFSCREEN] Data chunk collected, size:', e.data.size, 'Total chunks:', chunks.length);
            }
        };

        recorder.onstop = async () => {
            console.log('[OFFSCREEN] recorder.onstop fired. Total chunks:', chunks.length);
            await finalizeRecording();
        };

        recorder.onerror = (e) => {
            console.error('[OFFSCREEN] MediaRecorder ERROR:', e);
        };

        // 4. Start
        recorder.start(1000); // Timeslice of 1s to ensure data available frequently
        console.log('[OFFSCREEN] recorder.start() executed, state:', recorder.state);

        // Handle stream ending (e.g. user clicks "Stop sharing")
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
        console.log('[OFFSCREEN] recorder.stop() called');
    } else {
        console.warn('[OFFSCREEN] Cannot stop, recorder is:', recorder?.state);
    }

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        console.log('[OFFSCREEN] Stream tracks stopped');
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
