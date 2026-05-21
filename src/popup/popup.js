// popup.js - PREMIUM PRODUCTION ENGINE
import { StorageService } from '../services/storageService.js';

let recorder = null;
let stream = null;
let webcamStream = null;
let chunks = [];
let timerInterval = null;

// Precise Timer State
let recordingStartTime = null;
let elapsedBeforePause = 0;

// Composition & Snapshot state
let canvas = null;
let ctx = null;
let animationId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.getElementById('app-container');
    const setupView = document.getElementById('setup-view');
    const recordingActiveView = document.getElementById('recording-active-view');
    const historyList = document.getElementById('history-list');
    
    const startRecordBtn = document.getElementById('start-record-btn');
    const stopBtnRecording = document.getElementById('stop-button-recording');
    const pauseBtn = document.getElementById('pause-button');
    const clearHistoryBtn = document.getElementById('clear-history');
    
    const micToggle = document.getElementById('mic-toggle');
    const cameraToggle = document.getElementById('camera-toggle');
    const autoDownloadToggle = document.getElementById('auto-download');
    const qualitySelect = document.getElementById('video-quality');
    const fpsSelect = document.getElementById('fps');
    
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettings = document.getElementById('close-settings');
    const settingsPanel = document.getElementById('settings-panel');
    
    const tabs = document.querySelectorAll('.pill-tab');
    const panels = document.querySelectorAll('.tab-panel');

    // Load initial data
    renderHistory();

    // --- Tab Switching ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            panels.forEach(p => p.classList.add('hidden'));
            document.getElementById(tab.dataset.view).classList.remove('hidden');
        });
    });

    // --- Settings Logic ---
    settingsBtn.addEventListener('click', () => settingsPanel.classList.remove('hidden'));
    closeSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));

    // --- Recording Core ---
    startRecordBtn.addEventListener('click', async () => {
        updateStatus('INIT CAPTURE');
        try {
            const height = parseInt(qualitySelect.value);
            const fps = parseInt(fpsSelect.value);

            // 1. Display Stream
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: { height: { ideal: height }, frameRate: { ideal: fps } },
                audio: true
            });

            stream = displayStream; 

            // 2. Audio Merging
            let finalTracks = [...displayStream.getTracks()];
            if (micToggle.checked) {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    finalTracks.push(...micStream.getAudioTracks());
                    document.getElementById('mic-status').classList.remove('hidden');
                } catch (e) { console.warn('Mic denied'); }
            }

            // 3. Optional Webcam Composition
            let recordingStream = new MediaStream(finalTracks);
            if (cameraToggle.checked) {
                try {
                    webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320 } });
                    recordingStream = startCanvasComposition(displayStream, webcamStream);
                    document.getElementById('cam-status').classList.remove('hidden');
                } catch (e) { console.warn('Webcam denied'); }
            }

            // 4. Recorder Initialization
            chunks = [];
            recorder = new MediaRecorder(recordingStream, { 
                mimeType: 'video/webm; codecs=vp9' 
            });
            
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = async () => {
                stopCanvasComposition();
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const filename = `lumina-rec-${Date.now()}.webm`;

                const finalElapsedMs = elapsedBeforePause + (recorder.state === 'inactive' ? 0 : Date.now() - recordingStartTime);
                const finalDuration = formatTime(Math.floor(finalElapsedMs / 1000));

                if (autoDownloadToggle.checked) {
                    chrome.downloads.download({ url, filename });
                }
                
                await StorageService.addHistory({
                    type: 'video',
                    url: url,
                    filename: filename,
                    duration: finalDuration
                });
                
                renderHistory();
                resetToSetup();
            };

            displayStream.getVideoTracks()[0].onended = () => stopRecording();

            // Initialize Precise Timer
            recordingStartTime = Date.now();
            elapsedBeforePause = 0;

            recorder.start(1000);
            switchToRecordingView();
            startTimer();
            updateStatus('RECORDING');

        } catch (err) {
            console.error(err);
            updateStatus('CANCELED');
        }
    });

    stopBtnRecording.addEventListener('click', () => stopRecording());

    pauseBtn.addEventListener('click', () => {
        if (!recorder) return;
        if (recorder.state === 'recording') {
            recorder.pause();
            // Accumulate active duration before this pause
            elapsedBeforePause += (Date.now() - recordingStartTime);
            
            pauseBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
            updateStatus('PAUSED');
        } else if (recorder.state === 'paused') {
            recorder.resume();
            // Reset start time to now for the new active segment
            recordingStartTime = Date.now();
            
            pauseBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
            updateStatus('RECORDING');
        }
    });

    // --- Snapshot Logic ---
    document.getElementById('cap-visible-btn').addEventListener('click', async () => {
        updateStatus('CAPTURING...');
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        const filename = `lumina-snap-${Date.now()}.png`;
        chrome.downloads.download({ url: dataUrl, filename });
        
        await StorageService.addHistory({
            type: 'image',
            url: dataUrl,
            filename: filename,
            duration: 'PNG'
        });
        
        renderHistory();
        updateStatus('SAVED');
    });

    document.getElementById('cap-full-btn').addEventListener('click', async () => {
        updateStatus('SCROLLING...');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const pageInfo = await chrome.tabs.sendMessage(tab.id, { action: "getPageInfo" });
            
            const { height, viewportHeight, devicePixelRatio } = pageInfo;
            const numChunks = Math.ceil(height / viewportHeight);
            
            const chunks_images = [];
            for (let i = 0; i < numChunks; i++) {
                const y = i * viewportHeight;
                await chrome.tabs.sendMessage(tab.id, { action: "scrollTo", y });
                await new Promise(r => setTimeout(r, 400));
                const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                chunks_images.push(dataUrl);
            }

            const finalCanvas = document.createElement('canvas');
            const fCtx = finalCanvas.getContext('2d');
            finalCanvas.width = pageInfo.width * devicePixelRatio;
            finalCanvas.height = height * devicePixelRatio;

            for (let i = 0; i < chunks_images.length; i++) {
                const img = await loadImage(chunks_images[i]);
                fCtx.drawImage(img, 0, i * viewportHeight * devicePixelRatio);
            }

            const finalDataUrl = finalCanvas.toDataURL('image/png');
            const filename = `lumina-full-${Date.now()}.png`;
            chrome.downloads.download({ url: finalDataUrl, filename });
            
            await StorageService.addHistory({
                type: 'image',
                url: finalDataUrl,
                filename: filename,
                duration: 'FULL'
            });
            
            renderHistory();
            updateStatus('FULL PAGE SAVED');
            chrome.tabs.sendMessage(tab.id, { action: "scrollTo", y: 0 });
        } catch (e) {
            console.error(e);
            updateStatus('FAILED');
        }
    });

    clearHistoryBtn.addEventListener('click', async () => {
        await StorageService.set('recording_history', []);
        renderHistory();
    });

    // --- Helpers ---
    async function renderHistory() {
        const history = await StorageService.getHistory();
        if (history.length === 0) {
            historyList.innerHTML = '<div class="empty-state-text">No items yet</div>';
            return;
        }

        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="item-thumb">
                    ${item.type === 'video' ? '🎬' : '📸'}
                </div>
                <div class="item-info">
                    <strong>${item.filename.substring(0, 15)}...</strong>
                    <span>${new Date(item.date).toLocaleTimeString()} • ${item.duration}</span>
                </div>
            </div>
        `).join('');
    }

    function stopRecording() {
        if (recorder && recorder.state !== 'inactive') {
            if (recorder.state === 'recording') {
                elapsedBeforePause += (Date.now() - recordingStartTime);
            }
            recorder.stop();
        }
        if (stream) stream.getTracks().forEach(t => t.stop());
        if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
        stopTimer();
    }

    function switchToRecordingView() {
        setupView.classList.add('hidden');
        recordingActiveView.classList.remove('hidden');
        appContainer.style.minHeight = '280px';
    }

    function resetToSetup() {
        setupView.classList.remove('hidden');
        recordingActiveView.classList.add('hidden');
        appContainer.style.minHeight = '420px';
        document.getElementById('mic-status').classList.add('hidden');
        document.getElementById('cam-status').classList.add('hidden');
        updateStatus('READY');
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            let totalMs = elapsedBeforePause;
            if (recorder && recorder.state === 'recording') {
                totalMs += (Date.now() - recordingStartTime);
            }
            const seconds = Math.floor(totalMs / 1000);
            document.getElementById('timer-display').textContent = formatTime(seconds);
        }, 1000);
    }

    function stopTimer() { if (timerInterval) clearInterval(timerInterval); }

    function formatTime(s) {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    }

    function updateStatus(txt) { document.getElementById('status-bar').textContent = txt; }

    function loadImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = url;
        });
    }

    // --- Composition Engine ---
    function startCanvasComposition(screenStream, webcamStream) {
        const c = document.getElementById('composition-canvas');
        const cx = c.getContext('2d');
        
        const vS = document.createElement('video');
        vS.srcObject = screenStream; vS.play();
        const vW = document.createElement('video');
        vW.srcObject = webcamStream; vW.play();

        const w = screenStream.getVideoTracks()[0].getSettings().width || 1280;
        const h = screenStream.getVideoTracks()[0].getSettings().height || 720;
        c.width = w; c.height = h;

        function draw() {
            cx.drawImage(vS, 0, 0, w, h);
            const b = h * 0.22;
            const x = 30; const y = h - b - 30;
            cx.save();
            cx.beginPath(); cx.arc(x + b/2, y + b/2, b/2, 0, Math.PI * 2); cx.clip();
            cx.drawImage(vW, x, y, b, b);
            cx.restore();
            cx.strokeStyle = '#625df5'; cx.lineWidth = 6; cx.stroke();
            animationId = requestAnimationFrame(draw);
        }
        draw();
        return c.captureStream(30);
    }

    function stopCanvasComposition() { if (animationId) cancelAnimationFrame(animationId); }
});
