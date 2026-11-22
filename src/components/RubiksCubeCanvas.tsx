import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Eye, EyeOff, Play, RotateCcw, Shuffle } from 'lucide-react';
import { MOVE_DICTIONARY } from '../data/curriculum';
import { CubeFocusMode, MoveNotation } from '../types/rubik';

export interface RubiksCubeHandle {
  playMoves: (moves: MoveNotation[], label?: string) => void;
  resetSolved: (whiteOnTop?: boolean) => void;
  scrambleCube: () => void;
  flipCubeVertical: (targetWhiteTop: boolean) => void;
}

interface RubiksCubeCanvasProps {
  focusMode: CubeFocusMode;
  whiteOnTop: boolean;
  onWhiteOnTopChange: (whiteTop: boolean) => void;
  stageTitle: string;
}

interface QueuedTurn {
  axis: 'x' | 'y' | 'z';
  layer: number | null; // null means whole cube rotation
  angle: number;
  label: string;
}

interface StickerMeta {
  material: THREE.MeshPhysicalMaterial;
  baseColor: THREE.Color;
  dimColor: THREE.Color;
  homeX: number;
  homeY: number;
  homeZ: number;
  faceDir: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
  currentBrightness: number;
  targetBrightness: number;
}

const STICKER_COLORS = {
  px: 0xdc2626, // Red (+X Right)
  nx: 0xea580c, // Orange (-X Left)
  py: 0xfacc15, // Yellow (+Y Up)
  ny: 0xf8fafc, // White (-Y Down)
  pz: 0x16a34a, // Green (+Z Front)
  nz: 0x2563eb, // Blue (-Z Back)
} as const;

const _vec3 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _axisVec = new THREE.Vector3();

function createRoundedSquareShape(size: number, radius: number): THREE.Shape {
  const s = size / 2;
  const r = Math.min(radius, s * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s);
  shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return shape;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.30)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.12)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function moveToTurn(move: MoveNotation): QueuedTurn {
  const info = MOVE_DICTIONARY[move];
  const label = `${move} — ${info.russianName}`;
  switch (move) {
    case 'R':
      return { axis: 'x', layer: 1, angle: -Math.PI / 2, label };
    case "R'":
      return { axis: 'x', layer: 1, angle: Math.PI / 2, label };
    case 'L':
      return { axis: 'x', layer: -1, angle: Math.PI / 2, label };
    case "L'":
      return { axis: 'x', layer: -1, angle: -Math.PI / 2, label };
    case 'U':
      return { axis: 'y', layer: 1, angle: -Math.PI / 2, label };
    case "U'":
      return { axis: 'y', layer: 1, angle: Math.PI / 2, label };
    case 'D':
      return { axis: 'y', layer: -1, angle: Math.PI / 2, label };
    case "D'":
      return { axis: 'y', layer: -1, angle: -Math.PI / 2, label };
    case 'F':
      return { axis: 'z', layer: 1, angle: -Math.PI / 2, label };
    case "F'":
      return { axis: 'z', layer: 1, angle: Math.PI / 2, label };
  }
}

function isStickerHighlighted(meta: StickerMeta, focus: CubeFocusMode): boolean {
  const { homeX, homeY, homeZ, faceDir } = meta;
  const absSum = Math.abs(homeX) + Math.abs(homeY) + Math.abs(homeZ);
  const isCenter = absSum === 1;
  const isEdge = absSum === 2;
  const isCorner = absSum === 3;

  switch (focus) {
    case 'all':
    case 'yellow_corners_pos':
    case 'yellow_corners_orient':
      return true;
    case 'centers':
      return isCenter;
    case 'white_cross': {
      // White center (-Y), white cross edges (homeY === -1 && edge), and the 4 middle side centers
      if (homeY === -1 && (isCenter || isEdge)) return true;
      if (homeY === 0 && isCenter) return true;
      return false;
    }
    case 'first_layer': {
      if (homeY === -1) return true;
      if (homeY === 0 && isCenter) return true;
      return false;
    }
    case 'middle_layer': {
      return homeY <= 0;
    }
    case 'yellow_cross': {
      if (homeY === 1 && (isCenter || (isEdge && faceDir === 'py'))) return true;
      if (homeY === 1 && isEdge) return true;
      return false;
    }
    case 'yellow_cross_sides': {
      if (homeY === 1 && (isCenter || isEdge)) return true;
      if (homeY === 0 && isCenter) return true;
      return false;
    }
  }
  return true;
}

const MOVE_BUTTONS: { move: MoveNotation; title: string }[] = [
  { move: 'R', title: 'Правую от себя' },
  { move: "R'", title: 'Правую на себя' },
  { move: 'U', title: 'Верхнюю влево' },
  { move: "U'", title: 'Верхнюю вправо' },
  { move: 'F', title: 'Переднюю по часовой' },
  { move: "F'", title: 'Переднюю против часовой' },
  { move: 'L', title: 'Левую на себя' },
  { move: "L'", title: 'Левую от себя' },
];

export const RubiksCubeCanvas = forwardRef<RubiksCubeHandle, RubiksCubeCanvasProps>(
  function RubiksCubeCanvas({ focusMode, whiteOnTop, onWhiteOnTopChange, stageTitle }, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [dockCollapsed, setDockCollapsed] = useState(false);
    const [slowMode, setSlowMode] = useState(true);
    const [highlightEnabled, setHighlightEnabled] = useState(true);
    const [activeMoveLabel, setActiveMoveLabel] = useState<string>('Готов к тренировке');
    const [isAnimatingUi, setIsAnimatingUi] = useState(false);

    const slowModeRef = useRef(slowMode);
    slowModeRef.current = slowMode;
    const focusModeRef = useRef(focusMode);
    focusModeRef.current = focusMode;
    const highlightEnabledRef = useRef(highlightEnabled);
    highlightEnabledRef.current = highlightEnabled;
    const whiteTopRef = useRef(whiteOnTop);
    whiteTopRef.current = whiteOnTop;

    const apiRef = useRef<{
      enqueue: (turns: QueuedTurn[], instant?: boolean) => void;
      resetSolved: (targetWhiteTop: boolean) => void;
      refreshTargets: () => void;
      requestRender: () => void;
    } | null>(null);

    useEffect(() => {
      apiRef.current?.refreshTargets();
    }, [focusMode, highlightEnabled]);

    useImperativeHandle(ref, () => ({
      playMoves(moves: MoveNotation[]) {
        if (!apiRef.current || moves.length === 0) return;
        const turns = moves.map((m) => moveToTurn(m));
        apiRef.current.enqueue(turns);
      },
      resetSolved(targetWhiteTop = whiteTopRef.current) {
        apiRef.current?.resetSolved(targetWhiteTop);
        onWhiteOnTopChange(targetWhiteTop);
        setActiveMoveLabel('Кубик собран в исходное состояние');
      },
      scrambleCube() {
        if (!apiRef.current) return;
        const pool: MoveNotation[] = ['R', "R'", 'U', "U'", 'F', "F'", 'L', "L'", 'D', "D'"];
        const seq: QueuedTurn[] = [];
        let lastAxis = '';
        for (let i = 0; i < 16; i++) {
          let candidate = pool[Math.floor(Math.random() * pool.length)];
          let turn = moveToTurn(candidate);
          while (turn.axis === lastAxis) {
            candidate = pool[Math.floor(Math.random() * pool.length)];
            turn = moveToTurn(candidate);
          }
          lastAxis = turn.axis;
          seq.push(turn);
        }
        apiRef.current.enqueue(seq, true);
        setActiveMoveLabel('Кубик перемешан (16 ходов)');
      },
      flipCubeVertical(targetWhiteTop: boolean) {
        if (!apiRef.current || targetWhiteTop === whiteTopRef.current) return;
        onWhiteOnTopChange(targetWhiteTop);
        apiRef.current.enqueue([
          {
            axis: 'z',
            layer: null,
            angle: Math.PI,
            label: targetWhiteTop ? 'Переворот: белый центр сверху' : 'Переворот: жёлтый центр сверху',
          },
        ]);
      },
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = (() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      })();

      const width = container.clientWidth || 720;
      const height = container.clientHeight || 560;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf1f5f9);
      scene.fog = new THREE.Fog(0xf1f5f9, 14, 28);

      const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
      camera.position.set(4.5, 3.6, 5.1);

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envScene = new RoomEnvironment();
      const envTarget = pmremGenerator.fromScene(envScene, 0.04);
      scene.environment = envTarget.texture;
      pmremGenerator.dispose();
      envScene.dispose();

      // Studio lighting rig: warm key + cool fill + soft rim
      const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0xcbd5e1, 0.85);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.55);
      keyLight.position.set(5.5, 8.5, 6.0);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -4;
      keyLight.shadow.camera.right = 4;
      keyLight.shadow.camera.top = 4;
      keyLight.shadow.camera.bottom = -4;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 22;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0xe2e8f0, 0.65);
      rimLight.position.set(-5.5, -3.5, -5.0);
      scene.add(rimLight);

      // Grounding contact shadow plane beneath the cube
      const shadowTex = createContactShadowTexture();
      const shadowPlaneGeo = new THREE.PlaneGeometry(5.6, 5.6);
      const shadowPlaneMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
      });
      const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = -2.28;
      scene.add(shadowPlane);

      // Orbit controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.minDistance = 4.6;
      controls.maxDistance = 10.5;
      controls.rotateSpeed = 0.78;
      controls.target.set(0, 0, 0);

      // Build beveled cubie + raised sticker geometry
      const bodyShape = createRoundedSquareShape(0.84, 0.1);
      const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
        depth: 0.84,
        bevelEnabled: true,
        bevelThickness: 0.055,
        bevelSize: 0.055,
        bevelSegments: 3,
        curveSegments: 8,
      });
      bodyGeo.center();

      const stickerShape = createRoundedSquareShape(0.72, 0.075);
      const stickerGeo = new THREE.ExtrudeGeometry(stickerShape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.008,
        bevelSegments: 2,
        curveSegments: 6,
      });
      stickerGeo.center();

      const plasticMaterial = new THREE.MeshStandardMaterial({
        color: 0x161920,
        roughness: 0.48,
        metalness: 0.04,
      });

      const cubeRoot = new THREE.Group();
      scene.add(cubeRoot);

      const cubies: THREE.Group[] = [];
      const stickerMetas: StickerMeta[] = [];

      const createSticker = (
        faceDir: StickerMeta['faceDir'],
        hex: number,
        homeX: number,
        homeY: number,
        homeZ: number
      ) => {
        const baseColor = new THREE.Color(hex);
        const dimColor = baseColor.clone().lerp(new THREE.Color(0x94a3b8), 0.72);
        const mat = new THREE.MeshPhysicalMaterial({
          color: baseColor.clone(),
          roughness: 0.2,
          metalness: 0.02,
          clearcoat: 0.45,
          clearcoatRoughness: 0.18,
        });
        const stickerMesh = new THREE.Mesh(stickerGeo, mat);
        const offset = 0.485;
        if (faceDir === 'px') {
          stickerMesh.position.set(offset, 0, 0);
          stickerMesh.rotation.y = Math.PI / 2;
        } else if (faceDir === 'nx') {
          stickerMesh.position.set(-offset, 0, 0);
          stickerMesh.rotation.y = -Math.PI / 2;
        } else if (faceDir === 'py') {
          stickerMesh.position.set(0, offset, 0);
          stickerMesh.rotation.x = -Math.PI / 2;
        } else if (faceDir === 'ny') {
          stickerMesh.position.set(0, -offset, 0);
          stickerMesh.rotation.x = Math.PI / 2;
        } else if (faceDir === 'pz') {
          stickerMesh.position.set(0, 0, offset);
        } else if (faceDir === 'nz') {
          stickerMesh.position.set(0, 0, -offset);
          stickerMesh.rotation.y = Math.PI;
        }

        const meta: StickerMeta = {
          material: mat,
          baseColor,
          dimColor,
          homeX,
          homeY,
          homeZ,
          faceDir,
          currentBrightness: 1,
          targetBrightness: 1,
        };
        stickerMetas.push(meta);
        return stickerMesh;
      };

      const buildSolvedCubies = (startWhiteOnTop: boolean) => {
        while (cubeRoot.children.length > 0) {
          cubeRoot.remove(cubeRoot.children[0]);
        }
        cubies.length = 0;
        stickerMetas.forEach((s) => s.material.dispose());
        stickerMetas.length = 0;

        for (let x = -1; x <= 1; x++) {
          for (let y = -1; y <= 1; y++) {
            for (let z = -1; z <= 1; z++) {
              const cubie = new THREE.Group();
              const body = new THREE.Mesh(bodyGeo, plasticMaterial);
              body.castShadow = !isSoftwareGl;
              body.receiveShadow = !isSoftwareGl;
              cubie.add(body);

              if (x === 1) cubie.add(createSticker('px', STICKER_COLORS.px, x, y, z));
              if (x === -1) cubie.add(createSticker('nx', STICKER_COLORS.nx, x, y, z));
              if (y === 1) cubie.add(createSticker('py', STICKER_COLORS.py, x, y, z));
              if (y === -1) cubie.add(createSticker('ny', STICKER_COLORS.ny, x, y, z));
              if (z === 1) cubie.add(createSticker('pz', STICKER_COLORS.pz, x, y, z));
              if (z === -1) cubie.add(createSticker('nz', STICKER_COLORS.nz, x, y, z));

              cubie.position.set(x, y, z);
              if (startWhiteOnTop) {
                cubie.position.set(-x, -y, z);
                cubie.rotation.z = Math.PI;
              }
              cubeRoot.add(cubie);
              cubies.push(cubie);
            }
          }
        }
      };

      buildSolvedCubies(whiteTopRef.current);

      const refreshTargets = () => {
        const focus = focusModeRef.current;
        const enabled = highlightEnabledRef.current;
        for (const meta of stickerMetas) {
          meta.targetBrightness = !enabled || isStickerHighlighted(meta, focus) ? 1 : 0.18;
        }
        requestRender();
      };

      // Turn queue & animation state
      const turnQueue: QueuedTurn[] = [];
      let activeTurn: {
        turn: QueuedTurn;
        pivot: THREE.Group;
        movingCubies: THREE.Group[];
        progress: number;
        duration: number;
      } | null = null;

      const bakeTurn = (
        pivot: THREE.Group,
        movingCubies: THREE.Group[],
        axis: 'x' | 'y' | 'z',
        angle: number
      ) => {
        _axisVec.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
        pivot.quaternion.setFromAxisAngle(_axisVec, angle);
        pivot.updateMatrixWorld(true);

        for (const cubie of movingCubies) {
          cubie.getWorldPosition(_vec3);
          cubie.getWorldQuaternion(_quat);
          cubeRoot.attach(cubie);
          cubie.position.set(Math.round(_vec3.x), Math.round(_vec3.y), Math.round(_vec3.z));
          // Snap quaternion components cleanly to avoid floating drift
          const euler = new THREE.Euler().setFromQuaternion(_quat);
          cubie.rotation.set(
            Math.round(euler.x / (Math.PI / 2)) * (Math.PI / 2),
            Math.round(euler.y / (Math.PI / 2)) * (Math.PI / 2),
            Math.round(euler.z / (Math.PI / 2)) * (Math.PI / 2)
          );
          cubie.updateMatrix();
        }
        cubeRoot.remove(pivot);
      };

      const startNextTurn = () => {
        if (activeTurn || turnQueue.length === 0) {
          if (!activeTurn && turnQueue.length === 0) {
            setIsAnimatingUi(false);
          }
          return;
        }
        const next = turnQueue.shift()!;
        const pivot = new THREE.Group();
        cubeRoot.add(pivot);

        const movingCubies = cubies.filter((c) => {
          if (next.layer === null) return true;
          return Math.round(c.position[next.axis]) === next.layer;
        });
        for (const c of movingCubies) {
          pivot.attach(c);
        }

        const baseDur = next.layer === null ? 0.55 : slowModeRef.current ? 0.62 : 0.24;
        activeTurn = {
          turn: next,
          pivot,
          movingCubies,
          progress: 0,
          duration: baseDur,
        };
        setIsAnimatingUi(true);
        setActiveMoveLabel(next.label);
      };

      // Render loop management (on-demand + software WebGL safe)
      let frameId = 0;
      let renderBusy = false;
      let renderDirty = false;
      let lastTime = performance.now();
      let disposed = false;

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      function requestRender() {
        if (disposed) return;
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = requestAnimationFrame((now) => {
          if (disposed) return;
          renderDirty = false;
          const dt = Math.min((now - lastTime) / 1000, 0.05);
          lastTime = now;

          let needsMoreFrames = false;

          // Update orbit damping
          if (controls.enableDamping) {
            const moved = controls.update();
            if (moved) needsMoreFrames = true;
          } else {
            controls.update();
          }

          // Update active cube turn
          if (!activeTurn && turnQueue.length > 0) {
            startNextTurn();
          }

          if (activeTurn) {
            activeTurn.progress = Math.min(1, activeTurn.progress + dt / activeTurn.duration);
            const t = activeTurn.progress;
            // Smooth cubic ease in-out
            const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            _axisVec.set(
              activeTurn.turn.axis === 'x' ? 1 : 0,
              activeTurn.turn.axis === 'y' ? 1 : 0,
              activeTurn.turn.axis === 'z' ? 1 : 0
            );
            activeTurn.pivot.quaternion.setFromAxisAngle(_axisVec, activeTurn.turn.angle * eased);

            if (activeTurn.progress >= 1) {
              bakeTurn(
                activeTurn.pivot,
                activeTurn.movingCubies,
                activeTurn.turn.axis,
                activeTurn.turn.angle
              );
              activeTurn = null;
              if (turnQueue.length > 0) {
                startNextTurn();
                needsMoreFrames = true;
              } else {
                setIsAnimatingUi(false);
              }
            } else {
              needsMoreFrames = true;
            }
          }

          // Smooth sticker highlight transitions
          for (const meta of stickerMetas) {
            if (Math.abs(meta.currentBrightness - meta.targetBrightness) > 0.01) {
              meta.currentBrightness = THREE.MathUtils.damp(
                meta.currentBrightness,
                meta.targetBrightness,
                10,
                dt
              );
              meta.material.color.lerpColors(
                meta.dimColor,
                meta.baseColor,
                meta.currentBrightness
              );
              needsMoreFrames = true;
            } else if (meta.currentBrightness !== meta.targetBrightness) {
              meta.currentBrightness = meta.targetBrightness;
              meta.material.color.lerpColors(
                meta.dimColor,
                meta.baseColor,
                meta.currentBrightness
              );
            }
          }

          renderer.render(scene, camera);

          const done = () => {
            renderBusy = false;
            if (renderDirty || needsMoreFrames) {
              requestRender();
            }
          };

          if (isSoftwareGl) afterDraw(done);
          else done();
        });
      }

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      controls.addEventListener('change', () => {
        requestRender();
      });

      apiRef.current = {
        enqueue(turns: QueuedTurn[], instant = false) {
          if (instant) {
            // Cancel current queue and apply turns immediately without animation
            if (activeTurn) {
              bakeTurn(
                activeTurn.pivot,
                activeTurn.movingCubies,
                activeTurn.turn.axis,
                activeTurn.turn.angle
              );
              activeTurn = null;
            }
            turnQueue.length = 0;
            for (const t of turns) {
              const pivot = new THREE.Group();
              cubeRoot.add(pivot);
              const moving = cubies.filter(
                (c) => t.layer === null || Math.round(c.position[t.axis]) === t.layer
              );
              for (const c of moving) pivot.attach(c);
              bakeTurn(pivot, moving, t.axis, t.angle);
            }
            setIsAnimatingUi(false);
            requestRender();
            return;
          }

          turnQueue.push(...turns);
          if (!activeTurn) {
            startNextTurn();
          }
          requestRender();
        },
        resetSolved(targetWhiteTop: boolean) {
          if (activeTurn) {
            cubeRoot.remove(activeTurn.pivot);
            activeTurn = null;
          }
          turnQueue.length = 0;
          setIsAnimatingUi(false);
          buildSolvedCubies(targetWhiteTop);
          refreshTargets();
          requestRender();
        },
        refreshTargets,
        requestRender,
      };

      refreshTargets();
      requestRender();

      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth || 720;
        const h = container.clientHeight || 560;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        controls.dispose();
        bodyGeo.dispose();
        stickerGeo.dispose();
        plasticMaterial.dispose();
        shadowPlaneGeo.dispose();
        shadowPlaneMat.dispose();
        shadowTex.dispose();
        envTarget.dispose();
        stickerMetas.forEach((m) => m.material.dispose());
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    return (
      <div className="relative flex-1 min-h-[420px] lg:min-h-0 h-full w-full bg-slate-100 overflow-hidden select-none">
        {/* Isolated WebGL mount */}
        <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Top-left minimal stage orientation label (solid surface, zero backdrop-blur) */}
        <div className="pointer-events-none absolute top-4 left-4 flex flex-col gap-1.5">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 shadow-sm">
            <span className="text-xs font-semibold text-slate-900">{stageTitle}</span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="text-xs text-slate-600">{activeMoveLabel}</span>
          </div>
          <div className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-500 px-1">
            <span>Верх: {whiteOnTop ? 'Белый' : 'Жёлтый'}</span>
            <span aria-hidden="true">·</span>
            <span>Перед: Зелёный</span>
            <span aria-hidden="true">·</span>
            <span>Тяните мышкой, чтобы осмотреть со всех сторон</span>
          </div>
        </div>

        {/* Collapsible bottom control dock (per Three.js ergonomic HUD guideline) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(780px,calc(100%-24px))] flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="mb-1.5 inline-flex items-center gap-1.5 rounded-t-lg rounded-b-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Открыть панель кубика</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Скрыть панель</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="w-full rounded-xl border border-slate-200 bg-white/95 p-3 shadow-md flex flex-col gap-2.5">
              {/* Row 1: Turn controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {MOVE_BUTTONS.map(({ move, title }) => (
                    <button
                      key={move}
                      type="button"
                      title={title}
                      onClick={() =>
                        apiRef.current?.enqueue([moveToTurn(move)])
                      }
                      className="min-w-[40px] h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 font-mono text-xs font-semibold text-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {move}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      apiRef.current?.enqueue(
                        (['R', 'U', "R'", "U'"] as MoveNotation[]).map((m) => moveToTurn(m))
                      )
                    }
                    className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Пиф-паф</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !whiteOnTop;
                      onWhiteOnTopChange(next);
                      apiRef.current?.enqueue([
                        {
                          axis: 'z',
                          layer: null,
                          angle: Math.PI,
                          label: next
                            ? 'Переворот: белый центр сверху'
                            : 'Переворот: жёлтый центр сверху',
                        },
                      ]);
                    }}
                    className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {whiteOnTop ? 'Перевернуть жёлтым вверх' : 'Перевернуть белым вверх'}
                  </button>
                </div>
              </div>

              {/* Row 2: Utility & speed toggles */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSlowMode((s) => !s)}
                    className={`h-8 px-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      slowMode
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {slowMode ? 'Режим: Медленно' : 'Режим: Быстро'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHighlightEnabled((v) => !v)}
                    className={`h-8 px-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      highlightEnabled
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {highlightEnabled ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                    <span>Подсветка этапа</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isAnimatingUi}
                    onClick={() => {
                      if (!apiRef.current) return;
                      const pool: MoveNotation[] = [
                        'R',
                        "R'",
                        'U',
                        "U'",
                        'F',
                        "F'",
                        'L',
                        "L'",
                        'D',
                        "D'",
                      ];
                      const seq: QueuedTurn[] = [];
                      let lastAxis = '';
                      for (let i = 0; i < 16; i++) {
                        let candidate = pool[Math.floor(Math.random() * pool.length)];
                        let turn = moveToTurn(candidate);
                        while (turn.axis === lastAxis) {
                          candidate = pool[Math.floor(Math.random() * pool.length)];
                          turn = moveToTurn(candidate);
                        }
                        lastAxis = turn.axis;
                        seq.push(turn);
                      }
                      apiRef.current.enqueue(seq, true);
                      setActiveMoveLabel('Кубик перемешан (16 ходов)');
                    }}
                    className="h-8 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Перемешать</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      apiRef.current?.resetSolved(whiteOnTop);
                      setActiveMoveLabel('Кубик собран');
                    }}
                    className="h-8 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Собрать</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
