import * as THREE from "three";
import { SEA_FLOOR } from "./constants";
import { uTime } from "./uniforms";
import { terrainH, getSandBump, addCaustics } from "./helpers";

// イカ・タコ・ウミガメ・エイ・イルカ。手(handPos/reachT)に反応する個体もいる。
export function buildWildlife(scene, { sound, bub }) {
  const sandBump = getSandBump();

  /* ---------- イカ ×4 ---------- */
  const squids = [];
  {
    const sqMat = new THREE.MeshPhongMaterial({
      color: 0xd9c6ce, specular: 0x886a78, shininess: 70, transparent: true, opacity: 0.93, emissive: 0x180a12, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 9), sqMat);
      mantle.scale.set(0.34, 0.34, 1.25); mantle.position.z = -0.35; g.add(mantle);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), sqMat);
      tip.rotation.x = -Math.PI / 2; tip.position.z = -1.15; g.add(tip);
      [-1, 1].forEach((s) => {
        const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.7), sqMat);
        fin.position.set(s * 0.18, 0, -0.85); fin.rotation.y = s * 0.5; g.add(fin);
      });
      for (let a2 = 0; a2 < 8; a2++) {
        const ang = a2 / 8 * Math.PI * 2;
        const arm = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.55, 5), sqMat);
        arm.position.set(Math.cos(ang) * 0.10, Math.sin(ang) * 0.10, 0.42);
        arm.rotation.x = Math.PI / 2 + 0.18;
        arm.rotation.z = ang;
        g.add(arm);
      }
      const eyeM = new THREE.MeshPhongMaterial({ color: 0x0e0c12, specular: 0xffffff, shininess: 200 });
      [-1, 1].forEach((s) => {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeM);
        e.position.set(s * 0.18, 0.05, 0.18); g.add(e);
      });
      scene.add(g);
      squids.push({
        g, vel: new THREE.Vector3(0.3, 0, 0.2), jetT: 2 + Math.random() * 5,
        home: new THREE.Vector3(-28 + Math.random() * 16, -8 - Math.random() * 5, 26 + Math.random() * 16),
        seed: Math.random() * 9,
      });
    }
  }
  function updateSquids(dt, t, hand, reach) {
    squids.forEach((q) => {
      q.jetT -= dt;
      const toHome = q.home.clone().sub(q.g.position);
      if (toHome.length() > 26) q.vel.addScaledVector(toHome.normalize(), dt * 1.6);
      if (hand && reach > 0.5) {
        const dh = q.g.position.distanceTo(hand);
        if (dh < 6 && q.jetT > 0.6) {
          q.jetT = 0;
          const away = q.g.position.clone().sub(hand).normalize();
          q.vel.copy(away.multiplyScalar(7.5));
          for (let i = 0; i < 5; i++)
            bub.spawn(q.g.position.x, q.g.position.y, q.g.position.z, 0.015 + Math.random() * 0.02);
        }
      }
      if (q.jetT < 0) {
        q.jetT = 3.5 + Math.random() * 5;
        const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5).normalize();
        q.vel.addScaledVector(dir, 5.0);
      }
      q.vel.multiplyScalar(Math.pow(0.30, dt));
      q.vel.y += Math.sin(t * 0.7 + q.seed) * dt * 0.25;
      q.g.position.addScaledVector(q.vel, dt);
      q.g.position.y = THREE.MathUtils.clamp(q.g.position.y, SEA_FLOOR + 3, -2.5);
      if (q.vel.length() > 0.25) {
        const tgt = q.g.position.clone().sub(q.vel);
        q.g.lookAt(tgt);
      }
    });
  }

  /* ---------- タコ ×2 ---------- */
  const octos = [];
  {
    const ocMat = new THREE.MeshPhongMaterial({ color: 0x7e4030, specular: 0x40201a, shininess: 30, bumpMap: sandBump, bumpScale: 0.02 });
    addCaustics(ocMat, 0.22);
    const eyeM = new THREE.MeshPhongMaterial({ color: 0x14100c, specular: 0xffffff, shininess: 160 });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), ocMat);
      head.scale.set(1.0, 0.92, 1.1); head.position.y = 0.34; g.add(head);
      [-1, 1].forEach((s) => {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeM);
        e.position.set(s * 0.15, 0.42, 0.27); g.add(e);
        const lid = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), ocMat);
        lid.position.set(s * 0.15, 0.45, 0.25); lid.scale.set(1, 0.7, 1); g.add(lid);
      });
      const arms = [];
      for (let a2 = 0; a2 < 8; a2++) {
        const ang = a2 / 8 * Math.PI * 2;
        const root = new THREE.Group();
        root.position.set(Math.cos(ang) * 0.22, 0.10, Math.sin(ang) * 0.22);
        root.rotation.y = -ang + Math.PI / 2;
        let parent = root;
        const segs = [];
        for (let sg = 0; sg < 3; sg++) {
          const seg = new THREE.Group();
          const r1 = 0.085 * Math.pow(0.62, sg);
          const cone = new THREE.Mesh(new THREE.CylinderGeometry(r1 * 0.62, r1, 0.34, 6), ocMat);
          cone.rotation.z = Math.PI / 2; cone.position.x = 0.17;
          seg.add(cone);
          if (sg > 0) seg.position.x = 0.34;
          parent.add(seg); parent = seg; segs.push(seg);
        }
        g.add(root); arms.push({ root, segs, ang });
      }
      const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 40;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      g.position.set(x, SEA_FLOOR + terrainH(x, z) + 0.05, z);
      g.scale.setScalar(1.1 + Math.random() * 0.5);
      scene.add(g);
      octos.push({ g, arms, seed: Math.random() * 9, hide: 0 });
    }
  }
  function updateOcto(dt, t, hand, reach) {
    octos.forEach((o) => {
      let tgtHide = 0;
      if (hand && reach > 0.5 && o.g.position.distanceTo(hand) < 4.5) tgtHide = 1;
      o.hide += (tgtHide - o.hide) * Math.min(1, dt * 3);
      const breathe = 1 + Math.sin(t * 1.1 + o.seed) * 0.04 * (1 - o.hide);
      o.g.scale.y = o.g.scale.x * breathe * (1 - o.hide * 0.3);
      o.arms.forEach((ar, i) => {
        ar.segs.forEach((sg, k) => {
          const wave = Math.sin(t * 1.3 + o.seed + i * 0.8 + k * 0.9) * 0.22 * (1 - o.hide);
          sg.rotation.z = -0.34 - k * 0.18 - o.hide * 0.85 + wave;
        });
      });
    });
  }

  /* ---------- ウミガメ ---------- */
  const turtle = new THREE.Group();
  {
    const shellMat = new THREE.MeshPhongMaterial({ color: 0x55714c, specular: 0x335544, shininess: 30, bumpMap: sandBump, bumpScale: 0.02 });
    const skinMat = new THREE.MeshPhongMaterial({ color: 0x7c8a6a, specular: 0x445544, shininess: 24 });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), shellMat);
    shell.scale.set(1.15, 0.5, 1.5); turtle.add(shell);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshPhongMaterial({ color: 0xd9cfa8, shininess: 14 }));
    belly.scale.set(1.05, 0.32, 1.38); belly.position.y = -0.18; turtle.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), skinMat);
    head.scale.set(0.8, 0.75, 1.1); head.position.set(0, 0.06, 1.62); turtle.add(head);
    const eyeM = new THREE.MeshPhongMaterial({ color: 0x101418, shininess: 120 });
    [-1, 1].forEach((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeM);
      e.position.set(0.2 * s, 0.16, 1.82); turtle.add(e);
    });
    turtle.userData.flippers = [];
    const fGeo = new THREE.SphereGeometry(1, 10, 8); fGeo.scale(0.85, 0.09, 0.34); fGeo.translate(0.8, 0, 0);
    [[-1, 0.7], [1, 0.7], [-1, -1.0], [1, -1.0]].forEach(([sx, z], i) => {
      const fl = new THREE.Mesh(fGeo, skinMat);
      fl.position.set(0.65 * sx, -0.06, z);
      fl.scale.x = sx * (i < 2 ? 1 : 0.6);
      turtle.add(fl); turtle.userData.flippers.push(fl);
    });
    turtle.scale.setScalar(1.25);
    scene.add(turtle);
  }
  const turtlePull = new THREE.Vector3();
  const bubP = new THREE.Vector3();

  /* ---------- エイ ×2 ---------- */
  const rays = [];
  function makeRay(phase) {
    const g = new THREE.PlaneGeometry(4.6, 2.6, 14, 8);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const w = Math.pow(Math.max(0, 1 - Math.abs(x) / 2.3), 0.55);
      p.setZ(i, z * w + (z < 0 ? -Math.abs(x) * 0.12 : 0));
    }
    g.computeVertexNormals();
    const m = new THREE.MeshPhongMaterial({ color: 0x32414e, specular: 0x556677, shininess: 40, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.uniforms.uPh = { value: phase };
      sh.vertexShader = ("uniform float uTime; uniform float uPh;\n" + sh.vertexShader).replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         transformed.y += sin(uTime*1.9 + uPh + abs(position.x)*1.4) * pow(abs(position.x)/2.3, 1.5) * 0.85;`);
    };
    const mesh = new THREE.Mesh(g, m);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 2.4, 5), m);
    tail.rotation.x = Math.PI / 2 - 0.12; tail.position.set(0, 0.05, -2.2);
    mesh.add(tail);
    scene.add(mesh);
    return { mesh, phase, seed: Math.random() * 100 };
  }
  rays.push(makeRay(0), makeRay(2.5));

  /* ---------- イルカ ×2 (遠景) ---------- */
  const dolphins = [];
  function makeDolphin() {
    const g = new THREE.Group();
    const m = new THREE.MeshPhongMaterial({ color: 0x4a5b68, specular: 0x8899aa, shininess: 90 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), m);
    body.scale.set(0.42, 0.46, 1.9); g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 8), m);
    nose.rotation.x = Math.PI / 2; nose.position.z = 1.95; g.add(nose);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 4), m);
    fin.position.set(0, 0.55, 0.1); fin.rotation.y = Math.PI / 4; g.add(fin);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), m);
    tail.scale.set(1.2, 0.08, 0.5); tail.position.z = -1.95; g.add(tail);
    scene.add(g);
    return g;
  }
  dolphins.push({ g: makeDolphin(), off: 0 }, { g: makeDolphin(), off: Math.PI });
  let dolphinTimer = 14;

  function update(dt, t, state) {
    const { handPos, reachT } = state;
    updateSquids(dt, t, handPos, reachT);
    updateOcto(dt, t, handPos, reachT);

    /* ウミガメ：大きな円を悠々と */
    {
      const ta = t * 0.045 + 1.0, r = 26;
      const px = Math.cos(ta) * r, pz = Math.sin(ta) * r;
      const py = -9 + Math.sin(t * 0.18) * 1.6;
      bubP.set(px, py, pz);
      if (reachT > 0.5 && bubP.distanceTo(handPos) < 12) {
        turtlePull.lerp(handPos.clone().sub(bubP).multiplyScalar(0.45), Math.min(1, dt * 0.8));
        if (turtlePull.length() > 3.2) turtlePull.setLength(3.2);
      } else {
        turtlePull.multiplyScalar(Math.pow(0.5, dt));
      }
      turtle.position.set(px + turtlePull.x, py + turtlePull.y, pz + turtlePull.z);
      const na = ta + 0.02;
      turtle.lookAt(Math.cos(na) * r, py + Math.cos(t * 0.18) * 0.28, Math.sin(na) * r);
      const flap = Math.sin(t * 1.1);
      turtle.userData.flippers.forEach((f, i) => {
        f.rotation.z = (i % 2 ? 1 : -1) * flap * 0.5 * (i < 2 ? 1 : 0.4);
        f.rotation.x = flap * 0.18;
      });
    }
    /* エイ：滑空 */
    rays.forEach((r, i) => {
      const ta = t * 0.06 + r.seed, rr = 38 + i * 14;
      const px = Math.cos(ta) * rr, pz = Math.sin(ta) * rr;
      const py = -13 + Math.sin(t * 0.13 + r.seed) * 2.5;
      r.mesh.position.set(px, py, pz);
      const na = ta + 0.03;
      r.mesh.lookAt(Math.cos(na) * rr, py + Math.cos(t * 0.13 + r.seed) * 0.3, Math.sin(na) * rr);
    });
    /* イルカ：遠くを回遊し時々跳ねる */
    dolphins.forEach((d) => {
      const ta = t * 0.16 + d.off, rr = 48;
      const px = Math.cos(ta) * rr, pz = Math.sin(ta) * rr;
      const py = -2.2 + Math.sin(ta * 4.0) * 2.6;
      d.g.position.set(px, py, pz);
      const na = ta + 0.05;
      d.g.lookAt(Math.cos(na) * rr, -2.2 + Math.sin(na * 4.0) * 2.6, Math.sin(na) * rr);
    });
    dolphinTimer -= dt;
    if (dolphinTimer < 0) { dolphinTimer = 22 + Math.random() * 26; sound.dolphinCall(); }
  }

  return { update };
}
