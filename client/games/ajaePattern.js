// client/games/ajaePattern.js
// 아재 패턴 게임 로직: 주어진 시간 내에 키 시퀀스 입력하기

import { playSound } from '../soundManager.js';

export default class AjaePatternGame {
  constructor(socket, gameContainer) {
    this.socket = socket;
    this.gameContainer = gameContainer;
    this.timeLimit = 0;
    this.lastTick = null;
    this.keySequence = [];
    this.animationFrameId = null;
    this.currentKeyIndex = 0;
    this.startTime = 0;
    this.endTime = 0;
    this.timerInterval = null;
    this.isGameActive = false;
    this.errorCount = 0; // 오류 횟수 추적
    
    // 바인딩
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.initGame = this.initGame.bind(this);
    this.endGame = this.endGame.bind(this);
    this.updateTimer = this.updateTimer.bind(this);
    this.resetKeySequence = this.resetKeySequence.bind(this);
    
    // 소켓 이벤트 리스너
    this.socket.on('ajae_pattern_init', this.initGame);
  }
  
  // 게임 초기화
  initGame(data) {
    this.clearGameArea();
    this.isGameActive = true;
    
    // qwerasdf 8개 키 시퀀스 생성 (항상 모든 키를 포함)
    const validKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
    
    // 키 시퀀스 생성 (8개의 키가 모두 사용되고 섞인 상태)
    this.keySequence = this.generateFullKeySequence(validKeys);
    
    this.timeLimit = data.timeLimit || 10;
    this.currentKeyIndex = 0;
    this.errorCount = 0;
    
    // UI 생성
    this.createGameUI();
    
    // 키보드 이벤트 리스너 등록
    document.addEventListener('keydown', this.handleKeyDown);
    
    // 시작 시간 기록
    this.startTime = Date.now();
    
    // 타이머 시작
    this.startTimer();
    
    // 시작 사운드 재생
    playSound('start');
    
    // 시스템 메시지로 게임 시작 알림
    const messageEvent = new CustomEvent('system-message', {
      detail: { message: `아재 패턴 게임이 시작되었습니다! ${this.timeLimit}초 내에 키 시퀀스를 완료하세요.` }
    });
    document.dispatchEvent(messageEvent);
  }
  
  // 8개의 키를 모두 포함하는 키 시퀀스 생성
  generateFullKeySequence(validKeys) {
    // 모든 키를 한 번씩 포함 (8개)
    const sequence = [...validKeys];
    
    // 시퀀스 셔플 (Fisher-Yates 알고리즘)
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }
    
    // 추가 키는 넣지 않고 정확히 8개만 사용
    return sequence;
  }
  
  // 게임 UI 생성
  createGameUI() {
    // 메인 컨테이너
    const gameArea = document.createElement('div');
    gameArea.className = 'ajae-pattern-container';
    gameArea.innerHTML = `
      <h2>아재 패턴</h2>
      <div class="timer-display">남은 시간: <span id="ajae-timer">${this.timeLimit}</span>초</div>
      <div class="score-formula">
        <div class="formula-title">점수 계산 방식</div>
        <div class="formula-content">
          기본 점수: 정확도(%) + 남은 시간 보너스(초 × 10) - 실패 패널티(실패당 10점)
        </div>
      </div>
      <div class="key-sequence-container">
        ${this.keySequence.map((key, index) => `
          <div class="key-box ${index === 0 ? 'current' : ''}" id="key-${index}">
            ${key.toUpperCase()}
          </div>
        `).join('')}
      </div>
      <div class="hint-text">
        <p>Q, W, E, R, A, S, D, F 키를 화면에 표시된 순서대로 누르세요!</p>
        <p>빠르고 정확하게 입력할수록 높은 점수를 얻습니다.</p>
        <p>잘못된 키를 누르면 처음부터 다시 시작합니다.</p>
      </div>
    `;
    
    this.gameContainer.appendChild(gameArea);
  }
  
  // 타이머 업데이트
  updateTimer() {
    const timeElapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const timeLeft = Math.max(0, this.timeLimit - timeElapsed);
    
    const timerElement = document.getElementById('ajae-timer');
    if (timerElement) {
      timerElement.textContent = timeLeft;
    }
    
    // 시간이 다 되었을 때
    if (timeLeft === 0) {
      this.endGame(false); // 시간 초과로 게임 종료
    }
    
    // 시간이 얼마 안 남았을 때 경고음
    if (timeLeft <= 3 && timeLeft > 0) {
      playSound('tick');
    }
  }
  
  
// AjaePatternGame 클래스의 타이머 관련 함수 수정

// 타이머 시작 함수 수정
startTimer() {
  // interval 타이머를 제거하고 requestAnimationFrame 사용
  if (this.timerInterval) {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }
  
  // 시작 시간 기록
  this.startTime = Date.now();
  // 종료 시간 미리 계산
  this.endTime = this.startTime + (this.timeLimit * 1000);
  
  // RAF 함수 호출
  this.animationFrameId = requestAnimationFrame(this.updateTimerSmooth.bind(this));
}

// 부드러운 타이머 업데이트 (0.01초 단위)
updateTimerSmooth(timestamp) {
  if (!this.isGameActive) return;
  
  const now = Date.now();
  const timeElapsed = now - this.startTime;
  const timeLeft = Math.max(0, this.timeLimit * 1000 - timeElapsed);
  
  // 남은 시간을 소수점 둘째 자리까지 표시 (0.01초 단위)
  const timeLeftSeconds = (timeLeft / 1000).toFixed(2);
  
  const timerElement = document.getElementById('ajae-timer');
  if (timerElement) {
    timerElement.textContent = timeLeftSeconds;
  }
  
  // 시간이 다 되었을 때
  if (timeLeft <= 0) {
    cancelAnimationFrame(this.animationFrameId);
    this.endGame(false); // 시간 초과로 게임 종료
    return;
  }
  
  // 시간이 얼마 안 남았을 때 경고음 (1초 간격으로)
  if (timeLeft <= 3000 && timeLeft > 0) {
    // 정수 초 단위로 변환했을 때 값이 변경된 경우에만 사운드 재생
    const intSeconds = Math.ceil(timeLeft / 1000);
    if (this.lastTick !== intSeconds) {
      this.lastTick = intSeconds;
      playSound('tick');
    }
  }
  
  // 다음 프레임 요청
  this.animationFrameId = requestAnimationFrame(this.updateTimerSmooth.bind(this));
}
  // 키 시퀀스 리셋 (잘못된 키 입력시)
  resetKeySequence() {
    this.currentKeyIndex = 0;
    this.errorCount++;
    
    // 모든 키 박스 상태 리셋
    document.querySelectorAll('.key-box').forEach((box, index) => {
      box.classList.remove('current', 'correct', 'error');
      if (index === 0) {
        box.classList.add('current');
      }
    });
    
    // 오류 사운드 재생
    playSound('user');
  }
  
  // 키 입력 처리
  handleKeyDown(event) {
    if (!this.isGameActive) return;
    
    const pressedKey = event.key.toLowerCase();
    const expectedKey = this.keySequence[this.currentKeyIndex];
    
    // 유효한 키(qwerasdf)인지 확인
    const validKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
    if (!validKeys.includes(pressedKey)) return;
    
    if (pressedKey === expectedKey) {
      // 정확한 키 입력
      playSound('move');
      
      // 현재 키 박스에 정확히 눌렀음을 표시
      const currentKeyBox = document.getElementById(`key-${this.currentKeyIndex}`);
      if (currentKeyBox) {
        currentKeyBox.classList.remove('current');
        currentKeyBox.classList.add('correct');
      }
      
      this.currentKeyIndex++;
      
      // 다음 키 표시
      if (this.currentKeyIndex < this.keySequence.length) {
        const nextKeyBox = document.getElementById(`key-${this.currentKeyIndex}`);
        if (nextKeyBox) {
          nextKeyBox.classList.add('current');
        }
      } else {
        // 모든 키를 정확히 입력했을 때
        this.endGame(true);
      }
    } else {
      // 잘못된 키 입력 - 처음부터 다시 시작
      const currentKeyBox = document.getElementById(`key-${this.currentKeyIndex}`);
      if (currentKeyBox) {
        currentKeyBox.classList.add('error');
        
        // 잠시 후 오류 표시 제거 및 시퀀스 리셋
        setTimeout(() => {
          this.resetKeySequence();
        }, 300);
      }
    }
  }
  
  // 게임 종료
endGame(success) {
  if (!this.isGameActive) return;
  
  this.isGameActive = false;
  this.endTime = Date.now();
  
  // 타이머 중지
  if (this.timerInterval) {
    clearInterval(this.timerInterval);
  }
  
  // 애니메이션 프레임 취소 (추가된 부분)
  if (this.animationFrameId) {
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }
  
  // 키보드 이벤트 리스너 제거
  document.removeEventListener('keydown', this.handleKeyDown);
  
  // 점수 계산 (개선된 방식)
  const timeElapsed = (this.endTime - this.startTime) / 1000;
  const correctKeys = success ? this.keySequence.length : this.currentKeyIndex;
  const totalKeys = this.keySequence.length;
  const accuracy = (correctKeys / totalKeys) * 100;
  
  // 점수 계산식:
  // 1. 기본 점수: 정확도(최대 100)
  // 2. 시간 보너스: 빨리 완료할수록 보너스 높음 (남은 시간 * 10)
  // 3. 오류 페널티: 오류 횟수에 따른 감점 (각 오류당 10점)
  let score = Math.round(accuracy);
  
  if (success) {
    // 빠르게 완료했을 경우 보너스
    const timeBonus = Math.max(0, Math.round((this.timeLimit - timeElapsed) * 10));
    score += timeBonus;
    
    // 오류 페널티
    const errorPenalty = this.errorCount * 10;
    score = Math.max(0, score - errorPenalty);
  }
  
  // 결과 UI 표시
  this.showResults(success, score, timeElapsed, accuracy);
  
  // 서버에 결과 전송
  this.socket.emit('game_result', {
    gameMode: 'ajaePattern',
    success,
    score,
    timeMs: Math.round((this.endTime - this.startTime)),
    accuracy,
    errorCount: this.errorCount
  });
  
  // 성공/실패 사운드
  playSound(success ? 'goal' : 'user');
  
  // 시스템 메시지로 결과 알림
  const resultMessage = success 
    ? `아재 패턴 게임을 성공했습니다! 점수: ${score}점`
    : `아재 패턴 게임을 실패했습니다. 점수: ${score}점`;
    
  const messageEvent = new CustomEvent('system-message', {
    detail: { message: resultMessage }
  });
  document.dispatchEvent(messageEvent);
}
  
  // 결과 표시
  showResults(success, score, timeElapsed, accuracy) {
    const resultDiv = document.createElement('div');
    resultDiv.className = `result-container ${success ? 'success' : 'fail'}`;
    resultDiv.innerHTML = `
      <h3>${success ? '성공!' : '실패!'}</h3>
      <div class="result-details">
        <p>정확도: ${accuracy.toFixed(1)}%</p>
        <p>소요 시간: ${timeElapsed.toFixed(1)}초</p>
        <p>실패 횟수: ${this.errorCount}회</p>
        <p>최종 점수: ${score}점</p>
      </div>
    `;
    
    // 게임 영역에 결과 추가
    const gameArea = document.querySelector('.ajae-pattern-container');
    if (gameArea) {
      gameArea.appendChild(resultDiv);
    }
  }
  
  // 게임 영역 정리
  clearGameArea() {
    // 이전 게임 내용 제거
    this.gameContainer.innerHTML = '';
    
    // 기존 타이머 제거
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    // 키보드 이벤트 리스너 제거
    document.removeEventListener('keydown', this.handleKeyDown);
  }
}

// 필요한 CSS 스타일 추가
const ajaePatternStyles = `
.ajae-pattern-container {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  background-color: rgba(0, 0, 0, 0.7);
  border-radius: 10px;
  color: white;
  text-align: center;
}

.key-sequence-container {
  display: flex;
  justify-content: center;
  margin: 30px 0;
  flex-wrap: wrap;
  gap: 10px;
}

.key-box {
  width: 60px;
  height: 60px;
  background-color: #333;
  border: 2px solid #555;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  font-weight: bold;
  transition: all 0.2s ease;
}

.key-box.current {
  background-color: #2a6099;
  border-color: #3a80c9;
  box-shadow: 0 0 10px #3a80c9;
  transform: scale(1.1);
}

.key-box.correct {
  background-color: #2a9960;
  border-color: #3ac980;
}

.key-box.error {
  background-color: #992a2a;
  border-color: #c93a3a;
  animation: shake 0.3s;
}

.timer-display {
  font-size: 24px;
  margin: 10px 0;
}

.hint-text {
  margin: 20px 0;
  color: #aaa;
}

.hint-text p {
  margin: 5px 0;
}

.result-container {
  margin-top: 20px;
  padding: 15px;
  border-radius: 8px;
}

.result-container.success {
  background-color: rgba(42, 153, 96, 0.5);
}

.result-container.fail {
  background-color: rgba(153, 42, 42, 0.5);
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}
`;

// 스타일 주입
export function injectAjaePatternStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = ajaePatternStyles;
  document.head.appendChild(styleElement);
}