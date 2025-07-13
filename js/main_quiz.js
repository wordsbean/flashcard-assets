// main_quiz.js

// GitHub Pages URL의 기본 경로
const GITHUB_PAGES_BASE_URL = "https://wordsbean.github.io/flashcard-assets/";

// 전역 변수 선언 (스코프 관리를 위해 let으로 선언하고 DOMContentLoaded 내에서 할당)
let quizAllWordsData = [];
let masteredWords = [];
let daySelector, prevDayButton, nextDayButton, currentDayDisplay, quizProblemsArea, submitQuizButton, newQuizButton, startQuizButton;
let scoreReportModal, scorecardGrid, summaryCorrect, summaryIncorrect;
let allDays = [];
let currentDay = null;
let currentQuizProblems = [];
let userAnswers = {};
let currentQuizSessionScore = { correct: 0, total: 0 };


// ----------------------------------------------------------------
// 음성 합성 기능 (SpeechSynthesis API) 및 MP3 재생 기능
// window 객체에 직접 연결하여 HTML에서 바로 호출 가능하게 합니다.
// ----------------------------------------------------------------
const synth = window.speechSynthesis;
let voices = [];

function populateVoiceList() {
    voices = synth.getVoices().sort((a, b) => {
        const aname = a.name.toUpperCase();
        const bname = b.name.toUpperCase(); // <-- 여기를 b.name으로 수정했습니다.
        if (aname < bname) return -1;
        if (aname > bname) return +1;
        return 0;
    });
}

// voiceschanged 이벤트에만 등록
if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoiceList;
} else {
    // onvoiceschanged가 지원되지 않는 경우 초기 한 번 호출 (fallback)
    populateVoiceList();
}


window.speakText = (text, langCode) => {
    if (!synth) {
        console.warn("SpeechSynthesis not supported in this browser.");
        return;
    }
    if (synth.speaking) {
        synth.cancel(); // 이전 음성 재생 중지
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    synth.speak(utterance);
};

// MP3 오디오 재생 함수: URL 중복을 처리합니다.
window.playMp3Audio = (audioPath) => {
    if (audioPath) {
        // audioPath가 이미 GITHUB_PAGES_BASE_URL로 시작하는지 확인하여 중복 방지
        const fullAudioUrl = audioPath.startsWith(GITHUB_PAGES_BASE_URL) ? audioPath : GITHUB_PAGES_BASE_URL + audioPath;
        const audio = new Audio(fullAudioUrl);
        audio.play().catch(e => console.error("MP3 오디오 재생 실패:", e));
    } else {
        console.warn("오디오 URL이 제공되지 않았습니다.");
    }
};

// Sound Effects (절대 경로 사용)
// 이 경로들은 'flashcard-assets' 저장소의 루트에 'audio' 폴더가 있다고 가정합니다.
const correctAudio = new Audio(GITHUB_PAGES_BASE_URL + 'audio/correct.mp3');
const incorrectAudio = new Audio(GITHUB_PAGES_BASE_URL + 'audio/incorrect.mp3');
const fanfareAudio = new Audio(GITHUB_PAGES_BASE_URL + 'audio/fanfare.mp3');

window.playCorrectSound = () => {
    correctAudio.currentTime = 0;
    correctAudio.play().catch(e => console.error("Correct audio playback failed:", e));
};

window.playIncorrectSound = () => {
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
};

// --- 진행률 표시 업데이트 ---
window.updateProgressDisplay = () => {
    const totalOverallWords = quizAllWordsData.length;
    const learnedOverallWords = masteredWords.length;
    const overallProgressPercentage = totalOverallWords > 0 ? (learnedOverallWords / totalOverallWords) * 100 : 0;

    document.getElementById('total-overall-words').textContent = totalOverallWords;
    document.getElementById('learned-overall-words').textContent = learnedOverallWords;
    document.getElementById('overall-progress-percentage').textContent = overallProgressPercentage.toFixed(1);

    // currentDay가 null이거나 유효하지 않을 때 안전하게 처리
    const currentDayVal = currentDay || (allDays.length > 0 ? allDays[0] : '1');
    const wordsForCurrentDay = quizAllWordsData.filter(wordData => parseInt(wordData.day) === parseInt(currentDayVal));
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
    const distractors = new Set();
    let potentialDistractors = [];

    if (filterByTheme) {
        potentialDistractors = allAvailableWordsForDistractors.filter(wd =>
            parseInt(wd.day) === parseInt(correctWordData.day) &&
            wd.theme === correctWordData.theme &&
            wd[propertyKey] !== correctWordData[propertyKey]
        );
        shuffleArray(potentialDistractors);
        for(const wd of potentialDistractors) {
            if (distractors.size < count) {
                distractors.add(wd[propertyKey]);
            } else break;
        }
    }

    // 테마로 충분한 오답을 얻지 못하면, 같은 Day의 다른 단어에서 찾음
    if (distractors.size < count) {
        potentialDistractors = allAvailableWordsForDistractors.filter(wd =>
            parseInt(wd.day) === parseInt(correctWordData.day) &&
            wd[propertyKey] !== correctWordData[propertyKey] &&
            !distractors.has(wd[propertyKey]) // 이미 추가된 중복 오답 방지
        );
        shuffleArray(potentialDistractors);
        for(const wd of potentialDistractors) {
            if (distractors.size < count) {
                distractors.add(wd[propertyKey]);
            } else break;
        }
    }

    // 같은 Day에서도 충분한 오답을 얻지 못하면, 전체 단어에서 학습하지 않은 단어를 우선하여 찾음
    if (distractors.size < count) {
        const allOtherUnmasteredWords = quizAllWordsData.filter(wd =>
            wd[propertyKey] !== correctWordData[propertyKey] &&
            !masteredWords.some(item => item.word === wd.word.toUpperCase()) &&
            !distractors.has(wd[propertyKey])
        );
        shuffleArray(allOtherUnmasteredWords);
        for(const wd of allOtherUnmasteredWords) {
            if (distractors.size < count) {
                distractors.add(wd[propertyKey]);
            } else break;
        }
    }
    
    // 최종적으로 그래도 부족하면, 전체 단어 중 임의로 추가 (이미 추가된 오답은 제외)
    while (distractors.size < count && quizAllWordsData.length > 0) {
        const randomWordData = shuffleArray(quizAllWordsData.filter(wd =>
            wd[propertyKey] !== correctWordData[propertyKey] && !distractors.has(wd[propertyKey])
        ))[0];
        if (randomWordData) {
            distractors.add(randomWordData[propertyKey]);
        } else {
            break; // 더 이상 추가할 단어가 없음
        }
    }

    return Array.from(distractors).slice(0, count);
}

// --- 예문에서 정답 단어 하이라이트 Helper ---
function getHighlightedExample(sentence, wordToHighlight) {
    if (!sentence || !wordToHighlight) return sentence;
    const regex = new RegExp(`\\b${wordToHighlight}\\b`, 'gi');
    return sentence.replace(regex, `<span style="color: red; font-weight: bold;">$&</span>`);
}


// --- Quiz Item 생성 함수들 ---

// Quiz Type 1: English Word to Korean Meaning (영단어 -> 한글 의미)
function createEnglishToKoreanQuizItem(wordData, questionNumber, allWordsForCurrentDay) {
    const correctMeaning = wordData.meaning;
    const englishWord = wordData.word;
    const highlightedEnglishExample = getHighlightedExample(wordData.eng_example, englishWord);
    const distractors = getDistractors(wordData, quizAllWordsData, 3, 'meaning', true);
    let options = [correctMeaning, ...distractors];
    options = shuffleArray(options);

    const quizItemDiv = document.createElement('div');
    quizItemDiv.className = 'quiz-item';
    quizItemDiv.setAttribute('data-question-type', 'eng-to-kor');
    quizItemDiv.setAttribute('data-correct-answer', correctMeaning);
    quizItemDiv.setAttribute('data-word-id', wordData.id);

    let optionsHtml = options.map((option, idx) => `
        <button class="option-button" data-option-value="${option}" data-question-id="${questionNumber}">
            ${option}
        </button>
    `).join('');

    quizItemDiv.innerHTML = `
        <div class="quiz-question-number">문제 ${questionNumber}.</div>
        <div class="quiz-question-type-description">다음에 맞는 한글 의미는?</div>
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

// Quiz Type 2: Korean Meaning to English Word (한글 의미 -> 영단어)
function createKoreanToEnglishQuizItem(wordData, questionNumber, allWordsForCurrentDay) {
    const correctEnglishWord = wordData.word;
    const koreanMeaning = wordData.meaning;
    const highlightedEnglishExample = getHighlightedExample(wordData.eng_example, correctEnglishWord);
    const distractors = getDistractors(wordData, quizAllWordsData, 3, 'word', true);
    let options = [correctEnglishWord, ...distractors];
    options = shuffleArray(options);

    const quizItemDiv = document.createElement('div');
    quizItemDiv.className = 'quiz-item';
    quizItemDiv.setAttribute('data-question-type', 'kor-to-eng');
    quizItemDiv.setAttribute('data-correct-answer', correctEnglishWord);
    quizItemDiv.setAttribute('data-word-id', wordData.id);

    let optionsHtml = options.map((option, idx) => `
        <button class="option-button" data-option-value="${option}" data-question-id="${questionNumber}">
            ${option.toUpperCase()} </button>
    `).join('');

    quizItemDiv.innerHTML = `
        <div class="quiz-question-number">문제 ${questionNumber}.</div>
        <div class="quiz-question-type-description">다음에 맞는 영어 단어는?</div>
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


// Quiz Type 3: Sentence Fill-in-the-Blank (문장 빈칸 채우기)
function createSentenceFillInBlankQuizItem(wordData, questionNumber, allWordsForCurrentDay) {
    const correctWord = wordData.word;
    const englishSentence = wordData.eng_example;
    const koreanSentence = wordData.kor_example;

    const regex = new RegExp(`\\b${correctWord}\\b`, 'gi');
    let blankedSentence = englishSentence.replace(regex, '______');

    if (blankedSentence === englishSentence) {
        const firstWordRegex = /(\b\w+\b)/;
        blankedSentence = englishSentence.replace(firstWordRegex, '______');
        console.warn(`Word '${correctWord}' not found in sentence '${englishSentence}'. Using fallback blanking.`);
    }

    const highlightedEnglishExample = getHighlightedExample(englishSentence, correctWord);
    const distractors = getDistractors(wordData, quizAllWordsData, 3, 'word', true);
    let options = [correctWord, ...distractors];
    options = shuffleArray(options);

    const quizItemDiv = document.createElement('div');
    quizItemDiv.className = 'quiz-item';
    quizItemDiv.setAttribute('data-question-type', 'fill-in-blank');
    quizItemDiv.setAttribute('data-correct-answer', correctWord);
    quizItemDiv.setAttribute('data-word-id', wordData.id);

    let optionsHtml = options.map((option, idx) => `
        <button class="option-button" data-option-value="${option}" data-question-id="${questionNumber}">
            ${option.toUpperCase()}
        </button>
    `).join('');

    quizItemDiv.innerHTML = `
        <div class="quiz-question-number">문제 ${questionNumber}.</div>
        <div class="quiz-question-type-description">다음 밑줄 친 칸에 맞는 영어 단어는?</div>
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

// Quiz Type 4: Vowel Fill-in-the-Blank (철자 채우기 - 모음)
function createVowelFillInBlankQuizItem(wordData, questionNumber) {
    const correctWord = wordData.word.toUpperCase();
    const koreanMeaning = wordData.meaning;

    let requiredVowels = [];
    correctWord.split('').forEach(char => {
        if ('AEIOUY'.includes(char)) {
            requiredVowels.push(char);
        }
    });

    const allPossibleVowels = ['A', 'E', 'I', 'O', 'U', 'Y'];

    let finalVowelPool = [...requiredVowels];

    let currentPoolUniqueVowels = new Set(finalVowelPool);
    const minTotalVowelButtons = Math.max(requiredVowels.length + 2, 5);
    let shuffledAllPossibleVowels = shuffleArray([...allPossibleVowels]);

    for (let i = 0; i < shuffledAllPossibleVowels.length && finalVowelPool.length < minTotalVowelButtons; i++) {
        const dummyVowel = shuffledAllPossibleVowels[i];
        if (!currentPoolUniqueVowels.has(dummyVowel)) {
            finalVowelPool.push(dummyVowel);
            currentPoolUniqueVowels.add(dummyVowel);
        }
    }

    const shuffledVowels = shuffleArray(finalVowelPool);

    let blankedWordChars = correctWord.split('');
    let blankedWordHtml = '';
    let blankIndex = 0;
    for (let i = 0; i < blankedWordChars.length; i++) {
        if ('AEIOUY'.includes(blankedWordChars[i])) {
            blankedWordHtml += `<span class="vowelscramble-char vowelscramble-blank" data-blank-index="${blankIndex++}">_</span>`;
        } else {
            blankedWordHtml += `<span class="vowelscramble-char">${blankedWordChars[i]}</span>`;
        }
    }

    const quizItemDiv = document.createElement('div');
    quizItemDiv.className = 'quiz-item';
    quizItemDiv.setAttribute('data-question-type', 'vowel-fill-in-blank');
    quizItemDiv.setAttribute('data-correct-answer', correctWord);
    quizItemDiv.setAttribute('data-word-id', wordData.id);

    quizItemDiv.innerHTML = `
        <div class="quiz-question-number">문제 ${questionNumber}.</div>
        <div class="quiz-question-type-description">단어 빈칸에 맞는 영어 모음(A,E,I,O,U,Y)을 채우세요.</div>
        <div class="quiz-question-text">의미: <span class="meaning-to-guess">${koreanMeaning}</span>
            <button class="listen-button" onclick="speakText('${koreanMeaning}', 'ko-KR')">🔊</button>
            ${wordData.word_kk_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.word_kk_audio_url}')">🎧</button>` : ''}
        </div>
        <div class="vowelscramble-word-area" data-question-id="${questionNumber}">
            ${blankedWordHtml}
        </div>
        <div class="vowel-pool">
            ${shuffledVowels.map((vowel, idx) => `<button class="text-button-3d vowel-pool-button" data-vowel="${vowel}" data-pool-index="${idx}">${vowel}</button>`).join('')}
        </div>
        <div class="quiz-feedback" style="display:none;"></div>
        <div class="quiz-answer-details" style="display:none;">
            <p>정답: <span class="correct-word">${correctWord}</span> (${koreanMeaning})</p>
            <p>예문: ${wordData.eng_example} (${wordData.kor_example})</p>
            <button class="listen-button" onclick="speakText('${correctWord}', 'en-US')">🔊 단어</button>
            ${wordData.word_ee_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.word_ee_audio_url}')">🎧 단어 MP3</button>` : ''}
            <button class="listen-button" onclick="speakText('${wordData.eng_example}', 'en-US')">🔊 예문</button>
            ${wordData.eng_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.eng_example_audio_url}')">🎧 예문 MP3</button>` : ''}
            <button class="listen-button" onclick="speakText('${wordData.kor_example}', 'ko-KR')">🔊 한글 예문</button>
            ${wordData.kor_example_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.kor_example_audio_url}')">🎧 한글 예문 MP3</button>` : ''}
        </div>
        <div class="per-question-controls">
            <button class="action-button show-answer-button" onclick="toggleAnswerAndDetails(${questionNumber})">정답/해설 보기</button>
        </div>
    `;

    const vowelPool = quizItemDiv.querySelector('.vowel-pool');
    const blanksArea = quizItemDiv.querySelector('.vowelscramble-word-area');
    const blankElements = blanksArea.querySelectorAll('.vowelscramble-blank');

    const updateUserAnswer = () => {
        const reconstructedWord = Array.from(blanksArea.querySelectorAll('.vowelscramble-char')).map(span => {
            return span.textContent === '_' ? '' : span.textContent;
        }).join('');
        userAnswers[questionNumber] = reconstructedWord.toUpperCase();
    };

    vowelPool.querySelectorAll('.vowel-pool-button').forEach(button => {
        button.addEventListener('click', () => {
            const vowel = button.getAttribute('data-vowel');
            const poolIndex = button.getAttribute('data-pool-index');
            for (let i = 0; i < blankElements.length; i++) {
                if (blankElements[i].textContent === '_') {
                    blankElements[i].textContent = vowel;
                    button.disabled = true;
                    button.classList.add('selected');
                    blankElements[i].setAttribute('data-source-pool-index', poolIndex);
                    updateUserAnswer();
                    return;
                }
            }
        });
    });

    blankElements.forEach(blank => {
        blank.addEventListener('click', () => {
            if (blank.textContent !== '_') {
                const returnedVowel = blank.textContent;
                const sourcePoolIndex = blank.getAttribute('data-source-pool-index');

                blank.textContent = '_';
                const correspondingVowelButton = vowelPool.querySelector(`.vowel-pool-button[data-pool-index="${sourcePoolIndex}"]`);
                if (correspondingVowelButton) {
                    correspondingVowelButton.disabled = false;
                    correspondingVowelButton.classList.remove('selected');
                }
                blank.removeAttribute('data-source-pool-index');
                updateUserAnswer();
            }
        });
    });

    userAnswers[questionNumber] = '';

    return quizItemDiv;
}


// Quiz Type 5: Image + Korean Meaning to English Word (Listening Quiz)
function createListeningQuizItem(wordData, questionNumber) {
    const correctEnglishWord = wordData.word;
    const koreanMeaning = wordData.meaning;
    const imageUrl = wordData.image_url;
    const correctAudioUrl = wordData.word_ee_audio_url;
    const highlightedEnglishExample = getHighlightedExample(wordData.eng_example, correctEnglishWord);

    const distractorWords = getDistractors(wordData, quizAllWordsData, 3, 'word', true);

    let optionsWithAudio = [];
    optionsWithAudio.push({ word: correctEnglishWord, audioUrl: correctAudioUrl });

    distractorWords.forEach(dWord => {
        const distractorWordData = quizAllWordsData.find(wd => wd.word === dWord);
        if (distractorWordData && distractorWordData.word_ee_audio_url) {
            optionsWithAudio.push({ word: dWord, audioUrl: distractorWordData.word_ee_audio_url });
        } else {
            console.warn(`No audio URL found for distractor word: ${dWord}. Skipping.`);
        }
    });

    while (optionsWithAudio.length < 4 && quizAllWordsData.length > 0) {
        const potentialRandomWords = shuffleArray(quizAllWordsData.filter(wd =>
            !optionsWithAudio.some(opt => opt.word === wd.word) && wd.word_ee_audio_url
        ));
        
        if (potentialRandomWords.length > 0) {
            optionsWithAudio.push({ word: potentialRandomWords[0].word, audioUrl: potentialRandomWords[0].word_ee_audio_url });
        } else {
            break;
        }
    }

    optionsWithAudio = shuffleArray(optionsWithAudio);

    const quizItemDiv = document.createElement('div');
    quizItemDiv.className = 'quiz-item';
    quizItemDiv.setAttribute('data-question-type', 'listening-quiz');
    quizItemDiv.setAttribute('data-correct-answer', correctEnglishWord);
    quizItemDiv.setAttribute('data-word-id', wordData.id);

    let optionsHtml = optionsWithAudio.map((option, idx) => `
        <button class="option-button" data-option-value="${option.word}" data-question-id="${questionNumber}" onclick="playMp3Audio('${option.audioUrl}')">
            🔊 Sound ${idx + 1}
        </button>
    `).join('');

    quizItemDiv.innerHTML = `
        <div class="quiz-question-number">문제 ${questionNumber}.</div>
        <div class="quiz-question-type-description">다음 단어의 소리를 선택하세요.</div>
        <div class="quiz-question-content-wrapper">
            ${imageUrl ? `<img src="${imageUrl}" alt="${correctEnglishWord}" class="quiz-image">` : ''}
            <div class="quiz-question-text">
                의미: <span class="meaning-to-guess">${koreanMeaning}</span>
                <button class="listen-button" onclick="speakText('${koreanMeaning}', 'ko-KR')">🔊</button>
                ${wordData.word_kk_audio_url ? `<button class="listen-button" onclick="playMp3Audio('${wordData.word_kk_audio_url}')">🎧</button>` : ''}
            </div>
        </div>
        <div class="quiz-options">${optionsHtml}</div>
        <div class="quiz-feedback" style="display:none;"></div>
        <div class="quiz-answer-details" style="display:none;">
            <p>정답: <span class="correct-word">${correctEnglishWord}</span> (${koreanMeaning})</p>
            <p>예문: ${highlightedEnglishExample} (${wordData.kor_example})</p>
            <button class="listen-button" onclick="speakText('${correctEnglishWord}', 'en-US')">🔊 영어</button>
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
function generateAndDisplayQuiz() {
    quizProblemsArea.innerHTML = '';
    submitQuizButton.style.display = 'inline-block';
    newQuizButton.style.display = 'none';
    startQuizButton.style.display = 'none'; // 퀴즈 시작 버튼 숨김

    const allUnmasteredWords = quizAllWordsData.filter(wordData =>
        !masteredWords.some(item => item.word === wordData.word.toUpperCase())
    );

    const totalQuestionsToGenerate = 20;

    if (allUnmasteredWords.length === 0) {
        quizProblemsArea.innerHTML = '<p class="loading-message">축하합니다! 모든 단어를 마스터했습니다!</p>';
        submitQuizButton.style.display = 'none';
        newQuizButton.style.display = 'none';
        return;
    }

    if (allUnmasteredWords.length < totalQuestionsToGenerate) {
        console.warn(`미학습 단어가 부족하여 ${totalQuestionsToGenerate} 문제 모두 출제 불가. ${allUnmasteredWords.length} 문제만 출제됩니다.`);
    }

    const shuffledQuizPool = shuffleArray(allUnmasteredWords).slice(0, totalQuestionsToGenerate);

    currentQuizProblems = []; // 변수 재할당
    userAnswers = {}; // 변수 재할당
    currentQuizSessionScore = { correct: 0, total: shuffledQuizPool.length }; // 변수 재할당
    document.getElementById('current-score').textContent = `0/${currentQuizSessionScore.total}`;


    const numTypesAvailable = 5;
    const baseQuestionsPerType = Math.floor(totalQuestionsToGenerate / numTypesAvailable);
    let remainingQuestions = totalQuestionsToGenerate % numTypesAvailable;

    const numType1Questions = baseQuestionsPerType + (remainingQuestions > 0 ? 1 : 0);
    if (remainingQuestions > 0) remainingQuestions--;

    const numType2Questions = baseQuestionsPerType + (remainingQuestions > 0 ? 1 : 0);
    if (remainingQuestions > 0) remainingQuestions--;

    const numType3Questions = baseQuestionsPerType + (remainingQuestions > 0 ? 1 : 0);
    if (remainingQuestions > 0) remainingQuestions--;

    const numType4Questions = baseQuestionsPerType + (remainingQuestions > 0 ? 1 : 0);
    if (remainingQuestions > 0) remainingQuestions--;

    const numType5Questions = baseQuestionsPerType + remainingQuestions;


    let quizOrderSpecs = [];
    for (let i = 0; i < numType1Questions; i++) quizOrderSpecs.push('eng-to-kor');
    for (let i = 0; i < numType2Questions; i++) quizOrderSpecs.push('kor-to-eng');
    for (let i = 0; i < numType3Questions; i++) quizOrderSpecs.push('fill-in-blank');
    for (let i = 0; i < numType4Questions; i++) quizOrderSpecs.push('vowel-fill-in-blank');
    for (let i = 0; i < numType5Questions; i++) quizOrderSpecs.push('listening-quiz');
    shuffleArray(quizOrderSpecs);

    shuffledQuizPool.forEach((wordData, index) => {
        if (index >= totalQuestionsToGenerate) return;

        const questionNumber = index + 1;
        const quizType = quizOrderSpecs[index];

        let quizItemElement;

        if (quizType === 'eng-to-kor') {
            quizItemElement = createEnglishToKoreanQuizItem(wordData, questionNumber, quizAllWordsData);
        } else if (quizType === 'kor-to-eng') {
            quizItemElement = createKoreanToEnglishQuizItem(wordData, questionNumber, quizAllWordsData);
        } else if (quizType === 'fill-in-blank') {
            quizItemElement = createSentenceFillInBlankQuizItem(wordData, questionNumber, quizAllWordsData);
        } else if (quizType === 'vowel-fill-in-blank') {
            quizItemElement = createVowelFillInBlankQuizItem(wordData, questionNumber);
        } else if (quizType === 'listening-quiz') {
            quizItemElement = createListeningQuizItem(wordData, questionNumber);
        }

        if (quizItemElement) {
            quizProblemsArea.appendChild(quizItemElement);
            currentQuizProblems.push({
                questionNumber: questionNumber,
                wordData: wordData,
                type: quizType,
                element: quizItemElement,
                result: null
            });
        }
    });
    currentQuizSessionScore.total = currentQuizProblems.length;
    document.getElementById('current-score').textContent = `0/${currentQuizSessionScore.total}`;
}


// ----------------------------------------------------------------
// 클립보드 복사 기능 (window에 직접 연결)
// ----------------------------------------------------------------
window.copyLearnedWordsToClipboard = () => {
    const masteredWordsData = JSON.parse(localStorage.getItem('masteredWords')) || [];
    if (masteredWordsData.length === 0) {
        alert("아직 학습한 단어가 없습니다.");
        return;
    }
    const textToCopy = "=== 나의 학습 기록 ===\n" +
                           masteredWordsData.map(item => `- ${item.word} (학습일: ${item.date})`).join('\n') +
                           "\n======================";

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy)
            .then(() => alert("학습 기록이 클립보드에 복사되었습니다!"))
            .catch(err => { console.error("클립보드 복사 실패:", err); alert("클립보드 복사에 실패했습니다."); });
    } else { alert("이 브라우저에서는 클립보드 복사를 지원하지 않습니다."); }
};

window.copyQuizResultToClipboard = () => {
    const currentScoreText = document.getElementById('current-score').textContent;

    const todayDate = getCurrentDateYYYYMMDD();
    const resultText = `=== 오늘(${todayDate})의 퀴즈 결과 ===\n` +
                           `점수: ${currentScoreText}\n` +
                           `==================================`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(resultText)
            .then(() => alert("오늘 퀴즈 결과가 클립보드에 복사되었습니다!"))
            .catch(err => { console.error("클립보드 복사 실패:", err); alert("클립보드 복사에 실패했습니다."); });
    } else { alert("이 브라우저에서는 클립보드 복사를 지원하지 않습니다."); }
};

// --- 정답/해설 보기 토글 함수 (window에 직접 연결) ---
window.toggleAnswerAndDetails = (questionId) => {
    const problemElement = currentQuizProblems.find(p => p.questionNumber === questionId)?.element;

    if (!problemElement) {
        console.warn(`Problem element for questionId ${questionId} not found.`);
        return;
    }

    const feedbackDiv = problemElement.querySelector('.quiz-feedback');
    const answerDetailsDiv = problemElement.querySelector('.quiz-answer-details');
    const showButton = problemElement.querySelector('.show-answer-button');

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

// --- 성적표 모달 표시/숨기기 함수 (window에 직접 연결) ---
window.showScoreReportModal = () => {
    scorecardGrid.innerHTML = '';
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    currentQuizProblems.forEach(problem => {
        const scorecardItem = document.createElement('div');
        scorecardItem.className = 'scorecard-item';
        scorecardItem.textContent = problem.questionNumber;

        if (problem.result === 'correct') {
            scorecardItem.classList.add('correct-mark');
            scorecardItem.innerHTML += '<span class="mark">O</span>';
            correctCount++;
        } else if (problem.result === 'incorrect') {
            scorecardItem.classList.add('incorrect-mark');
            scorecardItem.innerHTML += '<span class="mark">X</span>';
            incorrectCount++;
        } else {
            scorecardItem.classList.add('unanswered-mark');
            scorecardItem.innerHTML += '<span class="mark">?</span>';
            unansweredCount++;
        }

        scorecardGrid.appendChild(scorecardItem);
    });

    const totalScoreForModal = (currentQuizSessionScore.total > 0) ?
        (correctCount / currentQuizSessionScore.total) * 100 : 0;

    summaryCorrect.textContent = correctCount;
    summaryIncorrect.textContent = incorrectCount;

    const summaryTotalScoreElement = document.getElementById('summary-total-score');
    if (summaryTotalScoreElement) {
        summaryTotalScoreElement.textContent = totalScoreForModal.toFixed(0);
    } else {
        console.error("Error: Element with ID 'summary-total-score' not found in the HTML.");
    }

    scoreReportModal.classList.add('show-modal');
};

window.hideScoreReportModal = () => {
    scoreReportModal.classList.remove('show-modal');
};


// ----------------------------------------------------------------
// 초기화 로직: DOMContentLoaded 이벤트 발생 시 실행
// UI 요소 할당, 데이터 로드, 이벤트 리스너 등록, 초기 화면 표시 순서
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    console.log("main_quiz.js 로드됨. 초기화 시작.");

    // 1. UI 요소 할당: DOM이 완전히 로드된 후에 실행되어야 합니다.
    daySelector = document.getElementById('day-selector');
    prevDayButton = document.getElementById('prev-day-button');
    nextDayButton = document.getElementById('next-day-button');
    currentDayDisplay = document.getElementById('current-day-display');
    quizProblemsArea = document.getElementById('quiz-problems-area');
    submitQuizButton = document.getElementById('submit-quiz-button');
    newQuizButton = document.getElementById('new-quiz-button');
    startQuizButton = document.getElementById('start-quiz-button');

    scoreReportModal = document.getElementById('score-report-modal');
    scorecardGrid = document.getElementById('scorecard-grid');
    summaryCorrect = document.getElementById('summary-correct');
    summaryIncorrect = document.getElementById('summary-incorrect');
    // summaryTotalScore는 p 태그 내의 span이므로, 직접 할당할 필요 없음.

    // 2. localStorage에서 마스터한 단어 로드
    masteredWords = JSON.parse(localStorage.getItem('masteredWords')) || [];
    console.log("로컬 저장소의 마스터 단어:", masteredWords);

    // 3. 퀴즈 데이터 로드 (GitHub에서 fetch)
    try {
        console.log("GitHub에서 퀴즈 데이터 로드 시도...");
        const response = await fetch(GITHUB_PAGES_BASE_URL + 'data/flashcard_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        quizAllWordsData = await response.json();
        console.log("퀴즈 데이터 로드 완료. 총 단어 수:", quizAllWordsData.length);

    } catch (error) {
        console.error("퀴즈 데이터를 로드하는 중 오류 발생:", error);
        quizProblemsArea.innerHTML = '<p class="loading-message" style="color: red;">퀴즈 데이터를 불러올 수 없습니다. 인터넷 연결 또는 파일 경로를 확인하세요: ' + error.message + '</p>';
        // 오류 발생 시 버튼 비활성화 또는 숨김
        submitQuizButton.style.display = 'none';
        newQuizButton.style.display = 'none';
        startQuizButton.style.display = 'none';
        return; // 데이터 로드 실패 시 이후 로직 실행 중단
    }

    // 4. Day 선택기 설정 및 초기 Day 설정
    setupDaySelector(); // 모든 Day 목록을 채우고 currentDay를 설정
    updateProgressDisplay(); // 초기 진행률 표시 업데이트

    // 5. 초기 학습 화면 표시 (Day 1 또는 마지막 학습 Day)
    // 이 줄이 있어야 페이지 로드 시 학습 화면이 자동으로 열립니다.
    generateAndDisplayStudyView(currentDay); 

    // 6. UI 이벤트 리스너 등록 (모든 UI 요소와 데이터가 준비된 후에)
    daySelector.addEventListener('change', (event) => {
        currentDay = event.target.value;
        localStorage.setItem('lastViewedDay', currentDay);
        currentDayDisplay.textContent = `Day ${currentDay}`;
        generateAndDisplayStudyView(currentDay);
        updateProgressDisplay();
        window.history.pushState({ day: currentDay }, `Day ${currentDay} 영단어 퀴즈`, `?day=${currentDay}`);
    });

    prevDayButton.addEventListener('click', () => {
        const currentIndex = allDays.indexOf(currentDay);
        if (currentIndex > 0) {
            currentDay = allDays[currentIndex - 1];
            daySelector.value = currentDay;
            daySelector.dispatchEvent(new Event('change')); // change 이벤트를 발생시켜 화면 업데이트
        }
    });

    nextDayButton.addEventListener('click', () => {
        const currentIndex = allDays.indexOf(currentDay);
        if (currentIndex < allDays.length - 1) {
            currentDay = allDays[currentIndex + 1];
            daySelector.value = currentDay;
            daySelector.dispatchEvent(new Event('change')); // change 이벤트를 발생시켜 화면 업데이트
        }
    });

    startQuizButton.addEventListener('click', () => {
        generateAndDisplayQuiz();
    });
    
    // 채점 및 피드백 로직을 담당하는 submitQuizButton 이벤트 리스너
    submitQuizButton.addEventListener('click', () => {
        currentQuizSessionScore.correct = 0;
        let totalAnsweredCount = 0;
        let hasUnansweredQuestions = false;

        currentQuizProblems.forEach(problem => {
            const questionId = problem.questionNumber;
            const quizItemElement = problem.element;
            let userAnswer;

            // 사용자 답변 결정 로직
            if (problem.type === 'vowel-fill-in-blank') {
                const blanksArea = quizItemElement.querySelector('.vowelscramble-word-area');
                const reconstructedWord = Array.from(blanksArea.querySelectorAll('.vowelscramble-char')).map(span => {
                    return span.textContent === '_' ? '' : span.textContent;
                }).join('');
                userAnswer = reconstructedWord.toUpperCase();
            } else {
                const selectedButton = quizItemElement.querySelector('.option-button.selected');
                userAnswer = selectedButton ? selectedButton.getAttribute('data-option-value') : undefined;
            }

            const correctAnswer = quizItemElement.getAttribute('data-correct-answer');
            const feedbackDiv = quizItemElement.querySelector('.quiz-feedback');
            const answerDetailsDiv = quizItemElement.querySelector('.quiz-answer-details');
            const optionButtons = quizItemElement.querySelectorAll('.option-button');
            const questionNumberDiv = quizItemElement.querySelector('.quiz-question-number');

            // UI 초기화
            if (problem.type !== 'vowel-fill-in-blank') {
                optionButtons.forEach(btn => {
                    btn.classList.remove('correct', 'incorrect');
                });
            }
            feedbackDiv.style.display = 'block';
            answerDetailsDiv.style.display = 'none'; // 기본적으로 숨김
            questionNumberDiv.classList.remove('question-correct', 'question-incorrect');

            // 정답 확인 및 피드백
            if (userAnswer === undefined || userAnswer === '' || (problem.type === 'vowel-fill-in-blank' && userAnswer.length !== correctAnswer.length)) {
                hasUnansweredQuestions = true;
                feedbackDiv.textContent = '아직 답을 선택하지 않았거나, 단어가 완성되지 않았습니다. 🤔';
                feedbackDiv.style.color = 'orange';
                problem.result = 'unanswered';
            } else {
                totalAnsweredCount++;
                if (userAnswer.toUpperCase() === correctAnswer.toUpperCase()) {
                    currentQuizSessionScore.correct++;
                    feedbackDiv.textContent = '정답입니다! 🎉';
                    feedbackDiv.style.color = 'green';
                    if (problem.type !== 'vowel-fill-in-blank') {
                        quizItemElement.querySelector(`[data-option-value="${userAnswer}"]`).classList.add('correct');
                    } else {
                        quizItemElement.querySelectorAll('.vowelscramble-char').forEach(charSpan => {
                            charSpan.classList.add('correct');
                        });
                    }
                    markWordAsMastered(problem.wordData.word);
                    questionNumberDiv.classList.add('question-correct');
                    problem.result = 'correct';
                } else {
                    feedbackDiv.textContent = '오답입니다. 😔';
                    feedbackDiv.style.color = 'red';
                    if (problem.type !== 'vowel-fill-in-blank') {
                        quizItemElement.querySelector(`[data-option-value="${userAnswer}"]`).classList.add('incorrect');
                        quizItemElement.querySelector(`[data-option-value="${correctAnswer}"]`).classList.add('correct');
                    } else {
                        const originalWordChars = correctAnswer.toUpperCase().split('');
                        quizItemElement.querySelectorAll('.vowelscramble-char').forEach((charSpan, idx) => {
                            if ('AEIOUY'.includes(originalWordChars[idx])) {
                                charSpan.textContent = originalWordChars[idx];
                            }
                            charSpan.classList.add('correct');
                        });
                        quizItemElement.querySelectorAll('.vowel-pool-button').forEach(btn => btn.disabled = true);
                    }
                    questionNumberDiv.classList.add('question-incorrect');
                    problem.result = 'incorrect';
                }
            }
        });

        const finalScorePercentage = (currentQuizSessionScore.correct / currentQuizSessionScore.total) * 100;
        document.getElementById('current-score').textContent = `${currentQuizSessionScore.correct}개 (${finalScorePercentage.toFixed(0)}점)`;

        if (hasUnansweredQuestions) {
            alert(`총 ${currentQuizProblems.length} 문제 중 ${currentQuizProblems.length - totalAnsweredCount} 문제를 아직 선택하지 않았거나, 단어가 완성되지 않았습니다.`);
            submitQuizButton.style.display = 'inline-block';
            newQuizButton.style.display = 'none';
        } else {
            submitQuizButton.style.display = 'none';
            newQuizButton.style.display = 'inline-block';

            if (currentQuizSessionScore.total > 0) {
                const scorePercentage = (currentQuizSessionScore.correct / currentQuizSessionScore.total) * 100;
                if (scorePercentage >= 80) {
                    fanfareAudio.currentTime = 0;
                    fanfareAudio.play().catch(e => console.error("Fanfare audio playback failed:", e));
                }
            }
            showScoreReportModal();
        }
        updateProgressDisplay();
    });

    newQuizButton.addEventListener('click', () => {
        generateAndDisplayQuiz();
    });

    startQuizButton.addEventListener('click', () => {
        generateAndDisplayQuiz();
    });
}); // DOMContentLoaded 끝

// --- Day 선택기 설정 및 채우기 함수 ---
// DOMContentLoaded 범위 내에 정의해야 합니다.
function setupDaySelector() {
    allDays = [...new Set(quizAllWordsData.map(word => word.day))].sort((a, b) => parseInt(a) - parseInt(b));
    daySelector.innerHTML = '';
    allDays.forEach(day => {
        const option = document.createElement('option');
        option.value = day;
        option.textContent = `Day ${day}`;
        daySelector.appendChild(option);
    });

    const urlParams = new URLSearchParams(window.location.search);
    const dayFromUrl = urlParams.get('day');

    if (dayFromUrl && allDays.includes(dayFromUrl)) {
        currentDay = dayFromUrl;
    } else {
        currentDay = localStorage.getItem('lastViewedDay') || (allDays.length > 0 ? allDays[0] : '1');
        if (!allDays.includes(currentDay) && allDays.length > 0) {
            currentDay = allDays[0];
        } else if (allDays.length === 0) {
            currentDay = '1';
            console.warn("Day 데이터가 없습니다. 기본 Day 1로 설정합니다.");
        }
    }
    daySelector.value = currentDay;
    currentDayDisplay.textContent = `Day ${currentDay}`;
    localStorage.setItem('lastViewedDay', currentDay);
    // generateAndDisplayStudyView와 updateProgressDisplay는 DOMContentLoaded에서 한 번만 호출됨
}

// --- 학습/복습 뷰 생성 함수 ---
// DOMContentLoaded 범위 내에 정의해야 합니다.
function generateAndDisplayStudyView(dayToDisplay) {
    quizProblemsArea.innerHTML = '<p class="loading-message">단어 학습 목록을 불러오는 중...</p>';
    submitQuizButton.style.display = 'none'; // 퀴즈 제출 버튼 숨김
    newQuizButton.style.display = 'none'; // 새로운 퀴즈 버튼 숨김
    startQuizButton.style.display = 'inline-block'; // 학습 시작 버튼 표시

    const wordsForThisDay = quizAllWordsData.filter(wordData => parseInt(wordData.day) === parseInt(dayToDisplay));
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
        studyItemDiv.className = 'quiz-item';
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