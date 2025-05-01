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
    this.totalParticipants = 0;
    this.votesSubmitted = 0;

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
      
      // 모든 참가자가 투표했는지 확인하고 타이머 단축
      this.votesSubmitted = Object.values(data.votes).reduce((sum, count) => sum + count, 0);
      if (this.votesSubmitted >= this.totalParticipants && this.votingTimeLeft > 5) {
        // 모든 참가자가 투표했으면 5초로 단축
        this.votingTimeLeft = 5;
        const timerElement = document.getElementById('voting-timer');
        if (timerElement) {
          timerElement.textContent = this.votingTimeLeft;
        }
        
        // 알림 표시
        const messageEvent = new CustomEvent('system-message', {
          detail: { message: `모든 플레이어가 투표를 완료했습니다. 카운트다운이 단축됩니다!` }
        });
        document.dispatchEvent(messageEvent);
      }
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
    
    // 유저 정보 업데이트를 받아 참가자 수 파악
    this.socket.on('user_informations', (data) => {
      this.totalParticipants = data.liveUsers.length;
    });
    
    // 게임 초기화 이벤트 리스너 추가
    this.socket.on('ajae_pattern_init', (data) => {
      console.log('Received ajae_pattern_init in ClientGameManager:', data);
      // 웰컴 화면이 표시되어 있으면 숨김
      const welcomeScreen = document.getElementById('welcome-screen');
      if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
      }
      
      // 게임 화면 표시
      if (this.container) {
        this.container.style.display = 'block';
      }
      
      // 아재패턴 게임 화면 표시
      this.startRound(1, 'ajaePattern');
    });
    
    this.socket.on('gyeokdol_init', (data) => {
      console.log('Received gyeokdol_init in ClientGameManager:', data);
      // 웰컴 화면이 표시되어 있으면 숨김
      const welcomeScreen = document.getElementById('welcome-screen');
      if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
      }
      
      // 게임 화면 표시
      if (this.container) {
        this.container.style.display = 'block';
      }
      
      // 격돌 게임 화면 표시
      this.startRound(1, 'gyeokdol');
    });
    
    this.socket.on('starforce_init', (data) => {
      console.log('Received starforce_init in ClientGameManager:', data);
      // 웰컴 화면이 표시되어 있으면 숨김
      const welcomeScreen = document.getElementById('welcome-screen');
      if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
      }
      
      // 게임 화면 표시
      if (this.container) {
        this.container.style.display = 'block';
      }
      
      // 스타포스 게임 화면 표시
      this.startRound(1, 'starforce');
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
    this.votesSubmitted = 0;
    
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
          <div class="game-image" style="background-color: #3a80c9;"></div>
          <p>주어진 시간 내에 키보드로 표시된 키를 순서대로 누르세요!</p>
          <div class="vote-count" id="vote-ajaePattern">0 표</div>
          <button class="vote-button">투표하기</button>
        </div>
        <div class="game-vote-card" data-game="gyeokdol">
          <h3>격돌</h3>
          <div class="game-image" style="background-color: #4caf50;"></div>
          <p>원이 줄어들 때 정확한 타이밍에 키를 눌러 점수를 얻으세요!</p>
          <div class="vote-count" id="vote-gyeokdol">0 표</div>
          <button class="vote-button">투표하기</button>
        </div>
        <div class="game-vote-card" data-game="starforce">
          <h3>스타포스</h3>
          <div class="game-image" style="background-color: #ff9800;"></div>
          <p>움직이는 바가 목표 영역을 지날 때 키를 눌러 클리어하고 점수를 얻으세요!</p>
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
      <div class="countdown-timer">
        <p>게임 시작까지</p>
        <div class="countdown-display">5</div>
        <p>초</p>
      </div>
    `;
    
    this.container.appendChild(resultMessage);
    
    // 결과 사운드 재생
    playSound('goal');
    
    // 5초 카운트다운 시작
    let countdown = 5;
    const countdownDisplay = document.querySelector('.countdown-display');
    
    // 시스템 메시지로 알림
    const messageEvent = new CustomEvent('system-message', {
      detail: { message: `${this.getGameDisplayName(selectedMode)} 게임이 5초 후에 시작됩니다!` }
    });
    document.dispatchEvent(messageEvent);
    
    const countdownInterval = setInterval(() => {
      countdown--;
      
      if (countdownDisplay) {
        countdownDisplay.textContent = countdown;
      }
      
      // 카운트다운 사운드
      if (countdown > 0) {
        playSound('tick');
      }
      
      // 카운트다운 종료
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        
        // 게임 시작
        this.startRound(this.round, this.gameMode);
      }
    }, 1000);
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
    console.log(`Starting round ${round} with mode: ${mode}`);
    this.round = round;
    this.gameMode = mode;
    
    // 게임 화면 요소 표시
    if (this.container) {
      this.container.style.display = 'block';
      console.log('Game container display set to block');
    }
    
    // 컨테이너 비우기
    this.container.innerHTML = '';
    console.log('Container cleared');
    
    // 게임 모드에 따라 인스턴스 생성 및 초기화
    console.log('Creating game instance for mode:', mode);
    switch (mode) {
      case 'ajaePattern':
        console.log('Creating AjaePatternGame');
        if (!this.games.ajaePattern) {
          this.games.ajaePattern = new AjaePatternGame(this.socket, this.container);
          console.log('AjaePatternGame instance created:', this.games.ajaePattern);
        }
        this.currentGame = this.games.ajaePattern;
        break;
        
      case 'gyeokdol':
        console.log('Creating GyeokdolGame');
        if (!this.games.gyeokdol) {
          this.games.gyeokdol = new GyeokdolGame(this.socket, this.container);
          console.log('GyeokdolGame instance created:', this.games.gyeokdol);
        }
        this.currentGame = this.games.gyeokdol;
        break;
        
      case 'starforce':
        console.log('Creating StarForceGame');
        if (!this.games.starforce) {
          this.games.starforce = new StarForceGame(this.socket, this.container);
          console.log('StarForceGame instance created:', this.games.starforce);
        }
        this.currentGame = this.games.starforce;
        break;
    }
    
    // BGM 확인 및 재생
    checkAndPlayBGM();
  }
  
  // 라운드 결과 표시 함수 수정
  showRoundResults(round, results) {
    // 결과를 사이드바에만 표시하도록 수정
    this.updateSidebarResults(round, results);
    
    // 결과 사운드 재생
    playSound('goal');
    
    // 시스템 메시지로 결과 알림
    const messageEvent = new CustomEvent('system-message', {
      detail: { message: `${round}라운드가 종료되었습니다. 다음 라운드는 잠시 후 시작됩니다.` }
    });
    document.dispatchEvent(messageEvent);
    
    // 이벤트 발생 - 결과 업데이트
    const resultsEvent = new CustomEvent('round-results-updated', {
      detail: { round, results }
    });
    document.dispatchEvent(resultsEvent);
  }
  
  // 최종 결과 표시 함수 수정
  showFinalResults(ranking, roundResults) {
    // 결과를 사이드바에만 표시하도록 수정
    this.updateSidebarFinalResults(ranking);
    
    // 중앙에 게임 종료 메시지와 다시 시작 버튼만 표시
    this.container.innerHTML = '';
    
    const gameEndDiv = document.createElement('div');
    gameEndDiv.className = 'game-end-message';
    gameEndDiv.innerHTML = `
      <h2>게임 종료!</h2>
      <p>왼쪽 사이드바에서 최종 결과를 확인하세요.</p>
      <button class="restart-button">다시 시작하기</button>
    `;
    
    this.container.appendChild(gameEndDiv);
    
    // 다시 시작 버튼 이벤트
    document.querySelector('.restart-button').addEventListener('click', () => {
      this.socket.emit('restart_game');
    });
    
    // 승리 사운드 재생
    playSound('goal');
    
    // 시스템 메시지로 종료 알림
    const messageEvent = new CustomEvent('system-message', {
      detail: { message: `게임이 종료되었습니다. 최종 결과를 확인하세요!` }
    });
    document.dispatchEvent(messageEvent);
    
    // 이벤트 발생 - 최종 결과 업데이트
    const finalResultsEvent = new CustomEvent('final-results-updated', {
      detail: { ranking, roundResults }
    });
    document.dispatchEvent(finalResultsEvent);
  }

// 라운드 결과 업데이트 부분
updateSidebarResults(round, results) {
  const sidebarContent = document.querySelector('.sidebar-results-content');
  if (!sidebarContent) return;
  
  // 기존 내용 초기화
  sidebarContent.innerHTML = '';
  
  // 라운드 제목 추가
  const roundTitle = document.createElement('div');
  roundTitle.className = 'sidebar-round-title';
  roundTitle.textContent = `${round}라운드 결과`;
  sidebarContent.appendChild(roundTitle);
  
  // 결과 테이블 생성
  const resultTable = document.createElement('table');
  resultTable.className = 'sidebar-results-table';
  resultTable.innerHTML = `
    <thead>
      <tr>
        <th>순위</th>
        <th>이름</th>
        <th>점수</th>
        <th>+/-</th>
      </tr>
    </thead>
    <tbody>
      ${results.map((result, index) => `
        <tr class="${result.userId === this.socket.id ? 'my-result' : ''}">
          <td>${index + 1}</td>
          <td>${result.userName}</td>
          <td>${result.score}</td>
          <td>+${result.pointsAwarded || 0}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  sidebarContent.appendChild(resultTable);
  
  // 다른 유저들의 점수도 업데이트
  this.updateUsersScore(results);
}

// 사이드바 최종 결과 업데이트
updateSidebarFinalResults(ranking) {
  const sidebarContent = document.querySelector('.sidebar-results-content');
  if (!sidebarContent) return;
  
  // 기존 내용 초기화
  sidebarContent.innerHTML = '';
  
  // 최종 결과 제목 추가
  const finalTitle = document.createElement('div');
  finalTitle.className = 'sidebar-round-title';
  finalTitle.textContent = '최종 결과';
  sidebarContent.appendChild(finalTitle);
  
  // 결과 테이블 생성
  const resultTable = document.createElement('table');
  resultTable.className = 'sidebar-results-table';
  resultTable.innerHTML = `
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
  `;
  sidebarContent.appendChild(resultTable);
  
  // 다른 유저들의 최종 점수 업데이트
  this.updateUsersFinalScore(ranking);
}

// 유저 점수 업데이트 (오른쪽 사이드바)
updateUsersScore(results) {
  // 각 유저별로 점수 업데이트
  results.forEach(result => {
    const userScoreElement = document.querySelector(`#user-${result.userId} .user-score`);
    if (userScoreElement) {
      // 현재 라운드 결과의 총점 표시
      userScoreElement.textContent = result.totalScore || 0;
      
      // 내 점수인 경우 강조 표시
      if (result.userId === this.socket.id) {
        const userItem = document.querySelector(`#user-${result.userId}`);
        if (userItem) {
          userItem.classList.add('my-result');
        }
      }
    }
  });
}

// 최종 점수 업데이트 (오른쪽 사이드바)
updateUsersFinalScore(ranking) {
  // 순위에 따라 유저 목록 정렬 및 점수 업데이트
  ranking.forEach((player, index) => {
    const userScoreElement = document.querySelector(`#user-${player.userId} .user-score`);
    if (userScoreElement) {
      // 최종 점수 표시
      userScoreElement.textContent = player.score;
      
      // 1등인 경우 강조 표시
      const userItem = document.querySelector(`#user-${player.userId}`);
      if (userItem) {
        if (index === 0) {
          userItem.classList.add('winner');
        }
        
        // 내 결과인 경우 강조 표시
        if (player.userId === this.socket.id) {
          userItem.classList.add('my-result');
        }
      }
    }
  });
  
  // 유저 리스트 컨테이너
  const usersListContainer = document.querySelector('#online-users-list');
  if (!usersListContainer) return;
  
  // 점수 순으로 유저 목록 재정렬
  const userItems = Array.from(usersListContainer.querySelectorAll('.online-user-item'));
  
  // 점수 기준으로 정렬 (내림차순)
  userItems.sort((a, b) => {
    const scoreA = parseInt(a.querySelector('.user-score').textContent) || 0;
    const scoreB = parseInt(b.querySelector('.user-score').textContent) || 0;
    return scoreB - scoreA;
  });
  
  // 정렬된 순서로 DOM에 다시 추가
  userItems.forEach(item => {
    usersListContainer.appendChild(item);
  });
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
    `;
    
    this.container.appendChild(waitingDiv);
    
    // 일반 시작 버튼 이벤트
    document.getElementById('start-game-btn')?.addEventListener('click', () => {
      this.socket.emit('start_voting');
      playSound('start');
    });
  }
}