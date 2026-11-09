import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDir, '..');

function loadDotEnv() {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  });
}

loadDotEnv();

const port = Number.parseInt(process.env.PORT || '3001', 10);
const provider = process.env.MODEL_PROVIDER || 'bailian';
const apiBaseUrl = (process.env.MODEL_API_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
const modelName = process.env.MODEL_NAME || 'qwen-plus';
const apiKey = process.env.MODEL_API_KEY || process.env.DASHSCOPE_API_KEY || '';
const timeoutMs = Number.parseInt(process.env.MODEL_TIMEOUT_MS || '300000', 10);

export const config = {
  projectRoot,
  webRoot: path.join(projectRoot, 'web'),
  port: Number.isFinite(port) ? port : 3001,
  provider,
  apiBaseUrl,
  modelName,
  apiKey,
  timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 300000
};
