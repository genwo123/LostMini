// server/serverGameManager.js
// 서버 측 게임 매니저: 라운드 관리, 투표, 점수 계산 등을 담당

class ServerGameManager {
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
  
  // 참여자 제거
  removeParticipant(userId) {
    if (this.participants[userId]) {
      delete this.participants[userId];
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

    // 참여자가 아니면 무시 (테스트 모드에서는 자동 참여)
    if (!this.participants[userId]) {
      this.addParticipant(userId, `Player-${userId.substring(0, 5)}`);
    }

    // 이미 투표했으면 이전 투표 취소하고 새로 투표
    const prevVote = this.participants[userId].votes[this.currentRound];
    if (prevVote) {
      this.votes[prevVote]--;
    }

    // 새 투표 등록
    this.votes[gameMode]++;
    this.participants[userId].votes[this.currentRound] = gameMode;
    
    // 모든 클라이언트에 투표 상황 업데이트 전송
    this.io.emit('vote_update', {
      votes: this.votes
    });

    return { 
      success: true, 
      message: `${gameMode}에 투표했습니다.`,
      votes: this.votes
    };
  }

  // 투표 시작
  startVoting(durationSeconds = 15) {
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

    // 5초 후 게임 시작 (카운트다운 시간)
    setTimeout(() => {
      this.startRound();
    }, 5000);

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
      timeLimit: Math.max(2, 10 - (this.currentRound * 1.5)) // 라운드별 시간 감소
    });
  }

  // 격돌 초기화
  initGyeokdol() {
    // 격돌 게임에 필요한 설정 생성
    const config = {
      difficulty: this.currentRound > 3 ? 'hard' : 'normal',
      ringCount: 8 + this.currentRound,
      speed: 1 + (this.currentRound * 0.2)
    };
    
    // 클라이언트에 설정 전송
    this.io.emit('gyeokdol_init', config);
  }

  // 스타포스 초기화
  initStarforce() {
    // 스타포스 게임에 필요한 설정 생성
    const config = {
      difficulty: this.currentRound > 3 ? 'hard' : 'normal',
      attempts: 8 + this.currentRound,
      barSpeed: 1 + (this.currentRound * 0.3)
    };
    
    // 클라이언트에 설정 전송
    this.io.emit('starforce_init', config);
  }

  // 아재 패턴 키 시퀀스 생성
  generateAjaeKeySequence() {
    const possibleKeys = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'];
    const length = 4 + this.currentRound; // 라운드가 올라갈수록 길이 증가
    
    const sequence = [];
    for (let i = 0; i < length; i++) {
      const randomKey = possibleKeys[Math.floor(Math.random() * possibleKeys.length)];
      sequence.push(randomKey);
    }
    
    return sequence;
  }

  // 게임 결과 제출 처리
  submitResult(userId, score, timeMs, success = true) {
    if (!this.roundInProgress) {
      return { success: false, message: '현재 진행 중인 라운드가 없습니다.' };
    }

    // 테스트 모드에서는 참가자가 아니라도 자동 추가
    if (!this.participants[userId]) {
      this.addParticipant(userId, `Player-${userId.substring(0, 5)}`);
    }

    // 결과 저장
    if (!this.roundResults[this.currentRound]) {
      this.roundResults[this.currentRound] = [];
    }

    this.roundResults[this.currentRound].push({
      userId,
      userName: this.participants[userId].userName,
      score,
      timeMs,
      success
    });

    const participantCount = Object.keys(this.participants).length;
    
    // 모든 참여자가 결과를 제출했는지 확인
    // 테스트 모드에서는 일정 시간 후 강제 종료
    if (this.roundResults[this.currentRound].length === participantCount) {
      this.endRound();
    } else {
      // 결과 제출 타임아웃 설정 (30초)
      setTimeout(() => {
        // 아직 결과가 완료되지 않았으면 강제 종료
        if (this.roundInProgress) {
          this.endRound();
        }
      }, 30000);
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
    const results = this.roundResults[this.currentRound] || [];
    results.sort((a, b) => {
      if (a.success !== b.success) {
        return a.success ? -1 : 1; // 성공은 실패보다 앞에
      }
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
      results[i].totalScore = this.participants[userId].score;
    }

    // 결과 알림
    this.io.emit('round_ended', {
      round: this.currentRound,
      results: results
    });

    // 마지막 라운드인지 확인
    if (this.currentRound >= this.maxRounds) {
      // 10초 후 게임 종료
      setTimeout(() => {
        this.endGame();
      }, 10000);
    } else {
      // 25초 후 다음 라운드 투표 시작
      setTimeout(() => {
        this.startVoting();
      }, 25000);
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

// module.exports = ServerGameManager; // CommonJS 방식 (제거)
export default ServerGameManager; // ESM 방식으로 변경