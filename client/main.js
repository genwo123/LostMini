// client/main.js - 수정된 버전
import { io } from "socket.io-client";
import { playSound, startBGM, stopBGM, checkAndPlayBGM } from './soundManager.js';
import GameManager from './ClientGameManager.js';
import "./style.css";
import "./layout.css"; 

// 전역 변수 선언
let socket;
let gameManager;

// 사용자 정보
const thisUser = {
  id: 'test-user-' + Math.floor(Math.random() * 1000),
  username: 'TestUser',
  global_name: '테스트 유저',
  avatar: 'default'
};
const thisUserId = thisUser.id;
const thisUserName = thisUser.global_name;

// 초기화 함수 
function initialize() {
  console.log("Initializing application...");

  // 기본 UI 렌더링 - 3단 레이아웃으로 수정
  document.querySelector('#app').innerHTML = `
  <div class="layout-container">
    <!-- 왼쪽 결과 사이드바 -->
    <div class="game-results-sidebar">
      <h2>게임 결과</h2>
      <div class="sidebar-results-content">
        <!-- 게임 결과가 이곳에 동적으로 표시됨 -->
        <div class="sidebar-initial-message">
          라운드별 게임 결과가 여기에 표시됩니다.
        </div>
      </div>
    </div>

    <!-- 중앙 메인 콘텐츠 -->
    <div class="main-content">
      <div class="welcome-container" id="welcome-screen">
        <h1>🎮 로스트아크 키보드 미니게임</h1>
        <p>아재패턴, 격돌, 스타포스 등 다양한 미니게임을 플레이하세요!</p>
        <div id="user-info"></div>
        <div class="game-rules">
          <h2>게임 모드</h2>
          <ul>
            <li>아재패턴: 시간 내에 순서대로 키보드를 입력하세요</li>
            <li>격돌: 원의 크기가 정확한 타이밍에 키를 누르세요</li>
            <li>스타포스: 움직이는 바가 목표 영역을 지날 때 키를 누르세요</li>
          </ul>
        </div>
        <button class="start-game-button">게임 시작</button>
      </div>
      <div class="game-container" id="game-screen">
        <!-- 게임 콘텐츠는 GameManager에 의해 동적으로 관리됨 -->
      </div>
      <div class="chat-container" id="chat-container">
        <div class="chat-header">
          <span>게임 메시지</span>
          <div class="chat-controls">
            <button id="clear-messages" class="control-button" title="메시지 지우기">Clear</button>
            <button id="single-line" class="control-button" title="한 줄 보기">1</button>
            <button id="maximize-chat" class="maximize-button" title="최대화">⛶</button>
          </div>
        </div>
        <div class="chat-messages"></div>
      </div>
    </div>

    <!-- 오른쪽 유저 목록 사이드바 -->
    <div class="online-users">
      <h2>접속중인 유저</h2>
      <div id="online-users-list"></div>
    </div>
  </div>`;

  // 소켓 설정 먼저 하기
  setupSocket();
  
  // 유저 정보 추가 (소켓 연결 후)
  appendUser();
  
  // 게임 매니저 초기화
  const gameContainer = document.getElementById('game-screen');
  gameManager = new GameManager(socket, gameContainer);
  
  // 시작 버튼 활성화
  activateStartButton();
  
  // 채팅 컨트롤 이벤트 등록
  registerGameMessageListeners();
  
  // 결과 업데이트 이벤트 리스너 등록
  document.addEventListener('round-results-updated', handleRoundResultsUpdate);
  document.addEventListener('final-results-updated', handleFinalResultsUpdate);
  
  // BGM 확인 및 재생
  checkAndPlayBGM();
  
  // 초기 시스템 메시지 표시
  addSystemMessage("게임이 초기화되었습니다. 서버 연결을 기다리는 중...");
}


function setupSocket() {
  // 서버에 직접 연결 (프록시 사용 안함)
  socket = io("http://localhost:3001", {
    path: "/socket",
    transports: ["websocket"],
  });

  console.log("📡 Trying to connect to socket...");

  socket.on("connect", () => {
    console.log("✅ Connected! socket.id:", socket.id);
    addSystemMessage("서버와 연결되었습니다. 즐거운 게임 되세요!");
    
    // 연결되면 유저 정보 전송
    socket.emit("identity_response", { 
      userId: thisUserId, 
      userName: thisUserName,
      avatars: thisUser.avatar 
    });
  });
  
  socket.on("connect_error", (err) => {
    console.error("❌ Socket connection error:", err.message);
    addSystemMessage(`서버 연결 오류: ${err.message}`);
  });

  socket.on("disconnect", () => {
    console.log("🔌 Disconnected");
    addSystemMessage("서버와 연결이 끊어졌습니다. 연결을 확인해주세요.");
    resetGame();
  });

  socket.on("request_identity", () => {
    console.log("🔑 Requesting identity");
    socket.emit("identity_response", { 
      userId: thisUserId, 
      userName: thisUserName, 
      avatars: thisUser.avatar 
    });
  });

  socket.on("message", ({ msg }) => {
    addSystemMessage(msg);
  });

  socket.on("user_informations", ({ liveUsers, userNames, userAvatars, userScores }) => {
    // 기존 유저 목록 비우기 
    const usersList = document.getElementById("online-users-list");
    if (usersList) {
      usersList.innerHTML = '';
    }
    
    // 받은 유저 정보로 목록 새로 구성
    liveUsers.forEach((userId) => {
      const tempUrl = userAvatars[userId] ? 
        `https://cdn.discordapp.com/avatars/${userId}/${userAvatars[userId]}.png?size=256` : 
        '/images/default-avatar.png';
      addOnlineUser(userId, userNames[userId], tempUrl);
      updateUserScore(userId, userScores[userId]);
    });
  });

  socket.on("user_disconnected", ({ userId }) => {
    removeOnlineUser(userId);
    playSound("user");
  });
}

function appendUser() {
  const userInfo = document.querySelector('#user-info');
  
  // 아바타 URL 설정
  const avatarUrl = '/images/default-avatar.png'; // 기본 아바타

  // 온라인 목록에 내 유저 추가
  addOnlineUser(thisUserId, thisUserName, avatarUrl);

  // #user-info에 유저 프로필 추가
  if (userInfo) {
    const userContainer = document.createElement('div');
    userContainer.className = 'user-container';

    const userImg = document.createElement('img');
    userImg.src = avatarUrl;
    userImg.width = 64;
    userImg.height = 64;
    userImg.style.borderRadius = '50%';
    userContainer.appendChild(userImg);

    const welcomeText = document.createElement('p');
    welcomeText.textContent = `${thisUserName}님, 즐거운 게임 되세요!`;
    welcomeText.className = 'welcome-text';
    userContainer.appendChild(welcomeText);

    userInfo.appendChild(userContainer);
  }
}

function activateStartButton() {
  const startButton = document.querySelector('.start-game-button');
  
  if (startButton) {
    startButton.addEventListener('click', () => {
      document.getElementById('welcome-screen').style.display = 'none';
      document.getElementById('game-screen').classList.add('active');
      
      // 게임 매니저의 대기 화면 표시
      gameManager.showWaitingScreen();
      addSystemMessage('게임에 입장했습니다! 다른 플레이어들을 기다리는 중...');
    });
  }

  // 페이지 나갈 때 유저 제거
  window.addEventListener('beforeunload', () => {
    if (socket && thisUserId) {
      socket.emit('user_leave', { userId: thisUserId });
    }
  });
}

function registerGameMessageListeners() {
  // Clear 버튼 이벤트 리스너
  document.getElementById('clear-messages')?.addEventListener('click', () => {
    const chatMessages = document.querySelector('.chat-messages');
    if (chatMessages) {
      while (chatMessages.firstChild) {
        chatMessages.removeChild(chatMessages.firstChild);
      }
      addSystemMessage('메시지가 모두 지워졌습니다.');
    }
  });

  // 한 줄 보기 버튼 이벤트 리스너
  document.getElementById('single-line')?.addEventListener('click', () => {
    const chatContainer = document.getElementById('chat-container');
    const singleLineButton = document.getElementById('single-line');

    if (chatContainer && singleLineButton) {
      if (chatContainer.classList.contains('single-line')) {
        chatContainer.classList.remove('single-line');
        singleLineButton.classList.remove('active');
      } else {
        chatContainer.classList.add('single-line');
        chatContainer.classList.remove('maximized');
        document.getElementById('maximize-chat').textContent = '⛶';
        singleLineButton.classList.add('active');
      }
    }
  });

  // 최대화 버튼 이벤트 리스너
  document.getElementById('maximize-chat')?.addEventListener('click', () => {
    const chatContainer = document.getElementById('chat-container');
    const maximizeButton = document.getElementById('maximize-chat');

    if (chatContainer && maximizeButton) {
      if (chatContainer.classList.contains('maximized')) {
        chatContainer.classList.remove('maximized');
        chatContainer.classList.remove('single-line');
        document.getElementById('single-line')?.classList.remove('active');
        maximizeButton.textContent = '⛶';
      } else {
        chatContainer.classList.add('maximized');
        chatContainer.classList.remove('single-line');
        document.getElementById('single-line')?.classList.remove('active');
        maximizeButton.textContent = '_';
      }
    }
  });
  
  // 시스템 메시지 이벤트 리스너
  document.addEventListener('system-message', (event) => {
    addSystemMessage(event.detail.message);
  });
}

// 라운드 결과 업데이트 핸들러
function handleRoundResultsUpdate(event) {
  const { round, results } = event.detail;
  
  // 사이드바에 결과 표시
  const sidebarContent = document.querySelector('.sidebar-results-content');
  if (!sidebarContent) return;
  
  // 초기 메시지 제거
  const initialMessage = sidebarContent.querySelector('.sidebar-initial-message');
  if (initialMessage) {
    initialMessage.remove();
  }
  
  // 기존 내용을 유지하면서 새 결과 추가
  const roundTitle = document.createElement('div');
  roundTitle.className = 'sidebar-round-title';
  roundTitle.textContent = `${round}라운드 결과`;
  sidebarContent.appendChild(roundTitle);
  
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
        <tr class="${result.userId === socket.id ? 'my-result' : ''}">
          <td>${index + 1}</td>
          <td>${result.userName}</td>
          <td>${result.score}</td>
          <td>+${result.pointsAwarded || 0}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  sidebarContent.appendChild(resultTable);
  
  // 유저 점수 업데이트
  results.forEach(result => {
    updateUserScore(result.userId, result.totalScore || 0);
    
    // 게임 결과에 따른 상태 업데이트
    if (result.success === true) {
      updateUserStatus(result.userId, 'success');
    } else if (result.success === false) {
      updateUserStatus(result.userId, 'fail');
    }
  });
  
  // 스크롤을 최하단으로
  sidebarContent.scrollTop = sidebarContent.scrollHeight;
}

// 최종 결과 업데이트 핸들러
function handleFinalResultsUpdate(event) {
  const { ranking } = event.detail;
  
  // 사이드바에 최종 결과 표시
  const sidebarContent = document.querySelector('.sidebar-results-content');
  if (!sidebarContent) return;
  
  // 초기 메시지 제거
  const initialMessage = sidebarContent.querySelector('.sidebar-initial-message');
  if (initialMessage) {
    initialMessage.remove();
  }
  
  // 최종 결과 제목
  const finalTitle = document.createElement('div');
  finalTitle.className = 'sidebar-round-title';
  finalTitle.textContent = '최종 결과';
  sidebarContent.appendChild(finalTitle);
  
  // 최종 결과 테이블
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
        <tr class="${player.userId === socket.id ? 'my-result' : ''} ${index === 0 ? 'winner' : ''}">
          <td>${index + 1}</td>
          <td>${player.userName}</td>
          <td>${player.score}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  sidebarContent.appendChild(resultTable);
  
  // 유저 최종 점수 업데이트 및 순위에 따른 표시
  ranking.forEach((player, index) => {
    updateUserScore(player.userId, player.score);
    
    // 1등은 winner 클래스 추가
    if (index === 0) {
      const userEl = document.querySelector(`#user-${player.userId}`);
      if (userEl) {
        userEl.classList.add('winner');
      }
    }
  });
  
  // 점수 순으로 유저 목록 재정렬
  const usersListContainer = document.querySelector('#online-users-list');
  if (usersListContainer) {
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
  
  // 스크롤을 최하단으로
  sidebarContent.scrollTop = sidebarContent.scrollHeight;
}

// 사용자 관리 함수
function addOnlineUser(userId, username, avatarUrl) {
  if (document.querySelector(`#user-${userId}`)) return;
  
  const el = document.createElement("div");
  el.className = "online-user-item";
  el.id = `user-${userId}`;
  
  // 유저 상태 및 정보 표시
  el.innerHTML = `
    <div class="user-status" title="접속중"></div>
    <img src="${avatarUrl}" width="32" height="32" alt="${username}" />
    <span class="user-name">${username}</span>
    <span class="user-score">0</span>
  `;
  
  // 내 유저인 경우 표시 (socket.id는 undefined일 수 있으므로 체크)
  if (socket && userId === socket.id || userId === thisUserId) {
    el.classList.add('my-result');
  }
  
  document.getElementById("online-users-list")?.appendChild(el);
}

function removeOnlineUser(userId) {
  const el = document.querySelector(`#user-${userId}`);
  if (el) el.remove();
}

function updateUserScore(userId, score) {
  const el = document.querySelector(`#user-${userId} .user-score`);
  if (el) {
    el.textContent = score;
  }
}

function updateUserStatus(userId, status) {
  const userElement = document.querySelector(`#user-${userId}`);
  if (!userElement) return;
  
  // 기존 상태 제거
  userElement.classList.remove('success', 'fail', 'playing');
  
  // 새 상태 추가
  userElement.classList.add(status);
  
  // 상태 아이콘 업데이트
  const statusIcon = userElement.querySelector('.user-status');
  if (statusIcon) {
    statusIcon.className = 'user-status ' + status;
    
    if (status === 'success') {
      statusIcon.setAttribute('title', '성공');
    } else if (status === 'fail') {
      statusIcon.setAttribute('title', '실패');
    } else if (status === 'playing') {
      statusIcon.setAttribute('title', '게임 중');
    }
  }
}

// 메시지 표시 함수
function addSystemMessage(message) {
  const chatMessages = document.querySelector('.chat-messages');
  if (!chatMessages) return;

  const messageElement = document.createElement('div');
  messageElement.className = 'system-message';
  messageElement.textContent = message;

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 게임 리셋
function resetGame() {
  if (gameManager) {
    gameManager.resetGame();
  }
}

// CSS에 필요한 추가 스타일 적용
function addAdditionalStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .sidebar-initial-message {
      color: var(--text-secondary);
      font-style: italic;
      text-align: center;
      margin: 20px 0;
      padding: 10px;
      background-color: rgba(0, 0, 0, 0.2);
      border-radius: 5px;
    }
    
    /* 사이드바 내용이 없을 때 스타일 */
    .sidebar-results-content:empty::before {
      content: "아직 게임 결과가 없습니다.";
      display: block;
      color: var(--text-secondary);
      font-style: italic;
      text-align: center;
      margin: 20px 0;
    }
    
    /* 레이아웃 컨테이너의 전체 높이 설정 (오버플로우 방지) */
    .layout-container {
      height: 100% !important; 
      min-height: 100% !important;
      overflow: hidden !important;
    }
    
    /* 왼쪽 사이드바 높이 설정 */
    .game-results-sidebar {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      min-height: 100% !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
    }
    
    /* 오른쪽 사이드바 확인 */
    .online-users {
      height: 100% !important;
      min-height: 100% !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
    }
    
    /* 중앙 컨텐츠 영역 조정 */
    .main-content {
      height: 100% !important;
      min-height: 100% !important;
      overflow-y: auto !important;
    }
    
    /* 사이드바 내용 영역 */
    .sidebar-results-content {
      flex: 1 1 auto !important;
      display: flex !important;
      flex-direction: column !important;
      overflow-y: auto !important;
    }
    
    /* 더미 공간 스타일 */
    .dummy-space {
      flex: 1 !important;
    }
    
    /* body 스타일 조정 */
    body, html {
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }
    
    #app {
      height: 100% !important;
      overflow: hidden !important;
    }
  `;
  document.head.appendChild(styleElement);
  
  // 왼쪽 사이드바에 더미 공간 요소 추가
  const contentArea = document.querySelector('.sidebar-results-content');
  if (contentArea && !contentArea.querySelector('.dummy-space')) {
    const dummySpace = document.createElement('div');
    dummySpace.className = 'dummy-space';
    contentArea.appendChild(dummySpace);
  }
}


// 애플리케이션 초기화 및 시작
initialize();
addAdditionalStyles();

// BGM 확인 및 재생
checkAndPlayBGM();