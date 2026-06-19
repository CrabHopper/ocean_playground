import * as THREE from "three";
import { SEA_FLOOR } from "./constants";
import { terrainH, addCaustics } from "./helpers";

// カニ ×6 — サンゴ(reefAnchors)を住処にうろつく。
export function buildCrabs(scene, reefAnchors) {
  const crabShellMat = new THREE.MeshPhongMaterial({ color: 0xc4532e, specular: 0x66331f, shininess: 55 });
  const crabDarkMat = new THREE.MeshPhongMaterial({ color: 0x7e3018, specular: 0x442211, shininess: 40 });
  const crabEyeMat = new THREE.MeshPhongMaterial({ color: 0x14100c, specular: 0xffffff, shininess: 160 });
  addCaustics(crabShellMat, 0.30); addCaustics(crabDarkMat, 0.25);

  function makeCrab(scale) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 10), crabShellMat);
    body.scale.set(1.3, 0.5, 0.95); body.position.y = 0.24; g.add(body);
    [-1, 1].forEach((s) => {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.12, 5), crabDarkMat);
      stalk.position.set(0.09 * s, 0.38, 0.26); stalk.rotation.x = -0.45; g.add(stalk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), crabEyeMat);
      eye.position.set(0.09 * s, 0.45, 0.31); g.add(eye);
    });
    g.userData.claws = [];
    [-1, 1].forEach((s) => {
      const cl = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.045, 0.22, 6), crabShellMat);
      arm.rotation.z = s * 1.25; arm.position.x = 0.11 * s; cl.add(arm);
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.085, 9, 7), crabShellMat);
      claw.scale.set(1.45, 0.8, 1.0); claw.position.set(0.25 * s, 0.02, 0.05); cl.add(claw);
      const pinc = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.12, 5), crabDarkMat);
      pinc.position.set(0.31 * s, 0.04, 0.14); pinc.rotation.x = 1.25; cl.add(pinc);
      cl.position.set(0.20 * s, 0.20, 0.30);
      g.add(cl); g.userData.claws.push(cl);
    });
    g.userData.legs = [];
    for (let i = 0; i < 4; i++) [-1, 1].forEach((s) => {
      const leg = new THREE.Group();
      const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.027, 0.27, 5), crabShellMat);
      seg1.rotation.z = s * 1.25; seg1.position.x = s * 0.12; leg.add(seg1);
      const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.019, 0.25, 5), crabDarkMat);
      seg2.rotation.z = s * 0.55; seg2.position.set(s * 0.26, -0.13, 0); leg.add(seg2);
      leg.position.set(s * 0.24, 0.20, 0.17 - i * 0.125);
      leg.userData = { s, i };
      g.add(leg); g.userData.legs.push(leg);
    });
    g.scale.setScalar(scale);
    scene.add(g);
    return g;
  }

  const crabs = [];
  for (let i = 0; i < 6; i++) {
    const a = reefAnchors[i % reefAnchors.length];
    const hx = a.x + (Math.random() - 0.5) * 6, hz = a.z + (Math.random() - 0.5) * 6;
    const sc = 0.7 + Math.random() * 0.8;
    crabs.push({
      g: makeCrab(sc), hx, hz, x: hx, z: hz, dir: Math.random() * 6.28,
      mode: "rest", timer: Math.random() * 3, sp: 0, ph: 0, seed: Math.random() * 9, sc,
    });
  }

  function update(dt, t) {
    crabs.forEach((c) => {
      c.timer -= dt;
      if (c.timer < 0) {
        if (c.mode === "rest") {
          c.mode = "walk"; c.dir = Math.random() * 6.28;
          c.sp = 0.35 + Math.random() * 0.5; c.timer = 1.2 + Math.random() * 2.6;
        } else { c.mode = "rest"; c.timer = 1.0 + Math.random() * 3.5; }
      }
      const moving = c.mode === "walk" ? 1 : 0;
      if (moving) {
        const dx = c.hx - c.x, dz = c.hz - c.z;
        if (dx * dx + dz * dz > 22) c.dir = Math.atan2(dz, dx);
        c.x += Math.cos(c.dir) * c.sp * dt;
        c.z += Math.sin(c.dir) * c.sp * dt;
        c.ph += c.sp * dt * 11;
      }
      const gy = SEA_FLOOR + terrainH(c.x, c.z);
      c.g.position.set(c.x, gy + 0.02 + Math.abs(Math.sin(c.ph)) * 0.015 * moving * c.sc, c.z);
      c.g.rotation.y = -c.dir;                            /* 横歩き */
      c.g.userData.legs.forEach((l) => {
        const o = (l.userData.i + (l.userData.s > 0 ? 0 : 2)) * 1.57;
        l.rotation.y = Math.sin(c.ph + o) * 0.30 * moving;
        l.rotation.x = Math.max(0, Math.sin(c.ph + o)) * 0.18 * moving;
      });
      c.g.userData.claws.forEach((cl, k) => {
        cl.rotation.x = Math.sin(t * 1.3 + c.seed + k * 2.1) * 0.16 - 0.05;
        cl.rotation.z = (k ? 1 : -1) * Math.max(0, Math.sin(t * 0.35 + c.seed)) * 0.20;
      });
    });
  }

  return { update };
}
