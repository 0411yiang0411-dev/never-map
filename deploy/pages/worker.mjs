// Same authenticated API and quota guard, reached through an internal binding.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.NEVER_MAP) return Response.json({error:'云端连接尚未配置'}, {status:503});
    return env.NEVER_MAP.fetch(request);
  }
};
