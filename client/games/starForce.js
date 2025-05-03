// client/games/starForce.js
// 스타포스 게임 로직: 왔다갔다 움직이는 바에서 정확한 타이밍에 키 입력하기
// 개선된 버전: 다중 포인트 시스템, 난이도별 설정, 속도 향상

import { playSound } from '../soundManager.js';

export default class StarForceGame {
  constructor(socket, gameContainer) {
    this.socket = socket;
    this.gameContainer = gameContainer;
    this.isGameActive = false;
    this.difficulty = 'normal'; // 'normal' 또는 'hard'
    this.barPosition = 0; // 0-100 사이 값
    this.barDirection = 1; // 1: 오른쪽, -1: 왼쪽
    this.barSpeed = 3.5; // 기본 속도 (상향 조정)
    this.barWidth = 8; // 바의 너비 (px)
    this.animationFrame = null;
    this.lastFrameTime = 0;
    this.startTime = 0;
    this.endTime = 0;
    this.success = false;
    this.inputCooldown = false; // 입력 쿨다운 상태
    this.failCount = 0; // 실패 횟수
    this.timerInterval = null;
    this.timeLimit = 15; // 제한시간 15초
    this.timeLeft = 15;
    this.lastTick = null;
    
    // 다중 타겟 지원을 위한 새 변수
    this.targetZones = []; // 타겟 영역 목록
    this.completedTargets = []; // 완료된 타겟 인덱스
    this.currentTargetIndex = 0; // 현재 타겟 인덱스
    this.maxTargets = 1; // 최대 타겟 수 (난이도에 따라 조정)
    this.keyToPress = ['space']; // 기본은 스페이스바 (배열로 변경)
    
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
    this.timeLimit = 15; // 시간 약간 증가
    this.timeLeft = this.timeLimit;
    this.inputCooldown = false;
    this.targetZones = [];
    this.completedTargets = [];
    this.currentTargetIndex = 0;
    
    // 난이도에 따른 설정
    if (this.difficulty === 'normal') {
      this.barSpeed = 3.5; // 속도 상향
      this.keyToPress = ['space']; // 스페이스바만
      this.targetStart = this.targetStartNormal;
      this.targetEnd = this.targetEndNormal;
      this.barWidth = 8;
      this.maxTargets = 1; // 1단계는 타겟 1개
    } else {
      this.barSpeed = 4.5; // 하드 모드는 더 빠르게
      
      // 타겟 수 결정 (2~3개)
      this.maxTargets = data.level && data.level > 3 ? 3 : 2;
      
      // 각 타겟마다 다른 랜덤 키 지정
      this.keyToPress = [];
      const possibleKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
      
      for (let i = 0; i < this.maxTargets; i++) {
        // 이미 선택된 키는 제외하고 랜덤 선택
        const remainingKeys = possibleKeys.filter(key => !this.keyToPress.includes(key));
        this.keyToPress.push(remainingKeys[Math.floor(Math.random() * remainingKeys.length)]);
      }
      
      this.targetStart = this.targetStartHard;
      this.targetEnd = this.targetEndHard;
      this.barWidth = 6; // 하드 모드에서는 바를 더 얇게
    }
    
    // 타겟 영역 생성
    this.generateTargetZones();
    
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
    const targetCount = this.maxTargets > 1 ? `${this.maxTargets}개의 포인트에서 ` : '';
    const keyMsg = this.difficulty === 'normal' ? 
      '스페이스바' : 
      `각 포인트마다 ${this.keyToPress.map(k => k.toUpperCase()).join(', ')} 키`;
    
    const messageEvent = new CustomEvent('system-message', {
      detail: { message: `스타포스 게임이 시작되었습니다! ${targetCount}${keyMsg}를 정확한 타이밍에 누르세요!` }
    });
    document.dispatchEvent(messageEvent);
  }
  
  // 타겟 영역 생성
  generateTargetZones() {
    this.targetZones = [];
    
    // 1~3개 타겟 생성 (난이도와 레벨에 따라)
    for (let i = 0; i < this.maxTargets; i++) {
      // 바에서 타겟 위치 결정 (균등하게 분배)
      const position = 20 + Math.floor((60 / this.maxTargets) * i);
      
      this.targetZones.push({
        start: position,
        end: position + (this.difficulty === 'normal' ? 20 : 10),
        completed: false,
        key: this.keyToPress[i]
      });
    }
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
        <div>
          눌러야 할 키: 
          ${this.keyToPress.map((key, index) => 
            `<span class="key-to-press" data-index="${index}" 
             style="${this.currentTargetIndex === index ? '' : 'opacity: 0.5;'}">
             ${key === 'space' ? 'Space Bar' : key.toUpperCase()}
             </span>`
          ).join(' ')}
        </div>
        <div class="fail-count">실패: <span id="fail-count">0</span>회</div>
      </div>
      <div class="bar-container">
        <div class="bar-track">
          ${this.targetZones.map((zone, index) => 
            `<div class="target-zone" id="target-${index}" 
             style="left: ${zone.start}%; width: ${zone.end - zone.start}%;" 
             data-key="${zone.key}">
             ${zone.key === 'space' ? 'Space' : zone.key.toUpperCase()}
             </div>`
          ).join('')}
          <div class="moving-bar" style="left: 0%; width: ${this.barWidth}px;"></div>
        </div>
        <div class="key-hint">
          ${this.difficulty === 'normal' 
            ? '스페이스바를 정확한 타이밍에 눌러주세요!' 
            : `표시된 키를 순서대로 정확한 타이밍에 눌러주세요!`}
        </div>
      </div>
      <div class="hit-indicator"></div>
      <div class="attempt-result"></div>
    `;
    
    this.gameContainer.appendChild(gameArea);
    
    // 타겟 영역 CSS 스타일 보강
    const style = document.createElement('style');
    style.textContent = `
      .target-zone {
        position: absolute;
        height: 100%;
        background-color: rgba(103, 58, 183, 0.5);
        border-radius: 0;
        z-index: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        color: rgba(255, 255, 255, 0.7);
        font-weight: bold;
        transition: all 0.3s ease;
      }
      
      .target-zone.completed {
        background-color: rgba(76, 175, 80, 0.2);
        color: rgba(76, 175, 80, 0.4);
      }
      
      .target-zone.current {
        background-color: rgba(103, 58, 183, 0.7);
        color: white;
      }
      
      .key-to-press {
        background-color: rgba(158, 41, 176, 0.2);
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: bold;
        color: #bb86fc;
        display: inline-block;
        margin: 0 5px;
        transition: all 0.3s ease;
      }
      
      .key-to-press.active {
        background-color: rgba(158, 41, 176, 0.5);
        transform: scale(1.1);
      }
    `;
    document.head.appendChild(style);
    
    // 현재 타겟 영역 강조
    this.updateTargetHighlight();
  }
  
  // 현재 타겟 영역 강조
  updateTargetHighlight() {
    // 모든 타겟 영역 강조 해제
    document.querySelectorAll('.target-zone').forEach(zone => {
      zone.classList.remove('current');
    });
    
    // 모든 키 표시 강조 해제
    document.querySelectorAll('.key-to-press').forEach(key => {
      key.classList.remove('active');
    });
    
    // 완료되지 않은 타겟 찾기
    const nextTarget = this.targetZones.findIndex(zone => !zone.completed);
    
    if (nextTarget !== -1) {
      this.currentTargetIndex = nextTarget;
      
      // 현재 타겟 강조
      const targetEl = document.getElementById(`target-${nextTarget}`);
      if (targetEl) {
        targetEl.classList.add('current');
      }
      
      // 현재 키 강조
      const keyEl = document.querySelector(`.key-to-press[data-index="${nextTarget}"]`);
      if (keyEl) {
        keyEl.classList.add('active');
      }
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
    const expectedKey = this.getCurrentTargetKey();
    
    // 스페이스바 처리
    const isSpace = pressedKey === ' ' || pressedKey === 'spacebar';
    
    // 기대하는 키와 입력된 키 비교
    const isCorrectKey = (expectedKey === 'space' && isSpace) || pressedKey === expectedKey;
    
    if (!isCorrectKey) {
      // 잘못된 키 입력
      this.showHitIndicator('miss', `${isSpace ? 'Space' : pressedKey.toUpperCase()}는 잘못된 키입니다!`);
      playSound('user');
      this.failCount++;
      this.updateFailCount();
      return;
    }
    
    // 현재 타겟 영역 확인
    const currentTarget = this.targetZones[this.currentTargetIndex];
    
    // 바가 타겟 영역 안에 있는지 확인
    if (this.barPosition >= currentTarget.start && this.barPosition <= currentTarget.end) {
      // 성공
      this.completeTarget(this.currentTargetIndex);
    } else {
      // 타이밍 실패
      this.showHitIndicator('miss', "타이밍 실패!");
      playSound('user');
      this.failCount++;
      this.updateFailCount();
    }
  }
  
  // 현재 타겟 키 가져오기
  getCurrentTargetKey() {
    if (this.currentTargetIndex < this.targetZones.length) {
      return this.targetZones[this.currentTargetIndex].key;
    }
    return 'space'; // 기본값
  }
  
  // 실패 카운트 업데이트
  updateFailCount() {
    const failCountElement = document.getElementById('fail-count');
    if (failCountElement) {
      failCountElement.textContent = this.failCount;
    }
  }
  
  // 타겟 완료 처리
  completeTarget(index) {
    // 타겟 완료 표시
    this.targetZones[index].completed = true;
    this.completedTargets.push(index);
    
    // 타겟 UI 업데이트
    const targetEl = document.getElementById(`target-${index}`);
    if (targetEl) {
      targetEl.classList.add('completed');
      targetEl.classList.remove('current');
    }
    
    // 성공 표시
    this.showHitIndicator('perfect', "성공!");
    playSound('move');
    
    // 다음 타겟으로 이동
    this.updateTargetHighlight();
    
    // 모든 타겟 완료 확인
    const allCompleted = this.targetZones.every(zone => zone.completed);
    
    if (allCompleted) {
      // 모든 타겟 완료 시 게임 성공
      this.success = true;
      this.endTime = Date.now();
      
      // 1초 후 게임 종료
      setTimeout(() => {
        this.endGame();
      }, 1000);
    }
  }
  
  // 결과 표시
  showHitIndicator(type, text) {
    const hitIndicator = document.querySelector('.hit-indicator');
    
    if (hitIndicator) {
      hitIndicator.textContent = text;
      hitIndicator.className = 'hit-indicator';
      hitIndicator.classList.add(type);
      
      // 애니메이션 효과
      hitIndicator.style.animation = 'none';
      setTimeout(() => {
        hitIndicator.style.animation = 'scale-pop 0.5s ease-out';
      }, 10);
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
    
    // 타이머 중지
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    // 키보드 이벤트 리스너 제거
    document.removeEventListener('keydown', this.handleKeyDown);
    
    // 마지막 시간 기록 (성공하지 못한 경우)
    if (!this.endTime) {
      this.endTime = Date.now();
    }
    
    // 소요 시간 계산
    const timeElapsed = (this.endTime - this.startTime) / 1000;
    
    // 점수 계산 업데이트
    // 성공 시: 기본 100점 + 타겟당 보너스(50점) + 난이도 보너스(하드는 +50) + 속도 보너스 - 실패 패널티
    // 실패 시: 완료한 타겟당 30점
    let score = 0;
    
    if (this.success) {
      const targetBonus = this.completedTargets.length * 50; // 타겟당 50점
      const difficultyBonus = this.difficulty === 'hard' ? 50 : 0;
      const timeBonus = Math.max(0, Math.floor((this.timeLimit - timeElapsed) * 10)); // 남은 시간당 10점
      const failPenalty = this.failCount * 10; // 실패당 10점 감점
      
      score = Math.max(10, 100 + targetBonus + difficultyBonus + timeBonus - failPenalty);
    } else {
      // 일부 완료 시에도 점수 부여
      score = Math.max(10, this.completedTargets.length * 30);
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
      failCount: this.failCount,
      completedTargets: this.completedTargets.length,
      totalTargets: this.maxTargets
    });
    
    // 시스템 메시지로 결과 알림
    const resultMessage = this.success 
      ? `스타포스 게임을 성공했습니다! 점수: ${score}점`
      : `스타포스 게임을 ${this.completedTargets.length}/${this.maxTargets} 포인트 완료했습니다. 점수: ${score}점`;
      
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
        <p>완료한 포인트: ${this.completedTargets.length}/${this.maxTargets}</p>
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

.target-zone {
  position: absolute;
  height: 100%;
  background-color: rgba(103, 58, 183, 0.5);
  border-radius: 0;
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: rgba(255, 255, 255, 0.7);
  font-weight: bold;
  transition: all 0.3s ease;
}

.target-zone.completed {
  background-color: rgba(76, 175, 80, 0.2);
  color: rgba(76, 175, 80, 0.4);
}

.target-zone.current {
  background-color: rgba(103, 58, 183, 0.7);
  color: white;
}

.key-to-press {
  background-color: rgba(158, 41, 176, 0.2);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
  color: #bb86fc;
  display: inline-block;
  margin: 0 5px;
  transition: all 0.3s ease;
}

.key-to-press.active {
  background-color: rgba(158, 41, 176, 0.5);
  transform: scale(1.1);
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