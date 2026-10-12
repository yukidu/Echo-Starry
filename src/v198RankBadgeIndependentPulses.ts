const TARGET_CONTOUR_LIGHTS = 12;
const SYNC_INTERVAL_MS = 650;
const DOT_SIZE_MULTIPLIER = 1.5;

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V198_RANK_BADGE_INDEPENDENT_PULSES__?: boolean;
};

type PulseSpec = {
  size: number;
  duration: number;
  delay: number;
  min: number;
  max: number;
  scale: number;
  darkHoldEnd: number;
  peakStart: number;
  brightHoldEnd: number;
  fadeEnd: number;
  easing: string;
};

function randomUnit() {
  try {
    if (globalThis.crypto?.getRandomValues) {
      const buffer = new Uint32Array(1);
      globalThis.crypto.getRandomValues(buffer);
      return buffer[0] / 0x100000000;
    }
  } catch {
    // fallback below
  }
  return Math.random();
}

function randomBetween(min: number, max: number) {
  return min + (max - min) * randomUnit();
}

function createUniqueDuration(usedDurations: Set<number>) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = randomBetween(3.8, 12.8);
    const collides = [...usedDurations].some(existing => Math.abs(existing - candidate) < 0.18);
    if (!collides) {
      usedDurations.add(candidate);
      return candidate;
    }
  }

  const fallback = 4.1 + usedDurations.size * 0.67 + randomBetween(-0.08, 0.08);
  usedDurations.add(fallback);
  return fallback;
}

function createStrongRandomPulse(usedDurations: Set<number>): PulseSpec {
  const duration = createUniqueDuration(usedDurations);
  const darkHoldEnd = randomBetween(0.04, 0.27);
  const peakStart = Math.min(0.56, darkHoldEnd + randomBetween(0.08, 0.24));
  const brightHoldEnd = Math.min(0.80, peakStart + randomBetween(0.04, 0.20));
  const fadeEnd = Math.min(0.96, brightHoldEnd + randomBetween(0.10, 0.30));
  const easings = [
    'linear',
    'cubic-bezier(.22,.68,.36,1)',
    'cubic-bezier(.37,0,.63,1)',
    'cubic-bezier(.16,1,.3,1)',
    'cubic-bezier(.65,0,.35,1)'
  ];

  return {
    size: randomBetween(1.9, 3.15) * DOT_SIZE_MULTIPLIER,
    duration,
    delay: -randomBetween(0.12, Math.max(0.4, duration * 0.94)),
    min: randomBetween(0.02, 0.17),
    max: randomBetween(0.68, 1),
    scale: randomBetween(1.12, 1.58),
    darkHoldEnd,
    peakStart,
    brightHoldEnd,
    fadeEnd,
    easing: easings[Math.floor(randomUnit() * easings.length)] || 'linear'
  };
}

function chooseEvenlySpacedIndices(sourceCount: number, targetCount: number) {
  if (sourceCount <= targetCount) return new Set(Array.from({ length: sourceCount }, (_, index) => index));
  const keep = new Set<number>();
  for (let index = 0; index < targetCount; index += 1) {
    keep.add(Math.round((index * (sourceCount - 1)) / Math.max(1, targetCount - 1)));
  }
  return keep;
}

function applyStrongRandomPulse(light: HTMLElement, usedDurations: Set<number>) {
  const storedDuration = light.dataset.v200PulseDuration;
  if (light.dataset.v200StrongRandomPulse === '1' && storedDuration) {
    const existingDuration = Number(storedDuration);
    if (Number.isFinite(existingDuration)) usedDurations.add(existingDuration);
    return;
  }

  const pulse = createStrongRandomPulse(usedDurations);
  light.style.setProperty('--contour-size', `${pulse.size.toFixed(3)}px`);
  light.style.setProperty('--contour-duration', `${pulse.duration.toFixed(3)}s`);
  light.style.setProperty('--contour-delay', `${pulse.delay.toFixed(3)}s`);
  light.style.setProperty('--contour-min', pulse.min.toFixed(3));
  light.style.setProperty('--contour-max', pulse.max.toFixed(3));
  light.style.setProperty('--contour-scale', pulse.scale.toFixed(3));

  light.getAnimations().forEach(animation => animation.cancel());
  light.style.animation = 'none';

  if (typeof light.animate === 'function') {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const durationMs = pulse.duration * 1000 * (reduceMotion ? 1.6 : 1);
    const minOpacity = pulse.min;
    const maxOpacity = pulse.max;

    light.animate([
      {
        offset: 0,
        opacity: String(minOpacity),
        filter: 'brightness(.88)',
        transform: 'translate(-50%, -50%) scale(.70)'
      },
      {
        offset: pulse.darkHoldEnd,
        opacity: String(minOpacity),
        filter: 'brightness(.92)',
        transform: 'translate(-50%, -50%) scale(.74)'
      },
      {
        offset: pulse.peakStart,
        opacity: String(maxOpacity),
        filter: 'brightness(1.38)',
        transform: `translate(-50%, -50%) scale(${pulse.scale.toFixed(3)})`
      },
      {
        offset: pulse.brightHoldEnd,
        opacity: String(Math.max(minOpacity, maxOpacity * randomBetween(0.72, 0.92))),
        filter: 'brightness(1.18)',
        transform: `translate(-50%, -50%) scale(${Math.max(1, pulse.scale * randomBetween(0.86, 0.96)).toFixed(3)})`
      },
      {
        offset: pulse.fadeEnd,
        opacity: String(Math.min(maxOpacity, minOpacity + randomBetween(0.02, 0.06))),
        filter: 'brightness(.95)',
        transform: 'translate(-50%, -50%) scale(.77)'
      },
      {
        offset: 1,
        opacity: String(minOpacity),
        filter: 'brightness(.88)',
        transform: 'translate(-50%, -50%) scale(.70)'
      }
    ], {
      duration: durationMs,
      delay: pulse.delay * 1000,
      iterations: Infinity,
      easing: pulse.easing,
      fill: 'both'
    });
  }

  light.dataset.v198IndependentPulse = '1';
  light.dataset.v199TrueIndependentPulse = '1';
  light.dataset.v200StrongRandomPulse = '1';
  light.dataset.v200PulseDuration = pulse.duration.toFixed(6);
  light.dataset.v200PulseTiming = [
    pulse.duration.toFixed(3),
    pulse.darkHoldEnd.toFixed(3),
    pulse.peakStart.toFixed(3),
    pulse.brightHoldEnd.toFixed(3),
    pulse.fadeEnd.toFixed(3),
    pulse.delay.toFixed(3)
  ].join(':');
}

function reduceContourLights(layer: HTMLElement) {
  const lights = Array.from(layer.querySelectorAll<HTMLElement>('.v195-rank-badge-contour-light'));
  if (lights.length > TARGET_CONTOUR_LIGHTS) {
    const keep = chooseEvenlySpacedIndices(lights.length, TARGET_CONTOUR_LIGHTS);
    lights.forEach((light, index) => {
      if (!keep.has(index)) light.remove();
    });
  }

  const survivors = Array.from(layer.querySelectorAll<HTMLElement>('.v195-rank-badge-contour-light'));
  const usedDurations = new Set<number>();
  survivors.forEach(light => {
    const storedDuration = light.dataset.v200PulseDuration;
    if (!storedDuration) return;
    const existingDuration = Number(storedDuration);
    if (Number.isFinite(existingDuration)) usedDurations.add(existingDuration);
  });
  survivors.forEach(light => applyStrongRandomPulse(light, usedDurations));

  layer.dataset.v198ContourLightCount = String(survivors.length);
  layer.dataset.v199PulseMode = 'per-dot-waapi-timeline';
  layer.dataset.v200PulseMode = 'crypto-random-per-dot-waapi';
}

function reduceSvgFallback(svg: SVGElement) {
  if (svg.getAttribute('data-v200-fallback-tuned') === '1') return;

  const dots = Array.from(svg.querySelectorAll<SVGCircleElement>('.v195-rank-badge-contour-svg-dot'));
  dots.slice(1).forEach(dot => dot.remove());
  dots.slice(0, 1).forEach(dot => {
    const radius = Number(dot.getAttribute('r') || '1');
    dot.setAttribute('r', String(radius * DOT_SIZE_MULTIPLIER));
  });

  const pattern = svg.querySelector<SVGPatternElement>('pattern');
  if (pattern) {
    // v199 fallback 約為 11x11 的單點 pattern；邊長乘 sqrt(2) 可把面積密度再減半。
    pattern.setAttribute('width', '15.56');
    pattern.setAttribute('height', '15.56');
  }

  svg.setAttribute('data-v198-contour-light-density', 'half');
  svg.setAttribute('data-v200-contour-light-density', 'quarter-of-v197');
  svg.setAttribute('data-v200-fallback-tuned', '1');
}

function syncIndependentPulses() {
  document.querySelectorAll<HTMLElement>('.v195-rank-badge-contour-layer').forEach(reduceContourLights);
  document.querySelectorAll<SVGElement>('.v195-rank-badge-contour-svg').forEach(reduceSvgFallback);
}

if (!runtime.__ECHOSTARS_V198_RANK_BADGE_INDEPENDENT_PULSES__) {
  runtime.__ECHOSTARS_V198_RANK_BADGE_INDEPENDENT_PULSES__ = true;
  document.documentElement.setAttribute('data-echostars-v198-rank-badge-independent-pulses', 'true');
  document.documentElement.setAttribute('data-echostars-v199-rank-badge-true-independent-pulses', 'true');
  document.documentElement.setAttribute('data-echostars-v200-rank-badge-strong-random-pulses', 'true');
  syncIndependentPulses();
  window.setInterval(syncIndependentPulses, SYNC_INTERVAL_MS);
  window.addEventListener('focus', syncIndependentPulses);
  window.addEventListener('resize', syncIndependentPulses);
}
