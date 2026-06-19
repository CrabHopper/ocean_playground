import * as THREE from "three";

// シーン横断で共有する uniform。フレームごとに scene.js が値を更新し、
// 各マテリアルはこのオブジェクトを参照することで一括同期される。
export const uTime = { value: 0 };
export const uNight = { value: 0 }; // 0=昼 1=夜
export const uFogColor = { value: new THREE.Color(0x1d7ab2) };
export const uFogDensity = { value: 0.022 };
