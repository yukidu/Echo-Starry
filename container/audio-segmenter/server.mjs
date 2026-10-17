import { createServer } from 'node:http';
import { createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

const PORT = 8080;
const ROOT = '/tmp';

function safeId(value = '') {
  const id = String(value).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!id) throw new Error('invalid trackId');
  return id;
}

function safeExt(value = '') {
  const ext = String(value).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return ext || 'audio';
}

function filePath(trackId, ext) {
  return `${ROOT}/echo-${safeId(trackId)}.${safeExt(ext)}`;
}

async function runFfmpeg(input, start, duration) {
  return await new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(start),
      '-i', input,
      '-t', String(duration),
      '-vn',
      '-map_metadata', '-1',
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'libmp3lame',
      '-b:a', '48k',
      '-f', 'mp3',
      'pipe:1'
    ];
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const output = [];
    const errors = [];
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.on('data', chunk => errors.push(chunk));
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString('utf8') || `ffmpeg exited ${code}`));
        return;
      }
      const body = Buffer.concat(output);
      if (!body.length) {
        reject(new Error('ffmpeg returned empty audio'));
        return;
      }
      resolve(body);
    });
  });
}

function json(res, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store'
  });
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://container');

    if (url.pathname === '/health') {
      json(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/load' && req.method === 'POST') {
      const trackId = safeId(url.searchParams.get('trackId') || '');
      const ext = safeExt(url.searchParams.get('ext') || 'audio');
      const path = filePath(trackId, ext);
      await pipeline(req, createWriteStream(path, { flags: 'w' }));
      const stat = await fs.stat(path);
      json(res, 200, { ok: true, bytes: stat.size, trackId, ext });
      return;
    }

    if (url.pathname === '/segment' && req.method === 'GET') {
      const trackId = safeId(url.searchParams.get('trackId') || '');
      const ext = safeExt(url.searchParams.get('ext') || 'audio');
      const start = Math.max(0, Number(url.searchParams.get('start') || 0));
      const duration = Math.min(600, Math.max(1, Number(url.searchParams.get('duration') || 180)));
      if (!Number.isFinite(start) || !Number.isFinite(duration)) throw new Error('invalid timing');
      const path = filePath(trackId, ext);
      try {
        await fs.access(path);
      } catch {
        json(res, 404, { ok: false, error: 'audio-not-loaded' });
        return;
      }
      const body = await runFfmpeg(path, start, duration);
      res.writeHead(200, {
        'content-type': 'audio/mpeg',
        'content-length': String(body.length),
        'cache-control': 'no-store',
        'x-segment-start': String(start),
        'x-segment-duration': String(duration)
      });
      res.end(body);
      return;
    }

    if (url.pathname === '/load' && req.method === 'DELETE') {
      const trackId = safeId(url.searchParams.get('trackId') || '');
      const ext = safeExt(url.searchParams.get('ext') || 'audio');
      await fs.unlink(filePath(trackId, ext)).catch(() => null);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { ok: false, error: 'not-found' });
  } catch (error) {
    json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`audio-segmenter listening on ${PORT}`);
});
