import * as THREE from "./vendor/three.module.js?v=20260822-1";
import { OrbitControls } from "./vendor/OrbitControls.js?v=20260822-1";

const poseCount = 48;
const betaCount = 10;

const state = {
  backendUrl: document.getElementById("backendUrl").value.trim(),
  side: document.getElementById("side").value,
  pose: Array(poseCount).fill(0),
  betas: Array(betaCount).fill(0),
  ws: null,
  three: null,
  pendingStream: null,
};

const statusEl = document.getElementById("status");
const poseRoot = document.getElementById("poseSliders");
const betaRoot = document.getElementById("betaSliders");

function setStatus(value) {
  statusEl.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function makeSliders(root, count, prefix, values, onChange) {
  root.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement("div");
    wrap.className = "slider";
    const label = document.createElement("label");
    label.innerHTML = `<span>${prefix}${i}</span><span class="val">0.00</span>`;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "-3.14";
    input.max = "3.14";
    input.step = "0.01";
    input.value = values[i];
    input.addEventListener("input", () => {
      values[i] = Number(input.value);
      label.querySelector(".val").textContent = Number(input.value).toFixed(2);
      onChange();
    });
    label.querySelector(".val").textContent = Number(input.value).toFixed(2);
    wrap.appendChild(label);
    wrap.appendChild(input);
    root.appendChild(wrap);
  }
}

function backendBase() {
  return state.backendUrl ? state.backendUrl.replace(/\/$/, "") : "";
}

async function postJson(path, body) {
  const res = await fetch(`${backendBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

function buildWebSocket() {
  if (state.ws) state.ws.close();
  const wsUrl = state.backendUrl
    ? state.backendUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/ws/stream"
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/stream`;
  state.ws = new WebSocket(wsUrl);
  state.ws.onopen = () => {
    setStatus("ws connected");
    state.ws.send(JSON.stringify({
      type: "hello",
      side: state.side,
      pose: state.pose,
      betas: state.betas,
    }));
    if (state.pendingStream) {
      state.ws.send(JSON.stringify(state.pendingStream));
      state.pendingStream = null;
    }
  };
  state.ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    setStatus(msg);
    if (msg.type === "result") {
      updateScene(msg);
    }
  };
  state.ws.onerror = () => setStatus("ws error");
  state.ws.onclose = () => setStatus("ws closed");
}

function sendStream(msg) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    state.pendingStream = msg;
    buildWebSocket();
    return;
  }
  state.ws.send(JSON.stringify(msg));
}

let pending = false;
function scheduleSolve() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    sendStream({
      type: "solve",
      pose: state.pose,
      betas: state.betas,
      side: state.side,
    });
  });
}

async function loadOnce() {
  const data = await postJson("/api/load", {
    side: state.side,
    pose: state.pose,
    betas: state.betas,
  });
  setStatus(data.meta);
  updateScene(data);
}

async function solveOnce() {
  const data = await postJson("/api/solve", {
    side: state.side,
    pose: state.pose,
    betas: state.betas,
  });
  setStatus(data.meta);
  updateScene(data);
}

function updateScene(payload) {
  if (!state.three) initThree();
  const { scene, jointPoints, jointLines, mesh } = state.three;

  const points = payload.joints || [];
  if (!points.length) return;

  const posArray = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    posArray[i * 3 + 0] = p[0];
    posArray[i * 3 + 1] = p[1];
    posArray[i * 3 + 2] = p[2];
  });
  jointPoints.geometry.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
  jointPoints.geometry.computeBoundingSphere();

  const lines = [];
  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
  ];
  pairs.forEach(([a, b]) => {
    if (points[a] && points[b]) lines.push(points[a][0], points[a][1], points[a][2], points[b][0], points[b][1], points[b][2]);
  });
  jointLines.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lines), 3));
  jointLines.geometry.computeBoundingSphere();

  if (payload.faces && payload.verts) {
    const verts = payload.verts;
    const positions = new Float32Array(verts.length * 3);
    verts.forEach((v, i) => {
      positions[i * 3 + 0] = v[0];
      positions[i * 3 + 1] = v[1];
      positions[i * 3 + 2] = v[2];
    });
    mesh.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const indices = [];
    payload.faces.forEach((f) => indices.push(f[0], f[1], f[2]));
    mesh.geometry.setIndex(indices);
    mesh.geometry.computeVertexNormals();
    mesh.visible = true;
  } else {
    mesh.visible = false;
  }
}

function initThree() {
  const container = document.getElementById("threeRoot");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
  camera.position.set(0.15, 0.1, 0.35);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.update();

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(1, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const jointGeometry = new THREE.BufferGeometry();
  const jointMaterial = new THREE.PointsMaterial({ color: 0x22c55e, size: 0.004 });
  const jointPoints = new THREE.Points(jointGeometry, jointMaterial);
  scene.add(jointPoints);

  const lineGeometry = new THREE.BufferGeometry();
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x60a5fa });
  const jointLines = new THREE.LineSegments(lineGeometry, lineMaterial);
  scene.add(jointLines);

  const meshGeometry = new THREE.BufferGeometry();
  const meshMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5d0fe,
    metalness: 0.1,
    roughness: 0.8,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
  mesh.visible = false;
  scene.add(mesh);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener("resize", () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  state.three = { scene, camera, renderer, controls, jointPoints, jointLines, mesh };
}

makeSliders(poseRoot, poseCount, "p", state.pose, scheduleSolve);
makeSliders(betaRoot, betaCount, "b", state.betas, scheduleSolve);
initThree();

document.getElementById("btnConnect").addEventListener("click", () => {
  state.backendUrl = document.getElementById("backendUrl").value.trim();
  state.side = document.getElementById("side").value;
  buildWebSocket();
});

document.getElementById("btnLoad").addEventListener("click", () => {
  state.backendUrl = document.getElementById("backendUrl").value.trim();
  state.side = document.getElementById("side").value;
  loadOnce().catch((err) => setStatus(String(err)));
});

document.getElementById("btnSolve").addEventListener("click", () => {
  state.backendUrl = document.getElementById("backendUrl").value.trim();
  state.side = document.getElementById("side").value;
  solveOnce().catch((err) => setStatus(String(err)));
});

document.getElementById("btnPing").addEventListener("click", () => {
  sendStream({ type: "ping", nonce: String(Date.now()) });
});

document.getElementById("side").addEventListener("change", (evt) => {
  state.side = evt.target.value;
});
