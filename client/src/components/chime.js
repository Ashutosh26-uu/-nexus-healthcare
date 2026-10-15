// A soft multi-note chime. Browsers cap live AudioContexts (~6), so share one instead of creating one per chime.
let ctx = null;

export function chime(freqs, gap = 0.18, len = 0.3) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const at = t0 + i * gap;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.08, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + len);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + len + 0.02);
    });
  } catch { /* audio may be blocked */ }
}
