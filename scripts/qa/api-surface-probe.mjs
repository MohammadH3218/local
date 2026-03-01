#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://localhost:3000',
    apiPrefix: '/api/v1',
    timeoutMs: 8000,
    out: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith('--')) continue;
    if (key === '--base-url' && value) args.baseUrl = value;
    if (key === '--api-prefix' && value) args.apiPrefix = value;
    if (key === '--timeout-ms' && value) args.timeoutMs = Number(value);
    if (key === '--out' && value) args.out = value;
  }

  return args;
}

async function walk(dir, fileList = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, fileList);
    } else {
      fileList.push(full);
    }
  }
  return fileList;
}

function stripQuotes(value = '') {
  if (!value) return '';
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizePath(...segments) {
  const merged = segments
    .map((segment) => String(segment || '').trim())
    .filter(Boolean)
    .join('/');

  if (!merged) return '/';

  return (`/${merged}`)
    .replace(/\/+/g, '/')
    .replace(/\/\//g, '/')
    .replace(/:([A-Za-z0-9_]+)/g, 'sample')
    .replace(/\*/g, 'wildcard');
}

function parseControllerPrefix(content) {
  const match = content.match(/@Controller\s*\(\s*([^)]*)\s*\)/m);
  if (!match) return '';
  const raw = match[1].trim();
  if (!raw) return '';
  return stripQuotes(raw);
}

function parseRoutes(content, file) {
  const routes = [];
  const prefix = parseControllerPrefix(content);
  const methodRegex = /((?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*)+)\s*(?:public|private|protected)?\s*(?:async\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\(/gms;

  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    const decorators = match[1];
    const httpDecorator = decorators.match(/@(Get|Post|Put|Patch|Delete|Options|Head)\s*(?:\(\s*([^)]*)\s*\))?/m);
    if (!httpDecorator) continue;

    const method = httpDecorator[1].toUpperCase();
    const argRaw = (httpDecorator[2] || '').split(',')[0] || '';
    const routePart = stripQuotes(argRaw);
    const isPublic = /@Public\s*\(/m.test(decorators);

    routes.push({
      method,
      path: normalizePath(prefix, routePart),
      public: isPublic,
      file,
    });
  }

  return routes;
}

async function discoverRoutes() {
  const backendSrc = path.join(process.cwd(), 'packages', 'backend', 'src');
  const files = await walk(backendSrc);
  const controllerFiles = files.filter((file) => file.endsWith('.controller.ts'));

  const routes = [];
  for (const file of controllerFiles) {
    const content = await fs.readFile(file, 'utf8');
    routes.push(...parseRoutes(content, path.relative(process.cwd(), file)));
  }

  const deduped = new Map();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    if (!deduped.has(key)) deduped.set(key, route);
  }

  return Array.from(deduped.values()).sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

async function probeRoute({ baseUrl, apiPrefix, timeoutMs }, route) {
  const url = `${baseUrl.replace(/\/$/, '')}${normalizePath(apiPrefix, route.path)}`;
  const headers = { Accept: 'application/json' };
  const init = {
    method: route.method,
    headers,
  };

  if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify({});
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeout);
    return {
      ...route,
      url,
      status: response.status,
      latency_ms: Date.now() - startedAt,
      ok: response.ok,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ...route,
      url,
      status: 0,
      latency_ms: Date.now() - startedAt,
      ok: false,
      error: error?.message || String(error),
    };
  }
}

function summarize(results) {
  const byStatus = new Map();
  let slow = [];

  for (const result of results) {
    byStatus.set(result.status, (byStatus.get(result.status) || 0) + 1);
    if (result.latency_ms >= 1000) slow.push(result);
  }

  slow = slow.sort((a, b) => b.latency_ms - a.latency_ms).slice(0, 10);

  return {
    total: results.length,
    by_status: Object.fromEntries(Array.from(byStatus.entries()).sort((a, b) => a[0] - b[0])),
    slowest: slow,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const routes = await discoverRoutes();

  if (routes.length === 0) {
    console.error('No controller routes discovered.');
    process.exit(1);
  }

  const results = [];
  for (const route of routes) {
    // Sequential probing avoids accidental load spikes while mapping status coverage.
    // Stress scenarios should be run separately with dedicated tools.
    const result = await probeRoute(args, route);
    results.push(result);
  }

  const summary = summarize(results);
  const payload = {
    generated_at: new Date().toISOString(),
    config: args,
    summary,
    results,
  };

  if (args.out) {
    await fs.mkdir(path.dirname(args.out), { recursive: true });
    await fs.writeFile(args.out, JSON.stringify(payload, null, 2), 'utf8');
  }

  console.log(`Discovered routes: ${routes.length}`);
  console.log(`Status distribution: ${JSON.stringify(summary.by_status)}`);
  if (summary.slowest.length > 0) {
    console.log('Slowest endpoints (ms):');
    for (const item of summary.slowest) {
      console.log(`- ${item.latency_ms} ${item.method} ${item.path} (${item.status})`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
