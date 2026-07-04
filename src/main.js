import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import helvetikerFontUrl from 'three/examples/fonts/helvetiker_bold.typeface.json?url';
import { getSavedUsername, saveUsernameLocally, saveHighScoreToFirebase, getTopScores } from "./firebase.js";

const WORLD = {
  baseSpeed: 13,
  maxSpeed: 29,
  laneLimit: 4.7,
  dinoZ: 5.1,
  gravity: 45,
  jumpVelocity: 17.8,
  birdUnlockScore: 450,
  fogNear: 52,
  fogFar: 168,
  fogDensity: 1.0
};

const ui = {
  panel: document.getElementById("centerPanel"),
  title: document.querySelector("#centerPanel h1"),
  message: document.querySelector("#centerPanel p"),
  start: document.getElementById("startButton"),
  pause: document.getElementById("pauseButton"),
  score: document.getElementById("score"),
  introText: document.getElementById("introText"),
  mobileControls: document.getElementById("mobileControls"),
  glbInput: document.getElementById("glbInput"),
  glbLabel: document.getElementById("glbLabel"),
  gameOverPanel: document.getElementById("gameOverPanel"),
  pausePanel: document.getElementById("pausePanel"),
  infoPanel: document.getElementById("infoPanel"),
  restartButton: document.getElementById("restartButton"),
  fpsCounter: document.getElementById("fpsCounter"),
  desktopControls: document.getElementById("desktopControls"),
  topLeftControls: document.getElementById("topLeftControls"),
  usernamePrompt: document.getElementById("usernamePrompt"),
  usernameInput: document.getElementById("usernameInput"),
  submitScoreButton: document.getElementById("submitScoreButton"),
  openSubmitScoreButton: document.getElementById("openSubmitScoreButton"),
  closeSubmitScoreButton: document.getElementById("closeSubmitScoreButton"),
  scoreSavedMsg: document.getElementById("scoreSavedMsg"),
  resetHiStatus: document.getElementById("resetHiStatus"),
  leaderboardSidebar: document.getElementById("leaderboardSidebar"),
  lbList: document.getElementById("lbList"),
  lbMoreBtn: document.getElementById("lbMoreBtn"),
  fullLeaderboardModal: document.getElementById("fullLeaderboardModal"),
  fullLbTableBody: document.getElementById("fullLbTableBody"),
  lbCloseBtn: document.getElementById("lbCloseBtn")
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf8f8f8);
scene.fog = new THREE.Fog(0xf8f8f8, WORLD.fogNear, WORLD.fogFar);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  240
);

const gameOverOverlay = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
);
gameOverOverlay.position.set(0, 0, -2);
camera.add(gameOverOverlay);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});
renderer.autoClear = false;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.position = "fixed";
renderer.domElement.style.inset = "0";
renderer.domElement.style.zIndex = "0";
document.body.prepend(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd7d7d7, 2.25);
scene.add(hemiLight);

const sunlight = new THREE.DirectionalLight(0xffffff, 3.2);
sunlight.position.set(-35, 55, 35);
sunlight.target.position.set(0, 0, -48);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(4096, 4096);
sunlight.shadow.camera.left = -82;
sunlight.shadow.camera.right = 82;
sunlight.shadow.camera.top = 88;
sunlight.shadow.camera.bottom = -76;
sunlight.shadow.camera.near = 0.5;
sunlight.shadow.camera.far = 245;
sunlight.shadow.bias = -0.00035;
sunlight.shadow.normalBias = 0.028;
scene.add(sunlight);
scene.add(sunlight.target);

hemiLight.layers.enable(1);
sunlight.layers.enable(1);
sunlight.target.layers.enable(1);

const stars = (function () {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  for (let i = 0; i < 600; i++) {
    const x = THREE.MathUtils.randFloatSpread(300);
    const y = THREE.MathUtils.randFloat(20, 150);
    const z = THREE.MathUtils.randFloatSpread(300);
    vertices.push(x, y, z);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.7,
    transparent: true,
    opacity: 0,
    fog: false
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return points;
})();

const materials = {
  dino: new THREE.MeshStandardMaterial({
    color: 0x3b3b3b,
    roughness: 0.96
  }),
  dinoLight: new THREE.MeshStandardMaterial({
    color: 0x8a8a8a,
    roughness: 1
  }),
  ground: new THREE.MeshStandardMaterial({
    color: 0xf3f3f3,
    roughness: 1,
    transparent: true,
    opacity: 0
  }),
  pebble: new THREE.MeshStandardMaterial({
    color: 0x969696,
    roughness: 1,
    transparent: true,
    opacity: 0
  }),
  cactus: new THREE.MeshStandardMaterial({
    color: 0x3b3b3b,
    roughness: 0.96
  })
};

let birdGLTF = null;
let dinoWalkGLTF = null;
let dinoDuckGLTF = null;
const gltfLoader = new GLTFLoader();

/**
 * Manual stop-motion frame controller for Sketchfab timeframe GLBs.
 * These models store each animation frame as a separate mesh, hidden/shown
 * by toggling scale between ~0 and 1. AnimationMixer breaks on clones,
 * so we control frame visibility directly.
 */
class TimeframeController {
  constructor(frameContainers, frameDuration) {
    this.frames = frameContainers;
    this.frameDuration = frameDuration;
    this.elapsed = 0;
    this.currentFrame = 0;
    this._showFrame(0);
  }

  _showFrame(index) {
    for (let i = 0; i < this.frames.length; i++) {
      this.frames[i].scale.setScalar(i === index ? 1 : 1e-10);
    }
    this.currentFrame = index;
  }

  update(delta) {
    this.elapsed += delta;
    const totalDuration = this.frames.length * this.frameDuration;
    const loopedTime = this.elapsed % totalDuration;
    const frameIndex = Math.min(
      Math.floor(loopedTime / this.frameDuration),
      this.frames.length - 1
    );
    if (frameIndex !== this.currentFrame) {
      this._showFrame(frameIndex);
    }
  }
}

/**
 * Clone a Sketchfab stop-motion scene and return a TimeframeController.
 * The scene structure is: Scene -> Sketchfab_model -> sketchfab.timeframe -> [frame containers]
 */
function createTimeframeInstance(sourceScene, frameDuration) {
  const clone = sourceScene.clone(true);

  // Navigate to the timeframe group: root -> first child -> first child
  // Structure: Scene > Sketchfab_model > sketchfab.timeframe > [Object_2, Object_5, ...]
  const sketchfabModel = clone.children[0];
  const timeframeGroup = sketchfabModel?.children[0];
  const frameContainers = timeframeGroup ? [...timeframeGroup.children] : [];

  const controller = new TimeframeController(frameContainers, frameDuration);
  // Randomize start time
  controller.elapsed = Math.random() * frameContainers.length * frameDuration;
  controller._showFrame(
    Math.floor(controller.elapsed / frameDuration) % frameContainers.length
  );

  return { scene: clone, controller };
}

const gltfMaterials = [];
function registerGLTFMaterials(gltfScene, isDino = false, isBird = false) {
  gltfScene.traverse((child) => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => {
        if (!gltfMaterials.includes(m)) {
          m.userData.dayColor = m.color.clone();
          m.userData.originalMap = m.map || null;
          m.userData.originalRoughness = m.roughness !== undefined ? m.roughness : 0.9;
          m.userData.originalMetalness = m.metalness !== undefined ? m.metalness : 0;
          m.userData.isDino = isDino;
          m.userData.isBird = isBird;
          gltfMaterials.push(m);
        }
      });
    }
  });
}

gltfLoader.load('/3d_chrome_bird_flying.glb', (gltf) => {
  birdGLTF = gltf;
  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  registerGLTFMaterials(gltf.scene, false, true);
}, undefined, (error) => {
  console.warn('GLB relative load failed:', error);
});

gltfLoader.load('/3d_chrome_dino_walking.glb', (gltf) => {
  dinoWalkGLTF = gltf;
  setupDinoModel('walk', gltf);
});

gltfLoader.load('/3d_chrome_dino_duck-walking.glb', (gltf) => {
  dinoDuckGLTF = gltf;
  setupDinoModel('duck', gltf);
});


function box(w, h, d, material = materials.dino) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    material
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  materials.ground
);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -300;
ground.receiveShadow = true;
scene.add(ground);

const pathPatches = [];
const pathGroup = new THREE.Group();
pathGroup.visible = false;
scene.add(pathGroup);

// Road surface — darker packed-earth, clearly distinct from desert sand
const roadSurfaceMat = new THREE.MeshStandardMaterial({ color: 0xb8873e, roughness: 0.95 });
// Curb stone materials — rough stone blocks along the edges
const curbMatA = new THREE.MeshStandardMaterial({ color: 0x8a7050, roughness: 0.8 });
const curbMatB = new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 0.85 });

const roadWidthBase = 9.5;
const segmentDepth = 2.5;
const numSegments = 70;
const curbSize = { w: 0.55, h: 0.22, d: 0.55 };

// Shared curb geometry
const curbGeo = new THREE.BoxGeometry(curbSize.w, curbSize.h, curbSize.d);
// Gravel materials for road surface texture
const gravelMatA = new THREE.MeshStandardMaterial({ color: 0x9a7848, roughness: 0.9 });
const gravelMatB = new THREE.MeshStandardMaterial({ color: 0x7d6038, roughness: 0.95 });
const gravelMatC = new THREE.MeshStandardMaterial({ color: 0xad8850, roughness: 0.85 });
const gravelMats = [gravelMatA, gravelMatB, gravelMatC];
const gravelGeo = new THREE.BoxGeometry(0.2, 0.06, 0.2);

// Use a slowly varying "wobble" offset for each edge so the path meanders naturally
let leftWobble = 0;
let rightWobble = 0;

for (let i = 0; i < numSegments; i++) {
  const seg = new THREE.Group();

  // Gently drift left/right wobble (Brownian-style random walk, clamped)
  leftWobble += THREE.MathUtils.randFloat(-0.4, 0.4);
  rightWobble += THREE.MathUtils.randFloat(-0.4, 0.4);
  leftWobble = THREE.MathUtils.clamp(leftWobble, -1.5, 1.5);
  rightWobble = THREE.MathUtils.clamp(rightWobble, -1.5, 1.5);

  // Vary road width per segment for organic feel
  const localWidth = roadWidthBase + leftWobble - rightWobble;
  // Make surface slightly longer than segmentDepth to overlap and prevent striped gaps.
  // Add a microscopic Y offset per segment to prevent Z-fighting on the overlapping areas.
  const surfaceGeo = new THREE.BoxGeometry(localWidth, 0.06, segmentDepth + 0.3);
  const surface = new THREE.Mesh(surfaceGeo, roadSurfaceMat);
  surface.position.x = (leftWobble + rightWobble) / 2; // shift center with wobble
  surface.position.y = 0.03 + (i % 2) * 0.0005;
  surface.receiveShadow = true;
  seg.add(surface);

  // Curb stones on left edge — uneven placement
  const numCurbs = Math.floor(segmentDepth / (curbSize.d + 0.1));
  for (let c = 0; c < numCurbs; c++) {
    // Randomly skip some curbs for a broken, natural look
    if (Math.random() < 0.15) continue;

    const mat = Math.random() > 0.5 ? curbMatA : curbMatB;
    const scale = THREE.MathUtils.randFloat(0.8, 1.2);
    const curb = new THREE.Mesh(curbGeo, mat);
    curb.scale.set(scale, THREE.MathUtils.randFloat(0.7, 1.3), scale);
    curb.rotation.y = THREE.MathUtils.randFloat(-0.25, 0.25);
    curb.position.set(
      -localWidth / 2 - curbSize.w * 0.3 + (leftWobble + rightWobble) / 2 + THREE.MathUtils.randFloat(-0.3, 0.3),
      curbSize.h / 2 * scale,
      -segmentDepth / 2 + curbSize.d / 2 + c * (curbSize.d + 0.1) + THREE.MathUtils.randFloat(-0.08, 0.08)
    );
    curb.castShadow = true;
    curb.receiveShadow = true;
    seg.add(curb);

    // Mirror on right edge with its own randomness
    if (Math.random() < 0.15) continue; // skip some on right too
    const scaleR = THREE.MathUtils.randFloat(0.8, 1.2);
    const curbR = new THREE.Mesh(curbGeo, Math.random() > 0.5 ? curbMatA : curbMatB);
    curbR.scale.set(scaleR, THREE.MathUtils.randFloat(0.7, 1.3), scaleR);
    curbR.rotation.y = THREE.MathUtils.randFloat(-0.25, 0.25);
    curbR.position.set(
      localWidth / 2 + curbSize.w * 0.3 + (leftWobble + rightWobble) / 2 + THREE.MathUtils.randFloat(-0.3, 0.3),
      curbSize.h / 2 * scaleR,
      curb.position.z + THREE.MathUtils.randFloat(-0.1, 0.1)
    );
    curbR.castShadow = true;
    curbR.receiveShadow = true;
    seg.add(curbR);
  }

  // Scatter gravel pebbles on the road surface
  const numGravel = THREE.MathUtils.randInt(5, 9);
  for (let g = 0; g < numGravel; g++) {
    const gMat = gravelMats[Math.floor(Math.random() * 3)];
    const gravel = new THREE.Mesh(gravelGeo, gMat);
    const gs = THREE.MathUtils.randFloat(0.6, 1.8);
    gravel.scale.set(gs, THREE.MathUtils.randFloat(0.5, 1.5), gs);
    gravel.rotation.y = Math.random() * Math.PI;
    gravel.position.set(
      THREE.MathUtils.randFloat(-localWidth / 2 + 0.5, localWidth / 2 - 0.5) + (leftWobble + rightWobble) / 2,
      0.06 + 0.03 * gs,
      THREE.MathUtils.randFloat(-segmentDepth / 2 + 0.2, segmentDepth / 2 - 0.2)
    );
    gravel.castShadow = true;
    gravel.receiveShadow = true;
    seg.add(gravel);
  }

  seg.position.z = -145 + i * segmentDepth;
  pathGroup.add(seg);
  pathPatches.push(seg);
}

function buildDeadEyes() {
  const deadEyes = new THREE.Group();
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x3b3b3b });

  const eyeSize = 0.36;
  const eyeDepth = 0.05;
  const pupilSize = 0.12;

  const rightEye = new THREE.Group();
  const rw = new THREE.Mesh(new THREE.BoxGeometry(eyeDepth, eyeSize, eyeSize), whiteMat);
  const rp = new THREE.Mesh(new THREE.BoxGeometry(eyeDepth + 0.02, pupilSize, pupilSize), pupilMat);
  rightEye.add(rw);
  rightEye.add(rp);
  deadEyes.add(rightEye);

  const leftEye = new THREE.Group();
  const lw = new THREE.Mesh(new THREE.BoxGeometry(eyeDepth, eyeSize, eyeSize), whiteMat);
  const lp = new THREE.Mesh(new THREE.BoxGeometry(eyeDepth + 0.02, pupilSize, pupilSize), pupilMat);
  leftEye.add(lw);
  leftEye.add(lp);
  deadEyes.add(leftEye);

  deadEyes.traverse(child => {
    child.layers.enable(1);
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  deadEyes.visible = false;
  return deadEyes;
}

function buildGLBDino() {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);

  const deadEyes = buildDeadEyes();
  visual.add(deadEyes);

  root.userData = {
    visual,
    deadEyes,
    walkScene: null,
    duckScene: null,
    walkMixer: null,
    duckMixer: null,
    activeModel: 'walk'
  };

  root.position.set(0, 0, WORLD.dinoZ);
  scene.add(root);
  return root;
}

function setupDinoModel(type, gltf) {
  // Dino uses the original scene directly (only one instance per type)
  const modelScene = gltf.scene;
  modelScene.rotation.y = Math.PI / 2;
  modelScene.scale.setScalar(1.5);
  modelScene.traverse((child) => {
    child.layers.enable(1);
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  registerGLTFMaterials(modelScene, true, false);

  // Build timeframe controller (0.25s per frame for dino)
  const sketchfabModel = modelScene.children[0];
  const timeframeGroup = sketchfabModel?.children[0];
  const frameContainers = timeframeGroup ? [...timeframeGroup.children] : [];
  const controller = new TimeframeController(frameContainers, 0.25);

  if (type === 'walk') {
    dino.userData.walkScene = modelScene;
    dino.userData.walkController = controller;
    dino.userData.visual.add(modelScene);
    modelScene.visible = true;
    dino.userData.activeModel = 'walk';
  } else if (type === 'duck') {
    dino.userData.duckScene = modelScene;
    dino.userData.duckController = controller;
    modelScene.position.y = -0.65;
    modelScene.position.x = -0.5; // Offset to center the model
    dino.userData.visual.add(modelScene);
    modelScene.visible = false;
  }
}

function switchDinoModel(toDuck) {
  const target = toDuck ? 'duck' : 'walk';
  if (dino.userData.activeModel === target) return;

  if (dino.userData.walkScene) {
    dino.userData.walkScene.visible = !toDuck;
  }
  if (dino.userData.duckScene) {
    dino.userData.duckScene.visible = toDuck;
  }

  dino.userData.activeModel = target;
}

const dino = buildGLBDino();

function createVoxelCactus(scale = 1, armVariant = 0) {
  const group = new THREE.Group();

  const trunk = box(0.62 * scale, 3.15 * scale, 0.62 * scale, materials.cactus);
  trunk.position.y = 1.575 * scale;
  group.add(trunk);

  const cap = box(0.5 * scale, 0.2 * scale, 0.5 * scale, materials.cactus);
  cap.position.y = 3.24 * scale;
  group.add(cap);

  const leftHeight = armVariant === 1 ? 2.02 : 1.78;
  const rightHeight = armVariant === 2 ? 2.08 : 1.9;

  const leftVertical = box(0.48 * scale, 1.38 * scale, 0.48 * scale, materials.cactus);
  leftVertical.position.set(-0.7 * scale, leftHeight * scale, 0);
  group.add(leftVertical);

  const leftBridge = box(0.86 * scale, 0.46 * scale, 0.48 * scale, materials.cactus);
  leftBridge.position.set(-0.4 * scale, 1.38 * scale, 0);
  group.add(leftBridge);

  const rightVertical = box(0.48 * scale, 1.52 * scale, 0.48 * scale, materials.cactus);
  rightVertical.position.set(0.7 * scale, rightHeight * scale, 0);
  group.add(rightVertical);

  const rightBridge = box(0.86 * scale, 0.46 * scale, 0.48 * scale, materials.cactus);
  rightBridge.position.set(0.4 * scale, 1.48 * scale, 0);
  group.add(rightBridge);

  for (let i = 0; i < 5; i++) {
    const rubbleMat = (typeof fullColorMode !== "undefined" && fullColorMode) 
      ? desertRockMaterials[i % desertRockMaterials.length] 
      : materials.pebble;
    const rubble = box(
      THREE.MathUtils.randFloat(0.12, 0.23) * scale,
      THREE.MathUtils.randFloat(0.08, 0.14) * scale,
      THREE.MathUtils.randFloat(0.12, 0.24) * scale,
      rubbleMat
    );
    rubble.userData.rockIndex = i % desertRockMaterials.length;
    rubble.position.set(
      THREE.MathUtils.randFloat(-0.75, 0.75) * scale,
      rubble.geometry.parameters.height / 2,
      THREE.MathUtils.randFloat(-0.55, 0.55) * scale
    );
    group.add(rubble);
  }

  group.userData.kind = "cactus";
  group.userData.scaleFactor = scale;
  group.userData.hitbox = {
    size: new THREE.Vector3(1.55 * scale, 2.88 * scale, 0.76 * scale),
    offset: new THREE.Vector3(0, 1.44 * scale, 0)
  };
  group.userData.passed = false;
  return group;
}

function createPterodactyl() {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);

  root.userData.kind = "bird";
  root.userData.visual = visual;
  root.userData.flapOffset = Math.random() * Math.PI * 2;
  root.userData.swayOffset = Math.random() * Math.PI * 2;
  root.userData.baseX = 0;
  root.userData.speedMultiplier = THREE.MathUtils.randFloat(1.24, 1.32);
  root.userData.targetX = 0;
  root.userData.baseY = 2.18;
  root.userData.steeringVelocity = 0;
  root.userData.flightMode = "high";
  root.userData.hitbox = {
    size: new THREE.Vector3(1.35, 0.76, 1.15),
    offset: new THREE.Vector3(0, 0.05, 0)
  };
  root.userData.passed = false;

  if (birdGLTF) {
    // 0.125s per frame for 8-frame bird animation
    const { scene: clonedScene, controller } = createTimeframeInstance(
      birdGLTF.scene, 0.125
    );
    clonedScene.scale.setScalar(1.25);

    // Wrap in a pivot so rotation doesn't interfere with frame animations
    const pivot = new THREE.Group();
    pivot.rotation.y = Math.PI / 2;
    pivot.position.set(0, -0.2, 0);
    pivot.add(clonedScene);
    visual.add(pivot);

    root.userData.timeframeController = controller;

    root.userData.leftWingPivot = { rotation: new THREE.Euler() };
    root.userData.rightWingPivot = { rotation: new THREE.Euler() };
    return root;
  }

  const body = box(0.78, 0.34, 1.05);
  visual.add(body);

  const neck = box(0.3, 0.28, 0.48);
  neck.position.set(0, 0.12, -0.66);
  visual.add(neck);

  const head = box(0.48, 0.35, 0.48);
  head.position.set(0, 0.17, -0.98);
  visual.add(head);

  const beak = box(0.28, 0.16, 0.65);
  beak.position.set(0, 0.11, -1.48);
  visual.add(beak);

  const tail = box(0.32, 0.23, 0.72);
  tail.position.set(0, 0.04, 0.8);
  visual.add(tail);

  const leftWingPivot = new THREE.Group();
  leftWingPivot.position.set(-0.36, 0.04, -0.02);
  visual.add(leftWingPivot);

  const leftWingInner = box(1.15, 0.16, 0.64);
  leftWingInner.position.x = -0.56;
  leftWingPivot.add(leftWingInner);

  const leftWingOuter = box(0.95, 0.13, 0.48);
  leftWingOuter.position.x = -1.5;
  leftWingOuter.rotation.z = -0.12;
  leftWingPivot.add(leftWingOuter);

  const rightWingPivot = new THREE.Group();
  rightWingPivot.position.set(0.36, 0.04, -0.02);
  visual.add(rightWingPivot);

  const rightWingInner = box(1.15, 0.16, 0.64);
  rightWingInner.position.x = 0.56;
  rightWingPivot.add(rightWingInner);

  const rightWingOuter = box(0.95, 0.13, 0.48);
  rightWingOuter.position.x = 1.5;
  rightWingOuter.rotation.z = 0.12;
  rightWingPivot.add(rightWingOuter);

  root.userData.leftWingPivot = leftWingPivot;
  root.userData.rightWingPivot = rightWingPivot;

  return root;
}

function createCloudTexture() {
  const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="92" height="28" id="Layer_1" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 92 28">
  <!-- Generator: Adobe Illustrator 30.1.0, SVG Export Plug-In . SVG Version: 2.1.1 Build 136)  -->
  <defs>
    <style>
      .st0 {
        fill: #dadada;
      }
    </style>
  </defs>
  <g id="_x23_dadadaff">
    <path class="st0" d="M50,0h8v2h4v3h2v4h6v2h10v4h6v4h4v4h-2v-2h-4v-4h-6v-4h-10v-2h-4v1.98c-.52.03-1.55.08-2.07.11.02-1.53.06-4.57.08-6.09h-2.01v-3h-4v-2h-4v2h-10v2h-2v2h-4v6h-6v2h-2v2h-14v2h-2v5h-4v-2h2v-5h2v-2h14v-2h2v-2h6v-6h4v-2h2v-2h10V0Z"/>
    <path class="st0" d="M60.1,13.1c.46,0,1.37-.01,1.83-.01-.01.45-.02,1.36-.03,1.81h-1.8v-1.8Z"/>
    <path class="st0" d="M2,23h4v2h-2v2H0v-2h2v-2Z"/>
    <path class="st0" d="M18.1,23.1h1.8c0,.46.01,1.37.01,1.83-.45-.01-1.36-.02-1.81-.03v-1.8Z"/>
    <path class="st0" d="M90,23h2v4c-23.99,0-47.99-.01-71.98.01-.03-.52-.08-1.56-.11-2.08,23.36.19,46.73,0,70.09.07v-2Z"/>
  </g>
</svg>`;

  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const canvas = document.createElement('canvas');
  canvas.width = 920;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8; // Reduce distant flickering

  const img = new Image();
  img.onload = () => {
    // Render native size to enforce strict pixel grid
    const tinyCanvas = document.createElement('canvas');
    tinyCanvas.width = 92;
    tinyCanvas.height = 28;
    const tinyCtx = tinyCanvas.getContext('2d');
    tinyCtx.drawImage(img, 0, 0);

    // Threshold alpha to strip SVG anti-aliasing blur
    const imgData = tinyCtx.getImageData(0, 0, 92, 28);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i+3] = data[i+3] > 128 ? 255 : 0;
    }
    tinyCtx.putImageData(imgData, 0, 0);

    // Scale up 10x with nearest neighbor for sharp high-res texture
    ctx.drawImage(tinyCanvas, 0, 0, 92, 28, 0, 0, 920, 280);
    texture.needsUpdate = true;
  };
  img.src = url;

  return texture;
}

const cloudTexture = createCloudTexture();
const colDayCloud = new THREE.Color(0xc8c8c8);
const colNightCloud = new THREE.Color(0x4f4f4f);

const cloudMaterial = new THREE.MeshBasicMaterial({
  map: cloudTexture,
  color: colDayCloud,
  transparent: true,
  fog: true,
  depthWrite: false,
  opacity: 0
});

const clouds = [];

function buildClouds() {
  for (const cloud of clouds) {
    scene.remove(cloud);
  }
  clouds.length = 0;

  const cloudGeo = new THREE.PlaneGeometry(1, 1);

  const numClouds = 12;
  const cloudSpacing = 160 / numClouds;
  for (let i = 0; i < numClouds; i++) {
    const cloud = new THREE.Mesh(cloudGeo, cloudMaterial);
    const scale = THREE.MathUtils.randFloat(2, 4);
    cloud.scale.set(scale * 4.18, scale, 1);

    const z = -120 + (i * cloudSpacing);
    const x = (i % 2 === 0) ? THREE.MathUtils.randFloat(-80, -10) : THREE.MathUtils.randFloat(10, 80);

    cloud.position.set(
      x,
      THREE.MathUtils.randFloat(18, 38),
      z
    );

    cloud.userData.speedMultiplier = 0.05;

    scene.add(cloud);
    clouds.push(cloud);
  }
}

const desertRockColorsDay = [
  new THREE.Color(0xa65b38), // Terracotta
  new THREE.Color(0xc48d53), // Sandstone
  new THREE.Color(0x7c583f), // Earth Brown
  new THREE.Color(0x8c6d58), // Slate Brown
  new THREE.Color(0x593e2b), // Dark Umber
  new THREE.Color(0xd29d66)  // Warm Sandstone
];

const desertRockColorsNight = [
  new THREE.Color(0x172338), // Moonlit Slate
  new THREE.Color(0x23344d), // Indigo Sandstone
  new THREE.Color(0x2d2138), // Moonlit Terracotta
  new THREE.Color(0x192a3d), // Deep Obsidian
  new THREE.Color(0x24354c), // Moonlit Granite
  new THREE.Color(0x172233)  // Dark Midnight Stone
];

const desertRockMaterials = desertRockColorsDay.map((dayCol) => {
  return new THREE.MeshStandardMaterial({
    color: dayCol.clone(),
    roughness: 0.9
  });
});

const pebbles = [];
const pebbleGeometry = new THREE.BoxGeometry(0.13, 0.055, 0.26);

for (let i = 0; i < 180; i++) {
  const pebble = new THREE.Mesh(pebbleGeometry, materials.pebble);
  pebble.userData.rockIndex = i % desertRockMaterials.length;
  const size = THREE.MathUtils.randFloat(0.45, 1.6);
  pebble.scale.set(size, 1, size);
  pebble.position.set(
    THREE.MathUtils.randFloat(-34, 34),
    0.03,
    THREE.MathUtils.randFloat(-145, 16)
  );
  pebble.rotation.y = Math.random() * Math.PI;
  pebble.receiveShadow = true;

  const trailMaterial = new THREE.MeshStandardMaterial({
    color: 0x8f8f8f,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });

  const trail = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.018, 1.35),
    trailMaterial
  );
  trail.position.set(0, 0.005, -0.72);
  trail.castShadow = false;
  trail.receiveShadow = false;
  pebble.add(trail);
  pebble.userData.motionTrail = trail;
  pebble.userData.motionTrailMaterial = trailMaterial;

  scene.add(pebble);
  pebbles.push(pebble);
}

const creditTextMaterial = new THREE.MeshStandardMaterial({
  color: 0x2b180d,
  roughness: 0.35,
  metalness: 0.15
});

const backgroundTexts = [];
let loadedFont = null;
const fontLoader = new FontLoader();
fontLoader.load(helvetikerFontUrl, (font) => {
  loadedFont = font;

  const createText = (text, size) => {
    const geo = new TextGeometry(text, { font, size, depth: 0.2, curveSegments: 3, bevelEnabled: false });
    geo.computeBoundingBox();
    geo.translate(-(geo.boundingBox.max.x - geo.boundingBox.min.x) / 2, 0, 0);
    const mat = (typeof fullColorMode !== "undefined" && fullColorMode) ? creditTextMaterial : materials.pebble;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const creditsGroup = new THREE.Group();

  const madeWith = createText("Made with <3 by", 1.5);
  madeWith.position.set(-1.5, 0, 18);
  madeWith.rotation.y = -0.3;
  creditsGroup.add(madeWith);

  const nameText = createText("Subhojit Karmakar", 2.8);
  nameText.position.set(1.5, 0, -2);
  nameText.rotation.y = 0.15;
  creditsGroup.add(nameText);

  creditsGroup.position.set(
    (Math.random() < 0.5 ? -1 : 1) * THREE.MathUtils.randFloat(45, 70),
    0.2,
    THREE.MathUtils.randFloat(-800, -500)
  );
  creditsGroup.userData = { kind: "credits" };
  scene.add(creditsGroup);
  backgroundTexts.push(creditsGroup);

  const essJayKayGroup = new THREE.Group();
  const linkText = createText("EssJayKay.dev", 2.0);
  linkText.position.set(0, 0, 0);
  linkText.rotation.y = 0.2;
  essJayKayGroup.add(linkText);

  essJayKayGroup.position.set(
    (Math.random() < 0.5 ? -1 : 1) * THREE.MathUtils.randFloat(45, 70),
    0.2,
    THREE.MathUtils.randFloat(-1300, -900)
  );
  essJayKayGroup.userData = { kind: "link" };
  scene.add(essJayKayGroup);
  backgroundTexts.push(essJayKayGroup);

  const assetCreditsGroup = new THREE.Group();
  const assetCredits = createText("3D Dino models by sketchfab.com/MayMax", 1.0);
  assetCredits.position.set(1, 0, 15);
  assetCredits.rotation.y = -0.15;
  assetCreditsGroup.add(assetCredits);

  const cloudCredits = createText("Cloud by Wikimedia Commons", 1.0);
  cloudCredits.position.set(-1, 0, -15);
  cloudCredits.rotation.y = 0.1;
  assetCreditsGroup.add(cloudCredits);

  assetCreditsGroup.position.set(
    (Math.random() < 0.5 ? -1 : 1) * THREE.MathUtils.randFloat(45, 70),
    0.2,
    THREE.MathUtils.randFloat(-1700, -1300)
  );
  assetCreditsGroup.userData = { kind: "assets" };
  scene.add(assetCreditsGroup);
  backgroundTexts.push(assetCreditsGroup);
});

const backgroundRocks = [];

for (let i = 0; i < 34; i++) {
  const rock = box(
    THREE.MathUtils.randFloat(0.35, 1.2),
    THREE.MathUtils.randFloat(0.16, 0.45),
    THREE.MathUtils.randFloat(0.35, 1.1),
    materials.pebble
  );
  rock.userData.rockIndex = (i + 3) % desertRockMaterials.length;

  const side = Math.random() < 0.5 ? -1 : 1;
  rock.position.set(
    side * THREE.MathUtils.randFloat(12, 42),
    rock.geometry.parameters.height / 2,
    THREE.MathUtils.randFloat(-145, 8)
  );
  rock.rotation.y = Math.random() * Math.PI;
  scene.add(rock);
  backgroundRocks.push(rock);
}

const obstacleCount = 11;
let obstacles = [];
let firstBirdForced = false;

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function createContactShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(
    76,
    48,
    5,
    96,
    48,
    82
  );

  gradient.addColorStop(0, "rgba(35, 35, 35, 0.52)");
  gradient.addColorStop(0.42, "rgba(55, 55, 55, 0.24)");
  gradient.addColorStop(1, "rgba(70, 70, 70, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

const contactShadowTexture = createContactShadowTexture();

function attachContactShadow(obstacle) {
  const isBird = obstacle.userData.kind === "bird";
  const scale = obstacle.userData.scaleFactor || 1;
  const width = isBird ? 3.7 : 3.1 * scale;
  const depth = isBird ? 1.25 : 1.2 * scale;

  const material = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    opacity: isBird ? 0.1 : 0.2,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    toneMapped: false
  });

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    material
  );

  shadow.rotation.x = -Math.PI / 2;
  shadow.rotation.z = -0.23;
  shadow.position.set(
    obstacle.position.x - (isBird ? 0 : 0.48 * scale),
    0.024,
    obstacle.position.z + 0.28
  );
  shadow.renderOrder = 2;
  shadow.frustumCulled = false;
  scene.add(shadow);

  obstacle.userData.contactShadow = shadow;
}

function removeContactShadow(obstacle) {
  const shadow = obstacle && obstacle.userData.contactShadow;
  if (!shadow) return;

  scene.remove(shadow);
  shadow.geometry.dispose();
  shadow.material.dispose();
  obstacle.userData.contactShadow = null;
}

function updateContactShadow(obstacle) {
  const shadow = obstacle.userData.contactShadow;
  if (!shadow) return;

  const isBird = obstacle.userData.kind === "bird";
  const scale = obstacle.userData.scaleFactor || 1;

  shadow.position.x =
    obstacle.position.x - (isBird ? 0 : 0.48 * scale);
  shadow.position.z = obstacle.position.z + 0.28;
  shadow.position.y = 0.024;

  let fadeVal = 1;
  if (gamePhase === "idle") fadeVal = 0;
  else if (gamePhase === "transition") fadeVal = easeInOutCubic(transitionProgress);

  if (isBird) {
    const altitudeFactor = THREE.MathUtils.clamp(
      1 - obstacle.position.y / 4.1,
      0.26,
      0.78
    );
    shadow.material.opacity = 0.13 * altitudeFactor * fadeVal;
    shadow.scale.setScalar(
      THREE.MathUtils.lerp(0.8, 1.16, altitudeFactor)
    );
  } else {
    shadow.material.opacity = 0.2 * fadeVal;
    shadow.scale.set(1, 1, 1);
  }

  shadow.visible = obstacle.visible && fadeVal > 0;
}

function createBlurGhost(source, baseOpacity) {
  const ghost = source.clone(true);

  ghost.traverse((child) => {
    if (!child.isMesh) return;

    const sourceColor =
      child.material && child.material.color
        ? child.material.color
        : new THREE.Color(0x4a4a4a);

    const blurMaterial = new THREE.MeshStandardMaterial({
      color: sourceColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true
    });

    child.userData.sourceMaterial = child.material;
    child.material = blurMaterial;
    child.castShadow = false;
    child.receiveShadow = false;
  });

  ghost.visible = false;
  ghost.userData.baseOpacity = baseOpacity;
  scene.add(ghost);
  return ghost;
}

function attachObstacleBlur(obstacle) {
  if (obstacle.userData.kind !== "cactus") {
    obstacle.userData.blurGhosts = [];
    return;
  }

  obstacle.userData.blurGhosts = [
    createBlurGhost(obstacle, 0.055),
    createBlurGhost(obstacle, 0.025)
  ];
}

function removeObstacleBlur(obstacle) {
  if (!obstacle || !obstacle.userData.blurGhosts) return;

  for (const ghost of obstacle.userData.blurGhosts) {
    scene.remove(ghost);
    ghost.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.dispose();
      }
    });
  }

  obstacle.userData.blurGhosts = [];
}

function updateObstacleBlur(obstacle) {
  const ghosts = obstacle.userData.blurGhosts || [];
  if (ghosts.length === 0) return;

  const proximity = THREE.MathUtils.smoothstep(obstacle.position.z, -13, 13);
  const speedFactor = THREE.MathUtils.clamp(
    (worldSpeed - 10) / 19,
    0,
    1
  );
  const visible = gamePhase !== "idle" && !paused && gamePhase !== "gameover" && proximity > 0.02;

  ghosts.forEach((ghost, index) => {
    ghost.visible = visible;
    if (!visible) return;

    ghost.position.copy(obstacle.position);
    ghost.rotation.copy(obstacle.rotation);
    ghost.scale.copy(obstacle.scale);

    const trailDistance =
      (index === 0 ? 0.28 : 0.68) *
      THREE.MathUtils.lerp(0.7, 1.45, speedFactor) *
      proximity;

    ghost.position.z -= trailDistance;
    ghost.scale.z *= index === 0 ? 1.035 : 1.075;

    const opacity =
      ghost.userData.baseOpacity *
      proximity *
      THREE.MathUtils.lerp(0.45, 1, speedFactor);

    ghost.traverse((child) => {
      if (child.isMesh && child.material && child.userData.sourceMaterial) {
        child.material.color.copy(child.userData.sourceMaterial.color);
        child.material.opacity = opacity;
      }
    });
  });
}

const laneCenters = [-3.7, -1.85, 0, 1.85, 3.7];

function randomLane() {
  return laneCenters[Math.floor(Math.random() * laneCenters.length)] +
    THREE.MathUtils.randFloat(-0.12, 0.12);
}

function chooseSafeLane(z, ignoredObstacle = null) {
  const candidates = [...laneCenters].sort(() => Math.random() - 0.5);

  for (const lane of candidates) {
    const blocked = obstacles.some((other) => {
      if (!other || other === ignoredObstacle) return false;
      const closeInDepth = Math.abs(other.position.z - z) < 18;
      const requiredClearance =
        other.userData.kind === "bird" ? 2.4 : 1.45;
      const closeInLane =
        Math.abs(other.position.x - lane) < requiredClearance;
      return closeInDepth && closeInLane;
    });

    if (!blocked) {
      return lane + THREE.MathUtils.randFloat(-0.08, 0.08);
    }
  }

  return randomLane();
}

function getBirdSafeLane(bird) {
  const nearbyCacti = obstacles.filter((other) => {
    if (!other || other === bird || other.userData.kind !== "cactus") {
      return false;
    }

    const depthDifference = other.position.z - bird.position.z;
    return depthDifference > -3 && depthDifference < 23;
  });

  const candidates = [...laneCenters].sort((a, b) => {
    return Math.abs(a - bird.position.x) - Math.abs(b - bird.position.x);
  });

  for (const lane of candidates) {
    const clear = nearbyCacti.every((cactus) => {
      return Math.abs(cactus.position.x - lane) > 3.05;
    });

    if (clear) {
      return lane;
    }
  }

  return candidates.reduce((bestLane, lane) => {
    const laneClearance = nearbyCacti.reduce(
      (minimum, cactus) =>
        Math.min(minimum, Math.abs(cactus.position.x - lane)),
      Infinity
    );
    const bestClearance = nearbyCacti.reduce(
      (minimum, cactus) =>
        Math.min(minimum, Math.abs(cactus.position.x - bestLane)),
      Infinity
    );

    return laneClearance > bestClearance ? lane : bestLane;
  }, candidates[0]);
}

function updateBirdNavigation(bird, delta) {
  const nearbyBlockingCactus = obstacles.some((other) => {
    if (!other || other === bird || other.userData.kind !== "cactus") {
      return false;
    }

    const depthDifference = other.position.z - bird.position.z;
    const sameFlightCorridor =
      Math.abs(other.position.x - bird.userData.targetX) < 3.05;

    return depthDifference > -3 &&
      depthDifference < 23 &&
      sameFlightCorridor;
  });

  if (
    nearbyBlockingCactus ||
    Math.abs(bird.position.x - bird.userData.targetX) < 0.08
  ) {
    bird.userData.targetX = getBirdSafeLane(bird);
  }

  const previousX = bird.position.x;
  const steeringRate = 4.2;

  bird.position.x = THREE.MathUtils.damp(
    bird.position.x,
    bird.userData.targetX,
    steeringRate,
    delta
  );

  bird.userData.steeringVelocity =
    (bird.position.x - previousX) / Math.max(delta, 0.001);

  const subtleSway =
    Math.sin(elapsed * 2.5 + bird.userData.swayOffset) * 0.045;

  bird.position.x += subtleSway * delta * 4;

  const bankingTarget = THREE.MathUtils.clamp(
    -bird.userData.steeringVelocity * 0.075,
    -0.34,
    0.34
  );

  bird.rotation.z = THREE.MathUtils.damp(
    bird.rotation.z,
    bankingTarget,
    7,
    delta
  );
}

function createGroundObstacle() {
  return createVoxelCactus(
    THREE.MathUtils.randFloat(0.76, 1.08),
    Math.floor(Math.random() * 3)
  );
}

function createBirdObstacle() {
  const bird = createPterodactyl();
  return bird;
}

function chooseObstacleType(forceBird = false) {
  if (forceBird) return createBirdObstacle();

  if (score >= WORLD.birdUnlockScore) {
    if (Math.random() < 0.3) return createBirdObstacle();
  }

  return createGroundObstacle();
}

function setBirdFlightProfile(bird) {
  const profiles = [
    {
      mode: "low",
      y: 0.92,
      size: new THREE.Vector3(1.28, 0.7, 1.08),
      offset: new THREE.Vector3(0, 0.0, 0)
    },
    {
      mode: "high",
      y: 2.18,
      size: new THREE.Vector3(1.35, 0.72, 1.14),
      offset: new THREE.Vector3(0, 0.04, 0)
    }
  ];

  const profile = profiles[Math.floor(Math.random() * profiles.length)];
  bird.userData.flightMode = profile.mode;
  bird.userData.baseY = profile.y;
  bird.position.y = profile.y;
  bird.userData.hitbox.size.copy(profile.size);
  bird.userData.hitbox.offset.copy(profile.offset);
}

function placeObstacle(obstacle, z) {
  const laneX = chooseSafeLane(z, obstacle);
  obstacle.position.x = laneX;
  obstacle.position.z = z;
  obstacle.userData.passed = false;

  if (obstacle.userData.kind === "bird") {
    obstacle.rotation.set(0, 0, 0);
    obstacle.userData.baseX = laneX;
    obstacle.userData.speedMultiplier = THREE.MathUtils.randFloat(1.24, 1.32);
    obstacle.userData.targetX = laneX;
    obstacle.userData.steeringVelocity = 0;
    setBirdFlightProfile(obstacle);
    obstacle.userData.targetX = getBirdSafeLane(obstacle);
  } else {
    obstacle.position.y = 0;
    obstacle.rotation.set(0, Math.random() < 0.5 ? 0 : Math.PI, 0);
  }
}

function replaceObstacleAt(index, newObstacle, z) {
  if (obstacles[index]) {
    removeObstacleBlur(obstacles[index]);
    removeContactShadow(obstacles[index]);
    scene.remove(obstacles[index]);
  }

  obstacles[index] = newObstacle;
  placeObstacle(newObstacle, z);
  scene.add(newObstacle);
  attachObstacleBlur(newObstacle);
  attachContactShadow(newObstacle);
}

function buildObstacleField() {
  obstacles.forEach((obstacle) => {
    removeObstacleBlur(obstacle);
    removeContactShadow(obstacle);
    scene.remove(obstacle);
  });

  obstacles = [];
  let z = -28;

  for (let i = 0; i < obstacleCount; i++) {
    const obstacle = createGroundObstacle();
    placeObstacle(obstacle, z);
    scene.add(obstacle);
    attachObstacleBlur(obstacle);
    attachContactShadow(obstacle);
    obstacles.push(obstacle);
    z -= THREE.MathUtils.randFloat(15, 19);
  }
}

const keys = {
  left: false,
  right: false,
  duck: false
};

let gamePhase = "idle";
let transitionProgress = 0;

let elapsed = 0;
let score = 0;
let highScore = parseInt(localStorage.getItem("dinoHighScore")) || 0;
let paused = false;
let infoOpen = false;

let worldSpeed = WORLD.baseSpeed;
let jumpVelocity = 0;
let grounded = true;
let ducking = false;
let runPhase = 0;
let cameraShake = 0;

const clock = new THREE.Clock();
const dinoBox = new THREE.Box3();
const tempObstacleBox = new THREE.Box3();
const dinoBoxCenter = new THREE.Vector3();
const dinoBoxSize = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const obstacleCenter = new THREE.Vector3();

const INTRO_CAM_POS = new THREE.Vector3(19.0, 2.0, WORLD.dinoZ);
const INTRO_CAM_TARGET = new THREE.Vector3(0, 1.4, WORLD.dinoZ);

let debugMode = false;
let godMode = false;
let debugSpeedMultiplier = 1.0;
let debugShowHitboxes = false;
let debugAutoPausedGame = false;
let debugWasPausedBefore = false;
let orbitControls = null;
const savedCamState = { position: new THREE.Vector3(), target: new THREE.Vector3() };

const debugHitboxGroup = new THREE.Group();
scene.add(debugHitboxGroup);

// Debug indicator bottom badge
const debugUI = document.createElement('div');
debugUI.id = 'debug-indicator';
function updateDebugUI() {
  debugUI.textContent = `🔍 DEBUG MODE — drag to orbit, scroll to zoom, \` to exit | Speed: ${debugSpeedMultiplier.toFixed(1)}x | God: ${godMode ? 'ON' : 'OFF'}`;
}
updateDebugUI();
debugUI.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99;background:rgba(0,0,0,0.75);color:#fff;font:12px/1.4 monospace;padding:8px 16px;border-radius:6px;pointer-events:none;display:none';
document.body.appendChild(debugUI);

// Floating Debug Control Panel
const debugPanel = document.createElement('div');
debugPanel.id = 'debug-panel';
debugPanel.style.cssText = 'position:fixed;top:15px;left:15px;z-index:9999;background:var(--paper-trans);border:2px solid var(--ink);color:var(--ink);font-family:var(--pixel-font);font-size:9px;padding:14px;box-shadow:8px 8px 0 rgba(52,52,52,0.15);pointer-events:auto;width:320px;max-height:85vh;overflow-y:auto;user-select:none;display:none;text-transform:uppercase;';
debugPanel.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:2px solid var(--ink);padding-bottom:12px;">
    <span style="font-size:12px;">DEBUG CONSOLE</span>
    <span style="font-size:8px;color:var(--mid);">\` TO EXIT</span>
  </div>

  <style>
    .dbg-section { margin-bottom:16px; background:var(--paper); padding:12px; border:2px solid var(--ink); }
    .dbg-title { font-weight:bold; margin-bottom:12px; color:var(--mid); font-size:10px; }
    .dbg-btn { flex:1; background:var(--paper); border:2px solid var(--ink); color:var(--ink); padding:6px; font-family:var(--pixel-font); font-size:8px; cursor:pointer; box-shadow:3px 3px 0 var(--shadow-solid); margin:2px; }
    .dbg-btn:active { transform:translate(2px, 2px); box-shadow:1px 1px 0 var(--shadow-solid); }
    .dbg-row { display:flex; justify-content:space-between; margin-bottom:6px; }
    .dbg-val { color:var(--ink); font-weight:bold; }
    .dbg-toggle { display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding:8px 0; border-bottom:1px dashed var(--line); }
    .dbg-toggle:last-child { border-bottom:none; }
  </style>

  <!-- Speed Control -->
  <div class="dbg-section">
    <div class="dbg-row"><span>GAME SPEED:</span><span id="debug-speed-val" class="dbg-val">1.0X</span></div>
    <input type="range" id="debug-speed-slider" min="0" max="5" step="0.1" value="1.0" style="width:100%;cursor:pointer;margin-bottom:10px;">
    <div style="display:flex;flex-wrap:wrap;gap:4px;">
      <button class="dbg-btn dbg-speed-btn" data-speed="0">PAUSE</button>
      <button class="dbg-btn dbg-speed-btn" data-speed="0.25">0.25X</button>
      <button class="dbg-btn dbg-speed-btn" data-speed="0.5">0.5X</button>
      <button class="dbg-btn dbg-speed-btn" data-speed="1.0">1.0X</button>
      <button class="dbg-btn dbg-speed-btn" data-speed="2.0">2.0X</button>
      <button class="dbg-btn dbg-speed-btn" data-speed="5.0">5.0X</button>
    </div>
  </div>

  <!-- Toggles -->
  <div class="dbg-section">
    <label class="dbg-toggle"><span>FULL COLOR MODE</span><input type="checkbox" id="debug-color-check" style="cursor:pointer;"></label>
    <label class="dbg-toggle"><span>SHOW TELEMETRY</span><input type="checkbox" id="debug-telemetry-check" style="cursor:pointer;"></label>
    <label class="dbg-toggle"><span>GOD MODE (G)</span><input type="checkbox" id="debug-god-check" style="cursor:pointer;"></label>
    <label class="dbg-toggle"><span>SHOW HITBOXES</span><input type="checkbox" id="debug-hitbox-check" style="cursor:pointer;"></label>
    <label class="dbg-toggle"><span>WIREFRAME</span><input type="checkbox" id="debug-wireframe-check" style="cursor:pointer;"></label>
    <label class="dbg-toggle"><span>FOG ENABLED</span><input type="checkbox" id="debug-fog-check" checked style="cursor:pointer;"></label>
    <label class="dbg-toggle"><span>SHOW DINO PATH</span><input type="checkbox" id="debug-path-check" style="cursor:pointer;"></label>
    <div style="padding-top:10px;">
      <div class="dbg-row"><span>FOG DENSITY:</span><span id="debug-fog-val" class="dbg-val">1.0</span></div>
      <input type="range" id="debug-fog-slider" min="0.1" max="5.0" step="0.1" value="1.0" style="width:100%;cursor:pointer;">
    </div>
  </div>

  <!-- Physics Tuning -->
  <div class="dbg-section">
    <div class="dbg-title">PHYSICS TUNING</div>
    <div style="margin-bottom:10px;">
      <div class="dbg-row"><span>GRAVITY:</span><span id="debug-grav-val" class="dbg-val">45</span></div>
      <input type="range" id="debug-grav-slider" min="10" max="90" step="1" value="45" style="width:100%;cursor:pointer;">
    </div>
    <div style="margin-bottom:12px;">
      <div class="dbg-row"><span>JUMP FORCE:</span><span id="debug-jump-val" class="dbg-val">17.8</span></div>
      <input type="range" id="debug-jump-slider" min="5" max="35" step="0.5" value="17.8" style="width:100%;cursor:pointer;">
    </div>
  </div>

  <div class="dbg-section">
    <button id="debug-reset-all" class="dbg-btn" style="width:100%; padding:10px; font-weight:bold;">RESET ALL SETTINGS</button>
  </div>

  <!-- Day / Night Override -->
  <div class="dbg-section">
    <div class="dbg-title">DAY / NIGHT CYCLE</div>
    <div style="display:flex;">
      <button id="debug-tod-auto" class="dbg-btn" style="background:var(--ink);color:var(--paper);">AUTO</button>
      <button id="debug-tod-day" class="dbg-btn">DAY</button>
      <button id="debug-tod-night" class="dbg-btn">NIGHT</button>
    </div>
  </div>

  <!-- Score Jumping -->
  <div class="dbg-section">
    <div class="dbg-title">ADD SCORE</div>
    <div style="display:flex;">
      <button id="debug-score-500" class="dbg-btn">+500</button>
      <button id="debug-score-1000" class="dbg-btn">+1000</button>
    </div>
  </div>

  <!-- Spawner -->
  <div class="dbg-section">
    <div class="dbg-title">SPAWN OBSTACLE</div>
    <div style="display:flex;">
      <button id="debug-spawn-cactus" class="dbg-btn">CACTUS</button>
      <button id="debug-spawn-bird-low" class="dbg-btn">LOW BIRD</button>
      <button id="debug-spawn-bird-high" class="dbg-btn">HI BIRD</button>
    </div>
  </div>

  <!-- Camera Perspectives -->
  <div class="dbg-section">
    <div class="dbg-title">CAMERA MODE</div>
    <div style="display:flex;">
      <button class="dbg-btn dbg-cam-btn" data-mode="default" id="debug-cam-def" style="background:var(--ink);color:var(--paper);">DEF</button>
      <button class="dbg-btn dbg-cam-btn" data-mode="fps" id="debug-cam-fps">FPS</button>
      <button class="dbg-btn dbg-cam-btn" data-mode="tps" id="debug-cam-tps">TPS</button>
    </div>
  </div>

  <!-- Dino Scale Slider -->
  <div class="dbg-section">
    <div class="dbg-row"><span class="dbg-title">DINO SCALE</span><span id="debug-scale-val" class="dbg-val">1.0</span></div>
    <input type="range" id="debug-scale-slider" min="0.5" max="3.0" step="0.1" value="1.0" style="width:100%;cursor:pointer;">
  </div>
`;
document.body.appendChild(debugPanel);

const telemetryPanel = document.createElement('div');
telemetryPanel.id = 'telemetry-panel';
telemetryPanel.style.cssText = 'position:absolute;top:65px;right:28px;font-family:var(--pixel-font);font-size:10px;color:var(--ink);z-index:100;letter-spacing:1px;display:none;line-height:2.0;pointer-events:none;background:var(--paper-trans);padding:12px;border:2px solid var(--ink);box-shadow:6px 6px 0 rgba(52,52,52,0.11);text-align:right;';
telemetryPanel.innerHTML = `
  <div>SPEED: <span id="tel-speed">0.0</span> M/S</div>
  <div>NEXT OBS: <span id="tel-obs">---</span></div>
  <div>PHASE: <span id="tel-phase">IDLE</span></div>
`;
document.body.appendChild(telemetryPanel);

// Prevent orbit camera dragging when clicking/dragging inside debug panel
debugPanel.addEventListener('mousedown', e => e.stopPropagation());
debugPanel.addEventListener('touchstart', e => e.stopPropagation());

// Speed Slider & Buttons
const debugSpeedSlider = document.getElementById('debug-speed-slider');
const debugSpeedVal = document.getElementById('debug-speed-val');
debugSpeedSlider.addEventListener('input', (e) => {
  debugSpeedMultiplier = parseFloat(e.target.value);
  debugSpeedVal.textContent = debugSpeedMultiplier.toFixed(1) + 'x';
  updateDebugUI();
});

document.querySelectorAll('.dbg-speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const spd = parseFloat(btn.dataset.speed);
    debugSpeedMultiplier = spd;
    debugSpeedSlider.value = spd;
    debugSpeedVal.textContent = spd.toFixed(1) + 'x';
    updateDebugUI();
  });
});

// Telemetry Checkbox
let showTelemetry = false;
document.getElementById('debug-telemetry-check').addEventListener('change', (e) => {
  showTelemetry = e.target.checked;
  telemetryPanel.style.display = showTelemetry ? 'block' : 'none';
});

// Color Mode Checkbox
let fullColorMode = false;
const debugColorCheck = document.getElementById('debug-color-check');
debugColorCheck.addEventListener('change', (e) => {
  fullColorMode = e.target.checked;
  updateDayNightCycle(0);
});

// God Mode Checkbox
const debugGodCheck = document.getElementById('debug-god-check');
debugGodCheck.addEventListener('change', (e) => {
  godMode = e.target.checked;
  updateDebugUI();
});

// Hitbox Checkbox
const debugHitboxCheck = document.getElementById('debug-hitbox-check');
debugHitboxCheck.addEventListener('change', (e) => {
  debugShowHitboxes = e.target.checked;
  if (!debugShowHitboxes) debugHitboxGroup.clear();
});

// Path Checkbox
let debugShowPath = false;
const debugPathCheck = document.getElementById('debug-path-check');
debugPathCheck.addEventListener('change', (e) => {
  debugShowPath = e.target.checked;
  pathGroup.visible = debugShowPath;
});

// Physics Tuning
const debugGravSlider = document.getElementById('debug-grav-slider');
const debugGravVal = document.getElementById('debug-grav-val');
debugGravSlider.addEventListener('input', (e) => {
  WORLD.gravity = parseFloat(e.target.value);
  debugGravVal.textContent = WORLD.gravity;
});

const debugJumpSlider = document.getElementById('debug-jump-slider');
const debugJumpVal = document.getElementById('debug-jump-val');
debugJumpSlider.addEventListener('input', (e) => {
  WORLD.jumpVelocity = parseFloat(e.target.value);
  debugJumpVal.textContent = WORLD.jumpVelocity.toFixed(1);
});

document.getElementById('debug-reset-all').addEventListener('click', () => {
  WORLD.gravity = 45;
  WORLD.jumpVelocity = 17.8;
  debugGravSlider.value = 45;
  debugGravVal.textContent = '45';
  debugJumpSlider.value = 17.8;
  debugJumpVal.textContent = '17.8';

  godMode = false;
  debugGodCheck.checked = false;

  showTelemetry = false;
  document.getElementById('debug-telemetry-check').checked = false;
  telemetryPanel.style.display = 'none';

  fullColorMode = false;
  debugColorCheck.checked = false;
  updateDayNightCycle(0);

  debugShowHitboxes = false;
  debugHitboxCheck.checked = false;
  debugHitboxGroup.clear();

  debugShowPath = false;
  debugPathCheck.checked = false;
  pathGroup.visible = false;

  document.getElementById('debug-wireframe-check').checked = false;
  scene.traverse(child => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => { m.wireframe = false; });
    }
  });

  document.getElementById('debug-fog-check').checked = true;
  WORLD.fogDensity = 1.0;
  debugFogSlider.value = 1.0;
  debugFogVal.textContent = '1.0';
  scene.fog = new THREE.Fog(colDayBg, WORLD.fogNear / WORLD.fogDensity, WORLD.fogFar / WORLD.fogDensity);
  updateDayNightCycle(0);

  debugCameraMode = 'default';
  if (orbitControls) orbitControls.enabled = true;
  setButtonActive('debug-cam-def');

  debugDinoScale = 1.0;
  debugScaleSlider.value = 1.0;
  debugScaleVal.textContent = '1.0';
  dino.scale.set(1.0, 1.0, 1.0);

  debugTimeOverride = 'auto';
  setDayNightActive('debug-tod-auto');
});

// Wireframe Checkbox
document.getElementById('debug-wireframe-check').addEventListener('change', (e) => {
  const wire = e.target.checked;
  scene.traverse(child => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => { m.wireframe = wire; });
    }
  });
});

// Fog Checkbox & Slider
document.getElementById('debug-fog-check').addEventListener('change', (e) => {
  if (e.target.checked) {
    scene.fog = new THREE.Fog(colDayBg, WORLD.fogNear / WORLD.fogDensity, WORLD.fogFar / WORLD.fogDensity);
    updateDayNightCycle(0);
  } else {
    scene.fog = null;
  }
});
const debugFogSlider = document.getElementById('debug-fog-slider');
const debugFogVal = document.getElementById('debug-fog-val');
debugFogSlider.addEventListener('input', (e) => {
  WORLD.fogDensity = parseFloat(e.target.value);
  debugFogVal.textContent = WORLD.fogDensity.toFixed(1);
  if (document.getElementById('debug-fog-check').checked) {
    scene.fog = new THREE.Fog(colDayBg, WORLD.fogNear / WORLD.fogDensity, WORLD.fogFar / WORLD.fogDensity);
    updateDayNightCycle(0);
  }
});

// Score Jumping
document.getElementById('debug-score-500').addEventListener('click', () => { score += 500; });
document.getElementById('debug-score-1000').addEventListener('click', () => { score += 1000; });

// Obstacle Spawning
function debugSpawnObstacle(type) {
  let farthestObs = null;
  let farthestIndex = -1;
  let maxZ = -Infinity;
  for (let i = 0; i < obstacles.length; i++) {
    if (obstacles[i].position.z > maxZ) {
      maxZ = obstacles[i].position.z;
      farthestIndex = i;
      farthestObs = obstacles[i];
    }
  }

  if (farthestIndex !== -1) {
    let newObs;
    if (type === 'cactus') {
      newObs = createVoxelCactus(1, Math.floor(Math.random() * 3));
      newObs.userData.kind = "cactus";
      newObs.userData.hitbox = { size: new THREE.Vector3(1.2, 2.5, 1.2), offset: new THREE.Vector3(0, 1.25, 0) };
    } else if (type === 'bird-high' || type === 'bird-low') {
      newObs = createGLTFBird();
      newObs.userData.kind = "bird";
      newObs.userData.hitbox = { size: new THREE.Vector3(1.4, 0.8, 1.0), offset: new THREE.Vector3(0, 0, 0) };
      newObs.userData.speedMultiplier = 1.35;
      newObs.position.y = type === 'bird-high' ? 2.0 : 0.8;
    }

    if (newObs) {
      replaceObstacleAt(farthestIndex, newObs, dino.position.z - 40);
    }
  }
}
document.getElementById('debug-spawn-cactus').addEventListener('click', () => debugSpawnObstacle('cactus'));
document.getElementById('debug-spawn-bird-high').addEventListener('click', () => debugSpawnObstacle('bird-high'));
document.getElementById('debug-spawn-bird-low').addEventListener('click', () => debugSpawnObstacle('bird-low'));

let debugCameraMode = 'default';
function setButtonActive(id) {
  ['debug-cam-def', 'debug-cam-fps', 'debug-cam-tps'].forEach(bid => {
    const btn = document.getElementById(bid);
    if (!btn) return;
    if (bid === id) {
      btn.style.background = 'var(--ink)';
      btn.style.color = 'var(--paper)';
    } else {
      btn.style.background = 'var(--paper)';
      btn.style.color = 'var(--ink)';
    }
  });
}
document.querySelectorAll('.dbg-cam-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    debugCameraMode = btn.dataset.mode;
    if (orbitControls) {
      orbitControls.enabled = (debugCameraMode === 'default');
    }
    setButtonActive(btn.id);
  });
});

let debugDinoScale = 1.0;
const debugScaleSlider = document.getElementById('debug-scale-slider');
const debugScaleVal = document.getElementById('debug-scale-val');
debugScaleSlider.addEventListener('input', (e) => {
  debugDinoScale = parseFloat(e.target.value);
  debugScaleVal.textContent = debugDinoScale.toFixed(1);
  dino.scale.set(debugDinoScale, debugDinoScale, debugDinoScale);
});

let debugTimeOverride = 'auto';
function setDayNightActive(id) {
  ['debug-tod-auto', 'debug-tod-day', 'debug-tod-night'].forEach(bid => {
    const btn = document.getElementById(bid);
    if (!btn) return;
    if (bid === id) {
      btn.style.background = 'var(--ink)';
      btn.style.color = 'var(--paper)';
    } else {
      btn.style.background = 'var(--paper)';
      btn.style.color = 'var(--ink)';
    }
  });
}
document.getElementById('debug-tod-auto').addEventListener('click', () => {
  debugTimeOverride = 'auto';
  setDayNightActive('debug-tod-auto');
});
document.getElementById('debug-tod-day').addEventListener('click', () => {
  debugTimeOverride = 'day';
  nightPhase = 0;
  updateDayNightCycle(0);
  setDayNightActive('debug-tod-day');
});
document.getElementById('debug-tod-night').addEventListener('click', () => {
  debugTimeOverride = 'night';
  nightPhase = 1;
  updateDayNightCycle(0);
  setDayNightActive('debug-tod-night');
});

const eyeEditor = document.createElement('div');
eyeEditor.style.cssText = 'position:fixed;top:150px;right:28px;background:var(--paper-trans);border:2px solid var(--ink);color:var(--ink);padding:15px;font-family:var(--pixel-font);font-size:10px;z-index:999;display:none;pointer-events:auto;max-height:90vh;overflow-y:auto;box-shadow:8px 8px 0 rgba(52,52,52,0.15);text-transform:uppercase;';
eyeEditor.innerHTML = `
  <div style="margin-bottom:12px;font-weight:bold;text-align:center;color:var(--ink);border-bottom:2px dashed var(--ink);padding-bottom:8px;">RIGHT EYE</div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">X:</label>
    <input type="range" id="rEyeX" min="-1" max="1" step="0.01" style="margin:0 10px;">
    <span id="rValX" style="width:40px;text-align:right;font-weight:bold;"></span>
  </div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">Y:</label>
    <input type="range" id="rEyeY" min="0" max="4" step="0.01" style="margin:0 10px;">
    <span id="rValY" style="width:40px;text-align:right;font-weight:bold;"></span>
  </div>
  <div style="display:flex;align-items:center;margin-bottom:16px;">
    <label style="width:20px">Z:</label>
    <input type="range" id="rEyeZ" min="-2" max="1" step="0.01" style="margin:0 10px;">
    <span id="rValZ" style="width:40px;text-align:right;font-weight:bold;"></span>
  </div>

  <div style="margin-bottom:12px;font-weight:bold;text-align:center;color:var(--ink);border-bottom:2px dashed var(--ink);padding-bottom:8px;">LEFT EYE</div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">X:</label>
    <input type="range" id="lEyeX" min="-1" max="1" step="0.01" style="margin:0 10px;">
    <span id="lValX" style="width:40px;text-align:right;font-weight:bold;"></span>
  </div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">Y:</label>
    <input type="range" id="lEyeY" min="0" max="4" step="0.01" style="margin:0 10px;">
    <span id="lValY" style="width:40px;text-align:right;font-weight:bold;"></span>
  </div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">Z:</label>
    <input type="range" id="lEyeZ" min="-2" max="1" step="0.01" style="margin:0 10px;">
    <span id="lValZ" style="width:40px;text-align:right;font-weight:bold;"></span>
  </div>
  <div style="margin-top:10px;font-size:8px;color:var(--mid);text-align:center;">SEND ME X, Y, Z VALUES!</div>
`;
document.body.appendChild(eyeEditor);

['X', 'Y', 'Z'].forEach(axis => {
  document.getElementById('rEye' + axis).addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById('rVal' + axis).innerText = v.toFixed(2);
    if (dino && dino.userData.deadEyes) dino.userData.deadEyes.children[0].position[axis.toLowerCase()] = v;
  });
  document.getElementById('lEye' + axis).addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById('lVal' + axis).innerText = v.toFixed(2);
    if (dino && dino.userData.deadEyes) dino.userData.deadEyes.children[1].position[axis.toLowerCase()] = v;
  });
});

// Prevent orbit controls from jumping when interacting with slider
eyeEditor.addEventListener('mousedown', e => e.stopPropagation());
eyeEditor.addEventListener('touchstart', e => e.stopPropagation());

function updateEyeEditor() {
  if (debugMode && gamePhase === "gameover") {
    eyeEditor.style.display = 'block';
    if (dino && dino.userData.deadEyes) {
      const re = dino.userData.deadEyes.children[0].position;
      const le = dino.userData.deadEyes.children[1].position;

      document.getElementById('rEyeX').value = re.x; document.getElementById('rValX').innerText = re.x.toFixed(2);
      document.getElementById('rEyeY').value = re.y; document.getElementById('rValY').innerText = re.y.toFixed(2);
      document.getElementById('rEyeZ').value = re.z; document.getElementById('rValZ').innerText = re.z.toFixed(2);

      document.getElementById('lEyeX').value = le.x; document.getElementById('lValX').innerText = le.x.toFixed(2);
      document.getElementById('lEyeY').value = le.y; document.getElementById('lValY').innerText = le.y.toFixed(2);
      document.getElementById('lEyeZ').value = le.z; document.getElementById('lValZ').innerText = le.z.toFixed(2);
    }
  } else {
    eyeEditor.style.display = 'none';
  }
}

function updateHitboxHelpers() {
  debugHitboxGroup.clear();
  if (!debugShowHitboxes) return;

  // Render Dino Hitbox
  const centerY = dino.position.y + (ducking ? 0.54 * debugDinoScale : 1.82 * debugDinoScale);
  dinoBoxCenter.set(dino.position.x, centerY, dino.position.z - 0.14 * debugDinoScale);
  dinoBoxSize.set((ducking ? 1.08 : 0.98) * debugDinoScale, (ducking ? 0.88 : 3.05) * debugDinoScale, 1.22 * debugDinoScale);
  dinoBox.setFromCenterAndSize(dinoBoxCenter, dinoBoxSize);

  const dinoHelper = new THREE.Box3Helper(dinoBox, godMode ? 0x00ffff : 0x00ff00);
  debugHitboxGroup.add(dinoHelper);

  // Render Active Obstacle Hitboxes
  for (const obstacle of obstacles) {
    if (obstacle.position.z > dino.position.z - 60 && obstacle.position.z < dino.position.z + 20) {
      setObstacleBoxFromData(obstacle);
      const isColliding = dinoBox.intersectsBox(tempObstacleBox);
      const obsHelper = new THREE.Box3Helper(tempObstacleBox, isColliding ? 0xff0000 : 0xffa500);
      debugHitboxGroup.add(obsHelper);
    }
  }
}

function toggleDebug() {
  debugMode = !debugMode;

  if (debugMode) {
    savedCamState.position.copy(camera.position);
    savedCamState.target.copy(cameraTarget);
    debugWasPausedBefore = paused;
    debugAutoPausedGame = (!paused && gamePhase !== "idle");

    debugSpeedMultiplier = 0.0;
    debugSpeedSlider.value = 0.0;
    debugSpeedVal.textContent = '0.0x';

    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.target.copy(cameraTarget);
    orbitControls.update();
    debugUI.style.display = 'block';
    debugPanel.style.display = 'block';
    debugGodCheck.checked = godMode;
    debugColorCheck.checked = fullColorMode;
    debugHitboxCheck.checked = debugShowHitboxes;
    document.getElementById('leaderboardSidebar').style.display = 'none';
    document.getElementById('topLeftControls').style.display = 'none';
    document.getElementById('desktopControls').style.display = 'none';
    document.getElementById('mobileControls').style.display = 'none';
  } else {
    if (orbitControls) { orbitControls.dispose(); orbitControls = null; }
    camera.position.copy(savedCamState.position);
    cameraTarget.copy(savedCamState.target);
    camera.lookAt(cameraTarget);
    debugSpeedMultiplier = 1.0;
    debugSpeedSlider.value = 1.0;
    debugSpeedVal.textContent = '1.0X';
    debugUI.style.display = 'none';
    debugPanel.style.display = 'none';
    document.getElementById('leaderboardSidebar').style.display = '';
    document.getElementById('topLeftControls').style.display = '';
    document.getElementById('desktopControls').style.display = '';
    document.getElementById('mobileControls').style.display = '';

    if (debugAutoPausedGame && gamePhase !== "idle") {
      pauseGame(false);
    }
    debugAutoPausedGame = false;
  }
  updateEyeEditor();
}

let nightPhase = 0;
let targetNightPhase = 0;
let previousNightPhase = -1;

const colDayBg = new THREE.Color(0xf8f8f8);
const colNightBg = new THREE.Color(0x070707);

const inkDay = new THREE.Color(0x343434);
const inkNight = new THREE.Color(0xcbcbcb);
const shadowDay = new THREE.Color(0xbdbdbd);
const shadowNight = new THREE.Color(0x424242);
const btnActiveDay = new THREE.Color(0xe2e2e2);
const btnActiveNight = new THREE.Color(0x1d1d1d);

const midDay = new THREE.Color(0x767676);
const midNight = new THREE.Color(0xaeaeae);
const currentMid = new THREE.Color();

const overlayDay = new THREE.Color(0xf8f8f8);
const overlayNight = new THREE.Color(0x050505);

const colDayDino = new THREE.Color(0x3b3b3b);
const colNightDino = new THREE.Color(0xc4c4c4);

const colDayDinoLight = new THREE.Color(0x8a8a8a);
const colNightDinoLight = new THREE.Color(0x757575);

const colDayGround = new THREE.Color(0xf3f3f3);
const colNightGround = new THREE.Color(0x0c0c0c);

const colDayPebble = new THREE.Color(0x969696);
const colNightPebble = new THREE.Color(0x696969);

const colDayTrail = new THREE.Color(0x8f8f8f);
const colNightTrail = new THREE.Color(0x707070);
const currentTrailColor = new THREE.Color();

const currentInk = new THREE.Color();
const currentBtnActive = new THREE.Color();
const currentShadow = new THREE.Color();
const monochromeBgColor = new THREE.Color();

let skyCanvas = null;
let skyCtx = null;
let skyTexture = null;

function getSkyGradientTexture(topColor, bottomColor) {
  if (!skyCanvas) {
    skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 512;
    skyCtx = skyCanvas.getContext('2d');
    skyTexture = new THREE.CanvasTexture(skyCanvas);
    skyTexture.colorSpace = THREE.LinearSRGBColorSpace;
  }
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 512);
  const midColor = new THREE.Color().lerpColors(topColor, bottomColor, 0.35);
  gradient.addColorStop(0, topColor.getStyle());
  gradient.addColorStop(0.15, midColor.getStyle());
  gradient.addColorStop(0.35, bottomColor.getStyle());
  gradient.addColorStop(1, bottomColor.getStyle());
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 4, 512);
  skyTexture.needsUpdate = true;
  return skyTexture;
}

const rootStyle = document.documentElement.style;

function applyEnvironmentFade() {
  let fadeVal = 1;
  if (gamePhase === "idle") fadeVal = 0;
  else if (gamePhase === "transition") fadeVal = easeInOutCubic(transitionProgress);

  materials.ground.opacity = fadeVal;
  materials.pebble.opacity = fadeVal;
  cloudMaterial.opacity = fadeVal;
  ui.score.style.opacity = fadeVal;

  obstacles.forEach(obstacle => {
    obstacle.traverse(child => {
      // Ignore blur ghosts (which have sourceMaterial) to prevent double-fading issues
      if (child.isMesh && child.material && !child.userData.sourceMaterial) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            m.transparent = true;
            m.opacity = fadeVal;
            m.needsUpdate = true;
          });
        } else {
          child.material.transparent = true;
          child.material.opacity = fadeVal;
          child.material.needsUpdate = true;
        }
      }
    });
  });
}

function updateDayNightCycle(delta) {
  if (debugTimeOverride === 'day') {
    targetNightPhase = 0;
  } else if (debugTimeOverride === 'night') {
    targetNightPhase = 1;
  } else {
    const cycle = score % 1000;
    targetNightPhase = (cycle > 700) ? 1 : 0;
  }

  if (delta === 0) {
    nightPhase = targetNightPhase;
  } else {
    nightPhase = THREE.MathUtils.damp(nightPhase, targetNightPhase, 1.5, delta);
  }

  stars.material.opacity = nightPhase;
  stars.rotation.y += delta * 0.015;
  stars.rotation.x += delta * 0.005;

  if (Math.abs(nightPhase - previousNightPhase) > 0.001 || delta === 0) {
    previousNightPhase = nightPhase;

    let activeColDayBg, activeColNightBg;
    let activeColDayFog, activeColNightFog;
    let activeColDayDino, activeColNightDino;
    let activeColDayBird, activeColNightBird;
    let activeColDayCactus, activeColNightCactus;
    let activeColDayGround, activeColNightGround;
    let activeColDayCloud, activeColNightCloud;

    if (fullColorMode) {
      // Sky: Blue top fading to WHITE at horizon — fog is also white, so objects dissolve
      // into the same white as the sky bottom = seamless blend, just like monochrome mode.
      const daySkyTop = new THREE.Color(0x4a9af5);
      const daySkyBottom = new THREE.Color(0xf0f0f0);  // near-white horizon
      
      // Night Sky: Deep midnight blue top (#060d1f) fading into a cool moonlit horizon (#132038)
      const nightSkyTop = new THREE.Color(0x060d1f);
      const nightSkyBottom = new THREE.Color(0x132038);

      const activeSkyTop = new THREE.Color().lerpColors(daySkyTop, nightSkyTop, nightPhase);
      const activeSkyBottom = new THREE.Color().lerpColors(daySkyBottom, nightSkyBottom, nightPhase);

      scene.background = getSkyGradientTexture(activeSkyTop, activeSkyBottom);

      // Fog: match the sky bottom color exactly = seamless horizon, no seam!
      // Use standard fog near/far (same as monochrome) — no custom overrides needed.
      activeColDayFog = new THREE.Color(0xf0f0f0);
      activeColNightFog = new THREE.Color(0x132038);

      // Dino: Darker olive green for day (#3a561c), Moonlit dark teal for night (#1c4a32)
      activeColDayDino = new THREE.Color(0x3a561c);
      activeColNightDino = new THREE.Color(0x1c4a32);

      // Bird / Pterodactyl: Terracotta desert brown for day (#9e5030), Moonlit plum for night (#3a2642)
      activeColDayBird = new THREE.Color(0x9e5030);
      activeColNightBird = new THREE.Color(0x3a2642);

      // Cactus: Vibrant Saguaro Green for day (#2d8a4e), Moonlit deep teal green for night (#164a40)
      activeColDayCactus = new THREE.Color(0x2d8a4e);
      activeColNightCactus = new THREE.Color(0x164a40);

      // Ground: Warm desert sand for day (#e0b878), Cool moonlit indigo sand for night (#1e2a44)
      activeColDayGround = new THREE.Color(0xe0b878);
      activeColNightGround = new THREE.Color(0x1e2a44);

      // Clouds: Pure bright white for day (#ffffff), Moonlit silver-blue for night (#637ca3)
      activeColDayCloud = new THREE.Color(0xffffff);
      activeColNightCloud = new THREE.Color(0x637ca3);

      // Moonlit Lighting: Cool blue directional moonlight & ambient night lighting
      const sunColorDay = new THREE.Color(0xffffff);
      const sunColorNight = new THREE.Color(0x8bb8f5);
      const hemiSkyDay = new THREE.Color(0xffffff);
      const hemiSkyNight = new THREE.Color(0x233854);
      const hemiGroundDay = new THREE.Color(0xd7d7d7);
      const hemiGroundNight = new THREE.Color(0x101926);

      sunlight.color.lerpColors(sunColorDay, sunColorNight, nightPhase);
      sunlight.intensity = THREE.MathUtils.lerp(3.2, 2.0, nightPhase);
      hemiLight.color.lerpColors(hemiSkyDay, hemiSkyNight, nightPhase);
      hemiLight.groundColor.lerpColors(hemiGroundDay, hemiGroundNight, nightPhase);
      hemiLight.intensity = THREE.MathUtils.lerp(2.25, 1.5, nightPhase);
    } else {
      monochromeBgColor.lerpColors(colDayBg, colNightBg, nightPhase);
      scene.background = monochromeBgColor;

      activeColDayFog = colDayBg;
      activeColNightFog = colNightBg;

      activeColDayDino = colDayDino;
      activeColNightDino = colNightDino;

      activeColDayBird = colDayDino;
      activeColNightBird = colNightDino;

      activeColDayCactus = colDayDino;
      activeColNightCactus = colNightDino;

      activeColDayGround = colDayGround;
      activeColNightGround = colNightGround;

      activeColDayCloud = colDayCloud;
      activeColNightCloud = colNightCloud;

      sunlight.color.setHex(0xffffff);
      sunlight.intensity = 3.2;
      hemiLight.color.setHex(0xffffff);
      hemiLight.groundColor.setHex(0xd7d7d7);
      hemiLight.intensity = 2.25;
    }

    if (scene.fog) {
      scene.fog.color.lerpColors(activeColDayFog, activeColNightFog, nightPhase);
    }
    if (typeof gameOverOverlay !== "undefined") gameOverOverlay.material.color.lerpColors(overlayDay, overlayNight, nightPhase);

    cloudMaterial.color.lerpColors(activeColDayCloud, activeColNightCloud, nightPhase);

    materials.dino.color.lerpColors(activeColDayDino, activeColNightDino, nightPhase);
    materials.cactus.color.lerpColors(activeColDayCactus, activeColNightCactus, nightPhase);
    materials.ground.color.lerpColors(activeColDayGround, activeColNightGround, nightPhase);
    materials.pebble.color.lerpColors(colDayPebble, colNightPebble, nightPhase);

    // Update desert rock materials palette
    desertRockMaterials.forEach((mat, idx) => {
      mat.color.lerpColors(desertRockColorsDay[idx], desertRockColorsNight[idx], nightPhase);
    });

    const activeCreditColorDay = new THREE.Color(0x4d6c85); // Muted blue
    const activeCreditColorNight = new THREE.Color(0xc3d7f2);
    if (fullColorMode) {
      creditTextMaterial.color.lerpColors(activeCreditColorDay, activeCreditColorNight, nightPhase);
      roadSurfaceMat.color.lerpColors(new THREE.Color(0xb8873e), new THREE.Color(0x1a2640), nightPhase);
      curbMatA.color.lerpColors(new THREE.Color(0x8a7050), new THREE.Color(0x131d2e), nightPhase);
      curbMatB.color.lerpColors(new THREE.Color(0x7a6040), new THREE.Color(0x101828), nightPhase);
      gravelMatA.color.lerpColors(new THREE.Color(0x9a7848), new THREE.Color(0x141e30), nightPhase);
      gravelMatB.color.lerpColors(new THREE.Color(0x7d6038), new THREE.Color(0x101828), nightPhase);
      gravelMatC.color.lerpColors(new THREE.Color(0xad8850), new THREE.Color(0x182438), nightPhase);
    } else {
      roadSurfaceMat.color.lerpColors(colDayGround, colNightGround, nightPhase);
      curbMatA.color.lerpColors(colDayPebble, colNightPebble, nightPhase);
      curbMatB.color.lerpColors(colDayPebble, colNightPebble, nightPhase);
      gravelMatA.color.lerpColors(colDayPebble, colNightPebble, nightPhase);
      gravelMatB.color.lerpColors(colDayPebble, colNightPebble, nightPhase);
      gravelMatC.color.lerpColors(colDayPebble, colNightPebble, nightPhase);
    }

    for (const g of backgroundTexts) {
      g.traverse((child) => {
        if (child.isMesh) {
          child.material = fullColorMode ? creditTextMaterial : materials.pebble;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }

    // Update GLTF materials (Dino & Bird)
    for (const m of gltfMaterials) {
      if (m.userData.isDino) {
        if (fullColorMode) {
          m.map = null;
          m.roughness = 0.5;
          m.metalness = 0.05;
          m.color.lerpColors(activeColDayDino, activeColNightDino, nightPhase);
        } else {
          m.map = m.userData.originalMap;
          m.roughness = m.userData.originalRoughness;
          m.metalness = m.userData.originalMetalness;
          m.color.lerpColors(m.userData.dayColor, colNightDino, nightPhase);
        }
        m.needsUpdate = true;
      } else if (m.userData.isBird) {
        if (fullColorMode) {
          m.map = null;
          m.roughness = 0.6;
          m.metalness = 0.05;
          m.color.lerpColors(activeColDayBird, activeColNightBird, nightPhase);
        } else {
          m.map = m.userData.originalMap;
          m.roughness = m.userData.originalRoughness;
          m.metalness = m.userData.originalMetalness;
          m.color.lerpColors(m.userData.dayColor, colNightDino, nightPhase);
        }
        m.needsUpdate = true;
      } else if (m.userData.dayColor) {
        m.color.lerpColors(m.userData.dayColor, colNightDino, nightPhase);
      }
    }

    // Toggle pebble and rock materials
    for (const p of pebbles) {
      if (fullColorMode) {
        p.material = desertRockMaterials[p.userData.rockIndex % desertRockMaterials.length];
      } else {
        p.material = materials.pebble;
      }
    }

    for (const r of backgroundRocks) {
      if (fullColorMode) {
        r.material = desertRockMaterials[r.userData.rockIndex % desertRockMaterials.length];
      } else {
        r.material = materials.pebble;
      }
    }

    currentTrailColor.lerpColors(colDayTrail, colNightTrail, nightPhase);
    for (const p of pebbles) {
      p.userData.motionTrailMaterial.color.copy(currentTrailColor);
    }

    const uiNightPhase = nightPhase >= 0.5 ? 1 : 0;
    currentInk.lerpColors(inkDay, inkNight, uiNightPhase);
    currentMid.lerpColors(midDay, midNight, uiNightPhase);
    currentBtnActive.lerpColors(btnActiveDay, btnActiveNight, uiNightPhase);
    currentShadow.lerpColors(shadowDay, shadowNight, uiNightPhase);

    const uiPaper = new THREE.Color().lerpColors(colDayBg, colNightBg, uiNightPhase);
    const r = Math.round(uiPaper.r * 255);
    const g = Math.round(uiPaper.g * 255);
    const b = Math.round(uiPaper.b * 255);

    rootStyle.setProperty('--paper', uiPaper.getStyle());
    rootStyle.setProperty('--paper-trans', `rgba(${r}, ${g}, ${b}, 0.92)`);
    rootStyle.setProperty('--ink', currentInk.getStyle());
    rootStyle.setProperty('--mid', currentMid.getStyle());
    rootStyle.setProperty('--btn-active', `rgba(${Math.round(currentBtnActive.r * 255)}, ${Math.round(currentBtnActive.g * 255)}, ${Math.round(currentBtnActive.b * 255)}, 0.94)`);
    rootStyle.setProperty('--shadow-solid', currentShadow.getStyle());

    if (fullColorMode) {
      rootStyle.setProperty('--score-color', '#ffffff');
      rootStyle.setProperty('--score-shadow', 'none');
      rootStyle.setProperty('--hud-color', currentMid.getStyle());
      rootStyle.setProperty('--hud-shadow', 'none');
    } else {
      rootStyle.setProperty('--score-color', currentMid.getStyle());
      rootStyle.setProperty('--score-shadow', '0 1px 0 var(--paper)');
      rootStyle.setProperty('--hud-color', currentMid.getStyle());
      rootStyle.setProperty('--hud-shadow', '0 1px 0 var(--paper)');
    }
  }
}

function formatScore(value) {
  return Math.floor(value).toString().padStart(5, "0").slice(-5);
}

function updateScore() {
  ui.score.textContent = `HI ${formatScore(highScore)}  ${formatScore(score)}`;
}

function showPanel(title, message, buttonText) {
  ui.title.textContent = title;
  ui.message.textContent = message;
  ui.start.textContent = buttonText;
  ui.panel.classList.remove("hidden");
}

function hidePanel() {
  ui.panel.classList.add("hidden");
}

function showInfo(nextValue) {
  if (gamePhase === "idle" || gamePhase === "gameover") return;

  infoOpen = nextValue;
  if (infoOpen && paused) pauseGame(false);

  if (infoOpen) {
    ui.infoPanel.classList.remove("hidden");
    ui.mobileControls.classList.add("game-hidden");
    ui.desktopControls.classList.add("game-hidden");
    ui.topLeftControls.classList.add("game-hidden");
  } else {
    ui.infoPanel.classList.add("hidden");
    ui.mobileControls.classList.remove("game-hidden");
    ui.desktopControls.classList.remove("game-hidden");
    ui.topLeftControls.classList.remove("game-hidden");
    clock.getDelta();
  }
}

function pauseGame(nextValue) {
  if (gamePhase === "idle" || gamePhase === "gameover") return;

  paused = nextValue;
  if (paused && infoOpen) showInfo(false);

  if (paused) {
    ui.pausePanel.classList.remove("hidden");
    ui.mobileControls.classList.add("game-hidden");
    ui.desktopControls.classList.add("game-hidden");
    ui.topLeftControls.classList.add("game-hidden");
    if (ui.leaderboardSidebar) ui.leaderboardSidebar.classList.remove("game-hidden");
  } else {
    ui.pausePanel.classList.add("hidden");
    ui.mobileControls.classList.remove("game-hidden");
    ui.desktopControls.classList.remove("game-hidden");
    ui.topLeftControls.classList.remove("game-hidden");
    if (ui.leaderboardSidebar) ui.leaderboardSidebar.classList.add("game-hidden");
    clock.getDelta();
  }
}

function resetGame() {
  if (gamePhase === "idle") {
    ui.fpsCounter.style.display = "none";
  }

  score = 0;
  elapsed = 0;
  worldSpeed = WORLD.baseSpeed;
  jumpVelocity = 0;
  grounded = true;
  ducking = false;
  runPhase = 0;
  cameraShake = 0;
  firstBirdForced = false;

  dino.position.set(0, 0, WORLD.dinoZ);
  dino.rotation.set(0, 0, 0);
  dino.userData.visual.scale.set(1, 1, 1);
  dino.userData.visual.position.set(0, 0, 0);
  dino.userData.deadEyes.visible = false;
  switchDinoModel(false);
  updateEyeEditor();

  buildClouds();
  buildObstacleField();

  pebbles.forEach((pebble) => {
    pebble.position.z = THREE.MathUtils.randFloat(-145, 16);
    pebble.userData.motionTrailMaterial.opacity = 0;
  });

  backgroundRocks.forEach((rock) => {
    rock.position.z = THREE.MathUtils.randFloat(-145, 8);
  });

  let currentTextZ = THREE.MathUtils.randFloat(-800, -500);
  backgroundTexts.forEach((textGroup) => {
    const side = Math.random() < 0.5 ? -1 : 1;
    textGroup.position.z = currentTextZ;
    currentTextZ -= THREE.MathUtils.randFloat(800, 1200);
    textGroup.position.x = side * THREE.MathUtils.randFloat(45, 70);
    textGroup.rotation.y = side === -1 ? 0.15 : -0.15;
  });

  updateDayNightCycle(0);
  updateScore();
  applyEnvironmentFade();
}

function startGame() {
  if (paused) {
    pauseGame(false);
    return;
  }

  if (gamePhase === "idle") {
    gamePhase = "transition";
    transitionProgress = 0;

    ui.introText.classList.add("intro-hidden");
    ui.mobileControls.classList.remove("intro-hidden");
    ui.desktopControls.classList.remove("intro-hidden");
    ui.topLeftControls.classList.remove("intro-hidden");
    if (ui.leaderboardSidebar) {
      ui.leaderboardSidebar.classList.remove("intro-hidden");
      ui.leaderboardSidebar.classList.add("game-hidden");
    }
    ui.fpsCounter.style.display = "block";

    jump();
  } else if (gamePhase === "gameover") {
    // Prevent restarting if username prompt is open
    if (ui.usernamePrompt && !ui.usernamePrompt.classList.contains("hidden")) {
      return;
    }
    resetGame();
    gamePhase = "playing";
    ui.panel.classList.add("hidden");
    ui.gameOverPanel.classList.add("hidden");
    if (ui.openSubmitScoreButton) ui.openSubmitScoreButton.classList.add("hidden");
    if (ui.leaderboardSidebar) ui.leaderboardSidebar.classList.add("game-hidden");
  }

  clock.getDelta();
}

function endGame() {
  if (gamePhase === "gameover") return;

  gamePhase = "gameover";
  cameraShake = 0.38;

  dino.userData.deadEyes.visible = true;
  dino.userData.deadEyes.position.set(0, 0, 0);
  if (ducking && dino.userData.duckScene) {
    dino.userData.deadEyes.children[0].position.set(0.73, 2.30, -0.88);
    dino.userData.deadEyes.children[1].position.set(0.17, 2.27, -0.78);
  } else {
    dino.userData.deadEyes.children[0].position.set(0.43, 2.80, -0.25);
    dino.userData.deadEyes.children[1].position.set(-0.15, 2.76, -0.22);
  }

  const previousHighScore = highScore;
  highScore = Math.max(highScore, Math.floor(score));
  try {
    localStorage.setItem("dinoHighScore", String(highScore));
  } catch (e) { }

  updateScore();

  // Clear previous message
  ui.scoreSavedMsg.textContent = "";

  // Firebase integration flow
  const username = getSavedUsername();
  if (!username) {
    ui.usernamePrompt.classList.add("hidden");
    if (score > 0) ui.openSubmitScoreButton.classList.remove("hidden");
    ui.usernameInput.value = "";
  } else {
    ui.usernamePrompt.classList.add("hidden");
    ui.openSubmitScoreButton.classList.add("hidden");
    if (Math.floor(score) > previousHighScore) {
      ui.scoreSavedMsg.textContent = "SAVING NEW HIGH SCORE...";
      saveHighScoreToFirebase(username, highScore)
        .then((success) => {
          if (success) {
            ui.scoreSavedMsg.textContent = "NEW HIGH SCORE SAVED!";
            refreshLeaderboard();
          } else {
            ui.scoreSavedMsg.textContent = "ERROR SAVING HIGH SCORE";
          }
        });
    }
  }

  ui.gameOverPanel.classList.remove("hidden");
  if (ui.leaderboardSidebar) ui.leaderboardSidebar.classList.remove("game-hidden");
  updateEyeEditor();
}

function jump() {
  if (gamePhase === "idle") {
    startGame();
    return;
  }
  if (gamePhase === "gameover") return;
  if (paused) return;

  if (grounded) {
    jumpVelocity = WORLD.jumpVelocity;
    grounded = false;
    keys.duck = false;
  }
}

function setMovementKey(code, value) {
  if (code === "ArrowLeft" || code === "KeyA") keys.left = value;
  if (code === "ArrowRight" || code === "KeyD") keys.right = value;
  if (code === "ArrowDown" || code === "KeyS") keys.duck = value;
}

let rKeyHolding = false;
let rHoldStartTime = 0;
let rHoldTimer = null;
let rResetCompleted = false;

function startHoldingR() {
  if (rResetCompleted) return;
  rKeyHolding = true;
  rHoldStartTime = performance.now();

  if (rHoldTimer) cancelAnimationFrame(rHoldTimer);

  function updateHoldProgress() {
    if (!rKeyHolding) return;

    const elapsed = performance.now() - rHoldStartTime;
    const duration = 1500; // 1.5 seconds
    const progress = Math.min(100, Math.floor((elapsed / duration) * 100));

    if (ui.resetHiStatus) {
      ui.resetHiStatus.textContent = `RESETTING HI: ${progress}%`;
      ui.resetHiStatus.style.color = "var(--ink)";
      ui.resetHiStatus.style.fontWeight = "bold";
    }

    if (elapsed >= duration) {
      highScore = 0;
      try {
        localStorage.setItem("dinoHighScore", "0");
      } catch (e) {}
      updateScore();

      const username = getSavedUsername();
      if (username) {
        saveHighScoreToFirebase(username, 0);
      }

      if (ui.resetHiStatus) {
        ui.resetHiStatus.textContent = "HI-SCORE RESET!";
        ui.resetHiStatus.style.color = "#d9534f"; // Red feedback
      }

      rResetCompleted = true;
      rKeyHolding = false;

      setTimeout(() => {
        if (ui.resetHiStatus) {
          ui.resetHiStatus.textContent = "HOLD R TO RESET HI";
          ui.resetHiStatus.style.color = "";
          ui.resetHiStatus.style.fontWeight = "";
        }
        rResetCompleted = false;
      }, 2000);

      return;
    }

    rHoldTimer = requestAnimationFrame(updateHoldProgress);
  }

  rHoldTimer = requestAnimationFrame(updateHoldProgress);
}

function stopHoldingR() {
  rKeyHolding = false;
  if (rHoldTimer) cancelAnimationFrame(rHoldTimer);
  if (!rResetCompleted) {
    if (ui.resetHiStatus) {
      ui.resetHiStatus.textContent = "HOLD R TO RESET HI";
      ui.resetHiStatus.style.color = "";
      ui.resetHiStatus.style.fontWeight = "";
    }
  }
}

window.addEventListener("mousedown", (e) => {
  if (debugMode && e.target === renderer.domElement) return;
  if (e.target.id === "pauseButton") return;
  if (e.target.closest("#restartButton")) return;
  if (e.target.closest("#usernamePrompt") || e.target.closest("#openSubmitScoreButton")) return; // Don't trigger jump/start when clicking inside the input form or submit score button
  jump();
});

let cheatBuffer = "";
const secretCodes = {
  "TREX": "NICE TYPING!",
  "DOGE": "WOW MUCH JUMP",
  "ESSJAYKAY": "HELLO DEVELOPER!",
  "OMG": "OH MY GOD!"
};

function spawnSecretText(msg) {
  if (!loadedFont || gamePhase !== "playing") return;
  
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    roughness: 0.2,
    metalness: 0.8
  });
  
  const geo = new TextGeometry(msg, { 
    font: loadedFont, 
    size: 2.5, 
    depth: 0.5, 
    curveSegments: 3, 
    bevelEnabled: true, 
    bevelThickness: 0.1, 
    bevelSize: 0.1, 
    bevelSegments: 2 
  });
  geo.computeBoundingBox();
  geo.translate(-(geo.boundingBox.max.x - geo.boundingBox.min.x) / 2, 0, 0);
  
  const mesh = new THREE.Mesh(geo, goldMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
  const group = new THREE.Group();
  group.add(mesh);
  
  // Spawn it slightly ahead of the dino, in the background
  const side = Math.random() < 0.5 ? -1 : 1;
  group.position.set(
    side * THREE.MathUtils.randFloat(30, 50), 
    THREE.MathUtils.randFloat(2, 10), 
    dino.position.z - THREE.MathUtils.randFloat(200, 300)
  );
  group.rotation.y = side === -1 ? 0.2 : -0.2;
  
  scene.add(group);
  backgroundTexts.push(group);
}

window.addEventListener("keydown", (event) => {
  // If typing inside input fields, bypass game input handler
  if (document.activeElement && document.activeElement.tagName === "INPUT") {
    return;
  }

  if (event.key.length === 1 && gamePhase === "playing") {
    cheatBuffer += event.key.toUpperCase();
    if (cheatBuffer.length > 20) cheatBuffer = cheatBuffer.slice(-20);
    
    for (const [code, msg] of Object.entries(secretCodes)) {
      if (cheatBuffer.endsWith(code)) {
        spawnSecretText(msg);
        if (code === "OMG") {
          godMode = true;
          const godCheck = document.getElementById('debug-god-check');
          if (godCheck) godCheck.checked = true;
        }
        cheatBuffer = "";
        break;
      }
    }
  }

  if (event.code === "KeyR") {
    if (!rKeyHolding) {
      startHoldingR();
    }
    return;
  }

  if (event.code === "Backquote" || event.key === "`" || event.key === "~") {
    event.preventDefault();
    toggleDebug();
    return;
  }

  if (event.code === "KeyG" && debugMode) {
    godMode = !godMode;
    const godCheck = document.getElementById('debug-god-check');
    if (godCheck) godCheck.checked = godMode;
    updateDebugUI();
    return;
  }

  if (debugMode && (event.code === "BracketLeft" || event.code === "BracketRight")) {
    const change = event.code === "BracketRight" ? 0.25 : -0.25;
    debugSpeedMultiplier = Math.max(0, Math.min(5, Math.round((debugSpeedMultiplier + change) * 100) / 100));
    const slider = document.getElementById('debug-speed-slider');
    const valSpan = document.getElementById('debug-speed-val');
    if (slider) slider.value = debugSpeedMultiplier;
    if (valSpan) valSpan.textContent = debugSpeedMultiplier.toFixed(1) + 'x';
    updateDebugUI();
    return;
  }

  const handled = [
    "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "KeyW", "KeyA", "KeyS", "KeyD", "KeyP", "KeyI", "Escape", "KeyF"
  ];

  if (handled.includes(event.code)) event.preventDefault();

  if (
    event.repeat &&
    ["Space", "ArrowUp", "KeyW", "KeyP", "KeyI", "Escape"].includes(event.code)
  ) return;

  if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
    jump();
  } else if (event.code === "KeyP" || event.code === "Escape") {
    pauseGame(!paused);
  } else if (event.code === "KeyI") {
    showInfo(!infoOpen);
  } else if (event.code === "KeyF") {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn(`Error attempting to enable fullscreen: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  } else {
    setMovementKey(event.code, true);
  }
});

window.addEventListener("keyup", (event) => {
  if (document.activeElement && document.activeElement.tagName === "INPUT") {
    return;
  }
  if (event.code === "KeyR") {
    stopHoldingR();
    return;
  }
  setMovementKey(event.code, false);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && gamePhase !== "idle" && !paused) pauseGame(true);
});

ui.start.addEventListener("click", startGame);
ui.restartButton.addEventListener("click", startGame);

ui.openSubmitScoreButton.addEventListener("click", () => {
  ui.openSubmitScoreButton.classList.add("hidden");
  ui.usernamePrompt.classList.remove("hidden");
  ui.usernameInput.focus();
});

ui.closeSubmitScoreButton.addEventListener("click", () => {
  ui.usernamePrompt.classList.add("hidden");
  ui.openSubmitScoreButton.classList.remove("hidden");
});

ui.submitScoreButton.addEventListener("click", () => {
  const inputVal = ui.usernameInput.value.trim().toUpperCase();
  if (!inputVal) {
    ui.scoreSavedMsg.textContent = "ENTER A VALID USERNAME";
    return;
  }

  saveUsernameLocally(inputVal);
  ui.usernamePrompt.classList.add("hidden");
  ui.scoreSavedMsg.textContent = "SAVING SCORE...";

  saveHighScoreToFirebase(inputVal, highScore)
    .then((success) => {
      if (success) {
        ui.scoreSavedMsg.textContent = "SCORE SAVED SUCCESSFULLY!";
      } else {
        ui.scoreSavedMsg.textContent = "ERROR SAVING SCORE";
      }
    });
});

for (const button of document.querySelectorAll(".controlButton")) {
  const control = button.dataset.control;

  const press = (event) => {
    event.preventDefault();
    button.classList.add("active");

    if (control === "jump") {
      jump();
    } else if (control === "pause") {
      pauseGame(!paused);
    } else if (control === "info") {
      showInfo(!infoOpen);
    } else {
      keys[control] = true;
    }
  };

  const release = (event) => {
    event.preventDefault();
    button.classList.remove("active");
    if (control !== "jump" && control !== "pause" && control !== "info") keys[control] = false;
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}

let mobileControlType = "swipe"; 
const controlToggleBtn = document.getElementById("controlToggleBtn");
if (controlToggleBtn) {
  const iconGamepad = document.getElementById("icon-gamepad");
  const iconSwipe = document.getElementById("icon-swipe");
  const controlClusters = document.querySelectorAll(".controlCluster");

  controlToggleBtn.addEventListener("click", () => {
    if (mobileControlType === "swipe") {
      mobileControlType = "buttons";
      iconGamepad.style.display = "none";
      iconSwipe.style.display = "block";
      controlClusters.forEach(c => c.style.display = "flex");
    } else {
      mobileControlType = "swipe";
      iconGamepad.style.display = "block";
      iconSwipe.style.display = "none";
      controlClusters.forEach(c => c.style.display = "none");
    }
  });
}

const closeInfoBtn = document.getElementById("closeInfoBtn");
if (closeInfoBtn) {
  closeInfoBtn.addEventListener("click", () => {
    showInfo(false);
  });
}

let swipeStartX = 0;
let swipeStartY = 0;
let isSwiping = false;
let swipeMoveTimer = null;
let previousSwipeX = 0;
let swipeDeltaX = 0;

renderer.domElement.addEventListener("pointerdown", (event) => {
  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
  previousSwipeX = event.clientX;
  isSwiping = true;

  if (debugMode) return;
  if (gamePhase === "idle") {
    startGame();
  }
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!isSwiping || gamePhase === "idle" || gamePhase === "gameover" || paused) return;
  if (mobileControlType !== "swipe") return;

  const dxDelta = event.clientX - previousSwipeX;
  previousSwipeX = event.clientX;
  
  const dy = event.clientY - swipeStartY;
  const threshold = 20;

  // 1:1 direct tracking for horizontal movement
  const sensitivity = (WORLD.laneLimit * 2.2) / window.innerWidth;
  swipeDeltaX += dxDelta * sensitivity;

  // Ducking on drag down
  if (dy > threshold) {
    keys.duck = true;
  } else {
    keys.duck = false;
  }
});

renderer.domElement.addEventListener("pointerup", (event) => {
  if (!isSwiping) return;
  isSwiping = false;

  if (gamePhase === "idle" || gamePhase === "gameover" || paused) return;

  const dx = event.clientX - swipeStartX;
  const dy = event.clientY - swipeStartY;
  const threshold = 20;

  // For swipe up (jump), trigger immediately
  if (mobileControlType === "swipe" && Math.abs(dy) > Math.abs(dx) && dy < -threshold) {
    jump();
  }

  if (mobileControlType === "swipe") {
    keys.duck = false;
  }
});

renderer.domElement.addEventListener("pointerleave", (event) => {
  if (!isSwiping) return;
  isSwiping = false;
  if (mobileControlType === "swipe") {
    keys.duck = false;
  }
});

function animateDino(delta) {
  let moveDirection = Number(keys.right) - Number(keys.left);
  const lateralSpeed = grounded ? 7.5 : 5.9;

  dino.position.x += moveDirection * lateralSpeed * delta;

  if (swipeDeltaX !== 0) {
    dino.position.x += swipeDeltaX;
    moveDirection = Math.sign(swipeDeltaX); // For rotation feedback
    swipeDeltaX = 0;
  }

  dino.position.x = THREE.MathUtils.clamp(
    dino.position.x,
    -WORLD.laneLimit,
    WORLD.laneLimit
  );

  jumpVelocity -= WORLD.gravity * delta;
  dino.position.y += jumpVelocity * delta;

  if (dino.position.y <= 0) {
    dino.position.y = 0;
    jumpVelocity = 0;
    grounded = true;
  }

  ducking = keys.duck && grounded;

  const blend = 1 - Math.pow(0.00008, delta);

  runPhase += delta * worldSpeed * 0.94;

  // Switch between walk and duck GLB models
  if (dino.userData.duckScene) {
    switchDinoModel(ducking);
    dino.userData.visual.scale.set(1, 1, 1);
    // Offset duck model down so it stays on the ground, not floating
    dino.userData.visual.position.set(0, ducking ? -0.55 : 0, 0);
  } else {
    // Fallback: squish Y if duck model hasn't loaded yet
    const targetScaleY = ducking ? 0.48 : 1;
    const targetVisualY = ducking ? -0.12 : 0;

    dino.userData.visual.scale.y = THREE.MathUtils.lerp(
      dino.userData.visual.scale.y,
      targetScaleY,
      blend
    );

    dino.userData.visual.position.y = THREE.MathUtils.lerp(
      dino.userData.visual.position.y,
      targetVisualY,
      blend
    );
  }

  // Update the active model's timeframe animation
  if (ducking && dino.userData.duckController) {
    dino.userData.duckController.update(delta);
  }
  if (!ducking && dino.userData.walkController && grounded) {
    dino.userData.walkController.update(delta);
  }

  dino.rotation.z = THREE.MathUtils.lerp(
    dino.rotation.z,
    -moveDirection * 0.09,
    blend
  );
}

function respawnObstacle(index, newZ) {
  const shouldForceBird = score >= WORLD.birdUnlockScore && !firstBirdForced;
  const newObstacle = chooseObstacleType(shouldForceBird);

  if (newObstacle.userData.kind === "bird") {
    firstBirdForced = true;
  }

  replaceObstacleAt(index, newObstacle, newZ);
}

function animateObstacles(delta) {
  let farthestZ = Math.min(...obstacles.map((obstacle) => obstacle.position.z));

  for (let i = 0; i < obstacles.length; i++) {
    const obstacle = obstacles[i];
    const isBird = obstacle.userData.kind === "bird";
    const speedMultiplier = isBird ? obstacle.userData.speedMultiplier : 1;

    obstacle.position.z += worldSpeed * speedMultiplier * delta;

    if (isBird) {
      if (obstacle.userData.timeframeController) {
        obstacle.userData.timeframeController.update(delta * speedMultiplier);
      } else {
        const flap = Math.sin(
          elapsed * 14.5 + obstacle.userData.flapOffset
        ) * 0.82;

        obstacle.userData.leftWingPivot.rotation.z = flap;
        obstacle.userData.rightWingPivot.rotation.z = -flap;
      }

      obstacle.userData.visual.position.y = Math.sin(
        elapsed * 5.8 + obstacle.userData.flapOffset
      ) * 0.1;

      obstacle.position.y =
        obstacle.userData.baseY +
        Math.sin(elapsed * 4.8 + obstacle.userData.flapOffset) * 0.07;

      updateBirdNavigation(obstacle, delta);

      obstacle.rotation.x = THREE.MathUtils.damp(
        obstacle.rotation.x,
        -0.08,
        5,
        delta
      );
    }

    if (!obstacle.userData.passed && obstacle.position.z > dino.position.z + 1.9) {
      obstacle.userData.passed = true;
      score += isBird ? 12 : 8;
    }

    updateObstacleBlur(obstacle);
    updateContactShadow(obstacle);

    if (obstacle.position.z > 19) {
      farthestZ -= THREE.MathUtils.randFloat(15, 20);
      respawnObstacle(i, farthestZ);
    }
  }
}

function animateEnvironment(delta) {
  const cloudSpeed = gamePhase === "idle" ? WORLD.baseSpeed * 0.4 : worldSpeed;

  for (const cloud of clouds) {
    cloud.position.z += cloudSpeed * cloud.userData.speedMultiplier * delta;
    cloud.position.x -= 2.0 * delta;

    if (cloud.position.z > 40) {
      cloud.position.z -= 160;
      const xSign = cloud.position.x > 0 ? 1 : -1;
      const x = xSign > 0 ? THREE.MathUtils.randFloat(10, 80) : THREE.MathUtils.randFloat(-80, -10);
      cloud.position.x = x;
      cloud.position.y = THREE.MathUtils.randFloat(18, 38);
    }
  }

  if (gamePhase === "idle") return;

  for (const pebble of pebbles) {
    pebble.position.z += worldSpeed * delta;

    const nearFactor = THREE.MathUtils.smoothstep(pebble.position.z, -9, 15);
    const speedFactor = THREE.MathUtils.clamp(
      (worldSpeed - WORLD.baseSpeed) / (WORLD.maxSpeed - WORLD.baseSpeed),
      0,
      1
    );

    let fadeVal = 1;
    if (gamePhase === "transition") fadeVal = easeInOutCubic(transitionProgress);

    const trailOpacity = gamePhase !== "gameover" && !paused
      ? nearFactor * THREE.MathUtils.lerp(0.015, 0.11, speedFactor) * fadeVal
      : 0;

    pebble.userData.motionTrailMaterial.opacity = trailOpacity;
    pebble.userData.motionTrail.scale.z =
      THREE.MathUtils.lerp(0.65, 1.7, nearFactor * speedFactor);
    pebble.userData.motionTrail.position.z =
      -0.45 - nearFactor * speedFactor * 0.7;

    if (pebble.position.z > 18) {
      pebble.position.z = THREE.MathUtils.randFloat(-145, -105);
      pebble.position.x = THREE.MathUtils.randFloat(-34, 34);
      pebble.userData.motionTrailMaterial.opacity = 0;
    }
  }

  for (const patch of pathPatches) {
    patch.position.z += worldSpeed * delta;
    if (patch.position.z > 18) {
      // Place behind the farthest-back segment for a continuous road
      let minZ = Infinity;
      for (const p of pathPatches) { if (p.position.z < minZ) minZ = p.position.z; }
      patch.position.z = minZ - 2.5;
    }
  }

  for (const rock of backgroundRocks) {
    rock.position.z += worldSpeed * delta;

    if (rock.position.z > 14) {
      const side = Math.random() < 0.5 ? -1 : 1;
      rock.position.z = THREE.MathUtils.randFloat(-145, -110);
      rock.position.x = side * THREE.MathUtils.randFloat(12, 42);
    }
  }

  for (const textGroup of backgroundTexts) {
    textGroup.position.z += worldSpeed * delta;
    if (textGroup.position.z > 14) {
      const minZ = Math.min(...backgroundTexts.map(g => g.position.z));
      const side = Math.random() < 0.5 ? -1 : 1;
      textGroup.position.z = Math.min(minZ - THREE.MathUtils.randFloat(800, 1200), -800);
      textGroup.position.x = side * THREE.MathUtils.randFloat(45, 70);
      textGroup.rotation.y = side === -1 ? 0.15 : -0.15;
    }
  }
}

function setObstacleBoxFromData(obstacle) {
  const hitbox = obstacle.userData.hitbox;
  obstacleCenter.set(
    obstacle.position.x + hitbox.offset.x,
    obstacle.position.y + hitbox.offset.y,
    obstacle.position.z + hitbox.offset.z
  );
  tempObstacleBox.setFromCenterAndSize(obstacleCenter, hitbox.size);
}

function detectCollision() {
  const centerY = dino.position.y + (ducking ? 0.54 : 1.82);

  dinoBoxCenter.set(
    dino.position.x,
    centerY,
    dino.position.z - 0.14
  );

  dinoBoxSize.set(
    ducking ? 1.08 : 0.98,
    ducking ? 0.88 : 3.05,
    1.22
  );

  dinoBox.setFromCenterAndSize(dinoBoxCenter, dinoBoxSize);

  for (const obstacle of obstacles) {
    if (
      obstacle.position.z > dino.position.z - 2.6 &&
      obstacle.position.z < dino.position.z + 2.6
    ) {
      setObstacleBoxFromData(obstacle);
      if (dinoBox.intersectsBox(tempObstacleBox)) {
        if (!godMode) endGame();
        break;
      }
    }
  }
}

function updateCamera(delta) {
  if (debugCameraMode === 'fps') {
    const duckOffset = ducking ? -1.0 * debugDinoScale : 0;
    camera.position.set(dino.position.x, dino.position.y + 2.0 * debugDinoScale + duckOffset, dino.position.z - 2.5 * debugDinoScale);
    cameraTarget.set(dino.position.x, dino.position.y + 1.8 * debugDinoScale + duckOffset, dino.position.z - 10);
    camera.lookAt(cameraTarget);
    camera.clearViewOffset();
    return;
  } else if (debugCameraMode === 'tps') {
    camera.position.set(dino.position.x, dino.position.y + 3.5 * debugDinoScale, dino.position.z + 7 * debugDinoScale);
    cameraTarget.set(dino.position.x, dino.position.y + 1.5 * debugDinoScale, dino.position.z - 10);
    camera.lookAt(cameraTarget);
    camera.clearViewOffset();
    return;
  }

  if (debugMode) return;
  
  if (gamePhase === "idle") {
    camera.position.copy(INTRO_CAM_POS);
    cameraTarget.copy(INTRO_CAM_TARGET);
    camera.lookAt(cameraTarget);
    camera.setViewOffset(window.innerWidth, window.innerHeight, window.innerWidth * 0.15, 0, window.innerWidth, window.innerHeight);
    return;
  }

  if (gamePhase === "gameover" || paused || infoOpen) {
    const blend = 1 - Math.pow(0.002, delta);

    // Calculate an exact profile side-view position relative to the dino
    const gameoverCamPos = new THREE.Vector3(dino.position.x + 19.0, 2.0, dino.position.z);
    const gameoverCamTarget = new THREE.Vector3(dino.position.x, 1.4, dino.position.z);

    camera.position.lerp(gameoverCamPos, blend);
    cameraTarget.lerp(gameoverCamTarget, blend);

    const currentOffsetX = camera.view ? camera.view.offsetX : 0;
    const newOffsetX = THREE.MathUtils.lerp(currentOffsetX, window.innerWidth * 0.15, blend);
    camera.setViewOffset(window.innerWidth, window.innerHeight, newOffsetX, 0, window.innerWidth, window.innerHeight);

    if (cameraShake > 0) {
      cameraShake = Math.max(0, cameraShake - delta * 1.8);
      camera.position.x += (Math.random() - 0.5) * cameraShake;
      camera.position.y += (Math.random() - 0.5) * cameraShake;
    }

    camera.lookAt(cameraTarget);
    return;
  }

  const targetX = dino.position.x * 0.29;
  const targetY = 9.6 + dino.position.y * 0.08;
  const targetZ = 18.8 + dino.position.y * 0.06;

  const idealCameraPos = new THREE.Vector3(targetX, targetY, targetZ);
  const idealCameraTarget = new THREE.Vector3(
    dino.position.x * 0.14,
    1.35 + dino.position.y * 0.08,
    -11.5
  );

  if (gamePhase === "transition") {
    const ease = easeInOutCubic(transitionProgress);

    camera.position.lerpVectors(INTRO_CAM_POS, idealCameraPos, ease);
    cameraTarget.lerpVectors(INTRO_CAM_TARGET, idealCameraTarget, ease);
    camera.lookAt(cameraTarget);
    
    const newOffsetX = THREE.MathUtils.lerp(window.innerWidth * 0.15, 0, ease);
    if (newOffsetX < 1) {
      camera.clearViewOffset();
    } else {
      camera.setViewOffset(window.innerWidth, window.innerHeight, newOffsetX, 0, window.innerWidth, window.innerHeight);
    }
  } else {
    const blend = 1 - Math.pow(0.002, delta);

    camera.position.lerp(idealCameraPos, blend);
    cameraTarget.lerp(idealCameraTarget, blend);

    if (camera.view && camera.view.offsetX > 0.1) {
       const newOffsetX = THREE.MathUtils.lerp(camera.view.offsetX, 0, blend);
       if (newOffsetX < 1) {
         camera.clearViewOffset();
       } else {
         camera.setViewOffset(window.innerWidth, window.innerHeight, newOffsetX, 0, window.innerWidth, window.innerHeight);
       }
    }

    if (cameraShake > 0) {
      cameraShake = Math.max(0, cameraShake - delta * 1.8);
      camera.position.x += (Math.random() - 0.5) * cameraShake;
      camera.position.y += (Math.random() - 0.5) * cameraShake;
    }

    camera.lookAt(cameraTarget);
  }
}

function updateGame(delta) {
  if (gamePhase === "idle") {
    updateDayNightCycle(0);
    animateEnvironment(delta);
    updateCamera(delta);
    applyEnvironmentFade();
    return;
  }

  if (gamePhase === "transition") {
    transitionProgress += delta / 1.5;
    if (transitionProgress >= 1) {
      transitionProgress = 1;
      gamePhase = "playing";
    }
    worldSpeed = WORLD.baseSpeed * transitionProgress;
  } else {
    elapsed += delta;
    worldSpeed = Math.min(
      WORLD.maxSpeed,
      WORLD.baseSpeed + elapsed * 0.43
    );
  }

  score += delta * worldSpeed * 0.61;

  updateDayNightCycle(delta);
  animateDino(delta);
  animateObstacles(delta);
  animateEnvironment(delta);
  detectCollision();
  updateCamera(delta);
  applyEnvironmentFade();
  updateScore();
}


let fpsFrames = 0;
let fpsLastTime = performance.now();

function renderLoop() {
  requestAnimationFrame(renderLoop);

  fpsFrames++;
  const now = performance.now();
  if (now - fpsLastTime >= 1000) {
    ui.fpsCounter.innerText = `${fpsFrames} FPS`;
    fpsFrames = 0;
    fpsLastTime = now;
  }

  const rawDelta = Math.min(clock.getDelta(), 0.05);

  if (debugMode) {
    if (orbitControls) orbitControls.update();
    const effectiveDelta = rawDelta * debugSpeedMultiplier;
    if (effectiveDelta > 0 && gamePhase !== "idle" && gamePhase !== "gameover") {
      updateGame(effectiveDelta);
    } else {
      updateCamera(rawDelta);
    }
    updateHitboxHelpers();

  } else if (!paused && !infoOpen && gamePhase !== "gameover") {
    updateGame(rawDelta);
  } else {
    updateCamera(rawDelta);
  }

  if (showTelemetry) {
    document.getElementById('tel-speed').textContent = worldSpeed.toFixed(1);
    document.getElementById('tel-phase').textContent = gamePhase.toUpperCase();
    
    let nextObs = null;
    let minZ = Infinity;
    for (const obs of obstacles) {
      if (obs.position.z < dino.position.z && obs.position.z > -1000) {
        if (Math.abs(obs.position.z - dino.position.z) < minZ) {
          minZ = Math.abs(obs.position.z - dino.position.z);
          nextObs = obs;
        }
      }
    }
    if (nextObs) {
      document.getElementById('tel-obs').textContent = minZ.toFixed(1) + 'M';
    } else {
      document.getElementById('tel-obs').textContent = '---';
    }
  }

  if (debugMode) {
    gameOverOverlay.material.opacity = 0;
  } else if (gamePhase === "gameover" || paused || infoOpen) {
    gameOverOverlay.material.opacity = THREE.MathUtils.lerp(gameOverOverlay.material.opacity, 0.85, rawDelta * 3);
  } else {
    gameOverOverlay.material.opacity = 0;
  }

  renderer.clear();
  if (gamePhase === "gameover" || paused || infoOpen) {
    camera.layers.set(0);
    renderer.render(scene, camera);

    renderer.clearDepth();
    camera.layers.set(1);
    const bg = scene.background;
    scene.background = null;
    renderer.render(scene, camera);
    scene.background = bg;
  } else {
    camera.layers.set(0);
    renderer.render(scene, camera);
  }
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", handleResize);

// Leaderboard logic
async function refreshLeaderboard() {
  if (!ui.lbList) return;
  ui.lbList.innerHTML = "<li>Loading...</li>";
  const scores = await getTopScores(10);
  ui.lbList.innerHTML = "";
  if (scores.length === 0) {
    ui.lbList.innerHTML = "<li>No scores yet.</li>";
    return;
  }
  scores.forEach((s) => {
    const li = document.createElement("li");
    const nameSpan = document.createElement("span");
    nameSpan.className = "lbName";
    nameSpan.textContent = s.username;
    const scoreSpan = document.createElement("span");
    scoreSpan.textContent = s.score;
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    ui.lbList.appendChild(li);
  });
}

async function showFullLeaderboard() {
  if (!ui.fullLeaderboardModal) return;
  ui.fullLeaderboardModal.classList.remove("hidden");
  ui.fullLbTableBody.innerHTML = "<tr><td colspan='4' style='text-align: center;'>Loading...</td></tr>";
  const scores = await getTopScores(0); // 0 means all
  ui.fullLbTableBody.innerHTML = "";
  if (scores.length === 0) {
    ui.fullLbTableBody.innerHTML = "<tr><td colspan='4' style='text-align: center;'>No scores yet.</td></tr>";
    return;
  }
  scores.forEach((s, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${s.username}</td>
      <td>${s.score}</td>
      <td>${s.location || "Unknown"}</td>
    `;
    ui.fullLbTableBody.appendChild(tr);
  });
}

if (ui.lbMoreBtn) {
  ui.lbMoreBtn.addEventListener("click", showFullLeaderboard);
}
if (ui.lbCloseBtn) {
  ui.lbCloseBtn.addEventListener("click", () => {
    ui.fullLeaderboardModal.classList.add("hidden");
  });
}

// Initial leaderboard fetch
refreshLeaderboard();

resetGame();
renderLoop();
