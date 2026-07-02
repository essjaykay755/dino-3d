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
  birdUnlockScore: 450
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
scene.fog = new THREE.Fog(0xf8f8f8, 52, 168);

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

gltfLoader.load('/3d_chrome_bird_flying.glb', (gltf) => {
  birdGLTF = gltf;
  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
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
  new THREE.PlaneGeometry(220, 270),
  materials.ground
);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -86;
ground.receiveShadow = true;
scene.add(ground);

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

  const trunk = box(0.62 * scale, 3.15 * scale, 0.62 * scale);
  trunk.position.y = 1.575 * scale;
  group.add(trunk);

  const cap = box(0.5 * scale, 0.2 * scale, 0.5 * scale);
  cap.position.y = 3.24 * scale;
  group.add(cap);

  const leftHeight = armVariant === 1 ? 2.02 : 1.78;
  const rightHeight = armVariant === 2 ? 2.08 : 1.9;

  const leftVertical = box(0.48 * scale, 1.38 * scale, 0.48 * scale);
  leftVertical.position.set(-0.7 * scale, leftHeight * scale, 0);
  group.add(leftVertical);

  const leftBridge = box(0.86 * scale, 0.46 * scale, 0.48 * scale);
  leftBridge.position.set(-0.4 * scale, 1.38 * scale, 0);
  group.add(leftBridge);

  const rightVertical = box(0.48 * scale, 1.52 * scale, 0.48 * scale);
  rightVertical.position.set(0.7 * scale, rightHeight * scale, 0);
  group.add(rightVertical);

  const rightBridge = box(0.86 * scale, 0.46 * scale, 0.48 * scale);
  rightBridge.position.set(0.4 * scale, 1.48 * scale, 0);
  group.add(rightBridge);

  for (let i = 0; i < 5; i++) {
    const rubble = box(
      THREE.MathUtils.randFloat(0.12, 0.23) * scale,
      THREE.MathUtils.randFloat(0.08, 0.14) * scale,
      THREE.MathUtils.randFloat(0.12, 0.24) * scale,
      materials.pebble
    );
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

const pebbles = [];
const pebbleGeometry = new THREE.BoxGeometry(0.13, 0.055, 0.26);

for (let i = 0; i < 180; i++) {
  const pebble = new THREE.Mesh(pebbleGeometry, materials.pebble);
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

const backgroundTexts = [];
const fontLoader = new FontLoader();
fontLoader.load(helvetikerFontUrl, (font) => {
  const material = materials.pebble;

  const createText = (text, size) => {
    const geo = new TextGeometry(text, { font, size, depth: 0.2, curveSegments: 3, bevelEnabled: false });
    geo.computeBoundingBox();
    geo.translate(-(geo.boundingBox.max.x - geo.boundingBox.min.x) / 2, 0, 0);
    const mesh = new THREE.Mesh(geo, material);
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
let orbitControls = null;
const savedCamState = { position: new THREE.Vector3(), target: new THREE.Vector3() };

const debugUI = document.createElement('div');
debugUI.id = 'debug-indicator';
function updateDebugUI() {
  debugUI.textContent = `🔍 DEBUG MODE — drag to orbit, scroll to zoom, \` to exit | God Mode (G): ${godMode ? 'ON' : 'OFF'}`;
}
updateDebugUI();
debugUI.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99;background:rgba(0,0,0,0.75);color:#fff;font:12px/1.4 monospace;padding:8px 16px;border-radius:6px;pointer-events:none;display:none';
document.body.appendChild(debugUI);

const eyeEditor = document.createElement('div');
eyeEditor.style.cssText = 'position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.8);color:#fff;padding:15px;font-family:monospace;z-index:999;display:none;border-radius:8px;pointer-events:auto;max-height:90vh;overflow-y:auto;';
eyeEditor.innerHTML = `
  <div style="margin-bottom:8px;font-weight:bold;text-align:center;color:#4af;">Right Eye</div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">X:</label>
    <input type="range" id="rEyeX" min="-1" max="1" step="0.01" style="margin:0 10px;">
    <span id="rValX" style="width:40px;text-align:right;"></span>
  </div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">Y:</label>
    <input type="range" id="rEyeY" min="0" max="4" step="0.01" style="margin:0 10px;">
    <span id="rValY" style="width:40px;text-align:right;"></span>
  </div>
  <div style="display:flex;align-items:center;margin-bottom:16px;">
    <label style="width:20px">Z:</label>
    <input type="range" id="rEyeZ" min="-2" max="1" step="0.01" style="margin:0 10px;">
    <span id="rValZ" style="width:40px;text-align:right;"></span>
  </div>

  <div style="margin-bottom:8px;font-weight:bold;text-align:center;color:#f4a;">Left Eye</div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">X:</label>
    <input type="range" id="lEyeX" min="-1" max="1" step="0.01" style="margin:0 10px;">
    <span id="lValX" style="width:40px;text-align:right;"></span>
  </div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">Y:</label>
    <input type="range" id="lEyeY" min="0" max="4" step="0.01" style="margin:0 10px;">
    <span id="lValY" style="width:40px;text-align:right;"></span>
  </div>
  <div style="display:flex;align-items:center;margin-bottom:8px;">
    <label style="width:20px">Z:</label>
    <input type="range" id="lEyeZ" min="-2" max="1" step="0.01" style="margin:0 10px;">
    <span id="lValZ" style="width:40px;text-align:right;"></span>
  </div>
  <div style="margin-top:10px;font-size:10px;color:#aaa;text-align:center;">Send me the X, Y, Z values!</div>
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

function toggleDebug() {
  debugMode = !debugMode;

  if (debugMode) {
    savedCamState.position.copy(camera.position);
    savedCamState.target.copy(cameraTarget);
    if (gamePhase !== "idle" && !paused) pauseGame(true);
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.target.copy(cameraTarget);
    orbitControls.update();
    debugUI.style.display = 'block';
    document.getElementById('hud').style.display = 'none';
  } else {
    if (orbitControls) { orbitControls.dispose(); orbitControls = null; }
    camera.position.copy(savedCamState.position);
    cameraTarget.copy(savedCamState.target);
    camera.lookAt(cameraTarget);
    debugUI.style.display = 'none';
    document.getElementById('hud').style.display = '';
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
  const cycle = score % 1000;
  targetNightPhase = (cycle > 700) ? 1 : 0;

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

    scene.background.lerpColors(colDayBg, colNightBg, nightPhase);
    scene.fog.color.copy(scene.background);
    if (typeof gameOverOverlay !== "undefined") gameOverOverlay.material.color.lerpColors(overlayDay, overlayNight, nightPhase);

    cloudMaterial.color.lerpColors(colDayCloud, colNightCloud, nightPhase);

    materials.dino.color.lerpColors(colDayDino, colNightDino, nightPhase);
    materials.dinoLight.color.lerpColors(colDayDinoLight, colNightDinoLight, nightPhase);
    materials.ground.color.lerpColors(colDayGround, colNightGround, nightPhase);
    materials.pebble.color.lerpColors(colDayPebble, colNightPebble, nightPhase);

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

    rootStyle.setProperty('--paper', `#${uiPaper.getHexString()}`);
    rootStyle.setProperty('--paper-trans', `rgba(${r}, ${g}, ${b}, 0.92)`);
    rootStyle.setProperty('--ink', `#${currentInk.getHexString()}`);
    rootStyle.setProperty('--mid', `#${currentMid.getHexString()}`);
    rootStyle.setProperty('--btn-active', `rgba(${Math.round(currentBtnActive.r * 255)}, ${Math.round(currentBtnActive.g * 255)}, ${Math.round(currentBtnActive.b * 255)}, 0.94)`);
    rootStyle.setProperty('--shadow-solid', `#${currentShadow.getHexString()}`);
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

window.addEventListener("keydown", (event) => {
  // If typing inside input fields, bypass game input handler
  if (document.activeElement && document.activeElement.tagName === "INPUT") {
    return;
  }

  if (event.code === "KeyR") {
    if (!rKeyHolding) {
      startHoldingR();
    }
    return;
  }

  if (event.code === "Backquote") {
    toggleDebug();
    return;
  }

  if (event.code === "KeyG" && debugMode) {
    godMode = !godMode;
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
    } else {
      keys[control] = true;
    }
  };

  const release = (event) => {
    event.preventDefault();
    button.classList.remove("active");
    if (control !== "jump" && control !== "pause") keys[control] = false;
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

  const delta = Math.min(clock.getDelta(), 0.05);

  if (debugMode) {
    if (orbitControls) orbitControls.update();
  } else if (!paused && !infoOpen && gamePhase !== "gameover") {
    updateGame(delta);
  } else {
    updateCamera(delta);
  }

  if (gamePhase === "gameover" || paused || infoOpen) {
    gameOverOverlay.material.opacity = THREE.MathUtils.lerp(gameOverOverlay.material.opacity, 0.85, delta * 3);
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
