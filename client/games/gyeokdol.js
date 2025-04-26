// client/games/gyeokdol.js
// 격돌 게임 로직: 원이 줄어들 때 정확한 타이밍에 키 입력하기

import { playSound } from '../soundManager.js';

export default class GyeokdolGame {
  constructor(socket, gameContainer) {
    this.socket = socket;
    this.gameContainer = gameContainer;
    this.isGameActive = false;
    this.difficulty = 'normal'; // 'normal' 또는 'hard'
    this.totalRings = 0;
    this.currentRingIndex = 0;
    this.score = 0;
    this.perfectHits = 0;
    this.goodHits = 0;
    this.missHits = 0;
    this.rings = [];
    this.animationFrame = null;
    
    // 바인딩
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.initGame = this.initGame.bind(this);
    this.endGame = this.endGame.bind(this);
    this.gameLoop = this.gameLoop.bind(this);
    this.createRing = this.createRing.bind(this);
    
    // 소켓 이벤트 리스너
    this.socket.on('gyeokdol_init', this.initGame);
  }
  
  // 게임 초기화
  initGame(data) {
    this.clearGameArea();
    this.isGameActive = true;
    this.difficulty = data.difficulty || 'normal';
    this.totalRings = data.ringCount || 10;
    this.currentRingIndex = 0;
    this.score = 0;
    this.perfectHits = 0;
    this.goodHits = 0;
    this.missHits = 0;
    this.rings = [];
    
    // UI 생성
    this.createGameUI();
    
    // 키보드 이벤트 리스너 등록
    document.addEventListener('keydown', this.handleKeyDown);
    
    // 게임 루프 시작
    this.startGameLoop();
    
    // 시작 사운드 재생
    playSound('start');
  }
  
  // 게임 UI 생성
  createGameUI() {
    // 메인 컨테이너
    const gameArea = document.createElement('div');
    gameArea.className = 'gyeokdol-container';
    gameArea.innerHTML = `
      <h2>격돌</h2>
      <div class="difficulty-badge">${this.difficulty === 'normal' ? '노말' : '하드'}</div>
      <div class="score-display">점수: <span id="gyeokdol-score">0</span></div>
      <div class="progress-display">
        <div class="progress-text">${this.currentRingIndex + 1}/${this.totalRings}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(this.currentRingIndex/this.totalRings) * 100}%"></div>
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
  
  // 게임 루프 시작
  startGameLoop() {
    if (this.currentRingIndex < this.totalRings) {
      this.createRing();
    } else {
      this.endGame();
    }
  }
  
  // 새 링 생성
  createRing() {
    // 이전 링 숨기기
    const movingRing = document.querySelector('.moving-ring');
    const keyDisplay = document.querySelector('.key-display');
    
    if (movingRing) {
      movingRing.style.transform = 'scale(0)';
      movingRing.style.opacity = '0';
    }
    
    if (this.currentRingIndex >= this.totalRings) {
      this.endGame();
      return;
    }
    
    // 키 결정 (난이도에 따라 다름)
    const normalKeys = ['q', 'w', 'e', 'r'];
    const hardKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
    const keySet = this.difficulty === 'normal' ? normalKeys : hardKeys;
    const randomKey = keySet[Math.floor(Math.random() * keySet.length)];
    
    // 링 설정
    setTimeout(() => {
      if (!this.isGameActive) return;
      
      // 현재 링 정보 저장
      this.rings[this.currentRingIndex] = {
        key: randomKey,
        startTime: Date.now(),
        hit: false,
        result: null // 'perfect', 'good', 'miss'
      };
      
      // 링 및 키 표시
      if (movingRing) {
        movingRing.style.transform = 'scale(3)';
        movingRing.style.opacity = '1';
      }
      
      if (keyDisplay) {
        keyDisplay.textContent = randomKey.toUpperCase();
      }
      
      // 링 애니메이션
      this.animateRing();
      
    }, this.currentRingIndex === 0 ? 500 : 1200);
  }
  
  // 링 애니메이션
  animateRing() {
    const movingRing = document.querySelector('.moving-ring');
    const startScale = 3;
    const endScale = 1;
    const duration = this.difficulty === 'normal' ? 2000 : 1500; // 하드는 더 빠름
    
    let startTime = null;
    
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // 크기 애니메이션
      const currentScale = startScale - ((startScale - endScale) * progress);
      if (movingRing) {
        movingRing.style.transform = `scale(${currentScale})`;
      }
      
      // 애니메이션 계속
      if (progress < 1 && this.isGameActive && !this.rings[this.currentRingIndex].hit) {
        this.animationFrame = requestAnimationFrame(animate);
      } else if (!this.rings[this.currentRingIndex].hit) {
        // 시간 초과로 실패
        this.handleMiss();
      }
    };
    
    this.animationFrame = requestAnimationFrame(animate);
  }
  
  // 키 입력 처리
  handleKeyDown(event) {
    if (!this.isGameActive || this.currentRingIndex >= this.totalRings) return;
    
    const pressedKey = event.key.toLowerCase();
    const currentRing = this.rings[this.currentRingIndex];
    
    // 현재 링이 아직 생성되지 않았거나 이미 처리된 경우
    if (!currentRing || currentRing.hit) return;
    
    // 잘못된 키 입력
    if (pressedKey !== currentRing.key) {
      playSound('user'); // 오류 사운드
      this.showHitIndicator('wrong', `${pressedKey.toUpperCase()}는 틀린 키`);
      return;
    }
    
    // 정확한 키 입력
    currentRing.hit = true;
    
    // 타이밍 계산
    const hitTime = Date.now();
    const elapsedTime = hitTime - currentRing.startTime;
    const movingRing = document.querySelector('.moving-ring');
    
    // 타이밍 판정
    if (movingRing) {
      const ringScale = parseFloat(movingRing.style.transform.replace('scale(', '').replace(')', ''));
      const targetScale = 1; // 목표 크기
      const diff = Math.abs(ringScale - targetScale);
      
      if (diff < 0.2) {
        // Perfect
        currentRing.result = 'perfect';
        this.score += 100;
        this.perfectHits++;
        this.showHitIndicator('perfect', 'PERFECT!');
        playSound('goal');
      } else if (diff < 0.5) {
        // Good
        currentRing.result = 'good';
        this.score += 50;
        this.goodHits++;
        this.showHitIndicator('good', 'GOOD');
        playSound('move');
      } else {
        // Bad
        currentRing.result = 'miss';
        this.score += 10;
        this.missHits++;
        this.showHitIndicator('miss', 'BAD');
        playSound('user');
      }
      
      // 점수 업데이트
      this.updateScore();
      
      // 다음 링으로
      this.currentRingIndex++;
      
      // 진행 바 업데이트
      this.updateProgressBar();
      
      // 애니메이션 취소
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
      }
      
      // 다음 링 생성
      setTimeout(() => {
        this.startGameLoop();
      }, 500);
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
    if (scoreElement) {
      scoreElement.textContent = this.score;
    }
  }
  
  // 진행 바 업데이트
  updateProgressBar() {
    const progressText = document.querySelector('.progress-text');
    const progressFill = document.querySelector('.progress-fill');
    
    if (progressText) {
      progressText.textContent = `${this.currentRingIndex + 1}/${this.totalRings}`;
    }
    
    if (progressFill) {
      progressFill.style.width = `${(this.currentRingIndex / this.totalRings) * 100}%`;
    }
  }
  
  // 놓친 링 처리
  handleMiss() {
    if (!this.isGameActive) return;
    
    const currentRing = this.rings[this.currentRingIndex];
    if (currentRing && !currentRing.hit) {
      currentRing.hit = true;
      currentRing.result = 'miss';
      this.missHits++;
      
      this.showHitIndicator('miss', 'MISS!');
      playSound('user');
      
      // 다음 링으로
      this.currentRingIndex++;
      
      // 진행 바 업데이트
      this.updateProgressBar();
      
      // 다음 링 생성
      setTimeout(() => {
        this.startGameLoop();
      }, 500);
    }
  }
  
  // 게임 종료
  endGame() {
    if (!this.isGameActive) return;
    
    this.isGameActive = false;
    
    // 애니메이션 취소
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    // 키보드 이벤트 리스너 제거
    document.removeEventListener('keydown', this.handleKeyDown);
    
    // 정확도 계산
    const totalJudgements = this.perfectHits + this.goodHits + this.missHits;
    const accuracy = totalJudgements > 0 
      ? ((this.perfectHits * 1 + this.goodHits * 0.6) / totalJudgements) * 100 
      : 0;
    
    // 최종 점수 = 기본 점수 + 보너스 (정확도에 따라)
    const finalScore = Math.round(this.score + (accuracy * 2));
    
    // 결과 UI 표시
    this.showResults(finalScore, accuracy);
    
    // 서버에 결과 전송
    this.socket.emit('game_result', {
      gameMode: 'gyeokdol',
      difficulty: this.difficulty,
      score: finalScore,
      perfectCount: this.perfectHits,
      goodCount: this.goodHits,
      missCount: this.missHits,
      accuracy: accuracy
    });
    
    // 종료 사운드
    playSound(this.score > 500 ? 'goal' : 'user');
  }
  
  // 결과 표시
  showResults(finalScore, accuracy) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'result-container';
    resultDiv.innerHTML = `
      <h3>결과</h3>
      <div class="result-details">
        <p>PERFECT: ${this.perfectHits}</p>
        <p>GOOD: ${this.goodHits}</p>
        <p>MISS: ${this.missHits}</p>
        <p>정확도: ${accuracy.toFixed(1)}%</p>
        <p>최종 점수: ${finalScore}점</p>
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
    
    // 키보드 이벤트 리스너 제거
    document.removeEventListener('keydown', this.handleKeyDown);
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

.score-display {
  font-size: 24px;
  margin: 10px 0;
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
}

@keyframes pop-in-out {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 0; }
}
`;

// 스타일 주입
export function injectGyeokdolStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = gyeokdolStyles;
  document.head.appendChild(styleElement);
}