// シェーダ間で使い回す GLSL スニペット。
// 利用側は文字列連結で取り込む（NOISE → SKY の順に依存）。

export const GLSL_NOISE = `
float hash12(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
vec2 hash22(vec2 p){ float n=hash12(p); return vec2(n, hash12(p+n+17.17)); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash12(i), b=hash12(i+vec2(1,0)), c=hash12(i+vec2(0,1)), d=hash12(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}`;

export const GLSL_CAUSTIC = `
float caustic(vec2 p, float t){
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++){
    float tt = t * (1.0 - (3.5 / float(n+1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0/length(vec2(p.x/(sin(i.x+tt)/inten), p.y/(cos(i.y+tt)/inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 2.0);
}`;

export const GLSL_WAVE = `
float waveH(vec2 p, float t){
  float h = 0.0;
  h += sin(dot(p, vec2( 0.160, 0.120)) + t*0.90) * 0.34;
  h += sin(dot(p, vec2(-0.230, 0.180)) + t*1.25) * 0.19;
  h += sin(dot(p, vec2( 0.310,-0.270)) + t*1.60) * 0.12;
  h += sin(dot(p, vec2(-0.110,-0.350)) + t*1.05) * 0.10;
  h += sin(dot(p, vec2( 0.620, 0.510)) + t*2.30) * 0.045;
  h += sin(dot(p, vec2(-0.550, 0.760)) + t*2.80) * 0.030;
  return h;
}`;

export const GLSL_SKY = `
const vec3 CITYDIR = vec3(-0.24942, 0.0, -0.96839);
vec3 skyCol(vec3 d, vec3 sunD, float night){
  float h = clamp(d.y, 0.0, 1.0);
  float s = max(dot(d, sunD), 0.0);
  /* 昼 */
  vec3 day = mix(vec3(0.72,0.84,0.91), vec3(0.10,0.34,0.74), pow(h, 0.55));
  day += vec3(1.0,0.96,0.82) * pow(s, 900.0) * 9.0;
  day += vec3(1.0,0.92,0.72) * pow(s, 22.0) * 0.45;
  day += vec3(1.0,0.97,0.9)  * pow(s, 3.0)  * 0.14;
  /* 夜 */
  vec3 ngt = mix(vec3(0.040,0.058,0.100), vec3(0.004,0.008,0.020), pow(h, 0.5));
  /* 美しい月：海(クレーター模様)・縁減光・暈 */
  float mang = acos(clamp(dot(d, sunD), -1.0, 1.0));
  float mr = 0.042;
  float mdisc = smoothstep(mr, mr*0.93, mang);
  vec3 mx = normalize(cross(sunD, vec3(0.0,1.0,0.0)));
  vec3 my = cross(mx, sunD);
  vec2 muv = vec2(dot(d,mx), dot(d,my)) / mr;
  float mare = vnoise(muv*2.4+7.0)*0.55 + vnoise(muv*5.6+3.0)*0.30;
  vec3 mcol = mix(vec3(0.99,0.98,0.93), vec3(0.58,0.61,0.66), smoothstep(0.30,0.78,mare));
  float limb = sqrt(max(0.0, 1.0 - dot(muv,muv)*0.92));
  ngt = mix(ngt, mcol * (0.50+0.50*limb) * 1.25, mdisc);
  ngt += vec3(0.80,0.86,1.0) * smoothstep(mr*2.4, mr, mang) * (1.0-mdisc) * 0.40; /* 縁のグロー */
  ngt += vec3(0.60,0.70,0.95) * pow(max(dot(d,sunD),0.0), 30.0) * 0.16;           /* 暈 */
  vec3 dd = floor(d*150.0);                             /* 星 */
  float st = hash12(dd.xy + dd.z*7.31);
  ngt += vec3(0.9,0.95,1.0) * step(0.9982, st)
       * (0.5+0.5*sin(st*97.0)) * clamp(d.y*3.0,0.0,1.0) * 0.9;
  /* 街明かりの空のにじみ */
  float cg = pow(max(dot(normalize(vec3(d.x,0.0,d.z)+vec3(1e-5)), CITYDIR), 0.0), 5.0)
           * pow(1.0-h, 4.0);
  ngt += vec3(1.0,0.50,0.20) * cg * 0.45;
  day += vec3(1.0,0.85,0.70) * cg * 0.03;
  return mix(day, ngt, night);
}`;
