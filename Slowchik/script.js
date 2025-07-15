document.addEventListener('DOMContentLoaded', function() {
    let audioContext;
    let audioBuffer;
    let audioSource;
    let analyser;
    let dataArray;
    let isPlaying = false;
    let currentAudio = null;


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

    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
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

            const source = audioContext.createMediaElementSource(currentAudio);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            
            source.connect(analyser);
            analyser.connect(audioContext.destination);

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
                    currentAudio.playbackRate = parseFloat(this.value);
                }
             
            }
            
            console.log(`${sliderName} изменен на: ${this.value}`);
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
        }

        console.log('Все настройки сброшены');
    }

    resetButton.addEventListener('click', resetAllSettings);

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

    console.log('Slowchik Audio Player инициализирован');
});
