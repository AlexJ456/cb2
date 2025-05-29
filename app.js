document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');
    let canvas, ctx, animationPanel; // Define canvas and context globally for access

    const PHASE_DURATION = 5.5; // 5.5 seconds for inhale, 5.5 for exhale

    const state = {
        isPlaying: false,
        count: 0, // 0 for Inhale, 1 for Exhale
        totalTime: 0, // Total elapsed time in integer seconds for display
        totalTimeSecondsPrecision: 0, // More precise total time for logic
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
        const secs = Math.floor(seconds % 60); // Use Math.floor for display
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function playTone() {
        if (state.soundEnabled && audioContext) {
            try {
                if (audioContext.state === 'suspended') {
                    audioContext.resume().then(playToneInternal); // Try to resume then play
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
        oscillator.frequency.setValueAtTime(330, audioContext.currentTime); // A slightly lower, calming tone
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
            // Make canvas responsive to its container
            const dpr = window.devicePixelRatio || 1;
            canvas.width = animationPanel.clientWidth * dpr;
            canvas.height = animationPanel.clientHeight * dpr;
            ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr); // Scale for HiDPI displays
            console.log(`Canvas setup: ${canvas.width/dpr}x${canvas.height/dpr} (scaled by ${dpr})`);
        } else {
            console.error("Canvas or animation panel not found for setup");
        }
    }


    function togglePlay() {
        initializeAudioContext(); // Ensure audio context is ready

        state.isPlaying = !state.isPlaying;
        if (state.isPlaying) {
            state.totalTime = 0;
            state.totalTimeSecondsPrecision = 0;
            state.count = 0; // Start with Inhale
            state.sessionComplete = false;
            state.timeLimitReached = false;
            state.phaseStartTime = performance.now();
            state.pulseStartTime = performance.now();
            
            render(); // Render first to create canvas if not present
            setupCanvas(); // Setup canvas after it's in DOM

            playTone();
            scheduleNextPhaseLogic();
            startTotalTimeUpdater();
            animate();
            requestWakeLock();
        } else {
            clearTimeout(state.activeTimeoutId);
            clearInterval(state.totalTimeUpdateIntervalId);
            cancelAnimationFrame(animationFrameId);
            if (ctx && canvas) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            releaseWakeLock();
            render(); // Update UI to paused state
        }
    }

    function resetToStart() {
        state.isPlaying = false;
        state.totalTime = 0;
        state.totalTimeSecondsPrecision = 0;
        state.count = 0;
        state.sessionComplete = false;
        state.timeLimit = ''; // Reset time limit
        state.timeLimitReached = false;
        state.displayedCountdown = PHASE_DURATION.toString();

        clearTimeout(state.activeTimeoutId);
        clearInterval(state.totalTimeUpdateIntervalId);
        cancelAnimationFrame(animationFrameId);
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
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
        // No need to re-render here, input field shows the value
    }

    function startWithPreset(minutes) {
        state.timeLimit = minutes.toString();
        // Ensure UI reflects the new time limit if needed, then start
        render(); // To update UI if necessary before starting
        if (!state.isPlaying) { // If paused or at start
             togglePlay(); // This will handle starting the session
        } else { // If already playing, effectively restart with new limit
            togglePlay(); // Pause current
            setTimeout(() => togglePlay(), 100); // Then restart
        }
    }
    
    function startTotalTimeUpdater() {
        clearInterval(state.totalTimeUpdateIntervalId); // Clear existing interval
        state.totalTimeUpdateIntervalId = setInterval(() => {
            if (state.isPlaying) {
                state.totalTimeSecondsPrecision += 1;
                state.totalTime = Math.floor(state.totalTimeSecondsPrecision);
                
                // Update total time display directly without full re-render
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

            state.totalTimeSecondsPrecision += (performance.now() - state.phaseStartTime) / 1000 - (PHASE_DURATION * (state.count)); // more precise accumulation
                                                                                                    // This logic might be complex; simpler to rely on 1s interval for totalTime.
                                                                                                    // The 1s interval for totalTime is primary. This timeout is for phase change.

            state.count = (state.count + 1) % 2; // 0 for Inhale, 1 for Exhale
            state.phaseStartTime = performance.now();
            state.pulseStartTime = performance.now(); // For dot pulse
            playTone();

            // Update instruction text directly
            const instructionEl = document.getElementById('instruction-text');
            if (instructionEl) {
                instructionEl.textContent = getInstruction(state.count);
            }


            if (state.timeLimit && !state.timeLimitReached) {
                const timeLimitSeconds = parseInt(state.timeLimit) * 60;
                if (state.totalTime >= timeLimitSeconds) { // Check against integer totalTime
                    state.timeLimitReached = true;
                }
            }

            if (state.timeLimitReached && state.count === 0) { // Exhale (1) just finished, next is Inhale (0)
                state.sessionComplete = true;
                state.isPlaying = false;
                cancelAnimationFrame(animationFrameId);
                releaseWakeLock();
                clearInterval(state.totalTimeUpdateIntervalId);
                render(); // Show completion screen
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
        if (!state.isPlaying || !canvas || !ctx) {
            animationFrameId = requestAnimationFrame(animate); // Keep trying if canvas not ready
            return;
        }

        const currentTime = performance.now();
        const elapsedInPhase = Math.max(0, (currentTime - state.phaseStartTime) / 1000);
        let progress = Math.min(elapsedInPhase / PHASE_DURATION, 1.0);
        progress = Math.max(0, progress); // Ensure progress is not negative

        state.displayedCountdown = getDisplayedCountdown(elapsedInPhase);
        
        // Update countdown text directly
        const countdownEl = document.getElementById('countdown-text');
        if (countdownEl && countdownEl.textContent !== state.displayedCountdown) {
            countdownEl.textContent = state.displayedCountdown;
        }

        ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio||1), canvas.height / (window.devicePixelRatio||1)); // Use scaled width/height for clearing

        const baseDotRadius = 12; // Bigger dot
        const lineWidth = 6; // Thicker line
        const lineColor = '#d97706';
        const dotColor = '#ff0000'; // Red dot

        const margin = 30; // Margin from canvas edges for the line
        const lineX = (canvas.width / (window.devicePixelRatio||1)) / 2; // Center of the unscaled canvas width
        const lineTopY = margin;
        const lineBottomY = (canvas.height / (window.devicePixelRatio||1)) - margin;

        // Draw line
        ctx.beginPath();
        ctx.moveTo(lineX, lineTopY);
        ctx.lineTo(lineX, lineBottomY);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = lineColor;
        ctx.stroke();

        // Dot position
        let dotY;
        if (state.count === 0) { // Inhale: dot moves up (bottom to top)
            dotY = lineBottomY - progress * (lineBottomY - lineTopY);
        } else { // Exhale: dot moves down (top to bottom)
            dotY = lineTopY + progress * (lineBottomY - lineTopY);
        }
        
        dotY = Math.max(lineTopY, Math.min(dotY, lineBottomY)); // Clamp dotY to line bounds

        // Dot pulse animation
        let currentDotRadius = baseDotRadius;
        if (state.pulseStartTime !== null) {
            const pulseElapsed = (currentTime - state.pulseStartTime) / 1000; // Use state.pulseStartTime
            if (pulseElapsed < 0.5) { // Pulse for 0.5s
                const pulseFactor = Math.sin(Math.PI * pulseElapsed / 0.5); // SmoothInOut pulse
                currentDotRadius = baseDotRadius + (baseDotRadius * 0.5 * pulseFactor); // Pulse up to 50% bigger
            }
        }
        
        // Draw dot
        ctx.beginPath();
        ctx.arc(lineX, dotY, currentDotRadius, 0, 2 * Math.PI);
        ctx.fillStyle = dotColor;
        ctx.fill();

        animationFrameId = requestAnimationFrame(animate);
    }

    function render() {
        let html = `<div class="app-title">Coherent Breathing</div>`;
         const offlineBanner = document.querySelector('.offline-banner');
         if (offlineBanner && !navigator.onLine) {
             offlineBanner.style.display = 'block';
             html += `<div class="offline-banner">You are offline, but the app will work normally</div>`;
         } else if (offlineBanner) {
            offlineBanner.style.display = 'none';
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
                            <div id="countdown-text" style="font-size: 4.5em; font-weight: bold; color: #fff;">${state.displayedCountdown}</div>
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

        // Add event listeners after HTML is rendered
        if (state.isPlaying) {
            document.getElementById('toggle-play').addEventListener('click', togglePlay);
            // Canvas setup is now called in togglePlay after render IF starting.
            // If canvas already exists and just re-rendering UI, no need to re-setup unless size changed.
            // For simplicity, let's ensure canvas is setup if it's expected.
            if (!canvas || !ctx) { // If canvas somehow not set up yet
                setupCanvas();
            }
        } else if (state.sessionComplete) {
            document.getElementById('reset').addEventListener('click', resetToStart);
        } else { // Start screen
            document.getElementById('toggle-play').addEventListener('click', togglePlay);
            document.getElementById('sound-toggle').addEventListener('change', toggleSound);
            const timeLimitInput = document.getElementById('time-limit');
            if (timeLimitInput) { // Ensure element exists
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
