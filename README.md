
## 특징

- **실시간 멀티플레이**: 웹소켓을 통해 사용자 간 상태 동기화
- **자동 점수 계산 및 순위 표시**
- **Discord Embedded App SDK 연동**
- **Render로 서버 및 클라이언트 통합 배포**

## 기술 스택

- Frontend: Vite, Vanilla JS, CSS
- Backend: Node.js, Express, Socket.IO
- 배포: Render (정적 클라이언트 + 웹소켓 서버 통합)

## 실행 방법 (로컬 개발)

```bash
# 클라이언트
cd client
npm install
npm run dev

# 서버
cd ../server
npm install
npm run dev
