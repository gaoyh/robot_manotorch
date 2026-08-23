import * as THREE from "./vendor/three.module.js?v=20260822-11";
import { OrbitControls } from "./vendor/OrbitControls.js?v=20260822-11";

const poseCount = 48;
const betaCount = 10;
const eeCount = 16;
const hoverJointCount = 21;
const hoverJointIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const outputToArticulation = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 6,
  9: 7,
  10: 8,
  11: 9,
  12: 9,
  13: 10,
  14: 11,
  15: 12,
  16: 12,
  17: 13,
  18: 14,
  19: 15,
  20: 15,
};
const articulationToOutput = [0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19];
const ARTICULATION_LABELS = [
  "Wrist",
  "Thumb / base",
  "Thumb / middle",
  "Thumb / tip",
  "Index / base",
  "Index / middle",
  "Index / tip",
  "Middle / base",
  "Middle / middle",
  "Middle / tip",
  "Ring / base",
  "Ring / middle",
  "Ring / tip",
  "Pinky / base",
  "Pinky / middle",
  "Pinky / tip",
];

const JOINT_TREE = [
  { index: 1, label: "Thumb / base", children: [
    { index: 2, label: "Thumb / middle", children: [] },
    { index: 3, label: "Thumb / tip", children: [] },
  ]},
  { index: 4, label: "Index / base", children: [
    { index: 5, label: "Index / middle", children: [] },
    { index: 6, label: "Index / tip", children: [] },
  ]},
  { index: 7, label: "Middle / base", children: [
    { index: 8, label: "Middle / middle", children: [] },
    { index: 9, label: "Middle / tip", children: [] },
  ]},
  { index: 10, label: "Ring / base", children: [
    { index: 11, label: "Ring / middle", children: [] },
    { index: 12, label: "Ring / tip", children: [] },
  ]},
  { index: 13, label: "Pinky / base", children: [
    { index: 14, label: "Pinky / middle", children: [] },
    { index: 15, label: "Pinky / tip", children: [] },
  ]},
];

const JOINT_NAMES = [
  "Wrist",
  "Thumb / base",
  "Thumb / middle",
  "Thumb / tip",
  "Thumb / tip sample",
  "Index / base",
  "Index / middle",
  "Index / tip",
  "Index / tip sample",
  "Middle / base",
  "Middle / middle",
  "Middle / tip",
  "Middle / tip sample",
  "Ring / base",
  "Ring / middle",
  "Ring / tip",
  "Ring / tip sample",
  "Pinky / base",
  "Pinky / middle",
  "Pinky / tip",
  "Pinky / tip sample",
];

const state = {
  backendUrl: document.getElementById("backendUrl").value.trim(),
  side: document.getElementById("side").value,
  pose: Array(poseCount).fill(0),
  betas: Array(betaCount).fill(0),
  eeAngles: Array.from({ length: eeCount }, () => [0, 0, 0]),
  selectedJoint: 0,
  ws: null,
  three: null,
  pendingStream: null,
  pendingCompose: false,
  pendingSolve: false,
  poseSliderInputs: [],
  betaSliderInputs: [],
  latestAxes: null,
  latestJoints: [],
  dragState: null,
  hoverJointIndex: null,
  hoverAxisIndex: null,
  lastSolvedEeAngles: null,
};

const statusEl = document.getElementById("status");
const poseRoot = document.getElementById("poseSliders");
const betaRoot = document.getElementById("betaSliders");
const jointTreeRoot = document.getElementById("jointTree");
const selectedJointInfo = document.getElementById("selectedJointInfo");
const selectedJointSliders = document.getElementById("selectedJointSliders");
const viewportTooltip = document.getElementById("viewportTooltip");
const wristHost = document.getElementById("wristHost");

function setStatus(value) {
  statusEl.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function makeSliders(root, count, prefix, values, onChange, storeKey) {
  root.innerHTML = "";
  if (storeKey) {
    state[storeKey] = [];
  }
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
    if (storeKey) {
      state[storeKey].push({ input, label });
    }
  }
}

function syncSliders(storeKey, values) {
  const items = state[storeKey] || [];
  items.forEach((item, i) => {
    if (values[i] === undefined) return;
    item.input.value = values[i];
    item.label.querySelector(".val").textContent = Number(values[i]).toFixed(2);
  });
}

function flattenEeAngles() {
  return state.eeAngles.flat();
}

function setEeAnglesFromFlat(flat) {
  if (!Array.isArray(flat)) return;
  const values = flat.flat ? flat.flat() : flat;
  const next = [];
  for (let i = 0; i < eeCount; i++) {
    next.push([
      Number(values[i * 3 + 0] ?? 0),
      Number(values[i * 3 + 1] ?? 0),
      Number(values[i * 3 + 2] ?? 0),
    ]);
  }
  state.eeAngles = next;
}

function selectedJointValues() {
  return state.eeAngles[state.selectedJoint] || [0, 0, 0];
}

function renderSelectedJointPanel() {
  const joint = flattenTree().find((node) => node.index === state.selectedJoint)
    || { index: state.selectedJoint, label: jointLabel(state.selectedJoint) };
  selectedJointInfo.textContent = `${joint.label} (#${joint.index})`;
  selectedJointSliders.innerHTML = "";

  const labels = ["twist", "spread", "bend"];
  const values = selectedJointValues();
  labels.forEach((name, axis) => {
    const wrap = document.createElement("div");
    wrap.className = "slider";
    const label = document.createElement("label");
    label.innerHTML = `<span>${name}</span><span class="val">${Number(values[axis] ?? 0).toFixed(2)}</span>`;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "-1.5";
    input.max = "1.5";
    input.step = "0.01";
    input.value = values[axis] ?? 0;
    input.addEventListener("input", () => {
      state.eeAngles[state.selectedJoint][axis] = Number(input.value);
      label.querySelector(".val").textContent = Number(input.value).toFixed(2);
      scheduleCompose();
    });
    wrap.appendChild(label);
    wrap.appendChild(input);
    selectedJointSliders.appendChild(wrap);
  });
}

function selectJoint(index) {
  state.selectedJoint = index;
  renderJointTree();
  renderSelectedJointPanel();
  updateGizmo();
}

function renderJointTreeNode(node, container, depth = 0) {
  const item = document.createElement("div");
  item.className = "tree-item";

  const button = document.createElement("button");
  button.textContent = node.label;
  button.className = node.index === state.selectedJoint ? "selected" : "";
  button.style.paddingLeft = `${8 + depth * 10}px`;
  button.addEventListener("click", () => selectJoint(node.index));
  item.appendChild(button);

  if (node.children && node.children.length) {
    const children = document.createElement("div");
    children.className = "tree-children";
    node.children.forEach((child) => renderJointTreeNode(child, children, depth + 1));
    item.appendChild(children);
  }

  container.appendChild(item);
}

function renderWristButton() {
  if (!wristHost) return;
  wristHost.innerHTML = "";
  const button = document.createElement("button");
  button.textContent = "Wrist";
  button.className = state.selectedJoint === 0 ? "selected" : "";
  button.addEventListener("click", () => selectJoint(0));
  wristHost.appendChild(button);
}

function renderTooltip(text, evt) {
  if (!viewportTooltip) return;
  if (!text) {
    viewportTooltip.style.display = "none";
    viewportTooltip.textContent = "";
    return;
  }
  viewportTooltip.textContent = text;
  viewportTooltip.style.display = "block";
  viewportTooltip.style.left = `${evt.clientX - viewportTooltip.parentElement.getBoundingClientRect().left + 12}px`;
  viewportTooltip.style.top = `${evt.clientY - viewportTooltip.parentElement.getBoundingClientRect().top + 12}px`;
}

function renderJointTree() {
  jointTreeRoot.innerHTML = "";
  JOINT_TREE.forEach((node) => renderJointTreeNode(node, jointTreeRoot));
  renderWristButton();
}

function jointLabel(index) {
  return ARTICULATION_LABELS[index] || `Joint ${index}`;
}

function getAxisVector(axisIndex, jointIndex) {
  const axes = state.latestAxes;
  if (!axes) return null;
  const axisName = ["back", "up", "left"][axisIndex];
  const values = axes[axisName]?.[jointIndex];
  if (!values) return null;
  const vec = new THREE.Vector3(values[0], values[1], values[2]);
  if (vec.lengthSq() === 0) return null;
  return vec.normalize();
}

function getJointCenter(jointIndex) {
  const outputIndex = articulationToOutput[jointIndex] ?? jointIndex;
  const joint = state.latestJoints[outputIndex];
  if (!joint) return null;
  return new THREE.Vector3(joint[0], joint[1], joint[2]);
}

function projectToPlane(vec, normal) {
  return vec.clone().sub(normal.clone().multiplyScalar(vec.dot(normal)));
}

function signedAngleOnAxis(fromVec, toVec, axisVec) {
  const from = fromVec.clone().normalize();
  const to = toVec.clone().normalize();
  const cross = new THREE.Vector3().crossVectors(from, to);
  return Math.atan2(axisVec.dot(cross), from.dot(to));
}

function flattenTree(nodes = JOINT_TREE) {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenTree(node.children) : [])]);
}

function jointHitLabel(index) {
  return `${jointLabel(index)} (#${index})`;
}

function pickNearestJointFromEvent(evt, indices = hoverJointIndices, thresholdPx = 24) {
  if (!state.three || !state.latestJoints.length) return null;
  const { camera, renderer } = state.three;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  let best = null;
  let bestDist = Infinity;
  indices.forEach((index) => {
    const joint = state.latestJoints[index];
    if (!joint) return;
    const v = new THREE.Vector3(joint[0], joint[1], joint[2]).project(camera);
    const sx = (v.x * 0.5 + 0.5) * rect.width;
    const sy = (-v.y * 0.5 + 0.5) * rect.height;
    const dx = sx - x;
    const dy = sy - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return bestDist <= thresholdPx ? best : null;
}

function outputToSelectedArticulation(outputIndex) {
  return outputToArticulation[outputIndex];
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
    if (msg.type === "ready") {
      return;
    }
    if (msg.type === "pose") {
      state.pose = Array.isArray(msg.pose) ? msg.pose.slice() : state.pose;
      syncSliders("poseSliderInputs", state.pose);
      sendStream({
        type: "solve",
        side: state.side,
        pose: state.pose,
        betas: state.betas,
      });
      return;
    }
    if (msg.type === "result") {
      if (msg.ee_angles) {
        state.lastSolvedEeAngles = msg.ee_angles.flat ? msg.ee_angles.flat() : msg.ee_angles;
      }
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

function scheduleCompose() {
  if (state.pendingCompose) return;
  state.pendingCompose = true;
  requestAnimationFrame(() => {
    state.pendingCompose = false;
    composeOnce().catch((err) => setStatus(String(err)));
  });
}

async function composeOnce() {
  sendStream({
    type: "compose",
    side: state.side,
    ee_angles: flattenEeAngles(),
  });
}

async function loadOnce() {
  sendStream({
    type: "hello",
    side: state.side,
    pose: state.pose,
    betas: state.betas,
  });
}

async function solveOnce() {
  sendStream({
    type: "solve",
    side: state.side,
    pose: state.pose,
    betas: state.betas,
  });
}

function updateScene(payload) {
  if (!state.three) initThree();
  const { scene, jointPoints, jointLines, mesh } = state.three;

  const points = payload.joints || [];
  state.latestJoints = points;
  state.latestAxes = payload.axes || null;
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

  updateGizmo();
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

  const selectedJointMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.006, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, depthWrite: false })
  );
  selectedJointMarker.visible = false;
  scene.add(selectedJointMarker);

  const hoverJointMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.005, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false })
  );
  hoverJointMarker.visible = false;
  scene.add(hoverJointMarker);

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

  const gizmoGroup = new THREE.Group();
  const gizmoMeshes = [];
  const gizmoPickMeshes = [];
  const gizmoColors = [0xef4444, 0x22c55e, 0x3b82f6];
  const gizmoRings = [
    { axisIndex: 0, rotation: new THREE.Euler(0, Math.PI / 2, 0) },
    { axisIndex: 1, rotation: new THREE.Euler(Math.PI / 2, 0, 0) },
    { axisIndex: 2, rotation: new THREE.Euler(0, 0, 0) },
  ];
  gizmoRings.forEach((ring, idx) => {
    const pickGeom = new THREE.TorusGeometry(1, 0.08, 12, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: gizmoColors[idx],
      transparent: true,
      opacity: 0.02,
      depthTest: false,
      depthWrite: false,
    });
    const pickMesh = new THREE.Mesh(pickGeom, mat);
    pickMesh.renderOrder = 998;
    pickMesh.rotation.copy(ring.rotation);
    pickMesh.userData.axisIndex = ring.axisIndex;
    gizmoGroup.add(pickMesh);
    gizmoPickMeshes.push(pickMesh);

    const geom = new THREE.TorusGeometry(1, 0.03, 12, 64);
    const visMat = new THREE.MeshBasicMaterial({
      color: gizmoColors[idx],
      transparent: true,
      opacity: 0.75,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, visMat);
    mesh.renderOrder = 999;
    mesh.rotation.copy(ring.rotation);
    mesh.userData.axisIndex = ring.axisIndex;
    gizmoGroup.add(mesh);
    gizmoMeshes.push(mesh);
  });
  const centerSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })
  );
  gizmoGroup.add(centerSphere);
  scene.add(gizmoGroup);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function setPointerFromEvent(evt) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((evt.clientY - rect.top) / rect.height) * 2 - 1);
  }

  function updateHover(evt) {
    if (state.dragState) return;
    setPointerFromEvent(evt);
    raycaster.setFromCamera(pointer, camera);
    const gizmoHits = raycaster.intersectObjects(gizmoPickMeshes, false);
    state.hoverAxisIndex = gizmoHits.length ? gizmoHits[0].object.userData.axisIndex : null;

    const hoverOutputIndex = pickNearestJointFromEvent(evt, hoverJointIndices);
    state.hoverJointIndex = hoverOutputIndex === null ? null : outputToSelectedArticulation(hoverOutputIndex);
    if (hoverOutputIndex !== null) {
      const axisName = state.hoverAxisIndex !== null ? ["twist", "spread", "bend"][state.hoverAxisIndex] : "";
      renderTooltip(`${JOINT_NAMES[hoverOutputIndex] || `Joint ${hoverOutputIndex}`}${axisName ? `\n${axisName}` : ""}`, evt);
    } else if (state.hoverAxisIndex !== null) {
      renderTooltip(`Selected joint\n${["twist", "spread", "bend"][state.hoverAxisIndex]}`, evt);
    } else {
      renderTooltip("", evt);
    }
    updateGizmo();
  }

  function updateDrag(evt) {
    if (!state.dragState) return false;
    setPointerFromEvent(evt);
    raycaster.setFromCamera(pointer, camera);
    const center = getJointCenter(state.selectedJoint);
    if (!center) return false;
    const axisVec = getAxisVector(state.dragState.axisIndex, state.selectedJoint);
    if (!axisVec) return false;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisVec, center);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return false;
    const current = projectToPlane(hit.sub(center), axisVec);
    if (current.lengthSq() === 0 || state.dragState.startVec.lengthSq() === 0) return false;
    const delta = signedAngleOnAxis(state.dragState.startVec, current, axisVec);
    state.eeAngles[state.selectedJoint][state.dragState.axisIndex] = state.dragState.startAngle + delta;
    renderSelectedJointPanel();
    scheduleCompose();
    updateGizmo();
    return true;
  }

  renderer.domElement.addEventListener("pointerdown", (evt) => {
    setPointerFromEvent(evt);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(gizmoPickMeshes, false);
    const outputIndex = pickNearestJointFromEvent(evt, hoverJointIndices);
    const jointIndex = outputIndex === null ? null : outputToSelectedArticulation(outputIndex);
    if (!hits.length && jointIndex !== null) {
      selectJoint(jointIndex);
      updateGizmo();
      renderTooltip(JOINT_NAMES[outputIndex] || `Joint ${outputIndex}`, evt);
      evt.preventDefault();
      return;
    }
    if (!hits.length) return;
    const hit = hits[0];
    const axisIndex = hit.object.userData.axisIndex;
    const center = getJointCenter(state.selectedJoint);
    const axisVec = getAxisVector(axisIndex, state.selectedJoint);
    if (!center || !axisVec) return;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisVec, center);
    const startHit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, startHit)) return;
    const startVec = projectToPlane(startHit.sub(center), axisVec);
    if (startVec.lengthSq() === 0) return;
    state.dragState = {
      axisIndex,
      startAngle: state.eeAngles[state.selectedJoint][axisIndex],
      startVec,
    };
    controls.enabled = false;
    renderer.domElement.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  });

  renderer.domElement.addEventListener("pointermove", (evt) => {
    if (!state.dragState) {
      updateHover(evt);
      return;
    }
    if (updateDrag(evt)) {
      evt.preventDefault();
    }
  });

  renderer.domElement.addEventListener("pointerup", (evt) => {
    state.dragState = null;
    controls.enabled = true;
    try { renderer.domElement.releasePointerCapture(evt.pointerId); } catch (_) {}
  });

  renderer.domElement.addEventListener("pointerleave", () => {
    state.dragState = null;
    state.hoverJointIndex = null;
    state.hoverAxisIndex = null;
    controls.enabled = true;
    renderTooltip("");
    updateGizmo();
  });

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

  state.three = {
    scene,
    camera,
    renderer,
    controls,
    jointPoints,
    jointLines,
    mesh,
    gizmoGroup,
    gizmoMeshes,
    gizmoPickMeshes,
    raycaster,
    pointer,
    selectedJointMarker,
    hoverJointMarker,
  };
}

function updateGizmo() {
  if (!state.three) return;
  const { gizmoGroup, gizmoMeshes, gizmoPickMeshes, selectedJointMarker, hoverJointMarker } = state.three;
  const center = getJointCenter(state.selectedJoint);
  if (!center) {
    gizmoGroup.visible = false;
    selectedJointMarker.visible = false;
    hoverJointMarker.visible = false;
    return;
  }
  gizmoGroup.visible = true;
  gizmoGroup.position.copy(center);
  selectedJointMarker.position.copy(center);
  selectedJointMarker.visible = true;

  const hoverCenter = state.hoverJointIndex !== null ? getJointCenter(state.hoverJointIndex) : null;
  if (hoverCenter) {
    hoverJointMarker.position.copy(hoverCenter);
    hoverJointMarker.visible = true;
  } else {
    hoverJointMarker.visible = false;
  }

  const radius = 0.03;
  gizmoMeshes.forEach((mesh) => {
    const axisIndex = mesh.userData.axisIndex;
    const axisVec = getAxisVector(axisIndex, state.selectedJoint);
    const pickMesh = gizmoPickMeshes[axisIndex];
    if (!axisVec) {
      mesh.visible = false;
      if (pickMesh) pickMesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.scale.setScalar(radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisVec);
    mesh.material.opacity = state.dragState && state.dragState.axisIndex === axisIndex ? 1.0 : (state.hoverAxisIndex === axisIndex ? 0.95 : 0.75);
    if (pickMesh) {
      pickMesh.visible = true;
      pickMesh.scale.setScalar(radius);
      pickMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisVec);
    }
  });
}

makeSliders(poseRoot, poseCount, "p", state.pose, scheduleSolve, "poseSliderInputs");
makeSliders(betaRoot, betaCount, "b", state.betas, scheduleSolve, "betaSliderInputs");
renderJointTree();
renderSelectedJointPanel();
initThree();

document.getElementById("btnResetSelected").addEventListener("click", () => {
  state.eeAngles[state.selectedJoint] = [0, 0, 0];
  renderSelectedJointPanel();
  scheduleCompose();
});

document.getElementById("btnResetEe").addEventListener("click", () => {
  state.eeAngles = Array.from({ length: eeCount }, () => [0, 0, 0]);
  renderSelectedJointPanel();
  scheduleCompose();
});

document.getElementById("btnResetBetas").addEventListener("click", () => {
  state.betas = Array(betaCount).fill(0);
  syncSliders("betaSliderInputs", state.betas);
  scheduleSolve();
});

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
