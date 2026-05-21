// floating-toolbar.js - DYNAMIC RECORDING CONTROLLER

(function() {
    let toolbar = null;
    let timerEl = null;
    let pauseBtn = null;
    let isMinimized = false;

    console.log('[FLOATING] Content script initialized and listener active');

    // --- Safety Checks ---
    function isExtensionContextValid() {
        try {
            return !!chrome.runtime?.id;
        } catch (e) {
            return false;
        }
    }

    function safeSendMessage(payload) {
        if (!isExtensionContextValid()) {
            console.warn('[FLOATING] Extension context invalidated');
            removeToolbar();
            return;
        }

        try {
            chrome.runtime.sendMessage(payload, () => {
                if (chrome.runtime.lastError) {
                    console.warn(
                        '[FLOATING] Message failed:',
                        chrome.runtime.lastError.message
                    );
                }
            });
        } catch (err) {
            console.warn('[FLOATING] Runtime crashed:', err);
            removeToolbar();
        }
    }

    // --- Message Listener ---
    if (isExtensionContextValid()) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (!isExtensionContextValid()) {
                removeToolbar();
                return;
            }

            console.log('[FLOATING] Message received:', message.action);

            if (message.action === 'SHOW_TOOLBAR') {
                createToolbar();
                updateToolbarUI(message.state);
            } else if (message.action === 'UPDATE_TOOLBAR') {
                if (!toolbar) createToolbar();
                updateToolbarUI(message.state, message.time);
            } else if (message.action === 'HIDE_TOOLBAR') {
                removeToolbar();
            }
            
            return true;
        });
    }

    function createToolbar() {
        if (toolbar) return;

        console.log('[FLOATING] Creating toolbar DOM');
        toolbar = document.createElement('div');
        toolbar.id = 'lumina-toolbar-root';
        
        toolbar.innerHTML = `
            <div class="lumina-status">
                <div class="lumina-dot pulsing"></div>
                <span class="lumina-live-text">LIVE</span>
            </div>
            <div class="lumina-timer">00:00</div>
            <div class="lumina-actions">
                <button class="lumina-btn" id="lumina-pause-btn" title="Pause/Resume">
                    <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </button>
                <button class="lumina-btn stop" id="lumina-stop-btn" title="Stop">
                    <svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
                </button>
            </div>
            <button class="lumina-minimize" id="lumina-min-btn" title="Minimize/Expand">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
        `;

        document.body.appendChild(toolbar);

        // Forced reflow for animation
        setTimeout(() => {
            if (toolbar) toolbar.classList.add('visible');
        }, 10);

        // Elements
        timerEl = toolbar.querySelector('.lumina-timer');
        pauseBtn = toolbar.querySelector('#lumina-pause-btn');

        // Events
        toolbar.querySelector('#lumina-pause-btn').onclick = () => {
            console.log('[FLOATING] Pause/Resume clicked');
            safeSendMessage({ action: 'TOOLBAR_PAUSE_RESUME' });
        };

        toolbar.querySelector('#lumina-stop-btn').onclick = () => {
            console.log('[FLOATING] Stop clicked');
            safeSendMessage({ action: 'TOOLBAR_STOP' });
        };

        toolbar.querySelector('#lumina-min-btn').onclick = toggleMinimize;
    }

    function updateToolbarUI(state, time) {
        if (!toolbar) return;

        if (time) timerEl.textContent = time;

        if (state === 'paused') {
            pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
            toolbar.querySelector('.lumina-dot').classList.remove('pulsing');
            toolbar.querySelector('.lumina-live-text').textContent = 'PAUSED';
            toolbar.querySelector('.lumina-live-text').style.color = '#B8B8C7';
        } else {
            pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
            toolbar.querySelector('.lumina-dot').classList.add('pulsing');
            toolbar.querySelector('.lumina-live-text').textContent = 'LIVE';
            toolbar.querySelector('.lumina-live-text').style.color = '#FF4D4F';
        }
    }

    function toggleMinimize() {
        isMinimized = !isMinimized;
        const btn = toolbar.querySelector('#lumina-min-btn');
        if (isMinimized) {
            toolbar.classList.add('minimized');
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>';
        } else {
            toolbar.classList.remove('minimized');
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 15l-6-6-6 6"/></svg>';
        }
    }

    function removeToolbar() {
        if (!toolbar) return;
        toolbar.classList.remove('visible');
        
        // Immediate removal if context is invalid
        if (!isExtensionContextValid()) {
            toolbar.remove();
            cleanupVariables();
            return;
        }

        setTimeout(() => {
            if (toolbar) {
                toolbar.remove();
                cleanupVariables();
            }
        }, 500);
    }

    function cleanupVariables() {
        toolbar = null;
        timerEl = null;
        pauseBtn = null;
    }
})();
