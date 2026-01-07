export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, access_token, x-client-info',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      const url = new URL(request.url);
      const asaasPath = url.searchParams.get('path') || '';
      const asaasBaseUrl = url.searchParams.get('baseUrl') || 'https://api.asaas.com/v3';
      
      if (!asaasPath) {
        return new Response(
          JSON.stringify({ 
            error: 'Parâmetro "path" é obrigatório',
            example: '?path=/accounts/123&baseUrl=https://api.asaas.com/v3'
          }),
          { 
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            }
          }
        );
      }
      
      const asaasUrl = `${asaasBaseUrl}${asaasPath}`;
      const headers = new Headers();
      
      for (const [key, value] of request.headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (
          !lowerKey.startsWith('cf-') && 
          !lowerKey.startsWith('x-forwarded-') && 
          !lowerKey.startsWith('x-real-ip') &&
          lowerKey !== 'host' &&
          lowerKey !== 'connection' &&
          lowerKey !== 'upgrade'
        ) {
          headers.set(key, value);
        }
      }
      
      if (request.method !== 'GET' && request.method !== 'HEAD' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      
      let body = null;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        try {
          body = await request.clone().arrayBuffer();
        } catch (e) {
          console.error('[Proxy] Erro ao ler body:', e);
        }
      }
      
      const response = await fetch(asaasUrl, {
        method: request.method,
        headers: headers,
        body: body,
      });
      
      const responseData = await response.arrayBuffer();
      
      return new Response(responseData, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, access_token',
          'X-Proxy-By': 'Cloudflare-Worker',
        },
      });
      
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Erro no proxy',
          message: error.message
        }),
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }
  },
};
