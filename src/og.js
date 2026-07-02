import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const container = document.getElementById("og-container");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf8f8f8);
scene.fog = new THREE.Fog(0xf8f8f8, 20, 100);

const camera = new THREE.PerspectiveCamera(
  45,
  1200 / 630,
  0.1,
  240
);
camera.position.set(14, 2, 0);
camera.lookAt(0, 4, 0);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
  alpha: false,
  preserveDrawingBuffer: true
});
renderer.setSize(1200, 630);
renderer.setPixelRatio(2);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd7d7d7, 2.25);
scene.add(hemiLight);

const sunlight = new THREE.DirectionalLight(0xffffff, 3.2);
sunlight.position.set(-25, 45, 25);
sunlight.target.position.set(0, 0, 0);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
sunlight.shadow.camera.left = -20;
sunlight.shadow.camera.right = 20;
sunlight.shadow.camera.top = 20;
sunlight.shadow.camera.bottom = -20;
scene.add(sunlight);
scene.add(sunlight.target);

// Ground
const groundMat = new THREE.MeshStandardMaterial({
  color: 0xf3f3f3,
  roughness: 1
});
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  groundMat
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const materials = {
  dino: new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.96 })
};

function box(w, h, d, material = materials.dino) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Cactus
function createVoxelCactus(scale = 1) {
  const group = new THREE.Group();
  const trunk = box(0.62 * scale, 3.15 * scale, 0.62 * scale);
  trunk.position.y = 1.575 * scale;
  group.add(trunk);
  const cap = box(0.5 * scale, 0.2 * scale, 0.5 * scale);
  cap.position.y = 3.24 * scale;
  group.add(cap);
  const leftVertical = box(0.48 * scale, 1.38 * scale, 0.48 * scale);
  leftVertical.position.set(-0.7 * scale, 1.78 * scale, 0);
  group.add(leftVertical);
  const leftBridge = box(0.86 * scale, 0.46 * scale, 0.48 * scale);
  leftBridge.position.set(-0.4 * scale, 1.38 * scale, 0);
  group.add(leftBridge);
  const rightVertical = box(0.48 * scale, 1.52 * scale, 0.48 * scale);
  rightVertical.position.set(0.7 * scale, 1.9 * scale, 0);
  group.add(rightVertical);
  const rightBridge = box(0.86 * scale, 0.46 * scale, 0.48 * scale);
  rightBridge.position.set(0.4 * scale, 1.48 * scale, 0);
  group.add(rightBridge);
  return group;
}

const cactus1 = createVoxelCactus(1.2);
cactus1.position.set(0, 0, -5);
cactus1.rotation.y = Math.PI / 6;
scene.add(cactus1);

const cactus2 = createVoxelCactus(0.8);
cactus2.position.set(1.5, 0, -7);
cactus2.rotation.y = -Math.PI / 4;
scene.add(cactus2);

// Load Dino GLTF
const gltfLoader = new GLTFLoader();
gltfLoader.load('/3d_chrome_dino_walking.glb', (gltf) => {
  const modelScene = gltf.scene;
  modelScene.rotation.y = Math.PI / 2;
  modelScene.scale.setScalar(1.5);
  modelScene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Pick a good frame for a run pose
  const sketchfabModel = modelScene.children[0];
  const timeframeGroup = sketchfabModel?.children[0];
  if (timeframeGroup) {
    const frames = [...timeframeGroup.children];
    for (let i = 0; i < frames.length; i++) {
      frames[i].scale.setScalar(i === 2 ? 1 : 1e-10);
    }
  }

  modelScene.position.set(0, 0, 0);
  scene.add(modelScene);

  // Render once it's loaded
  renderer.render(scene, camera);
});

// Initial render
renderer.render(scene, camera);

document.getElementById("downloadBtn").addEventListener("click", () => {
  const downloadCanvas = document.createElement("canvas");
  downloadCanvas.width = 1200;
  downloadCanvas.height = 630;
  const ctx = downloadCanvas.getContext("2d");
  
  ctx.drawImage(renderer.domElement, 0, 0, 1200, 630);
  
  // Custom font loading might need to be awaited in some edge cases, 
  // but it's loaded via CSS so we assume it's ready.
  ctx.font = "64px 'Press Start 2P', monospace";
  ctx.fillStyle = "#343434";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("DINO 3D", 600, 60);
  
  ctx.font = "24px 'Press Start 2P', monospace";
  ctx.fillStyle = "#767676";
  ctx.fillText("THE 3D RUNNER EXPERIENCE", 600, 150);
  
  const link = document.createElement("a");
  link.download = "dino-3d-og.png";
  link.href = downloadCanvas.toDataURL("image/png");
  link.click();
});

document.getElementById("shareBtn").addEventListener("click", async () => {
  const btn = document.getElementById("shareBtn");
  const url = window.location.origin; // Share the main game URL, not the og.html page itself usually, or maybe share the og page. Actually let's share the main game URL.
  const shareData = {
    title: 'Dino 3D',
    text: 'Check out this awesome 3D Dino Runner game!',
    url: url
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(url);
      btn.style.background = '#4caf50';
      btn.style.borderColor = '#4caf50';
      btn.textContent = 'COPIED!';
      setTimeout(() => {
        btn.style.background = '#343434';
        btn.style.borderColor = '#343434';
        btn.textContent = 'SHARE LINK';
      }, 1500);
    }
  } catch (err) {
    console.error('Error sharing:', err);
  }
});
