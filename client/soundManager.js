const sounds = {
    flip: new Audio("/sounds/card_flip.mp3"),
    shuffle: new Audio("/sounds/card_shuffle.mp3"),
    move: new Audio("/sounds/move.mp3"),
    tick: new Audio("/sounds/clock_tick.mp3"),
    user: new Audio("/sounds/user.mp3"),
    goal: new Audio("/sounds/clapping.mp3"),
    start: new Audio("/sounds/gun.mp3"),
};
const bgm = new Audio("/sounds/bgm.mp3");
let isBGMPlaying = false;

bgm.loop = true;
bgm.volume = 0.1; // 살짝 줄이기
sounds['tick'].volume = 0.1;
sounds['flip'].volume = 0.3;

export function playSound(name) {
    if (sounds[name]) {
        sounds[name].currentTime = 0; // 중복 재생 허용
        sounds[name].play().catch((e) => console.warn("🔇 사운드 재생 실패:", e));
    }
}

export function startBGM() {
    bgm.play().catch(() => {
        // 사용자 interaction 후 재생해야 할 수도 있음
        console.warn("🔇 자동 재생 제한으로 배경음악 재생 실패");
    });
    isBGMPlaying = true;
}

export function checkAndPlayBGM() {
    if (!isBGMPlaying) {
        startBGM();
    }
}

export function stopBGM() {
    bgm.pause();
    bgm.currentTime = 0;
    isBGMPlaying = false;
}
