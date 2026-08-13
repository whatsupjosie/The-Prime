import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';
import Retargeter from '/static/retarget/retarget.js';

const el = (id) => document.getElementById(id);

let scene, camera, renderer, controls, gltfLoader;
let skinned = null;
let retargeter = new Retargeter();
let ws = null;

function init() {
  const container = el('pose3d');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0f14);
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(0.5, 1.3, 2.4);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.0, 0);
  gltfLoader = new GLTFLoader();
  const amb = new THREE.AmbientLight(0xffffff, 0.7);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(2, 4, 2);
  scene.add(amb, dir);
  const grid = new THREE.GridHelper(10, 10, 0x334455, 0x223344);
  scene.add(grid);
  const resize = () => {
    const w = container.clientWidth; const h = container.clientHeight;
    camera.aspect = Math.max(0.01, w / Math.max(1, h));
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  resize();
  new ResizeObserver(resize).observe(container);
  const tick = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(tick); };
  tick();
}

async function loadModel(url, mapUrl) {
  // clear existing
  if (skinned) {
    try { scene.remove(skinned); } catch {}
  }
  const gltf = await gltfLoader.loadAsync(url);
  let found = null;
  gltf.scene.traverse((n) => { if (!found && n.isSkinnedMesh) found = n; });
  if (!found) throw new Error('No SkinnedMesh in GLTF');
  skinned = found;
  scene.add(gltf.scene);
  await retargeter.loadMapping(mapUrl);
  retargeter.bindSkinnedMesh(skinned);
  el('status').textContent = 'Model loaded and bound.';
}

function connectPose(room) {
  if (ws) { try { ws.close(); } catch {} }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws/${encodeURIComponent(room)}`;
  ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data || '{}');
      if (msg.type === 'pose.frame' && msg.payload && msg.payload.pose) {
        retargeter.applyCanonicalPose(msg.payload.pose);
      }
    } catch {}
  };
  ws.onopen = () => { el('status').textContent = `Pose connected: room ${room}`; };
  ws.onclose = () => { el('status').textContent = 'Pose disconnected'; };
}

window.addEventListener('DOMContentLoaded', () => {
  init();
  el('load-model').addEventListener('click', async () => {
    const url = (el('gltf-url').value || '').trim();
    const mapUrl = (el('map-url').value || '').trim();
    if (!url || !mapUrl) return;
    try { await loadModel(url, mapUrl); } catch (e) { el('status').textContent = 'Load error: ' + (e?.message||e); }
  });
  el('connect-pose').addEventListener('click', () => {
    const room = (el('room-id').value || 'green').trim();
    connectPose(room);
  });
});

