import * as THREE from "three";
import { SEA_FLOOR, SUN_DIR } from "./constants";
import { uTime, uNight, uFogColor, uFogDensity } from "./uniforms";
import { GLSL_NOISE, GLSL_WAVE, GLSL_SKY } from "./glsl";
import { terrainH, getSandBump, addCaustics } from "./helpers";

// 空 / 水面 / 海底 / 神光 / プランクトン / ライトをまとめて構築する。
export function buildEnvironment(scene, camera) {
  /* ---------- ライト ---------- */
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.25);
  sun.position.copy(SUN_DIR).multiplyScalar(80);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0x6fbce6, 0x05203c, 0.72);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x0a3358, 0.40);
  scene.add(amb);
  /* ダイブライト（夜） */
  const torch = new THREE.SpotLight(0xd9eeff, 0, 30, 0.52, 0.65, 1.1);
  torch.position.set(0.16, -0.18, 0);
  const torchTarget = new THREE.Object3D();
  torchTarget.position.set(0, -0.4, -8);
  camera.add(torch);
  camera.add(torchTarget);
  torch.target = torchTarget;

  /* ---------- 空ドーム ---------- */
  {
    const g = new THREE.SphereGeometry(820, 32, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: SUN_DIR }, uNight },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: GLSL_NOISE + GLSL_SKY + `
        uniform vec3 uSun; uniform float uNight; varying vec3 vDir;
        void main(){ gl_FragColor = vec4(skyCol(normalize(vDir), uSun, uNight), 1.0); }`,
    });
    const sky = new THREE.Mesh(g, m);
    sky.renderOrder = -2;
    scene.add(sky);
    sky.onBeforeRender = () => sky.position.copy(camera.position);
  }

  /* ---------- 水面 (多重波 + フレネル + スネルの窓) ---------- */
  const waterMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false,
    uniforms: {
      uTime, uNight, uSun: { value: SUN_DIR },
      uFogC: uFogColor, uFogD: uFogDensity,
    },
    vertexShader: GLSL_WAVE + `
      uniform float uTime;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        wp.y += waveH(wp.xz, uTime);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: GLSL_NOISE + GLSL_WAVE + GLSL_SKY + `
      uniform float uTime; uniform vec3 uSun; uniform float uNight;
      uniform vec3 uFogC; uniform float uFogD;
      varying vec3 vW;
      void main(){
        vec3 toP = vW - cameraPosition;
        float dist = length(toP);
        vec3 V = toP / dist;
        float e = 0.45;
        float h  = waveH(vW.xz, uTime);
        float hx = waveH(vW.xz + vec2(e,0.0), uTime);
        float hz = waveH(vW.xz + vec2(0.0,e), uTime);
        vec3 N = normalize(vec3(-(hx-h)/e, 1.0, -(hz-h)/e));
        float att = 1.0/(1.0 + dist*0.035);
        float de = 0.14; vec2 dp = vW.xz*2.7 + vec2(uTime*0.55, -uTime*0.42);
        float n0=vnoise(dp), nx=vnoise(dp+vec2(de,0.0)), nz=vnoise(dp+vec2(0.0,de));
        N.xz += vec2(-(nx-n0), -(nz-n0))/de * 0.11 * att;
        vec2 dp2 = vW.xz*7.0 - vec2(uTime*0.9, uTime*0.6);
        float m0=vnoise(dp2), mx=vnoise(dp2+vec2(de,0.0)), mz=vnoise(dp2+vec2(0.0,de));
        N.xz += vec2(-(mx-m0), -(mz-m0))/de * 0.05 * att;
        vec2 dp3 = vW.xz*15.0 + vec2(uTime*1.5, uTime*1.1);
        float k0=vnoise(dp3), kx=vnoise(dp3+vec2(de,0.0)), kz=vnoise(dp3+vec2(0.0,de));
        N.xz += vec2(-(kx-k0), -(kz-k0))/de * 0.028 * att;
        N = normalize(N);

        vec3 col;
        if (cameraPosition.y < vW.y){
          /* ── 水中から見上げる：屈折(スネルの窓) / 全反射 ── */
          vec3 Nd = -N;
          float eta = 1.333;
          float cosI = clamp(dot(-V, Nd), 0.0, 1.0);
          float k = 1.0 - eta*eta*(1.0 - cosI*cosI);
          vec3 refl = reflect(V, Nd);
          float g = clamp(-refl.y*0.5+0.5, 0.0, 1.0);
          vec3 underRef = mix(vec3(0.008,0.12,0.27), vec3(0.035,0.34,0.55), g);
          underRef += vec3(0.75,0.95,1.0) * pow(vnoise(vW.xz*2.2 + uTime*0.8), 7.0) * 2.1;
          if (k <= 0.0){
            col = underRef;
          } else {
            vec3 R = normalize(eta*V + (eta*cosI - sqrt(k)) * Nd);
            vec3 skyc = skyCol(R, uSun, uNight) * (1.35 - 0.45*uNight);
            float F = 0.025 + 0.975*pow(1.0 - sqrt(k), 3.0);
            col = mix(skyc, underRef, clamp(F,0.0,1.0));
          }
          float fo = 1.0 - exp(-dist*uFogD*1.35);
          col = mix(col, uFogC, fo);
        } else {
          /* ── 水上から見る：空の反射 + 水色の透過 ── */
          vec3 R = reflect(V, N);
          R.y = abs(R.y);
          float F = 0.02 + 0.98*pow(1.0 - max(dot(-V,N),0.0), 5.0);
          vec3 waterC = mix(vec3(0.008,0.155,0.235), vec3(0.022,0.30,0.385), clamp(1.0-dist*0.012,0.0,1.0));
          waterC *= (1.0 - 0.88*uNight);
          vec3 skyc = skyCol(R, uSun, uNight);
          float glit = pow(max(dot(R, uSun),0.0), 240.0) * (0.5 + vnoise(vW.xz*8.0+uTime)*1.6);
          col = mix(waterC, skyc, F) + mix(vec3(1.0,0.95,0.8), vec3(0.8,0.9,1.0), uNight)*glit*(2.2-0.9*uNight);
          float cref = pow(max(dot(normalize(vec3(R.x,0.001,R.z)), CITYDIR), 0.0), 16.0)
                     * clamp(1.0-R.y*2.0, 0.0, 1.0);
          col += vec3(1.0,0.52,0.22) * cref * uNight
               * (0.35+0.65*vnoise(vW.xz*5.0+uTime*0.7)) * 0.9;
          float crest = smoothstep(0.18, 0.42, h);
          float fleck = step(0.80, vnoise(vW.xz*4.5 + uTime*0.35))
                      * step(0.55, vnoise(vW.xz*16.0 - uTime*0.8));
          col = mix(col, vec3(0.88,0.95,0.96)*(1.0-0.7*uNight), crest*fleck*0.5);
          float fo = 1.0 - exp(-dist*0.006);
          col = mix(col, skyCol(normalize(vec3(V.x,0.02,V.z)), uSun, uNight), fo);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const waterGeo = new THREE.PlaneGeometry(900, 900, 210, 210);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat);
  scene.add(water);

  /* ---------- 海底（白砂 + 微細凹凸 + コースティクス） ---------- */
  const sandBump = getSandBump();
  {
    const g = new THREE.PlaneGeometry(680, 680, 190, 190);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, terrainH(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const m = new THREE.MeshPhongMaterial({
      color: 0x6e5a40, specular: 0x141d22, shininess: 6,
      bumpMap: sandBump, bumpScale: 0.03,
    });
    addCaustics(m, 0.40);
    const floor = new THREE.Mesh(g, m);
    floor.position.y = SEA_FLOOR;
    scene.add(floor);
  }

  /* ---------- 神光 (God Rays) ---------- */
  const rayShaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime, uNight, uInt: { value: 0.6 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: GLSL_NOISE + `
      uniform float uTime; uniform float uInt; uniform float uNight; varying vec2 vUv;
      void main(){
        float edge = smoothstep(0.0,0.32,vUv.x)*smoothstep(1.0,0.68,vUv.x);
        float vert = pow(vUv.y, 1.7);
        float n = vnoise(vec2(vUv.x*3.0 + uTime*0.07, vUv.y*0.6 - uTime*0.05));
        float n2 = vnoise(vec2(vUv.x*9.0 - uTime*0.11, 3.0));
        float a = edge*vert*(0.30+0.70*n)*(0.6+0.4*n2)*uInt;
        vec3 rc = mix(vec3(0.75,0.93,1.0), vec3(0.38,0.58,1.0), uNight);
        gl_FragColor = vec4(rc*a*(1.0-0.45*uNight), a*(1.0-0.30*uNight));
      }`,
  });
  const shafts = [];
  for (let i = 0; i < 14; i++) {
    const w = 1.5 + Math.random() * 4.5;
    const g = new THREE.PlaneGeometry(w, 34);
    const m = new THREE.Mesh(g, rayShaftMat);
    m.renderOrder = 6;
    shafts.push({ m, ox: (Math.random() - 0.5) * 46, oz: (Math.random() - 0.5) * 46, sp: 0.3 + Math.random() * 0.6 });
    scene.add(m);
  }

  /* ---------- 浮遊粒子(プランクトン / マリンスノー) ---------- */
  const SNOW_N = 900, SNOW_R = 34;
  const snow = (() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(SNOW_N * 3), seed = new Float32Array(SNOW_N);
    for (let i = 0; i < SNOW_N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * SNOW_R * 2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * SNOW_R * 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * SNOW_R * 2;
      seed[i] = Math.random() * 100;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime, uNight, uCam: { value: new THREE.Vector3() } },
      vertexShader: `
        uniform float uTime; uniform vec3 uCam; attribute float aSeed;
        varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime*0.22+aSeed)*1.4;
          p.y += sin(uTime*0.13+aSeed*1.7)*0.9 - uTime*0.06;
          p.z += cos(uTime*0.18+aSeed*0.6)*1.4;
          p = mod(p - uCam + ${SNOW_R.toFixed(1)}, ${(SNOW_R * 2).toFixed(1)}) - ${SNOW_R.toFixed(1)} + uCam;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          float d = -mv.z;
          gl_PointSize = clamp(90.0/d, 0.6, 5.0) * (0.5+0.5*sin(aSeed*9.0));
          vA = (0.20 + 0.16*sin(uTime*1.4+aSeed*5.0)) * smoothstep(${SNOW_R.toFixed(1)}, ${(SNOW_R * 0.5).toFixed(1)}, d);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: `
        uniform float uNight; varying float vA;
        void main(){
          float d = length(gl_PointCoord-0.5);
          float a = smoothstep(0.5,0.12,d)*vA;
          vec3 c = mix(vec3(0.85,0.96,0.95), vec3(0.38,1.0,0.78), uNight); /* 夜光虫 */
          gl_FragColor = vec4(c, a*(1.0+1.8*uNight));
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts, m };
  })();

  // 神光・プランクトンの毎フレーム更新
  function update(t, camera2, under, depth01) {
    water.position.set(camera2.position.x, 0, camera2.position.z);
    snow.m.uniforms.uCam.value.copy(camera2.position);
    snow.pts.visible = under;
    rayShaftMat.uniforms.uInt.value = under ? (0.32 + 0.78 * (1 - depth01)) * (0.75 + 0.25 * Math.sin(t * 0.4)) : 0;
    shafts.forEach((s) => {
      const px = camera2.position.x + s.ox, pz = camera2.position.z + s.oz;
      s.m.position.set(px + Math.sin(t * 0.05 * s.sp) * 2, -17, pz + Math.cos(t * 0.04 * s.sp) * 2);
      s.m.rotation.set(0, Math.atan2(camera2.position.x - px, camera2.position.z - pz), 0);
      s.m.rotateX(-0.12); s.m.rotateZ(0.30);
    });
  }

  return { sun, hemi, amb, torch, water, waterMat, snow, shafts, rayShaftMat, update };
}
