// client/games/gyeokdol.js
// 격돌 게임 로직: 시퀀스에 맞춰 원이 줄어들 때 키 입력하기

import { playSound } from '../soundManager.js';

export function injectGyeokdolStyles() {
  // 이미 로드된 CSS인지 확인 (중복 로드 방지)
  if (!document.getElementById('gyeokdol-styles')) {
    const linkElement = document.createElement('link');
    linkElement.id = 'gyeokdol-styles';
    linkElement.rel = 'stylesheet';
    linkElement.type = 'text/css';
    linkElement.href = '/client/games/gyeokdol.css'; // CSS 파일 경로 (프로젝트 구조에 맞게 조정 필요)
    document.head.appendChild(linkElement);
  }
}

export default class GyeokdolGame {
  constructor(socket, gameContainer) {
    this.socket = socket;
    this.gameContainer = gameContainer;
    this.isGameActive = false;
    this.difficulty = 'normal'; // 'normal' 또는 'hard'
    this.timeLimit = 20; // 제한시간 20초
    this.timeLeft = 20;
    this.currentPatternIndex = 0;
    this.keySequenceIndex = 0; // 현재 패턴 내 키 인덱스
    this.score = 0;
    this.perfectHits = 0;
    this.goodHits = 0; // 추가: 타이밍이 조금 빗나갔지만 성공한 경우
    this.missHits = 0;
    this.patternSequences = [];
    this.totalPatterns = 0;
    this.animationFrame = null;
    this.timerInterval = null;
    this.lastFrameTime = 0;
    this.ringScale = 3; // 현재 링 크기
    this.lastTick = null;
    this.inputCooldown = false;
    this.waitingForInput = false;
    this.startTime = 0;
    this.endTime = 0;
    this.nextKeyDisplayed = false; // 다음 키가 표시되었는지 여부
    this.currentKey = ''; // 현재 눌러야 할 키
    this.patternStartTime = 0; // 현재 패턴 시작 시간
    this.keyChangeTime = 0; // 키 변경 시간
    this.isKamen = false; // 카멘 모드 여부
    this.kamenGate = 3; // 카멘 관문 (3 또는 4)
    
    // 새로 추가된 속성 - 연속 키 및 위치 지원
    this.currentKeyPosition = 'center'; // 키 위치: 'left', 'center', 'right'
    this.activeKeys = []; // 현재 활성화된 모든 키 (연속 키 지원)
    this.keyPositions = {}; // 각 키의 위치 정보
    
    // 바인딩
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.initGame = this.initGame.bind(this);
    this.endGame = this.endGame.bind(this);
    this.gameLoop = this.gameLoop.bind(this);
    this.updateTimer = this.updateTimer.bind(this);
    this.generatePatterns = this.generatePatterns.bind(this);
    
    // 소켓 이벤트 리스너
    this.socket.on('gyeokdol_init', this.initGame);
  }

  
  
  // 게임 초기화
  initGame(data) {
    this.clearGameArea();
    this.isGameActive = true;
    this.difficulty = data.difficulty || 'normal';
    this.isKamen = data.isKamen || false; // 카멘 모드 여부
    this.kamenGate = data.kamenGate || 3; // 카멘 관문 (기본값 3)
    
    this.timeLimit = this.difficulty === 'normal' ? 20 : 25;
    this.timeLeft = this.timeLimit;
    this.currentPatternIndex = 0;
    this.keySequenceIndex = 0;
    this.score = 0;
    this.perfectHits = 0;
    this.goodHits = 0;
    this.missHits = 0;
    this.inputCooldown = false;
    this.waitingForInput = false;
    this.nextKeyDisplayed = false;
    this.ringScale = 3;
    
    // 패턴 생성
    this.generatePatterns();
    
    // UI 생성
    this.createGameUI();
    
    // 키보드 이벤트 리스너 등록
    document.addEventListener('keydown', this.handleKeyDown);
    
    // 게임 루프 시작
    this.startTime = Date.now();
    this.patternStartTime = Date.now();
    this.lastFrameTime = performance.now();
    this.startGameLoop();
    
    // 타이머 시작
    this.startTimer();
    
    // 첫 패턴 시작
    this.startNextPattern();
    
    // 시작 사운드 재생
    playSound('start');
    
    // 시스템 메시지로 게임 시작 알림
    const gameTypeMsg = this.difficulty === 'normal' ? 'QWER 키로' : 'QWERASDF 키로';
    const kamenMsg = this.isKamen ? `카멘 ${this.kamenGate}관문 격돌` : '격돌';
    const messageEvent = new CustomEvent('system-message', {
      detail: { message: `${kamenMsg} 게임이 시작되었습니다! ${gameTypeMsg} 원이 정확한 크기일 때 눌러주세요!` }
    });
    document.dispatchEvent(messageEvent);
  }
  
  // 패턴 생성
  generatePatterns() {
    // 카멘 모드일 경우와 일반 모드일 경우 구분
    if (this.isKamen) {
      this.generateKamenPatterns();
    } else {
      this.generateRegularPatterns();
    }
    
    // 로그로 생성된 패턴 확인
    console.log("생성된 패턴:", this.patternSequences);
  }
  
  // 일반 격돌 패턴 생성 함수 업데이트
generateRegularPatterns() {
  // 라운드별 패턴 수
  this.totalPatterns = this.difficulty === 'normal' ? 8 : 12;
  
  // 패턴 템플릿 (타이밍/키 sequence)
  // [키, 지속시간(ms), 위치]의 배열로 구성
  
  const normalPatterns = [
    // 패턴 1: 기본 4비트 패턴
    [
      ['q', 1500, 'center'], ['w', 1500, 'center'], ['e', 1500, 'center'], ['r', 1500, 'center']
    ],
    // 패턴 2: 빠른 리듬
    [
      ['q', 1200, 'center'], ['w', 1200, 'center'], ['e', 1200, 'center'], ['r', 1200, 'center']
    ],
    // 패턴 3: 불규칙 패턴
    [
      ['q', 1800, 'left'], ['w', 1200, 'right'], ['e', 1500, 'center'], ['r', 1200, 'left']
    ],
    // 패턴 4: 연속 패턴 (q가 연속으로)
    [
      ['q', 1300, 'left'], ['q', 800, 'center'], ['q', 800, 'right'],
      ['w', 1200, 'center']
    ],
    // 패턴 5: 다중 위치 패턴
    [
      ['q', 1500, 'left'], ['w', 1400, 'right'],
      ['e', 1300, 'left'], ['r', 1200, 'right']
    ]
  ];
  
  const hardPatterns = [
    // 패턴 1: 8키 패턴 (다양한 위치)
    [
      ['q', 1500, 'left'], ['w', 1400, 'center'], ['e', 1300, 'right'], ['r', 1200, 'center'],
      ['a', 1300, 'right'], ['s', 1200, 'left'], ['d', 1100, 'center'], ['f', 1000, 'right']
    ],
    // 패턴 2: 교차 패턴
    [
      ['q', 1400, 'left'], ['a', 1300, 'center'], ['w', 1200, 'right'], ['s', 1100, 'center'],
      ['e', 1300, 'left'], ['d', 1200, 'center'], ['r', 1100, 'right'], ['f', 1000, 'left']
    ],
    // 패턴 3: 빠른 패턴
    [
      ['q', 1200, 'center'], ['w', 1100, 'center'], ['e', 1000, 'center'], ['r', 900, 'center'],
      ['a', 1100, 'center'], ['s', 1000, 'center'], ['d', 900, 'center'], ['f', 800, 'center']
    ],
    // 패턴 4: 연속 패턴 (하드)
    [
      ['q', 1100, 'left'], ['q', 700, 'center'], ['q', 700, 'right'],
      ['w', 1100, 'right'], ['w', 700, 'center'], ['w', 700, 'left'],
      ['e', 1000, 'center'], ['r', 900, 'center']
    ],
    // 패턴 5: 복합 연속 패턴
    [
      ['a', 1200, 'left'], ['s', 1000, 'left'], ['d', 1000, 'left'],
      ['q', 1200, 'right'], ['w', 1000, 'right'], ['e', 1000, 'right'],
      ['r', 1200, 'center'], ['f', 1000, 'center']
    ]
  ];
  
  // 난이도에 따라 패턴 선택
  const patternSet = this.difficulty === 'normal' ? normalPatterns : hardPatterns;
  
  // 필요한 수만큼 패턴 랜덤 선택 및 수정
  this.patternSequences = [];
  for (let i = 0; i < this.totalPatterns; i++) {
    // 패턴 랜덤 선택 - 깊은 복사 사용
    const randomPattern = JSON.parse(JSON.stringify(patternSet[Math.floor(Math.random() * patternSet.length)]));
    
    // 난이도에 따른 속도 조정 (라운드가 올라갈수록 빨라짐)
    const speedMultiplier = 1 - (Math.min(i, 7) * 0.05); // 최대 35% 빨라짐
    
    // 패턴 속도 조정
    const adjustedPattern = randomPattern.map(([key, time, position]) => [
      key,
      Math.max(600, Math.floor(time * speedMultiplier)), // 최소 600ms
      position
    ]);
    
    this.patternSequences.push(adjustedPattern);
  }
}

// 카멘 격돌 패턴 생성 함수 업데이트
generateKamenPatterns() {
  this.patternSequences = [];
  
  // 가능한 위치 목록
  const positions = ['left', 'center', 'right'];
  
  // 카멘 3관문 패턴
  if (this.kamenGate === 3) {
    // 하드카멘 (8키 - qwer asdf) -3관문
    const allKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
    const qwerKeys = ['q', 'w', 'e', 'r'];
    
    // 1격 - 8키 / 빠른 4키 / 빠른 4키
    const pattern1 = [];
    // 8키 패턴 (다양한 위치)
    allKeys.forEach((key, index) => {
      pattern1.push([key, 1200, positions[index % 3]]);
    });
    this.patternSequences.push(pattern1);
    
    // 빠른 4키 패턴 1 (다양한 위치)
    const pattern2 = [];
    qwerKeys.forEach((key, index) => {
      pattern2.push([key, 900, positions[index % 3]]); // 빠른 속도
    });
    this.patternSequences.push(pattern2);
    
    // 빠른 4키 패턴 2 (다양한 위치)
    const pattern3 = [];
    qwerKeys.forEach((key, index) => {
      pattern3.push([key, 850, positions[(index + 1) % 3]]); // 더 빠른 속도
    });
    this.patternSequences.push(pattern3);
    
    // 2격 - 특별 패턴: 'q' 연속 패턴
    const pattern4 = [];
    pattern4.push(['q', 1000, 'left']);
    pattern4.push(['q', 800, 'center']);
    pattern4.push(['q', 800, 'right']);
    pattern4.push(['q', 700, 'center']);
    pattern4.push(['w', 1000, 'center']);
    pattern4.push(['e', 900, 'left']);
    pattern4.push(['r', 800, 'right']);
    pattern4.push(['q', 700, 'center']);
    this.patternSequences.push(pattern4);
    
    // 4키 + 4키 패턴 (다양한 위치)
    const pattern5 = [];
    qwerKeys.forEach((key, index) => {
      pattern5.push([key, 1000, positions[index % 3]]);
    });
    qwerKeys.forEach((key, index) => {
      pattern5.push([key, 950, positions[(index + 1) % 3]]);
    });
    this.patternSequences.push(pattern5);
    
    // 4키4키 패턴 (더 빠르게)
    const pattern6 = [];
    qwerKeys.forEach((key, index) => {
      pattern6.push([key, 900, positions[index % 3]]);
    });
    qwerKeys.forEach((key, index) => {
      pattern6.push([key, 850, positions[(index + 1) % 3]]);
    });
    this.patternSequences.push(pattern6);
    
    // 지파격 - 8키 / 8키
    // 8키 패턴 1
    const pattern7 = [];
    allKeys.forEach((key, index) => {
      pattern7.push([key, 1100, positions[index % 3]]);
    });
    this.patternSequences.push(pattern7);
    
    // 8키 패턴 2
    const pattern8 = [];
    allKeys.forEach((key, index) => {
      pattern8.push([key, 1000, positions[(index + 1) % 3]]);
    });
    this.patternSequences.push(pattern8);
    
    // 막격 - 빠른 4키 / 4키 4키 / 4키 4키 4키
    // 빠른 4키 패턴
    const pattern9 = [];
    qwerKeys.forEach((key, index) => {
      pattern9.push([key, 800, positions[index % 3]]); // 매우 빠른 속도
    });
    this.patternSequences.push(pattern9);
    
    // 4키 4키 패턴
    const pattern10 = [];
    qwerKeys.forEach((key, index) => {
      pattern10.push([key, 950, positions[index % 3]]);
    });
    qwerKeys.forEach((key, index) => {
      pattern10.push([key, 900, positions[(index + 1) % 3]]);
    });
    this.patternSequences.push(pattern10);
    
    // 4키 4키 4키 패턴
    const pattern11 = [];
    qwerKeys.forEach((key, index) => {
      pattern11.push([key, 925, positions[index % 3]]);
    });
    qwerKeys.forEach((key, index) => {
      pattern11.push([key, 900, positions[(index + 1) % 3]]);
    });
    qwerKeys.forEach((key, index) => {
      pattern11.push([key, 875, positions[(index + 2) % 3]]);
    });
    this.patternSequences.push(pattern11);
    
  } else if (this.kamenGate === 4) {
    // 카멘 4관문 패턴 (연속 Q 패턴 포함)
    const qwerKeys = ['q', 'w', 'e', 'r'];
    
    // 1격 - 느린 4키 / Q QQ QQQ
    // 느린 4키 패턴
    const pattern1 = [];
    qwerKeys.forEach((key, index) => {
      pattern1.push([key, 1800, positions[index % 3]]); // 느린 속도
    });
    this.patternSequences.push(pattern1);
    
    // Q QQ QQQ 패턴 (Q 하나, Q 두개, Q 세개 순서) - 이미지에서 보이는 패턴
    const pattern2 = [];
    pattern2.push(['q', 1500, 'left']);
    pattern2.push(['q', 1300, 'center']);
    pattern2.push(['q', 1300, 'right']);
    pattern2.push(['q', 1200, 'left']);
    pattern2.push(['q', 1200, 'center']);
    pattern2.push(['q', 1200, 'right']);
    this.patternSequences.push(pattern2);
    
    // 2격 - 4키 / 4키
    // 4키 패턴 1
    const pattern3 = [];
    qwerKeys.forEach((key, index) => {
      pattern3.push([key, 1200, positions[index % 3]]);
    });
    this.patternSequences.push(pattern3);
    
    // 4키 패턴 2 (빠르게)
    const pattern4 = [];
    qwerKeys.forEach((key, index) => {
      pattern4.push([key, 1000, positions[(index + 1) % 3]]);
    });
    this.patternSequences.push(pattern4);
  }
  
  // 총 패턴 수 설정
  this.totalPatterns = this.patternSequences.length;
}
  
  // 게임 UI 생성 함수 업데이트
createGameUI() {
  // 메인 컨테이너
  const gameArea = document.createElement('div');
  gameArea.className = 'gyeokdol-container';
  
  // 카멘 모드일 경우 스타일 추가
  if (this.isKamen) {
    gameArea.classList.add('kamen-mode');
  }
  
  let gameTitle = '격돌';
  if (this.isKamen) {
    gameTitle = `카멘 ${this.kamenGate}관문 격돌`;
  }
  
  gameArea.innerHTML = `
    <h2>${gameTitle}</h2>
    <div class="difficulty-badge">${this.difficulty === 'normal' ? '노말' : '하드'}</div>
    <div class="timer-display">남은 시간: <span id="gyeokdol-timer">${this.timeLimit}</span>초</div>
    
    <div class="progress-display">
      <div class="progress-text">패턴: <span id="pattern-count">1</span>/${this.totalPatterns}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${(this.currentPatternIndex/this.totalPatterns) * 100}%"></div>
      </div>
    </div>
    
    <div class="score-display">
      <div>점수: <span id="gyeokdol-score">0</span></div>
      <div class="stats">
        <span class="perfect">PERFECT: <span id="perfect-count">0</span></span>
        <span class="good">GOOD: <span id="good-count">0</span></span>
        <span class="miss">MISS: <span id="miss-count">0</span></span>
      </div>
    </div>
    
    <div class="ring-container">
      <div class="ring-left">
        <div class="target-ring"></div>
        <div class="moving-ring"></div>
        <div class="key-display"></div>
      </div>
      <div class="ring-center">
        <div class="target-ring"></div>
        <div class="moving-ring"></div>
        <div class="key-display"></div>
      </div>
      <div class="ring-right">
        <div class="target-ring"></div>
        <div class="moving-ring"></div>
        <div class="key-display"></div>
      </div>
    </div>
    
    <div class="hit-indicator"></div>
    
    <div class="hint-text">
      ${this.difficulty === 'normal' 
        ? 'Q, W, E, R 키를 정확한 타이밍에 눌러주세요!' 
        : 'Q, W, E, R, A, S, D, F 키를 정확한 타이밍에 눌러주세요!'}
      <br>다양한 위치에 표시되는 원을 따라가세요!
    </div>
  `;
  
  this.gameContainer.appendChild(gameArea);
}

// 타이머 시작
startTimer() {
  // 기존 타이머 제거
  if (this.timerInterval) {
    clearInterval(this.timerInterval);
  }
  
  this.timerInterval = setInterval(() => {
    this.updateTimer();
  }, 100); // 0.1초마다 업데이트
}

// 타이머 업데이트
updateTimer() {
  const timeElapsed = (Date.now() - this.startTime) / 1000;
  this.timeLeft = Math.max(0, this.timeLimit - timeElapsed);
  
  const timerElement = document.getElementById('gyeokdol-timer');
  if (timerElement) {
    timerElement.textContent = this.timeLeft.toFixed(1);
  }
  
  // 프로그레스 바 업데이트 (시간에 따라)
  const progressFill = document.querySelector('.progress-fill');
  if (progressFill) {
    const progressPercent = (this.timeLeft / this.timeLimit) * 100;
    progressFill.style.width = `${progressPercent}%`;
  }
  
  // 시간이 다 되면 게임 종료
  if (this.timeLeft <= 0) {
    this.endGame();
  }
  
  // 시간이 얼마 안 남았을 때 경고음
  if (this.timeLeft <= 3 && this.timeLeft > 0) {
    const intSeconds = Math.ceil(this.timeLeft);
    if (this.lastTick !== intSeconds) {
      this.lastTick = intSeconds;
      playSound('tick');
    }
  }
}

// 게임 루프 시작
startGameLoop() {
  // this 바인딩 문제 해결을 위해 바인딩된 함수 사용
  this.boundGameLoop = this.gameLoop.bind(this);
  this.animationFrame = requestAnimationFrame(this.boundGameLoop);
}

// 게임 루프
gameLoop(timestamp) {
  if (!this.isGameActive) return;
  
  // 시간 차이 계산
  const deltaTime = timestamp - this.lastFrameTime;
  this.lastFrameTime = timestamp;
  
  // 활성화된 모든 링 업데이트
  this.updateActiveRings(deltaTime);
  
  // 다음 프레임
  this.animationFrame = requestAnimationFrame(this.boundGameLoop);
}

// 활성화된 모든 링 업데이트
updateActiveRings(deltaTime) {
  // 현재 활성화된 모든 링에 대해 반복
  for (let i = 0; i < this.activeRings.length; i++) {
    const ring = this.activeRings[i];
    
    // 경과 시간 계산
    const elapsedTime = Date.now() - ring.startTime;
    const progress = Math.min(elapsedTime / ring.duration, 1);
    
    // 링 크기 계산 (3.0 -> 1.0으로 줄어듦)
    ring.scale = 3 - (2 * progress);
    
    // 링 렌더링
    this.renderRing(ring);
    
    // 시간이 다 되면 자동으로 실패 처리
    if (progress >= 1 && !ring.processed) {
      ring.processed = true; // 처리 완료 표시
      this.handleMiss(ring);
    }
  }
  
  // 처리 완료된 링 제거
  this.activeRings = this.activeRings.filter(ring => !ring.processed);
}

// 링 렌더링
renderRing(ring) {
  const position = ring.position;
  const ringElement = document.querySelector(`.moving-ring[data-position="${position}"]`);
  
  if (ringElement) {
    ringElement.style.transform = `scale(${ring.scale})`;
    ringElement.style.opacity = '1';
    
    // 링이 활성화된 상태임을 표시
    ringElement.classList.add('active');
    
    // 키 표시
    const keyDisplay = ringElement.parentElement.querySelector('.key-display');
    if (keyDisplay) {
      keyDisplay.textContent = ring.key.toUpperCase();
      keyDisplay.style.opacity = '1';
    }
  }
}

// 다음 패턴 시작
startNextPattern() {
  if (!this.isGameActive || this.currentPatternIndex >= this.totalPatterns) {
    return this.endGame();
  }
  
  // 패턴 내 키 인덱스 초기화
  this.keySequenceIndex = 0;
  
  // 다음 키 시작
  this.showNextKey();
}

// 다음 키 표시 (연속 키 및 위치 지원)
showNextKey() {
  // 현재 패턴에서 다음 키 가져오기
  const currentPattern = this.patternSequences[this.currentPatternIndex];
  
  // 패턴의 모든 키를 완료했는지 확인
  if (this.keySequenceIndex >= currentPattern.length) {
    // 다음 패턴으로 이동
    this.currentPatternIndex++;
    
    // 모든 패턴이 끝나면 게임 종료
    if (this.currentPatternIndex >= this.totalPatterns) {
      // 2초 후 게임 종료
      setTimeout(() => {
        this.endGame();
      }, 2000);
      return;
    }
    
    // 일정 시간 후 다음 패턴 시작
    setTimeout(() => {
      this.startNextPattern();
    }, 800);
    
    return;
  }
  
  // 현재 키, 지속 시간, 위치 설정
  const [key, duration, position] = currentPattern[this.keySequenceIndex];
  
  // 새 링 객체 생성
  const newRing = {
    key: key,
    duration: duration,
    position: position || 'center', // 위치가 없으면 중앙
    scale: 3.0,
    startTime: Date.now(),
    processed: false
  };
  
  // 활성화된 링 목록에 추가
  this.activeRings.push(newRing);
  
  // 키 표시 사운드
  playSound('flip');
  
  // 키 인덱스 증가
  this.keySequenceIndex++;
  
  // 연속 키를 위한 딜레이 계산 (연속 키는 더 빠르게 출현)
  const nextKeyDelay = this.calculateNextKeyDelay(currentPattern, this.keySequenceIndex);
  
  // 일정 시간 후 다음 키 표시
  setTimeout(() => {
    this.showNextKey();
  }, nextKeyDelay);
}

// 다음 키 딜레이 계산 (연속 키인 경우 빠르게)
calculateNextKeyDelay(pattern, index) {
  // 패턴이 끝나면 딜레이 없음
  if (index >= pattern.length) return 0;
  
  const currentKey = pattern[index - 1][0];
  const nextKey = pattern[index][0];
  
  // 같은 키가 연속해서 나오는 경우 (예: Q QQ QQQ)
  if (currentKey === nextKey) {
    // 빠른 딜레이 (300ms)
    return 300;
  } else {
    // 일반 딜레이 (600ms)
    return 600;
  }
}

// 키 입력 처리
handleKeyDown(event) {
  if (!this.isGameActive || this.inputCooldown) return;
  
  const pressedKey = event.key.toLowerCase();
  
  // 유효한 키인지 확인
  const validKeys = this.difficulty === 'normal' ? ['q', 'w', 'e', 'r'] : ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
  if (!validKeys.includes(pressedKey)) return;
  
  // 압력된 키와 일치하는 활성화된 링 찾기
  let matchedRing = null;
  for (let i = 0; i < this.activeRings.length; i++) {
    if (this.activeRings[i].key === pressedKey && !this.activeRings[i].processed) {
      matchedRing = this.activeRings[i];
      break;
    }
  }
  
  if (matchedRing) {
    // 타이밍 판정
    const ringScale = matchedRing.scale;
    const diff = Math.abs(ringScale - 1.0);
    
    if (diff < 0.2) {
      // Perfect 판정
      this.handlePerfect(matchedRing);
    } else if (diff < 0.5) {
      // Good 판정
      this.handleGood(matchedRing);
    } else {
      // Miss 판정 (타이밍 부정확)
      this.handleMiss(matchedRing);
    }
  } else {
    // 잘못된 키 입력
    this.showHitIndicator('wrong', `${pressedKey.toUpperCase()}는 틀린 키`);
    playSound('user'); // 오류 사운드
  }
}

// Perfect 판정 처리
handlePerfect(ring) {
  // 링 처리 완료 표시
  ring.processed = true;
  
  // 현재 위치의 링 비활성화
  this.deactivateRing(ring.position);
  
  // 판정 표시
  this.showHitIndicator('perfect', 'PERFECT!');
  
  // 점수 증가
  this.score += 100;
  this.perfectHits++;
  
  // 성공 사운드
  playSound('move');
  
  // 점수 및 카운트 업데이트
  this.updateScore();
}

// Good 판정 처리
handleGood(ring) {
  // 링 처리 완료 표시
  ring.processed = true;
  
  // 현재 위치의 링 비활성화
  this.deactivateRing(ring.position);
  
  // 판정 표시
  this.showHitIndicator('good', 'GOOD!');
  
  // 점수 증가
  this.score += 50;
  this.goodHits++;
  
  // 성공 사운드
  playSound('move');
  
  // 카운트 업데이트
  const goodCountElement = document.getElementById('good-count');
  if (goodCountElement) {
    goodCountElement.textContent = this.goodHits;
  }
  
  // 점수 업데이트
  this.updateScore();
}

// Miss 판정 처리
handleMiss(ring) {
  // ring 파라미터 사용
  if (ring) {
    ring.processed = true;
    this.deactivateRing(ring.position);
  }
  
  // 판정 표시
  this.showHitIndicator('miss', 'MISS!');
  
  // 실패 카운트 증가
  this.missHits++;
  
  // 실패 사운드
  playSound('user');
  
  // 카운트 업데이트
  const missCountElement = document.getElementById('miss-count');
  if (missCountElement) {
    missCountElement.textContent = this.missHits;
  }
}

// 판정 표시
showHitIndicator(type, text) {
  const indicator = document.querySelector('.hit-indicator');
  if (indicator) {
    indicator.textContent = text;
    indicator.className = 'hit-indicator'; // 클래스 초기화
    indicator.classList.add(type);
    
    // 애니메이션 효과
    indicator.style.animation = 'none';
    setTimeout(() => {
      indicator.style.animation = 'pop-in-out 0.5s ease-out';
    }, 10);
  }
}

// 점수 업데이트
updateScore() {
  const scoreElement = document.getElementById('gyeokdol-score');
  const perfectCountElement = document.getElementById('perfect-count');
  
  if (scoreElement) {
    scoreElement.textContent = this.score;
  }
  
  if (perfectCountElement) {
    perfectCountElement.textContent = this.perfectHits;
  }
}

// 게임 종료
endGame() {
  if (!this.isGameActive) return;
  
  this.isGameActive = false;
  this.endTime = Date.now();
  
  // 애니메이션 취소
  if (this.animationFrame) {
    cancelAnimationFrame(this.animationFrame);
  }
  
  // 타이머 중지
  if (this.timerInterval) {
    clearInterval(this.timerInterval);
  }
  
  // 키보드 이벤트 리스너 제거
  document.removeEventListener('keydown', this.handleKeyDown);
  
  // 소요 시간 계산
  const timeElapsed = (this.endTime - this.startTime) / 1000;
  
  // 정확도 계산
  const totalAttempts = this.perfectHits + this.goodHits + this.missHits;
  const accuracy = totalAttempts > 0 
    ? ((this.perfectHits * 1 + this.goodHits * 0.6) / totalAttempts) * 100 
    : 0;
  
  // 최종 점수 = 기본 점수 + 보너스 (정확도와 남은 시간에 따라)
  const timeBonus = Math.max(0, Math.round(this.timeLeft * 5));
  const finalScore = Math.round(this.score + (accuracy * 2) + timeBonus);
  
  // 결과 UI 표시
  this.showResults(finalScore, accuracy, timeElapsed);
  
  // 서버에 결과 전송
  this.socket.emit('game_result', {
    gameMode: 'gyeokdol',
    difficulty: this.difficulty,
    isKamen: this.isKamen,
    kamenGate: this.kamenGate,
    score: finalScore,
    perfectCount: this.perfectHits,
    goodCount: this.goodHits,
    missCount: this.missHits,
    accuracy: accuracy,
    timeMs: Math.round(timeElapsed * 1000),
    timeLeft: this.timeLeft
  });
  
  // 종료 사운드
  playSound(finalScore > 500 ? 'goal' : 'user');
  
  // 시스템 메시지로 결과 알림
  const gameTypeMsg = this.isKamen ? `카멘 ${this.kamenGate}관문 격돌` : '격돌';
  const messageEvent = new CustomEvent('system-message', {
    detail: { message: `${gameTypeMsg} 게임이 종료되었습니다! 최종 점수: ${finalScore}점 (정확도: ${accuracy.toFixed(1)}%)` }
  });
  document.dispatchEvent(messageEvent);
}

// 결과 표시
showResults(finalScore, accuracy, timeElapsed) {
  const resultDiv = document.createElement('div');
  resultDiv.className = 'result-container';
  
  // 등급 결정 (S, A, B, C, D)
  let grade = 'D';
  if (accuracy >= 95) grade = 'S';
  else if (accuracy >= 85) grade = 'A';
  else if (accuracy >= 70) grade = 'B';
  else if (accuracy >= 50) grade = 'C';
  
  // 카멘 모드일 경우 스타일 추가
  if (this.isKamen) {
    resultDiv.classList.add('kamen-mode');
  }
  
  // 카멘/일반 모드에 따른 제목 설정
  const gameTypeTitle = this.isKamen ? `카멘 ${this.kamenGate}관문 격돌` : '격돌';
  
  resultDiv.innerHTML = `
    <h3>${gameTypeTitle} 결과</h3>
    <div class="result-grade grade-${grade.toLowerCase()}">${grade}</div>
    <div class="result-details">
      <div class="result-row">
        <span>정확도:</span>
        <span>${accuracy.toFixed(1)}%</span>
      </div>
      <div class="result-row">
        <span>PERFECT:</span>
        <span>${this.perfectHits}</span>
      </div>
      <div class="result-row">
        <span>GOOD:</span>
        <span>${this.goodHits}</span>
      </div>
      <div class="result-row">
        <span>MISS:</span>
        <span>${this.missHits}</span>
      </div>
      <div class="result-row">
        <span>소요 시간:</span>
        <span>${timeElapsed.toFixed(1)}초</span>
      </div>
      <div class="result-row">
        <span>남은 시간:</span>
        <span>${this.timeLeft.toFixed(1)}초</span>
      </div>
      <div class="result-row total-score">
        <span>최종 점수:</span>
        <span>${finalScore}점</span>
      </div>
    </div>
  `;
  
  // 게임 영역에 결과 추가
  const gameArea = document.querySelector('.gyeokdol-container');
  if (gameArea) {
    gameArea.appendChild(resultDiv);
  }
}

// 게임 영역 정리
clearGameArea() {
  // 이전 게임 내용 제거
  this.gameContainer.innerHTML = '';
  
  // 애니메이션 취소
  if (this.animationFrame) {
    cancelAnimationFrame(this.animationFrame);
  }
  
  // 타이머 제거
  if (this.timerInterval) {
    clearInterval(this.timerInterval);
  }
  
  // 키보드 이벤트 리스너 제거
  document.removeEventListener('keydown', this.handleKeyDown);
}
}