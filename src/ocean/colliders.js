// シンプルな衝突判定。歩行時に使う。
//  solids : 壁・家具・ビル等の AABB(水平方向に押し戻す)
//  floors : 歩ける水平面(床・桁など)。プレイヤーの現在高さ curY で段差をゲート。
//  providers : 任意の歩行面(スロープ等)を返す関数 (x,z)=>y|null
const solids = [];
const floors = [];
const providers = [];
const STEP = 1.6;   // 登れる段差

export const colliders = {
  reset() { solids.length = 0; floors.length = 0; providers.length = 0; },
  addSolid(x0, y0, z0, x1, y1, z1) {
    solids.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
                  x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1) });
  },
  // 中心(cx,cz)・半幅(hw,hd)・y範囲 で AABB を足す簡便版
  addBox(cx, cy, cz, hw, hh, hd) { this.addSolid(cx - hw, cy - hh, cz - hd, cx + hw, cy + hh, cz + hd); },
  addFloor(x0, z0, x1, z1, y) {
    const f = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y };
    floors.push(f); return f;   // y は呼び出し側が書き換え可(動く床)
  },
  addProvider(fn) { providers.push(fn); },

  groundAt(x, z, curY, base) {
    let g = base ? base(x, z) : -1e9;
    for (const f of floors) {
      if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && f.y <= curY + STEP && f.y > g) g = f.y;
    }
    for (const p of providers) {
      const y = p(x, z);
      if (y != null && y <= curY + STEP && y > g) g = y;
    }
    return g;
  },

  // 水平方向に壁から押し出す。feetY..headY が solid の y 範囲と重なる時のみ。
  resolve(pos, radius, feetY, headY) {
    for (const s of solids) {
      if (headY <= s.y0 || feetY >= s.y1) continue;
      const x0 = s.x0 - radius, x1 = s.x1 + radius, z0 = s.z0 - radius, z1 = s.z1 + radius;
      if (pos.x <= x0 || pos.x >= x1 || pos.z <= z0 || pos.z >= z1) continue;
      const px = Math.min(pos.x - x0, x1 - pos.x);
      const pz = Math.min(pos.z - z0, z1 - pos.z);
      if (px < pz) pos.x += (pos.x < (s.x0 + s.x1) / 2 ? -px : px);
      else pos.z += (pos.z < (s.z0 + s.z1) / 2 ? -pz : pz);
    }
  },
};
