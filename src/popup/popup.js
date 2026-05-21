import { ScreenshotService } from '../services/screenshotService.js';
import { RecordingService } from '../services/recordingService.js';
import { Timer } from '../components/timer.js';
import { StorageService } from '../services/storageService.js';

document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const screenshotBtn = document.getElementById('screenshot-button');
    const screenrecordBtn = document.getElementById('screenrecord-button');
    const pauseBtn = document.getElementById('pause-button');
    const micToggle = document.getElementById('mic-toggle');
    const cameraToggle = document.getElementById('camera-toggle');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const statusBar = document.getElementById('status-bar');
    const timerDisplay = document.getElementById('timer-display');
    const recordingControls = document.getElementById('recording-controls');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history');

    // State
    let currentMode = 'screen';

    // Initialize History
    renderHistory();

    // Listen for messages from content script/background
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "pauseRecording") {
            handlePauseToggle();
        } else if (request.action === "stopRecording") {
            stopRecording();
        }
    });

    // Mode Selection
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (RecordingService.isRecording()) return;
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.id.replace('mode-', '');
            updateStatus(`Switched to ${currentMode} mode`);
        });
    });

    // Screenshot
    screenshotBtn.addEventListener('click', async () => {
        try {
            updateStatus('Capturing screenshot...');
            const dataUrl = await ScreenshotService.captureTab();
            ScreenshotService.download(dataUrl);
            
            await StorageService.addHistory({
                type: 'screenshot',
                duration: '-'
            });
            renderHistory();
            
            updateStatus('Screenshot saved!');
        } catch (error) {
            console.error('Screenshot failed:', error);
            updateStatus('Failed to take screenshot');
        }
    });

    // Recording
    screenrecordBtn.addEventListener('click', async () => {
        if (RecordingService.isRecording()) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    pauseBtn.addEventListener('click', handlePauseToggle);

    function handlePauseToggle() {
        const state = RecordingService.getState();
        if (state === 'recording') {
            RecordingService.pauseRecording();
            updatePauseUI('paused');
            updateStatus('Recording paused');
            notifyContentScript('showControls', 'paused');
        } else if (state === 'paused') {
            RecordingService.resumeRecording();
            updatePauseUI('recording');
            updateStatus('Recording resumed');
            notifyContentScript('showControls', 'recording');
        }
    }

    function updatePauseUI(state) {
        if (state === 'paused') {
            pauseBtn.querySelector('span').textContent = 'Resume';
            pauseBtn.querySelector('svg').innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
        } else {
            pauseBtn.querySelector('span').textContent = 'Pause';
            pauseBtn.querySelector('svg').innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
        }
    }

    // Camera Toggle
    cameraToggle.addEventListener('change', async () => {
        notifyContentScript('toggleWebcam', cameraToggle.checked);
    });

    // Clear History
    clearHistoryBtn.addEventListener('click', async () => {
        await StorageService.set('recording_history', []);
        renderHistory();
        updateStatus('History cleared');
    });

    async function startRecording() {
        try {
            updateStatus('Requesting permissions...');
            const options = {
                mic: micToggle.checked
            };
            
            await RecordingService.startRecording(options);
            
            // UI Updates
            screenrecordBtn.classList.add('recording');
            screenrecordBtn.querySelector('span').textContent = 'Stop Recording';
            recordingControls.classList.remove('hidden');
            
            // Notify Content Script
            notifyContentScript('showControls', 'recording');

            // Start Timer
            Timer.start((time) => {
                timerDisplay.textContent = time;
                notifyContentScript('updateTimer', time);
            });

            updateStatus('Recording in progress...');
        } catch (error) {
            console.error('Recording failed:', error);
            updateStatus('Failed to start recording');
        }
    }

    async function stopRecording() {
        if (!RecordingService.isRecording()) return;

        const finalDuration = timerDisplay.textContent;
        RecordingService.stopRecording();
        
        // UI Updates
        screenrecordBtn.classList.remove('recording');
        screenrecordBtn.querySelector('span').textContent = 'Start Recording';
        recordingControls.classList.add('hidden');
        timerDisplay.textContent = '00:00';
        
        // Stop Timer
        Timer.stop();

        // Notify Content Script
        notifyContentScript('hideControls');

        // Save to History
        await StorageService.addHistory({
            type: 'recording',
            duration: finalDuration
        });
        renderHistory();

        updateStatus('Recording saved!');
    }

    async function renderHistory() {
        const history = await StorageService.getHistory();
        if (history.length === 0) {
            historyList.innerHTML = '<div class="empty-state">No recent captures</div>';
            return;
        }

        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-info">
                    <span class="history-type">${item.type === 'recording' ? '🎥' : '📸'}</span>
                    <span class="history-date">${new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="history-duration">${item.duration}</div>
            </div>
        `).join('');
    }

    async function notifyContentScript(action, value) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url.startsWith('http')) {
            const message = { action };
            if (action === 'toggleWebcam') message.enabled = value;
            if (action === 'showControls') message.recordingState = value;
            if (action === 'updateTimer') message.time = value;

            chrome.tabs.sendMessage(tab.id, message).catch(() => {
                console.warn('Content script not ready on this page');
            });
        }
    }

    function updateStatus(message) {
        statusBar.textContent = message;
        setTimeout(() => {
            if (statusBar.textContent === message) {
                statusBar.textContent = RecordingService.isRecording() ? 'Recording...' : 'Ready to capture';
            }
        }, 3000);
    }
});
