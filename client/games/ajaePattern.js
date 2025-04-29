// client/games/ajaePattern.js
// 아재 패턴 게임 로직: 주어진 시간 내에 키 시퀀스 입력하기

import { playSound } from '../soundManager.js';

export default class AjaePatternGame {
  constructor(socket, gameContainer) {
    this.socket = socket;
    this.gameContainer = gameContainer;
    this.timeLimit = 0;
    this.keySequence = [];
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
    
    // 소켓 이벤트 리스너
    this.socket.on('ajae_pattern_init', this.initGame);
  }
  
  // 게임 초기화
  initGame(data) {
    this.clearGameArea();
    this.isGameActive = true;
    
    // 키 시퀀스가 없거나 유효하지 않으면 새로 생성
    if (!data.keySequence || !Array.isArray(data.keySequence) || data.keySequence.length === 0) {
      const possibleKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f']; // 8키로 제한
      const length = 5 + Math.floor(Math.random() * 3); // 5-7개 키
      
      this.keySequence = [];
      for (let i = 0; i < length; i++) {
        const randomKey = possibleKeys[Math.floor(Math.random() * possibleKeys.length)];
        this.keySequence.push(randomKey);
      }
    } else {
      // 기존 키 시퀀스에서 유효한 키만 필터링 (qwerasdf만 허용)
      const validKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
      this.keySequence = data.keySequence.filter(key => validKeys.includes(key));
      
      // 유효한 키가 없으면 기본값 설정
      if (this.keySequence.length === 0) {
        this.keySequence = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'].slice(0, 5);
      }
    }
    
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
  }
  
  // 게임 UI 생성
  createGameUI() {
    // 메인 컨테이너
    const gameArea = document.createElement('div');
    gameArea.className = 'ajae-pattern-container';
    gameArea.innerHTML = `
      <h2>아재 패턴</h2>
      <div class="timer-display">남은 시간: <span id="ajae-timer">${this.timeLimit}</span>초</div>
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
      </div>
    `;
    
    this.gameContainer.appendChild(gameArea);
  }
  
  // 타이머 시작
  startTimer() {
    this.timerInterval = setInterval(this.updateTimer, 1000);
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
  
  // 키 입력 처리
  handleKeyDown(event) {
    if (!this.isGameActive) return;
    
    const pressedKey = event.key.toLowerCase();
    const expectedKey = this.keySequence[this.currentKeyIndex];
    
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
      // 잘못된 키 입력 - 유효한 키(qwerasdf)만 오류로 카운트
      const validKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
      if (validKeys.includes(pressedKey)) {
        this.errorCount++;
        playSound('user'); // 오류 사운드
        
        // 현재 키 박스에 오류 표시
        const currentKeyBox = document.getElementById(`key-${this.currentKeyIndex}`);
        if (currentKeyBox) {
          currentKeyBox.classList.add('error');
          
          // 잠시 후 오류 표시 제거
          setTimeout(() => {
            if (currentKeyBox) {
              currentKeyBox.classList.remove('error');
            }
          }, 300);
        }
      }
    }
  }
  
  // 게임 종료
  endGame(success) {
    if (!this.isGameActive) return;
    
    this.isGameActive = false;
    this.endTime = Date.now();
    clearInterval(this.timerInterval);
    
    // 키보드 이벤트 리스너 제거
    document.removeEventListener('keydown', this.handleKeyDown);
    
    // 점수 계산 (개선된 방식)
    const timeElapsed = (this.endTime - this.startTime) / 1000;
    const correctKeys = this.currentKeyIndex;
    const totalKeys = this.keySequence.length;
    const accuracy = (correctKeys / totalKeys) * 100;
    
    // 점수 계산식 수정:
    // 1. 기본 점수: 정확도(최대 100)
    // 2. 시간 보너스: 빨리 완료할수록 보너스 높음
    // 3. 오류 페널티: 오류 횟수에 따른 감점
    let score = Math.round(accuracy);
    
    if (success) {
      // 빠르게 완료했을 경우 보너스 (남은 시간 * 10)
      const timeBonus = Math.max(0, Math.round((this.timeLimit - timeElapsed) * 10));
      score += timeBonus;
      
      // 오류 페널티 (각 오류마다 5점 감점, 최소 0점)
      const errorPenalty = this.errorCount * 5;
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
        <p>오류 횟수: ${this.errorCount}회</p>
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