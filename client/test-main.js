// client/test-main.js
import { io } from "socket.io-client";
import "./style.css";
import { playSound, startBGM, checkAndPlayBGM } from './soundManager.js';

// 간단한 테스트 유저 생성
const thisUser = {
  id: 'test-user-' + Math.floor(Math.random() * 1000),
  username: 'TestUser',
  global_name: '테스트 유저',
  avatar: 'default'
};
const thisUserId = thisUser.id;
const thisUserName = thisUser.global_name;

// 소켓 연결 (직접 서버 URL 지정)
const socket = io("http://localhost:3001", {
  transports: ["websocket"],
});

// 게임 상태
const gameState = {
  userScores: {},
};

// 기본 UI 렌더링
document.querySelector('#app').innerHTML = `
  <div class="main-content">
    <div class="welcome-container" id="welcome-screen">
      <h1>🎮 로스트아크 키보드 미니게임</h1>
      <p>아재패턴, 격돌, 스타포스 등 다양한 미니게임을 테스트하세요!</p>
      <div id="connection-status">서버 연결 상태: 연결 중...</div>
      <div id="user-info"></div>
      <div class="game-rules">
        <h2>게임 모드</h2>
        <ul>
          <li>아재패턴: 시간 내에 순서대로 키보드를 입력하세요</li>
          <li>격돌: 원의 크기가 정확한 타이밍에 키를 누르세요</li>
          <li>스타포스: 움직이는 바가 목표 영역을 지날 때 키를 누르세요</li>
        </ul>
      </div>
      <div class="test-controls">
        <h3>테스트 모드</h3>
        <button id="test-ajae" class="test-button">아재패턴 테스트</button>
        <button id="test-gyeokdol" class="test-button">격돌 테스트</button>
        <button id="test-starforce" class="test-button">스타포스 테스트</button>
      </div>
    </div>
    <div class="game-container" id="game-screen">
      <!-- 게임 콘텐츠는 여기에 동적으로 추가됨 -->
    </div>
  </div>
`;

// 소켓 이벤트 리스너
socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
  document.getElementById('connection-status').textContent = "서버 연결 상태: 연결됨 ✅";
  document.getElementById('connection-status').style.color = "green";
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err.message);
  document.getElementById('connection-status').textContent = "서버 연결 상태: 연결 실패 ❌";
  document.getElementById('connection-status').style.color = "red";
});

// 사용자 정보 표시
const userInfoDiv = document.getElementById('user-info');
userInfoDiv.innerHTML = `
  <div class="user-container">
    <img src="/images/default-avatar.png" width="64" height="64" style="border-radius: 50%">
    <p class="welcome-text">${thisUserName}님, 테스트를 시작하세요!</p>
  </div>
`;

// 테스트 버튼 이벤트 리스너
document.getElementById('test-ajae').addEventListener('click', () => {
  showAjaePatternTest();
});

document.getElementById('test-gyeokdol').addEventListener('click', () => {
  showGyeokdolTest();
});

document.getElementById('test-starforce').addEventListener('click', () => {
  showStarforceTest();
});

// 아재패턴 테스트 표시
function showAjaePatternTest() {
  const gameScreen = document.getElementById('game-screen');
  document.getElementById('welcome-screen').style.display = 'none';
  gameScreen.style.display = 'block';
  
  gameScreen.innerHTML = `
    <div class="ajae-pattern-container">
      <h2>아재 패턴 테스트</h2>
      <div class="timer-display">남은 시간: <span id="ajae-timer">10</span>초</div>
      <div class="key-sequence-container" id="key-sequence">
        <!-- 키 시퀀스가 여기에 추가됨 -->
      </div>
      <div class="hint-text">키보드로 화면에 표시된 키를 순서대로 누르세요!</div>
      <button id="back-btn" class="back-button">처음으로 돌아가기</button>
    </div>
  `;
  
  // 키 시퀀스 생성 (테스트용)
  const keySequence = ['a', 's', 'd', 'f', 'j'];
  const keyContainer = document.getElementById('key-sequence');
  
  keySequence.forEach((key, index) => {
    const keyBox = document.createElement('div');
    keyBox.className = `key-box ${index === 0 ? 'current' : ''}`;
    keyBox.id = `key-${index}`;
    keyBox.textContent = key.toUpperCase();
    keyContainer.appendChild(keyBox);
  });
  
  // 뒤로가기 버튼
  document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('welcome-screen').style.display = 'flex';
    gameScreen.style.display = 'none';
  });
  
  // 키 이벤트 리스너
  let currentKeyIndex = 0;
  
  document.addEventListener('keydown', function handleKeyDown(event) {
    if (currentKeyIndex >= keySequence.length) {
      document.removeEventListener('keydown', handleKeyDown);
      return;
    }
    
    const pressedKey = event.key.toLowerCase();
    const expectedKey = keySequence[currentKeyIndex];
    
    if (pressedKey === expectedKey) {
      // 정확한 키 입력
      playSound('move');
      
      // 현재 키 박스에 정확히 눌렀음을 표시
      const currentKeyBox = document.getElementById(`key-${currentKeyIndex}`);
      if (currentKeyBox) {
        currentKeyBox.classList.remove('current');
        currentKeyBox.classList.add('correct');
      }
      
      currentKeyIndex++;
      
      // 다음 키 표시
      if (currentKeyIndex < keySequence.length) {
        const nextKeyBox = document.getElementById(`key-${currentKeyIndex}`);
        if (nextKeyBox) {
          nextKeyBox.classList.add('current');
        }
      } else {
        // 모든 키를 정확히 입력했을 때
        alert('성공! 모든 키를 올바르게 입력했습니다.');
      }
    } else {
      // 잘못된 키 입력
      playSound('user'); // 오류 사운드
      
      // 현재 키 박스에 오류 표시
      const currentKeyBox = document.getElementById(`key-${currentKeyIndex}`);
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
  });
}

// 나머지 게임 테스트 함수들도 비슷한 방식으로 구현...
function showGyeokdolTest() {
  const gameScreen = document.getElementById('game-screen');
  document.getElementById('welcome-screen').style.display = 'none';
  gameScreen.style.display = 'block';
  
  gameScreen.innerHTML = `
    <div class="gyeokdol-container">
      <h2>격돌 테스트</h2>
      <p>준비 중입니다...</p>
      <button id="back-btn" class="back-button">처음으로 돌아가기</button>
    </div>
  `;
  
  document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('welcome-screen').style.display = 'flex';
    gameScreen.style.display = 'none';
  });
}

function showStarforceTest() {
  const gameScreen = document.getElementById('game-screen');
  document.getElementById('welcome-screen').style.display = 'none';
  gameScreen.style.display = 'block';
  
  gameScreen.innerHTML = `
    <div class="starforce-container">
      <h2>스타포스 테스트</h2>
      <p>준비 중입니다...</p>
      <button id="back-btn" class="back-button">처음으로 돌아가기</button>
    </div>
  `;
  
  document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('welcome-screen').style.display = 'flex';
    gameScreen.style.display = 'none';
  });
}