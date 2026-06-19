import * as THREE from "three";
import { SEA_FLOOR } from "./constants";
import { waveSurfaceY } from "./helpers";
import { groundAt, baseGround } from "./ground";
import { colliders } from "./colliders";

// プレイヤー移動。mode: walk(陸・室内を歩く) / elevator(昇降) / swim(遊泳)。
const EYE = 1.6;
const RADIUS = 0.4;
const GRAV = 20;
const WALK_ACC = 55;
const WALK_MAX = 6.5;
const JUMP = 6.6;
const ELEV_SPEED = 7.0;

export function createPlayer({ camera, ctl, state, home, bridge, arms }) {
  let mode = "walk";
  let vy = 0, grounded = true, elevDir = 0;
  const pos = camera.position;
  const camEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const fwd = state.fwd, right = state.right;
  const hvel = new THREE.Vector3();
  const upv = new THREE.Vector3(0, 1, 0);

  function setMode(m) { if (m !== mode) { mode = m; arms.setVisible(m === "swim"); } }

  function respawn(target) {
    if (target === "sea") {
      pos.set(0, -9, 8); ctl.yaw = 0.6; ctl.pitch = -0.1; ctl.vel.set(0, 0, 0);
      setMode("swim");
    } else if (target === "bridge") {
      pos.copy(bridge.spawn.pos); ctl.yaw = bridge.spawn.yaw; ctl.pitch = bridge.spawn.pitch;
      vy = 0; hvel.set(0, 0, 0); setMode("walk");
    } else { // home
      pos.copy(home.spawn.pos); ctl.yaw = home.spawn.yaw; ctl.pitch = home.spawn.pitch;
      home.elevator.car.position.y = home.elevator.topY;
      vy = 0; hvel.set(0, 0, 0); setMode("walk");
    }
  }
  respawn("home");
  arms.setVisible(false);

  function walk(dt, t) {
    const k = ctl.keys;
    const wF = fwd.clone(); wF.y = 0; if (wF.lengthSq() > 1e-6) wF.normalize();
    const wR = right.clone(); wR.y = 0; if (wR.lengthSq() > 1e-6) wR.normalize();
    const mvF = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + ctl.thrustTouch;
    const mvR = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    hvel.addScaledVector(wF, mvF * WALK_ACC * dt);
    hvel.addScaledVector(wR, mvR * WALK_ACC * dt);
    const fr = Math.pow(0.0009, dt); hvel.x *= fr; hvel.z *= fr;
    const hs = Math.hypot(hvel.x, hvel.z);
    if (hs > WALK_MAX) { hvel.x *= WALK_MAX / hs; hvel.z *= WALK_MAX / hs; }

    pos.x += hvel.x * dt; pos.z += hvel.z * dt;
    colliders.resolve(pos, RADIUS, pos.y - EYE, pos.y);

    vy -= GRAV * dt; pos.y += vy * dt;
    const gY = groundAt(pos.x, pos.z, pos.y);
    if (pos.y - EYE <= gY) { pos.y = gY + EYE; vy = 0; grounded = true; } else grounded = false;

    const r = Math.hypot(pos.x, pos.z);
    if (r > 320) { pos.x *= 320 / r; pos.z *= 320 / r; }

    const surfY = waveSurfaceY(pos.x, pos.z, t);
    if (grounded && pos.y < surfY - 0.1 && gY < surfY - 0.8) {
      ctl.vel.set(hvel.x, vy, hvel.z).addScaledVector(fwd, 1.5);
      setMode("swim");
    }
    const sp = Math.hypot(hvel.x, hvel.z);
    const bob = grounded ? Math.sin(t * 9) * Math.min(sp * 0.006, 0.045) : 0;
    camera.quaternion.setFromEuler(camEuler);
    camera.position.y += bob;
    state.speed = sp; state.under = false; state.depth01 = 0;
  }

  function ride(dt) {
    const e = home.elevator;
    e.car.position.y += elevDir * ELEV_SPEED * dt;
    if (elevDir < 0 && e.car.position.y <= e.botY) { e.car.position.y = e.botY; arrive(); }
    else if (elevDir > 0 && e.car.position.y >= e.topY) { e.car.position.y = e.topY; arrive(); }
    pos.set(e.x, e.car.position.y + EYE, e.z);
    camera.quaternion.setFromEuler(camEuler);
    state.speed = 0; state.under = false; state.depth01 = 0;
  }
  function arrive() { vy = 0; hvel.set(0, 0, 0); setMode("walk"); }

  function swim(dt, t) {
    const k = ctl.keys;
    const thrust = (k.KeyW || k.ArrowUp ? 1 : 0) + ctl.thrustTouch;
    const back = (k.KeyS || k.ArrowDown ? 1 : 0);
    const strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const rise = (k.KeyE ? 1 : 0) + ctl.upT - ((k.ShiftLeft || k.ShiftRight || k.KeyC) ? 1 : 0) - ctl.dnT;
    const ACC = 9.5;
    ctl.vel.addScaledVector(fwd, (thrust - back * 0.6) * ACC * dt);
    ctl.vel.addScaledVector(right, strafe * ACC * 0.7 * dt);
    ctl.vel.addScaledVector(upv, rise * ACC * 0.65 * dt);
    ctl.vel.x += Math.sin(t * 0.11) * 0.06 * dt;
    ctl.vel.z += Math.cos(t * 0.07) * 0.06 * dt;
    ctl.vel.multiplyScalar(Math.pow(0.32, dt));
    pos.addScaledVector(ctl.vel, dt);

    const surfY = waveSurfaceY(pos.x, pos.z, t);
    const gY = baseGround(pos.x, pos.z);
    pos.y = THREE.MathUtils.clamp(pos.y, gY + 0.9, surfY + 2.4);
    const r = Math.hypot(pos.x, pos.z);
    if (r > 320) { pos.x *= 320 / r; pos.z *= 320 / r; }

    const speed = ctl.vel.length();
    const bobA = 0.02 + Math.min(speed * 0.012, 0.03);
    const bobX = Math.sin(t * 1.3) * bobA + Math.sin(t * 0.43) * 0.018;
    const bobY = Math.sin(t * 0.9 + 1.7) * bobA * 1.2 + Math.sin(t * 0.31) * 0.02;
    const swayR = Math.sin(t * 0.5) * 0.012 + Math.sin(t * 0.21 + 2) * 0.008;
    camera.quaternion.setFromEuler(camEuler);
    camera.rotateZ(swayR);
    pos.x += bobX * dt * 3; pos.y += bobY * dt * 3;
    camera.fov = 68 + Math.sin(t * 0.55) * 0.35;
    camera.updateProjectionMatrix();

    state.speed = speed;
    state.depth01 = THREE.MathUtils.clamp(-pos.y / Math.abs(SEA_FLOOR), 0, 1);
    state.under = pos.y < surfY;
    if (gY > -1.4 && pos.y >= surfY - 0.05) {
      vy = 0; hvel.set(ctl.vel.x, 0, ctl.vel.z); setMode("walk");
      camera.fov = 68; camera.updateProjectionMatrix();
    }
  }

  function update(dt, t) {
    camEuler.set(ctl.pitch, ctl.yaw, 0);
    fwd.set(0, 0, -1).applyEuler(camEuler);
    right.set(1, 0, 0).applyEuler(camEuler);
    if (mode === "swim") swim(dt, t);
    else if (mode === "elevator") ride(dt);
    else walk(dt, t);
    state.surfY = waveSurfaceY(pos.x, pos.z, t);
    state.camY = pos.y;
    state.mode = mode;
  }

  function interact() {
    if (mode !== "walk") return;
    const e = home.elevator;
    if (e.inZone(pos)) { elevDir = (e.car.position.y > (e.topY + e.botY) / 2) ? -1 : 1; setMode("elevator"); }
  }
  function jump() { if (mode === "walk" && grounded) vy = JUMP; }

  return { update, interact, jump, respawn, isSwimming: () => mode === "swim", getMode: () => mode };
}
