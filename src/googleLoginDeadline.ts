/** Bounds the entire operation, including response body reads. */
export async function withGoogleLoginDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('登入連線逾時，請再次點選上方 Google 按鈕重試。'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
