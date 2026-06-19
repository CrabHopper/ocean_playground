// 手続き生成のサウンド（Web Audio）。init() まではすべて無音で安全に呼べる。
export function createAudio() {
  let AC = null, sndUnder = null, sndSurf = null, sndSwim = null, master = null;

  function init() {
    if (AC) return;
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.85; master.connect(AC.destination);
    const noise = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const ch = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < ch.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = last * 3.2; } /* ブラウンノイズ */

    function bed(freq, gain) {
      const src = AC.createBufferSource(); src.buffer = noise; src.loop = true;
      const f = AC.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq; f.Q.value = 0.6;
      const g = AC.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(master); src.start();
      return { f, g };
    }
    sndUnder = bed(340, 0.0);
    sndSurf = bed(2200, 0.0);
    const lfo = AC.createOscillator(); lfo.frequency.value = 0.08;
    const lg = AC.createGain(); lg.gain.value = 110;
    lfo.connect(lg); lg.connect(sndUnder.f.frequency); lfo.start();
    const lfo2 = AC.createOscillator(); lfo2.frequency.value = 0.12;
    const lg2 = AC.createGain(); lg2.gain.value = 0.10;
    lfo2.connect(lg2); lg2.connect(sndSurf.g.gain); lfo2.start();
    const ss = AC.createBufferSource(); ss.buffer = noise; ss.loop = true;
    const sf = AC.createBiquadFilter(); sf.type = "bandpass"; sf.frequency.value = 750; sf.Q.value = 0.8;
    const sg = AC.createGain(); sg.gain.value = 0;
    ss.connect(sf); sf.connect(sg); sg.connect(master); ss.start();
    sndSwim = sg;
    if (AC.state === "suspended") AC.resume();
  }

  function popBubbles(n) {
    if (!AC) return;
    for (let i = 0; i < n; i++) {
      const t = AC.currentTime + Math.random() * 0.25;
      const o = AC.createOscillator(); o.type = "sine";
      const f0 = 520 + Math.random() * 900;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.8, t + 0.07);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035 + Math.random() * 0.03, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.12);
    }
  }

  function dolphinCall() {
    if (!AC) return;
    const base = AC.currentTime + 0.1;
    const dl = AC.createDelay(1.0); dl.delayTime.value = 0.28;
    const fb = AC.createGain(); fb.gain.value = 0.34;
    const wet = AC.createGain(); wet.gain.value = 0.5;
    dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(master);
    const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    lp.connect(master); lp.connect(dl);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = base + i * (0.35 + Math.random() * 0.3);
      const o = AC.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(3400 + Math.random() * 1200, t);
      o.frequency.exponentialRampToValueAtTime(6800 + Math.random() * 1500, t + 0.13);
      o.frequency.exponentialRampToValueAtTime(2300, t + 0.3);
      const vb = AC.createOscillator(); vb.frequency.value = 26;
      const vg = AC.createGain(); vg.gain.value = 180;
      vb.connect(vg); vg.connect(o.frequency); vb.start(t); vb.stop(t + 0.34);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.030, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + 0.36);
    }
  }

  function splash() {
    if (!AC) return;
    const t = AC.currentTime;
    const src = AC.createBufferSource();
    const b = AC.createBuffer(1, AC.sampleRate * 0.4, AC.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    src.buffer = b;
    const f = AC.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 0.5;
    const g = AC.createGain(); g.gain.value = 0.22;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  function updateMix(under, speed, dt) {
    if (!AC) return;
    const mixU = under ? 1 : 0;
    sndUnder.g.gain.value += (mixU * 0.55 - sndUnder.g.gain.value) * Math.min(1, dt * 3);
    sndSurf.g.gain.value += ((1 - mixU) * 0.30 - sndSurf.g.gain.value) * Math.min(1, dt * 3);
    sndSwim.gain.value += (Math.min(speed * 0.05, 0.16) * mixU - sndSwim.gain.value) * Math.min(1, dt * 6);
  }

  return {
    init, popBubbles, dolphinCall, splash, updateMix,
    get ready() { return !!AC; },
  };
}
