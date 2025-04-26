// gameManager.js
// 게임 매니저: 라운드 관리, 투표, 점수 계산 등을 담당

class GameManager {
  constructor(io) {
    this.io = io;                       // Socket.IO 객체
    this.currentRound = 0;              // 현재 라운드
    this.maxRounds = 5;                 // 총 라운드 수
    this.participants = {};             // 참여자 목록 {userId: {userName, score}}
    this.votes = {                      // 투표 현황
      'ajaePattern': 0,
      'gyeokdol': 0,
      'starforce': 0
    };
    this.currentGameMode = null;        // 현재 게임 모드
    this.roundInProgress = false;       // 현재 라운드 진행중 여부
    this.votingInProgress = false;      // 투표 중인지 여부
    this.votingTimeout = null;          // 투표 타이머
    this.roundResults = {};             // 라운드별 결과 저장
    this.gameEnded = false;             // 게임 종료 여부
  }

  // 참여자 추가
  addParticipant(userId, userName) {
    if (!this.participants[userId]) {
      this.participants[userId] = {
        userName,
        score: 0,
        votes: []
      };
      return true;
    }
    return false;
  }

  // 투표 등록
  registerVote(userId, gameMode) {
    // 유효한 게임 모드가 아니면 무시
    if (!['ajaePattern', 'gyeokdol', 'starforce'].includes(gameMode)) {
      return { success: false, message: '유효하지 않은 게임 모드입니다.' };
    }

    // 투표 중이 아니면 무시
    if (!this.votingInProgress) {
      return { success: false, message: '현재 투표 중이 아닙니다.' };
    }

    // 참여자가 아니면 무시
    if (!this.participants[userId]) {
      return { success: false, message: '게임 참여자가 아닙니다.' };
    }

    // 이미 투표했으면 이전 투표 취소하고 새로 투표
    const prevVote = this.participants[userId].votes[this.currentRound];
    if (prevVote) {
      this.votes[prevVote]--;
    }

    // 새 투표 등록
    this.votes[gameMode]++;
    this.participants[userId].votes[this.currentRound] = gameMode;

    return { 
      success: true, 
      message: `${gameMode}에 투표했습니다.`,
      votes: this.votes
    };
  }

  // 투표 시작
  startVoting(durationSeconds = 30) {
    if (this.roundInProgress || this.votingInProgress) {
      return { success: false, message: '이미 진행 중인 투표나 라운드가 있습니다.' };
    }

    if (this.currentRound >= this.maxRounds) {
      this.gameEnded = true;
      return { success: false, message: '모든 라운드가 종료되었습니다.' };
    }

    // 투표 상태 초기화
    this.votingInProgress = true;
    this.votes = {
      'ajaePattern': 0,
      'gyeokdol': 0,
      'starforce': 0
    };

    // 타이머 설정
    this.votingTimeout = setTimeout(() => {
      this.endVoting();
    }, durationSeconds * 1000);

    // 투표 시작 알림
    this.io.emit('voting_started', {
      round: this.currentRound + 1,
      duration: durationSeconds
    });

    return { success: true, message: `${durationSeconds}초 동안 투표를 진행합니다.` };
  }

  // 투표 종료
  endVoting() {
    if (!this.votingInProgress) {
      return { success: false, message: '진행 중인 투표가 없습니다.' };
    }

    this.votingInProgress = false;
    clearTimeout(this.votingTimeout);

    // 최다 득표 게임 모드 선택
    let maxVotes = 0;
    let topModes = [];

    for (const mode in this.votes) {
      if (this.votes[mode] > maxVotes) {
        maxVotes = this.votes[mode];
        topModes = [mode];
      } else if (this.votes[mode] === maxVotes) {
        topModes.push(mode);
      }
    }

    // 동점일 경우 랜덤 선택
    this.currentGameMode = topModes[Math.floor(Math.random() * topModes.length)];
    
    // 투표 결과 알림
    this.io.emit('voting_ended', {
      round: this.currentRound + 1,
      selectedMode: this.currentGameMode,
      votes: this.votes
    });

    // 게임 시작
    this.startRound();

    return { 
      success: true, 
      message: `투표가 종료되었습니다. ${this.currentGameMode} 모드로 게임을 시작합니다.`,
      selectedMode: this.currentGameMode
    };
  }

  // 라운드 시작
  startRound() {
    this.roundInProgress = true;
    this.currentRound++;

    // 선택된 게임 모드 시작 알림
    this.io.emit('round_started', {
      round: this.currentRound,
      mode: this.currentGameMode
    });

    // 여기서 게임 모드별 초기화 로직을 추가할 수 있음
    switch(this.currentGameMode) {
      case 'ajaePattern':
        this.initAjaePattern();
        break;
      case 'gyeokdol':
        this.initGyeokdol();
        break;
      case 'starforce':
        this.initStarforce();
        break;
    }

    return { 
      success: true, 
      message: `${this.currentRound}라운드가 시작되었습니다. 게임 모드: ${this.currentGameMode}` 
    };
  }

  // 아재 패턴 초기화
  initAjaePattern() {
    // 아재 패턴 게임에 필요한 키 시퀀스 생성
    const keySequence = this.generateAjaeKeySequence();
    
    // 클라이언트에 키 시퀀스 전송
    this.io.emit('ajae_pattern_init', {
      keySequence,
      timeLimit: 10 // 초 단위
    });
  }

  // 격돌 초기화
  initGyeokdol() {
    // 격돌 게임에 필요한 설정 생성
    const config = {
      keys: this.generateGyeokdolKeys(),
      timeLimit: 15, // 초 단위
      hitCount: 10 // 맞춰야 할 횟수
    };
    
    // 클라이언트에 설정 전송
    this.io.emit('gyeokdol_init', config);
  }

  // 스타포스 초기화
  initStarforce() {
    // 스타포스 게임에 필요한 설정 생성
    const config = {
      keys: this.generateStarforceKeys(),
      timeLimit: 12, // 초 단위
      barSpeed: 5, // 바 이동 속도 (1-10)
      hitCount: 8 // 맞춰야 할 횟수
    };
    
    // 클라이언트에 설정 전송
    this.io.emit('starforce_init', config);
  }

  // 아재 패턴 키 시퀀스 생성
  generateAjaeKeySequence() {
    const possibleKeys = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'];
    const length = 5 + this.currentRound; // 라운드가 올라갈수록 길이 증가
    
    const sequence = [];
    for (let i = 0; i < length; i++) {
      const randomKey = possibleKeys[Math.floor(Math.random() * possibleKeys.length)];
      sequence.push(randomKey);
    }
    
    return sequence;
  }

  // 격돌 키 생성
  generateGyeokdolKeys() {
    const possibleKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
    const count = 3 + this.currentRound; // 라운드가 올라갈수록 키 개수 증가
    
    const keys = [];
    for (let i = 0; i < count; i++) {
      const randomKey = possibleKeys[Math.floor(Math.random() * possibleKeys.length)];
      keys.push(randomKey);
    }
    
    return keys;
  }

  // 스타포스 키 생성
  generateStarforceKeys() {
    const possibleKeys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
    const count = 3 + this.currentRound; // 라운드가 올라갈수록 키 개수 증가
    
    const keys = [];
    for (let i = 0; i < count; i++) {
      const randomKey = possibleKeys[Math.floor(Math.random() * possibleKeys.length)];
      keys.push(randomKey);
    }
    
    return keys;
  }

  // 게임 결과 제출 처리
  submitResult(userId, score, timeMs) {
    if (!this.roundInProgress) {
      return { success: false, message: '현재 진행 중인 라운드가 없습니다.' };
    }

    if (!this.participants[userId]) {
      return { success: false, message: '참여자가 아닙니다.' };
    }

    // 결과 저장
    if (!this.roundResults[this.currentRound]) {
      this.roundResults[this.currentRound] = [];
    }

    this.roundResults[this.currentRound].push({
      userId,
      userName: this.participants[userId].userName,
      score,
      timeMs
    });

    const participantCount = Object.keys(this.participants).length;
    
    // 모든 참여자가 결과를 제출했는지 확인
    if (this.roundResults[this.currentRound].length === participantCount) {
      this.endRound();
    }

    return { 
      success: true, 
      message: `결과가 제출되었습니다.`,
      submittedCount: this.roundResults[this.currentRound].length,
      totalCount: participantCount
    };
  }

  // 라운드 종료 및 점수 계산
  endRound() {
    if (!this.roundInProgress) {
      return { success: false, message: '진행 중인 라운드가 없습니다.' };
    }

    this.roundInProgress = false;
    
    // 결과 정렬 (점수 내림차순, 시간 오름차순)
    const results = this.roundResults[this.currentRound].sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score; // 점수 높은 순
      }
      return a.timeMs - b.timeMs; // 시간 빠른 순
    });

    // 점수 부여
    for (let i = 0; i < results.length; i++) {
      const userId = results[i].userId;
      let pointsAwarded = 1; // 기본 1점
      
      if (i === 0) { // 1등
        pointsAwarded = 3;
      } else if (i === 1) { // 2등
        pointsAwarded = 2;
      }
      
      this.participants[userId].score += pointsAwarded;
      results[i].pointsAwarded = pointsAwarded;
    }

    // 결과 알림
    this.io.emit('round_ended', {
      round: this.currentRound,
      results: results.map(r => ({
        userId: r.userId,
        userName: r.userName,
        score: r.score,
        timeMs: r.timeMs,
        pointsAwarded: r.pointsAwarded,
        totalScore: this.participants[r.userId].score
      }))
    });

    // 마지막 라운드인지 확인
    if (this.currentRound >= this.maxRounds) {
      this.endGame();
    }

    return { 
      success: true, 
      message: `${this.currentRound}라운드가 종료되었습니다.`,
      results
    };
  }

  // 게임 종료
  endGame() {
    if (this.gameEnded) {
      return { success: false, message: '이미 게임이 종료되었습니다.' };
    }

    this.gameEnded = true;
    
    // 최종 순위 계산
    const finalRanking = Object.entries(this.participants)
      .map(([userId, data]) => ({
        userId,
        userName: data.userName,
        score: data.score
      }))
      .sort((a, b) => b.score - a.score);

    // 최종 결과 알림
    this.io.emit('game_ended', {
      ranking: finalRanking,
      rounds: this.maxRounds,
      roundResults: this.roundResults
    });

    return { 
      success: true, 
      message: '게임이 종료되었습니다.',
      finalRanking
    };
  }

  // 게임 리셋
  resetGame() {
    this.currentRound = 0;
    this.currentGameMode = null;
    this.roundInProgress = false;
    this.votingInProgress = false;
    this.roundResults = {};
    this.gameEnded = false;
    
    // 참여자 점수 초기화
    for (const userId in this.participants) {
      this.participants[userId].score = 0;
      this.participants[userId].votes = [];
    }

    this.io.emit('game_reset');

    return { success: true, message: '게임이 리셋되었습니다.' };
  }
}

module.exports = GameManager;