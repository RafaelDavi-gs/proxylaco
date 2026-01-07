/**
 * Cloudflare Worker - Proxy para Asaas API
 * Este worker faz proxy das requisições para o Asaas usando IP fixo do Cloudflare
 * 
 * IMPORTANTE: Este código deve ser deployado no Cloudflare Workers
 * URL: https://proxylaco.fluityai.workers.dev
 */

export default {
  async fetch(request, env, ctx) {
    // Tratar CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, access_token',
        },
      });
    }

    try {
      // Obter path e baseUrl da query string
      const url = new URL(request.url);
      const path = url.searchParams.get('path');
      const baseUrl = url.searchParams.get('baseUrl');
      
      // Se não tiver path e baseUrl, mas tiver ?checkIP, retornar IP de saída
      if (!path && !baseUrl && url.searchParams.get('checkIP') === 'true') {
        try {
          const ipResponse = await fetch('https://api.ipify.org?format=json');
          const ipData = await ipResponse.json();
          
          return new Response(
            JSON.stringify({
              success: true,
              message: 'IP de saída do Cloudflare Worker',
              ip: ipData.ip,
              instructions: [
                '1. Copie o IP acima',
                '2. Acesse o painel do Asaas (sandbox ou production)',
                '3. Vá em Integrações > API > Whitelist de IPs',
                '4. Adicione este IP na whitelist',
                '5. Salve as alterações',
                '6. Teste novamente o proxy'
              ],
              note: 'Este é o IP que o Asaas verá quando o Worker fizer requisições'
            }),
            {
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              }
            }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Erro ao descobrir IP',
              details: error.message
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
      }

      if (!path || !baseUrl) {
        return new Response(
          JSON.stringify({ 
            error: 'Parâmetros obrigatórios não fornecidos',
            required: ['path', 'baseUrl'],
            received: { path, baseUrl },
            tip: 'Use ?checkIP=true para descobrir o IP de saída do Cloudflare'
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

      // Construir URL completa do Asaas
      const asaasUrl = `${baseUrl}${path}`;
      
      console.log(`[PROXY] Fazendo requisição ao Asaas: ${asaasUrl}`);
      console.log(`[PROXY] Método: ${request.method}`);

      // Preparar headers para a requisição ao Asaas
      // IMPORTANTE: Remover headers que podem expor o IP do Supabase
      const headers = new Headers();
      
      // Headers que NÃO devem ser copiados (expõem IP do Supabase)
      const headersToSkip = [
        'x-forwarded-for',
        'x-real-ip',
        'cf-connecting-ip',
        'x-client-ip',
        'forwarded',
        'cf-ray',
        'cf-request-id',
        'cf-visitor',
        'cf-worker',
      ];
      
      // Copiar TODOS os headers (exceto os que expõem IP)
      console.log(`[PROXY] Headers recebidos:`, Array.from(request.headers.entries()).map(([k]) => k));
      
      for (const [key, value] of request.headers.entries()) {
        const keyLower = key.toLowerCase();
        
        // Pular headers que expõem IP
        if (headersToSkip.some(skip => keyLower === skip.toLowerCase())) {
          console.log(`[PROXY] Pulando header: ${key}`);
          continue;
        }
        
        // Normalizar access-token para access_token
        if (keyLower === 'access-token') {
          headers.set('access_token', value);
          console.log(`[PROXY] Normalizado access-token -> access_token`);
        } else {
          headers.set(key, value);
        }
      }
      
      // Log para debug (sem valores completos de tokens)
      console.log(`[PROXY] Headers que serão enviados ao Asaas:`, Array.from(headers.entries()).map(([k, v]) => {
        if (k.toLowerCase().includes('token') || k.toLowerCase().includes('key') || k.toLowerCase().includes('auth')) {
          return [k, v.substring(0, 15) + '...'];
        }
        return [k, v];
      }));
      
      // Verificar se access_token foi encontrado
      if (!headers.has('access_token')) {
        console.error(`[PROXY] ❌ ERRO: access_token não encontrado nos headers!`);
        console.error(`[PROXY] Todos os headers recebidos:`, Array.from(request.headers.entries()).map(([k, v]) => {
          if (k.toLowerCase().includes('token') || k.toLowerCase().includes('key') || k.toLowerCase().includes('auth')) {
            return [k, v.substring(0, 15) + '...'];
          }
          return [k, v];
        }));
      } else {
        console.log(`[PROXY] ✅ access_token encontrado e será enviado ao Asaas`);
      }
      
      // Preparar body
      let body = null;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.clone().arrayBuffer();
      }

      // Fazer requisição ao Asaas
      const response = await fetch(asaasUrl, {
        method: request.method,
        headers: headers,
        body: body,
      });

      // Clonar resposta para poder ler e retornar
      const responseBody = await response.text();
      
      console.log(`[PROXY] Resposta do Asaas - Status: ${response.status}`);

      // Retornar resposta com CORS
      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, access_token',
        },
      });
    } catch (error) {
      console.error('[PROXY] Erro:', error);
      
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao fazer proxy da requisição',
          details: error.message 
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
