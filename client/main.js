// client/main.js
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { io } from "socket.io-client";
import { playSound, startBGM, stopBGM, checkAndPlayBGM } from './soundManager.js';
import GameManager from './ClientGameManager.js';
import "./style.css";

// 테스트 모드 설정 (개발용)
const TEST_MODE = true;

let auth;
let socket;
let gameManager;
const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

// 사용자 정보
let thisUser = null;
let thisUserId = null;
let thisUserName = null;

function setupSocket() {
  socket = io({
    path: "/.proxy/socket",
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("Connected to server:", socket.id);
    addSystemMessage("서버와 연결되었습니다. 즐거운 게임 되세요!");
  });
  
  socket.on("connect_error", (err) => {
    console.error("❌ Socket connection error:", err.message);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server:", socket.id);
    addSystemMessage("서버와 연결이 끊어졌습니다. 연결을 확인해주세요.");
    resetGame();
  });

  socket.on("request_identity", async () => {
    console.log("🔑 Requesting identity");
    await getCurrentUser();
    socket.emit("identity_response", { userId: thisUserId, userName: thisUserName, avatars: thisUser.avatar });
  });

  socket.on("message", ({ msg }) => {
    addSystemMessage(msg);
  });

  socket.on("user_informations", ({ liveUsers, userNames, userAvatars, userScores }) => {
    liveUsers.forEach((userId) => {
      const tempUrl = `https://cdn.discordapp.com/avatars/${userId}/${userAvatars[userId]}.png?size=256`;
      addOnlineUser(userId, userNames[userId], tempUrl);
      updateUserScore(userId, userScores[userId]);
    });
  });

  socket.on("user_disconnected", ({ userId }) => {
    removeOnlineUser(userId);
    playSound("user");
  });
}

// 게임 상태 및 점수 관리
const gameState = {
  userScores: {}, // userId: score
};

// 인증 관련
async function setupAuth() {
  if (TEST_MODE) {
    // 테스트용 더미 유저 생성
    thisUser = {
      id: 'test-user-' + Math.floor(Math.random() * 1000),
      username: 'TestUser',
      global_name: '테스트 유저',
      avatar: 'default'
    };
    thisUserId = thisUser.id;
    thisUserName = thisUser.global_name;
    return true;
  } else {
    // 디스코드 인증
    return await setupDiscordSdk();
  }
}

async function setupDiscordSdk() {
  await discordSdk.ready();
  const { code } = await discordSdk.commands.authorize({
    client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
    response_type: "code",
    scope: ["identify", "guilds", "applications.commands"],
    prompt: "none",
    state: "",
  });

  const response = await fetch("/.proxy/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  const { access_token } = await response.json();
  auth = await discordSdk.commands.authenticate({ access_token });
  return true;
}

async function getCurrentUser() {
  if (thisUser == null) {
    if (TEST_MODE) {
      // 테스트 모드에서는 이미 설정됨
      return;
    }
    
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${auth.access_token}` },
    });
    thisUser = await res.json();
    thisUserId = thisUser.id;
    thisUserName = thisUser.global_name ?? `${thisUser.username}#${thisUser.discriminator}`;
  }
}

// 초기화
setupAuth().then(async () => {
  console.log("Authentication completed");

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
      <button class="start-game-button" disabled>로그인 중...</button>
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
  await appendUser();
  
  // 소켓 설정
  setupSocket();
  
  // 게임 매니저 초기화
  const gameContainer = document.getElementById('game-screen');
  gameManager = new GameManager(socket, gameContainer);
  
  // 시작 버튼 활성화
  activateStartButton();
  
  // 채팅 컨트롤 이벤트 등록
  registerGameMessageListeners();
});

function activateStartButton() {
  const startButton = document.querySelector('.start-game-button');
  
  if (startButton) {
    startButton.textContent = '게임 시작';
    startButton.disabled = false;

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

async function appendUser() {
  const userInfo = document.querySelector('#user-info');

  await getCurrentUser();
  
  // 아바타 URL 설정
  let avatarUrl;
  if (TEST_MODE) {
    avatarUrl = '/images/default-avatar.png'; // 기본 아바타
  } else {
    avatarUrl = `https://cdn.discordapp.com/avatars/${thisUserId}/${thisUser.avatar}.png?size=256`;
  }

  // 온라인 목록에도 추가
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

function registerGameMessageListeners() {
  // Clear 버튼 이벤트 리스너
  document.getElementById('clear-messages').addEventListener('click', () => {
    const chatMessages = document.querySelector('.chat-messages');
    if (chatMessages) {
      while (chatMessages.firstChild) {
        chatMessages.removeChild(chatMessages.firstChild);
      }
      addSystemMessage('메시지가 모두 지워졌습니다.');
    }
  });

  // 한 줄 보기 버튼 이벤트 리스너
  document.getElementById('single-line').addEventListener('click', () => {
    const chatContainer = document.getElementById('chat-container');
    const singleLineButton = document.getElementById('single-line');

    if (chatContainer.classList.contains('single-line')) {
      chatContainer.classList.remove('single-line');
      singleLineButton.classList.remove('active');
    } else {
      chatContainer.classList.add('single-line');
      chatContainer.classList.remove('maximized');
      document.getElementById('maximize-chat').textContent = '⛶';
      singleLineButton.classList.add('active');
    }
  });

  // 최대화 버튼 이벤트 리스너
  document.getElementById('maximize-chat').addEventListener('click', () => {
    const chatContainer = document.getElementById('chat-container');
    const maximizeButton = document.getElementById('maximize-chat');

    if (chatContainer.classList.contains('maximized')) {
      chatContainer.classList.remove('maximized');
      chatContainer.classList.remove('single-line');
      document.getElementById('single-line').classList.remove('active');
      maximizeButton.textContent = '⛶';
    } else {
      chatContainer.classList.add('maximized');
      chatContainer.classList.remove('single-line');
      document.getElementById('single-line').classList.remove('active');
      maximizeButton.textContent = '_';
    }
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
  document.getElementById("online-users-list").appendChild(el);
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

// 타이머 시작 함수
function startTimer(seconds = 3, callback) {
  const timerElement = document.createElement('div');
  timerElement.className = 'timer';
  timerElement.textContent = seconds.toString();
  document.querySelector('.game-board')?.appendChild(timerElement);

  let count = seconds;
  const timerInterval = setInterval(() => {
    count--;
    timerElement.textContent = count.toString();
    playSound("tick");
    
    if (count <= 0) {
      clearInterval(timerInterval);
      timerElement.remove();
      if (callback) callback();
    }
  }, 1000);
  
  return timerInterval;
}