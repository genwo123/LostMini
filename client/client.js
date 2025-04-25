import { io } from "socket.io-client";

// Discord 프록시를 경유하도록 상대 경로로 요청
const socket = io("/.proxy/socket", {
    path: "/.proxy/socket",
    transports: ["websocket"],
  });

console.log("📡 Trying to connect to /socket...");

socket.on("connect", () => {
  console.log("✅ Connected! socket.id:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection error:", err.message);
});

socket.on("disconnect", () => {
  console.log("🔌 Disconnected");
});
