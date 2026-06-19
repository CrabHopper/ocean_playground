import * as THREE from "three";
import { uTime, uNight } from "./uniforms";
import { GLSL_NOISE } from "./glsl";

// ポストプロセス：水滴 / 水膜 / 半没のメニスカス / 大泡のレンズ屈折 /
// 色収差 / サンフレア / 露出・水中グレード・トーンマップ / ビネット・グレイン。
export function buildPost(width, height, dpr) {
  const rt = new THREE.WebGLRenderTarget(
    Math.floor(width * dpr), Math.floor(height * dpr),
    { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postU = {
    tDiffuse: { value: rt.texture },
    uTime, uNight, uWet: { value: 0 }, uSheet: { value: 0 }, uSheetEdge: { value: -1 },
    uUnder: { value: 1 }, uExposure: { value: 1.0 },
    uLineY: { value: 0.5 }, uLineVis: { value: 0 },
    uBub: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uSun: { value: new THREE.Vector2(0.5, 0.5) }, uFlare: { value: 0 },
    uAspect: { value: width / height },
  };
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: postU,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader: GLSL_NOISE + `
      uniform sampler2D tDiffuse;
      uniform float uTime,uWet,uSheet,uSheetEdge,uUnder,uExposure,uFlare,uAspect,uLineY,uLineVis,uNight;
      uniform vec2 uSun;
      uniform vec4 uBub[16];
      varying vec2 vUv;

      vec3 dropLayer(vec2 uv, float scale, float t, float wet){
        vec2 g = uv*vec2(scale, scale*uAspect);
        vec2 id = floor(g); vec2 f = fract(g)-0.5;
        vec2 rnd = hash22(id);
        float keep = step(rnd.x, wet*0.9);
        float r = (0.10+0.20*rnd.y) * (0.45+0.55*wet);
        float runner = step(0.82, rnd.y);
        vec2 dpos = (rnd-0.5)*0.55;
        dpos.y -= runner * fract(t*(0.05+0.12*rnd.x)) * 1.4;
        vec2 d = f - dpos;
        d.y *= mix(0.85, 0.45, runner);
        float dist = length(d);
        float m = smoothstep(r, r*0.55, dist) * keep;
        vec2 nrm = (d/max(r,1e-3)) * m;
        return vec3(nrm, m);
      }
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }

      void main(){
        vec2 uv = vUv;
        float covered = smoothstep(uSheetEdge+0.06, uSheetEdge-0.10, uv.y) * uSheet;
        vec2 wob = vec2(sin(uv.y*34.0+uTime*26.0), cos(uv.x*28.0+uTime*21.0)) * 0.016 * covered;
        uv += wob;

        vec2 off = vec2(0.0);
        float dm = 0.0;
        if(uWet > 0.003){
          vec3 d1 = dropLayer(uv, 6.0,  uTime, uWet);
          vec3 d2 = dropLayer(uv+13.7, 11.0, uTime*1.2, uWet*0.8);
          off -= (d1.xy*0.085 + d2.xy*0.05);
          dm = max(d1.z, d2.z);
        }

        float lineLy = 0.0, lineTh = 0.0, lineBelow = 0.0;
        if(uLineVis > 0.003){
          float wob1 = sin(vUv.x*26.0+uTime*4.6)*0.0055
                     + sin(vUv.x*61.0-uTime*8.5)*0.0028
                     + sin(vUv.x*9.0+uTime*2.1)*0.0085
                     + (vnoise(vec2(vUv.x*14.0, uTime*0.8))-0.5)*0.009;
          lineLy = uLineY + wob1;
          lineTh = 0.0058 + 0.0030*vnoise(vec2(vUv.x*22.0, uTime*0.7));
          lineBelow = smoothstep(lineLy+0.002, lineLy-0.05, vUv.y) * uLineVis;
          off += vec2(sin(vUv.y*130.0+uTime*9.0)*0.0022,
                      sin(vUv.x*85.0-uTime*6.5)*0.0016) * lineBelow;
        }

        float bubRim = 0.0, bubSpec = 0.0, bubShade = 0.0;
        for(int i=0; i<16; i++){
          vec4 B = uBub[i];
          if(B.z <= 0.0002) continue;
          vec2 dv = (vUv - B.xy) * vec2(uAspect, 1.0);
          float ang = atan(dv.y, dv.x);
          float wobR = B.z * (1.0 + 0.055*sin(ang*5.0 + B.w + uTime*7.0)
                                  + 0.035*sin(ang*9.0 - B.w*2.0 - uTime*9.5));
          float rr = length(dv) / wobR;
          if(rr < 1.15){
            if(rr < 1.0){
              float lens = mix(-0.42, 1.0, smoothstep(0.0, 1.0, rr*rr));
              vec2 tgt = B.xy + dv*lens / vec2(uAspect, 1.0);
              off += (tgt - vUv);
              bubShade += smoothstep(1.0, 0.74, rr) * smoothstep(0.45, 0.74, rr);
            }
            float ring = smoothstep(1.0, 0.93, rr) * smoothstep(0.80, 0.93, rr);
            ring *= 0.6 + 0.5*smoothstep(0.3, -0.8, dv.y/wobR);
            bubRim += ring;
            vec2 hp1 = dv/wobR - vec2(-0.32, 0.38);
            vec2 hp2 = dv/wobR - vec2( 0.26,-0.30);
            bubSpec += exp(-dot(hp1,hp1)*55.0) + exp(-dot(hp2,hp2)*90.0)*0.35;
          }
        }

        vec2 cc = uv-0.5;
        float rad = dot(cc,cc);
        vec2 ca = cc*rad*0.012;
        vec3 col;
        col.r = texture2D(tDiffuse, uv+off+ca).r;
        col.g = texture2D(tDiffuse, uv+off).g;
        col.b = texture2D(tDiffuse, uv+off-ca).b;

        col += dm * 0.05;
        col += covered * 0.10;

        col *= 1.0 - clamp(bubShade,0.0,1.0)*0.22;
        col += clamp(bubRim,0.0,1.5) * mix(vec3(0.62,0.85,1.0), vec3(0.45,0.62,0.95), uNight) * 0.45;
        col += clamp(bubSpec,0.0,2.0) * vec3(1.0,0.98,0.92) * (0.9-0.3*uNight);

        if(uLineVis > 0.003){
          float band = (1.0 - smoothstep(0.0, lineTh, abs(vUv.y-lineLy))) * uLineVis;
          col = mix(col, col*vec3(0.42,0.68,0.92), lineBelow*0.42);
          float above = smoothstep(lineLy, lineLy+0.12, vUv.y) * uLineVis;
          col = mix(col, col*1.05 + vec3(0.015,0.022,0.022), above*0.45);
          col = mix(col, vec3(0.010,0.038,0.052), band*0.92);
          float hl = (1.0 - smoothstep(0.0, lineTh*0.9, abs(vUv.y-(lineLy+lineTh*1.7)))) * uLineVis;
          col += hl * vec3(0.55,0.80,0.85) * 0.28;
          col += band * vec3(0.6,0.9,1.0)
               * pow(max(0.0,sin(vUv.x*74.0+uTime*9.0+lineLy*40.0)),8.0) * 0.22;
        }

        if(uFlare > 0.003){
          vec2 sp = uSun;
          vec2 dv = (uv-sp)*vec2(uAspect,1.0);
          float sd = dot(dv,dv);
          float deep = mix(1.0, 1.8, uUnder);
          col += uFlare * mix(vec3(1.0,0.95,0.82), vec3(0.65,0.95,1.0), uUnder) * 0.85 * exp(-sd*14.0/deep);
          col += uFlare * vec3(1.0,0.9,0.7) * 0.16 * exp(-sd*1.8);
          float gh = uFlare*(1.0-uUnder);
          vec2 vC = (vec2(0.5)-sp);
          for(int i=1;i<=3;i++){
            vec2 gp = sp + vC*float(i)*0.62;
            vec2 gd = (uv-gp)*vec2(uAspect,1.0);
            col += gh * vec3(0.45,0.75,0.6+0.12*float(i)) * 0.05 * exp(-dot(gd,gd)*70.0*float(i));
          }
        }

        col *= uExposure;
        float vg2 = smoothstep(0.0, 1.0, vUv.y);
        col *= mix(vec3(1.0), mix(vec3(0.40,0.60,1.00), vec3(1.00,1.04,1.06), vg2), uUnder);
        col = mix(col, col*vec3(0.80,0.94,1.14), uUnder*0.62);
        float lum = dot(col, vec3(0.299,0.587,0.114));
        col = mix(vec3(lum), col, 1.0 + 0.30*uUnder);
        col = mix(col, col*vec3(0.80,0.90,1.14) + vec3(0.0,0.004,0.013), uNight*0.6);
        col = aces(col*0.88);
        col = pow(col, vec3(1.0/2.2));

        float vg = smoothstep(1.35, 0.45, length(cc)*1.6);
        col *= mix(0.78, 1.0, vg);
        col += (hash12(uv*vec2(1920.0,1080.0)+fract(uTime)*7.0)-0.5)*(0.012+0.014*uNight);

        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  postScene.add(postQuad);

  function setSize(w, h, dprNow) {
    rt.setSize(Math.floor(w * dprNow), Math.floor(h * dprNow));
    postU.uAspect.value = w / h;
  }

  return { rt, postScene, postCam, postU, setSize };
}
