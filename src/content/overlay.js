(function() {
    let container = null;
    let video = null;
    let stream = null;
    let controls = null;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "toggleWebcam") {
            toggleWebcam(request.enabled);
        } else if (request.action === "showControls") {
            showControls(request.recordingState);
        } else if (request.action === "hideControls") {
            hideControls();
        } else if (request.action === "updateTimer") {
            updateTimer(request.time);
        }
    });

    async function toggleWebcam(enabled) {
        if (enabled) {
            if (!container) {
                createWebcamOverlay();
            }
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                video.srcObject = stream;
                container.classList.remove('lumina-hidden');
            } catch (err) {
                console.error("Error accessing webcam:", err);
            }
        } else {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            if (container) {
                container.classList.add('lumina-hidden');
            }
        }
    }

    function showControls(state) {
        if (!controls) {
            createControlsOverlay();
        }
        updateControlsUI(state);
        controls.classList.remove('lumina-hidden');
    }

    function hideControls() {
        if (controls) {
            controls.classList.add('lumina-hidden');
        }
    }

    function updateTimer(time) {
        if (controls) {
            const timerEl = controls.querySelector('.lumina-timer');
            if (timerEl) timerEl.textContent = time;
        }
    }

    function createWebcamOverlay() {
        container = document.createElement('div');
        container.className = 'lumina-webcam-container lumina-hidden';
        
        video = document.createElement('video');
        video.className = 'lumina-webcam-video';
        video.autoplay = true;
        video.muted = true;
        
        container.appendChild(video);
        document.body.appendChild(container);
        makeDraggable(container);
    }

    function createControlsOverlay() {
        controls = document.createElement('div');
        controls.className = 'lumina-controls-container lumina-hidden';
        
        const logoUrl = chrome.runtime.getURL('icons/icon.png');

        controls.innerHTML = `
            <div class="lumina-brand">
                <img src="${logoUrl}" alt="Lumina" width="18" height="18">
            </div>
            <div class="lumina-timer">00:00</div>
            <button class="lumina-control-btn" id="lumina-pause">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
            </button>
            <button class="lumina-control-btn lumina-stop" id="lumina-stop">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
            </button>
        `;
        
        document.body.appendChild(controls);

        controls.querySelector('#lumina-pause').onclick = () => {
            chrome.runtime.sendMessage({ action: "pauseRecording" });
        };
        controls.querySelector('#lumina-stop').onclick = () => {
            chrome.runtime.sendMessage({ action: "stopRecording" });
        };

        makeDraggable(controls);
    }

    function updateControlsUI(state) {
        const pauseBtn = controls.querySelector('#lumina-pause');
        if (state === 'paused') {
            pauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        } else {
            pauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        }
    }

    function makeDraggable(el) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        el.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            if (e.target.closest('button')) return;
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
            el.style.bottom = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
})();
