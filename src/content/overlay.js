(function() {
    let controls = null;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "getPageInfo") {
            sendResponse({
                width: window.innerWidth,
                height: document.documentElement.scrollHeight,
                viewportHeight: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio
            });
        } else if (request.action === "scrollTo") {
            window.scrollTo(0, request.y);
            // Give it a moment to settle
            setTimeout(() => sendResponse({ success: true }), 100);
            return true;
        } else if (request.action === "showControls") {
            showControls(request.recordingState);
        } else if (request.action === "hideControls") {
            hideControls();
        } else if (request.action === "updateTimer") {
            updateTimer(request.time);
        }
    });

    function showControls(state) {
        if (!controls) createControlsOverlay();
        updateControlsUI(state);
        controls.classList.remove('lumina-hidden');
    }

    function hideControls() {
        if (controls) controls.classList.add('lumina-hidden');
    }

    function updateTimer(time) {
        if (controls) {
            const timerEl = controls.querySelector('.lumina-timer');
            if (timerEl) timerEl.textContent = time;
        }
    }

    function createControlsOverlay() {
        if (document.getElementById('lumina-overlay')) return;
        controls = document.createElement('div');
        controls.id = 'lumina-overlay';
        controls.className = 'lumina-controls-container lumina-hidden';
        
        controls.innerHTML = `
            <div class="lumina-timer">00:00</div>
            <button class="lumina-control-btn" id="lumina-pause">PAUSE</button>
            <button class="lumina-control-btn lumina-stop" id="lumina-stop">STOP</button>
        `;
        
        document.body.appendChild(controls);

        controls.querySelector('#lumina-pause').onclick = () => {
            chrome.runtime.sendMessage({ action: "pauseRecording" });
        };
        
        controls.querySelector('#lumina-stop').onclick = () => {
            chrome.runtime.sendMessage({ action: "stopRecording" });
        };
    }

    function updateControlsUI(state) {
        if (!controls) return;
        const pauseBtn = controls.querySelector('#lumina-pause');
        pauseBtn.textContent = (state === 'paused') ? 'RESUME' : 'PAUSE';
    }
})();
