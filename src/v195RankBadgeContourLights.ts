import './v195RankBadgeContourLights.css';

const SAMPLE_LONG_SIDE = 260;
const ALPHA_THRESHOLDS = [208, 176, 144, 112, 88] as const;
const CONTOUR_POINT_COUNT = 46;
const MIN_BADGE_HEIGHT_RATIO = 0.40;
const MIN_COMPONENT_RATIO = 0.0007;
const BORDER_BAND_PX = 3;
const RAY_COUNT = 420;

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V195_RANK_BADGE_CONTOUR_LIGHTS__?: boolean;
};

type Point = { x: number; y: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

type PulseSpec = {
  size: number;
  duration: number;
  delay: number;
  min: number;
  max: number;
  scale: number;
};

type Component = {
  members: number[];
  count: number;
  sumX: number;
  sumY: number;
  bounds: Bounds;
  edgeCount: number;
};

type Silhouette = {
  mask: Uint8Array;
  width: number;
  height: number;
  count: number;
  centerX: number;
  centerY: number;
  bounds: Bounds;
  threshold: number;
  score: number;
};

type SampleResult = {
  points: Point[];
  threshold: number;
  widthRatio: number;
  heightRatio: number;
};

type PaintedBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// 沿用皇冠大使 v179 的不同步明暗／縮放節奏，光點稍小，避免形成 LED 燈帶。
const CROWN_PULSES: PulseSpec[] = [
  { size: 2.8, duration: 5.7, delay: -1.1, min: 0.12, max: 0.96, scale: 1.38 },
  { size: 2.3, duration: 8.6, delay: -5.3, min: 0.07, max: 0.70, scale: 1.30 },
  { size: 3.0, duration: 6.9, delay: -2.8, min: 0.16, max: 0.88, scale: 1.36 },
  { size: 2.4, duration: 9.7, delay: -7.4, min: 0.08, max: 0.66, scale: 1.28 },
  { size: 3.2, duration: 7.8, delay: -4.6, min: 0.14, max: 0.98, scale: 1.40 },
  { size: 2.2, duration: 6.3, delay: -0.7, min: 0.08, max: 0.74, scale: 1.30 },
  { size: 2.7, duration: 10.4, delay: -6.1, min: 0.10, max: 0.82, scale: 1.34 }
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

function createSampleCanvasSize(image: HTMLImageElement) {
  const scale = SAMPLE_LONG_SIDE / Math.max(image.naturalWidth, image.naturalHeight);
  return {
    width: Math.max(8, Math.round(image.naturalWidth * scale)),
    height: Math.max(8, Math.round(image.naturalHeight * scale))
  };
}

function alphaAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  return pixels[(y * width + x) * 4 + 3];
}

function buildAlphaMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(pixels, width, x, y) >= threshold) mask[y * width + x] = 1;
    }
  }
  return mask;
}

function collectComponents(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components: Component[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    const members: number[] = [];
    let sumX = 0;
    let sumY = 0;
    let edgeCount = 0;
    const bounds: Bounds = { minX: width, minY: height, maxX: 0, maxY: 0 };

    while (head < tail) {
      const current = queue[head++];
      members.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      sumX += x;
      sumY += y;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);

      if (
        x < BORDER_BAND_PX || y < BORDER_BAND_PX ||
        x >= width - BORDER_BAND_PX || y >= height - BORDER_BAND_PX
      ) edgeCount += 1;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }

    components.push({ members, count: members.length, sumX, sumY, bounds, edgeCount });
  }

  return components;
}

function boundsWidth(bounds: Bounds) {
  return Math.max(1, bounds.maxX - bounds.minX + 1);
}

function boundsHeight(bounds: Bounds) {
  return Math.max(1, bounds.maxY - bounds.minY + 1);
}

function touchesCanvasSides(component: Component, width: number, height: number) {
  let sides = 0;
  if (component.bounds.minX <= BORDER_BAND_PX) sides += 1;
  if (component.bounds.minY <= BORDER_BAND_PX) sides += 1;
  if (component.bounds.maxX >= width - 1 - BORDER_BAND_PX) sides += 1;
  if (component.bounds.maxY >= height - 1 - BORDER_BAND_PX) sides += 1;
  return sides;
}

function isLikelyBorderFringe(component: Component, width: number, height: number) {
  const boxArea = boundsWidth(component.bounds) * boundsHeight(component.bounds);
  const fillRatio = component.count / Math.max(1, boxArea);
  const edgeRatio = component.edgeCount / Math.max(1, component.count);
  const sides = touchesCanvasSides(component, width, height);
  return sides >= 2 && fillRatio < 0.24 && edgeRatio > 0.08;
}

function componentCenter(component: Component) {
  return {
    x: component.sumX / component.count,
    y: component.sumY / component.count
  };
}

function componentPriority(component: Component, width: number, height: number) {
  const center = componentCenter(component);
  const dx = (center.x - width / 2) / Math.max(1, width / 2);
  const dy = (center.y - height / 2) / Math.max(1, height / 2);
  const centerPenalty = Math.min(1.4, Math.hypot(dx, dy));
  const spanX = boundsWidth(component.bounds) / width;
  const spanY = boundsHeight(component.bounds) / height;
  return component.count * (1 + spanY * 2.8 + spanX * 0.7) * (1.35 - centerPenalty * 0.35);
}

function boundsNear(a: Bounds, b: Bounds, gap: number) {
  return !(
    a.maxX < b.minX - gap || a.minX > b.maxX + gap ||
    a.maxY < b.minY - gap || a.minY > b.maxY + gap
  );
}

function buildSilhouetteForThreshold(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
): Silhouette | null {
  const rawMask = buildAlphaMask(pixels, width, height, threshold);
  const minComponentPixels = Math.max(8, Math.round(width * height * MIN_COMPONENT_RATIO));
  const components = collectComponents(rawMask, width, height)
    .filter(component => component.count >= minComponentPixels)
    .filter(component => !isLikelyBorderFringe(component, width, height));

  if (components.length === 0) return null;

  const primary = [...components].sort(
    (a, b) => componentPriority(b, width, height) - componentPriority(a, width, height)
  )[0];

  // 獎章圖常由「主體 + 上蓋／皇冠尖角」等數個相鄰 alpha 區塊組成。
  // 不能只拿最高 alpha 的單一連通區，否則會把上蓋誤當成整枚獎章。
  const attachGap = Math.max(5, Math.round(Math.max(width, height) * 0.09));
  const selected = components.filter(component =>
    component === primary || boundsNear(component.bounds, primary.bounds, attachGap)
  );

  const mask = new Uint8Array(width * height);
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  const bounds: Bounds = { minX: width, minY: height, maxX: 0, maxY: 0 };

  selected.forEach(component => {
    component.members.forEach(index => { mask[index] = 1; });
    count += component.count;
    sumX += component.sumX;
    sumY += component.sumY;
    bounds.minX = Math.min(bounds.minX, component.bounds.minX);
    bounds.minY = Math.min(bounds.minY, component.bounds.minY);
    bounds.maxX = Math.max(bounds.maxX, component.bounds.maxX);
    bounds.maxY = Math.max(bounds.maxY, component.bounds.maxY);
  });

  if (count <= 0) return null;

  const spanX = boundsWidth(bounds) / width;
  const spanY = boundsHeight(bounds) / height;
  const coverage = count / (width * height);
  const centerX = sumX / count;
  const centerY = sumY / count;
  const normalizedCenterDistance = Math.hypot(
    (centerX - width / 2) / Math.max(1, width / 2),
    (centerY - height / 2) / Math.max(1, height / 2)
  );

  // 關鍵修正：比較所有 alpha 門檻後再選整體輪廓。
  // 高門檻只剩 Amway 上蓋時，因垂直跨度太小會被大幅降分，不會再「第一個可用就採用」。
  let score = spanY * 7.2 + spanX * 1.8 + Math.sqrt(Math.max(0, coverage)) * 2.2;
  score -= Math.min(1.5, normalizedCenterDistance) * 0.8;
  if (spanY < MIN_BADGE_HEIGHT_RATIO) score -= (MIN_BADGE_HEIGHT_RATIO - spanY) * 14;
  score += threshold / 255 * 0.12;

  return { mask, width, height, count, centerX, centerY, bounds, threshold, score };
}

function chooseBestSilhouette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
) {
  let best: Silhouette | null = null;
  for (const threshold of ALPHA_THRESHOLDS) {
    const candidate = buildSilhouetteForThreshold(pixels, width, height, threshold);
    if (!candidate) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function traceRadialContour(silhouette: Silhouette): Point[] {
  const raw: Point[] = [];
  const maxRadius = Math.hypot(silhouette.width, silhouette.height);

  for (let index = 0; index < RAY_COUNT; index += 1) {
    const angle = (Math.PI * 2 * index) / RAY_COUNT;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let lastOpaque: Point | null = null;

    for (let radius = 0; radius <= maxRadius; radius += 0.45) {
      const x = Math.round(silhouette.centerX + cos * radius);
      const y = Math.round(silhouette.centerY + sin * radius);
      if (x < 0 || y < 0 || x >= silhouette.width || y >= silhouette.height) break;
      if (silhouette.mask[y * silhouette.width + x]) lastOpaque = { x, y };
    }

    if (!lastOpaque) continue;
    const previous = raw[raw.length - 1];
    if (!previous || previous.x !== lastOpaque.x || previous.y !== lastOpaque.y) raw.push(lastOpaque);
  }

  if (raw.length > 1) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if (first.x === last.x && first.y === last.y) raw.pop();
  }
  return raw;
}

function smoothClosedContour(points: Point[]) {
  if (points.length < 5) return points;
  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return {
      x: (previous.x + point.x * 2 + next.x) / 4,
      y: (previous.y + point.y * 2 + next.y) / 4
    };
  });
}

function resampleClosedContour(points: Point[], count: number) {
  if (points.length < 12) return null;
  const smoothed = smoothClosedContour(points);
  const lengths: number[] = [];
  let total = 0;

  for (let index = 0; index < smoothed.length; index += 1) {
    const current = smoothed[index];
    const next = smoothed[(index + 1) % smoothed.length];
    const length = Math.hypot(next.x - current.x, next.y - current.y);
    lengths.push(length);
    total += length;
  }

  if (total < 20) return null;
  const result: Point[] = [];
  let segment = 0;
  let segmentStartDistance = 0;

  for (let sample = 0; sample < count; sample += 1) {
    const target = (total * sample) / count;
    while (segment < lengths.length - 1 && segmentStartDistance + lengths[segment] < target) {
      segmentStartDistance += lengths[segment];
      segment += 1;
    }
    const current = smoothed[segment];
    const next = smoothed[(segment + 1) % smoothed.length];
    const length = Math.max(lengths[segment], 0.001);
    const t = Math.min(1, Math.max(0, (target - segmentStartDistance) / length));
    result.push({
      x: current.x + (next.x - current.x) * t,
      y: current.y + (next.y - current.y) * t
    });
  }
  return result;
}

function contourNormalizedPoints(silhouette: Silhouette) {
  const contour = resampleClosedContour(traceRadialContour(silhouette), CONTOUR_POINT_COUNT);
  if (!contour) return null;

  const outset = Math.max(1.4, Math.min(silhouette.width, silhouette.height) * 0.012);
  return contour.map(point => {
    const dx = point.x - silhouette.centerX;
    const dy = point.y - silhouette.centerY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    return {
      x: Math.min(1.03, Math.max(-0.03, (point.x + (dx / distance) * outset) / silhouette.width)),
      y: Math.min(1.03, Math.max(-0.03, (point.y + (dy / distance) * outset) / silhouette.height))
    };
  });
}

function sampleAlphaContour(image: HTMLImageElement): SampleResult | null {
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const sampleSize = createSampleCanvasSize(image);
  const canvas = document.createElement('canvas');
  canvas.width = sampleSize.width;
  canvas.height = sampleSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  try {
    context.clearRect(0, 0, sampleSize.width, sampleSize.height);
    // 直接在「來源圖片本身的長寬比」取樣，不再先塞進正方形座標系。
    context.drawImage(image, 0, 0, sampleSize.width, sampleSize.height);
    const pixels = context.getImageData(0, 0, sampleSize.width, sampleSize.height).data;
    const silhouette = chooseBestSilhouette(pixels, sampleSize.width, sampleSize.height);
    if (!silhouette) return null;
    const points = contourNormalizedPoints(silhouette);
    if (!points) return null;
    return {
      points,
      threshold: silhouette.threshold,
      widthRatio: boundsWidth(silhouette.bounds) / silhouette.width,
      heightRatio: boundsHeight(silhouette.bounds) / silhouette.height
    };
  } catch {
    return null;
  }
}

async function sampleAlphaContourViaBlob(source: string) {
  try {
    const response = await fetch(source, { credentials: 'same-origin', cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const probe = new Image();
      probe.src = objectUrl;
      await waitForImage(probe);
      return sampleAlphaContour(probe);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

function getPaintedContentBox(image: HTMLImageElement): PaintedBox | null {
  const elementWidth = image.offsetWidth || image.clientWidth;
  const elementHeight = image.offsetHeight || image.clientHeight;
  if (!elementWidth || !elementHeight || !image.naturalWidth || !image.naturalHeight) return null;

  // 與 object-fit: contain 完全相同的換算：先算圖片真正「畫在 img 裡」的矩形，再把輪廓層鎖到這個矩形。
  const scale = Math.min(elementWidth / image.naturalWidth, elementHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  return {
    left: image.offsetLeft + (elementWidth - width) / 2,
    top: image.offsetTop + (elementHeight - height) / 2,
    width,
    height
  };
}

function positionContourNode(node: HTMLElement | SVGElement, image: HTMLImageElement) {
  const box = getPaintedContentBox(image);
  if (!box) return;
  const element = node as HTMLElement;
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
}

function createContourLayer(result: SampleResult, image: HTMLImageElement) {
  const layer = document.createElement('span');
  layer.className = 'v195-rank-badge-contour-layer';
  layer.dataset.v195RankContour = '1';
  layer.setAttribute('aria-hidden', 'true');

  result.points.forEach((point, index) => {
    const pulse = CROWN_PULSES[index % CROWN_PULSES.length];
    const light = document.createElement('span');
    light.className = 'v195-rank-badge-contour-light';
    light.style.setProperty('--contour-x', `${point.x * 100}%`);
    light.style.setProperty('--contour-y', `${point.y * 100}%`);
    light.style.setProperty('--contour-size', `${pulse.size}px`);
    light.style.setProperty('--contour-duration', `${pulse.duration + (index % 5) * 0.11}s`);
    light.style.setProperty('--contour-delay', `${pulse.delay - (index % 11) * 0.17}s`);
    light.style.setProperty('--contour-min', String(pulse.min));
    light.style.setProperty('--contour-max', String(pulse.max));
    light.style.setProperty('--contour-scale', String(pulse.scale));
    layer.appendChild(light);
  });

  positionContourNode(layer, image);
  return layer;
}

let fallbackId = 0;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function createSvgContourFallback(image: HTMLImageElement) {
  fallbackId += 1;
  const suffix = `v197-${fallbackId}`;
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

  // Preview 跨來源時的備援：門檻降到約 50%，避免 v196 只剩高 alpha 上蓋。
  const threshold = svgElement('feComponentTransfer');
  threshold.setAttribute('in', 'SourceAlpha');
  threshold.setAttribute('result', 'thresholded');
  const alpha = svgElement('feFuncA');
  alpha.setAttribute('type', 'discrete');
  alpha.setAttribute('tableValues', '0 0 1 1');
  threshold.appendChild(alpha);
  filter.appendChild(threshold);

  const erode = svgElement('feMorphology');
  erode.setAttribute('in', 'thresholded');
  erode.setAttribute('operator', 'erode');
  erode.setAttribute('radius', '0.55');
  erode.setAttribute('result', 'eroded');
  filter.appendChild(erode);

  const reopen = svgElement('feMorphology');
  reopen.setAttribute('in', 'eroded');
  reopen.setAttribute('operator', 'dilate');
  reopen.setAttribute('radius', '0.55');
  reopen.setAttribute('result', 'opened');
  filter.appendChild(reopen);

  const dilate = svgElement('feMorphology');
  dilate.setAttribute('in', 'opened');
  dilate.setAttribute('operator', 'dilate');
  dilate.setAttribute('radius', '2.25');
  dilate.setAttribute('result', 'dilated');
  filter.appendChild(dilate);

  const outline = svgElement('feComposite');
  outline.setAttribute('in', 'dilated');
  outline.setAttribute('in2', 'opened');
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
  // SVG 本身已被鎖到實際 painted content box，因此這裡不再做第二次 contain。
  maskImage.setAttribute('preserveAspectRatio', 'none');
  maskImage.setAttribute('filter', `url(#${filterId})`);
  mask.appendChild(maskImage);
  defs.appendChild(mask);

  const pattern = svgElement('pattern');
  pattern.id = patternId;
  pattern.setAttribute('width', '11');
  pattern.setAttribute('height', '11');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');

  [
    { cx: 2.1, cy: 2.2, r: 1.0, variant: 0 },
    { cx: 7.8, cy: 7.2, r: 0.76, variant: 4 }
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

  positionContourNode(svg, image);
  return svg;
}

async function decorateBadge(image: HTMLImageElement) {
  const source = image.currentSrc || image.src;
  if (!source || image.dataset.v195ContourPending === source) return;

  const motion = image.closest<HTMLElement>('.v190-rank-badge-motion');
  if (!motion) return;

  const existing = motion.querySelector<HTMLElement | SVGElement>('[data-v195-rank-contour="1"]');
  if (image.dataset.v195ContourSource === source && existing) {
    // 響應式尺寸變化時也要重新對齊真正 painted content box。
    positionContourNode(existing, image);
    return;
  }

  image.dataset.v195ContourPending = source;
  try {
    await waitForImage(image);
    if ((image.currentSrc || image.src) !== source) return;

    motion.querySelectorAll<HTMLElement>('[data-v195-rank-contour="1"]').forEach(node => node.remove());
    motion.classList.add('v195-rank-badge-contour-host');

    let result = sampleAlphaContour(image);
    if (!result) result = await sampleAlphaContourViaBlob(source);

    if (result) {
      motion.appendChild(createContourLayer(result, image));
      motion.dataset.v197ContourMode = 'adaptive-full-silhouette';
      motion.dataset.v197ContourThreshold = String(result.threshold);
      motion.dataset.v197ContourSpan = `${result.widthRatio.toFixed(3)}x${result.heightRatio.toFixed(3)}`;
    } else {
      motion.appendChild(createSvgContourFallback(image));
      motion.dataset.v197ContourMode = 'painted-box-svg-fallback';
      delete motion.dataset.v197ContourThreshold;
      delete motion.dataset.v197ContourSpan;
    }
    image.dataset.v195ContourSource = source;
  } catch {
    // 保留獎章本體；輪廓暫時失敗時不阻擋詳細頁其他功能。
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
  document.documentElement.setAttribute('data-echostars-v196-rank-badge-contour-fix', 'true');
  document.documentElement.setAttribute('data-echostars-v197-rank-badge-silhouette-fix', 'true');
  syncV195ContourLights();
  window.setInterval(syncV195ContourLights, 700);
  window.addEventListener('focus', syncV195ContourLights);
  window.addEventListener('resize', syncV195ContourLights);
}
