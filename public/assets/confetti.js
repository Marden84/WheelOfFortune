'use strict';

const confetti = (() => {
  const COLORS = ['#E2001A', '#FFCC00', '#F47920', '#0057A8', '#3AAA35', '#FFFFFF'];
  const PARTICLE_COUNT = 160;
  const DURATION_MS = 3500;

  function randomBetween(a, b) { return a + Math.random() * (b - a); }
  function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

  function launch(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: randomBetween(W * 0.2, W * 0.8),
      y: randomBetween(-20, H * 0.3),
      vx: randomBetween(-3, 3),
      vy: randomBetween(-8, -2),
      angle: randomBetween(0, Math.PI * 2),
      spin: randomBetween(-0.15, 0.15),
      color: randomColor(),
      w: randomBetween(8, 14),
      h: randomBetween(4, 8),
      opacity: 1,
    }));

    const startTime = performance.now();

    function frame(now) {
      ctx.clearRect(0, 0, W, H);
      const elapsed = now - startTime;
      const progress = elapsed / DURATION_MS;

      if (progress >= 1) {
        ctx.clearRect(0, 0, W, H);
        return;
      }

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18; // gravity
        p.vx *= 0.99; // drag
        p.angle += p.spin;
        p.opacity = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  return { launch };
})();
