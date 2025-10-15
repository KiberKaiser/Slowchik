document.addEventListener('DOMContentLoaded', function() {
    function createShaderBackground() {
        const mainSection = document.querySelector('.main-section');
        if (!mainSection) return;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '0';
        canvas.style.pointerEvents = 'none';
        
        mainSection.style.position = 'relative';
        mainSection.insertBefore(canvas, mainSection.firstChild);
        
        let animationRunning = true;
        let animationId = null;
        
        function resizeCanvas() {
            const scale = 0.26; 
            canvas.width = mainSection.offsetWidth * scale;
            canvas.height = mainSection.offsetHeight * scale;
            canvas.style.width = mainSection.offsetWidth + 'px';
            canvas.style.height = mainSection.offsetHeight + 'px';
        }
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        let lastTime = 0;
        const targetFPS = 70; 
        const frameInterval = 1000 / targetFPS;
        
        function animate(currentTime) {
            if (!animationRunning) return;
            
            if (currentTime - lastTime < frameInterval) {
                animationId = requestAnimationFrame(animate);
                return;
            }
            lastTime = currentTime;
            
            const time = performance.now() * 0.0005;
            const width = canvas.width;
            const height = canvas.height;
            
            const step = 1;
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            const iResolution = { x: width, y: height };
            const minRes = Math.min(iResolution.x, iResolution.y);
            
            for (let x = 0; x < width; x += step) {
                for (let y = 0; y < height; y += step) {
                    let uv = {
                        x: (2.0 * x - iResolution.x) / minRes,
                        y: (2.0 * (height - y) - iResolution.y) / minRes
                    };
                    
                    for (let i = 1.0; i < 5.0; i++) {
                        uv.x += 0.6 / i * Math.cos(i * 2.5 * uv.y + time);
                        uv.y += 0.6 / i * Math.cos(i * 1.5 * uv.x + time);
                    }
                    
                    const sinValue = Math.abs(Math.sin(time - uv.y - uv.x));
                    const colorValue = sinValue > 0 ? 0.1 / sinValue : 0;
                    
                    const intensity = Math.min(1, Math.max(0, colorValue));
                    const r = intensity * 29;
                    const g = intensity * 3;
                    const b = intensity * 156;
                    
                    for (let dx = 0; dx < step && x + dx < width; dx++) {
                        for (let dy = 0; dy < step && y + dy < height; dy++) {
                            const index = ((y + dy) * width + (x + dx)) * 4;
                            data[index] = r;
                            data[index + 1] = g;
                            data[index + 2] = b;
                            data[index + 3] = 255;
                        }
                    }
                }
            }
            
            ctx.putImageData(imageData, 0, 0);
            animationId = requestAnimationFrame(animate);
        }
        
        window.stopBackgroundAnimation = function() {
            animationRunning = false;
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        };
        
        window.startBackgroundAnimation = function() {
            if (!animationRunning) {
                animationRunning = true;
                animate(0);
            }
        };
        
        animate(0);
    }
    
    createShaderBackground();

    let audioContext;
    let analyser;
    let isPlaying = false;
    let currentAudio = null;
    let gainNode;
    let bassFilter;
    let convolverNode;
    let delayNode;
    let delayGain;
    let chorusNode;
    let chorusGain;
    let chorusDelays = [];
    let chorusOscillators = [];
    let chorusModGains = [];

    const sliders = {
        speed: {
            slider: document.getElementById('speed'),
            value: document.getElementById('speed-value'),
            suffix: 'x'
        },
        reverb: {
            slider: document.getElementById('reverb'),
            value: document.getElementById('reverb-value'),
            suffix: '%'
        },
        pitch: {
            slider: document.getElementById('pitch'),
            value: document.getElementById('pitch-value'),
            suffix: ''
        },
        bass: {
            slider: document.getElementById('bass'),
            value: document.getElementById('bass-value'),
            suffix: ' dB'
        },
        delay: {
            slider: document.getElementById('delay'),
            value: document.getElementById('delay-value'),
            suffix: '%'
        },
        chorus: {
            slider: document.getElementById('chorus'),
            value: document.getElementById('chorus-value'),
            suffix: '%'
        }
    };

    const audioFile = document.getElementById('audioFile');
    const dragDropZone = document.getElementById('dragDropZone');
    const dragOverlay = document.getElementById('dragOverlay');
    const fileInfo = document.getElementById('fileInfo');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const progressBar = document.getElementById('progressBar');
    const currentTimeSpan = document.getElementById('currentTime');
    const totalTimeSpan = document.getElementById('totalTime');
    const volumeSlider = document.getElementById('volumeSlider');
    const visualizer = document.getElementById('visualizer');
    const ctx = visualizer.getContext('2d');
    const resetButton = document.getElementById('reset');
    const downloadBtn = document.getElementById('downloadBtn');
    const clearBtn = document.getElementById('clearBtn');

    const rewindBtn = document.getElementById('rewindBtn');
    const forwardBtn = document.getElementById('forwardBtn');
    const loopBtn = document.getElementById('loopBtn');
    const muteBtn = document.getElementById('muteBtn');

    let visualizerStarted = false;
    let originalDuration = 0;
    let isLooping = false;
    let isMuted = false;
    let originalVolume = 50;

    function updateEffectiveDurationDisplay() {
        if (!currentAudio || !originalDuration) return;
        const effectiveRate = currentAudio.playbackRate || 1;
        const effectiveDuration = originalDuration / effectiveRate; 
        totalTimeSpan.textContent = formatTime(effectiveDuration);

        progressBar.max = effectiveDuration;
    }

    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function createReverbImpulse(duration, decay, context = audioContext) {
        const sampleRate = context.sampleRate;
        const length = sampleRate * duration;
        const impulse = context.createBuffer(2, length, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const n = length - i;
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
            }
        }
        return impulse;
    }

    function setupAudioEffects() {
        if (!audioContext || !currentAudio) return;

        const source = audioContext.createMediaElementSource(currentAudio);
        
        bassFilter = audioContext.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 200;
        bassFilter.gain.value = 0;

        convolverNode = audioContext.createConvolver();
        convolverNode.buffer = createReverbImpulse(2, 2);

        delayNode = audioContext.createDelay(1); 
        delayNode.delayTime.value = 0.3;
        delayGain = audioContext.createGain();
        delayGain.gain.value = 0; 

        chorusNode = audioContext.createGain(); 
        chorusGain = audioContext.createGain();
        chorusGain.gain.value = 0;

        chorusDelays = [];
        chorusOscillators = [];
        chorusModGains = [];
        
        const chorusParams = [
            { delay: 0.015, rate: 0.3, depth: 0.003 },
            { delay: 0.025, rate: 0.7, depth: 0.004 },
            { delay: 0.035, rate: 1.1, depth: 0.002 }
        ];
        
        chorusParams.forEach((params, index) => {
            const delayNode = audioContext.createDelay(0.05);
            delayNode.delayTime.value = params.delay;
            
            const oscillator = audioContext.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.value = params.rate;
            
            const modGain = audioContext.createGain();
            modGain.gain.value = params.depth;
            
            oscillator.connect(modGain);
            modGain.connect(delayNode.delayTime);
            oscillator.start();
            
            chorusDelays.push(delayNode);
            chorusOscillators.push(oscillator);
            chorusModGains.push(modGain);
        });

        const dryGain = audioContext.createGain();
        const wetGain = audioContext.createGain();
        dryGain.gain.value = 1;
        wetGain.gain.value = 0;

        gainNode = audioContext.createGain();
        gainNode.gain.value = 1;

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        source.connect(bassFilter);
        
        bassFilter.connect(dryGain);
        bassFilter.connect(convolverNode);
        bassFilter.connect(delayNode);
        
        chorusDelays.forEach(delayNode => {
            bassFilter.connect(delayNode);
            delayNode.connect(chorusNode);
        });
        
        convolverNode.connect(wetGain);
        delayNode.connect(delayGain);
        chorusNode.connect(chorusGain);
        
        dryGain.connect(gainNode);
        wetGain.connect(gainNode);
        delayGain.connect(gainNode);
        chorusGain.connect(gainNode);
        
        gainNode.connect(analyser);
        analyser.connect(audioContext.destination);

        currentAudio.dryGain = dryGain;
        currentAudio.wetGain = wetGain;
        currentAudio.delayGain = delayGain;
        currentAudio.chorusGain = chorusGain;
    }

    function applySpeedAndPitch() {
        if (!currentAudio) return;
        
        const speedValue = parseFloat(sliders.speed.slider.value);
        const pitchValue = parseInt(sliders.pitch.slider.value);
        const pitchFactor = Math.pow(2, pitchValue / 12);
        
        currentAudio.preservesPitch = false;
        currentAudio.playbackRate = speedValue * pitchFactor;
    }
    
    function applyPitchShift(semitones) {
        if (!currentAudio) return;
        applySpeedAndPitch();
    }

    async function downloadProcessedAudio() {
        if (!currentAudio || !audioContext) {
            alert('Please load an audio file first');
            return;
        }

        try {
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<span class="download-icon"></span>Processing...';
            const response = await fetch(currentAudio.src);
            const arrayBuffer = await response.arrayBuffer();
            const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

       
            const speedValue = parseFloat(sliders.speed.slider.value);
            const pitchValue = parseInt(sliders.pitch.slider.value);
            const pitchFactor = Math.pow(2, pitchValue / 12);
            const effectiveRate = speedValue * pitchFactor || 1;

            const baseDuration = decodedBuffer.duration / effectiveRate; 


            const reverbAmount = parseFloat(sliders.reverb.slider.value) / 100;
            const reverbTail = reverbAmount > 0 ? 2 : 0; 
            const targetDuration = baseDuration + reverbTail;

            const sampleRate = audioContext.sampleRate;
            const totalFrames = Math.ceil(sampleRate * targetDuration);
            const offlineContext = new OfflineAudioContext(2, totalFrames, sampleRate);

            const source = offlineContext.createBufferSource();
            source.buffer = decodedBuffer;
            source.playbackRate.value = effectiveRate;

            const bassFilterNode = offlineContext.createBiquadFilter();
            bassFilterNode.type = 'lowshelf';
            bassFilterNode.frequency.value = 200;
            bassFilterNode.gain.value = parseFloat(sliders.bass.slider.value);

            const convolverNode = offlineContext.createConvolver();
            convolverNode.buffer = createReverbImpulse(2, 2, offlineContext);

            const delayNodeOffline = offlineContext.createDelay(1);
            delayNodeOffline.delayTime.value = 0.3;
            const delayGainOffline = offlineContext.createGain();
            delayGainOffline.gain.value = parseFloat(sliders.delay.slider.value) / 100;

            const chorusNodeOffline = offlineContext.createDelay(0.05);
            chorusNodeOffline.delayTime.value = 0.02;
            const chorusGainOffline = offlineContext.createGain();
            chorusGainOffline.gain.value = parseFloat(sliders.chorus.slider.value) / 100;

            const chorusOscOffline = offlineContext.createOscillator();
            chorusOscOffline.type = 'sine';
            chorusOscOffline.frequency.value = 0.5;
            
            const chorusModGainOffline = offlineContext.createGain();
            chorusModGainOffline.gain.value = 0.005;
            
            chorusOscOffline.connect(chorusModGainOffline);
            chorusModGainOffline.connect(chorusNodeOffline.delayTime);

            const dryGain = offlineContext.createGain();
            const wetGain = offlineContext.createGain();
            dryGain.gain.value = 1 - reverbAmount * 0.5;
            wetGain.gain.value = reverbAmount;

            source.connect(bassFilterNode);
            bassFilterNode.connect(dryGain);
            bassFilterNode.connect(convolverNode);
            bassFilterNode.connect(delayNodeOffline);
            bassFilterNode.connect(chorusNodeOffline);
            convolverNode.connect(wetGain);
            delayNodeOffline.connect(delayGainOffline);
            chorusNodeOffline.connect(chorusGainOffline);
            dryGain.connect(offlineContext.destination);
            wetGain.connect(offlineContext.destination);
            delayGainOffline.connect(offlineContext.destination);
            chorusGainOffline.connect(offlineContext.destination);

            source.start(0);
            chorusOscOffline.start(0);

            const renderedBuffer = await offlineContext.startRendering();

            let finalBuffer = renderedBuffer;
            if (reverbTail === 0) {
                const expectedFrames = Math.ceil(sampleRate * baseDuration);
                if (renderedBuffer.length > expectedFrames) {
                    finalBuffer = offlineContext.createBuffer(2, expectedFrames, sampleRate);
                    for (let ch = 0; ch < 2; ch++) {
                        finalBuffer.getChannelData(ch).set(renderedBuffer.getChannelData(ch).subarray(0, expectedFrames));
                    }
                }
            }

            let audioBlob;
            let fileName;
            
            if (typeof lamejs !== 'undefined') {
                audioBlob = audioBufferToMp3(finalBuffer);
                fileName = 'processed_audio.mp3';
            } else {
                console.warn('MP3 encoder not available, using WAV format');
                audioBlob = audioBufferToWav(finalBuffer);
                fileName = 'processed_audio.wav';
            }
            
            const url = URL.createObjectURL(audioBlob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error processing audio:', error);
            alert('Error processing audio. Please try again.');
        } finally {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<span class="download-icon"></span>Download';
        }
    }

    function createReverbImpulse(duration, decay, context = audioContext) {
        const sampleRate = context.sampleRate;
        const length = sampleRate * duration;
        const impulse = context.createBuffer(2, length, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const n = length - i;
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
            }
        }
        return impulse;
    }

    function audioBufferToMp3(buffer) {
        const channels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const samples = buffer.length;

    
        const left = buffer.getChannelData(0);
        const right = channels > 1 ? buffer.getChannelData(1) : left;
        
    
        const leftSamples = new Int16Array(samples);
        const rightSamples = new Int16Array(samples);
        
        for (let i = 0; i < samples; i++) {
            leftSamples[i] = Math.max(-32768, Math.min(32767, left[i] * 32767));
            rightSamples[i] = Math.max(-32768, Math.min(32767, right[i] * 32767));
        }

      
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128); 
        const mp3Data = [];

        
        const chunkSize = 1152; 
        for (let i = 0; i < samples; i += chunkSize) {
            const leftChunk = leftSamples.subarray(i, i + chunkSize);
            const rightChunk = rightSamples.subarray(i, i + chunkSize);
            
            const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

      
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

    
        return new Blob(mp3Data, { type: 'audio/mp3' });
    }

    function audioBufferToWav(buffer) {
        const length = buffer.length;
        const numberOfChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
        const view = new DataView(arrayBuffer);

        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * numberOfChannels * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numberOfChannels * 2, true);
        view.setUint16(32, numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * numberOfChannels * 2, true);

        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
                view.setInt16(offset, sample * 0x7FFF, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    function updateValue(sliderName, value) {
        const config = sliders[sliderName];
        
        if (sliderName === 'speed') {
            config.value.textContent = parseFloat(value).toFixed(2) + config.suffix;
        } else if (sliderName === 'pitch') {
            const pitchValue = parseFloat(value);
            config.value.textContent = (pitchValue > 0 ? '+' : '') + pitchValue.toFixed(2) + config.suffix;
        } else {
            config.value.textContent = value + config.suffix;
        }
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function drawVisualizer() {
        requestAnimationFrame(drawVisualizer);

        let bufferLength;
        let freqData;
        if (analyser) {
            bufferLength = analyser.frequencyBinCount;
            freqData = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(freqData);
        } else {
            bufferLength = 64;
            freqData = new Uint8Array(bufferLength);
            const t = performance.now() * 0.002;
            for (let i = 0; i < bufferLength; i++) {
                const n = i / bufferLength;
                const base = (Math.sin(t + n * 6) + 1) * 0.5; 
                const mod = (Math.sin(t * 0.3 + n * 20) + 1) * 0.5;
                const val = base * 0.7 + mod * 0.3 + Math.random() * 0.15;
                freqData[i] = Math.min(255, val * 255);
            }
        }

        ctx.fillStyle = 'rgb(26, 26, 26)';
        ctx.fillRect(0, 0, visualizer.width, visualizer.height);

        const barWidth = (visualizer.width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (freqData[i] / 255) * visualizer.height * 0.8;
            const r = barHeight + 25 * (i / bufferLength);
            const g = 250 * (i / bufferLength);
            const b = 50;
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    function ensureVisualizerRunning() {
        if (visualizerStarted) return;
        visualizerStarted = true;
        const placeholder = document.querySelector('.visualizer-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        drawVisualizer();
    }

    function handleFile(file) {
        if (file && file.type.startsWith('audio/')) {
            fileInfo.textContent = `Loading: ${file.name} (${formatFileSize(file.size)})...`;
            
            initAudioContext();
            const url = URL.createObjectURL(file);
            loadAudioFile(url, file.name, file.size);
        } else {
            alert('Please select a valid audio file (MP3, WAV, OGG, M4A, FLAC)');
        }
    }

    dragDropZone.addEventListener('click', () => {
        audioFile.click();
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dragDropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dragDropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dragDropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dragDropZone.classList.add('drag-over');
        dragOverlay.classList.add('show');
    }

    function unhighlight(e) {
        dragDropZone.classList.remove('drag-over');
        dragOverlay.classList.remove('show');
    }

    dragDropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            const file = files[0];
            handleFile(file);
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            audioFile.files = dataTransfer.files;
        }
    }

    audioFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            handleFile(file);
        }
    });

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function loadAudioFile(url, fileName, fileSize) {
        const sizeText = fileSize ? ` (${formatFileSize(fileSize)})` : '';
        fileInfo.textContent = `Loaded: ${fileName}${sizeText}`;
        
        dragDropZone.classList.add('file-loaded');
        setTimeout(() => {
            dragDropZone.classList.remove('file-loaded');
        }, 600);
        
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        currentAudio = new Audio(url);
        currentAudio.addEventListener('loadedmetadata', function() {
            originalDuration = currentAudio.duration; 
            totalTimeSpan.textContent = formatTime(originalDuration);
            playPauseBtn.disabled = false;
            progressBar.disabled = false;
            progressBar.max = originalDuration;
            downloadBtn.disabled = false;
            clearBtn.disabled = false;
            
            rewindBtn.disabled = false;
            forwardBtn.disabled = false;
            
            setupAudioEffects();
        });

        currentAudio.addEventListener('timeupdate', function() {
            if (!isPlaying) return;
            
            const effectiveRate = currentAudio.playbackRate || 1;
            const effectiveCurrentTime = currentAudio.currentTime / effectiveRate;
            const effectiveDuration = originalDuration / effectiveRate;
            
            currentTimeSpan.textContent = formatTime(effectiveCurrentTime);
            progressBar.value = effectiveCurrentTime;
            progressBar.max = effectiveDuration;

            updateEffectiveDurationDisplay();
        });

        currentAudio.addEventListener('ended', function() {
            isPlaying = false;
            const playIcon = playPauseBtn.querySelector('.play-icon');
            playIcon.className = 'play-icon play';
        });

        ensureVisualizerRunning();
    }

    playPauseBtn.addEventListener('click', function() {
        if (!currentAudio) return;

        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const playIcon = this.querySelector('.play-icon');

        if (isPlaying) {
            currentAudio.pause();
            isPlaying = false;
            playIcon.className = 'play-icon play';
        } else {
            currentAudio.play();
            isPlaying = true;
            playIcon.className = 'play-icon pause';
        }
    });

    progressBar.addEventListener('input', function() {
        if (currentAudio) {
            const effectiveRate = currentAudio.playbackRate || 1;
            const realTime = this.value * effectiveRate;
            currentAudio.currentTime = realTime;
        }
    });

    volumeSlider.addEventListener('input', function() {
        if (currentAudio) {
            currentAudio.volume = this.value / 100;
        }
    });

    Object.keys(sliders).forEach(sliderName => {
        const config = sliders[sliderName];
        
        updateValue(sliderName, config.slider.value);
        
        config.slider.addEventListener('input', function() {
            updateValue(sliderName, this.value);
            
            if (currentAudio) {
                if (sliderName === 'speed') {
                    applySpeedAndPitch();
                    updateEffectiveDurationDisplay();
                }
                else if (sliderName === 'reverb' && currentAudio.wetGain && currentAudio.dryGain) {
                    const reverbAmount = parseFloat(this.value) / 100;
                    currentAudio.wetGain.gain.value = reverbAmount;
                    currentAudio.dryGain.gain.value = 1 - reverbAmount * 0.5;
                }
                else if (sliderName === 'pitch') {
                    applyPitchShift(parseInt(this.value));
                    updateEffectiveDurationDisplay();
                }
                else if (sliderName === 'bass' && bassFilter) {
                    bassFilter.gain.value = parseFloat(this.value);
                }
                else if (sliderName === 'delay' && currentAudio.delayGain) {
                    const delayAmount = parseFloat(this.value) / 100;
                    currentAudio.delayGain.gain.value = delayAmount;
                }
                else if (sliderName === 'chorus' && currentAudio.chorusGain) {
                    const chorusAmount = parseFloat(this.value) / 100;
                    currentAudio.chorusGain.gain.value = chorusAmount;
                }
            }
        });
    });

    function resetAllSettings() {
        const defaultValues = {
            speed: 1,
            reverb: 0,
            pitch: 0,
            bass: 0,
            delay: 0,
            chorus: 0
        };

        Object.keys(sliders).forEach(sliderName => {
            const config = sliders[sliderName];
            config.slider.value = defaultValues[sliderName];
            updateValue(sliderName, defaultValues[sliderName]);
        });

        if (currentAudio) {
            currentAudio.playbackRate = 1;
            currentAudio.preservesPitch = false;
            
            if (currentAudio.wetGain && currentAudio.dryGain) {
                currentAudio.wetGain.gain.value = 0;
                currentAudio.dryGain.gain.value = 1;
            }
            
            if (currentAudio.delayGain) {
                currentAudio.delayGain.gain.value = 0;
            }
            
            if (currentAudio.chorusGain) {
                currentAudio.chorusGain.gain.value = 0;
            }
            
            if (bassFilter) {
                bassFilter.gain.value = 0;
            }
            updateEffectiveDurationDisplay();
        }
    }

    resetButton.addEventListener('click', resetAllSettings);
    downloadBtn.addEventListener('click', downloadProcessedAudio);
    clearBtn.addEventListener('click', clearAudio);

    rewindBtn.addEventListener('click', rewindTrack);
    forwardBtn.addEventListener('click', forwardTrack);
    loopBtn.addEventListener('click', toggleLoop);
    muteBtn.addEventListener('click', toggleMute);

    function clearAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        
        fileInfo.textContent = 'No file selected';
        playPauseBtn.disabled = true;
        progressBar.disabled = true;
        progressBar.value = 0;
        downloadBtn.disabled = true;
        clearBtn.disabled = true;
        
        rewindBtn.disabled = true;
        forwardBtn.disabled = true;

        isLooping = false;
        isMuted = false;
        loopBtn.classList.remove('active');
        muteBtn.classList.remove('active');
        
        currentTimeSpan.textContent = '0:00';
        totalTimeSpan.textContent = '0:00';
        
        audioFile.value = '';
        
        const playIcon = playPauseBtn.querySelector('.play-icon');
        playIcon.className = 'play-icon play';
        isPlaying = false;
        
        ctx.clearRect(0, 0, visualizer.width, visualizer.height);
        
        dragDropZone.classList.remove('file-loaded');
        
        const placeholder = document.querySelector('.visualizer-placeholder');
        if (placeholder) {
            placeholder.style.display = 'flex';
        }
        
        console.log('Audio cleared');
    }

    function rewindTrack() {
        if (!currentAudio) return;
        const newTime = Math.max(0, currentAudio.currentTime - 10);
        currentAudio.currentTime = newTime;
        console.log('Rewound 10 seconds');
    }
    
    function forwardTrack() {
        if (!currentAudio) return;
        const newTime = Math.min(currentAudio.duration, currentAudio.currentTime + 10);
        currentAudio.currentTime = newTime;
        console.log('Forwarded 10 seconds');
    }
    
    function toggleLoop() {
        isLooping = !isLooping;
        if (currentAudio) {
            currentAudio.loop = isLooping;
        }
        loopBtn.classList.toggle('active', isLooping);
        console.log('Loop:', isLooping ? 'enabled' : 'disabled');
    }
    
    function toggleMute() {
        isMuted = !isMuted;
        if (isMuted) {
            originalVolume = volumeSlider.value;
            volumeSlider.value = 0;
            if (currentAudio) currentAudio.volume = 0;
        } else {
            volumeSlider.value = originalVolume;
            if (currentAudio) currentAudio.volume = originalVolume / 100;
        }
        muteBtn.classList.toggle('active', isMuted);
        console.log('Mute:', isMuted ? 'enabled' : 'disabled');
    }

    document.getElementById('slowedReverbBtn').addEventListener('click', function() {
        sliders.speed.slider.value = 0.85;
        sliders.pitch.slider.value = -1.5;
        sliders.reverb.slider.value = 80;
        
        updateValue('speed', 0.85);
        updateValue('pitch', -1.5);
        updateValue('reverb', 80);
        
        if (currentAudio) {
            const speedValue = 0.85;
            const pitchValue = -1.5;
            const pitchFactor = Math.pow(2, pitchValue / 12);
            currentAudio.preservesPitch = false;
            currentAudio.playbackRate = speedValue * pitchFactor;
            
            if (currentAudio.wetGain && currentAudio.dryGain) {
                currentAudio.wetGain.gain.value = 0.8;
                currentAudio.dryGain.gain.value = 1 - 0.8 * 0.5;
            }
            
            updateEffectiveDurationDisplay();
        }
    });

    document.getElementById('nightcoreBtn').addEventListener('click', function() {
        sliders.speed.slider.value = 1.15;
        sliders.pitch.slider.value = 1.5;
        sliders.reverb.slider.value = 0;
        
        updateValue('speed', 1.15);
        updateValue('pitch', 1.5);
        updateValue('reverb', 0);
        
        if (currentAudio) {
            const speedValue = 1.15;
            const pitchValue = 1.5;
            const pitchFactor = Math.pow(2, pitchValue / 12);
            currentAudio.preservesPitch = false;
            currentAudio.playbackRate = speedValue * pitchFactor;
            
            if (currentAudio.wetGain && currentAudio.dryGain) {
                currentAudio.wetGain.gain.value = 0;
                currentAudio.dryGain.gain.value = 1;
            }
            
            updateEffectiveDurationDisplay();
        }
    });

    const scrollArrow = document.querySelector('.scroll-arrow');
    if (scrollArrow) {
        scrollArrow.addEventListener('click', () => {
            document.querySelector('.app-section').scrollIntoView({
                behavior: 'smooth'
            });
        });
    }

    const observerOptions = {
        threshold: 1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    }, observerOptions);

    const backgroundObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (window.startBackgroundAnimation) {
                    window.startBackgroundAnimation();
                }
            } else {
                if (window.stopBackgroundAnimation) {
                    window.stopBackgroundAnimation();
                }
            }
        });
    }, {
        threshold: 0.1
    });

    const animatedElements = document.querySelectorAll('.settings-container, .audio-container');
    animatedElements.forEach(el => observer.observe(el));
    const mainSection = document.querySelector('.main-section');
    if (mainSection) {
        backgroundObserver.observe(mainSection);
    }
});