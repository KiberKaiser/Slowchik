document.addEventListener('DOMContentLoaded', function() {
    let audioContext;
    let audioBuffer;
    let audioSource;
    let analyser;
    let dataArray;
    let isPlaying = false;
    let currentAudio = null;
    
    // Добавляем переменные для аудио эффектов
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

    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // Функция для создания импульсной характеристики реверба
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

    // Функция для создания аудио цепочки эффектов
    function setupAudioEffects() {
        if (!audioContext || !currentAudio) return;

        // Создаем узлы эффектов
        const source = audioContext.createMediaElementSource(currentAudio);
        
        // Bass EQ фильтр
        bassFilter = audioContext.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 200;
        bassFilter.gain.value = 0;

        // Reverb конвольвер
        convolverNode = audioContext.createConvolver();
        convolverNode.buffer = createReverbImpulse(2, 2);

        // Сухой и мокрый сигнал для реверба
        const dryGain = audioContext.createGain();
        const wetGain = audioContext.createGain();
        dryGain.gain.value = 1;
        wetGain.gain.value = 0;

        // Основной gain узел
        gainNode = audioContext.createGain();
        gainNode.gain.value = 1;

        // Анализатор для визуализации
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        // Соединяем аудио цепочку
        source.connect(bassFilter);
        
        // Разветвление для реверба
        bassFilter.connect(dryGain);
        bassFilter.connect(convolverNode);
        convolverNode.connect(wetGain);
        
        // Смешиваем сухой и мокрый сигналы
        dryGain.connect(gainNode);
        wetGain.connect(gainNode);
        
        gainNode.connect(analyser);
        analyser.connect(audioContext.destination);

        // Сохраняем ссылки для управления эффектами
        currentAudio.dryGain = dryGain;
        currentAudio.wetGain = wetGain;
    }

    // Функция для применения эффекта pitch (базовая реализация через playbackRate)
    function applyPitchShift(semitones) {
        if (!currentAudio) return;
        
        // Преобразуем полутона в коэффициент частоты
        const pitchFactor = Math.pow(2, semitones / 12);
        currentAudio.preservesPitch = false;
        currentAudio.playbackRate = currentAudio.playbackRate || 1;
        
        // Применяем pitch без изменения скорости (приблизительно)
        const speedSliderValue = parseFloat(sliders.speed.slider.value);
        currentAudio.playbackRate = speedSliderValue * pitchFactor;
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
                
                // Настраиваем аудио эффекты после загрузки
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
            
            if (currentAudio.wetGain && currentAudio.dryGain) {
                currentAudio.wetGain.gain.value = 0;
                currentAudio.dryGain.gain.value = 1;
            }
            
            if (bassFilter) {
                bassFilter.gain.value = 0;
            }
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