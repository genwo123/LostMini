import { DiscordSDK } from "@discord/embedded-app-sdk";
import { io } from "socket.io-client";
import { playSound, startBGM, stopBGM, checkAndPlayBGM } from './soundManager.js';
import "./style.css";

let auth;
let socket;
const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

// logToScreen("Loading socket...");

function setupSocket() {
  socket = io({
    path: "/.proxy/socket",
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("Connected to server:", socket.id);
    addSystemMessage("서버와 연결되었습니다. 즐거운 경마되세요.");
    // logToScreen("Connected to server:", socket.id);
  });
  socket.on("connect_error", (err) => {
    console.error("❌ Socket connection error:", err.message);
    // logToScreen("❌ Socket error: " + err.message);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server:", socket.id);
    // logToScreen("Disconnected from server:", socket.id);
    addSystemMessage("서버와 연결이 끊어졌습니다. 연결을 확인해주세요.");
    // stopBGM();
    resetGame();
  });

  socket.on("request_identity", async () => {
    console.log("🔑 Requesting identity");
    await getCurrentUser();
    socket.emit("identity_response", { userId: thisUserId, userName: thisUserName, avatars: thisUser.avatar });
  });

  socket.on("game_started", () => {
    initializeHorsePositions();
    updateCardDisplay({ suit: "", value: "" }, 0);
    showGameScreen();
    startTimer(3);
    playSound("start");
    startBGM();
  });

  socket.on("game_end", () => {
    startTimer(10);
    // stopBGM();
  });

  socket.on("message", ({ msg }) => {
    addSystemMessage(msg);
  });

  socket.on("card_drawn", ({ card, remaining, horsePositions }) => {
    gameState.currentHorsePositions = horsePositions;
    moveHorse(card.suit);
    updateCardDisplay(card, remaining);
    updateHorsePositions(horsePositions);
    startTimer(3);
    playSound("flip");
    playSound("move");
  });

  socket.on("suit_selection_request", () => {
    showSuitSelectionScreen();
  });

  socket.on("suit_selected", ({ userId, userName, selectedSuit }) => {
    gameState.selectedSuits[userId] = selectedSuit;
    updateUserSuitDisplay(userId, selectedSuit);
    console.log("suit_selected", { userId, selectedSuit });
    // 채팅창 활성화 및 메시지 표시
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
      addSystemMessage(`${userName}님이 ${suitSymbols[selectedSuit]}를 선택했습니다.`);
    }
  });

  socket.on("game_result", ({ scores, plusScores }) => {
    Object.entries(scores).forEach(([userId, score]) => {
      updateUserScore(userId, score);
      if (userId == thisUserId) {
        addSystemMessage(makeMessageWithScores(plusScores[userId]));
      }
    });
    showGameResult();
  });

  socket.on("game_reset", () => {
    resetGame();
  });

  socket.on("update_suit", ({ userId, selectedSuit }) => {
    updateUserSuitDisplay(userId, selectedSuit);
    checkAndPlayBGM();
  });

  // socket.on("user_connected", ({ userId, userName, score }) => {
  //   addOnlineUser(userId, userName);
  //   updateUserScore(userId, score);
  //   playSound("user");
  // });

  socket.on("user_informations", ({ liveUsers, userNames, userAvatars, userScores, selectedSuits }) => {
    liveUsers.forEach((userId) => {
      const tempUrl = `https://cdn.discordapp.com/avatars/${userId}/${userAvatars[userId]}.png?size=256`;;
      addOnlineUser(userId, userNames[userId], tempUrl);
      updateUserSuitDisplay(userId, selectedSuits[userId]);
      updateUserScore(userId, userScores[userId]);
    });
  });

  socket.on("user_disconnected", ({ userId }) => {
    removeOnlineUser(userId);
    playSound("user");
  });
}

const gameState = {
  selectedSuits: {}, // userId: suit
  userScores: {}, // userId: score
  currentHorsePositions: {}, // suit: position
};

// 타이머 관련 전역 변수 추가
let currentTimerInterval = null;
let thisUser = null;
let thisUserId = null;
let thisUserName = null;
const suitSymbols = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

setupDiscordSdk().then(async () => {
  console.log("Discord SDK authenticated");
  // logToScreen("📡 Discord SDK Ready");

  document.querySelector('#app').innerHTML = `<div class="main-content">
  <div class="welcome-container" id="welcome-screen">
    <h1>🎲 트럼프 경마 게임에 오신 것을 환영합니다! 🏇</h1>
    <p>트럼프 카드를 이용한 독특한 경마 게임을 즐겨보세요!</p>
    <div id="user-info"></div>
    <div class="game-rules">
      <h2>게임 규칙</h2>
      <ul>
        <li>각 플레이어는 문양(♠, ♥, ♦, ♣)을 선택합니다</li>
        <li>카드를 뒤집어 나온 문양의 말이 전진합니다</li>
        <li>결승선에 먼저 도착하는 말의 주인이 승리합니다</li>
      </ul>
    </div>
    <button class="start-game-button" disabled>로그인 중...</button>
  </div>
  <div class="game-container" id="game-screen">
    <div class="game-board">
      <div class="card-area">
        <div class="deck-container">
          <div class="deck"></div>
          <div class="card-count" style="display: none;"></div>
        </div>
        <div class="drawn-card-container">
          <div class="drawn-card" style="display: none;"></div>
        </div>
      </div>
      <div class="race-tracks">
        <div class="track header-track">
          <div class="start-line"></div>
          <div class="finish-line"></div>
          <div class="track-line"></div>
          <div class="track-cards">
            <div class="track-card"></div>
<div class="track-card"></div>
<div class="track-card"></div>
<div class="track-card"></div>
<div class="track-card"></div>
<div class="track-card"></div>
          </div>
        </div>
        
        <div class="track">
          <div class="start-line"></div>
          <div class="finish-line"></div>
          <div class="track-line"></div>
          <div class="horse-card spades">A♠</div>
        </div>

        <div class="track">
          <div class="start-line"></div>
          <div class="finish-line"></div>
          <div class="track-line"></div>
          <div class="horse-card diamonds">A♦</div>
        </div>

        <div class="track">
          <div class="start-line"></div>
          <div class="finish-line"></div>
          <div class="track-line"></div>
          <div class="horse-card clubs">A♣</div>
        </div>

        <div class="track">
          <div class="start-line"></div>
          <div class="finish-line"></div>
          <div class="track-line"></div>
          <div class="horse-card hearts">A♥</div>
        </div>
      </div>
      <div class="suit-modal" id="suit-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); display: none;">
        <div class="suit-modal-content">
          <h2>문양을 선택해주세요</h2>
          <div class="suit-grid">
            <button class="suit-button spades" data-suit="spades">♠</button>
            <button class="suit-button diamonds" data-suit="diamonds">♦</button>
            <button class="suit-button clubs" data-suit="clubs">♣</button>
            <button class="suit-button hearts" data-suit="hearts">♥</button>
          </div>
          <button class="confirm-suit-button" disabled>선택 완료</button>
        </div>
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
  </div>
</div>
<div class="online-users">
  <h2>접속중인 유저</h2>
  <div id="online-users-list"></div>
</div>`;

  appendUser();
  setupSocket();
  activateStartButton();
  registerGameMessageListeners();
});

function activateStartButton() {
  const startButton = document.querySelector('.start-game-button');
  // ✨ 시작 버튼 활성화 및 클릭 시 화면 전환
  if (startButton) {
    startButton.textContent = '경마장 입장';
    startButton.disabled = false;

    startButton.addEventListener('click', () => {
      document.getElementById('welcome-screen').style.display = 'none';
      document.getElementById('game-screen').classList.add('active');
      addSystemMessage('경마장에 입장했습니다! 문양을 선택해주세요.');
    });
  }

  // 페이지 나갈 때 유저 제거
  window.addEventListener('beforeunload', () => {
    removeOnlineUser(thisUserId);
  });

  document.querySelectorAll(".suit-button").forEach(btn => {
    btn.addEventListener("click", async () => {
      await getCurrentUser();
      const suit = btn.dataset.suit;
      selectSuit(thisUserId, suit);
    });
  });

  document.querySelector(".confirm-suit-button").addEventListener("click", confirmSuitSelection);
}

function showSuitSelectionScreen() {
  const suitModal = document.getElementById('suit-modal');
  if (suitModal) suitModal.style.display = 'block';
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
  // logToScreen(`access_token: ${access_token}`);
  auth = await discordSdk.commands.authenticate({ access_token });
  // logToScreen("🔐 access_token 사용 후 auth: " + JSON.stringify(auth));
}

function makeMessageWithScores(score) {
  if (score == 0) {
    return `안타깝네요! 점수를 획득하지 못했습니다.`;
  } else if (score == 1) {
    return `아쉽습니다! 🥉 3등입니다. 1점을 획득합니다.`;
  } else if (score == 3) {
    return `아깝습니다! 🥈 2등입니다. 3점을 획득합니다.`;
  } else if (score == 5) {
    return `축하합니다! 🥇 1등입니다. 5점을 획득합니다.`;
  }
}

function moveHorse(suit) {
  const horse = document.querySelector(`.horse-card.${suit}`);
  const positions = calculateTrackPositions();
  if (!horse || !positions.length) return;
  const next = gameState.currentHorsePositions[suit] ?? 0;
  horse.style.left = `${positions[next]}px`;
}

function updateHorsePositions(horsePositions) {
  const TRACK_LENGTH = 7;
  const positions = calculateTrackPositions();

  Object.entries(horsePositions).forEach(([suit, pos]) => {
    const horse = document.querySelector(`.horse-card.${suit}`);
    if (horse && positions[pos]) {
      horse.style.left = `${positions[pos]}px`;
      if (pos >= TRACK_LENGTH) {
        playSound("goal");
      }
    }
  });
}

function initializeHorsePositions() {
  const positions = calculateTrackPositions();
  const start = positions[0] - 40;
  ["spades", "hearts", "diamonds", "clubs"].forEach(suit => {
    const horse = document.querySelector(`.horse-card.${suit}`);
    if (horse) {
      horse.style.left = `${start}px`;
    }
  });
}

function calculateTrackPositions() {
  const track = document.querySelector('.track.header-track');
  if (!track) return [];
  const cards = track.querySelectorAll('.track-card');
  const rect = track.getBoundingClientRect();
  const pos = [];

  const start = track.querySelector('.start-line').getBoundingClientRect();
  pos.push(start.left - rect.left - 80);

  cards.forEach(c => {
    pos.push(c.getBoundingClientRect().left - rect.left);
  });

  const finish = track.querySelector('.finish-line').getBoundingClientRect();
  pos.push(finish.right - rect.left + 20);
  return pos;
}

function showGameResult() {
  const message = document.createElement("div");
  message.textContent = "🏁 경기가 끝났습니다!";
  message.style.color = "gold";
  document.querySelector(".chat-messages")?.appendChild(message);
}

function updateUserSuitDisplay(userId, suit) {
  const el = document.querySelector(`#user-${userId} .user-suit`);
  if (el) {
    el.className = `user-suit ${suit}`;
    el.textContent = getSuitSymbol(suit);
  }
}

function updateUserScore(userId, score) {
  const el = document.querySelector(`#user-${userId} .user-score`);
  if (el) {
    el.textContent = score;
  }
}

function resetGame() {
  initializeHorsePositions();
  updateCardDisplay({ suit: "", value: "" }, 52);

  // 문양 선택 모달 표시
  const suitModal = document.getElementById('suit-modal');
  if (suitModal) {
    suitModal.style.display = 'block';
  }

  // 문양 버튼 활성화
  document.querySelectorAll('.suit-button').forEach(button => {
    button.disabled = false;
    button.style.background = 'rgba(255, 255, 255, 0.1)';
  });
}

function getSuitSymbol(suit) {
  return { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[suit] || "";
}

function showGameScreen() {
  document.getElementById("welcome-screen").style.display = "none";
  document.getElementById("game-screen").classList.add("active");
}

const availableSuits = ['spades', 'hearts', 'diamonds', 'clubs'];

function selectSuit(userId, suit) {
  // 🔁 이전 선택한 버튼 초기화
  if (gameState.selectedSuits[userId]) {
    const prevSuit = gameState.selectedSuits[userId];
    const prevBtn = document.querySelector(`.suit-button[data-suit="${prevSuit}"]`);
    if (prevBtn) prevBtn.style.background = 'rgba(255, 255, 255, 0.1)';
  }

  // ✅ 새 선택 반영
  gameState.selectedSuits[userId] = suit;

  // 🔘 선택한 버튼 강조
  const selectedBtn = document.querySelector(`.suit-button[data-suit="${suit}"]`);
  if (selectedBtn) selectedBtn.style.background = 'rgba(255, 255, 255, 0.3)';

  // 🎯 내 문양 표시
  updateUserSuitDisplay(userId, suit);

  // 🟡 확인 버튼 활성화
  const confirmBtn = document.querySelector('.confirm-suit-button');
  if (confirmBtn) confirmBtn.disabled = false;

  // ❌ 이미 선택된 문양은 잠금
  // const selectedSuits = Object.values(gameState.selectedSuits);
  // availableSuits.forEach(s => {
  //   const btn = document.querySelector(`.suit-button[data-suit="${s}"]`);
  //   if (btn) {
  //     if (s !== suit && selectedSuits.includes(s)) {
  //       btn.disabled = true;
  //     } else {
  //       btn.disabled = false;
  //       btn.style.background = 'rgba(255, 255, 255, 0.1)';
  //     }
  //   }
  // });

  // 📡 서버에 알림
  // socket.emit("select_suit", { userId, suit });
}

async function confirmSuitSelection() {
  await getCurrentUser();
  const selectedSuit = gameState.selectedSuits[thisUserId];

  if (!selectedSuit) {
    showNotification("문양을 먼저 선택해주세요.");
    return;
  }

  // 문양 선택창 숨기기
  const suitModal = document.getElementById('suit-modal');
  if (suitModal) {
    suitModal.style.display = 'none';
  }

  // 채팅창 활성화 및 메시지 표시
  const chatContainer = document.querySelector('.chat-container');
  if (chatContainer) {
    chatContainer.classList.add('active');
  }

  // 서버에 문양 선택 전송 (중복 허용)
  // socket.emit("confirm_suit", { userId, suit: selectedSuit });
  socket.emit("select_suit", { userId: thisUserId, userName: thisUserName, selectedSuit });
  playSound("shuffle");
}


async function getCurrentUser() {
  if (thisUser == null) {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${auth.access_token}` },
    });
    thisUser = await res.json();
    thisUserId = thisUser.id;
    thisUserName = thisUser.global_name ?? `${thisUser.username}#${thisUser.discriminator}`;
  }
}

async function appendUser() {
  const userInfo = document.querySelector('#user-info');

  await getCurrentUser();
  const avatarUrl = `https://cdn.discordapp.com/avatars/${thisUserId}/${thisUser.avatar}.png?size=256`;

  // 온라인 목록에도 추가
  addOnlineUser(thisUserId, thisUserName, avatarUrl);

  // ✨ #user-info에 유저 프로필 추가
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

async function setupActivityMembers() {
  // logToScreen("setupActivityMembers");
  const members = await discordSdk.commands.getActivityMembers();
  // logToScreen(`setupActivityMembers: ${members} members found`);
  members.forEach(member => {
    const userId = member.user.id;
    const username = member.user.global_name || member.user.username;
    const avatar = getAvatarUrl(member.user);
    addOnlineUser(userId, username, avatar);
  });
}

function getAvatarUrl(user) {
  if (!user.avatar) {
    const index = (BigInt(user.id) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
}

function addOnlineUser(userId, username, avatarUrl) {
  if (document.querySelector(`#user-${userId}`)) return;
  const el = document.createElement("div");
  el.className = "online-user-item";
  el.id = `user-${userId}`;
  el.innerHTML = `
    <div class="user-suit"></div>
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

function logToScreen(message) {
  const box = document.querySelector('#debug-log') || (() => {
    const el = document.createElement('div');
    el.id = 'debug-log';
    el.style.position = 'fixed';
    el.style.bottom = '10px';
    el.style.left = '10px';
    el.style.background = 'rgba(0,0,0,0.7)';
    el.style.color = '#fff';
    el.style.padding = '8px';
    el.style.fontSize = '12px';
    el.style.zIndex = '9999';
    el.style.maxHeight = '200px';
    el.style.overflowY = 'auto';
    document.body.appendChild(el);
    return el;
  })();
  box.innerHTML += `<div>{${new Date().toLocaleTimeString()}} ${message}</div>`;
}

// 타이머 시작 함수
function startTimer(seconds = 3) {
  // 이전 타이머가 있으면 제거
  if (currentTimerInterval) {
    clearInterval(currentTimerInterval);
    const existingTimer = document.querySelector('.timer');
    if (existingTimer) {
      existingTimer.remove();
    }
  }

  const timerElement = document.createElement('div');
  timerElement.className = 'timer';
  timerElement.textContent = seconds.toString();
  document.querySelector('.game-board').appendChild(timerElement);

  let count = seconds;
  currentTimerInterval = setInterval(() => {
    count--;
    timerElement.textContent = count.toString();
    playSound("tick");
    if (count <= 0) {
      clearInterval(currentTimerInterval);
      currentTimerInterval = null;
      timerElement.remove();
    }
  }, 1000);
}

// 시스템 메시지 추가 함수
function addSystemMessage(message) {
  const chatMessages = document.querySelector('.chat-messages');
  if (!chatMessages) return;

  const messageElement = document.createElement('div');
  messageElement.className = 'system-message';
  messageElement.textContent = message;

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateCardDisplay(card, remaining) {
  const drawnCard = document.querySelector('.drawn-card');
  if (!drawnCard) return;
  if (!card.suit) {
    drawnCard.style.display = "none";
    return;
  }
  drawnCard.className = `drawn-card ${card.suit}`;
  drawnCard.textContent = `${card.value}${getSuitSymbol(card.suit)}`;
  drawnCard.style.display = "flex";

  const count = document.querySelector('.card-count');
  if (count) {
    count.textContent = remaining;
    count.style.display = "block";
  }
}

// 화면 크기 변경 시 말 위치 재조정
window.addEventListener('resize', () => {
  requestAnimationFrame(() => {
    const positions = calculateTrackPositions();
    Object.keys(gameState.currentHorsePositions).forEach(suit => {
      const horse = document.querySelector(`.horse-card.${suit}`);
      if (horse) {
        horse.style.left = `${positions[gameState.currentHorsePositions[suit]]}px`;
      }
    });
  });
});