// client/games/starForce.js
// 스타포스 게임 로직: 왔다갔다 움직이는 바에서 정확한 타이밍에 키 입력하기

import { playSound } from '../soundManager.js';

export default class StarForceGame {
  constructor(socket, gameContainer) {
    this.socket = socket;
    this.gameContainer = gameContainer;
    this.isGameActive = false;
    this.difficulty = 'normal'; // 'normal' 또는 'hard'
    this.totalAttempts = 0;
    this.currentAttempt = 0;
    this.score = 0;
    this.perfectHits = 0;
    this.successHits = 0;
    this.failHits = 0;
    this.barPosition = 0; // 0-100 사이 값
    this.barDirection = 1; // 1: 오른쪽, -1: 왼쪽
    this.barSpeed = 1;
    this.animationFrame = null;
    this.lastFrameTime = 0;
    
    // 타겟 영역 위치 (40-60이 Perfect, 30-40 & 60-70이 Good 영역)
    this.targetStart = 30;
    this.perfectStart = 40;
    this.perfectEnd = 60;
    this.targetEnd = 70;
    
    // 바인딩
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.initGame = this.initGame.bind(this);
    this.endGame = this.endGame.bind(this);
    this.gameLoop = this.gameLoop.bind(this);
    
    // 소켓 이벤트 리스너
    this.socket.on('starforce_init', this.initGame);
  }
  
  // 게임 초기화
  initGame(data) {
    this.clearGameArea();
    this.isGameActive = true;
    this.difficulty = data.difficulty || 'normal';
    this.totalAttempts = data.attempts || 10;
    this.currentAttempt = 0;
    this.score = 0;
    this.perfectHits = 0;
    this.successHits = 0;
    this.failHits = 0;
    this.barPosition = 0;
    this.barDirection = 1;
    this.barSpeed = this.difficulty === 'normal' ? 1 : 1.5;
    
    // UI 생성
    this.createGameUI();
    
    // 키보드 이벤트 리스너 등록
    document.addEventListener('keydown', this.handleKeyDown);
    
    // 게임 루프 시작
    this.lastFrameTime = performance.now();
    this.startGameLoop();
    
    // 시작 사운드 재생
    playSound('start');
  }
  
  // 게임 UI 생성
  createGameUI() {
    // 메인 컨테이너
    const gameArea = document.createElement('div');
    gameArea.className = 'starforce-container';
    gameArea.innerHTML = `
      <h2>스타포스</h2>
      <div class="difficulty-badge">${this.difficulty === 'normal' ? '노말' : '하드'}</div>
      <div class="score-display">점수: <span id="starforce-score">0</span></div>
      <div class="progress-display">
        <div class="progress-text">${this.currentAttempt + 1}/${this.totalAttempts}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(this.currentAttempt/this.totalAttempts) * 100}%"></div>
        </div>
      </div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="target-zone">
            <div class="perfect-zone"></div>
          </div>
          <div class="moving-bar" style="left: 0%"></div>
        </div>
        <div class="key-hint">
          ${this.difficulty === 'normal' 
            ? '스페이스바를 정확한 타이밍에 눌러주세요!' 
            : 'Q, W, E, R, A, S, D, F 중 하나를 정확한 타이밍에 눌러주세요!'}
        </div>
      </div>
      <div class="hit-indicator"></div>
      <div class="attempt-result"></div>
    `;
    
    this.gameContainer.appendChild(gameArea);
    
    // 각 영역 설정
    const targetZone = document.querySelector('.target-zone');
    const perfectZone = document.querySelector('.perfect-zone');
    
    if (targetZone) {
      targetZone.style.left = `${this.targetStart}%`;
      targetZone.style.width = `${this.targetEnd - this.targetStart}%`;
    }
    
    if (perfectZone) {
      perfectZone.style.left = `${(this.perfectStart - this.targetStart) / (this.targetEnd - this.targetStart) * 100}%`;
      perfectZone.style.width = `${(this.perfectEnd - this.perfectStart) / (this.targetEnd - this.targetStart) * 100}%`;
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
    
    // 바 이동
    this.updateBarPosition(deltaTime);
    
    // 바 위치 업데이트
    this.renderBar();
    
    // 다음 프레임
    this.animationFrame = requestAnimationFrame(this.gameLoop);
  }
  
  // 바 위치 업데이트
  updateBarPosition(deltaTime) {
    // deltaTime을 이용한 부드러운 움직임
    const delta = (deltaTime / 16.67) * this.barSpeed; // 60fps 기준 조정
    
    this.barPosition += this.barDirection * delta;
    
    // 방향 전환
    if (this.barPosition >= 100) {
      this.barPosition = 100;
      this.barDirection = -1;
    } else if (this.barPosition <= 0) {
      this.barPosition = 0;
      this.barDirection = 1;
    }
    
    // 난이도에 따라 속도 증가
    if (this.difficulty === 'hard') {
      // 하드 모드는 점점 빨라짐
      this.barSpeed = 1.5 + (this.currentAttempt * 0.1);
    }
  }
  
  // 바 렌더링
  renderBar() {
    const movingBar = document.querySelector('.moving-bar');
    if (movingBar) {
      movingBar.style.left = `${this.barPosition}%`;
    }
  }
  
  // 키 입력 처리
  handleKeyDown(event) {
    if (!this.isGameActive || this.currentAttempt >= this.totalAttempts) return;
    
    const pressedKey = event.key.toLowerCase();
    
    // 키 검증 (난이도에 따라 다름)
    let isValidKey = false;
    
    if (this.difficulty === 'normal') {
      isValidKey = pressedKey === ' ' || pressedKey === 'spacebar';
    } else {
      // 하드 모드의 유효한 키
      const validKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
      isValidKey = validKeys.includes(pressedKey);
    }
    
    if (!isValidKey) return;
    
    // 키를 빠르게 여러번 누르는 것 방지
    if (this.isProcessingAttempt) return;
    this.isProcessingAttempt = true;
    
    // 판정
    const hitResult = this.judgeHit();
    
    // 인디케이터 표시
    const keyDisplay = this.difficulty === 'normal' ? 'SPACE' : pressedKey.toUpperCase();
    this.showHitIndicator(hitResult, keyDisplay);
    
    // 결과에 따른 처리
    this.processHitResult(hitResult);
    
    // 다음 시도로
    setTimeout(() => {
      this.currentAttempt++;
      this.updateProgressBar();
      
      if (this.currentAttempt >= this.totalAttempts) {
        // 모든 시도 완료
        setTimeout(() => {
          this.endGame();
        }, 500);
      }
      
      this.isProcessingAttempt = false;
    }, 1000);
  }
  
  // 판정 계산
  judgeHit() {
    if (this.barPosition >= this.perfectStart && this.barPosition <= this.perfectEnd) {
      // Perfect 영역
      return 'perfect';
    } else if (this.barPosition >= this.targetStart && this.barPosition <= this.targetEnd) {
      // Success 영역
      return 'success';
    } else {
      // 실패
      return 'fail';
    }
  }
  
  // 판정 표시
  showHitIndicator(result, keyText) {
    const indicator = document.querySelector('.hit-indicator');
    const attemptResult = document.querySelector('.attempt-result');
    
    let resultText = '';
    let resultClass = '';
    
    switch (result) {
      case 'perfect':
        resultText = 'PERFECT!';
        resultClass = 'perfect';
        playSound('goal');
        break;
      case 'success':
        resultText = 'SUCCESS!';
        resultClass = 'success';
        playSound('move');
        break;
      case 'fail':
        resultText = 'FAIL!';
        resultClass = 'fail';
        playSound('user');
        break;
    }
    
    if (indicator) {
      indicator.textContent = `${keyText} - ${resultText}`;
      indicator.className = 'hit-indicator'; // 클래스 초기화
      indicator.classList.add(resultClass);
      
      // 애니메이션 효과
      indicator.style.animation = 'none';
      setTimeout(() => {
        indicator.style.animation = 'scale-pop 0.5s ease-out';
      }, 10);
    }
    
    if (attemptResult) {
      attemptResult.className = 'attempt-result';
      attemptResult.classList.add(resultClass);
      attemptResult.textContent = resultText;
    }
  }
  
  // 결과 처리
  processHitResult(result) {
    switch (result) {
      case 'perfect':
        this.perfectHits++;
        this.score += 100;
        break;
      case 'success':
        this.successHits++;
        this.score += 50;
        break;
      case 'fail':
        this.failHits++;
        this.score += 10;
        break;
    }
    
    // 점수 업데이트
    this.updateScore();
  }
  
  // 점수 업데이트
  updateScore() {
    const scoreElement = document.getElementById('starforce-score');
    if (scoreElement) {
      scoreElement.textContent = this.score;
    }
  }
  
  // 진행 바 업데이트
  updateProgressBar() {
    const progressText = document.querySelector('.progress-text');
    const progressFill = document.querySelector('.progress-fill');
    
    if (progressText) {
      progressText.textContent = `${this.currentAttempt + 1}/${this.totalAttempts}`;
    }
    
    if (progressFill) {
      progressFill.style.width = `${(this.currentAttempt / this.totalAttempts) * 100}%`;
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
    const totalJudgements = this.perfectHits + this.successHits + this.failHits;
    const accuracy = totalJudgements > 0 
      ? ((this.perfectHits * 1 + this.successHits * 0.6) / totalJudgements) * 100 
      : 0;
    
    // 최종 점수 = 기본 점수 + 보너스 (정확도에 따라)
    const finalScore = Math.round(this.score + (accuracy * 2));
    
    // 결과 UI 표시
    this.showResults(finalScore, accuracy);
    
    // 서버에 결과 전송
    this.socket.emit('game_result', {
      gameMode: 'starForce',
      difficulty: this.difficulty,
      score: finalScore,
      perfectCount: this.perfectHits,
      successCount: this.successHits,
      failCount: this.failHits,
      accuracy: accuracy
    });
    
    // 종료 사운드
    playSound(finalScore > 500 ? 'goal' : 'user');
  }
  
  // 결과 표시
  showResults(finalScore, accuracy) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'result-container';
    resultDiv.innerHTML = `
      <h3>결과</h3>
      <div class="result-details">
        <p>PERFECT: ${this.perfectHits}</p>
        <p>SUCCESS: ${this.successHits}</p>
        <p>FAIL: ${this.failHits}</p>
        <p>정확도: ${accuracy.toFixed(1)}%</p>
        <p>최종 점수: ${finalScore}점</p>
      </div>
    `;
    
    // 게임 영역에 결과 추가
    const gameArea = document.querySelector('.starforce-container');
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
const starForceStyles = `
.starforce-container {
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
  background-color: #673ab7;
  color: white;
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
  background-color: #673ab7;
  width: 0%;
  transition: width 0.3s ease;
}

.bar-container {
  margin: 40px auto;
  max-width: 90%;
}

.bar-track {
  position: relative;
  height: 40px;
  background-color: #222;
  border-radius: 20px;
  margin-bottom: 20px;
}

.moving-bar {
  position: absolute;
  width: 10px;
  height: 40px;
  background-color: white;
  border-radius: 5px;
  top: 0;
  transition: left 0.05s linear;
}

.target-zone {
  position: absolute;
  height: 100%;
  background-color: rgba(103, 58, 183, 0.3);
  border-radius: 20px;
}

.perfect-zone {
  position: absolute;
  height: 100%;
  background-color: rgba(156, 39, 176, 0.6);
  border-radius: 20px;
}

.key-hint {
  margin-top: 15px;
  font-style: italic;
  color: #aaa;
}

.hit-indicator {
  font-size: 36px;
  font-weight: bold;
  height: 40px;
  margin: 10px 0;
}

.attempt-result {
  font-size: 28px;
  font-weight: bold;
  height: 40px;
  margin: 10px 0;
}

.perfect, .hit-indicator.perfect {
  color: #9c27b0;
}

.success, .hit-indicator.success {
  color: #4caf50;
}

.fail, .hit-indicator.fail {
  color: #f44336;
}

.result-container {
  margin-top: 20px;
  padding: 15px;
  border-radius: 8px;
  background-color: rgba(103, 58, 183, 0.3);
}

@keyframes scale-pop {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
`;

// 스타일 주입
export function injectStarForceStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = starForceStyles;
  document.head.appendChild(styleElement);
}