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
};

function fractional(value: number) {
  return value - Math.floor(value);
}

function deterministicUnit(index: number, salt: number) {
  return fractional(Math.sin((index + 1) * (12.9898 + salt * 19.19)) * 43758.5453);
}

function pulseFor(index: number): PulseSpec {
  // duration 採單調遞增基底再疊極小偏移，確保 23 顆每一顆的亮滅週期都不同。
  const duration = 4.7 + index * 0.29 + deterministicUnit(index, 1) * 0.08;
  return {
    size: 1.9 + deterministicUnit(index, 2) * 1.25,
    duration,
    delay: -(0.35 + index * 0.41 + deterministicUnit(index, 3) * 0.28),
    min: 0.04 + deterministicUnit(index, 4) * 0.14,
    max: 0.62 + deterministicUnit(index, 5) * 0.34,
    scale: 1.08 + deterministicUnit(index, 6) * 0.38
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

function reduceContourLights(layer: HTMLElement) {
  const lights = Array.from(layer.querySelectorAll<HTMLElement>('.v195-rank-badge-contour-light'));
  if (lights.length > TARGET_CONTOUR_LIGHTS) {
    const keep = chooseEvenlySpacedIndices(lights.length, TARGET_CONTOUR_LIGHTS);
    lights.forEach((light, index) => {
      if (!keep.has(index)) light.remove();
    });
  }

  const survivors = Array.from(layer.querySelectorAll<HTMLElement>('.v195-rank-badge-contour-light'));
  survivors.forEach((light, index) => {
    const pulse = pulseFor(index);
    light.style.setProperty('--contour-size', `${pulse.size.toFixed(3)}px`);
    light.style.setProperty('--contour-duration', `${pulse.duration.toFixed(3)}s`);
    light.style.setProperty('--contour-delay', `${pulse.delay.toFixed(3)}s`);
    light.style.setProperty('--contour-min', pulse.min.toFixed(3));
    light.style.setProperty('--contour-max', pulse.max.toFixed(3));
    light.style.setProperty('--contour-scale', pulse.scale.toFixed(3));
    light.dataset.v198IndependentPulse = '1';
  });

  layer.dataset.v198ContourLightCount = String(survivors.length);
}

function reduceSvgFallback(svg: SVGElement) {
  // SVG fallback 的圖樣原本每格有兩顆，移除其中一顆即可把備援密度減半。
  // 正式站同源圖片會走 Canvas 主路徑；此處只處理跨來源備援的密度。
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
  syncIndependentPulses();
  window.setInterval(syncIndependentPulses, SYNC_INTERVAL_MS);
  window.addEventListener('focus', syncIndependentPulses);
  window.addEventListener('resize', syncIndependentPulses);
}
