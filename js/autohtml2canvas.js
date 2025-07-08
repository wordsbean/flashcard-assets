// autohtml2canvas.js (자동 재생 로직 단순화 버전)

// --- Speech Synthesis (TTS) Variables ---
const synth = window.speechSynthesis;
let currentUtterance = null; 

let currentAudioQueue = [];
let currentSpeakingPromise = Promise.resolve();

const DEFAULT_CAPTURE_INTERVAL_MS = 2000; // 캡쳐 간 페이지 전환 대기 시간
const ADDITIONAL_DELAY_AFTER_LOAD_MS = 1000; // 로드 후 추가 지연 시간

let autoPlayInterval = null; // 전역 autoPlayInterval 변수는 이제 setTimeout ID만 저장

// totalLearningPages, totalPuzzleSets, maxOverallDayNumber는 HTML에 주입됨.
const totalLearningPages = typeof window.totalLearningPages !== 'undefined' ? window.totalLearningPages : 1;
const totalPuzzleSets = typeof window.totalPuzzleSets !== 'undefined' ? window.totalPuzzleSets : 1;
const maxOverallDayNumber = typeof window.maxOverallDayNumber !== 'undefined' ? window.maxOverallDayNumber : 1;

// --- Pagination Logic ---
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');

/**
 * 주어진 파일명에서 페이지 정보를 파싱합니다.
 */
function parseFilename(fullPath) {
    const parts = fullPath.split('/');
    const fileName = parts.pop();
    const subjectFolder = parts.pop();
    const dayFolder = parts.pop();

    const match = fileName.match(/^([A-Z]{2})_([A-Z]+)_(\d{4})_(\d{2})([a-z]+)\.html$/);

    if (match) {
        return {
            subjectPrefix: match[1],
            quizTypeAbbr: match[2],
            bundleNumber: parseInt(match[3]),
            pageTypeSuffixNum: parseInt(match[4]),
            pageTypeSuffixChar: match[5],
            dayNum: parseInt(dayFolder.replace('day', '')),
            basePath: parts.join('/')
        };
    }
    if (fileName === 'open.htm') return { isSpecial: true, type: 'open', dayNum: 0, subjectPrefix: 'AA', bundleNumber: 0, pageTypeSuffixNum: 0, basePath: parts.join('/') };
    if (fileName === 'intro.htm') return { isSpecial: true, type: 'intro', dayNum: 0, subjectPrefix: 'AB', bundleNumber: 0, pageTypeSuffixNum: 0, basePath: parts.join('/') };
    if (fileName === 'close.htm') return { isSpecial: true, type: 'close', dayNum: 9999, subjectPrefix: 'ZZ', bundleNumber: 9999, pageTypeSuffixNum: 99, basePath: parts.join('/') };

    console.error("Filename parsing failed for:", fileName);
    return null;
}

/**
 * 페이지네이션 버튼들의 활성화/비활성화 상태를 업데이트합니다.
 */
window.updatePaginationButtons = function() {
    const currentPageInfo = parseFilename(window.location.pathname);
    if (!currentPageInfo) {
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        return;
    }

    const currentPageNumber = window.currentPageNumber;
    const totalPages = window.totalPages;

    if (currentPageNumber <= 1) {
        prevPageBtn.disabled = true;
    } else {
        prevPageBtn.disabled = false;
    }

    if (currentPageNumber >= totalPages) {
        nextPageBtn.disabled = true;
    } else {
        nextPageBtn.disabled = false;
    }

    const pageInfoSpan = document.getElementById('pageInfo');
    if (pageInfoSpan) {
        const displayTotalPages = (typeof totalPages === 'string' && totalPages === '?') ? '?' : totalPages;
        pageInfoSpan.textContent = `페이지 ${currentPageNumber} / ${displayTotalPages}`;
    }
};


// --- 캡처/UI 도우미 함수 ---
function hideElementsForCapture() {
    const elementsToHide = [
        document.querySelector('.pagination-controls'),
        document.querySelector('.top-navigation'),
        ...document.querySelectorAll('.speaker-icon')
    ];
    elementsToHide.forEach(elem => {
        if (elem) {
            if (NodeList.prototype.isPrototypeOf(elem)) {
                elem.forEach(item => { item.style.visibility = 'hidden'; });
            } else {
                elem.style.visibility = 'hidden';
            }
        }
    });
}

function showElementsAfterCapture() {
    const elementsToShow = [
        document.querySelector('.pagination-controls'),
        document.querySelector('.top-navigation'),
        ...document.querySelectorAll('.speaker-icon')
    ];
    elementsToShow.forEach(elem => {
        if (elem) {
            if (NodeList.prototype.isPrototypeOf(elem)) {
                elem.forEach(item => { item.style.visibility = 'visible'; });
            } else {
                elem.style.visibility = 'visible';
            }
        }
    });
}

/**
 * 현재 페이지를 캡쳐하여 PNG 파일로 저장합니다.
 * @returns {Promise<void>} 캡쳐 완료 또는 실패 Promise
 */
function captureCurrentPage() {
    console.log("Capturing current page...");

    hideElementsForCapture();

    let elementToCapture = document.body;

    const currentPageInfo = parseFilename(window.location.pathname);
    if (!currentPageInfo) {
        console.warn("Could not parse current page info for capture. Capturing body.");
    } else {
        if (currentPageInfo.quizTypeAbbr === 'FC') { // Flashcard Page
            const flashcardSection = document.querySelector('.flashcard-grid-container');
            if (flashcardSection) {
                elementToCapture = flashcardSection;
                console.log("Capturing flashcard-section.");
            } else {
                console.warn("flashcard-section not found for FC, capturing body.");
            }
        } else if (currentPageInfo.quizTypeAbbr === 'WC') {
            const crosswordSection = document.querySelector('.crossword-grid-section');
            if (crosswordSection) {
                elementToCapture = crosswordSection;
                console.log("Capturing crossword-grid-section.");
            } else {
                console.warn("crossword-grid-section not found, capturing body.");
            }
        } else { // Other quiz/learning pages (adapt as needed)
            const quizContainer = document.querySelector('.main-layout-quiz'); // main-layout-quiz 또는 quiz-container
            if (quizContainer) {
                elementToCapture = quizContainer;
                console.log(`Capturing ${currentPageInfo.quizTypeAbbr} - main-layout-quiz.`);
            } else {
                console.warn(`${currentPageInfo.quizTypeAbbr} main-layout-quiz not found, capturing body.`);
            }
        }
    }
    
    return html2canvas(elementToCapture, {
        scale: 2,
        useCORS: true,
        ignoreElements: (element) => {
            return element.tagName === 'AUDIO';
        }
    }).then(canvas => {
        const link = document.createElement('a');
        const dataURL = canvas.toDataURL('image/png');
        const filename = `${currentPageInfo.subjectPrefix}_${currentPageInfo.quizTypeAbbr}_${currentPageInfo.bundleNumber.toString().padStart(4, '0')}_${currentPageInfo.pageTypeSuffixNum.toString().padStart(2, '0')}${currentPageInfo.pageTypeSuffixChar}.png`;

        link.href = dataURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log(`Page captured as ${filename}`);
        return Promise.resolve();
    }).catch(error => {
        console.error('Error capturing page:', error);
        return Promise.reject(error);
    }).finally(() => {
        showElementsAfterCapture();
    });
}


// --- 페이지 이동 함수 ---
/**
 * 다음 페이지로 이동합니다. 자동 재생 중 호출됩니다.
 */
function goToNextPageForAutoPlay() {
    if (synth.speaking) { synth.cancel(); }
    currentSpeakingPromise = Promise.resolve(); // 현재 음성 재생 중지

    const currentPageInfo = parseFilename(window.location.pathname);
    if (!currentPageInfo) {
        console.error("Cannot parse current page info for navigation.");
        stopAutoPlayInternal();
        return;
    }

    let nextBundleNumber = currentPageInfo.bundleNumber + 1;

    if (nextBundleNumber > window.totalPages) {
        console.log("Auto-play: Reached the absolute last page. Stopping auto-play.");
        stopAutoPlayInternal();
        sessionStorage.setItem('isAutoPlayActive', 'false');
        return;
    }

    const currentPathSegments = window.location.pathname.split('/');
    // 파일명만 변경하여 새 경로를 만듭니다. (Day 폴더, 과목 폴더는 유지)
    const newFileName = `${currentPageInfo.subjectPrefix}_${currentPageInfo.quizTypeAbbr}_${nextBundleNumber.toString().padStart(4, '0')}_${currentPageInfo.pageTypeSuffixNum.toString().padStart(2, '0')}${currentPageInfo.pageTypeSuffixChar}.html`;
    currentPathSegments[currentPathSegments.length - 1] = newFileName;
    
    const nextUrl = currentPathSegments.join('/');

    stopAutoPlayInternal(); // 다음 페이지로 이동 전에 현재 페이지의 타이머 중지
    window.location.href = nextUrl; // 페이지 이동
}

/**
 * 이전 페이지로 이동합니다.
 */
function goToPrevPageForAutoPlay() {
    if (synth.speaking) { synth.cancel(); }
    currentSpeakingPromise = Promise.resolve();

    const currentPageInfo = parseFilename(window.location.pathname);
    if (!currentPageInfo) {
        console.error("Cannot parse current page info for previous navigation.");
        stopAutoPlayInternal();
        return;
    }

    let prevBundleNumber = currentPageInfo.bundleNumber - 1;

    if (prevBundleNumber < 1) {
        alert("첫 번째 페이지입니다.");
        return;
    }

    const currentPathSegments = window.location.pathname.split('/');
    
    const newFileName = `${currentPageInfo.subjectPrefix}_${currentPageInfo.quizTypeAbbr}_${prevBundleNumber.toString().padStart(4, '0')}_${currentPageInfo.pageTypeSuffixNum.toString().padStart(2, '0')}${currentPageInfo.pageTypeSuffixChar}.html`;
    currentPathSegments[currentPathSegments.length - 1] = newFileName;

    const prevUrl = currentPathSegments.join('/');

    stopAutoPlayInternal();
    window.location.href = prevUrl;
}

// 자동 재생 및 캡쳐 프로세스를 내부적으로 중지합니다.
function stopAutoPlayInternal() {
    if (autoPlayInterval) {
        clearTimeout(autoPlayInterval); // setTimeout으로 변경되었으므로 clearTimeout 사용
        autoPlayInterval = null;
    }
    console.log("Auto-play internal stop triggered.");
}

/**
 * 자동 재생 버튼과 캡쳐 버튼의 display 상태를 업데이트합니다.
 */
function updateAutoPlayButtonDisplay() {
    const currentIsAutoPlaying = sessionStorage.getItem('isAutoPlayActive') === 'true';

    const manualCaptureButton = document.getElementById('manualCaptureBtn');
    const startAutoCaptureButton = document.getElementById('startAutoCaptureBtn');
    const stopAutoCaptureButton = document.getElementById('stopAutoCaptureBtn');
    
    if (!startAutoCaptureButton || !stopAutoCaptureButton || !manualCaptureButton) {
        console.warn("updateAutoPlayButtonDisplay: One or more capture/autoplay buttons not found.");
        return;
    }

    manualCaptureButton.style.display = 'inline-block';
    if (currentIsAutoPlaying) {
        startAutoCaptureButton.style.display = 'none';
        stopAutoCaptureButton.style.display = 'inline-block';
    } else {
        startAutoCaptureButton.style.display = 'inline-block';
        stopAutoCaptureButton.style.display = 'none';
    }
}


// --- TTS (Speech Synthesis) Helper Functions ---
// window.speakText는 HTML_DOC_TEMPLATE의 script 블록에서 정의되므로 여기서는 재정의하지 않습니다.

/**
 * 오디오 큐의 다음 세그먼트를 재생합니다.
 */
function playAudioQueue() {
    // isPending 상태 체크는 Promise 라이브러리에 따라 다를 수 있으므로 간단한 해결책으로 대체
    if (currentSpeakingPromise && typeof currentSpeakingPromise.then === 'function') { // Promise 객체인지 확인
        // Promise가 아직 완료되지 않았다면, 완료된 후에 playAudioQueue 재호출
        currentSpeakingPromise.then(() => playAudioQueue());
        return;
    }

    if (currentAudioQueue.length > 0) {
        const segment = currentAudioQueue.shift();

        if (!segment || !segment.text_to_speak || segment.text_to_speak.trim() === '') {
            console.log(`Skipping empty audio segment: "${segment ? segment.text_to_speak : 'N/A'}"`);
            currentSpeakingPromise = Promise.resolve().then(() => playAudioQueue());
            return;
        }

        let lang = 'en-US';
        // 언어 감지 로직 강화
        const koreanRegex = /[\uAC00-\uD7A3]/; // 한글 유니코드 범위

        if (segment.type === 'meaning_kk' || segment.type === 'koreansentences_ks' || segment.type === 'kor_meaning' || segment.type === 'kor_example') {
            lang = 'ko-KR';
        } else if (koreanRegex.test(segment.text_to_speak)) { // 텍스트에 한글이 있으면 한국어
            lang = 'ko-KR';
        } else { // 기본은 영어
            lang = 'en-US';
        }

        console.log(`Speaking: "${segment.text_to_speak}" (Type: ${segment.type}, Lang: ${lang})`);

        window.speakText(segment.text_to_speak, lang); // window.speakText는 HTML_DOC_TEMPLATE의 script 블록에서 정의
        currentSpeakingPromise = new Promise(resolve => {
            if (currentUtterance) {
                currentUtterance.onend = resolve;
                currentUtterance.onerror = resolve;
            } else {
                resolve(); // currentUtterance가 설정되지 않았다면 바로 해결 (오류 방지)
            }
        }).then(() => {
            setTimeout(() => { playAudioQueue(); }, 200); // 짧은 딜레이 후 다음 큐 재생
        });

    } else {
        console.log("Audio queue finished.");
        currentSpeakingPromise = Promise.resolve();
    }
}


/**
 * 각 단어 카드의 이미지 클릭 시 해당 카드 내의 텍스트들을 순차적으로 재생합니다.
 * 이 함수는 모든 종류의 퀴즈 아이템에 대해 동작하도록 확장되어야 합니다.
 */
window.setupClickToPlayAudio = function() {
    // 1. quiz-word-item (기본 학습 페이지)
    const quizWordItems = document.querySelectorAll('.quiz-word-item');
    quizWordItems.forEach(item => {
        const clickableTarget = item.querySelector('.quiz-image-container') || item; // 이미지 또는 카드 자체 클릭
        if (!clickableTarget) return;

        clickableTarget.style.cursor = 'pointer';
        clickableTarget.addEventListener('mouseenter', () => { clickableTarget.style.transform = 'scale(1.02)'; });
        clickableTarget.addEventListener('mouseleave', () => { clickableTarget.style.transform = 'scale(1)'; });
        clickableTarget.style.transition = 'transform 0.1s ease-out';

        clickableTarget.addEventListener('click', (event) => {
            event.stopPropagation();
            if (synth.speaking) { synth.cancel(); }
            clearTimeout(autoPlayInterval);
            currentAudioQueue = [];
            currentSpeakingPromise = Promise.resolve();

            const wordText = item.querySelector('.quiz-word-text')?.textContent.trim();
            const meaningText = item.querySelector('.quiz-meaning')?.textContent.replace('의미:', '').trim(); // 라벨 제거
            const engExampleText = item.querySelector('.quiz-example-en')?.textContent.replace('영어 예문:', '').trim(); // 라벨 제거
            const korExampleText = item.querySelector('.quiz-ko')?.textContent.replace('한글 예문:', '').trim(); // 라벨 제거

            if (wordText) currentAudioQueue.push({type: "word", text_to_speak: wordText});
            if (meaningText) currentAudioQueue.push({type: "kor_meaning", text_to_speak: meaningText});
            if (engExampleText) currentAudioQueue.push({type: "eng_example", text_to_speak: engExampleText});
            if (korExampleText) currentAudioQueue.push({type: "kor_example", text_to_speak: korExampleText});

            if (currentAudioQueue.length > 0) { playAudioQueue(); } else { console.log("No audio to play for this item."); }
        });
    });

    // 2. flashcard-item (플래시 카드 페이지)
    const flashcardItems = document.querySelectorAll('.flashcard-item');
    flashcardItems.forEach(item => {
        const clickableTarget = item.querySelector('.flashcard-image-wrapper') || item;
        if (!clickableTarget) return;

        clickableTarget.style.cursor = 'pointer';
        clickableTarget.addEventListener('mouseenter', () => { clickableTarget.style.transform = 'scale(1.02)'; });
        clickableTarget.addEventListener('mouseleave', () => { clickableTarget.style.transform = 'scale(1)'; });
        clickableTarget.style.transition = 'transform 0.1s ease-out';

        clickableTarget.addEventListener('click', (event) => {
            event.stopPropagation();
            if (synth.speaking) { synth.cancel(); }
            clearTimeout(autoPlayInterval);
            currentAudioQueue = [];
            currentSpeakingPromise = Promise.resolve();

            const wordText = item.querySelector('.flashcard-word')?.textContent.trim();
            const meaningText = item.querySelector('.flashcard-meaning')?.textContent.replace('의미:', '').trim();
            const engExampleText = item.querySelector('.flashcard-eng-example')?.textContent.replace('영어 예문:', '').trim();
            const korExampleText = item.querySelector('.flashcard-kor-example')?.textContent.replace('한글 예문:', '').trim();

            if (wordText) currentAudioQueue.push({type: "word", text_to_speak: wordText});
            if (meaningText) currentAudioQueue.push({type: "kor_meaning", text_to_speak: meaningText});
            if (engExampleText) currentAudioQueue.push({type: "eng_example", text_to_speak: engExampleText});
            if (korExampleText) currentAudioQueue.push({type: "kor_example", text_to_speak: korExampleText});

            if (currentAudioQueue.length > 0) { playAudioQueue(); } else { console.log("No audio to play for this item."); }
        });
    });
    // 다른 퍼즐 유형에 대한 클릭 리스너도 여기에 추가 (예: spellingscramble-item 등)
};


// --- DOMContentLoaded 이벤트 리스너 ---
document.addEventListener('DOMContentLoaded', () => {
    // prev/nextPageBtn은 이미 전역 변수로 선언됨
    const manualCaptureButton = document.getElementById('manualCaptureBtn');
    const startAutoCaptureButton = document.getElementById('startAutoCaptureBtn');
    const stopAutoCaptureButton = document.getElementById('stopAutoCaptureBtn');
    
    // 수동 캡처 버튼 클릭 이벤트
    if (manualCaptureButton) {
        manualCaptureButton.addEventListener('click', captureCurrentPage);
    }

    // 자동 캡처 시작 버튼 클릭 이벤트
    if (startAutoCaptureButton && stopAutoCaptureButton) {
        startAutoCaptureButton.addEventListener('click', function() {
            // 자동 재생이 이미 활성화되어 있으면 다시 시작하지 않습니다.
            if (sessionStorage.getItem('isAutoPlayActive') === 'true') {
                console.log("Auto-play is already active.");
                return;
            }
            sessionStorage.setItem('isAutoPlayActive', 'true');
            updateAutoPlayButtonDisplay(); // 버튼 상태 업데이트
            console.log("Auto-play initiated.");
            // 페이지 로드 시 window.onload에서 첫 캡처 및 페이지 이동이 시작되도록 설정
            // 여기서는 직접 시작하지 않고 상태만 설정합니다.
            // 만약 현재 페이지를 바로 캡처하고 싶다면 captureCurrentPage().then(goToNextPageForAutoPlay) 호출
            captureCurrentPage().then(() => {
                goToNextPageForAutoPlay();
            }).catch(error => {
                console.error("Error during initial capture in startAutoPlay, stopping.", error);
                stopAutoPlayInternal();
                sessionStorage.setItem('isAutoPlayActive', 'false');
            });
        });

        // 자동 캡처 정지 버튼 클릭 이벤트
        stopAutoCaptureButton.addEventListener('click', function() {
            stopAutoPlayInternal(); // 내부 타이머 중지
            sessionStorage.setItem('isAutoPlayActive', 'false'); // 상태 저장
            updateAutoPlayButtonDisplay(); // 버튼 상태 업데이트
            console.log("Auto-play stopped by user.");
        });
    } else {
        console.warn('Auto capture buttons (startAutoCaptureBtn or stopAutoCaptureBtn) not found. Auto capture functionality might be limited.');
    }

    // 다음 페이지 버튼 클릭 이벤트 (수동 또는 자동 모드일 때)
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', (event) => {
            // 자동 재생 중이면 confirm 무시하고 바로 이동 (goToNextPageForAutoPlay에서 처리)
            if (sessionStorage.getItem('isAutoPlayActive') === 'true') {
                goToNextPageForAutoPlay();
                return;
            }
            // 수동 모드일 때 퀴즈 미완료 confirm 로직 (다른 페이지용)
            // Flashcard 페이지는 퀴즈가 아니므로 confirm 건너뜀.
            goToNextPageForAutoPlay(); // 수동 클릭 시에도 다음 페이지로 이동
        });
    }

    // 이전 페이지 버튼 클릭 이벤트
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', (event) => {
            goToPrevPageForAutoPlay(); // 이전 페이지로 이동
            sessionStorage.setItem('isAutoPlayActive', 'false'); // 이전 페이지로 가면 자동 재생 중지
            updateAutoPlayButtonDisplay();
        });
    }

    // --- 초기화 및 상태 복원 ---
    window.setupClickToPlayAudio(); // 모든 클릭 오디오 재생 요소 설정
    updatePaginationButtons();

    // 페이지 로드 시 자동 재생 상태 확인 및 재시작 로직 (window.onload로 이동)
});


// --- window.onload 이벤트 리스너 ---
window.onload = () => {
    // 모든 리소스가 로드된 후 초기 버튼 display 상태를 설정합니다.
    updateAutoPlayButtonDisplay();

    // 기존 자동 재생 재개 로직
    if (sessionStorage.getItem('isAutoPlayActive') === 'true') {
        console.log("Auto-play active on load. Scheduling first action after delay...");
        setTimeout(() => {
            // 새 페이지 로드 후, 현재 페이지 캡처 및 다음 페이지로 이동 시작
            captureCurrentPage().then(() => {
                goToNextPageForAutoPlay();
            }).catch(error => {
                console.error("Error during initial capture on page load, stopping auto-play.", error);
                stopAutoPlayInternal();
                sessionStorage.setItem('isAutoPlayActive', 'false');
            });
        }, ADDITIONAL_DELAY_AFTER_LOAD_MS);
    }
};