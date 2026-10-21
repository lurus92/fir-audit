// A fake site served from memory, so tests never touch the network.
export function fakeSite(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const path = new URL(url).pathname;
    const body = routes[path];
    const isRobots = path === '/robots.txt';
    return {
      ok: body !== undefined,
      status: body !== undefined ? 200 : 404,
      headers: { get: () => (isRobots ? 'text/plain' : 'text/html; charset=utf-8') },
      text: async () => body ?? '',
    };
  };
  return { fetchImpl, calls };
}
