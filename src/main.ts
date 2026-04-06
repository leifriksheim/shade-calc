import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import SunCalc from 'suncalc';
import GUI from 'lil-gui';

// --- Infinite Ground Helper ---
class InfiniteGround extends THREE.Mesh {
  constructor(color = new THREE.Color(0x666666), distance = 800) {
    const geometry = new THREE.PlaneGeometry(2000, 2000, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      transparent: true,
      side: THREE.DoubleSide,
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDistance = { value: distance };
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform float uDistance;
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        #include <opaque_fragment>
        // Fade based on distance from camera
        float dist = length(vViewPosition); // vViewPosition is in view space
        float alpha = 1.0 - smoothstep(uDistance * 0.5, uDistance, dist);
        gl_FragColor.a *= alpha;
        `
      );
    };

    super(geometry, material);
    this.rotation.x = -Math.PI / 2;
    this.receiveShadow = true;
  }
}

// --- Parameters ---
const params = {
  // Wall
  wallHeight: 3,
  wallWidth: 5,
  wallThickness: 0.2,
  wallRotation: 0, // Degrees
  // Window
  windowWidth: 1.5,
  windowHeight: 1.2,
  windowX: 1.75, // Horizontal offset from left
  windowY: 1.0,  // Vertical offset from bottom
  // Shade
  shadeLength: 0.8,
  shadeWidth: 2.5,
  shadeHeight: 0.1, // Offset above window top
  shadeAngle: 15,   // Degrees
  // Sun Position
  latitude: 38.7223, // Default to Lisbon
  longitude: -9.1393,
  month: new Date().getMonth() + 1, // 1-12
  day: new Date().getDate(),
  time: 12, // Hour of day
};

// --- URL Sync ---
function syncParamsFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  for (const key in params) {
    if (urlParams.has(key)) {
      const val = urlParams.get(key);
      if (val !== null) {
        // @ts-ignore
        const currentVal = params[key];
        if (typeof currentVal === 'number') {
          // @ts-ignore
          params[key] = parseFloat(val);
        } else if (typeof currentVal === 'boolean') {
          // @ts-ignore
          params[key] = val === 'true';
        } else {
          // @ts-ignore
          params[key] = val;
        }
      }
    }
  }
}

function updateUrl() {
  const url = new URL(window.location.href);
  for (const key in params) {
    // @ts-ignore
    url.searchParams.set(key, params[key].toString());
  }
  window.history.replaceState({}, '', url.toString());
}

syncParamsFromUrl();

const sunStats = {
  currentTime: '',
  latitude: 0,
  longitude: 0,
  altitude: 0,
  azimuth: 0
};

// --- Scene Setup ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(15, 10, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; 
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
document.body.appendChild(renderer.domElement);

// --- Sky ---
const sky = new Sky();
sky.scale.setScalar(450000);
scene.add(sky);

const skyParams = {
  turbidity: 2,
  rayleigh: 1.5,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
};

function updateSkyUniforms() {
  const uniforms = sky.material.uniforms;
  uniforms['turbidity'].value = skyParams.turbidity;
  uniforms['rayleigh'].value = skyParams.rayleigh;
  uniforms['mieCoefficient'].value = skyParams.mieCoefficient;
  uniforms['mieDirectionalG'].value = skyParams.mieDirectionalG;
}
updateSkyUniforms();

// --- Rendering Logic ---
let renderRequested = false;

function requestRenderIfNotRequested() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(render);
  }
}

function render() {
  renderRequested = false;
  const changed = controls.update();
  
  // Follow camera XZ
  grid.position.x = camera.position.x;
  grid.position.z = camera.position.z;

  renderer.render(scene, camera);
  if (changed) {
    requestRenderIfNotRequested();
  }
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.addEventListener('change', () => requestRenderIfNotRequested());

// --- Objects ---
// (No fixed ground mesh, just the infinite ground)

const grid = new InfiniteGround(new THREE.Color(0xbcbcbc), 800);
scene.add(grid);

const northArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.05, 0), 10, 0xff0000);
scene.add(northArrow);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 512;
sunLight.shadow.mapSize.height = 512;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 500;
sunLight.shadow.camera.left = -10;
sunLight.shadow.camera.right = 10;
sunLight.shadow.camera.top = 10;
sunLight.shadow.camera.bottom = -10;
scene.add(sunLight);

const lightTarget = new THREE.Object3D();
scene.add(lightTarget);
sunLight.target = lightTarget;

const sunVisualizer = new THREE.Mesh(
  new THREE.SphereGeometry(3, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffff00 })
);
scene.add(sunVisualizer);

const wallGroup = new THREE.Group();
scene.add(wallGroup);

let wallMesh: THREE.Mesh | null = null;
let shadeGroup: THREE.Group | null = null;

function updateObjects() {
  if (wallMesh) {
    wallMesh.geometry.dispose();
    if (Array.isArray(wallMesh.material)) wallMesh.material.forEach(m => m.dispose());
    else wallMesh.material.dispose();
    wallGroup.remove(wallMesh);
  }
  if (shadeGroup) {
    shadeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    wallGroup.remove(shadeGroup);
  }

  wallGroup.rotation.y = THREE.MathUtils.degToRad(params.wallRotation);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(params.wallWidth, 0);
  shape.lineTo(params.wallWidth, params.wallHeight);
  shape.lineTo(0, params.wallHeight);
  shape.closePath();

  const wx = Math.max(0, Math.min(params.windowX, params.wallWidth - 0.1));
  const wy = Math.max(0, Math.min(params.windowY, params.wallHeight - 0.1));
  const ww = Math.max(0.1, Math.min(params.windowWidth, params.wallWidth - wx));
  const wh = Math.max(0.1, Math.min(params.windowHeight, params.wallHeight - wy));

  const hole = new THREE.Path();
  hole.moveTo(wx, wy);
  hole.lineTo(wx, wy + wh);
  hole.lineTo(wx + ww, wy + wh);
  hole.lineTo(wx + ww, wy);
  hole.closePath();
  shape.holes.push(hole);

  const wallGeometry = new THREE.ExtrudeGeometry(shape, { depth: params.wallThickness, bevelEnabled: false });
  wallMesh = new THREE.Mesh(wallGeometry, new THREE.MeshStandardMaterial({ color: 0xcccccc }));
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  wallMesh.position.set(-params.wallWidth / 2, 0, -params.wallThickness / 2);
  wallGroup.add(wallMesh);

  shadeGroup = new THREE.Group();
  const shadeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(params.shadeWidth, params.shadeLength, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xaa5555 })
  );
  shadeMesh.castShadow = true;
  shadeMesh.receiveShadow = true;
  shadeGroup.position.set(wx + ww / 2 - params.wallWidth / 2, wy + wh + params.shadeHeight, params.wallThickness / 2);
  shadeGroup.rotation.x = THREE.MathUtils.degToRad(90 + params.shadeAngle);
  shadeMesh.position.set(0, params.shadeLength / 2, 0);
  shadeGroup.add(shadeMesh);
  wallGroup.add(shadeGroup);

  updateUrl();
  renderer.shadowMap.needsUpdate = true;
  requestRenderIfNotRequested();
}

function updateSun() {
  const now = new Date();
  const date = new Date(now.getFullYear(), params.month - 1, params.day);
  date.setHours(Math.floor(params.time), (params.time % 1) * 60, 0, 0);

  const sunPos = SunCalc.getPosition(date, params.latitude, params.longitude);
  const altitude = sunPos.altitude; // in radians
  const azimuth = sunPos.azimuth;

  sunStats.currentTime = date.toISOString().replace('T', ' ').substring(0, 19);
  sunStats.latitude = params.latitude;
  sunStats.longitude = params.longitude;
  sunStats.altitude = (altitude * 180 / Math.PI);
  sunStats.azimuth = (azimuth * 180 / Math.PI);

  const distance = 400000; 
  const x = -Math.sin(azimuth) * Math.cos(altitude) * distance;
  const y = Math.sin(altitude) * distance;
  const z = Math.cos(azimuth) * Math.cos(altitude) * distance;

  sunLight.position.set(x / 1000, y / 1000, z / 1000);
  sunVisualizer.position.set(x / 1000, y / 1000, z / 1000);
  sky.material.uniforms['sunPosition'].value.set(x, y, z);
  
  lightTarget.position.set(0, params.wallHeight / 2, 0);
  
  if (altitude < -0.02) { // Allow sun to be slightly below horizon visually
    sunLight.intensity = 0;
    ambientLight.intensity = 0.05;
    sunVisualizer.visible = false;
  } else {
    // Dramatic color transitions
    const sunsetColor = new THREE.Color(0xff4400); // Deep Orange
    const afternoonColor = new THREE.Color(0xffaa33); // Golden
    const dayColor = new THREE.Color(0xffffff); // White
    
    // Altitude in degrees for easier mapping
    const altDeg = altitude * 180 / Math.PI;
    
    if (altDeg < 2) {
      // Sunset range: very low
      sunLight.color.lerpColors(sunsetColor, afternoonColor, Math.max(0, altDeg / 2));
      sunLight.intensity = THREE.MathUtils.lerp(0.8, 1.2, Math.max(0, altDeg / 2));
    } else if (altDeg < 15) {
      // Afternoon range: low
      sunLight.color.lerpColors(afternoonColor, dayColor, (altDeg - 2) / 13);
      sunLight.intensity = THREE.MathUtils.lerp(1.2, 1.5, (altDeg - 2) / 13);
    } else {
      sunLight.color.copy(dayColor);
      sunLight.intensity = 1.5;
    }
    
    // Ambient light should be stronger to avoid black walls
    ambientLight.intensity = THREE.MathUtils.lerp(0.15, 0.5, Math.min(altDeg / 30, 1));
    ambientLight.color.copy(sunLight.color).lerp(new THREE.Color(0xffffff), 0.3);
    
    // Sync visualizer color
    if (sunVisualizer.material instanceof THREE.MeshBasicMaterial) {
      sunVisualizer.material.color.copy(sunLight.color);
    }
    
    sunVisualizer.visible = true;
  }
  updateUrl();
  renderer.shadowMap.needsUpdate = true;
  requestRenderIfNotRequested();
}

// --- GUI ---
const gui = new GUI();

const wallFolder = gui.addFolder('Wall & Orientation');
wallFolder.add(params, 'wallHeight', 1, 10).onChange(updateObjects);
wallFolder.add(params, 'wallWidth', 1, 20).onChange(updateObjects);
wallFolder.add(params, 'wallThickness', 0.1, 1).onChange(updateObjects);
wallFolder.add(params, 'wallRotation', 0, 360).name('Rotation (°)').listen().onChange(updateObjects);

const cardinalDirections = {
  'South (0°)': 0,
  'South-West (45°)': 45,
  'West (90°)': 90,
  'North-West (135°)': 135,
  'North (180°)': 180,
  'North-East (225°)': 225,
  'East (270°)': 270,
  'South-East (315°)': 315
};

wallFolder.add({ direction: 0 }, 'direction', cardinalDirections).name('Facing').onChange((val: number) => {
  params.wallRotation = val;
  updateObjects();
});

const windowFolder = gui.addFolder('Window');
windowFolder.add(params, 'windowWidth', 0.5, 5).onChange(updateObjects);
windowFolder.add(params, 'windowHeight', 0.5, 5).onChange(updateObjects);
windowFolder.add(params, 'windowX', 0, 15).onChange(updateObjects);
windowFolder.add(params, 'windowY', 0, 10).onChange(updateObjects);

const shadeFolder = gui.addFolder('Shade');
shadeFolder.add(params, 'shadeLength', 0.1, 5).name('Projection (Out)').onChange(updateObjects);
shadeFolder.add(params, 'shadeWidth', 0.1, 10).name('Width (Along Wall)').onChange(updateObjects);
shadeFolder.add(params, 'shadeHeight', -1, 1).name('Height Offset').onChange(updateObjects);
shadeFolder.add(params, 'shadeAngle', 0, 90).name('Angle (°)').onChange(updateObjects);

const sunFolder = gui.addFolder('Sun & Location');
sunFolder.add(params, 'latitude', -90, 90).listen().onChange(updateSun);
sunFolder.add(params, 'longitude', -180, 180).listen().onChange(updateSun);

const geoAction = {
  useMyLocation: () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          params.latitude = position.coords.latitude;
          params.longitude = position.coords.longitude;
          updateSun();
        },
        (error) => alert("Location error: " + error.message),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  }
};
sunFolder.add(geoAction, 'useMyLocation').name('📍 Use My Location');

sunFolder.add(params, 'month', 1, 12, 1).name('Month').onChange(updateSun);
sunFolder.add(params, 'day', 1, 31, 1).name('Day').onChange(updateSun);
sunFolder.add(params, 'time', 0, 23.9, 0.1).name('Hour (0-23.9)').onChange(updateSun);

const statsFolder = gui.addFolder('Calculated Sun Stats');
statsFolder.add(sunStats, 'currentTime').name('Calc Date').listen().disable();
statsFolder.add(sunStats, 'latitude').name('Latitude').listen().disable();
statsFolder.add(sunStats, 'longitude').name('Longitude').listen().disable();
statsFolder.add(sunStats, 'altitude').name('Altitude (°)').listen().disable();
statsFolder.add(sunStats, 'azimuth').name('Azimuth (°)').listen().disable();

// --- Initial Setup ---
updateObjects();
updateSun();
requestRenderIfNotRequested();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  requestRenderIfNotRequested();
});
