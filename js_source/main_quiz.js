// main_quiz.js
// 이 파일은 모든 Day의 데이터를 포함하는 단일 HTML 페이지에서 실행됩니다.

document.addEventListener('DOMContentLoaded', () => {
    console.log("main_quiz.js 로드됨.");
    console.log("모든 Day의 단어 데이터:", quizAllWordsData); // Python에서 주입된 전체 데이터

    // localStorage에서 마스터한 단어 로드
    let masteredWords = JSON.parse(localStorage.getItem('masteredWords')) || [];
    console.log("로컬 저장소의 마스터 단어:", masteredWords);

    // Day 선택 관련 UI 요소
    const daySelector = document.getElementById('day-selector');
    const prevDayButton = document.getElementById('prev-day-button');
    const nextDayButton = document.getElementById('next-day-button');
    const currentDayDisplay = document.getElementById('current-day-display');
    const quizProblemsArea = document.getElementById('quiz-problems-area'); // 퀴즈/학습 내용 표시 영역
    const submitQuizButton = document.getElementById('submit-quiz-button');
    const newQuizButton = document.getElementById('new-quiz-button'); // "새로운 퀴즈 시작" (리로드 대신)
    const startQuizButton = document.getElementById('start-quiz-button'); // HTML에 직접 추가된 버튼

    // 성적표 모달 관련 UI 요소
    const scoreReportModal = document.getElementById('score-report-modal');
    const scorecardGrid = document.getElementById('scorecard-grid');
    const summaryCorrect = document.getElementById('summary-correct');
    const summaryIncorrect = document.getElementById('summary-incorrect');


    let allDays = []; // 모든 Day 번호를 저장할 배열
    let currentDay = null; // 현재 선택된 Day

    // ----------------------------------------------------------------
    // 음성 합성 기능 (SpeechSynthesis API) 및 MP3 재생 기능 (상단 정의)
    // ----------------------------------------------------------------
    const synth = window.speechSynthesis;
    let voices = [];

    function populateVoiceList() {
        voices = synth.getVoices().sort((a, b) => {
            const aname = a.name.toUpperCase();
            const bname = b.name.toUpperCase();
            if (aname < bname) return -1;
            if (aname > bname) return +1;
            return 0;
        });
    }

    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = populateVoiceList;
        populateVoiceList();
    }

    window.speakText = (text, langCode) => {
        if (!synth) {
            console.warn("SpeechSynthesis not supported in this browser.");
            return;
        }
        if (synth.speaking) {
            synth.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langCode;
        synth.speak(utterance);
    };

    // MP3 오디오 재생 함수 (JSON의 절대 경로 URL 사용)
    window.playMp3Audio = (audioUrl) => {
        if (audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play().catch(e => console.error("MP3 오디오 재생 실패:", e));
        } else {
            console.warn("오디오 URL이 제공되지 않았습니다.");
        }
    };

    // Sound Effects
    const correctAudio = new Audio('../audio/correct.mp3'); // 경로 수정
    const incorrectAudio = new Audio('../audio/incorrect.mp3'); // 경로 수정
    const fanfareAudio = new Audio('../audio/fanfare.mp3'); // 팡파레 오디오 추가

    window.playCorrectSound = () => { // 개별 문제 사운드는 사용하지 않지만 함수는 유지
        correctAudio.currentTime = 0;
        correctAudio.play().catch(e => console.error("Correct audio playback failed:", e));
    };

    window.playIncorrectSound = () => { // 개별 문제 사운드는 사용하지 않지만 함수는 유지
        incorrectAudio.currentTime = 0;
        incorrectAudio.play().catch(e => console.error("Incorrect audio playback failed:", e));
    };


    // --- 유틸리티 함수 ---
    function getCurrentDateYYYYMMDD() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // --- localStorage 관련 함수 ---
    window.markWordAsMastered = (wordToMark) => {
        const upperCaseWord = wordToMark.toUpperCase();
        const todayDate = getCurrentDateYYYYMMDD();

        const existingEntryIndex = masteredWords.findIndex(item => item.word === upperCaseWord);

        if (existingEntryIndex === -1) {
            masteredWords.push({ word: upperCaseWord, date: todayDate });
        } else {
            masteredWords[existingEntryIndex].date = todayDate; // 마지막 학습일 업데이트
        }
        
        localStorage.setItem('masteredWords', JSON.stringify(masteredWords));
        console.log(`${upperCaseWord} 단어 마스터 처리/업데이트. 현재 마스터 단어 수: ${masteredWords.length}`);
        // updateProgressDisplay(); // 이 호출은 submitQuizButton 핸들러의 마지막에서 한 번만 합니다.
    };

    // --- 진행률 표시 업데이트 ---
    window.updateProgressDisplay = () => {
        // 전체 단어 수 및 학습 진행률
        const totalOverallWords = quizAllWordsData.length;
        const learnedOverallWords = masteredWords.length;
        const overallProgressPercentage = totalOverallWords > 0 ? (learnedOverallWords / totalOverallWords) * 100 : 0;
        
        document.getElementById('total-overall-words').textContent = totalOverallWords;
        document.getElementById('learned-overall-words').textContent = learnedOverallWords;
        document.getElementById('overall-progress-percentage').textContent = overallProgressPercentage.toFixed(1);

        // 현재 Day 단어 수 및 학습 진행률 (Day 선택기가 있으므로 유지)
        const wordsForCurrentDay = quizAllWordsData.filter(wordData => wordData.day === currentDay);
        const totalWordsForDay = wordsForCurrentDay.length;
        const learnedWordsForDay = wordsForCurrentDay.filter(wordData => 
            masteredWords.some(item => item.word === wordData.word.toUpperCase())
        );

        document.getElementById('total-words-for-day').textContent = totalWordsForDay;
        document.getElementById('learned-words-count').textContent = learnedWordsForDay.length;
        const progressPercentage = totalWordsForDay > 0 ? (learnedWordsForDay.length / totalWordsForDay) * 100 : 0;
        document.getElementById('progress-percentage').textContent = progressPercentage.toFixed(1);
    };

    // --- Helper to get distractors based on type/theme preference ---
    function getDistractors(correctWordData, allAvailableWordsForDistractors, count, propertyKey, filterByTheme = true) {
        const distractors = new Set(); // Set을 사용하여 중복 방지
        let potentialDistractors = [];

        // 1. 같은 Day, 같은 Theme에서 가져오기
        if (filterByTheme) {
            potentialDistractors = allAvailableWordsForDistractors.filter(wd =>
                wd.day === correctWordData.day &&
                wd.theme === correctWordData.theme &&
                wd[propertyKey] !== correctWordData[propertyKey] // 정답과 다른 의미/단어
            );
            shuffleArray(potentialDistractors);
            for(const wd of potentialDistractors) {
                if (distractors.size < count) {
                    distractors.add(wd[propertyKey]);
                } else break;
            }
        }
        
        // 2. 같은 Day 내에서 가져오기 (Theme 필터링 없이)
        if (distractors.size < count) {
            potentialDistractors = allAvailableWordsForDistractors.filter(wd =>
                wd.day === correctWordData.day &&
                wd[propertyKey] !== correctWordData[propertyKey] // 정답과 다른 의미/단어
            );
            shuffleArray(potentialDistractors);
            for(const wd of potentialDistractors) {
                if (distractors.size < count) {
                    distractors.add(wd[propertyKey]);
                } else break;
            }
        }
        
        // 3. 전체 단어 풀에서 가져오기 (아직 마스터하지 않은 단어 중, 정답 및 이미 선택된 오답 제외)
        if (distractors.size < count) {
            const allOtherUnmasteredWords = quizAllWordsData.filter(wd => 
                wd[propertyKey] !== correctWordData[propertyKey] && 
                !masteredWords.some(item => item.word === wd.word.toUpperCase()) &&
                !distractors.has(wd[propertyKey]) // 이미 선택된 distractors Set에 없는지 확인
            );
            shuffleArray(allOtherUnmasteredWords);
            for(const wd of allOtherUnmasteredWords) {
                if (distractors.size < count) {
                    distractors.add(wd[propertyKey]);
                } else break;
            }
        }
        
        return Array.from(distractors).slice(0, count); // 필요한 개수만큼만 반환
    }

    // --- 예문에서 정답 단어 하이라이트 Helper ---
    function getHighlightedExample(sentence, wordToHighlight) {
        if (!sentence || !wordToHighlight) return sentence;
        // 단어 경계를 사용하여 정확히 일치하는 단어만 찾고, 대소문자 구분 없이 처리
        const regex = new RegExp(`\\b${wordToHighlight}\\b`, 'gi');
        // 매치된 단어($&)를 빨간색으로 강조하는 span 태그로 감싸서 반환
        return sentence.replace(regex, `<span style="color: red; font-weight: bold;">$&</span>`);
    }


    // --- Quiz Type 1: English Word to Korean Meaning (영단어 -> 한글 의미) ---
    function createEnglishToKoreanQuizItem(wordData, questionNumber, allWordsForCurrentDay) {
        const correctMeaning = wordData.meaning;
        const englishWord = wordData.word;
        const highlightedEnglishExample = getHighlightedExample(wordData.eng_example, englishWord); // 하이라이트된 예문

        // Generate 3 distractors (incorrect Korean meanings)
        const distractors = getDistractors(wordData, quizAllWordsData, 3, 'meaning', true); // quizAllWordsData 사용

        // Combine correct answer and distractors
        let options = [correctMeaning, ...distractors];
        options = shuffleArray(options); // Shuffle the order of options

        const quizItemDiv = document.createElement('div');
        quizItemDiv.className = 'quiz-item';
        quizItemDiv.setAttribute('data-question-type', 'eng-to-kor');
        quizItemDiv.setAttribute('data-correct-answer', correctMeaning); // Store correct answer for checking
        quizItemDiv.setAttribute('data-word-id', wordData.id);

        let optionsHtml = options.map((option, idx) => `
            <button class="option-button" data-option-value="${option}" data-question-id="${questionNumber}">
                ${option}
            </button>
        `).join('');

        quizItemDiv.innerHTML = `
            <div class="quiz-question-number">문제 ${questionNumber}.</div>
            <div class="quiz-question-text">단어: <span class="word-to-guess">${englishWord}</span>
                <button class="listen-button" onclick="speakText('${englishWord}', 'en-US')">🔊</button>
                ${wordData.word_ee_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.word_ee_audio_url}')">🎧</button>` : ''}
            </div>
            ${wordData.image_url ? `<img src="${wordData.image_url}" alt="${englishWord}" class="item-image">` : ''}
            <div class="quiz-options">${optionsHtml}</div>
            <div class="quiz-feedback" style="display:none;"></div>
            <div class="quiz-answer-details" style="display:none;">
                <p>정답: <span class="correct-meaning">${correctMeaning}</span></p>
                <p>예문: ${highlightedEnglishExample} (${wordData.kor_example})</p>
                <button class="listen-button" onclick="speakText('${wordData.eng_example}', 'en-US')">🔊 예문</button>
                ${wordData.eng_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.eng_example_audio_url}')">🎧 예문 MP3</button>` : ''}
                <button class="listen-button" onclick="speakText('${wordData.kor_example}', 'ko-KR')">🔊 한글 예문</button>
                ${wordData.kor_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.kor_example_audio_url}')">🎧 한글 예문 MP3</button>` : ''}
            </div>
            <div class="per-question-controls">
                <button class="action-button show-answer-button" onclick="toggleAnswerAndDetails(${questionNumber})">정답/해설 보기</button>
            </div>
        `;

        // Attach event listeners for option buttons
        quizItemDiv.querySelectorAll('.option-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const qId = button.getAttribute('data-question-id');
                quizItemDiv.querySelectorAll(`.option-button[data-question-id="${qId}"]`).forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');
                userAnswers[qId] = button.getAttribute('data-option-value');
            });
        });

        return quizItemDiv;
    }

    // --- Quiz Type 2: Korean Meaning to English Word (한글 의미 -> 영단어) ---
    function createKoreanToEnglishQuizItem(wordData, questionNumber, allWordsForCurrentDay) {
        const correctEnglishWord = wordData.word;
        const koreanMeaning = wordData.meaning;
        const highlightedEnglishExample = getHighlightedExample(wordData.eng_example, correctEnglishWord); // 하이라이트된 예문

        // Generate 3 distractors (incorrect English words)
        const distractors = getDistractors(wordData, quizAllWordsData, 3, 'word', true); // quizAllWordsData 사용

        // Combine correct answer and distractors
        let options = [correctEnglishWord, ...distractors];
        options = shuffleArray(options); // Shuffle the order of options

        const quizItemDiv = document.createElement('div');
        quizItemDiv.className = 'quiz-item';
        quizItemDiv.setAttribute('data-question-type', 'kor-to-eng');
        quizItemDiv.setAttribute('data-correct-answer', correctEnglishWord); // Store correct answer (English word)
        quizItemDiv.setAttribute('data-word-id', wordData.id);

        let optionsHtml = options.map((option, idx) => `
            <button class="option-button" data-option-value="${option}" data-question-id="${questionNumber}">
                ${option.toUpperCase()} </button>
        `).join('');

        quizItemDiv.innerHTML = `
            <div class="quiz-question-number">문제 ${questionNumber}.</div>
            <div class="quiz-question-text">의미: <span class="meaning-to-guess">${koreanMeaning}</span>
                <button class="listen-button" onclick="speakText('${koreanMeaning}', 'ko-KR')">🔊</button>
                ${wordData.word_kk_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.word_kk_audio_url}')">🎧</button>` : ''}
            </div>
            <div class="quiz-options">${optionsHtml}</div>
            <div class="quiz-feedback" style="display:none;"></div>
            <div class="quiz-answer-details" style="display:none;">
                <p>정답: <span class="correct-word">${correctEnglishWord}</span> (${koreanMeaning})</p>
                <p>예문: ${highlightedEnglishExample} (${wordData.kor_example})</p> <button class="listen-button" onclick="speakText('${correctEnglishWord}', 'en-US')">🔊 영어</button>
                ${wordData.word_ee_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.word_ee_audio_url}')">🎧 영어 MP3</button>` : ''}
                <button class="listen-button" onclick="speakText('${wordData.eng_example}', 'en-US')">🔊 예문</button>
                ${wordData.eng_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.eng_example_audio_url}')">🎧 예문 MP3</button>` : ''}
                <button class="listen-button" onclick="speakText('${wordData.kor_example}', 'ko-KR')">🔊 한글 예문</button>
                ${wordData.kor_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.kor_example_audio_url}')">🎧 한글 예문 MP3</button>` : ''}
            </div>
            <div class="per-question-controls">
                <button class="action-button show-answer-button" onclick="toggleAnswerAndDetails(${questionNumber})">정답/해설 보기</button>
            </div>
        `;

        // Attach event listeners for option buttons (동일한 로직)
        quizItemDiv.querySelectorAll('.option-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const qId = button.getAttribute('data-question-id');
                quizItemDiv.querySelectorAll(`.option-button[data-question-id="${qId}"]`).forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');
                userAnswers[qId] = button.getAttribute('data-option-value');
            });
        });

        return quizItemDiv;
    }


    // --- Quiz Type 3: Sentence Fill-in-the-Blank (문장 빈칸 채우기) ---
    function createSentenceFillInBlankQuizItem(wordData, questionNumber, allWordsForCurrentDay) {
        const correctWord = wordData.word;
        const englishSentence = wordData.eng_example;
        const koreanSentence = wordData.kor_example; // 빈칸 단어의 힌트로 사용될 수 있음

        // 예문에서 정답 단어를 빈칸으로 처리 (대소문자 구분 없이)
        const regex = new RegExp(`\\b${correctWord}\\b`, 'gi'); // \b는 단어 경계를 의미, gi는 대소문자 구분 없이 전역 검색
        let blankedSentence = englishSentence.replace(regex, '______');

        // 만약 빈칸 처리가 안되었다면 (예: 단어 일치 안함), 첫 단어를 빈칸 처리하는 등 대체 로직 필요할 수 있으나,
        // 현재는 eng_example에 정확히 word가 들어있다고 가정합니다.
        if (blankedSentence === englishSentence) { // 단어를 찾지 못해 빈칸이 안 된 경우
            // 첫 번째 단어를 빈칸으로 대체하는 임시 로직 (선택 사항, 데이터 정제 시 불필요)
            const firstWordRegex = /(\b\w+\b)/; // 첫 번째 단어를 찾는 정규식
            blankedSentence = englishSentence.replace(firstWordRegex, '______');
            console.warn(`Word '${correctWord}' not found in sentence '${englishSentence}'. Using fallback blanking.`);
        }
        
        const highlightedEnglishExample = getHighlightedExample(englishSentence, correctWord); // 하이라이트된 예문


        // Generate 3 distractors (incorrect English words)
        const distractors = getDistractors(wordData, quizAllWordsData, 3, 'word', true);

        // Combine correct answer and distractors
        let options = [correctWord, ...distractors];
        options = shuffleArray(options); // Shuffle the order of options

        const quizItemDiv = document.createElement('div');
        quizItemDiv.className = 'quiz-item';
        quizItemDiv.setAttribute('data-question-type', 'fill-in-blank');
        quizItemDiv.setAttribute('data-correct-answer', correctWord); // Store correct answer (English word)
        quizItemDiv.setAttribute('data-word-id', wordData.id);

        let optionsHtml = options.map((option, idx) => `
            <button class="option-button" data-option-value="${option}" data-question-id="${questionNumber}">
                ${option.toUpperCase()}
            </button>
        `).join('');

        quizItemDiv.innerHTML = `
            <div class="quiz-question-number">문제 ${questionNumber}.</div>
            <div class="quiz-question-text">
                <p class="fill-in-blank-sentence">${blankedSentence}</p>
                <p class="hint-text">(의미: ${wordData.meaning})</p> <button class="listen-button" onclick="speakText('${blankedSentence}', 'en-US')">🔊 예문</button>
                ${wordData.eng_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.eng_example_audio_url}')">🎧 예문 MP3</button>` : ''}
            </div>
            <div class="quiz-options">${optionsHtml}</div>
            <div class="quiz-feedback" style="display:none;"></div>
            <div class="quiz-answer-details" style="display:none;">
                <p>정답: <span class="correct-word">${correctWord}</span> (${wordData.meaning})</p>
                <p>예문: ${highlightedEnglishExample} (${koreanSentence})</p> <button class="listen-button" onclick="speakText('${correctWord}', 'en-US')">🔊 단어</button>
                ${wordData.word_ee_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.word_ee_audio_url}')">🎧 단어 MP3</button>` : ''}
                <button class="listen-button" onclick="speakText('${englishSentence}', 'en-US')">🔊 예문</button>
                ${wordData.eng_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.eng_example_audio_url}')">🎧 예문 MP3</button>` : ''}
                <button class="listen-button" onclick="speakText('${koreanSentence}', 'ko-KR')">🔊 한글 예문</button>
                ${wordData.kor_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.kor_example_audio_url}')">🎧 한글 예문 MP3</button>` : ''}
            </div>
            <div class="per-question-controls">
                <button class="action-button show-answer-button" onclick="toggleAnswerAndDetails(${questionNumber})">정답/해설 보기</button>
            </div>
        `;

        // Attach event listeners for option buttons
        quizItemDiv.querySelectorAll('.option-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const qId = button.getAttribute('data-question-id');
                quizItemDiv.querySelectorAll(`.option-button[data-question-id="${qId}"]`).forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');
                userAnswers[qId] = button.getAttribute('data-option-value');
            });
        });

        return quizItemDiv;
    }


    // ----------------------------------------------------------------
    // 퀴즈 문제 생성 및 표시 로직 (전체 풀에서 20문제 출제)
    // ----------------------------------------------------------------
    let currentQuizProblems = []; // Stores the actual quiz objects generated for the current session
    let userAnswers = {}; // Stores user's selected answers for each question
    let currentQuizSessionScore = { correct: 0, total: 0 }; // Track score for the current quiz session

    // Day 설정 및 Day 선택기 채우기 (페이지 로드 시 처음 한 번만 호출)
    const setupDaySelector = () => {
        allDays = [...new Set(quizAllWordsData.map(word => word.day))].sort((a, b) => a - b);
        daySelector.innerHTML = ''; // 기존 옵션 제거
        allDays.forEach(day => {
            const option = document.createElement('option');
            option.value = day;
            option.textContent = `Day ${day}`;
            daySelector.appendChild(option);
        });

        // URL 파라미터에서 Day 가져오기 (예: all_exam.html?day=3)
        const urlParams = new URLSearchParams(window.location.search);
        const dayFromUrl = urlParams.get('day');

        if (dayFromUrl && allDays.includes(parseInt(dayFromUrl))) {
            currentDay = parseInt(dayFromUrl);
        } else {
            // URL에 Day가 없으면 첫 Day 또는 마지막으로 학습했던 Day로 설정
            currentDay = parseInt(localStorage.getItem('lastViewedDay')) || allDays[0];
            if (!allDays.includes(currentDay)) { // 저장된 Day가 유효하지 않으면 첫 Day로
                currentDay = allDays[0];
            }
        }
        daySelector.value = currentDay; // selectbox 값도 업데이트
        currentDayDisplay.textContent = `Day ${currentDay}`;
        localStorage.setItem('lastViewedDay', currentDay); // 현재 Day 저장

        generateAndDisplayStudyView(currentDay); // 처음에는 학습 뷰 생성
        updateProgressDisplay(); // 전체/현재 Day 진행률 업데이트
    };

    // Day 선택기 변경 이벤트
    daySelector.addEventListener('change', (event) => {
        currentDay = parseInt(event.target.value);
        localStorage.setItem('lastViewedDay', currentDay);
        currentDayDisplay.textContent = `Day ${currentDay}`;
        generateAndDisplayStudyView(currentDay); // Day 변경 시 학습 뷰로 돌아옴
        updateProgressDisplay();
        window.history.pushState({ day: currentDay }, `Day ${currentDay} 영단어 퀴즈`, `?day=${currentDay}`); // URL 업데이트
    });

    // 이전/다음 Day 버튼 이벤트
    prevDayButton.addEventListener('click', () => {
        const currentIndex = allDays.indexOf(currentDay);
        if (currentIndex > 0) {
            currentDay = allDays[currentIndex - 1];
            daySelector.value = currentDay; // selectbox 값도 업데이트
            daySelector.dispatchEvent(new Event('change')); // change 이벤트 강제 발생
        }
    });

    nextDayButton.addEventListener('click', () => {
        const currentIndex = allDays.indexOf(currentDay);
        if (currentIndex < allDays.length - 1) {
            currentDay = allDays[currentIndex + 1];
            daySelector.value = currentDay; // selectbox 값도 업데이트
            daySelector.dispatchEvent(new Event('change')); // change 이벤트 강제 발생
        }
    });


    // ----------------------------------------------------------------
    // 학습/복습 뷰 생성 함수
    // ----------------------------------------------------------------
    function generateAndDisplayStudyView(dayToDisplay) {
        quizProblemsArea.innerHTML = '<p class="loading-message">단어 학습 목록을 불러오는 중...</p>';
        submitQuizButton.style.display = 'none'; // 퀴즈 제출 버튼 숨김
        newQuizButton.style.display = 'none'; // 새로운 퀴즈 버튼 숨김
        startQuizButton.style.display = 'inline-block'; // 학습 시작 버튼 표시

        const wordsForThisDay = quizAllWordsData.filter(wordData => wordData.day === dayToDisplay);
        const wordsToStudy = wordsForThisDay.filter(wordData =>
            !masteredWords.some(item => item.word === wordData.word.toUpperCase())
        );

        if (wordsToStudy.length === 0) {
            quizProblemsArea.innerHTML = '<p class="loading-message">축하합니다! 이 Day의 모든 단어를 마스터했습니다. 다음 Day로 이동해보세요.</p>';
            startQuizButton.style.display = 'none';
            return;
        }

        quizProblemsArea.innerHTML = ''; // 로딩 메시지 제거

        wordsToStudy.forEach((wordData, index) => {
            const studyItemDiv = document.createElement('div');
            studyItemDiv.className = 'quiz-item'; // 재활용
            studyItemDiv.innerHTML = `
                <div class="quiz-question-number">단어 ${index + 1}.</div>
                <div class="quiz-question-text">단어: ${wordData.word}
                    <button class="listen-button" onclick="speakText('${wordData.word}', 'en-US')">🔊</button>
                    ${wordData.word_ee_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.word_ee_audio_url}')">🎧</button>` : ''}
                </div>
                <div class="quiz-meaning">의미: ${wordData.meaning}
                    <button class="listen-button" onclick="speakText('${wordData.meaning}', 'ko-KR')">🔊</button>
                    ${wordData.word_kk_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.word_kk_audio_url}')">🎧</button>` : ''}
                </div>
                ${wordData.image_url ? `<img src="${wordData.image_url}" alt="${wordData.word}" class="item-image" style="width:100px; height:auto;">` : ''}
                <div class="quiz-example">예문: ${wordData.eng_example} (${wordData.kor_example})
                    <button class="listen-button" onclick="speakText('${wordData.eng_example}', 'en-US')">🔊</button>
                    ${wordData.eng_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.eng_example_audio_url}')">🎧</button>` : ''}
                    <button class="listen-button" onclick="speakText('${wordData.kor_example}', 'ko-KR')">🔊</button>
                    ${wordData.kor_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.kor_example_audio_url}')">🎧</button>` : ''}
                </div>
                <button onclick="markWordAsMastered('${wordData.word}')" class="action-button">이 단어 마스터!</button>
            `;
            quizProblemsArea.appendChild(studyItemDiv);
        });
    }

    // ----------------------------------------------------------------
    // 퀴즈 문제 생성 및 표시 로직 (전체 풀에서 20문제 출제)
    // ----------------------------------------------------------------
    function generateAndDisplayQuiz() { // Day 인자를 제거
        quizProblemsArea.innerHTML = ''; // 기존 콘텐츠 지우기
        submitQuizButton.style.display = 'inline-block'; // 퀴즈 제출 버튼 표시
        newQuizButton.style.display = 'none'; // 새로운 퀴즈 버튼 숨김
        startQuizButton.style.display = 'none'; // 학습 시작 버튼 숨김

        // 마스터하지 않은 모든 단어 (전체 Day에서)
        const allUnmasteredWords = quizAllWordsData.filter(wordData =>
            !masteredWords.some(item => item.word === wordData.word.toUpperCase())
        );

        const totalQuestionsToGenerate = 20; // 총 20문제 목표

        if (allUnmasteredWords.length === 0) {
            quizProblemsArea.innerHTML = '<p class="loading-message">축하합니다! 모든 단어를 마스터했습니다!</p>';
            submitQuizButton.style.display = 'none';
            newQuizButton.style.display = 'none';
            return;
        }
        
        if (allUnmasteredWords.length < totalQuestionsToGenerate) {
            console.warn(`미학습 단어가 부족하여 ${totalQuestionsToGenerate} 문제 모두 출제 불가. ${allUnmasteredWords.length} 문제만 출제됩니다.`);
            // 사용자에게 부족하다는 것을 알릴 수도 있습니다.
        }

        // 퀴즈에 사용할 단어들을 무작위로 섞음 (실제로 퀴즈에 사용할 단어 풀)
        const shuffledQuizPool = shuffleArray(allUnmasteredWords).slice(0, totalQuestionsToGenerate);
        
        currentQuizProblems = []; // Reset for new quiz session
        userAnswers = {}; // Reset user answers for new quiz session
        currentQuizSessionScore = { correct: 0, total: shuffledQuizPool.length }; // 실제로 생성될 문제 수로 업데이트
        document.getElementById('current-score').textContent = `0/${currentQuizSessionScore.total}`;

        let currentQuestionCount = 0;

        // 퀴즈 유형별로 문제 할당 (현재 3가지 유형을 약 6-7문제씩)
        const numTypesAvailable = 3; 
        const baseQuestionsPerType = Math.floor(totalQuestionsToGenerate / numTypesAvailable);
        let remainingQuestions = totalQuestionsToGenerate % numTypesAvailable;

        const numType1Questions = baseQuestionsPerType + (remainingQuestions > 0 ? 1 : 0);
        if (remainingQuestions > 0) remainingQuestions--;

        const numType2Questions = baseQuestionsPerType + (remainingQuestions > 0 ? 1 : 0);
        if (remainingQuestions > 0) remainingQuestions--;

        const numType3Questions = baseQuestionsPerType + remainingQuestions;

        // 문제 순서를 무작위로 섞기 위한 배열
        let quizOrderSpecs = [];
        for (let i = 0; i < numType1Questions; i++) quizOrderSpecs.push('eng-to-kor');
        for (let i = 0; i < numType2Questions; i++) quizOrderSpecs.push('kor-to-eng');
        for (let i = 0; i < numType3Questions; i++) quizOrderSpecs.push('fill-in-blank');
        shuffleArray(quizOrderSpecs); // 출제될 문제 유형들의 순서를 무작위로 섞음

        shuffledQuizPool.forEach((wordData, index) => {
            if (index >= totalQuestionsToGenerate) return; // 20문제만 생성 (slice로 이미 제한했지만 안전 장치)
            
            const questionNumber = index + 1;
            const quizType = quizOrderSpecs[index]; // 섞인 유형 배열에서 가져옴

            let quizItemElement;
            
            if (quizType === 'eng-to-kor') {
                quizItemElement = createEnglishToKoreanQuizItem(wordData, questionNumber, quizAllWordsData);
            } else if (quizType === 'kor-to-eng') {
                quizItemElement = createKoreanToEnglishQuizItem(wordData, questionNumber, quizAllWordsData);
            } else if (quizType === 'fill-in-blank') {
                quizItemElement = createSentenceFillInBlankQuizItem(wordData, questionNumber, quizAllWordsData);
            }
            // 다른 퀴즈 유형들도 여기에 추가

            if (quizItemElement) {
                quizProblemsArea.appendChild(quizItemElement);
                currentQuizProblems.push({
                    questionNumber: questionNumber,
                    wordData: wordData,
                    type: quizType,
                    element: quizItemElement,
                    result: null // 성적표 모달을 위해 결과 저장 (초기화)
                });
            }
        });
        currentQuizSessionScore.total = currentQuizProblems.length; // 최종적으로 생성된 문제 수
        document.getElementById('current-score').textContent = `0/${currentQuizSessionScore.total}`;
    }


    // ----------------------------------------------------------------
    // 퀴즈 제출 및 피드백 로직
    // ----------------------------------------------------------------
    submitQuizButton.addEventListener('click', () => {
        currentQuizSessionScore.correct = 0; // Reset correct count for re-evaluation
        let totalAnsweredCount = 0; // 사용자가 답을 선택한 문제 수
        let hasUnansweredQuestions = false; // 미답변 문제가 있는지 여부

        currentQuizProblems.forEach(problem => {
            const questionId = problem.questionNumber;
            const quizItemElement = problem.element; // 퀴즈 아이템의 DOM 요소를 다시 가져옵니다.
            
            // 해당 퀴즈 아이템 내에서 'selected' 클래스를 가진 버튼을 직접 찾습니다.
            const selectedButton = quizItemElement.querySelector('.option-button.selected');
            // 선택된 버튼이 있으면 그 버튼의 data-option-value를 가져오고, 없으면 undefined로 둡니다.
            const userAnswer = selectedButton ? selectedButton.getAttribute('data-option-value') : undefined;

            const correctAnswer = quizItemElement.getAttribute('data-correct-answer');
            const feedbackDiv = quizItemElement.querySelector('.quiz-feedback');
            const answerDetailsDiv = quizItemElement.querySelector('.quiz-answer-details');
            const optionButtons = quizItemElement.querySelectorAll('.option-button');
            
            const questionNumberDiv = quizItemElement.querySelector('.quiz-question-number'); // 문제 번호 div

            // 모든 옵션 버튼에서 이전 피드백 클래스 제거 (채점 전 상태 초기화)
            optionButtons.forEach(btn => {
                btn.classList.remove('correct', 'incorrect');
            });
            // 'selected' 클래스는 사용자의 선택 상태를 나타내므로 유지

            feedbackDiv.style.display = 'block'; // 정답/오답 텍스트는 즉시 보이게 합니다.
            answerDetailsDiv.style.display = 'none'; // 상세 해설(정답/예문)은 여전히 숨겨둡니다.

            // 이전 O/X 마크 클래스 제거 (문제 번호 div에서)
            questionNumberDiv.classList.remove('question-correct', 'question-incorrect');

            if (userAnswer === undefined) {
                hasUnansweredQuestions = true; // 미답변 문제 있음을 기록
                feedbackDiv.textContent = '아직 답을 선택하지 않았습니다. 🤔';
                feedbackDiv.style.color = 'orange';
                problem.result = 'unanswered'; // 성적표 모달을 위해 결과 저장
            } else {
                totalAnsweredCount++; // 답을 선택한 문제 카운트
                if (userAnswer === correctAnswer) {
                    currentQuizSessionScore.correct++;
                    feedbackDiv.textContent = '정답입니다! 🎉';
                    feedbackDiv.style.color = 'green';
                    quizItemElement.querySelector(`[data-option-value="${userAnswer}"]`).classList.add('correct');
                    // playCorrectSound(); // 개별 사운드 제거
                    markWordAsMastered(problem.wordData.word); // 정답 맞힌 단어 마스터 처리
                    questionNumberDiv.classList.add('question-correct'); // 정답 O 마크
                    problem.result = 'correct'; // 성적표 모달을 위해 결과 저장
                } else {
                    feedbackDiv.textContent = '오답입니다. 😔';
                    feedbackDiv.style.color = 'red';
                    quizItemElement.querySelector(`[data-option-value="${userAnswer}"]`).classList.add('incorrect'); // 사용자가 선택한 오답
                    quizItemElement.querySelector(`[data-option-value="${correctAnswer}"]`).classList.add('correct'); // 정답 하이라이트
                    // playIncorrectSound(); // 개별 사운드 제거
                    questionNumberDiv.classList.add('question-incorrect'); // 오답 X 마크
                    problem.result = 'incorrect'; // 성적표 모달을 위해 결과 저장
                }
            }
        });

        // 현재 점수 업데이트
        const finalScorePercentage = (currentQuizSessionScore.correct / currentQuizSessionScore.total) * 100; // <-- 여기 정의
        document.getElementById('current-score').textContent = `${finalScorePercentage.toFixed(0)}점`;

        // 모든 문제 처리 후 최종 상태 확인
        if (hasUnansweredQuestions) {
            // 미답변 문제가 있으면 경고하고, 제출 버튼 유지
            alert(`총 ${currentQuizProblems.length} 문제 중 ${currentQuizProblems.length - totalAnsweredCount} 문제를 아직 선택하지 않았습니다.`);
            submitQuizButton.style.display = 'inline-block'; // 제출 버튼 유지
            newQuizButton.style.display = 'none'; // 새로운 퀴즈 버튼 숨김
        } else {
            // 모든 문제에 답한 경우
            // alert(`퀴즈 완료! ${currentQuizSessionScore.correct}개 정답 / ${currentQuizSessionScore.total} 문제`); // 모달로 대체
            submitQuizButton.style.display = 'none'; // 제출 버튼 숨김
            newQuizButton.style.display = 'inline-block'; // 새로운 퀴즈 시작 버튼 표시
            
            // 팡파레 재생 로직 (모든 문제를 답했고, 총 문제가 0이 아닐 때)
            if (currentQuizSessionScore.total > 0) { 
                const scorePercentage = (currentQuizSessionScore.correct / currentQuizSessionScore.total) * 100;
                if (scorePercentage >= 80) {
                    fanfareAudio.currentTime = 0; // 처음부터 재생
                    fanfareAudio.play().catch(e => console.error("Fanfare audio playback failed:", e));
                }
            }
            showScoreReportModal(finalScorePercentage.toFixed(0)); // <-- 여기 사용
        }
        updateProgressDisplay(); // 진행률 업데이트 (전체 및 Day별)
    });

    // 새로운 퀴즈 시작 버튼 (현재 Day에 대해 새로운 문제 세트를 생성)
    newQuizButton.addEventListener('click', () => {
        generateAndDisplayQuiz(); // 퀴즈 모드로 다시 전환 (Day 인자 없음)
    });
    
    // "오늘의 퀴즈 시작" 버튼 이벤트
    startQuizButton.addEventListener('click', () => {
        generateAndDisplayQuiz(); // 퀴즈 모드로 전환 (Day 인자 없음)
    });


    // ----------------------------------------------------------------
    // 클립보드 복사 기능
    // ----------------------------------------------------------------
    window.copyLearnedWordsToClipboard = () => {
        const masteredWordsData = JSON.parse(localStorage.getItem('masteredWords')) || [];
        if (masteredWordsData.length === 0) {
            alert("아직 학습한 단어가 없습니다.");
            return;
        }
        const textToCopy = "=== 나의 학습 기록 ===\\n" +
                           masteredWordsData.map(item => `- ${item.word} (학습일: ${item.date})`).join('\\n') +
                           "\\n======================";
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy)
                .then(() => alert("학습 기록이 클립보드에 복사되었습니다!"))
                .catch(err => { console.error("클립보드 복사 실패:", err); alert("클립보드 복사에 실패했습니다."); });
        } else { alert("이 브라우저에서는 클립보드 복사를 지원하지 않습니다."); }
    };

    window.copyQuizResultToClipboard = () => {
        const currentScoreText = document.getElementById('current-score').textContent;

        const todayDate = getCurrentDateYYYYMMDD();
        const resultText = `=== 오늘(${todayDate})의 퀴즈 결과 ===\\n` +
                           `점수: ${currentScoreText}\\n` +
                           `==================================`;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(resultText)
                .then(() => alert("오늘 퀴즈 결과가 클립보드에 복사되었습니다!"))
                .catch(err => { console.error("클립보드 복사 실패:", err); alert("클립보드 복사에 실패했습니다."); });
        } else { alert("이 브라우저에서는 클립보드 복사를 지원하지 않습니다."); }
    };

    // ----------------------------------------------------------------
    // 음성 합성 기능 (SpeechSynthesis API) 및 MP3 재생 기능
    // ----------------------------------------------------------------
    // 이 함수들은 DOMContentLoaded 스코프의 맨 위로 이동했습니다.
    // (위 코드의 시작 부분을 참조해주세요)

    // --- 정답/해설 보기 토글 함수 ---
    window.toggleAnswerAndDetails = (questionId) => {
        // currentQuizProblems 배열에서 해당 questionId에 맞는 문제 요소를 찾습니다.
        const problemElement = currentQuizProblems.find(p => p.questionNumber === questionId)?.element;
        
        if (!problemElement) {
            console.warn(`Problem element for questionId ${questionId} not found.`);
            return;
        }

        const feedbackDiv = problemElement.querySelector('.quiz-feedback');
        const answerDetailsDiv = problemElement.querySelector('.quiz-answer-details');
        const showButton = problemElement.querySelector('.show-answer-button');

        // 둘 다 숨겨져 있으면 보이게 하고, 둘 다 보이면 숨기게 합니다.
        if (feedbackDiv.style.display === 'none' || feedbackDiv.style.display === '') {
            feedbackDiv.style.display = 'block';
            answerDetailsDiv.style.display = 'block';
            showButton.textContent = '정답/해설 숨기기';
        } else {
            feedbackDiv.style.display = 'none';
            answerDetailsDiv.style.display = 'none';
            showButton.textContent = '정답/해설 보기';
        }
    };

    // --- 성적표 모달 표시/숨기기 함수 ---
    window.showScoreReportModal = () => { // 이 함수 정의에는 finalScorePercentage 인자가 없습니다.
        scorecardGrid.innerHTML = ''; // 이전 내용 지우기
        let correctCount = 0;
        let incorrectCount = 0;
        let unansweredCount = 0; // 미답변 카운트 추가

        currentQuizProblems.forEach(problem => {
            const scorecardItem = document.createElement('div');
            scorecardItem.className = 'scorecard-item';
            scorecardItem.textContent = problem.questionNumber; // 문제 번호 표시

            if (problem.result === 'correct') {
                scorecardItem.classList.add('correct-mark');
                scorecardItem.innerHTML += '<span class="mark">O</span>'; // O 텍스트 추가 (SVG로 대체될 수 있음)
                correctCount++;
            } else if (problem.result === 'incorrect') {
                scorecardItem.classList.add('incorrect-mark');
                scorecardItem.innerHTML += '<span class="mark">X</span>'; // X 텍스트 추가 (SVG로 대체될 수 있음)
                incorrectCount++;
            } else { // 미답변 문제
                 scorecardItem.classList.add('unanswered-mark'); // 새로운 클래스 추가
                 scorecardItem.innerHTML += '<span class="mark">?</span>'; // 물음표 표시
            }

            scorecardGrid.appendChild(scorecardItem);
        });

        summaryCorrect.textContent = correctCount;
        summaryIncorrect.textContent = incorrectCount;
        // 총 문제수에서 정답, 오답 뺀 것이 미답변 수가 됩니다.
        // 또는 totalAnsweredCount와 hasUnansweredQuestions 플래그를 사용해서 계산할 수도 있습니다.
        // 현재는 problem.result를 사용하므로 unansweredCount를 사용하는 것이 정확합니다.

        scoreReportModal.classList.add('show-modal'); // 모달 표시
    };

    window.hideScoreReportModal = () => {
        scoreReportModal.classList.remove('show-modal'); // 모달 숨기기
    };


    // --- 초기화 호출 ---
    setupDaySelector(); // Day 선택기를 설정하고 처음에는 학습 뷰를 생성합니다.
});
