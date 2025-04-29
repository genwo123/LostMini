// server/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
// 정확한 파일명과 대소문자 일치시킴
import ServerGameManager from './serverGameManager.js';

// 환경 변수 설정
dotenv.config();

// 테스트 모드 설정 - 테스트를 위해 강제로 true로 설정
const TEST_MODE = true; // 로컬 테스트를 위해 항상 true로 설정

// Express 앱 생성
const app = express();
const PORT = process.env.PORT || 3001; // 포트를 3001로 변경 (클라이언트는 3000으로 실행)
const server = createServer(app);

// 경로 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicPath = join(__dirname, 'public');
console.log('Serving static files from:', publicPath); // 디버깅용 로그 추가

// Socket.IO 서버 설정 - CORS 설정 확장
const io = new Server(server, {
  path: '/socket',
  cors: {
    origin: "*", // 모든 출처 허용 (개발 중)
    methods: ["GET", "POST"],
    credentials: true // 자격 증명 허용
  }
});

// API 라우터 설정
app.use(express.json());

// CORS 설정 추가 (Express용)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Discord 토큰 엔드포인트 (테스트 모드에서는 사용하지 않지만 코드는 유지)
app.post('/api/token', async (req, res) => {
  try {
    const { code } = req.body;
    
    const params = new URLSearchParams();
    params.append('client_id', process.env.VITE_DISCORD_CLIENT_ID);
    params.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', 'https://localhost:3000'); // 개발용, 실제 배포 시 변경 필요
    
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(500).json({ error: 'Failed to exchange code for token' });
  }
});

// 테스트 엔드포인트 - 서버 상태 확인용
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!', testMode: TEST_MODE });
});

// 정적 파일 제공
app.use(express.static(publicPath));

// SPA 지원 (HTML5 History API)
app.get('*', (req, res) => {
  res.sendFile(join(publicPath, 'index.html'));
});

// 게임 상태 관리
const liveUsers = []; // 접속 중인 유저 ID
const userNames = {}; // 유저 이름 (ID: 이름)
const userAvatars = {}; // 유저 아바타 URL (ID: 아바타)
const userScores = {}; // 유저 점수 (ID: 점수)

// 게임 매니저 초기화
const gameManager = new ServerGameManager(io);

// 테스트용 디버그 라우트 추가
app.get('/debug', (req, res) => {
  res.json({
    liveUsers,
    userNames,
    userScores,
    testMode: TEST_MODE
  });
});

// Socket.IO 이벤트 핸들러
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // 클라이언트에 유저 정보 요청
  socket.emit('request_identity');
  
  // 유저 정보 응답 처리
  socket.on('identity_response', ({ userId, userName, avatars }) => {
    console.log('User identity received:', userId, userName);
    
    // 유저 정보 저장
    if (!liveUsers.includes(userId)) {
      liveUsers.push(userId);
    }
    
    userNames[userId] = userName;
    userAvatars[userId] = avatars;
    
    if (!userScores[userId]) {
      userScores[userId] = 0;
    }
    
    // 테스트 모드에서 게임 매니저에 자동으로 참가자 추가
    if (TEST_MODE) {
      gameManager.addParticipant(userId, userName);
    }
    
    // 클라이언트에 다른 유저 정보 전송
    socket.emit('user_informations', {
      liveUsers,
      userNames,
      userAvatars,
      userScores
    });
    
    // 다른 모든 클라이언트에 새 유저 연결 알림
    socket.broadcast.emit('message', {
      msg: `${userName}님이 접속했습니다.`
    });
    
    // 유저 ID 저장 (연결 해제 시 사용)
    socket.userId = userId;
  });
  
  // 투표 시작
  socket.on('start_voting', () => {
    // 게임 매니저로 투표 시작 처리
    const result = gameManager.startVoting();
    if (!result.success) {
      socket.emit('message', { msg: result.message });
    }
  });
  
  // 투표 처리
  socket.on('vote', (data) => {
    if (!socket.userId) return;
    
    // 게임 매니저로 투표 처리
    const result = gameManager.registerVote(socket.userId, data.gameMode);
    if (!result.success) {
      socket.emit('message', { msg: result.message });
    }
  });
  
  // 게임 결과 처리
  socket.on('game_result', (data) => {
    if (!socket.userId) return;
    
    // 게임 매니저로 결과 처리
    const result = gameManager.submitResult(socket.userId, data.score, data.timeMs, data.success);
    if (!result.success) {
      socket.emit('message', { msg: result.message });
    }
  });
  
  // 게임 재시작
  socket.on('restart_game', () => {
    gameManager.resetGame();
  });
  
  // 아재패턴 게임 초기화 이벤트 처리 추가 (테스트용)
  socket.on('ajae_pattern_init', (data) => {
    console.log('Received ajae_pattern_init request with data:', data);
    io.emit('ajae_pattern_init', data); // 모든 클라이언트에 전달
  });
  
  // 격돌 게임 초기화 이벤트 처리 추가 (테스트용)
  socket.on('gyeokdol_init', (data) => {
    console.log('Received gyeokdol_init request with data:', data);
    io.emit('gyeokdol_init', data); // 모든 클라이언트에 전달
  });
  
  // 스타포스 게임 초기화 이벤트 처리 추가 (테스트용)
  socket.on('starforce_init', (data) => {
    console.log('Received starforce_init request with data:', data);
    io.emit('starforce_init', data); // 모든 클라이언트에 전달
  });
  
  // 연결 해제 처리
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.userId) {
      // 유저 목록에서 제거
      const index = liveUsers.indexOf(socket.userId);
      if (index !== -1) {
        liveUsers.splice(index, 1);
      }
      
      // 모든 클라이언트에 유저 연결 해제 알림
      io.emit('user_disconnected', {
        userId: socket.userId
      });
      
      // 게임 매니저에 유저 제거 알림
      gameManager.removeParticipant(socket.userId);
      
      // 유저 이름 가져오기
      const userName = userNames[socket.userId];
      if (userName) {
        io.emit('message', {
          msg: `${userName}님이 퇴장했습니다.`
        });
      }
    }
  });
  
  // 유저 명시적 퇴장
  socket.on('user_leave', ({ userId }) => {
    if (!userId) return;
    
    // 유저 목록에서 제거
    const index = liveUsers.indexOf(userId);
    if (index !== -1) {
      liveUsers.splice(index, 1);
    }
    
    // 모든 클라이언트에 유저 연결 해제 알림
    io.emit('user_disconnected', {
      userId
    });
    
    // 게임 매니저에 유저 제거 알림
    gameManager.removeParticipant(userId);
  });
});

// 서버 시작
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test mode: ${TEST_MODE ? 'enabled' : 'disabled'}`);
  console.log(`Visit http://localhost:${PORT}/debug to see current game state`);
});