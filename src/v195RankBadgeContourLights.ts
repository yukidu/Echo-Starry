import './v195RankBadgeContourLights.css';

const SAMPLE_SIZE = 180;
const ALPHA_THRESHOLD = 40;
const CONTOUR_POINT_COUNT = 84;
const CONTOUR_OUTSET_PX = 2.4;

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V195_RANK_BADGE_CONTOUR_LIGHTS__?: boolean;
};

type Point = { x: number; y: number };

type PulseSpec = {
  size: number;
  duration: number;
  delay: number;
  min: number;
  max: number;
  scale: number;
};

// 直接沿用皇冠大使 v179 光點的明暗、縮放與不同步閃耀節奏。
const CROWN_PULSES: PulseSpec[] = [
  { size: 3.5, duration: 5.7, delay: -1.1, min: 0.14, max: 0.98, scale: 1.38 },
  { size: 2.9, duration: 8.6, delay: -5.3, min: 0.08, max: 0.72, scale: 1.30 },
  { size: 3.8, duration: 6.9, delay: -2.8, min: 0.18, max: 0.90, scale: 1.36 },
  { size: 3.1, duration: 9.7, delay: -7.4, min: 0.10, max: 0.68, scale: 1.28 },
  { size: 4.0, duration: 7.8, delay: -4.6, min: 0.16, max: 1.00, scale: 1.40 },
  { size: 2.8, duration: 6.3, delay: -0.7, min: 0.09, max: 0.76, scale: 1.30 },
  { size: 3.4, duration: 10.4, delay: -6.1, min: 0.12, max: 0.84, scale: 1.34 }
];

function waitForImage(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onLoad = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('badge image load failed')); };
    const cleanup = () => {
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
    };
    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
  });
}

function sampleAlphaContour(image: HTMLImageElement): Point[] | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  try {
    context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

    let sumX = 0;
    let sumY = 0;
    let opaqueCount = 0;
    for (let y = 0; y < SAMPLE_SIZE; y += 1) {
      for (let x = 0; x < SAMPLE_SIZE; x += 1) {
        if (pixels[(y * SAMPLE_SIZE + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
        sumX += x;
        sumY += y;
        opaqueCount += 1;
      }
    }
    if (opaqueCount < 20) return null;

    const centerX = sumX / opaqueCount;
    const centerY = sumY / opaqueCount;
    const maxRadius = Math.hypot(SAMPLE_SIZE, SAMPLE_SIZE);
    const raw: Point[] = [];

    for (let index = 0; index < CONTOUR_POINT_COUNT; index += 1) {
      const angle = (Math.PI * 2 * index) / CONTOUR_POINT_COUNT;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let lastOpaque: Point | null = null;

      for (let radius = 0; radius <= maxRadius; radius += 0.7) {
        const x = Math.round(centerX + cos * radius);
        const y = Math.round(centerY + sin * radius);
        if (x < 0 || y < 0 || x >= SAMPLE_SIZE || y >= SAMPLE_SIZE) break;
        if (pixels[(y * SAMPLE_SIZE + x) * 4 + 3] > ALPHA_THRESHOLD) {
          lastOpaque = { x, y };
        }
      }

      if (!lastOpaque) continue;
      raw.push({
        x: ((lastOpaque.x + cos * CONTOUR_OUTSET_PX) / SAMPLE_SIZE) * 100,
        y: ((lastOpaque.y + sin * CONTOUR_OUTSET_PX) / SAMPLE_SIZE) * 100
      });
    }

    // 去掉極少數因為像素取樣而重疊的點，避免局部亮成一團。
    const deduped: Point[] = [];
    for (const point of raw) {
      const tooClose = deduped.some(existing => Math.hypot(existing.x - point.x, existing.y - point.y) < 1.15);
      if (!tooClose) deduped.push(point);
    }
    return deduped.length >= 20 ? deduped : null;
  } catch {
    // Preview 可能因跨來源圖片而禁止 Canvas 讀取像素；會改用 SVG alpha 外框備援。
    return null;
  }
}

function createContourLayer(points: Point[]) {
  const layer = document.createElement('span');
  layer.className = 'v195-rank-badge-contour-layer';
  layer.dataset.v195RankContour = '1';
  layer.setAttribute('aria-hidden', 'true');

  points.forEach((point, index) => {
    const pulse = CROWN_PULSES[index % CROWN_PULSES.length];
    const light = document.createElement('span');
    light.className = 'v195-rank-badge-contour-light';
    light.style.setProperty('--contour-x', `${point.x}%`);
    light.style.setProperty('--contour-y', `${point.y}%`);
    light.style.setProperty('--contour-size', `${pulse.size}px`);
    light.style.setProperty('--contour-duration', `${pulse.duration + (index % 5) * 0.11}s`);
    light.style.setProperty('--contour-delay', `${pulse.delay - (index % 11) * 0.17}s`);
    light.style.setProperty('--contour-min', String(pulse.min));
    light.style.setProperty('--contour-max', String(pulse.max));
    light.style.setProperty('--contour-scale', String(pulse.scale));
    layer.appendChild(light);
  });

  return layer;
}

let fallbackId = 0;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function createSvgContourFallback(image: HTMLImageElement) {
  fallbackId += 1;
  const suffix = `v195-${fallbackId}`;
  const filterId = `${suffix}-outline`;
  const maskId = `${suffix}-mask`;
  const patternId = `${suffix}-dots`;

  const svg = svgElement('svg');
  svg.classList.add('v195-rank-badge-contour-svg');
  svg.dataset.v195RankContour = '1';
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const defs = svgElement('defs');
  const filter = svgElement('filter');
  filter.id = filterId;
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('x', '-8');
  filter.setAttribute('y', '-8');
  filter.setAttribute('width', '116');
  filter.setAttribute('height', '116');

  const dilate = svgElement('feMorphology');
  dilate.setAttribute('in', 'SourceAlpha');
  dilate.setAttribute('operator', 'dilate');
  dilate.setAttribute('radius', '2.8');
  dilate.setAttribute('result', 'dilated');
  filter.appendChild(dilate);

  const outline = svgElement('feComposite');
  outline.setAttribute('in', 'dilated');
  outline.setAttribute('in2', 'SourceAlpha');
  outline.setAttribute('operator', 'out');
  filter.appendChild(outline);
  defs.appendChild(filter);

  const mask = svgElement('mask');
  mask.id = maskId;
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('x', '-8');
  mask.setAttribute('y', '-8');
  mask.setAttribute('width', '116');
  mask.setAttribute('height', '116');
  mask.style.maskType = 'alpha';

  const maskImage = svgElement('image');
  maskImage.setAttribute('href', image.currentSrc || image.src);
  maskImage.setAttribute('x', '0');
  maskImage.setAttribute('y', '0');
  maskImage.setAttribute('width', '100');
  maskImage.setAttribute('height', '100');
  maskImage.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  maskImage.setAttribute('filter', `url(#${filterId})`);
  mask.appendChild(maskImage);
  defs.appendChild(mask);

  const pattern = svgElement('pattern');
  pattern.id = patternId;
  pattern.setAttribute('width', '7');
  pattern.setAttribute('height', '7');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');

  [
    { cx: 1.4, cy: 1.7, r: 1.15, variant: 0 },
    { cx: 5.0, cy: 2.8, r: 0.82, variant: 2 },
    { cx: 3.4, cy: 5.8, r: 0.95, variant: 4 }
  ].forEach(spec => {
    const circle = svgElement('circle');
    circle.setAttribute('cx', String(spec.cx));
    circle.setAttribute('cy', String(spec.cy));
    circle.setAttribute('r', String(spec.r));
    circle.classList.add('v195-rank-badge-contour-svg-dot', `v195-rank-badge-contour-svg-dot--${spec.variant}`);
    pattern.appendChild(circle);
  });
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const rect = svgElement('rect');
  rect.setAttribute('x', '-5');
  rect.setAttribute('y', '-5');
  rect.setAttribute('width', '110');
  rect.setAttribute('height', '110');
  rect.setAttribute('fill', `url(#${patternId})`);
  rect.setAttribute('mask', `url(#${maskId})`);
  svg.appendChild(rect);

  return svg;
}

async function decorateBadge(image: HTMLImageElement) {
  const source = image.currentSrc || image.src;
  if (!source || image.dataset.v195ContourPending === source) return;

  const motion = image.closest<HTMLElement>('.v190-rank-badge-motion');
  if (!motion) return;
  if (image.dataset.v195ContourSource === source && motion.querySelector('[data-v195-rank-contour="1"]')) return;

  image.dataset.v195ContourPending = source;
  try {
    await waitForImage(image);
    if ((image.currentSrc || image.src) !== source) return;

    motion.querySelectorAll<HTMLElement>('[data-v195-rank-contour="1"]').forEach(node => node.remove());
    motion.classList.add('v195-rank-badge-contour-host');

    const points = sampleAlphaContour(image);
    motion.appendChild(points ? createContourLayer(points) : createSvgContourFallback(image));
    image.dataset.v195ContourSource = source;
  } catch {
    // 保留獎章本體；圖片暫時失敗時不阻擋詳細頁其他功能。
  } finally {
    delete image.dataset.v195ContourPending;
  }
}

function syncV195ContourLights() {
  document.querySelectorAll<HTMLImageElement>('img.v190-rank-badge-image').forEach(image => {
    void decorateBadge(image);
  });
}

if (!runtime.__ECHOSTARS_V195_RANK_BADGE_CONTOUR_LIGHTS__) {
  runtime.__ECHOSTARS_V195_RANK_BADGE_CONTOUR_LIGHTS__ = true;
  document.documentElement.setAttribute('data-echostars-v195-rank-badge-contour-lights', 'true');
  syncV195ContourLights();
  window.setInterval(syncV195ContourLights, 700);
  window.addEventListener('focus', syncV195ContourLights);
}
