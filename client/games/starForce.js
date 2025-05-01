// client/games/starForce.js
// 스타포스 게임 로직: 왔다갔다 움직이는 바에서 정확한 타이밍에 키 입력하기
// 수정된 버전: 제한시간 내 재시도 가능, 연타 방지, 타이머 표시

import { playSound } from '../soundManager.js';

export default class StarForceGame {
  constructor(socket, gameContainer) {
    this.socket = socket;
    this.gameContainer = gameContainer;
    this.isGameActive = false;
    this.difficulty = 'normal'; // 'normal' 또는 'hard'
    this.barPosition = 0; // 0-100 사이 값
    this.barDirection = 1; // 1: 오른쪽, -1: 왼쪽
    this.barSpeed = 2.5; // 기본 속도 (빠르게 설정)
    this.barWidth = 8; // 바의 너비 (px)
    this.animationFrame = null;
    this.lastFrameTime = 0;
    this.startTime = 0;
    this.endTime = 0;
    this.success = false;
    this.keyToPress = 'space'; // 기본은 스페이스바
    this.inputCooldown = false; // 입력 쿨다운 상태
    this.failCount = 0; // 실패 횟수
    this.timerInterval = null;
    this.timeLimit = 10; // 제한시간 10초
    this.timeLeft = 10;
    this.lastTick = null;
    
    // 난이도별 타겟 영역 위치 조정
    // normal: 40-60이 성공
    // hard: 45-55가 성공 (더 좁음)
    this.targetStartNormal = 40;
    this.targetEndNormal = 60;
    this.targetStartHard = 45;
    this.targetEndHard = 55;
    
    // 실제 사용할 타겟 영역
    this.targetStart = this.targetStartNormal;
    this.targetEnd = this.targetEndNormal;
    
    // 바인딩
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.initGame = this.initGame.bind(this);
    this.endGame = this.endGame.bind(this);
    this.gameLoop = this.gameLoop.bind(this);
    this.updateTimer = this.updateTimer.bind(this);
    
    // 소켓 이벤트 리스너
    this.socket.on('starforce_init', this.initGame);
  }
  
  // 게임 초기화
  initGame(data) {
    this.clearGameArea();
    this.isGameActive = true;
    this.difficulty = data.difficulty || 'normal';
    this.barPosition = 0;
    this.barDirection = 1;
    this.success = false;
    this.failCount = 0;
    this.timeLimit = 10;
    this.timeLeft = this.timeLimit;
    this.inputCooldown = false;
    
    // 난이도에 따른 설정
    if (this.difficulty === 'normal') {
      this.barSpeed = 2.5;
      this.keyToPress = 'space';
      this.targetStart = this.targetStartNormal;
      this.targetEnd = this.targetEndNormal;
      this.barWidth = 8;
    } else {
      this.barSpeed = 3.5;
      // 8개 키 중 랜덤 선택
      const possibleKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
      this.keyToPress = possibleKeys[Math.floor(Math.random() * possibleKeys.length)];
      this.targetStart = this.targetStartHard;
      this.targetEnd = this.targetEndHard;
      this.barWidth = 6; // 하드 모드에서는 바를 더 얇게
    }
    
    // UI 생성
    this.createGameUI();
    
    // 키보드 이벤트 리스너 등록
    document.addEventListener('keydown', this.handleKeyDown);
    
    // 게임 루프 시작
    this.startTime = Date.now();
    this.lastFrameTime = performance.now();
    this.startGameLoop();
    
    // 타이머 시작
    this.startTimer();
    
    // 시작 사운드 재생
    playSound('start');
    
    // 시스템 메시지로 게임 시작 알림
    const messageEvent = new CustomEvent('system-message', {
      detail: { message: `스타포스 게임이 시작되었습니다! ${this.difficulty === 'normal' ? '스페이스바' : this.keyToPress.toUpperCase() + ' 키'}를 정확한 타이밍에 누르세요!` }
    });
    document.dispatchEvent(messageEvent);
  }
  
  // 게임 UI 생성
  createGameUI() {
    // 메인 컨테이너
    const gameArea = document.createElement('div');
    gameArea.className = 'starforce-container';
    gameArea.innerHTML = `
      <h2>스타포스</h2>
      <div class="difficulty-badge">${this.difficulty === 'normal' ? '노말' : '하드'}</div>
      <div class="timer-display">남은 시간: <span id="starforce-timer">${this.timeLimit}</span>초</div>
      <div class="score-display">
        눌러야 할 키: <span class="key-to-press">${this.keyToPress === 'space' ? 'Space Bar' : this.keyToPress.toUpperCase()}</span>
        <div class="fail-count">실패: <span id="fail-count">0</span>회</div>
      </div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="target-zone"></div>
          <div class="moving-bar" style="left: 0%; width: ${this.barWidth}px;"></div>
        </div>
        <div class="key-hint">
          ${this.difficulty === 'normal' 
            ? '스페이스바를 정확한 타이밍에 눌러주세요!' 
            : `${this.keyToPress.toUpperCase()} 키를 정확한 타이밍에 눌러주세요!`}
        </div>
      </div>
      <div class="hit-indicator"></div>
      <div class="attempt-result"></div>
    `;
    
    this.gameContainer.appendChild(gameArea);
    
    // 타겟 영역 설정
    const targetZone = document.querySelector('.target-zone');
    
    if (targetZone) {
      targetZone.style.left = `${this.targetStart}%`;
      targetZone.style.width = `${this.targetEnd - this.targetStart}%`;
    }
    
    // 키 표시 강조 스타일
    const keyDisplay = document.querySelector('.key-to-press');
    if (keyDisplay) {
      keyDisplay.style.backgroundColor = 'rgba(158, 41, 176, 0.2)';
      keyDisplay.style.padding = '2px 8px';
      keyDisplay.style.borderRadius = '4px';
      keyDisplay.style.fontWeight = 'bold';
      keyDisplay.style.color = '#bb86fc';
      keyDisplay.style.display = 'inline-block';
      keyDisplay.style.fontSize = '1.2em';
    }
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
    
    const timerElement = document.getElementById('starforce-timer');
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
    if (!this.isGameActive || this.inputCooldown || this.success) return;
    
    const pressedKey = event.key.toLowerCase();
    
    // 키 검증 (난이도에 따라 다름)
    let isValidKey = false;
    
    if (this.difficulty === 'normal') {
      isValidKey = pressedKey === ' ' || pressedKey === 'spacebar';
    } else {
      isValidKey = pressedKey === this.keyToPress;
    }
    
    if (!isValidKey) return;
    
    // 유효한 키가 눌렸으면 결과 판정
    this.checkResult();
  }
  
  // 결과 확인
  checkResult() {
    // 현재 바 위치가 목표 영역 내에 있는지 확인
    const isSuccess = (this.barPosition >= this.targetStart && this.barPosition <= this.targetEnd);
    
    if (isSuccess) {
      // 성공 시
      this.success = true;
      this.endTime = Date.now();
      this.showResult(true);
      
      // 성공했으므로 게임 종료
      setTimeout(() => {
        this.endGame();
      }, 1000);
    } else {
      // 실패 시
      this.failCount++;
      this.showResult(false);
      
      // 실패 횟수 업데이트
      const failCountElement = document.getElementById('fail-count');
      if (failCountElement) {
        failCountElement.textContent = this.failCount;
      }
      
      // 입력 쿨다운 설정 (0.8초)
      this.inputCooldown = true;
      setTimeout(() => {
        this.inputCooldown = false;
        
        // 실패 표시 지우기
        const hitIndicator = document.querySelector('.hit-indicator');
        if (hitIndicator) {
          hitIndicator.textContent = '';
        }
      }, 800);
    }
  }
  
  // 결과 표시
  showResult(isSuccess) {
    const hitIndicator = document.querySelector('.hit-indicator');
    
    const resultText = isSuccess ? '성공!' : '실패!';
    const resultClass = isSuccess ? 'success' : 'fail';
    
    if (hitIndicator) {
      hitIndicator.textContent = resultText;
      hitIndicator.className = 'hit-indicator';
      hitIndicator.classList.add(resultClass);
      
      // 애니메이션 효과
      hitIndicator.style.animation = 'none';
      setTimeout(() => {
        hitIndicator.style.animation = 'scale-pop 0.5s ease-out';
      }, 10);
    }
    
    // 사운드 재생
    playSound(isSuccess ? 'goal' : 'user');
  }
  
  // 게임 종료
  endGame() {
    if (!this.isGameActive) return;
    
    this.isGameActive = false;
    
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
    
    // 마지막 시간 기록 (성공하지 못한 경우)
    if (!this.success) {
      this.endTime = Date.now();
    }
    
    // 소요 시간 계산
    const timeElapsed = (this.endTime - this.startTime) / 1000;
    
    // 점수 계산
    // 성공 시: 기본 100점 + 난이도 보너스(하드는 +50) + 속도 보너스(빨리 성공할수록 높은 점수) - 실패 패널티(실패당 10점)
    // 실패 시: 10점
    let score = 0;
    
    if (this.success) {
      const difficultyBonus = this.difficulty === 'hard' ? 50 : 0;
      const timeBonus = Math.max(0, Math.floor((this.timeLimit - timeElapsed) * 10)); // 남은 시간당 10점 보너스
      const failPenalty = this.failCount * 10; // 실패당 10점 감점
      score = Math.max(10, 100 + difficultyBonus + timeBonus - failPenalty);
    } else {
      score = 10; // 실패 시 기본 점수
    }
    
    // 결과 UI 표시
    this.showFinalResults(score, timeElapsed);
    
    // 서버에 결과 전송
    this.socket.emit('game_result', {
      gameMode: 'starforce',
      difficulty: this.difficulty,
      score: score,
      timeMs: Math.round((this.endTime - this.startTime)),
      success: this.success,
      failCount: this.failCount
    });
    
    // 시스템 메시지로 결과 알림
    const resultMessage = this.success 
      ? `스타포스 게임을 성공했습니다! 점수: ${score}점`
      : `스타포스 게임을 실패했습니다. 점수: ${score}점`;
      
    const messageEvent = new CustomEvent('system-message', {
      detail: { message: resultMessage }
    });
    document.dispatchEvent(messageEvent);
  }
  
  // 최종 결과 표시
  showFinalResults(score, timeElapsed) {
    const resultDiv = document.createElement('div');
    resultDiv.className = `result-container ${this.success ? 'success' : 'fail'}`;
    resultDiv.innerHTML = `
      <h3>${this.success ? '성공!' : '실패!'}</h3>
      <div class="result-details">
        <p>난이도: ${this.difficulty === 'normal' ? '노말' : '하드'}</p>
        <p>키: ${this.keyToPress === 'space' ? 'Space Bar' : this.keyToPress.toUpperCase()}</p>
        <p>소요 시간: ${timeElapsed.toFixed(2)}초</p>
        <p>실패 횟수: ${this.failCount}회</p>
        <p>최종 점수: ${score}점</p>
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
    
    // 타이머 중지
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
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

.timer-display {
  font-size: 18px;
  margin: 15px 0 5px;
  color: #ff9800;
}

.score-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 18px;
  margin: 10px 0 20px;
  padding: 0 30px;
}

.fail-count {
  color: #f44336;
  font-weight: bold;
}

.bar-container {
  margin: 30px auto;
  max-width: 90%;
}

.bar-track {
  position: relative;
  height: 50px;
  background-color: #222;
  border-radius: 25px;
  margin-bottom: 20px;
  overflow: hidden;
}

.moving-bar {
  position: absolute;
  width: 8px;
  height: 50px;
  background-color: white;
  top: 0;
  transition: left 0.05s linear;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
}

.target-zone {
  position: absolute;
  height: 100%;
  background-color: rgba(103, 58, 183, 0.5);
  border-radius: 0;
  z-index: 1;
}

.key-hint {
  margin-top: 15px;
  font-style: italic;
  color: #aaa;
}

.hit-indicator {
  font-size: 56px;
  font-weight: bold;
  height: 60px;
  margin: 20px 0;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.attempt-result {
  font-size: 28px;
  font-weight: bold;
  height: 40px;
  margin: 10px 0;
}

.success, .hit-indicator.success {
  color: #4caf50;
}

.fail, .hit-indicator.fail {
  color: #f44336;
}

.result-container {
  margin-top: 30px;
  padding: 20px;
  border-radius: 10px;
  animation: fade-in 0.5s ease-out;
}

.result-container.success {
  background-color: rgba(76, 175, 80, 0.2);
  border: 1px solid rgba(76, 175, 80, 0.5);
}

.result-container.fail {
  background-color: rgba(244, 67, 54, 0.2);
  border: 1px solid rgba(244, 67, 54, 0.5);
}

.result-details {
  margin-top: 15px;
  text-align: left;
  display: inline-block;
}

.result-details p {
  margin: 8px 0;
  font-size: 18px;
}

@keyframes scale-pop {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

// 스타일 주입
export function injectStarForceStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = starForceStyles;
  document.head.appendChild(styleElement);
}