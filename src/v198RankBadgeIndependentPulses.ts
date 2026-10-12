const TARGET_CONTOUR_LIGHTS = 23;
const SYNC_INTERVAL_MS = 650;

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
};

function fractional(value: number) {
  return value - Math.floor(value);
}

function deterministicUnit(index: number, salt: number) {
  return fractional(Math.sin((index + 1) * (12.9898 + salt * 19.19)) * 43758.5453);
}

function pulseFor(index: number): PulseSpec {
  // 每顆光點除了總週期不同，連「暗多久、變亮多久、亮多久、變暗多久」都各自不同。
  const duration = 4.7 + index * 0.29 + deterministicUnit(index, 1) * 0.08;
  const darkHoldEnd = 0.08 + deterministicUnit(index, 7) * 0.18;
  const peakStart = Math.min(0.50, darkHoldEnd + 0.10 + deterministicUnit(index, 8) * 0.14);
  const brightHoldEnd = Math.min(0.78, peakStart + 0.07 + deterministicUnit(index, 9) * 0.16);
  const fadeEnd = Math.min(0.96, brightHoldEnd + 0.10 + deterministicUnit(index, 10) * 0.16);

  return {
    size: 1.9 + deterministicUnit(index, 2) * 1.25,
    duration,
    delay: -(0.35 + index * 0.41 + deterministicUnit(index, 3) * 0.28),
    min: 0.04 + deterministicUnit(index, 4) * 0.14,
    max: 0.62 + deterministicUnit(index, 5) * 0.34,
    scale: 1.08 + deterministicUnit(index, 6) * 0.38,
    darkHoldEnd,
    peakStart,
    brightHoldEnd,
    fadeEnd
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

function applyTrueIndependentPulse(light: HTMLElement, index: number) {
  const pulse = pulseFor(index);
  light.style.setProperty('--contour-size', `${pulse.size.toFixed(3)}px`);
  light.style.setProperty('--contour-duration', `${pulse.duration.toFixed(3)}s`);
  light.style.setProperty('--contour-delay', `${pulse.delay.toFixed(3)}s`);
  light.style.setProperty('--contour-min', pulse.min.toFixed(3));
  light.style.setProperty('--contour-max', pulse.max.toFixed(3));
  light.style.setProperty('--contour-scale', pulse.scale.toFixed(3));

  if (light.dataset.v199TrueIndependentPulse === '1') return;

  // v198 只改 CSS 變數，視覺上仍可能因共用同一組 keyframes 而看起來同步。
  // v199 直接替每一顆建立自己的 Web Animations 時間軸與不同相位，徹底解除同步。
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
        filter: 'brightness(.90)',
        transform: 'translate(-50%, -50%) scale(.72)'
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
        filter: 'brightness(1.34)',
        transform: `translate(-50%, -50%) scale(${pulse.scale.toFixed(3)})`
      },
      {
        offset: pulse.brightHoldEnd,
        opacity: String(Math.max(minOpacity, maxOpacity * 0.84)),
        filter: 'brightness(1.18)',
        transform: `translate(-50%, -50%) scale(${Math.max(1, pulse.scale * 0.93).toFixed(3)})`
      },
      {
        offset: pulse.fadeEnd,
        opacity: String(Math.min(maxOpacity, minOpacity + 0.035)),
        filter: 'brightness(.96)',
        transform: 'translate(-50%, -50%) scale(.78)'
      },
      {
        offset: 1,
        opacity: String(minOpacity),
        filter: 'brightness(.90)',
        transform: 'translate(-50%, -50%) scale(.72)'
      }
    ], {
      duration: durationMs,
      delay: pulse.delay * 1000,
      iterations: Infinity,
      easing: 'linear',
      fill: 'both'
    });
  }

  light.dataset.v198IndependentPulse = '1';
  light.dataset.v199TrueIndependentPulse = '1';
  light.dataset.v199PulseTiming = [
    pulse.duration.toFixed(3),
    pulse.darkHoldEnd.toFixed(3),
    pulse.peakStart.toFixed(3),
    pulse.brightHoldEnd.toFixed(3),
    pulse.fadeEnd.toFixed(3)
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
  survivors.forEach(applyTrueIndependentPulse);

  layer.dataset.v198ContourLightCount = String(survivors.length);
  layer.dataset.v199PulseMode = 'per-dot-waapi-timeline';
}

function reduceSvgFallback(svg: SVGElement) {
  // SVG fallback 的 pattern 複製無法讓每個實例擁有獨立時間軸；正式站同源圖片會走 Canvas 主路徑。
  // 備援仍維持減半密度，避免退回密集同步閃爍。
  const dots = Array.from(svg.querySelectorAll<SVGElement>('.v195-rank-badge-contour-svg-dot'));
  dots.slice(1).forEach(dot => dot.remove());
  svg.setAttribute('data-v198-contour-light-density', 'half');
}

function syncIndependentPulses() {
  document.querySelectorAll<HTMLElement>('.v195-rank-badge-contour-layer').forEach(reduceContourLights);
  document.querySelectorAll<SVGElement>('.v195-rank-badge-contour-svg').forEach(reduceSvgFallback);
}

if (!runtime.__ECHOSTARS_V198_RANK_BADGE_INDEPENDENT_PULSES__) {
  runtime.__ECHOSTARS_V198_RANK_BADGE_INDEPENDENT_PULSES__ = true;
  document.documentElement.setAttribute('data-echostars-v198-rank-badge-independent-pulses', 'true');
  document.documentElement.setAttribute('data-echostars-v199-rank-badge-true-independent-pulses', 'true');
  syncIndependentPulses();
  window.setInterval(syncIndependentPulses, SYNC_INTERVAL_MS);
  window.addEventListener('focus', syncIndependentPulses);
  window.addEventListener('resize', syncIndependentPulses);
}
