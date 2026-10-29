// Same authenticated API and quota guard, reached through an internal binding.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.NEVER_MAP) return Response.json({error:'云端连接尚未配置'}, {status:503});
    const response=await env.NEVER_MAP.fetch(request);
    if(url.pathname==='/api/share'&&response.ok){
      const body=await response.json(),link=new URL(body.url);
      // The backend's legacy URL is mapped to this verified same-app entry.
      body.url=url.origin+link.pathname+link.search+link.hash;
      return Response.json(body,{headers:{'Cache-Control':'no-store'}});
    }
    return response;
  }
};
