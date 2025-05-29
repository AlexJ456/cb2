document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');
    let canvas, ctx, animationPanel; // Define canvas and context globally for access

    const PHASE_DURATION = 5.5; // 5.5 seconds for inhale, 5.5 for exhale

    const state = {
        isPlaying: false,
        count: 0, // 0 for Inhale, 1 for Exhale
        totalTime: 0, // Total elapsed time in integer seconds
        soundEnabled: false,
        timeLimit: '', // in minutes
        sessionComplete: false,
        timeLimitReached: false,
        phaseStartTime: 0,
        displayedCountdown: PHASE_DURATION.toString(),
        pulseStartTime: null, // For dot pulse animation
        activeTimeoutId: null,
        totalTimeUpdateIntervalId: null,
    };

    let wakeLock = null;
    let audioContext = null;
    let animationFrameId;

    // Placeholder Feather icons (empty as per original)
    const icons = {
        play: ``,
        pause: ``,
        volume2: ``,
        volumeX: ``,
        rotateCcw: ``,
        clock: ``
    };
    
    function initializeAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed');
            }).catch(e => console.error('Error resuming AudioContext:', e));
        }
    }

    function getInstruction(count) {
        return count === 0 ? 'Inhale' : 'Exhale';
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60); 
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function playTone() {
        if (state.soundEnabled && audioContext) {
            try {
                if (audioContext.state === 'suspended') {
                    audioContext.resume().then(playToneInternal); 
                    return;
                }
                playToneInternal();
            } catch (e) {
                console.error('Error playing tone:', e);
            }
        }
    }

    function playToneInternal() {
         if (!audioContext) return;
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(330, audioContext.currentTime); 
        oscillator.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake lock is active');
            } catch (err) {
                console.error('Failed to acquire wake lock:', err);
            }
        } else {
            console.log('Wake Lock API not supported');
        }
    }

    function releaseWakeLock() {
        if (wakeLock !== null) {
            wakeLock.release()
                .then(() => {
                    wakeLock = null;
                    console.log('Wake lock released');
                })
                .catch(err => {
                    console.error('Failed to release wake lock:', err);
                });
        }
    }
    
    function setupCanvas() {
        canvas = document.getElementById('animation-canvas');
        animationPanel = document.querySelector('.animation-panel');
        if (canvas && animationPanel) {
            const dpr = window.devicePixelRatio || 1;
            // Ensure clientWidth/Height are positive before setting
            const panelWidth = animationPanel.clientWidth;
            const panelHeight = animationPanel.clientHeight;

            if (panelWidth > 0 && panelHeight > 0) {
                canvas.width = panelWidth * dpr;
                canvas.height = panelHeight * dpr;
                ctx = canvas.getContext('2d');
                ctx.scale(dpr, dpr); 
                console.log(`Canvas setup: ${canvas.width/dpr}x${canvas.height/dpr} (scaled by ${dpr})`);
            } else {
                 console.warn("Animation panel has zero dimensions. Canvas not set up.");
            }
        } else {
            console.error("Canvas or animation panel not found for setup");
        }
    }


    function togglePlay() {
        initializeAudioContext(); 

        state.isPlaying = !state.isPlaying;
        if (state.isPlaying) {
            state.totalTime = 0; // Reset total time
            state.count = 0; 
            state.sessionComplete = false;
            state.timeLimitReached = false;
            state.phaseStartTime = performance.now();
            state.pulseStartTime = performance.now();
            
            render(); 
            setupCanvas(); 

            playTone();
            scheduleNextPhaseLogic();
            startTotalTimeUpdater();
            animate();
            requestWakeLock();
        } else { // Pausing
            clearTimeout(state.activeTimeoutId);
            clearInterval(state.totalTimeUpdateIntervalId); // Clear total time interval
            cancelAnimationFrame(animationFrameId);
            if (ctx && canvas) { // Check if canvas context exists
                const dpr = window.devicePixelRatio || 1;
                ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            }
            releaseWakeLock();
            render(); 
        }
    }

    function resetToStart() {
        state.isPlaying = false;
        state.totalTime = 0; // Reset total time
        state.count = 0;
        state.sessionComplete = false;
        state.timeLimit = ''; 
        state.timeLimitReached = false;
        state.displayedCountdown = PHASE_DURATION.toString();

        clearTimeout(state.activeTimeoutId);
        clearInterval(state.totalTimeUpdateIntervalId); // Clear total time interval
        cancelAnimationFrame(animationFrameId);
        if (ctx && canvas) { // Check if canvas context exists
            const dpr = window.devicePixelRatio || 1;
            ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        }
        releaseWakeLock();
        render();
    }

    function toggleSound() {
        state.soundEnabled = !state.soundEnabled;
        if (state.soundEnabled) {
            initializeAudioContext();
        }
        render();
    }

    function handleTimeLimitChange(e) {
        state.timeLimit = e.target.value.replace(/[^0-9]/g, '');
    }

    function startWithPreset(minutes) {
        state.timeLimit = minutes.toString();
        render(); 
        if (!state.isPlaying) { 
             togglePlay(); 
        } else { 
            togglePlay(); 
            setTimeout(() => togglePlay(), 100); 
        }
    }
    
    function startTotalTimeUpdater() {
        clearInterval(state.totalTimeUpdateIntervalId); 
        state.totalTimeUpdateIntervalId = setInterval(() => {
            if (state.isPlaying) {
                state.totalTime += 1; // Directly increment integer totalTime
                
                const totalTimeEl = document.getElementById('total-time-value');
                if (totalTimeEl) {
                    totalTimeEl.textContent = formatTime(state.totalTime);
                }
            } else {
                clearInterval(state.totalTimeUpdateIntervalId);
            }
        }, 1000);
    }

    function scheduleNextPhaseLogic() {
        clearTimeout(state.activeTimeoutId); 
        const nextPhaseDelay = PHASE_DURATION * 1000;

        state.activeTimeoutId = setTimeout(() => {
            if (!state.isPlaying) return;

            state.count = (state.count + 1) % 2; 
            state.phaseStartTime = performance.now();
            state.pulseStartTime = performance.now(); 
            playTone();

            const instructionEl = document.getElementById('instruction-text');
            if (instructionEl) {
                instructionEl.textContent = getInstruction(state.count);
            }

            if (state.timeLimit && !state.timeLimitReached) {
                const timeLimitSeconds = parseInt(state.timeLimit) * 60;
                if (state.totalTime >= timeLimitSeconds) { 
                    state.timeLimitReached = true;
                }
            }

            if (state.timeLimitReached && state.count === 0) { 
                state.sessionComplete = true;
                state.isPlaying = false;
                cancelAnimationFrame(animationFrameId);
                releaseWakeLock();
                clearInterval(state.totalTimeUpdateIntervalId); // Clear total time interval
                render(); 
                return;
            }

            if (state.isPlaying) {
                scheduleNextPhaseLogic();
            }
        }, nextPhaseDelay);
    }

    function getDisplayedCountdown(elapsedInPhase) {
        const timeLeft = PHASE_DURATION - elapsedInPhase;
        if (timeLeft <= 0) return "1"; 
        if (timeLeft <= 1) return "1";
        if (timeLeft <= 2) return "2";
        if (timeLeft <= 3) return "3";
        if (timeLeft <= 4) return "4";
        if (timeLeft <= 5) return "5";
        return "5.5";
    }

    function animate() {
        if (!state.isPlaying || !canvas || !ctx || !animationPanel || animationPanel.clientWidth === 0) {
             // If canvas not ready or panel not sized, attempt to set it up or wait
            if (state.isPlaying && (!canvas || animationPanel.clientWidth === 0)) {
                setupCanvas(); 
            }
            animationFrameId = requestAnimationFrame(animate); 
            return;
        }

        const currentTime = performance.now();
        const elapsedInPhase = Math.max(0, (currentTime - state.phaseStartTime) / 1000);
        let progress = Math.min(elapsedInPhase / PHASE_DURATION, 1.0);
        progress = Math.max(0, progress); 

        state.displayedCountdown = getDisplayedCountdown(elapsedInPhase);
        
        const countdownEl = document.getElementById('countdown-text');
        if (countdownEl && countdownEl.textContent !== state.displayedCountdown) {
            countdownEl.textContent = state.displayedCountdown;
        }
        
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr); 

        const baseDotRadius = 12; 
        const lineWidth = 6; 
        const lineColor = '#d97706';
        const dotColor = '#ff0000'; 

        const margin = 30; 
        const unscaledCanvasWidth = canvas.width / dpr;
        const unscaledCanvasHeight = canvas.height / dpr;

        const lineX = unscaledCanvasWidth / 2; 
        const lineTopY = margin;
        const lineBottomY = unscaledCanvasHeight - margin;

        ctx.beginPath();
        ctx.moveTo(lineX, lineTopY);
        ctx.lineTo(lineX, lineBottomY);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = lineColor;
        ctx.stroke();

        let dotY;
        if (state.count === 0) { 
            dotY = lineBottomY - progress * (lineBottomY - lineTopY);
        } else { 
            dotY = lineTopY + progress * (lineBottomY - lineTopY);
        }
        
        dotY = Math.max(lineTopY, Math.min(dotY, lineBottomY)); 

        let currentDotRadius = baseDotRadius;
        if (state.pulseStartTime !== null) {
            const pulseElapsed = (currentTime - state.pulseStartTime) / 1000; 
            if (pulseElapsed < 0.5) { 
                const pulseFactor = Math.sin(Math.PI * pulseElapsed / 0.5); 
                currentDotRadius = baseDotRadius + (baseDotRadius * 0.5 * pulseFactor); 
            }
        }
        
        ctx.beginPath();
        ctx.arc(lineX, dotY, currentDotRadius, 0, 2 * Math.PI);
        ctx.fillStyle = dotColor;
        ctx.fill();

        animationFrameId = requestAnimationFrame(animate);
    }

    function render() {
        let html = `<div class="app-title">Coherent Breathing</div>`;
         const offlineBanner = document.querySelector('.offline-banner'); // This query won't work as expected here
                                                                         // because offline-banner is part of the HTML string.
                                                                         // It's better to handle this check outside or pass a flag.

         if (!navigator.onLine && document.body.querySelector('.offline-banner') === null ) { // Check if banner already exists
             // This logic for adding offline banner needs rethinking if appContainer.innerHTML is used.
             // For now, let's ensure it's part of the string conditionally.
         }
         // Simple approach for offline banner:
         if (!navigator.onLine) {
            html += `<div class="offline-banner" style="background-color: #444; color: white; text-align: center; padding: 10px; width: 100%; box-sizing: border-box;">You are offline, but the app will work normally</div>`;
         }


        if (state.isPlaying) {
            html += `
                <div class="exercise-screen-content">
                    <div class="exercise-header">
                        <span class="total-time-display">Total Time: <span id="total-time-value">${formatTime(state.totalTime)}</span></span>
                    </div>
                    <div class="exercise-main">
                        <div class="info-panel">
                            <div id="instruction-text" style="font-size: 1.8em; margin-bottom: 20px; color: #f59e0b;">${getInstruction(state.count)}</div>
                            <div id="countdown-text" style="font-size: 4.5em; font-weight: bold; color: #F08080;">${state.displayedCountdown}</div>
                        </div>
                        <div class="animation-panel">
                            <canvas id="animation-canvas"></canvas>
                        </div>
                    </div>
                    <div class="controls-footer">
                        <button id="toggle-play">
                            <svg class="feather feather-pause" viewbox="0 0 24 24">${icons.pause}</svg> Pause
                        </button>
                    </div>
                </div>
            `;
        } else if (state.sessionComplete) {
            html += `
                <div class="completion-screen-content">
                    <div class="message">Complete! Well done.</div>
                    <div class="message">Total Time: ${formatTime(state.totalTime)}</div>
                    <button id="reset">
                        <svg class="feather feather-rotate-ccw" viewbox="0 0 24 24">${icons.rotateCcw}</svg> Back to Start
                    </button>
                </div>
            `;
        } else { // Start screen
            html += `
                <div class="start-screen-content">
                    <div class="settings-group">
                         <label class="checkbox-container">
                            <input type="checkbox" id="sound-toggle" ${state.soundEnabled ? 'checked' : ''}>
                            Sound ${state.soundEnabled ? 'On' : 'Off'}
                        </label>
                    </div>
                    <div class="settings-group">
                        <label for="time-limit" class="time-input-label">Session Length (minutes, optional):</label>
                        <input type="text" id="time-limit" inputmode="numeric" pattern="[0-9]*" value="${state.timeLimit}" placeholder="e.g., 5">
                    </div>
                    <p style="font-size:0.9em; color: #a16207;">Inhale for 5.5s, Exhale for 5.5s.</p>
                    <button id="toggle-play">
                        <svg class="feather feather-play" viewbox="0 0 24 24">${icons.play}</svg> Start
                    </button>
                    <div class="preset-buttons">
                        <button id="preset-2min">
                            <svg class="feather feather-clock" viewbox="0 0 24 24">${icons.clock}</svg> 2 min
                        </button>
                        <button id="preset-5min">
                            <svg class="feather feather-clock" viewbox="0 0 24 24">${icons.clock}</svg> 5 min
                        </button>
                        <button id="preset-10min">
                            <svg class="feather feather-clock" viewbox="0 0 24 24">${icons.clock}</svg> 10 min
                        </button>
                    </div>
                </div>
            `;
        }
        appContainer.innerHTML = html;

        if (state.isPlaying) {
            document.getElementById('toggle-play').addEventListener('click', togglePlay);
            // Attempt to setup canvas if it's not ready, crucial after innerHTML rewrite
             if (!canvas || !ctx || animationPanel.clientWidth === 0) {
                setupCanvas();
            }
        } else if (state.sessionComplete) {
            document.getElementById('reset').addEventListener('click', resetToStart);
        } else { 
            document.getElementById('toggle-play').addEventListener('click', togglePlay);
            document.getElementById('sound-toggle').addEventListener('change', toggleSound);
            const timeLimitInput = document.getElementById('time-limit');
            if (timeLimitInput) { 
                timeLimitInput.addEventListener('input', handleTimeLimitChange);
            }
            document.getElementById('preset-2min').addEventListener('click', () => startWithPreset(2));
            document.getElementById('preset-5min').addEventListener('click', () => startWithPreset(5));
            document.getElementById('preset-10min').addEventListener('click', () => startWithPreset(10));
        }
    }
    
    // Initial render
    render();
});
