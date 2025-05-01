// client/games/gyeokdol.js
// 격돌 게임 로직: 시퀀스에 맞춰 원이 줄어들 때 키 입력하기

import { playSound } from '../soundManager.js';

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
  
  // 일반 격돌 패턴 생성
  generateRegularPatterns() {
    // 라운드별 패턴 수
    this.totalPatterns = this.difficulty === 'normal' ? 8 : 12;
    
    // 패턴 템플릿 (타이밍/키 sequence)
    // [키, 지속시간(ms)]의 배열로 구성
    
    const normalPatterns = [
      // 패턴 1: 기본 4비트 패턴
      [
        ['q', 1500], ['w', 1500], ['e', 1500], ['r', 1500]
      ],
      // 패턴 2: 빠른 리듬
      [
        ['q', 1200], ['w', 1200], ['e', 1200], ['r', 1200]
      ],
      // 패턴 3: 불규칙 패턴
      [
        ['q', 1800], ['w', 1200], ['e', 1500], ['r', 1200]
      ]
    ];
    
    const hardPatterns = [
      // 패턴 1: 8키 패턴
      [
        ['q', 1500], ['w', 1400], ['e', 1300], ['r', 1200],
        ['a', 1300], ['s', 1200], ['d', 1100], ['f', 1000]
      ],
      // 패턴 2: 교차 패턴
      [
        ['q', 1400], ['a', 1300], ['w', 1200], ['s', 1100],
        ['e', 1300], ['d', 1200], ['r', 1100], ['f', 1000]
      ],
      // 패턴 3: 빠른 패턴
      [
        ['q', 1200], ['w', 1100], ['e', 1000], ['r', 900],
        ['a', 1100], ['s', 1000], ['d', 900], ['f', 800]
      ]
    ];
    
    // 난이도에 따라 패턴 선택
    const patternSet = this.difficulty === 'normal' ? normalPatterns : hardPatterns;
    
    // 필요한 수만큼 패턴 랜덤 선택 및 수정
    this.patternSequences = [];
    for (let i = 0; i < this.totalPatterns; i++) {
      // 패턴 랜덤 선택
      const randomPattern = [...patternSet[Math.floor(Math.random() * patternSet.length)]];
      
      // 난이도에 따른 속도 조정 (라운드가 올라갈수록 빨라짐)
      const speedMultiplier = 1 - (Math.min(i, 7) * 0.05); // 최대 35% 빨라짐
      
      // 패턴 복사 및 속도 조정
      const adjustedPattern = randomPattern.map(([key, time]) => [
        key,
        Math.max(600, Math.floor(time * speedMultiplier)) // 최소 600ms
      ]);
      
      this.patternSequences.push(adjustedPattern);
    }
  }
  
  // 카멘 격돌 패턴 생성
  generateKamenPatterns() {
    this.patternSequences = [];
    
    // 카멘 3관문 패턴
    if (this.kamenGate === 3) {
      // 하드카멘 (8키 - qwer asdf) -3관문
      const allKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
      const qwerKeys = ['q', 'w', 'e', 'r'];
      
      // 1격 - 8키 / 빠른 4키 / 빠른 4키
      const pattern1 = [];
      // 8키 패턴
      allKeys.forEach(key => {
        pattern1.push([key, 1200]);
      });
      this.patternSequences.push(pattern1);
      
      // 빠른 4키 패턴 1
      const pattern2 = [];
      qwerKeys.forEach(key => {
        pattern2.push([key, 900]); // 빠른 속도
      });
      this.patternSequences.push(pattern2);
      
      // 빠른 4키 패턴 2
      const pattern3 = [];
      qwerKeys.forEach(key => {
        pattern3.push([key, 850]); // 더 빠른 속도
      });
      this.patternSequences.push(pattern3);
      
      // 2격 - 8키 / 4키 4키 / 4키4키
      // 8키 패턴
      const pattern4 = [];
      allKeys.forEach(key => {
        pattern4.push([key, 1300]);
      });
      this.patternSequences.push(pattern4);
      
      // 4키 + 4키 패턴
      const pattern5 = [];
      qwerKeys.forEach(key => {
        pattern5.push([key, 1000]);
      });
      qwerKeys.forEach(key => {
        pattern5.push([key, 950]);
      });
      this.patternSequences.push(pattern5);
      
      // 4키4키 패턴 (더 빠르게)
      const pattern6 = [];
      qwerKeys.forEach(key => {
        pattern6.push([key, 900]);
      });
      qwerKeys.forEach(key => {
        pattern6.push([key, 850]);
      });
      this.patternSequences.push(pattern6);
      
      // 지파격 - 8키 / 8키
      // 8키 패턴 1
      const pattern7 = [];
      allKeys.forEach(key => {
        pattern7.push([key, 1100]);
      });
      this.patternSequences.push(pattern7);
      
      // 8키 패턴 2
      const pattern8 = [];
      allKeys.forEach(key => {
        pattern8.push([key, 1000]);
      });
      this.patternSequences.push(pattern8);
      
      // 막격 - 빠른 4키 / 4키 4키 / 4키 4키 4키
      // 빠른 4키 패턴
      const pattern9 = [];
      qwerKeys.forEach(key => {
        pattern9.push([key, 800]); // 매우 빠른 속도
      });
      this.patternSequences.push(pattern9);
      
      // 4키 4키 패턴
      const pattern10 = [];
      qwerKeys.forEach(key => {
        pattern10.push([key, 950]);
      });
      qwerKeys.forEach(key => {
        pattern10.push([key, 900]);
      });
      this.patternSequences.push(pattern10);
      
      // 4키 4키 4키 패턴
      const pattern11 = [];
      qwerKeys.forEach(key => {
        pattern11.push([key, 925]);
      });
      qwerKeys.forEach(key => {
        pattern11.push([key, 900]);
      });
      qwerKeys.forEach(key => {
        pattern11.push([key, 875]);
      });
      this.patternSequences.push(pattern11);
      
    } else if (this.kamenGate === 4) {
      // 카멘 4관문 패턴
      const qwerKeys = ['q', 'w', 'e', 'r'];
      
      // 1격 - 느린 4키 / Q QQ QQQ
      // 느린 4키 패턴
      const pattern1 = [];
      qwerKeys.forEach(key => {
        pattern1.push([key, 1800]); // 느린 속도
      });
      this.patternSequences.push(pattern1);
      
      // Q QQ QQQ 패턴 (Q 하나, Q 두개, Q 세개 순서)
      const pattern2 = [];
      pattern2.push(['q', 1500]);
      pattern2.push(['q', 1300]);
      pattern2.push(['q', 1300]);
      pattern2.push(['q', 1200]);
      pattern2.push(['q', 1200]);
      pattern2.push(['q', 1200]);
      this.patternSequences.push(pattern2);
      
      // 2격 - 4키 / 4키
      // 4키 패턴 1
      const pattern3 = [];
      qwerKeys.forEach(key => {
        pattern3.push([key, 1200]);
      });
      this.patternSequences.push(pattern3);
      
      // 4키 패턴 2 (빠르게)
      const pattern4 = [];
      qwerKeys.forEach(key => {
        pattern4.push([key, 1000]);
      });
      this.patternSequences.push(pattern4);
    }
    
    // 총 패턴 수 설정
    this.totalPatterns = this.patternSequences.length;
  }
  
  // 게임 UI 생성
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
        <div class="target-ring"></div>
        <div class="moving-ring"></div>
        <div class="key-display"></div>
      </div>
      
      <div class="hit-indicator"></div>
      
      <div class="hint-text">
        ${this.difficulty === 'normal' 
          ? 'Q, W, E, R 키를 정확한 타이밍에 눌러주세요!' 
          : 'Q, W, E, R, A, S, D, F 키를 정확한 타이밍에 눌러주세요!'}
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
    this.animationFrame = requestAnimationFrame(this.gameLoop);
  }
  
  // 게임 루프
  gameLoop(timestamp) {
    if (!this.isGameActive) return;
    
    // 시간 차이 계산
    const deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    
    // 현재 패턴이 진행 중이고 입력 대기 중인지 확인
    if (this.waitingForInput) {
      // 현재 타이밍에 따른 링 크기 계산
      this.updateRingScale(deltaTime);
      
      // 링 렌더링
      this.renderRing();
    }
    
    // 다음 프레임
    this.animationFrame = requestAnimationFrame(this.gameLoop);
  }
  
  // 링 크기 업데이트
  updateRingScale(deltaTime) {
    if (!this.waitingForInput) return;
    
    // 현재 패턴에서 진행 중인 키
    const currentPattern = this.patternSequences[this.currentPatternIndex];
    const [_, duration] = currentPattern[this.keySequenceIndex];
    
    // 키 표시 이후 경과 시간
    const elapsedTime = Date.now() - this.keyChangeTime;
    
    // 시간에 따른 링 크기 계산 (3.0 -> 1.0으로 줄어듦)
    const progress = Math.min(elapsedTime / duration, 1);
    this.ringScale = 3 - (2 * progress);
    
    // 시간이 다 되면 실패로 처리
    if (progress >= 1 && this.waitingForInput) {
      this.handleMiss();
    }
  }
  
  // 링 렌더링
  renderRing() {
    const movingRing = document.querySelector('.moving-ring');
    if (movingRing) {
      movingRing.style.transform = `scale(${this.ringScale})`;
    }
  }
  
  // 다음 패턴 시작
  startNextPattern() {
    if (!this.isGameActive || this.currentPatternIndex >= this.totalPatterns) {
      return this.endGame();
    }
    
    // 패턴 내 키 인덱스 초기화
    this.keySequenceIndex = 0;
    
    // 프로그레스 바 업데이트
    this.updateProgressBar();
    
    // 다음 키 시작
    this.showNextKey();
  }
  
  // 패턴 카운트 업데이트
  updateProgressBar() {
    const patternCount = document.getElementById('pattern-count');
    const progressFill = document.querySelector('.progress-fill');
    
    if (patternCount) {
      patternCount.textContent = this.currentPatternIndex + 1;
    }
    
    if (progressFill) {
      progressFill.style.width = `${((this.currentPatternIndex) / this.totalPatterns) * 100}%`;
    }
  }
  
  // 다음 키 표시
  showNextKey() {
    // 현재 패턴에서 다음 키 가져오기
    const currentPattern = this.patternSequences[this.currentPatternIndex];
    
    // 패턴의 모든 키를 완료했는지 확인
    if (this.keySequenceIndex >= currentPattern.length) {
      // 다음 패턴으로 이동
      this.currentPatternIndex++;
      
      // 일정 시간 후 다음 패턴 시작
      setTimeout(() => {
        this.startNextPattern();
      }, 800);
      
      return;
    }
    
    // 현재 키 및 지속 시간 설정
    const [key, duration] = currentPattern[this.keySequenceIndex];
    this.currentKey = key;
    
    // 링 및 키 디스플레이 요소
    const movingRing = document.querySelector('.moving-ring');
    const keyDisplay = document.querySelector('.key-display');
    
    // 이전 링 숨기기
    if (movingRing) {
      movingRing.style.transform = 'scale(3)';
      movingRing.style.opacity = '1';
    }
    
    // 키 표시
    if (keyDisplay) {
      keyDisplay.textContent = key.toUpperCase();
    }
    
    // 입력 대기 상태로 설정
    this.waitingForInput = true;
    this.ringScale = 3.0;
    this.keyChangeTime = Date.now();
    
    // 키 표시 사운드
    playSound('flip');
  }
  
  // 키 입력 처리
  handleKeyDown(event) {
    if (!this.isGameActive || !this.waitingForInput || this.inputCooldown) return;
    
    const pressedKey = event.key.toLowerCase();
    
    // 현재 패턴에서 진행 중인 키
    if (pressedKey === this.currentKey) {
      // 정확한 키 입력
      
      // 타이밍 판정
      const movingRing = document.querySelector('.moving-ring');
      const elapsedTime = Date.now() - this.keyChangeTime;
      
      if (movingRing) {
        // 타이밍 판정 (1.0이 목표)
        const ringScale = this.ringScale;
        const diff = Math.abs(ringScale - 1.0);
        
        if (diff < 0.2) {
          // Perfect 판정
          this.handlePerfect();
        } else if (diff < 0.5) {
          // Good 판정
          this.handleGood();
        } else {
          // Miss 판정 (타이밍 부정확)
          this.handleMiss();
        }
      }
    } else {
      // 잘못된 키 입력
      this.showHitIndicator('wrong', `${pressedKey.toUpperCase()}는 틀린 키`);
      playSound('user'); // 오류 사운드
    }
  }
  
  // Perfect 판정 처리
  handlePerfect() {
    // 판정 표시
    this.showHitIndicator('perfect', 'PERFECT!');
    
    // 점수 증가
    this.score += 100;
    this.perfectHits++;
    
    // 성공 사운드
    playSound('move');
    
    // 점수 및 카운트 업데이트
    this.updateScore();
    
    // 입력 대기 상태 해제
    this.waitingForInput = false;
    
    // 다음 키로 이동
    this.keySequenceIndex++;
    
    // 다음 키 표시 전 짧은 딜레이
    setTimeout(() => {
      this.showNextKey();
    }, 300);
  }
  
  // Good 판정 처리 (새로 추가)
  handleGood() {
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
    
    // 입력 대기 상태 해제
    this.waitingForInput = false;
    
    // 다음 키로 이동
    this.keySequenceIndex++;
    
    // 다음 키 표시 전 딜레이
    setTimeout(() => {
      this.showNextKey();
    }, 400);
  }
  
  // Miss 판정 처리
  handleMiss() {
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
    
    // 입력 대기 상태 해제
    this.waitingForInput = false;
    
    // 다음 키로 이동
    this.keySequenceIndex++;
    
    // 다음 키 표시 전 딜레이
    setTimeout(() => {
      this.showNextKey();
    }, 500);
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

// 카멘 격돌 패턴 생성
generateKamenPatterns() {
  this.patternSequences = [];
  
  // 카멘 3관문 패턴
  if (this.kamenGate === 3) {
    // 하드카멘 (8키 - qwer asdf) -3관문
    const allKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
    const qwerKeys = ['q', 'w', 'e', 'r'];
    
    // 1격 - 8키 / 빠른 4키 / 빠른 4키
    const pattern1 = [];
    // 8키 패턴
    allKeys.forEach(key => {
      pattern1.push([key, 1200]);
    });
    this.patternSequences.push(pattern1);
    
    // 빠른 4키 패턴 1
    const pattern2 = [];
    qwerKeys.forEach(key => {
      pattern2.push([key, 900]); // 빠른 속도
    });
    this.patternSequences.push(pattern2);
    
    // 빠른 4키 패턴 2
    const pattern3 = [];
    qwerKeys.forEach(key => {
      pattern3.push([key, 850]); // 더 빠른 속도
    });
    this.patternSequences.push(pattern3);
    
    // 2격 - 8키 / 4키 4키 / 4키4키
    // 8키 패턴
    const pattern4 = [];
    allKeys.forEach(key => {
      pattern4.push([key, 1300]);
    });
    this.patternSequences.push(pattern4);
    
    // 4키 + 4키 패턴
    const pattern5 = [];
    qwerKeys.forEach(key => {
      pattern5.push([key, 1000]);
    });
    qwerKeys.forEach(key => {
      pattern5.push([key, 950]);
    });
    this.patternSequences.push(pattern5);
    
    // 4키4키 패턴 (더 빠르게)
    const pattern6 = [];
    qwerKeys.forEach(key => {
      pattern6.push([key, 900]);
    });
    qwerKeys.forEach(key => {
      pattern6.push([key, 850]);
    });
    this.patternSequences.push(pattern6);
    
    // 지파격 - 8키 / 8키
    // 8키 패턴 1
    const pattern7 = [];
    allKeys.forEach(key => {
      pattern7.push([key, 1100]);
    });
    this.patternSequences.push(pattern7);
    
    // 8키 패턴 2
    const pattern8 = [];
    allKeys.forEach(key => {
      pattern8.push([key, 1000]);
    });
    this.patternSequences.push(pattern8);
    
    // 막격 - 빠른 4키 / 4키 4키 / 4키 4키 4키
    // 빠른 4키 패턴
    const pattern9 = [];
    qwerKeys.forEach(key => {
      pattern9.push([key, 800]); // 매우 빠른 속도
    });
    this.patternSequences.push(pattern9);
    
    // 4키 4키 패턴
    const pattern10 = [];
    qwerKeys.forEach(key => {
      pattern10.push([key, 950]);
    });
    qwerKeys.forEach(key => {
      pattern10.push([key, 900]);
    });
    this.patternSequences.push(pattern10);
    
    // 4키 4키 4키 패턴
    const pattern11 = [];
    qwerKeys.forEach(key => {
      pattern11.push([key, 925]);
    });
    qwerKeys.forEach(key => {
      pattern11.push([key, 900]);
    });
    qwerKeys.forEach(key => {
      pattern11.push([key, 875]);
    });
    this.patternSequences.push(pattern11);
    
  } else if (this.kamenGate === 4) {
    // 카멘 4관문 패턴
    const qwerKeys = ['q', 'w', 'e', 'r'];
    
    // 1격 - 느린 4키 / Q QQ QQQ
    // 느린 4키 패턴
    const pattern1 = [];
    qwerKeys.forEach(key => {
      pattern1.push([key, 1800]); // 느린 속도
    });
    this.patternSequences.push(pattern1);
    
    // Q QQ QQQ 패턴 (Q 하나, Q 두개, Q 세개 순서)
    const pattern2 = [];
    pattern2.push(['q', 1500]);
    pattern2.push(['q', 1300]);
    pattern2.push(['q', 1300]);
    pattern2.push(['q', 1200]);
    pattern2.push(['q', 1200]);
    pattern2.push(['q', 1200]);
    this.patternSequences.push(pattern2);
    
    // 2격 - 4키 / 4키
    // 4키 패턴 1
    const pattern3 = [];
    qwerKeys.forEach(key => {
      pattern3.push([key, 1200]);
    });
    this.patternSequences.push(pattern3);
    
    // 4키 패턴 2 (빠르게)
    const pattern4 = [];
    qwerKeys.forEach(key => {
      pattern4.push([key, 1000]);
    });
    this.patternSequences.push(pattern4);
  }
  
  // 총 패턴 수 설정
  this.totalPatterns = this.patternSequences.length;
}
}

// 필요한 CSS 스타일 추가
const gyeokdolStyles = `
.gyeokdol-container {
width: 100%;
max-width: 800px;
margin: 0 auto;
padding: 20px;
background-color: rgba(0, 0, 0, 0.7);
border-radius: 10px;
color: white;
text-align: center;
position: relative;
}

.gyeokdol-container.kamen-mode {
background-color: rgba(40, 0, 80, 0.8);
box-shadow: 0 0 20px rgba(128, 0, 255, 0.4);
}

.difficulty-badge {
position: absolute;
top: 10px;
right: 10px;
background-color: #ff9800;
color: black;
padding: 5px 10px;
border-radius: 15px;
font-weight: bold;
}

.timer-display {
font-size: 20px;
margin: 10px 0;
color: #ff9800;
}

.progress-display {
margin: 15px 0;
}

.progress-text {
margin-bottom: 5px;
font-size: 16px;
}

.progress-bar {
height: 10px;
background-color: #333;
border-radius: 5px;
overflow: hidden;
}

.progress-fill {
height: 100%;
background-color: #4caf50;
width: 0%;
transition: width 0.3s ease;
}

.score-display {
display: flex;
justify-content: space-between;
align-items: center;
margin: 15px 0;
padding: 5px 10px;
background-color: rgba(0, 0, 0, 0.3);
border-radius: 5px;
}

.stats {
display: flex;
gap: 10px;
font-size: 14px;
}

.perfect {
color: #4caf50;
}

.good {
color: #2196f3;
}

.miss {
color: #f44336;
}

.ring-container {
position: relative;
height: 300px;
margin: 20px auto;
display: flex;
justify-content: center;
align-items: center;
}

.target-ring {
position: absolute;
width: 100px;
height: 100px;
border: 5px solid #4caf50;
border-radius: 50%;
z-index: 1;
}

.gyeokdol-container.kamen-mode .target-ring {
border-color: #9c27b0;
box-shadow: 0 0 10px rgba(156, 39, 176, 0.6);
}

.moving-ring {
position: absolute;
width: 100px;
height: 100px;
border: 3px solid #ff9800;
border-radius: 50%;
z-index: 2;
transform: scale(3);
transition: opacity 0.3s ease;
opacity: 0;
}

.gyeokdol-container.kamen-mode .moving-ring {
border-color: #e91e63;
box-shadow: 0 0 10px rgba(233, 30, 99, 0.4);
}

.key-display {
position: absolute;
z-index: 3;
font-size: 36px;
font-weight: bold;
color: white;
text-shadow: 0 0 5px black;
}

.hit-indicator {
font-size: 36px;
font-weight: bold;
height: 40px;
opacity: 0;
}

.hit-indicator.perfect {
color: #4caf50;
}

.hit-indicator.good {
color: #2196f3;
}

.hit-indicator.miss {
color: #f44336;
}

.hit-indicator.wrong {
color: #9c27b0;
font-size: 24px;
}

.hint-text {
margin: 20px 0;
font-style: italic;
color: #aaa;
}

.result-container {
margin-top: 20px;
padding: 15px;
border-radius: 8px;
background-color: rgba(33, 150, 243, 0.3);
animation: fade-in 0.5s ease;
}

.gyeokdol-container.kamen-mode .result-container {
background-color: rgba(156, 39, 176, 0.3);
}

.result-grade {
font-size: 72px;
font-weight: bold;
margin: 10px 0;
text-shadow: 0 0 10px currentColor;
}

.grade-s {
color: #FFD700; /* 금색 */
}

.grade-a {
color: #C0C0C0; /* 은색 */
}

.grade-b {
color: #CD7F32; /* 동색 */
}

.grade-c {
color: #4CAF50; /* 녹색 */
}

.grade-d {
color: #F44336; /* 적색 */
}

.result-details {
display: flex;
flex-direction: column;
gap: 8px;
margin-top: 15px;
}

.result-row {
display: flex;
justify-content: space-between;
padding: 5px 20px;
background-color: rgba(0, 0, 0, 0.2);
border-radius: 5px;
}

.total-score {
font-size: 18px;
font-weight: bold;
background-color: rgba(76, 175, 80, 0.3);
margin-top: 10px;
}

.gyeokdol-container.kamen-mode .total-score {
background-color: rgba(156, 39, 176, 0.3);
}

@keyframes pop-in-out {
0% { transform: scale(0.5); opacity: 0; }
50% { transform: scale(1.2); opacity: 1; }
100% { transform: scale(1); opacity: 0; }
}

@keyframes fade-in {
from { opacity: 0; transform: translateY(20px); }
to { opacity: 1; transform: translateY(0); }
}
`;

// 스타일 주입
export function injectGyeokdolStyles() {
const styleElement = document.createElement('style');
styleElement.textContent = gyeokdolStyles;
document.head.appendChild(styleElement);
}