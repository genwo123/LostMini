//  서버 통합 버전: Discord OAuth 토큰 처리 + 실시간 게임 로직 포함
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import fetch from "node-fetch";

dotenv.config({ path: "../.env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3001;
const TRACK_LENGTH = 7;

const connectedClients = new Set();
const userSocketMap = new Map();


app.get("/api/test", (req, res) => {
  res.send("Hello World");
});

// Discord OAuth 처리
app.post("/api/token", async (req, res) => {
  // Exchange the code for an access_token
  const response = await fetch(`https://discord.com/api/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.VITE_DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: req.body.code,
    }),
  });

  // Retrieve the access_token from the response
  const { access_token } = await response.json();

  // Return the access_token to our client as { access_token: "..."}
  res.send({access_token});
  console.log(`this is access_token:${access_token}`);
});

// SPA의 라우팅 대응 - 존재하지 않는 경로 요청 시 index.html 반환
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// === 게임 상태 ===
let deck = [];
let timer = null;       // 게임 진행 타이머 
let resetTimer = null; // 게임 종료 10초 후 초기화
let waitReconnectTimer = null;  // 유저 재접속 대기 타이머 
let horsePositions = {};
let finishOrder = [];
let selectedSuits = {};
let userScores = {};
let plusScores = {};

initializeDeck();
initializeGameState();

function initializeDeck() {
  console.log("initializeDeck");
  const suits = ["spades", "hearts", "diamonds", "clubs"];
  const values = ["2","3","4","5","6","7","8","9","10","J","Q","K"];
  deck = [];
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }
  shuffle(deck);
}

// 카드 이름 생성
function getCardName(card) {
  const valueNames = {
    '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', '10': '10', 'J': '잭', 'Q': '퀸', 'K': '킹', 'A': '에이스'
  };
  
  const suitNames = {
    spades: '스페이드',
    hearts: '하트',
    diamonds: '다이아몬드',
    clubs: '클럽'
  };
  
  return `${suitNames[card.suit]} ${valueNames[card.value]}`;
}

// 문양 이름 가져오기
function getSuitName(suit) {
  const suitNames = {
    spades: '스페이드',
    hearts: '하트',
    diamonds: '다이아몬드',
    clubs: '클럽'
  };
  return suitNames[suit] || suit;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function initializeUsers() {
  // userScores = {};
  selectedSuits = {};
}

function initializeGameState() {
  horsePositions = {
    spades: 0, hearts: 0, diamonds: 0, clubs: 0,
  };
  finishOrder = [];
  plusScores = {};

  console.log("initializeGameState");
}

let isPlaying = false;

function startResetTimer() {
  if (resetTimer) clearInterval(resetTimer);
  resetTimer = setInterval(() => {
    initializeDeck();
    initializeGameState();
    initializeUsers();
    io.emit("game_reset");
    clearInterval(resetTimer);
    isPlaying = false;
    if (timer) clearInterval(timer);
    console.log("game_reset by startResetTimer");
  }, 10000);
}

function startWaitReconnectTimer() {
  if (waitReconnectTimer) clearInterval(waitReconnectTimer);
  waitReconnectTimer = setInterval(() => {
    initializeDeck();
    initializeGameState();
    initializeUsers();
    io.emit("game_reset");
    console.log("🎮 All players disconnected. Game reset!");
    clearInterval(waitReconnectTimer);
    if (timer) clearInterval(timer);
    if (resetTimer) clearInterval(resetTimer);
    console.log("game_reset by startWaitReconnectTimer");
  }, 10000);
}

function startGameTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (deck.length === 0 || finishOrder.length > 0) {
      clearInterval(timer);
      calculateScores();
      io.emit("game_end");
      io.emit("message", { msg: "10초 후 게임이 초기화 됩니다." });
      startResetTimer();
      return;
    }

    const card = deck.pop();
    horsePositions[card.suit] += 1;

    if (
      horsePositions[card.suit] >= TRACK_LENGTH &&
      !finishOrder.includes(card.suit)
    ) {
      finishOrder.push(card.suit);
    }

    io.emit("card_drawn", {
      card,
      remaining: deck.length,
      horsePositions
    });

    const msg = `[${getCardName(card)}] 카드가 나와서 [${getSuitName(card.suit)}] 문양이 전진했습니다!`;
    io.emit("message", { msg });
    // console.log(msg);
  }, 3000);
}

function calculateScores() {
  const suitsWithPosition = Object.entries(horsePositions);
  suitsWithPosition.sort(([, a], [, b]) => b - a);

  const suitToRank = {};
  let currentRank = 0;
  let prevPos = null;

  suitsWithPosition.forEach(([suit, pos], i) => {
    if (pos !== prevPos) {
      currentRank = i; // 새로운 거리일 때만 순위 업데이트
    }
    suitToRank[suit] = currentRank;
    prevPos = pos;
  });

  for (const [userId, suit] of Object.entries(selectedSuits)) {
    const rank = suitToRank[suit];
    let score = 0;
    if (rank === 0) score = 5;
    else if (rank === 1) score = 3;
    else if (rank === 2) score = 1;

    if (!userScores[userId]) userScores[userId] = 0;
    console.log("calculateScores", userId, ":", userScores[userId], "+", score);
    userScores[userId] += score;
    plusScores[userId] = score;
  }

  const orderedSuits = suitsWithPosition.map(([suit]) => suit);

  io.emit("game_result", { scores: userScores, plusScores});
  console.log("scores", userScores);
  console.log("plusScores", plusScores);
}


// === 웹소켓 통신 ===
io.on("connection", (socket) => {
  console.log("User connected:", socket.id, new Date().toLocaleTimeString());
  // connectedClients.add(socket.id);
  if (waitReconnectTimer) clearInterval(waitReconnectTimer); // 새로운 연결 확인 시 재접속 대기 타이머 해제

  socket.emit("request_identity"); // 유저 식별 요청

  socket.on("identity_response", ({ userId, userName, avatars }) => {
    socket.userId = userId;
    socket.userName = userName;
    socket.avatar = avatars;
    
    if (!userSocketMap.has(userId)) {
      userSocketMap[userId] = new Set();
    }

    if (!selectedSuits[userId]) {
      if (isPlaying) {
        socket.emit("message", { msg: "게임이 진행중입니다. 잠시 기다려주세요." });
      } else {
        socket.emit("suit_selection_request");
        console.log("suit_selection_request", userId, selectedSuits);
      }
    } else {
      socket.emit("message", { msg: "재입장을 환영합니다!" });
      socket.emit("update_suit", { userId, selectedSuit: selectedSuits[userId] });
      console.log("update_suit", userId, userName, selectedSuits[userId]);
    }

    userSocketMap[userId].add(socket);
    connectedClients.add(userId);

    // io.emit("user_connected", { userId, userName, score: socket.score });
    shareUserInformations();
    console.log("🔑 Identified user:", userId, userName, "with", userSocketMap[userId].size, "sockets");
  });

  function shareUserInformations() {
    let liveUsers = [];
    let userNames = {};
    let userAvatars = {};

    for (const userId in userSocketMap) {
      const socketSet = userSocketMap[userId];
      const socket = socketSet.values().next().value;

      liveUsers.push(userId);
      if (socket.userName) {
        userNames[userId] = socket.userName;
      }
      if (socket.avatar) {
        userAvatars[userId] = socket.avatar;
      }
      // console.log(userId, userNames[userId], userAvatars[userId]);
      // console.log("userSocketMap[", userId, "]", userSocketMap[userId]);
    }
    
    io.emit("user_informations", {
      liveUsers: liveUsers,
      userNames: userNames,
      userAvatars: userAvatars,
      userScores: userScores,
      selectedSuits: selectedSuits,
    });
    // console.log("user_informations", {liveUsers, userNames, userAvatars, userScores, selectedSuits});
  }

  function checkAllPlayersSelectedSuits() {
    // 문양 선택 완료한 유저 수 체크
    const readyCount = Object.keys(selectedSuits).length;
    const clientCount = connectedClients.size;

    if (readyCount === clientCount && clientCount > 0) {
      console.log("🎮 All players selected suits. Game starting!", readyCount, "of", clientCount);
      io.emit("message", { msg: "게임이 시작되었습니다." });
      io.emit("game_started");
      isPlaying = true;
      startGameTimer();

    } else {
      console.log("🎮 Not all players selected suits. Game not starting.", readyCount, "of", clientCount);
      if (readyCount > clientCount) {
        io.emit("message", { msg: "유저 수에 문제가 있었습니다. 다시 문양을 선택해주세요." });
        initializeGameState();
        io.emit("suit_selection_request", { score: 0 });
      }
    }
  }

  socket.on("select_suit", ({ userId, userName, selectedSuit }) => {
    selectedSuits[userId] = selectedSuit;
    console.log(userId, userName, "selectedSuit:", selectedSuits[userId]);
    io.emit("suit_selected", { userId, userName, selectedSuit });

    checkAllPlayersSelectedSuits();
  });

  socket.on("disconnect", () => {
    const userId = socket.userId;
    const sockets = userSocketMap[userId];

    console.log("User disconnected:", socket.id, new Date().toLocaleTimeString(), "userId:", userId);
    
    if (userId && sockets) {
      sockets.delete(socket);

      if (sockets.size === 0) {
        userSocketMap.delete(userId);
        connectedClients.delete(userId);
        delete selectedSuits[userId];
        console.log("🔑 User disconnected:", userId);
        io.emit("user_disconnected", { userId });
        checkAllPlayersSelectedSuits();
      } else {
        console.log("Remaining sockets for", userId, ":", sockets.size);
      }
    } else {
      console.log("userSocketMap", userSocketMap);
      console.log("userSocketMap.has(userId)", userSocketMap.has(userId), userId);
    }

    if (connectedClients.size === 0) {
      startWaitReconnectTimer(); // 10초 타이머 이후 유저가 없으면 게임 초기화
    }
  });

  socket.onAny((event, ...args) => {
    console.log("📨 Received event:", event, args);
  });
});

server.listen(PORT, () => {
  console.log("서버 실행 중: http://localhost:" + PORT);
});