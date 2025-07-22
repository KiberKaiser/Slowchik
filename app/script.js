document.addEventListener('DOMContentLoaded', function() {
    let audioContext;
    let audioSource;
    let analyser;
    let dataArray;
    let isPlaying = false;
    let currentAudio = null;
    
    let gainNode;
    let bassFilter;
    let convolverNode;
    let pitchShiftNode;

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
        }
    };

    const uploadBtn = document.getElementById('uploadBtn');
    const audioFile = document.getElementById('audioFile');
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

    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function createReverbImpulse(duration, decay) {
        const sampleRate = audioContext.sampleRate;
        const length = sampleRate * duration;
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        
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
        convolverNode.connect(wetGain);
        
        dryGain.connect(gainNode);
        wetGain.connect(gainNode);
        
        gainNode.connect(analyser);
        analyser.connect(audioContext.destination);

        currentAudio.dryGain = dryGain;
        currentAudio.wetGain = wetGain;
    }

    function applyPitchShift(semitones) {
        if (!currentAudio) return;
        
        const pitchFactor = Math.pow(2, semitones / 12);
        currentAudio.preservesPitch = false;
        currentAudio.playbackRate = currentAudio.playbackRate || 1;
        
        const speedSliderValue = parseFloat(sliders.speed.slider.value);
        currentAudio.playbackRate = speedSliderValue * pitchFactor;
    }

    async function downloadProcessedAudio() {
        if (!currentAudio || !audioContext) {
            alert('Please load an audio file first');
            return;
        }

        try {
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<span class="download-icon"></span>Processing...';

            // Create offline context for rendering
            const offlineContext = new OfflineAudioContext(
                2, // stereo
                audioContext.sampleRate * currentAudio.duration,
                audioContext.sampleRate
            );

            // Create audio buffer from current audio
            const response = await fetch(currentAudio.src);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await offlineContext.decodeAudioData(arrayBuffer);

            // Create source and apply effects
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;

            // Apply speed/pitch effects
            const speedValue = parseFloat(sliders.speed.slider.value);
            const pitchValue = parseInt(sliders.pitch.slider.value);
            const pitchFactor = Math.pow(2, pitchValue / 12);
            source.playbackRate.value = speedValue * pitchFactor;

            // Create bass filter
            const bassFilter = offlineContext.createBiquadFilter();
            bassFilter.type = 'lowshelf';
            bassFilter.frequency.value = 200;
            bassFilter.gain.value = parseFloat(sliders.bass.slider.value);

            // Create reverb
            const convolverNode = offlineContext.createConvolver();
            convolverNode.buffer = createReverbImpulse(2, 2, offlineContext);

            const dryGain = offlineContext.createGain();
            const wetGain = offlineContext.createGain();
            const reverbAmount = parseFloat(sliders.reverb.slider.value) / 100;
            dryGain.gain.value = 1 - reverbAmount * 0.5;
            wetGain.gain.value = reverbAmount;

            // Connect audio graph
            source.connect(bassFilter);
            bassFilter.connect(dryGain);
            bassFilter.connect(convolverNode);
            convolverNode.connect(wetGain);
            
            dryGain.connect(offlineContext.destination);
            wetGain.connect(offlineContext.destination);

            // Start rendering
            source.start(0);
            const renderedBuffer = await offlineContext.startRendering();

            // Convert to MP3 and download
            let audioBlob;
            let fileName;
            
            if (typeof lamejs !== 'undefined') {
                audioBlob = audioBufferToMp3(renderedBuffer);
                fileName = 'processed_audio.mp3';
            } else {
                console.warn('MP3 encoder not available, using WAV format');
                audioBlob = audioBufferToWav(renderedBuffer);
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

        // Convert AudioBuffer to interleaved PCM data
        const left = buffer.getChannelData(0);
        const right = channels > 1 ? buffer.getChannelData(1) : left;
        
        // Convert float samples to 16-bit PCM
        const leftSamples = new Int16Array(samples);
        const rightSamples = new Int16Array(samples);
        
        for (let i = 0; i < samples; i++) {
            leftSamples[i] = Math.max(-32768, Math.min(32767, left[i] * 32767));
            rightSamples[i] = Math.max(-32768, Math.min(32767, right[i] * 32767));
        }

        // Initialize MP3 encoder
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128); // 128 kbps
        const mp3Data = [];

        // Encode in chunks
        const chunkSize = 1152; // Standard MP3 frame size
        for (let i = 0; i < samples; i += chunkSize) {
            const leftChunk = leftSamples.subarray(i, i + chunkSize);
            const rightChunk = rightSamples.subarray(i, i + chunkSize);
            
            const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        // Flush remaining data
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

        // Create blob
        return new Blob(mp3Data, { type: 'audio/mp3' });
    }

    function audioBufferToWav(buffer) {
        const length = buffer.length;
        const numberOfChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
        const view = new DataView(arrayBuffer);

        // WAV header
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

        // Convert audio data
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
            config.value.textContent = parseFloat(value).toFixed(1) + config.suffix;
        } else if (sliderName === 'pitch') {
            const pitchValue = parseInt(value);
            config.value.textContent = (pitchValue > 0 ? '+' : '') + pitchValue + config.suffix;
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
        if (!analyser) return;

        requestAnimationFrame(drawVisualizer);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = 'rgb(26, 26, 26)';
        ctx.fillRect(0, 0, visualizer.width, visualizer.height);

        const barWidth = (visualizer.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * visualizer.height * 0.8;

            const r = barHeight + 25 * (i / bufferLength);
            const g = 250 * (i / bufferLength);
            const b = 50;

            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }
    }

    uploadBtn.addEventListener('click', () => {
        audioFile.click();
    });

    audioFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            initAudioContext();
            
            fileInfo.textContent = `Loaded: ${file.name}`;
            
            const url = URL.createObjectURL(file);
            
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }

            currentAudio = new Audio(url);
            currentAudio.addEventListener('loadedmetadata', function() {
                totalTimeSpan.textContent = formatTime(currentAudio.duration);
                playPauseBtn.disabled = false;
                progressBar.disabled = false;
                progressBar.max = currentAudio.duration;
                downloadBtn.disabled = false;
                
                setupAudioEffects();
            });

            currentAudio.addEventListener('timeupdate', function() {
                if (!isPlaying) return;
                currentTimeSpan.textContent = formatTime(currentAudio.currentTime);
                progressBar.value = currentAudio.currentTime;
            });

            currentAudio.addEventListener('ended', function() {
                isPlaying = false;
                const playIcon = playPauseBtn.querySelector('.play-icon');
                playIcon.className = 'play-icon play';
            });

            document.querySelector('.visualizer-placeholder').style.display = 'none';
            drawVisualizer();
        }
    });

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
            currentAudio.currentTime = this.value;
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
                    const speedValue = parseFloat(this.value);
                    const pitchValue = parseInt(sliders.pitch.slider.value);
                    const pitchFactor = Math.pow(2, pitchValue / 12);
                    currentAudio.playbackRate = speedValue * pitchFactor;
                }
                else if (sliderName === 'reverb' && currentAudio.wetGain && currentAudio.dryGain) {
                    const reverbAmount = parseFloat(this.value) / 100;
                    currentAudio.wetGain.gain.value = reverbAmount;
                    currentAudio.dryGain.gain.value = 1 - reverbAmount * 0.5;
                }
                else if (sliderName === 'pitch') {
                    applyPitchShift(parseInt(this.value));
                }
                else if (sliderName === 'bass' && bassFilter) {
                    bassFilter.gain.value = parseFloat(this.value);
                }
            }
        });
    });

    function resetAllSettings() {
        const defaultValues = {
            speed: 1,
            reverb: 0,
            pitch: 0,
            bass: 0
        };

        Object.keys(sliders).forEach(sliderName => {
            const config = sliders[sliderName];
            config.slider.value = defaultValues[sliderName];
            updateValue(sliderName, defaultValues[sliderName]);
        });

        if (currentAudio) {
            currentAudio.playbackRate = 1;
            
            if (currentAudio.wetGain && currentAudio.dryGain) {
                currentAudio.wetGain.gain.value = 0;
                currentAudio.dryGain.gain.value = 1;
            }
            
            if (bassFilter) {
                bassFilter.gain.value = 0;
            }
        }
    }

    resetButton.addEventListener('click', resetAllSettings);

    downloadBtn.addEventListener('click', downloadProcessedAudio);

    const scrollArrow = document.querySelector('.scroll-arrow');
    if (scrollArrow) {
        scrollArrow.addEventListener('click', () => {
            document.querySelector('.app-section').scrollIntoView({
                behavior: 'smooth'
            });
        });
    }

    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.settings-container, .audio-container');
    animatedElements.forEach(el => observer.observe(el));
});

