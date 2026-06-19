import * as THREE from "three";
import { addCaustics } from "./helpers";

// 一人称の腕(平泳ぎ⇄漂い⇄リーチ)と、レギュレーターの呼気(exhale)。
export function buildArms(scene, camera, { bub, bigBub, sound, state }) {
  scene.add(camera);
  const armsGrp = new THREE.Group();
  camera.add(armsGrp);

  const skinMat = new THREE.MeshPhongMaterial({ color: 0xc09277, specular: 0x5a7d8c, shininess: 46 });
  addCaustics(skinMat, 0.16);   /* 手の甲に踊る光 */

  function capsuleZ(r, len, mat) {
    const g = new THREE.Group();
    const cy = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 10), mat);
    cy.rotation.x = Math.PI / 2; cy.position.z = -len / 2; g.add(cy);
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); g.add(s1);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 10, 8), mat); s2.position.z = -len; g.add(s2);
    return g;
  }
  function makeArm(side) {
    const sh = new THREE.Group();
    sh.add(capsuleZ(0.072, 0.34, skinMat));
    const el = new THREE.Group(); el.position.z = -0.34;
    el.add(capsuleZ(0.058, 0.30, skinMat));
    const wr = new THREE.Group(); wr.position.z = -0.30;
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), skinMat);
    palm.scale.set(1.0, 0.40, 1.3); palm.position.z = -0.06; wr.add(palm);
    for (let f = 0; f < 4; f++) {
      const fg = capsuleZ(0.0155, 0.105, skinMat);
      fg.position.set((f - 1.5) * 0.040, 0.0, -0.135);
      fg.rotation.x = -0.14; fg.rotation.y = (f - 1.5) * 0.06;
      wr.add(fg);
    }
    const th = capsuleZ(0.018, 0.085, skinMat);
    th.position.set(side * 0.078, -0.005, -0.035); th.rotation.y = side * 0.95;
    wr.add(th);
    el.add(wr); sh.add(el);
    sh.position.set(side * 0.21, -0.40, -0.06);
    armsGrp.add(sh);
    return { sh, el, wr, side };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  let armPhase = 0;

  function exhale() {
    const fwd = state.fwd;
    const n = 12 + Math.floor(Math.random() * 9);
    const ex = camera.position.x + fwd.x * 0.25, ez = camera.position.z + fwd.z * 0.25;
    for (let i = 0; i < n; i++)
      bub.spawn(ex + (Math.random() - 0.5) * 0.30, camera.position.y + 0.02 + (Math.random() - 0.5) * 0.15,
        ez + (Math.random() - 0.5) * 0.30, 0.014 + Math.random() * 0.05);
    bigBub.spawnAt(ex, camera.position.y + 0.06, ez, 0.045 + Math.random() * 0.05);
    if (Math.random() < 0.6) bigBub.spawnAt(ex + 0.1, camera.position.y, ez, 0.03 + Math.random() * 0.04);
    sound.popBubbles(5);
  }

  function update(dt, t) {
    const { speed, reachT, touchingBub, under, fwd, right } = state;
    armPhase += dt * (0.9 + Math.min(speed, 5.0) * 1.25);
    const swimAmt = THREE.MathUtils.clamp(speed * 0.55, 0, 1);
    [armL, armR].forEach((a) => {
      const s = a.side, p = armPhase;
      const sweep = Math.sin(p), rch = Math.cos(p);
      const yawS = s * (0.14 + 0.34 * Math.max(0, sweep));
      const pitS = -0.36 + 0.10 * rch;
      const elbS = s * (0.08 + 0.50 * Math.max(0, Math.sin(p - 0.7)));
      const yawD = s * 0.13 + Math.sin(t * 0.7 + s) * 0.03;
      const pitD = -0.40 + Math.sin(t * 0.55 + s * 2.0) * 0.05;
      const elbD = s * 0.10;
      const dm = Math.min(1, dt * 7);
      a.sh.rotation.y += ((yawD + (yawS - yawD) * swimAmt) - a.sh.rotation.y) * dm;
      a.sh.rotation.x += ((pitD + (pitS - pitD) * swimAmt) - a.sh.rotation.x) * dm;
      a.el.rotation.y += ((elbD + (elbS - elbD) * swimAmt) - a.el.rotation.y) * dm;
      a.wr.rotation.x = Math.sin(t * 1.4 + s) * 0.07 - 0.06;
      a.wr.rotation.z = s * 0.10 + Math.sin(t * 1.1) * 0.04;
      if (s > 0 && reachT > 0.02) {
        a.sh.rotation.y = THREE.MathUtils.lerp(a.sh.rotation.y, 0.26, reachT);
        a.sh.rotation.x = THREE.MathUtils.lerp(a.sh.rotation.x, 0.18, reachT);
        a.el.rotation.y = THREE.MathUtils.lerp(a.el.rotation.y, 0.02, reachT);
        const wave = touchingBub ? Math.sin(t * 9.5) * 0.45 : Math.sin(t * 1.6) * 0.06;
        a.wr.rotation.z = THREE.MathUtils.lerp(a.wr.rotation.z, wave, reachT);
        a.wr.rotation.x = THREE.MathUtils.lerp(a.wr.rotation.x, -0.12 + (touchingBub ? Math.sin(t * 7.0) * 0.18 : 0), reachT);
      }
    });
    /* ストロークに合わせて手元から泡 */
    if (under && swimAmt > 0.4 && Math.sin(armPhase) > 0.92 && Math.random() < dt * 30) {
      [armL, armR].forEach((a) => {
        bub.spawn(camera.position.x + fwd.x * 0.7 + right.x * a.side * 0.45,
          camera.position.y - 0.35,
          camera.position.z + fwd.z * 0.7 + right.z * a.side * 0.45,
          0.02 + Math.random() * 0.035);
      });
    }
  }

  return { update, exhale, setVisible: (b) => { armsGrp.visible = b; } };
}
