import { useEffect, useRef, useState } from "react";
import { createScene } from "./scene";

// 碧 — AOI : Underwater Dive
// Three.js のシーン構築・ループは scene.js（とその配下モジュール）が担当し、
// このコンポーネントは導入画面 / HUD / ヘルプなどの UI だけを受け持つ。
export default function UnderwaterDive() {
  const mountRef = useRef(null);
  const depthRef = useRef(null);
  const hintRef = useRef(null);
  const apiRef = useRef(null);

  const [started, setStarted] = useState(false);
  const [night, setNight] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hudOn, setHudOn] = useState(false);
  const [respawnOpen, setRespawnOpen] = useState(false);
  const isTouch = typeof window !== "undefined" && "ontouchstart" in window;

  useEffect(() => {
    const api = createScene(mountRef.current, {
      depthEl: depthRef.current,
      hintEl: hintRef.current,
      onNight: (n) => setNight(n),
      onHelpToggle: () => setHelpOpen((o) => !o),
      onHudToggle: () => setHudOn((o) => !o),
      onRespawnToggle: () => setRespawnOpen((o) => !o),
      onStart: () => { setStarted(true); setHudOn(true); },
    });
    apiRef.current = api;
    return () => api.dispose();
  }, []);

  return (
    <div className={"aoi-root" + (isTouch ? " touch" : "")}>
      <style>{css}</style>

      <div ref={mountRef} className="aoi-canvas" />

      {/* ───────── HUD ───────── */}
      <div className={"aoi-hud" + (hudOn ? " on" : "")}>
        <div ref={depthRef} className="aoi-depth"><b>0.0</b> m</div>
        <div ref={hintRef} className="aoi-hint">
          W/A/S/D 移動 ・ ドラッグ 視点 ・ E エレベータ/浮上 ・ Space ジャンプ/呼吸 ・ R リスポーン ・ Q 説明
        </div>
        <button className="aoi-dn" onClick={(e) => { e.stopPropagation(); apiRef.current?.toggleNight(); }}>
          {night ? "☀" : "☾"}
        </button>
        <button className="aoi-qb" onClick={(e) => { e.stopPropagation(); setHelpOpen((o) => !o); }}>?</button>
        <button className="aoi-rs" onClick={(e) => { e.stopPropagation(); setRespawnOpen((o) => !o); }}>↻</button>
        <div className="aoi-vt">
          <button
            onPointerDown={(e) => { e.preventDefault(); apiRef.current?.setUp(true); }}
            onPointerUp={() => apiRef.current?.setUp(false)}
            onPointerLeave={() => apiRef.current?.setUp(false)}
            onPointerCancel={() => apiRef.current?.setUp(false)}
          >▲</button>
          <button
            onPointerDown={(e) => { e.preventDefault(); apiRef.current?.setDown(true); }}
            onPointerUp={() => apiRef.current?.setDown(false)}
            onPointerLeave={() => apiRef.current?.setDown(false)}
            onPointerCancel={() => apiRef.current?.setDown(false)}
          >▼</button>
        </div>
        <div className="aoi-lt">
          <button title="エレベータ / 操作" onPointerDown={(e) => { e.preventDefault(); apiRef.current?.interact(); }}>⬍</button>
          <button title="手を伸ばす"
            onPointerDown={(e) => { e.preventDefault(); apiRef.current?.setReach(true); }}
            onPointerUp={() => apiRef.current?.setReach(false)}
            onPointerLeave={() => apiRef.current?.setReach(false)}
            onPointerCancel={() => apiRef.current?.setReach(false)}
          >✋</button>
          <button title="呼吸" onPointerDown={(e) => { e.preventDefault(); apiRef.current?.exhale(); }}>◯</button>
        </div>
        <div
          className="aoi-swim"
          onPointerDown={(e) => { e.preventDefault(); apiRef.current?.setThrust(true); }}
          onPointerUp={() => apiRef.current?.setThrust(false)}
          onPointerLeave={() => apiRef.current?.setThrust(false)}
          onPointerCancel={() => apiRef.current?.setThrust(false)}
        >泳ぐ</div>
      </div>

      {/* ───────── ヘルプ ───────── */}
      <div className={"aoi-help" + (helpOpen ? " show" : "")} onClick={() => setHelpOpen(false)}>
        <div className="panel" onClick={(e) => e.stopPropagation()}>
          <h2>操作方法</h2>
          <table>
            <tbody>
              <tr><td>ドラッグ</td><td>見回す</td></tr>
              <tr><td>W A S D / ↑↓←→</td><td>移動(陸では歩行、水中では遊泳)</td></tr>
              <tr><td>E / ⬍</td><td>エレベータに乗って昇降 ・ 水中では浮上(Shift・C 潜行)</td></tr>
              <tr><td>Space</td><td>陸ではジャンプ ・ 水中では呼吸の泡(◯ でも可)</td></tr>
              <tr><td>H / ✋ 長押し</td><td>手を伸ばす — 泡は撫でると弾け、<br />ナンヨウハギやカメ、クマノミはなつき、<br />イカやタコ、銀の群れは逃げます</td></tr>
              <tr><td>R / ↻</td><td>リスポーン(自宅・橋・海から選択)</td></tr>
              <tr><td>N / ☾</td><td>昼夜切替(夜は街・橋がライトアップ)</td></tr>
              <tr><td>P</td><td>写真を保存</td></tr>
              <tr><td>U</td><td>UI表示切替</td></tr>
              <tr><td>Q / ?</td><td>この説明を開閉</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.8, color: "rgba(234,246,248,.7)" }}>
            自宅は湾岸タワー20階の2LDK。ベランダから夜景を眺めたら、<br />エレベータで地上へ降り、砂浜から海へ潜っていけます。
          </p>
          <p className="close" onClick={() => setHelpOpen(false)}>タップで閉じる</p>
        </div>
      </div>

      {/* ───────── リスポーン ───────── */}
      <div className={"aoi-help aoi-respawn" + (respawnOpen ? " show" : "")} onClick={() => setRespawnOpen(false)}>
        <div className="panel" onClick={(e) => e.stopPropagation()}>
          <h2>リスポーン地点</h2>
          <div className="rs-grid">
            {[
              { id: "home", t: "自宅", s: "湾岸タワー20階の2LDK" },
              { id: "bridge", t: "レインボーブリッジ", s: "橋の上から夜景を" },
              { id: "sea", t: "海の中", s: "湾の真ん中へダイブ" },
            ].map((o) => (
              <button key={o.id} className="rs-card" onClick={() => { apiRef.current?.respawn(o.id); setRespawnOpen(false); }}>
                <div className="rs-t">{o.t}</div>
                <div className="rs-s">{o.s}</div>
              </button>
            ))}
          </div>
          <p className="close">タップで閉じる（R キーでも開閉）</p>
        </div>
      </div>

      {/* ───────── 導入画面 ───────── */}
      {!started && (
        <div className="aoi-intro" onClick={() => apiRef.current?.start()}>
          <div className="kanji">碧</div>
          <div className="sub">A O I — 湾岸の家から、ひかりの海へ</div>
          <div className="start">タップして始める</div>
          <div className="note">ヘッドホン推奨 ・ 音が出ます<br />自宅20階のベランダ→エレベータ→砂浜→海へ</div>
        </div>
      )}
    </div>
  );
}

const css = `
.aoi-root{position:fixed;inset:0;overflow:hidden;background:#04141f;
  font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",Georgia,serif;
  color:#eaf6f8;-webkit-tap-highlight-color:transparent;z-index:0}
.aoi-root *{margin:0;padding:0;box-sizing:border-box}
.aoi-canvas{position:absolute;inset:0}
.aoi-canvas canvas{display:block;width:100%;height:100%}

.aoi-intro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:radial-gradient(120% 90% at 50% 18%, #0d4a63 0%, #073049 42%, #041824 100%);
  z-index:30;cursor:pointer}
.aoi-intro .kanji{font-size:clamp(88px,22vw,170px);font-weight:300;letter-spacing:.06em;
  color:#dff4f6;text-shadow:0 0 60px rgba(90,200,220,.35);line-height:1}
.aoi-intro .sub{margin-top:18px;font-size:13px;letter-spacing:.55em;text-indent:.55em;color:rgba(234,246,248,.55);
  font-family:"Hiragino Sans","Yu Gothic",system-ui,sans-serif;font-weight:300}
.aoi-intro .start{margin-top:64px;font-size:13px;letter-spacing:.35em;text-indent:.35em;color:#eaf6f8;
  border:1px solid rgba(234,246,248,.35);padding:14px 38px;border-radius:999px;
  font-family:"Hiragino Sans","Yu Gothic",system-ui,sans-serif;
  animation:aoiBreathe 3.2s ease-in-out infinite}
@keyframes aoiBreathe{0%,100%{opacity:.55}50%{opacity:1}}
.aoi-intro .note{position:absolute;bottom:34px;font-size:11px;letter-spacing:.2em;color:rgba(234,246,248,.35);
  font-family:"Hiragino Sans",system-ui,sans-serif;text-align:center;line-height:2}

.aoi-hud{position:absolute;inset:0;pointer-events:none;z-index:20;opacity:0;transition:opacity 1.5s}
.aoi-hud.on{opacity:1}
.aoi-depth{position:absolute;left:22px;bottom:20px;font-size:13px;letter-spacing:.18em;color:rgba(234,246,248,.55);
  font-family:"Hiragino Sans",system-ui,sans-serif;font-variant-numeric:tabular-nums}
.aoi-depth b{font-size:22px;font-weight:300;color:#eaf6f8}
.aoi-dn{position:absolute;top:18px;right:18px;width:46px;height:46px;border-radius:50%;
  border:1px solid rgba(234,246,248,.35);background:rgba(8,28,40,.3);backdrop-filter:blur(6px);
  color:#eaf6f8;font-size:19px;display:flex;align-items:center;justify-content:center;
  pointer-events:auto;user-select:none;cursor:pointer}
.aoi-dn:active{background:rgba(120,220,235,.22)}
.aoi-qb{position:absolute;top:18px;right:74px;width:46px;height:46px;border-radius:50%;
  border:1px solid rgba(234,246,248,.35);background:rgba(8,28,40,.3);backdrop-filter:blur(6px);
  color:#eaf6f8;font-size:18px;display:flex;align-items:center;justify-content:center;
  pointer-events:auto;user-select:none;cursor:pointer;font-family:"Hiragino Sans",system-ui,sans-serif}
.aoi-qb:active{background:rgba(120,220,235,.22)}
.aoi-rs{position:absolute;top:18px;right:130px;width:46px;height:46px;border-radius:50%;
  border:1px solid rgba(234,246,248,.35);background:rgba(8,28,40,.3);backdrop-filter:blur(6px);
  color:#eaf6f8;font-size:20px;display:flex;align-items:center;justify-content:center;
  pointer-events:auto;user-select:none;cursor:pointer}
.aoi-rs:active{background:rgba(120,220,235,.22)}
.aoi-respawn .rs-grid{display:flex;flex-direction:column;gap:10px;margin-bottom:6px}
.aoi-respawn .rs-card{display:block;width:100%;text-align:left;cursor:pointer;
  background:rgba(12,40,58,.6);border:1px solid rgba(140,220,235,.25);border-radius:12px;padding:14px 16px;
  color:#eaf6f8;font-family:"Hiragino Sans",system-ui,sans-serif;transition:background .2s}
.aoi-respawn .rs-card:hover,.aoi-respawn .rs-card:active{background:rgba(40,120,150,.5)}
.aoi-respawn .rs-t{font-size:15px;letter-spacing:.1em}
.aoi-respawn .rs-s{font-size:11.5px;color:rgba(234,246,248,.6);margin-top:3px}
.aoi-lt{position:absolute;left:22px;bottom:70px;display:flex;flex-direction:column;gap:10px;pointer-events:auto}
.aoi-lt button{width:54px;height:54px;border-radius:50%;border:1px solid rgba(234,246,248,.3);
  background:rgba(10,40,55,.25);color:#eaf6f8;font-size:20px;backdrop-filter:blur(6px);cursor:pointer;touch-action:none}
.aoi-lt button:active{background:rgba(120,220,235,.25)}
.aoi-hint{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);
  font-size:11.5px;letter-spacing:.22em;color:rgba(234,246,248,.5);white-space:nowrap;
  font-family:"Hiragino Sans",system-ui,sans-serif;transition:opacity 2s}
.aoi-swim{position:absolute;right:26px;bottom:26px;width:84px;height:84px;border-radius:50%;
  border:1px solid rgba(234,246,248,.4);background:rgba(10,40,55,.25);backdrop-filter:blur(6px);
  color:#eaf6f8;font-size:12px;letter-spacing:.2em;text-indent:.2em;
  font-family:"Hiragino Sans",system-ui,sans-serif;
  display:none;align-items:center;justify-content:center;pointer-events:auto;user-select:none;touch-action:none}
.aoi-swim:active{background:rgba(120,220,235,.22)}
.aoi-root.touch .aoi-swim{display:flex}
.aoi-vt{position:absolute;right:26px;bottom:126px;width:84px;display:none;flex-direction:column;gap:10px;pointer-events:auto}
.aoi-root.touch .aoi-vt{display:flex}
.aoi-vt button{height:44px;border-radius:12px;border:1px solid rgba(234,246,248,.3);
  background:rgba(10,40,55,.25);color:#eaf6f8;font-size:16px;backdrop-filter:blur(6px);cursor:pointer;touch-action:none}
.aoi-vt button:active{background:rgba(120,220,235,.22)}

.aoi-help{position:absolute;inset:0;z-index:40;background:rgba(2,12,20,.66);backdrop-filter:blur(8px);
  display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .35s}
.aoi-help.show{opacity:1;pointer-events:auto}
.aoi-help .panel{max-width:420px;width:86%;background:rgba(6,26,40,.78);
  border:1px solid rgba(140,220,235,.25);border-radius:18px;padding:26px 26px 18px;
  font-family:"Hiragino Sans",system-ui,sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.5)}
.aoi-help h2{font-size:15px;letter-spacing:.4em;text-indent:.4em;font-weight:300;text-align:center;margin-bottom:18px;color:#eaf6f8}
.aoi-help table{width:100%;border-collapse:collapse;font-size:12.5px;line-height:1.7}
.aoi-help td{padding:7px 4px;border-bottom:1px solid rgba(140,220,235,.12);color:rgba(234,246,248,.85);vertical-align:top}
.aoi-help td:first-child{white-space:nowrap;color:#9fdce8;padding-right:16px;letter-spacing:.05em}
.aoi-help .close{text-align:center;margin-top:14px;font-size:11px;letter-spacing:.25em;color:rgba(234,246,248,.4);cursor:pointer}
`;
