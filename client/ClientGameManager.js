// client/ClientGameManager.js
// 클라이언트 측 게임 매니저: 게임 모드 전환, UI 관리 담당

import { playSound, checkAndPlayBGM } from './soundManager.js';
import AjaePatternGame, { injectAjaePatternStyles } from './games/ajaePattern.js';
import GyeokdolGame, { injectGyeokdolStyles } from './games/gyeokdol.js';
import StarForceGame, { injectStarForceStyles } from './games/starForce.js';

// 테스트 모드 설정
const TEST_MODE = true;

export default class ClientGameManager {
  constructor(socket, container) {
    this.socket = socket;
    this.container = container;
    this.currentGame = null;
    this.gameMode = null;
    this.isVoting = false;
    this.votingTimeLeft = 0;
    this.votingInterval = null;
    this.votes = {
      'ajaePattern': 0,
      'gyeokdol': 0,
      'starforce': 0
    };
    this.userVote = null;
    this.round = 0;
    this.maxRounds = 5;

    // 소켓 이벤트 리스너 등록
    this.setupSocketListeners();
    
    // 스타일 주입
    this.injectAllGameStyles();
    
    // 게임 인스턴스 생성 (필요시 초기화)
    this.games = {
      ajaePattern: null,
      gyeokdol: null,
      starforce: null
    };
  }
  
  // 모든 게임 스타일 주입
  injectAllGameStyles() {
    injectAjaePatternStyles();
    injectGyeokdolStyles();
    injectStarForceStyles();
  }
  
  // 소켓 이벤트 리스너 설정
  setupSocketListeners() {
    // 투표 시작
    this.socket.on('voting_started', (data) => {
      this.startVoting(data.round, data.duration);
    });
    
    // 투표 업데이트
    this.socket.on('vote_update', (data) => {
      this.updateVotes(data.votes);
    });
    
    // 투표 종료
    this.socket.on('voting_ended', (data) => {
      this.endVoting(data.selectedMode, data.votes);
    });
    
    // 라운드 시작
    this.socket.on('round_started', (data) => {
      this.startRound(data.round, data.mode);
    });
    
    // 라운드 종료
    this.socket.on('round_ended', (data) => {
      this.showRoundResults(data.round, data.results);
    });
    
    // 게임 종료
    this.socket.on('game_ended', (data) => {
      this.showFinalResults(data.ranking, data.roundResults);
    });
    
    // 게임 리셋
    this.socket.on('game_reset', () => {
      this.resetGame();
    });
  }
  
  // 투표 화면 표시
  startVoting(round, duration) {
    this.isVoting = true;
    this.round = round;
    this.votingTimeLeft = duration;
    this.userVote = null;
    this.votes = {
      'ajaePattern': 0,
      'gyeokdol': 0,
      'starforce': 0
    };
    
    // 게임 컨테이너 비우기
    this.container.innerHTML = '';
    
    // 투표 UI 생성
    const votingUI = document.createElement('div');
    votingUI.className = 'voting-container';
    votingUI.innerHTML = `
      <h2>${round}라운드 게임 투표</h2>
      <div class="timer-display">남은 시간: <span id="voting-timer">${duration}</span>초</div>
      <div class="games-grid">
        <div class="game-vote-card" data-game="ajaePattern">
          <h3>아재 패턴</h3>
          <div class="game-image" style="background-image: url('/images/ajae-pattern.png')"></div>
          <p>주어진 시간 내에 키보드로 표시된 키를 순서대로 누르세요!</p>
          <div class="vote-count" id="vote-ajaePattern">0 표</div>
          <button class="vote-button">투표하기</button>
        </div>
        <div class="game-vote-card" data-game="gyeokdol">
          <h3>격돌</h3>
          <div class="game-image" style="background-image: url('/images/gyeokdol.png')"></div>
          <p>원이 줄어들 때 정확한 타이밍에 키를 눌러 점수를 얻으세요!</p>
          <div class="vote-count" id="vote-gyeokdol">0 표</div>
          <button class="vote-button">투표하기</button>
        </div>
        <div class="game-vote-card" data-game="starforce">
          <h3>스타포스</h3>
          <div class="game-image" style="background-image: url('/images/starforce.png')"></div>
          <p>움직이는 바가 목표 영역을 지날 때 키를 눌러 강화하세요!</p>
          <div class="vote-count" id="vote-starforce">0 표</div>
          <button class="vote-button">투표하기</button>
        </div>
      </div>
    `;
    
    this.container.appendChild(votingUI);
    
    // 투표 버튼 이벤트 등록
    document.querySelectorAll('.vote-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const gameCard = e.target.closest('.game-vote-card');
        if (gameCard) {
          const gameName = gameCard.dataset.game;
          this.vote(gameName);
        }
      });
    });
    
    // 타이머 시작
    this.startVotingTimer();
    
    // 사운드 재생
    playSound('start');
  }
  
  // 투표 타이머 시작
  startVotingTimer() {
    if (this.votingInterval) {
      clearInterval(this.votingInterval);
    }
    
    this.votingInterval = setInterval(() => {
      this.votingTimeLeft--;
      
      const timerElement = document.getElementById('voting-timer');
      if (timerElement) {
        timerElement.textContent = this.votingTimeLeft;
      }
      
      if (this.votingTimeLeft <= 0) {
        clearInterval(this.votingInterval);
      } else if (this.votingTimeLeft <= 3) {
        // 3초 이하일 때 틱 사운드
        playSound('tick');
      }
    }, 1000);
  }
  
  // 투표하기
  vote(gameMode) {
    if (!this.isVoting) return;
    
    // 이전 투표 취소
    if (this.userVote) {
      const prevVoteBtn = document.querySelector(`.game-vote-card[data-game="${this.userVote}"] .vote-button`);
      if (prevVoteBtn) {
        prevVoteBtn.textContent = '투표하기';
        prevVoteBtn.classList.remove('voted');
      }
    }
    
    // 새 투표 등록
    this.userVote = gameMode;
    
    // 버튼 상태 변경
    const voteBtn = document.querySelector(`.game-vote-card[data-game="${gameMode}"] .vote-button`);
    if (voteBtn) {
      voteBtn.textContent = '투표 완료!';
      voteBtn.classList.add('voted');
    }
    
    // 서버에 투표 전송
    this.socket.emit('vote', { gameMode });
    
    // 사운드 재생
    playSound('move');
  }
  
  // 투표 결과 업데이트
  updateVotes(votes) {
    for (const [game, count] of Object.entries(votes)) {
      const voteCountElement = document.getElementById(`vote-${game}`);
      if (voteCountElement) {
        voteCountElement.textContent = `${count} 표`;
      }
    }
  }
  
  // 투표 종료
  endVoting(selectedMode, votes) {
    this.isVoting = false;
    this.gameMode = selectedMode;
    
    // 타이머 중지
    if (this.votingInterval) {
      clearInterval(this.votingInterval);
    }
    
    // 투표 카운트 업데이트
    this.updateVotes(votes);
    
    // 결과 강조 표시
    document.querySelectorAll('.game-vote-card').forEach(card => {
      if (card.dataset.game === selectedMode) {
        card.classList.add('selected');
      } else {
        card.classList.add('not-selected');
      }
    });
    
    // 투표 결과 메시지 표시
    const resultMessage = document.createElement('div');
    resultMessage.className = 'voting-result';
    resultMessage.innerHTML = `
      <h3>투표 결과</h3>
      <p>"${this.getGameDisplayName(selectedMode)}"가 선택되었습니다!</p>
      <p>잠시 후 게임이 시작됩니다...</p>
    `;
    
    this.container.appendChild(resultMessage);
    
    // 결과 사운드 재생
    playSound('goal');
  }
  
  // 게임 이름 표시용
  getGameDisplayName(gameMode) {
    const names = {
      'ajaePattern': '아재 패턴',
      'gyeokdol': '격돌',
      'starforce': '스타포스'
    };
    return names[gameMode] || gameMode;
  }
  
  // 라운드 시작
  startRound(round, mode) {
    this.round = round;
    this.gameMode = mode;
    
    // 컨테이너 비우기
    this.container.innerHTML = '';
    
    // 게임 모드에 따라 인스턴스 생성 및 초기화
    switch (mode) {
      case 'ajaePattern':
        if (!this.games.ajaePattern) {
          this.games.ajaePattern = new AjaePatternGame(this.socket, this.container);
        }
        this.currentGame = this.games.ajaePattern;
        break;
        
      case 'gyeokdol':
        if (!this.games.gyeokdol) {
          this.games.gyeokdol = new GyeokdolGame(this.socket, this.container);
        }
        this.currentGame = this.games.gyeokdol;
        break;
        
      case 'starforce':
        if (!this.games.starforce) {
          this.games.starforce = new StarForceGame(this.socket, this.container);
        }
        this.currentGame = this.games.starforce;
        break;
    }
    
    // BGM 확인 및 재생
    checkAndPlayBGM();
  }
  
  // 라운드 결과 표시
  showRoundResults(round, results) {
    // 게임이 이미 결과를 표시하고 있기 때문에, 여기서는 추가 표시만
    setTimeout(() => {
      const resultsDiv = document.createElement('div');
      resultsDiv.className = 'round-results';
      resultsDiv.innerHTML = `
        <h3>${round}라운드 결과</h3>
        <table class="results-table">
          <thead>
            <tr>
              <th>순위</th>
              <th>이름</th>
              <th>점수</th>
              <th>획득 점수</th>
              <th>총점</th>
            </tr>
          </thead>
          <tbody>
            ${results.map((result, index) => `
              <tr class="${result.userId === this.socket.id ? 'my-result' : ''}">
                <td>${index + 1}</td>
                <td>${result.userName}</td>
                <td>${result.score}</td>
                <td>+${result.pointsAwarded}</td>
                <td>${result.totalScore}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p>다음 라운드 시작 대기 중...</p>
      `;
      
      this.container.appendChild(resultsDiv);
      
      // 결과 사운드 재생
      playSound('goal');
    }, 2000);
  }
  
  // 최종 결과 표시
  showFinalResults(ranking, roundResults) {
    // 컨테이너 비우기
    this.container.innerHTML = '';
    
    const finalResultsDiv = document.createElement('div');
    finalResultsDiv.className = 'final-results';
    finalResultsDiv.innerHTML = `
      <h2>게임 종료!</h2>
      <h3>최종 순위</h3>
      <table class="results-table">
        <thead>
          <tr>
            <th>순위</th>
            <th>이름</th>
            <th>총점</th>
          </tr>
        </thead>
        <tbody>
          ${ranking.map((player, index) => `
            <tr class="${player.userId === this.socket.id ? 'my-result' : ''} ${index === 0 ? 'winner' : ''}">
              <td>${index + 1}</td>
              <td>${player.userName}</td>
              <td>${player.score}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <button class="restart-button">다시 시작하기</button>
    `;
    
    this.container.appendChild(finalResultsDiv);
    
    // 다시 시작 버튼 이벤트
    document.querySelector('.restart-button').addEventListener('click', () => {
      this.socket.emit('restart_game');
    });
    
    // 승리 사운드 재생
    playSound('goal');
  }
  
  // 게임 리셋
  resetGame() {
    this.round = 0;
    this.gameMode = null;
    this.isVoting = false;
    this.userVote = null;
    
    if (this.votingInterval) {
      clearInterval(this.votingInterval);
    }
    
    if (this.currentGame) {
      this.currentGame = null;
    }
    
    // 대기 화면 표시
    this.showWaitingScreen();
  }
  
  // 대기 화면 표시
  showWaitingScreen() {
    this.container.innerHTML = '';
    
    const waitingDiv = document.createElement('div');
    waitingDiv.className = 'waiting-screen';
    waitingDiv.innerHTML = `
      <h2>게임 대기 중</h2>
      <p>방장이 게임을 시작하기를 기다리고 있습니다.</p>
      <button id="start-game-btn" class="start-game-button">게임 시작!</button>
      
      ${TEST_MODE ? `
      <div class="test-controls">
        <h3>테스트 모드</h3>
        <button id="test-ajae" class="test-button">아재패턴 테스트</button>
        <button id="test-gyeokdol" class="test-button">격돌 테스트</button>
        <button id="test-starforce" class="test-button">스타포스 테스트</button>
      </div>
      ` : ''}
    `;
    
    this.container.appendChild(waitingDiv);
    
    // 일반 시작 버튼 이벤트
    document.getElementById('start-game-btn').addEventListener('click', () => {
      this.socket.emit('start_voting');
      playSound('start');
    });
    
    // 테스트 모드 버튼 이벤트
    if (TEST_MODE) {
      document.getElementById('test-ajae').addEventListener('click', () => {
        this.forceStartGame('ajaePattern');
      });
      
      document.getElementById('test-gyeokdol').addEventListener('click', () => {
        this.forceStartGame('gyeokdol');
      });
      
      document.getElementById('test-starforce').addEventListener('click', () => {
        this.forceStartGame('starforce');
      });
    }
  }
  
  // 테스트용 기능: 투표 없이 강제로 게임 시작
  forceStartGame(gameMode) {
    if (!TEST_MODE) return;
    
    this.gameMode = gameMode;
    this.round = 1;
    
    // 게임 시작
    this.startRound(this.round, this.gameMode);
    
    // 시스템 메시지 추가
    const messageEvent = new CustomEvent('system-message', {
      detail: { message: `테스트 모드: ${this.getGameDisplayName(gameMode)} 게임을 강제로 시작합니다.` }
    });
    document.dispatchEvent(messageEvent);
    
    // 해당 게임에 필요한 초기화 데이터 생성
    let initData = null;
    
    switch(gameMode) {
      case 'ajaePattern':
        initData = {
          keySequence: this.generateKeySequence(),
          timeLimit: 10
        };
        this.socket.emit('ajae_pattern_init', initData);
        break;
        
      case 'gyeokdol':
        initData = {
          difficulty: 'normal',
          ringCount: 8
        };
        this.socket.emit('gyeokdol_init', initData);
        break;
        
      case 'starforce':
        initData = {
          difficulty: 'normal',
          attempts: 10
        };
        this.socket.emit('starforce_init', initData);
        break;
    }
    
    // 사운드 재생
    playSound('start');
  }
  
  // 테스트용 키 시퀀스 생성
  generateKeySequence() {
    const possibleKeys = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'];
    const length = 5 + Math.floor(Math.random() * 3); // 5-7 키
    
    const sequence = [];
    for (let i = 0; i < length; i++) {
      const randomKey = possibleKeys[Math.floor(Math.random() * possibleKeys.length)];
      sequence.push(randomKey);
    }
    
    return sequence;
  }
}