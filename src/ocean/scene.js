import * as THREE from "three";
import { SUN_DIR } from "./constants";
import { uTime, uNight, uFogColor, uFogDensity } from "./uniforms";
import { buildEnvironment } from "./environment";
import { buildReef } from "./reef";
import { buildDistricts } from "./district";
import { buildBridge } from "./bridge";
import { colliders } from "./colliders";
import { createAudio } from "./audio";
import { buildBubbles } from "./bubbles";
import { buildJellyfish } from "./jellyfish";
import { buildFish } from "./fish";
import { buildCrabs } from "./crabs";
import { buildWildlife } from "./wildlife";
import { buildExtras } from "./sealife";
import { buildArms } from "./arms";
import { buildHome } from "./home";
import { createPlayer } from "./player";
import { buildPost } from "./post";

// シーンの構築・入力・メインループをまとめ、React から操作する API を返す。
export function createScene(mount, hooks = {}) {
  THREE.ColorManagement.enabled = false;

  const { depthEl, hintEl, onNight, onHelpToggle, onHudToggle, onRespawnToggle, onStart } = hooks;
  const W = () => mount.clientWidth || window.innerWidth;
  const H = () => mount.clientHeight || window.innerHeight;

  const canvas = document.createElement("canvas");
  mount.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 1.6);
  renderer.setPixelRatio(DPR);
  renderer.setSize(W(), H());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, W() / H(), 0.08, 900);

  const fogShallow = new THREE.Color(0x1d7ab2);
  const fogDeep = new THREE.Color(0x062a50);
  const fogShallowN = new THREE.Color(0x031320);
  const fogDeepN = new THREE.Color(0x01060d);
  const fogCur = new THREE.Color(0x1d7ab2);
  scene.fog = new THREE.FogExp2(0x1d7ab2, 0.022);

  const sunDayC = new THREE.Color(0xfdf4e0), sunNightC = new THREE.Color(0x96b4e8);
  const hemiDayC = new THREE.Color(0x6fbce6), hemiNightC = new THREE.Color(0x1c3a52);
  const gndDayC = new THREE.Color(0x05203c), gndNightC = new THREE.Color(0x010810);

  const state = {
    camera,
    fwd: new THREE.Vector3(), right: new THREE.Vector3(),
    handPos: new THREE.Vector3(), reachT: 0,
    under: false, speed: 0, depth01: 0, touchingBub: false,
    surfY: 0, camY: 0, mode: "home",
  };

  /* ---------- 構築 ---------- */
  colliders.reset();
  const sound = createAudio();
  const env = buildEnvironment(scene, camera);
  const reef = buildReef(scene);
  const districts = buildDistricts(scene);
  const bridge = buildBridge(scene);
  const bubbles = buildBubbles(scene, sound);
  const { bub, bigBub } = bubbles;
  const jellyfish = buildJellyfish(scene);
  const fish = buildFish(scene, reef.anemonePos);
  const crabs = buildCrabs(scene, reef.reefAnchors);
  const wildlife = buildWildlife(scene, { sound, bub });
  const extras = buildExtras(scene, { reefAnchors: reef.reefAnchors });
  const arms = buildArms(scene, camera, { bub, bigBub, sound, state });
  const home = buildHome(scene);
  const ctl = {
    yaw: 0, pitch: 0, vel: new THREE.Vector3(),
    keys: {}, dragging: false, lx: 0, ly: 0,
    thrustTouch: 0, upT: 0, dnT: 0, handHold: 0,
  };
  const player = createPlayer({ camera, ctl, state, home, bridge, arms });
  const post = buildPost(W(), H(), DPR);

  /* ---------- 入力 ---------- */
  const onPointerDown = (e) => { ctl.dragging = true; ctl.lx = e.clientX; ctl.ly = e.clientY; };
  const onPointerMove = (e) => {
    if (!ctl.dragging) return;
    ctl.yaw -= (e.clientX - ctl.lx) * 0.0032;
    ctl.pitch -= (e.clientY - ctl.ly) * 0.0032;
    ctl.pitch = THREE.MathUtils.clamp(ctl.pitch, -1.45, 1.45);
    ctl.lx = e.clientX; ctl.ly = e.clientY;
  };
  const onPointerUp = () => { ctl.dragging = false; };
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  let spaceCD = 0;
  const onKeyDown = (e) => {
    ctl.keys[e.code] = true;
    if (e.code === "Space") {
      e.preventDefault();
      if (running && !e.repeat) {
        if (player.isSwimming()) {
          if (performance.now() - spaceCD > 500) { spaceCD = performance.now(); arms.exhale(); }
        } else player.jump();
      }
    }
    if (e.code === "KeyE" && running && !e.repeat && !player.isSwimming()) player.interact();
    if (e.code === "KeyU") onHudToggle && onHudToggle();
    if (e.code === "KeyP") snapshot();
    if (e.code === "KeyN") toggleNight();
    if (e.code === "KeyQ") onHelpToggle && onHelpToggle();
    if (e.code === "KeyR") onRespawnToggle && onRespawnToggle();
  };
  const onKeyUp = (e) => { ctl.keys[e.code] = false; };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  const onResize = () => {
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
    post.setSize(W(), H(), DPR);
  };
  window.addEventListener("resize", onResize);

  /* ---------- 操作 API ---------- */
  let nightTarget = 0;
  function toggleNight() {
    nightTarget = 1 - nightTarget;
    onNight && onNight(nightTarget === 1);
    if (nightTarget && sound.ready) sound.dolphinCall();
  }
  function snapshot() {
    const a = document.createElement("a");
    a.download = "aoi-dive.png";
    a.href = renderer.domElement.toDataURL("image/png");
    a.click();
  }
  function start() {
    if (running) return;
    running = true;
    sound.init();
    onStart && onStart();
  }

  /* ---------- メインループ ---------- */
  const clock = new THREE.Clock();
  let prevUnder = false, wet = 0, sheet = 0, sheetEdge = -1, exposure = 1.0;
  let hintTimer = 0, running = false, breathT = 2.5;
  const fwd = state.fwd;
  const sunWorld = new THREE.Vector3();
  const lineP = new THREE.Vector3();
  const bubP = new THREE.Vector3();
  const handPos = state.handPos;
  let raf = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    uTime.value = t;
    if (!running) {
      renderer.setRenderTarget(post.rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(post.postScene, post.postCam);
      return;
    }

    /* ── 移動(歩行 / 昇降 / 遊泳) ── */
    player.update(dt, t);
    const under = state.under;
    const speed = state.speed;
    const depth01 = state.depth01;
    const surfY = state.surfY;
    const camY = state.camY;

    uNight.value += (nightTarget - uNight.value) * Math.min(1, dt * 0.55);
    const nT = uNight.value;

    /* ── 水面突破演出 ── */
    if (under !== prevUnder) {
      if (!under) { wet = 1.0; sheet = 1.0; sheetEdge = 1.25; sound.splash(); }
      else {
        sound.popBubbles(7);
        for (let i = 0; i < 26; i++)
          bub.spawn(camera.position.x + (Math.random() - 0.5) * 1.2, camera.position.y + (Math.random() - 0.5) * 0.8,
            camera.position.z + (Math.random() - 0.5) * 1.2, 0.05 + Math.random() * 0.07);
        sound.splash();
      }
      prevUnder = under;
    }
    if (under) wet = Math.max(0, wet - dt * 1.6);
    else wet = Math.max(0, wet - dt * 0.055);
    sheet = Math.max(0, sheet - dt * 0.85);
    sheetEdge -= dt * 1.5;

    /* ── 露出(オート) ── */
    const targetExp = under
      ? THREE.MathUtils.lerp(0.64 + depth01 * 0.52, 1.30, nT)
      : THREE.MathUtils.lerp(0.62, 0.92, nT);
    exposure += (targetExp - exposure) * Math.min(1, dt * 1.1);

    /* ── 環境（深度+視線方向+昼夜で色変化） ── */
    const lookDn = THREE.MathUtils.clamp(-fwd.y, 0, 1);
    const lookUp = THREE.MathUtils.clamp(fwd.y, 0, 1);
    const fogMixV = THREE.MathUtils.clamp(Math.pow(depth01, 0.85) + lookDn * 0.45 - lookUp * 0.22 + 0.08, 0, 1);
    const shal = fogShallow.clone().lerp(fogShallowN, nT);
    const deep = fogDeep.clone().lerp(fogDeepN, nT);
    const fogTgt = shal.lerp(deep, fogMixV);
    fogCur.lerp(fogTgt, Math.min(1, dt * 2.6));
    scene.fog.color.copy(fogCur);
    scene.fog.density = under ? (0.020 + depth01 * 0.013 + lookDn * 0.005 + nT * 0.006) : 0.0018;
    renderer.setClearColor(fogCur);
    uFogColor.value.copy(fogCur);
    uFogDensity.value = scene.fog.density;
    const daySun = under ? 1.25 - depth01 * 0.65 : 1.5;
    const daySky = under ? 0.78 - depth01 * 0.32 : 1.0;
    env.sun.intensity = THREE.MathUtils.lerp(daySun, under ? 0.16 : 0.22, nT);
    env.hemi.intensity = THREE.MathUtils.lerp(daySky, 0.12, nT);
    env.amb.intensity = THREE.MathUtils.lerp(0.45, 0.09, nT);
    env.sun.color.copy(sunDayC).lerp(sunNightC, nT);
    env.hemi.color.copy(hemiDayC).lerp(hemiNightC, nT);
    env.hemi.groundColor.copy(gndDayC).lerp(gndNightC, nT);
    env.torch.intensity = nT * (under ? 2.4 : 0.25);
    districts.update(dt, t, nT);
    bridge.setNight(nT);
    home.update(dt, t, nT);

    /* ── 追従配置（水面・神光・プランクトン） ── */
    env.update(t, camera, under, depth01);

    /* ── 泡の発生 ── */
    if (under) {
      if (speed > 2.2 && Math.random() < dt * 14) {
        bub.spawn(camera.position.x + (Math.random() - 0.5) * 0.8 + fwd.x * 0.5,
          camera.position.y - 0.5 + (Math.random() - 0.5) * 0.4,
          camera.position.z + (Math.random() - 0.5) * 0.8 + fwd.z * 0.5,
          0.03 + Math.random() * 0.05);
        if (Math.random() < 0.1) sound.popBubbles(1);
      }
      if (Math.random() < dt * 1.2) sound.popBubbles(1);
    }
    bubbles.updateSeeps(dt, t, camera);
    bub.update(dt, t);
    bigBub.update(dt, t);
    crabs.update(dt, t);

    /* ── 手を伸ばす(Hキー / ✋ボタン) ── */
    const reachTgt = (ctl.keys.KeyH || ctl.handHold) ? 1 : 0;
    state.reachT += (reachTgt - state.reachT) * Math.min(1, dt * 6);
    handPos.copy(camera.position).addScaledVector(fwd, 0.85);
    handPos.y -= 0.10;
    let touchingBub = false;
    if (state.reachT > 0.5) {
      for (const b of bigBub.list) {
        if (!b.alive) continue;
        const dx = b.x - handPos.x, dy = b.y - handPos.y, dz = b.z - handPos.z;
        const dh = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dh < 0.5 + b.s) {
          touchingBub = true;
          const inv = 1 / Math.max(dh, 0.05);
          b.push.x += dx * inv * 1.4; b.push.y += Math.abs(dy) * inv * 0.8 + 0.4; b.push.z += dz * inv * 1.4;
          if (Math.random() < dt * 0.7) {
            b.alive = false; b.delay = 0.8 + Math.random() * 2;
            for (let i2 = 0; i2 < 6; i2++) bub.spawn(b.x, b.y, b.z, 0.012 + Math.random() * 0.025);
            sound.popBubbles(3);
          }
        }
      }
    }
    state.touchingBub = touchingBub;

    /* ── 一人称の腕 / 呼吸（遊泳中のみ） ── */
    if (player.isSwimming()) {
      arms.update(dt, t);
      breathT -= dt;
      if (breathT < 0) { breathT = 3.4 + Math.random() * 1.8; arms.exhale(); }
    } else breathT = Math.min(breathT, 1.2);

    /* ── 生物 ── */
    fish.update(dt, t, state);
    jellyfish.update(dt, t, state);
    wildlife.update(dt, t, state);
    extras.update(dt, t, state);

    /* ── ポスト用 uniform ── */
    const postU = post.postU;
    sunWorld.copy(SUN_DIR).multiplyScalar(400).add(camera.position).project(camera);
    const sunVis = (sunWorld.z < 1 && Math.abs(sunWorld.x) < 1.4 && Math.abs(sunWorld.y) < 1.4)
      ? THREE.MathUtils.clamp(fwd.dot(SUN_DIR) * 1.6, 0, 1) : 0;
    postU.uSun.value.set(sunWorld.x * 0.5 + 0.5, sunWorld.y * 0.5 + 0.5);

    {
      const hx = fwd.x, hz = fwd.z;
      const hl = Math.hypot(hx, hz) || 1;
      lineP.set(camera.position.x + hx / hl * 5.0, 0, camera.position.z + hz / hl * 5.0);
      lineP.y = state.surfY;
      lineP.project(camera);
      let lv = 1 - THREE.MathUtils.smoothstep(Math.abs(camY - surfY), 0.06, 0.42);
      lv *= THREE.MathUtils.clamp(hl * 1.8, 0, 1);
      if (lineP.z > 1 || lineP.z < -1) lv = 0;
      if (!under && camY > surfY + 2.0) lv = 0;          // 陸の高所では出さない
      postU.uLineY.value = THREE.MathUtils.clamp(lineP.y * 0.5 + 0.5, -0.6, 1.6);
      postU.uLineVis.value += (lv - postU.uLineVis.value) * Math.min(1, dt * 7);
    }
    const flareT = under ? sunVis * (1 - depth01 * 0.75) * 0.9 : sunVis * 0.8;
    postU.uFlare.value += (flareT - postU.uFlare.value) * Math.min(1, dt * 5);
    {
      const arr = postU.uBub.value;
      const tanH = Math.tan(camera.fov * Math.PI / 360);
      const cand = [];
      for (const b of bigBub.list) {
        if (!b.alive) continue;
        bubP.set(b.x, b.y, b.z);
        const d = bubP.distanceTo(camera.position);
        if (d < 0.22 || d > 42) continue;
        bubP.project(camera);
        if (bubP.z > 1 || Math.abs(bubP.x) > 1.35 || Math.abs(bubP.y) > 1.35) continue;
        cand.push({ x: bubP.x * 0.5 + 0.5, y: bubP.y * 0.5 + 0.5, r: (b.s / (d * tanH)) * 0.5, w: b.seed * 7, d });
      }
      cand.sort((a, b) => a.d - b.d);
      let bi = 0;
      for (; bi < 16 && bi < cand.length; bi++) arr[bi].set(cand[bi].x, cand[bi].y, cand[bi].r, cand[bi].w);
      for (; bi < 16; bi++) arr[bi].set(0, 0, 0, 0);
    }
    postU.uWet.value = wet;
    postU.uSheet.value = sheet;
    postU.uSheetEdge.value = sheetEdge;
    postU.uUnder.value += ((under ? 1 : 0) - postU.uUnder.value) * Math.min(1, dt * 4);
    postU.uExposure.value = exposure;

    sound.updateMix(under, speed, dt);

    /* ── HUD ── */
    if (depthEl) {
      if (under) depthEl.innerHTML = "<b>" + Math.max(0, -camY).toFixed(1) + "</b> m";
      else depthEl.innerHTML = "<b>" + Math.max(0, camY).toFixed(0) + "</b> m 地上";
    }
    hintTimer += dt;
    if (hintEl && hintTimer > 12) hintEl.style.opacity = 0;

    renderer.setRenderTarget(post.rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(post.postScene, post.postCam);
  }
  frame();

  function dispose() {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);
    post.rt.dispose();
    renderer.dispose();
    if (canvas.parentNode === mount) mount.removeChild(canvas);
  }

  return {
    start, toggleNight, snapshot, dispose,
    respawn: (target) => { if (running) player.respawn(target); },
    interact: () => { if (running && !player.isSwimming()) player.interact(); },
    exhale: () => { if (running && player.isSwimming()) arms.exhale(); },
    setReach: (b) => { ctl.handHold = b ? 1 : 0; },
    setThrust: (b) => { ctl.thrustTouch = b ? 1 : 0; },
    setUp: (b) => { ctl.upT = b ? 1 : 0; },
    setDown: (b) => { ctl.dnT = b ? 1 : 0; },
  };
}
