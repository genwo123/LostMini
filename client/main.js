// client/main.js - Discord SDK 완전 제거 버전
import { io } from "socket.io-client";
import { playSound, startBGM, stopBGM, checkAndPlayBGM } from './soundManager.js';
import GameManager from './ClientGameManager.js';
import "./style.css";

// 테스트 모드 설정 (개발용)
const TEST_MODE = true;

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

  // 기본 UI 렌더링
  document.querySelector('#app').innerHTML = `
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
      
      <div class="test-controls">
        <h3>테스트 모드</h3>
        <button id="test-ajae" class="test-button">아재패턴 테스트</button>
        <button id="test-gyeokdol" class="test-button">격돌 테스트</button>
        <button id="test-starforce" class="test-button">스타포스 테스트</button>
      </div>
    </div>
    <div class="game-container" id="game-screen">
      <!-- 게임 콘텐츠는 GameManager에 의해 동적으로 관리됨 -->
    </div>
    <div class="chat-container" id="chat-container">
      <div class="chat-header">
        <span>게임 메시지</span>
        <div class="chat-controls">
          <button id="clear-messages" class="control-button">Clear</button>
          <button id="single-line" class="control-button">1</button>
          <button id="maximize-chat" class="maximize-button">⛶</button>
        </div>
      </div>
      <div class="chat-messages"></div>
    </div>
  </div>
  <div class="online-users">
    <h2>접속중인 유저</h2>
    <div id="online-users-list"></div>
  </div>`;

  // 유저 정보 추가
  appendUser();
  
  // 소켓 설정
  setupSocket();
  
  // 게임 매니저 초기화
  const gameContainer = document.getElementById('game-screen');
  gameManager = new GameManager(socket, gameContainer);
  
  // 시작 버튼 활성화
  activateStartButton();
  
  // 채팅 컨트롤 이벤트 등록
  registerGameMessageListeners();
  
  // 테스트 모드 버튼 이벤트 등록
  registerTestButtons();
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

  // 온라인 목록에 추가
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

function registerTestButtons() {
  // 테스트 버튼 이벤트 리스너
  document.getElementById('test-ajae')?.addEventListener('click', () => {
    const data = {
      keySequence: ['a', 's', 'd', 'f', 'j', 'k', 'l'],
      timeLimit: 10
    };
    socket.emit('ajae_pattern_init', data);
    
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('game-screen').classList.add('active');
  });

  document.getElementById('test-gyeokdol')?.addEventListener('click', () => {
    const data = {
      difficulty: 'normal',
      ringCount: 8,
      speed: 1
    };
    socket.emit('gyeokdol_init', data);
    
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('game-screen').classList.add('active');
  });

  document.getElementById('test-starforce')?.addEventListener('click', () => {
    const data = {
      difficulty: 'normal',
      attempts: 10,
      barSpeed: 1
    };
    socket.emit('starforce_init', data);
    
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('game-screen').classList.add('active');
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

// 사용자 관리 함수
function addOnlineUser(userId, username, avatarUrl) {
  if (document.querySelector(`#user-${userId}`)) return;
  const el = document.createElement("div");
  el.className = "online-user-item";
  el.id = `user-${userId}`;
  el.innerHTML = `
    <div class="user-status"></div>
    <img src="${avatarUrl}" width="32" height="32" />
    <span class="user-name">${username}</span>
    <span class="user-score">0</span>
  `;
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

// 애플리케이션 초기화 및 시작
initialize();

// BGM 확인 및 재생
checkAndPlayBGM();