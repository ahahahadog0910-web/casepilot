import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { config } from './config.js';
import { createProvider } from './providers/index.js';
import { generateTestPlan } from './rule-engine.js';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const modelProvider = createProvider(config);

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  response.end(body);
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function readJson(request, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > limit) reject(new Error('请求内容不能超过 1 MB'));
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('请求体必须是合法 JSON'));
      }
    });
    request.on('error', reject);
  });
}

function serveStatic(request, response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const absolutePath = path.resolve(config.webRoot, `.${requestedPath}`);
  if (!absolutePath.startsWith(`${config.webRoot}${path.sep}`)) return sendError(response, 403, '非法文件路径');
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return sendError(response, 404, '页面不存在');
  const extension = path.extname(absolutePath).toLowerCase();
  response.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'application/octet-stream' });
  fs.createReadStream(absolutePath).pipe(response);
}

async function handleGenerate(request, response) {
  const body = await readJson(request);
  const requirement = typeof body.requirement === 'string' ? body.requirement.trim() : '';
  if (!requirement) return sendError(response, 400, 'requirement 不能为空');
  if (requirement.length > 20000) return sendError(response, 400, '需求内容不能超过 20,000 字符');

  const options = body.options && typeof body.options === 'object' ? body.options : {};
  if (!modelProvider.configured) {
    return sendError(response, 503, '模型 Provider 尚未配置 API Key，请在 .env 中填写 MODEL_API_KEY');
  }
  const parsed = await modelProvider.parseRequirement({ requirement, options });
  const plan = generateTestPlan(parsed.requirement, options, { provider: parsed.provider, modelId: parsed.modelId });
  sendJson(response, 200, plan);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') return response.end();

  try {
    if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
      return sendJson(response, 200, { status: 'ok', provider: modelProvider.id, model: modelProvider.id === 'mock' ? 'mock-parser' : config.modelName, configured: modelProvider.configured, generation: 'deterministic-rules' });
    }
    if (request.method === 'GET' && requestUrl.pathname === '/api/models') {
      return sendJson(response, 200, { models: [{ id: modelProvider.id === 'mock' ? 'mock-parser' : config.modelName, provider: modelProvider.id, role: 'requirement-parser', active: true, configured: modelProvider.configured }] });
    }
    if (request.method === 'POST' && requestUrl.pathname === '/api/generate-test-plan') return await handleGenerate(request, response);
    if (request.method === 'GET') return serveStatic(request, response, requestUrl.pathname);
    return sendError(response, 405, '不支持的请求方法');
  } catch (error) {
    console.error(`[CasePilot] ${request.method} ${requestUrl.pathname}`, error);
    return sendError(response, 502, error.message || '服务调用失败');
  }
});
server.listen(config.port, () => {
  console.log(`CasePilot server running at http://localhost:${config.port}`);
  console.log(`Requirement parser: ${config.provider} | Model: ${config.provider === 'mock' ? 'mock-parser' : config.modelName}`);
  console.log('Test points and test cases: deterministic rules');
});
