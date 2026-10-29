import * as THREE from "three";

const sceneRoot = document.querySelector("#scene");
const welcome = document.querySelector("#welcome");
const hud = document.querySelector("#race-hud");
const startButton = document.querySelector("#start-button");
const createRoomButton = document.querySelector("#create-room-button");
const playerNameInput = document.querySelector("#player-name");
const roomInput = document.querySelector("#room-code");
const roomFeedback = document.querySelector("#room-feedback");
const statusLabel = document.querySelector("#connection-label");
const state = {
  active: false,
  racing: false,
  finished: false,
  speed: 0,
  yaw: 0,
  x: 0,
  z: -45,
  lap: 1,
  progress: 0,
  previousProgress: 0,
  room: "",
  playerId: crypto.randomUUID(),
  playerName: "RACER",
  keys: new Set(),
  drift: false,
  soundEnabled: true,
  audioContext: null,
  engineGain: null,
  engineOscillator: null,
  websocket: null,
  lastSend: 0,
  raceStart: 0,
  finishTime: 0,
  messageTimeout: 0,
};

const TRACK = { x: 70, z: 45, width: 15 };
const scene = new THREE.Scene();
scene.background = new THREE.Color("#101910");
scene.fog = new THREE.Fog("#101910", 130, 320);
const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.1, 650);
camera.position.set(-115, 82, -105);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
sceneRoot.append(renderer.domElement);

scene.add(new THREE.HemisphereLight("#b8cdb5", "#20241b", 2));
const moon = new THREE.DirectionalLight("#d6edcc", 2.4);
moon.position.set(-45, 80, -35);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -120;
moon.shadow.camera.right = 120;
moon.shadow.camera.top = 120;
moon.shadow.camera.bottom = -120;
scene.add(moon);

function makeMaterial(color, roughness = 0.8, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

function startEngineAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  state.audioContext ||= new AudioContext();
  if (!state.engineOscillator) {
    state.engineOscillator = state.audioContext.createOscillator();
    const filter = state.audioContext.createBiquadFilter();
    state.engineGain = state.audioContext.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 550;
    state.engineGain.gain.value = 0;
    state.engineOscillator.type = "sawtooth";
    state.engineOscillator.connect(filter);
    filter.connect(state.engineGain);
    state.engineGain.connect(state.audioContext.destination);
    state.engineOscillator.start();
  }
  state.audioContext.resume();
  state.engineGain.gain.setTargetAtTime(state.soundEnabled ? 0.018 : 0, state.audioContext.currentTime, 0.08);
}

const grass = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), makeMaterial("#27372a"));
grass.rotation.x = -Math.PI / 2;
grass.receiveShadow = true;
scene.add(grass);

function ellipseLine(rx, rz, color, y, opacity = 1) {
  const points = [];
  for (let i = 0; i <= 240; i++) {
    const angle = (i / 240) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * rx, y, Math.sin(angle) * rz));
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  scene.add(line);
  return line;
}

function createTrack() {
  const roadGeometry = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];
  const count = 320;
  for (let i = 0; i <= count; i++) {
    const angle = (i / count) * Math.PI * 2;
    positions.push(
      Math.cos(angle) * (TRACK.x - TRACK.width / 2), 0.045, Math.sin(angle) * (TRACK.z - TRACK.width / 2),
      Math.cos(angle) * (TRACK.x + TRACK.width / 2), 0.045, Math.sin(angle) * (TRACK.z + TRACK.width / 2),
    );
    if (i < count) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  roadGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  roadGeometry.setIndex(indices);
  roadGeometry.computeVertexNormals();
  const road = new THREE.Mesh(roadGeometry, makeMaterial("#292d2b", 0.94, { side: THREE.DoubleSide }));
  road.receiveShadow = true;
  scene.add(road);
  ellipseLine(TRACK.x - TRACK.width / 2, TRACK.z - TRACK.width / 2, "#c8d0b1", 0.12, 0.6);
  ellipseLine(TRACK.x + TRACK.width / 2, TRACK.z + TRACK.width / 2, "#c8d0b1", 0.12, 0.6);
  ellipseLine(TRACK.x, TRACK.z, "#e4e5cf", 0.12, 0.23);

  const kerbMaterials = [makeMaterial("#e9eee1", 0.8), makeMaterial("#d84e3e", 0.8)];
  for (let i = 0; i < 320; i++) {
    if (i % 2 !== 0) continue;
    const angle = (i / 320) * Math.PI * 2;
    const tangent = new THREE.Vector3(-TRACK.x * Math.sin(angle), 0, TRACK.z * Math.cos(angle)).normalize();
    const yaw = Math.atan2(-tangent.x, -tangent.z);
    for (const edge of [-1, 1]) {
      const rx = TRACK.x + edge * (TRACK.width / 2 + 0.7);
      const rz = TRACK.z + edge * (TRACK.width / 2 + 0.7);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.13, 0.9), kerbMaterials[(i / 2) % 2]);
      curb.position.set(Math.cos(angle) * rx, 0.11, Math.sin(angle) * rz);
      curb.rotation.y = yaw;
      curb.receiveShadow = true;
      scene.add(curb);
    }
  }
  const lineMaterial = makeMaterial("#d7ff62", 0.85);
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 2.25), lineMaterial);
    dash.position.set(Math.cos(angle) * TRACK.x, 0.075, Math.sin(angle) * TRACK.z);
    dash.rotation.y = Math.atan2(TRACK.x * Math.sin(angle), -TRACK.z * Math.cos(angle));
    scene.add(dash);
  }
  for (let i = 0; i < 14; i++) {
    const angle = -Math.PI / 2 + i * 0.075;
    const start = new THREE.Vector3(Math.cos(angle) * TRACK.x, 0.16, Math.sin(angle) * TRACK.z);
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const side = i % 2 ? 1 : -1;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(TRACK.width / 14, 0.05, 1.7), makeMaterial(side > 0 ? "#e5e6db" : "#21231f"));
    tile.position.copy(start).addScaledVector(normal, side * (i % 2 ? 0.28 : -0.28));
    tile.rotation.y = Math.PI / 2;
    scene.add(tile);
  }
}

function createScenery() {
  const treeMaterials = [makeMaterial("#17271c"), makeMaterial("#1e3021"), makeMaterial("#293c28")];
  const trunkMaterial = makeMaterial("#47392a");
  let seed = 9371;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 160; i++) {
    const angle = random() * Math.PI * 2;
    const distance = 1.48 + random() * 1.05;
    const x = Math.cos(angle) * TRACK.x * distance;
    const z = Math.sin(angle) * TRACK.z * distance;
    const radius = 1.3 + random() * 2;
    const height = 5 + random() * 8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, height * 0.37, 6), trunkMaterial);
    trunk.position.set(x, height * 0.18, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), treeMaterials[Math.floor(random() * treeMaterials.length)]);
    crown.position.set(x, height * 0.65, z);
    crown.castShadow = true;
    scene.add(crown);
  }
  const glowMaterial = new THREE.MeshBasicMaterial({ color: "#baff60" });
  for (const angle of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
    for (const side of [-1, 1]) {
      const x = Math.cos(angle) * TRACK.x + Math.cos(angle + Math.PI / 2) * side * 19;
      const z = Math.sin(angle) * TRACK.z + Math.sin(angle + Math.PI / 2) * side * 19;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 8, 8), makeMaterial("#3f4940"));
      pole.position.set(x, 4, z);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), glowMaterial);
      lamp.position.set(x, 8, z);
      scene.add(lamp);
      const light = new THREE.PointLight("#baff60", 35, 25);
      light.position.copy(lamp.position);
      scene.add(light);
    }
  }
  for (let i = 0; i < 18; i++) {
    const building = new THREE.Mesh(new THREE.BoxGeometry(5 + random() * 8, 14 + random() * 36, 5 + random() * 8), makeMaterial(i % 2 ? "#222d2b" : "#252934"));
    const angle = random() * Math.PI * 2;
    const radius = 1.4 + random() * 0.8;
    building.position.set(Math.cos(angle) * TRACK.x * radius, building.geometry.parameters.height / 2 - 0.2, Math.sin(angle) * TRACK.z * radius);
    scene.add(building);
  }
}

const cars = new Map();
const carColors = ["#d7ff62", "#ff735d", "#75c9ff", "#ffbd59", "#cb89ff", "#f5f5ed"];

function createCar(color, isPlayer = false) {
  const root = new THREE.Group();
  const bodyMaterial = makeMaterial(color, 0.34, { metalness: 0.22 });
  const darkMaterial = makeMaterial("#1b201d", 0.55);
  const glassMaterial = makeMaterial("#17252a", 0.22, { metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.66, 4.1), bodyMaterial);
  body.position.y = 0.8;
  body.castShadow = true;
  root.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.29, 1.35), bodyMaterial);
  hood.position.set(0, 1.11, -1.05);
  hood.castShadow = true;
  root.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.72, 1.85), glassMaterial);
  cabin.position.set(0, 1.32, 0.38);
  cabin.castShadow = true;
  root.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.47, 0.12, 1.13), bodyMaterial);
  roof.position.set(0, 1.7, 0.43);
  root.add(roof);
  for (const x of [-1, 1]) {
    for (const z of [-1.4, 1.4]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.32, 12), darkMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x * 1.02, 0.49, z);
      wheel.castShadow = true;
      root.add(wheel);
    }
    for (const z of [-1.9, 1.9]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: z < 0 ? "#edffd6" : "#ff4035" }));
      light.position.set(x * 0.63, 0.85, z);
      root.add(light);
    }
  }
  const underglow = new THREE.PointLight(color, isPlayer ? 18 : 8, 6);
  underglow.position.set(0, 0.5, 0);
  root.add(underglow);
  root.userData.body = body;
  root.userData.wheels = root.children.filter((child) => child.geometry?.type === "CylinderGeometry");
  scene.add(root);
  return root;
}

createTrack();
createScenery();

const localCar = createCar("#d7ff62", true);
localCar.position.set(0, 0, -45);
const bots = Array.from({ length: 4 }, (_, index) => {
  const car = createCar(carColors[index + 1]);
  const angle = -Math.PI / 2 - (index + 1) * 0.12;
  const offset = (index % 2 ? -1 : 1) * 3.2;
  car.userData.bot = { angle, offset, speed: 0.011 + index * 0.00045, laps: 0, name: ["VOLT", "MIST", "KAI", "NOVA"][index] };
  return car;
});

function wrap(value) {
  return ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function normalizedTrackProgress(x, z) {
  return wrap(Math.atan2(z / TRACK.z, x / TRACK.x) + Math.PI / 2) / (Math.PI * 2);
}

function trackPosition(angle, offset = 0) {
  const x = Math.cos(angle) * TRACK.x;
  const z = Math.sin(angle) * TRACK.z;
  const tangent = new THREE.Vector3(-TRACK.x * Math.sin(angle), 0, TRACK.z * Math.cos(angle)).normalize();
  const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  return { x: x + normal.x * offset, z: z + normal.z * offset, yaw: Math.atan2(-tangent.x, -tangent.z) };
}

function progressDistance(progress, lap) {
  return (lap - 1) + progress;
}

function updateLeaderboard() {
  const playerScore = progressDistance(state.progress, state.lap);
  const allScores = [playerScore, ...bots.map((car) => {
    const botProgress = normalizedTrackProgress(car.position.x, car.position.z);
    const lapsBehind = car.userData.bot.laps ?? 1;
    return progressDistance(botProgress, lapsBehind);
  }), ...[...cars.values()].map((car) => progressDistance(car.progress ?? 0, car.lap ?? 1))];
  const rank = 1 + allScores.filter((score) => score > playerScore + 0.0001).length;
  document.querySelector("#position-value").innerHTML = `${rank}<small>${rank === 1 ? "ST" : rank === 2 ? "ND" : rank === 3 ? "RD" : "TH"}</small>`;
}

function updateMap() {
  const svg = document.querySelector("#mini-map");
  if (!svg.dataset.ready) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    path.setAttribute("cx", "85"); path.setAttribute("cy", "50");
    path.setAttribute("rx", "68"); path.setAttribute("ry", "35");
    path.setAttribute("fill", "none"); path.setAttribute("stroke", "#a9b29f");
    path.setAttribute("stroke-width", "9"); path.setAttribute("opacity", ".37");
    svg.append(path);
    const inner = path.cloneNode();
    inner.setAttribute("stroke", "#e7eadb"); inner.setAttribute("stroke-width", "1.2"); inner.setAttribute("opacity", ".72");
    svg.append(inner);
    svg.dataset.ready = "true";
  }
  svg.querySelectorAll(".map-marker").forEach((marker) => marker.remove());
  const markers = [{ x: localCar.position.x, z: localCar.position.z, color: "#d7ff62", id: state.playerId }, ...bots.map((bot, index) => ({ x: bot.position.x, z: bot.position.z, color: carColors[index + 1], id: `bot-${index}` })), ...[...cars.values()].map((car) => ({ x: car.x, z: car.z, color: car.color, id: car.id }))];
  for (const marker of markers) {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", `${85 + marker.x * 0.83}`);
    dot.setAttribute("cy", `${50 + marker.z * 0.78}`);
    dot.setAttribute("r", marker.id === state.playerId ? "3.7" : "2.9");
    dot.setAttribute("fill", marker.color);
    dot.setAttribute("class", "map-marker");
    svg.append(dot);
  }
}

function showMessage(message, duration = 1800) {
  const messageNode = document.querySelector("#race-message");
  messageNode.textContent = message;
  clearTimeout(state.messageTimeout);
  state.messageTimeout = setTimeout(() => {
    messageNode.textContent = "繞行三圈，率先衝線。";
  }, duration);
}

function setConnectionStatus(connected) {
  statusLabel.textContent = connected ? "線上多人" : "單人練習";
  document.querySelector(".race-tag").innerHTML = `<span class="live-dot"></span>${connected ? "LIVE RACE" : "SOLO RACE"}`;
}

function updateRoomLink(room) {
  const url = new URL(location.href);
  if (room) url.searchParams.set("room", room);
  else url.searchParams.delete("room");
  history.replaceState(null, "", url);
}

function showRoomFeedback(message) {
  roomFeedback.textContent = message;
}

async function copyInviteLink() {
  if (!state.room) {
    showRoomFeedback("請先建立房間或輸入房號。");
    return;
  }
  const inviteUrl = new URL(location.href);
  inviteUrl.searchParams.set("room", state.room);
  try {
    await navigator.clipboard.writeText(inviteUrl.href);
    if (state.active) showMessage("邀請連結已複製，傳給好友就能加入！");
    else showRoomFeedback("邀請連結已複製，傳給好友就能加入！");
  } catch {
    window.prompt("請複製這個房間邀請連結：", inviteUrl.href);
  }
}

function connectToRoom() {
  if (!("WebSocket" in window)) {
    setConnectionStatus(false);
    return;
  }
  if (state.websocket) {
    const previousSocket = state.websocket;
    state.websocket = null;
    previousSocket.close();
  }
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}`);
  state.websocket = socket;
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "join", room: state.room, id: state.playerId, name: state.playerName }));
    setConnectionStatus(true);
    showMessage("已連線至線上賽事！");
  });
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "players") {
      const currentIds = new Set(message.players.filter((player) => player.id !== state.playerId).map((player) => player.id));
      for (const [id, car] of cars) {
        if (!currentIds.has(id)) { scene.remove(car.mesh); cars.delete(id); }
      }
      for (const player of message.players) {
        if (!player || player.id === state.playerId) continue;
        let entry = cars.get(player.id);
        if (!entry) {
          entry = { mesh: createCar(player.color || "#75c9ff"), id: player.id, color: player.color || "#75c9ff", x: 0, z: 0, yaw: 0, progress: 0, lap: 1, name: player.name || "RACER" };
          cars.set(player.id, entry);
        }
        entry.x = player.x; entry.z = player.z; entry.yaw = player.yaw;
        entry.progress = player.progress; entry.lap = player.lap; entry.name = player.name;
      }
    }
  });
  socket.addEventListener("close", () => {
    if (state.websocket !== socket) return;
    setConnectionStatus(false);
    if (state.active && !state.finished) showMessage("連線中斷，繼續單人練習。");
  });
  socket.addEventListener("error", () => socket.close());
}

function startRace() {
  state.playerName = (playerNameInput.value.trim() || "RACER").slice(0, 16);
  state.room = (roomInput.value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12)) || Math.random().toString(36).slice(2, 8).toUpperCase();
  roomInput.value = state.room;
  updateRoomLink(state.room);
  state.active = true;
  state.racing = false;
  state.finished = false;
  state.speed = 0;
  state.yaw = -Math.PI / 2;
  state.x = 0;
  state.z = -45;
  state.lap = 1;
  state.previousProgress = 0;
  state.progress = 0;
  state.raceStart = performance.now() + 2550;
  localCar.position.set(0, 0, -45);
  localCar.rotation.y = -Math.PI / 2;
  bots.forEach((bot, index) => {
    const angle = -Math.PI / 2 - (index + 1) * 0.12;
    bot.userData.bot.angle = angle;
    bot.userData.bot.laps = 0;
  });
  welcome.hidden = true;
  document.querySelector("#finish-overlay").hidden = true;
  hud.hidden = false;
  document.querySelector("#room-value").textContent = state.room;
  document.querySelector("#lap-value").innerHTML = "01 <small>/ 03</small>";
  updateMap();
  connectToRoom();
  startEngineAudio();
  const countdown = document.querySelector("#countdown");
  countdown.hidden = false;
  let number = 3;
  countdown.textContent = number;
  const countdownTimer = setInterval(() => {
    number--;
    if (number > 0) countdown.textContent = number;
    else {
      clearInterval(countdownTimer);
      countdown.textContent = "GO!";
      state.racing = true;
      showMessage("比賽開始！");
      setTimeout(() => { countdown.hidden = true; }, 650);
    }
  }, 850);
}

function finishRace() {
  state.finished = true;
  state.racing = false;
  state.finishTime = performance.now() - state.raceStart;
  updateLeaderboard();
  const seconds = Math.max(0, state.finishTime / 1000).toFixed(2);
  const won = Number(document.querySelector("#position-value").textContent.replace(/\D/g, "")) <= 1;
  document.querySelector("#finish-title").textContent = won ? "漂亮的勝利。" : "衝線完成。";
  document.querySelector("#finish-copy").textContent = `完賽時間 ${seconds} 秒 · ${won ? "你是今晚的賽道之王。" : "再跑一場，奪回冠軍。 "}`;
  document.querySelector("#finish-overlay").hidden = false;
}

function updatePlayer(delta, now) {
  if (!state.active) return;
  const throttle = state.keys.has("w") || state.keys.has("arrowup") || state.keys.has("gas") ? 1 : 0;
  const brake = state.keys.has("s") || state.keys.has("arrowdown") || state.keys.has("brake") ? 1 : 0;
  const left = state.keys.has("a") || state.keys.has("arrowleft") || state.keys.has("left") ? 1 : 0;
  const right = state.keys.has("d") || state.keys.has("arrowright") || state.keys.has("right") ? 1 : 0;
  const active = state.racing && !state.finished;
  if (active) {
    const speedFactor = Math.min(Math.abs(state.speed) / 65, 1);
    state.speed += throttle * 63 * delta;
    state.speed -= brake * 105 * delta;
    state.speed -= (throttle || brake ? 0 : 13) * delta * Math.sign(state.speed);
    state.speed = THREE.MathUtils.clamp(state.speed, -22, 185);
    const steering = (left - right) * (0.25 + speedFactor * 0.92) * delta * (state.speed < 0 ? -1 : 1);
    state.yaw += steering;
    const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const drift = state.keys.has(" ") || state.keys.has("space");
    const grip = drift ? 0.7 : 1;
    state.x += forward.x * state.speed * delta * grip * 0.3;
    state.z += forward.z * state.speed * delta * grip * 0.3;
    const ellipseDistance = Math.hypot(state.x / TRACK.x, state.z / TRACK.z);
    const outside = Math.abs((ellipseDistance - 1) * (TRACK.x + TRACK.z) / 2) > TRACK.width / 2 + 1.2;
    if (outside) state.speed *= Math.max(0, 1 - delta * 1.3);
    localCar.position.set(state.x, 0, state.z);
    localCar.rotation.y = state.yaw;
    localCar.userData.body.rotation.z = (right - left) * Math.min(speedFactor, 0.8) * (drift ? 0.16 : 0.065);
    for (const wheel of localCar.userData.wheels) wheel.rotation.x -= state.speed * delta * 0.16;
    state.progress = normalizedTrackProgress(state.x, state.z);
    if (state.previousProgress > 0.86 && state.progress < 0.14 && state.speed > 15) {
      state.lap++;
      document.querySelector("#lap-value").innerHTML = `${String(Math.min(state.lap, 3)).padStart(2, "0")} <small>/ 03</small>`;
      if (state.lap > 3) finishRace();
      else showMessage(`第 ${state.lap} 圈 · 繼續保持！`);
    }
    state.previousProgress = state.progress;
    document.querySelector("#speed-value").textContent = String(Math.round(Math.abs(state.speed))).padStart(3, "0");
    if (state.engineOscillator && state.audioContext) {
      state.engineOscillator.frequency.setTargetAtTime(58 + Math.abs(state.speed) * 1.15, state.audioContext.currentTime, 0.06);
    }
    if (now - state.lastSend > 50 && state.websocket?.readyState === WebSocket.OPEN) {
      state.websocket.send(JSON.stringify({ type: "state", x: state.x, z: state.z, yaw: state.yaw, speed: state.speed, progress: state.progress, lap: state.lap, name: state.playerName }));
      state.lastSend = now;
    }
    updateLeaderboard();
  }
  const heading = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const target = new THREE.Vector3(state.x - heading.x * 12, 8.5, state.z - heading.z * 12);
  camera.position.lerp(target, 1 - Math.exp(-3.2 * delta));
  camera.lookAt(state.x + heading.x * 5, 1.1, state.z + heading.z * 5);
  camera.fov = THREE.MathUtils.lerp(camera.fov, 54 + Math.min(Math.abs(state.speed) / 185, 1) * 5, 1 - Math.exp(-2 * delta));
  camera.updateProjectionMatrix();
  if (Math.floor(now / 170) !== Math.floor((now - delta * 1000) / 170)) updateMap();
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - (animate.previous || now)) / 1000, 0.04);
  animate.previous = now;
  for (const bot of bots) {
    const data = bot.userData.bot;
    if (state.racing && !state.finished) {
      const previousAngle = data.angle;
      data.angle += data.speed * delta * 60;
      if (previousAngle > Math.PI * 1.4 && data.angle % (Math.PI * 2) < 0.2) data.laps++;
    }
    const position = trackPosition(data.angle, data.offset);
    bot.position.set(position.x, 0, position.z);
    bot.rotation.y = position.yaw;
    for (const wheel of bot.userData.wheels) wheel.rotation.x += data.speed * delta * 60;
  }
  for (const entry of cars.values()) {
    entry.mesh.position.lerp(new THREE.Vector3(entry.x, 0, entry.z), 0.3);
    entry.mesh.rotation.y = entry.yaw;
    for (const wheel of entry.mesh.userData.wheels) wheel.rotation.x -= 0.18;
  }
  updatePlayer(delta, now);
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
});
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  state.keys.add(key);
});
window.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => state.keys.clear());

startButton.addEventListener("click", startRace);
document.querySelector("#replay-button").addEventListener("click", startRace);
createRoomButton.addEventListener("click", () => {
  roomInput.value = Math.random().toString(36).slice(2, 8).toUpperCase();
  updateRoomLink(roomInput.value);
  startRace();
});
document.querySelector("#copy-room").addEventListener("click", copyInviteLink);
roomInput.addEventListener("input", () => {
  const room = roomInput.value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
  startButton.querySelector("span").textContent = room ? "加入房間並開始" : "快速開始";
  updateRoomLink(room);
  showRoomFeedback(room ? `房間 ${room}：開始後即可邀請好友加入。` : "");
});
const invitedRoom = new URLSearchParams(location.search).get("room");
if (invitedRoom) {
  roomInput.value = invitedRoom.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
  startButton.querySelector("span").textContent = "加入房間並開始";
  showRoomFeedback(`已載入房間 ${roomInput.value}，按下「加入房間並開始」即可加入。`);
}
document.querySelectorAll("[data-control]").forEach((button) => {
  const control = button.dataset.control;
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); state.keys.add(control); });
  for (const eventName of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(eventName, () => state.keys.delete(control));
});
document.querySelector("#sound-button").addEventListener("click", (event) => {
  const button = event.currentTarget;
  state.soundEnabled = !state.soundEnabled;
  button.textContent = state.soundEnabled ? "◖" : "×";
  button.title = state.soundEnabled ? "關閉音效" : "開啟音效";
  if (state.audioContext && state.engineGain) {
    state.engineGain.gain.setTargetAtTime(state.soundEnabled ? 0.018 : 0, state.audioContext.currentTime, 0.08);
  }
});
window.addEventListener("beforeunload", () => state.websocket?.close());
