const IANA_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';
const DNS_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const CACHE_SECONDS = 300;

const STATUS_LABELS = {
  addPeriod: '新增寬限期',
  autoRenewPeriod: '自動續約寬限期',
  clientDeleteProhibited: '禁止由用戶端刪除',
  clientHold: '用戶端暫停解析',
  clientRenewProhibited: '禁止由用戶端續約',
  clientTransferProhibited: '禁止由用戶端移轉',
  clientUpdateProhibited: '禁止由用戶端更新',
  inactive: '未啟用',
  ok: '正常',
  pendingCreate: '等待建立',
  pendingDelete: '等待刪除',
  pendingRenew: '等待續約',
  pendingRestore: '等待復原',
  pendingTransfer: '等待移轉',
  pendingUpdate: '等待更新',
  redemptionPeriod: '贖回期',
  renewPeriod: '續約寬限期',
  serverDeleteProhibited: 'Registry 禁止刪除',
  serverHold: 'Registry 暫停解析',
  serverRenewProhibited: 'Registry 禁止續約',
  serverTransferProhibited: 'Registry 禁止移轉',
  serverUpdateProhibited: 'Registry 禁止更新',
  transferPeriod: '移轉寬限期'
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? `public, max-age=0, s-maxage=${CACHE_SECONDS}` : 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
}

function normalizeDomain(input) {
  let value = (input || '').trim();
  if (!value) return '';
  try {
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    const url = new URL(value);
    value = url.hostname;
  } catch {
    value = value.replace(/^https?:\/\//i, '').split('/')[0];
  }
  return value.replace(/^www\./i, '').replace(/\.$/, '').toLowerCase();
}

function validDomain(domain) {
  if (!domain || domain.length > 253 || !domain.includes('.')) return false;
  if (/\s/.test(domain)) return false;
  const ascii = /^[a-z0-9.-]+$/i.test(domain);
  if (!ascii) return false;
  const labels = domain.split('.');
  return labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

async function cachedFetchJson(url, ttl = 86400, headers = {}) {
  const cache = caches.default;
  const key = new Request(url, { method: 'GET' });
  let response = await cache.match(key);
  if (!response) {
    response = await fetch(url, { headers, redirect: 'follow' });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    const cloned = new Response(response.body, response);
    cloned.headers.set('Cache-Control', `public, max-age=${ttl}`);
    await cache.put(key, cloned.clone());
    response = cloned;
  }
  return response.json();
}

async function getRdapBase(domain) {
  const tld = domain.split('.').pop();
  const bootstrap = await cachedFetchJson(IANA_BOOTSTRAP, 86400, { 'accept': 'application/json' });
  const service = (bootstrap.services || []).find(([tlds]) => Array.isArray(tlds) && tlds.map((v) => v.toLowerCase()).includes(tld));
  if (!service || !service[1]?.length) return null;
  return service[1][0];
}

function rdapUrl(base, domain) {
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(`domain/${encodeURIComponent(domain)}`, cleanBase).toString();
}

function findEvent(events, actions) {
  const wanted = actions.map((v) => v.toLowerCase());
  const event = (events || []).find((item) => wanted.includes(String(item.eventAction || '').toLowerCase()));
  return event?.eventDate || null;
}

function vcardValue(entity, names) {
  const fields = entity?.vcardArray?.[1];
  if (!Array.isArray(fields)) return null;
  for (const name of names) {
    const found = fields.find((field) => Array.isArray(field) && String(field[0]).toLowerCase() === name.toLowerCase());
    if (found && found.length >= 4) {
      const value = found[3];
      if (Array.isArray(value)) return value.filter(Boolean).join(' ');
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

function extractRegistrar(raw) {
  const entity = (raw.entities || []).find((item) => Array.isArray(item.roles) && item.roles.includes('registrar'));
  if (!entity) return { name: null, ianaId: null };
  const publicId = (entity.publicIds || []).find((item) => /iana/i.test(item.type || ''));
  return {
    name: vcardValue(entity, ['fn', 'org']) || entity.handle || null,
    ianaId: publicId?.identifier || null
  };
}

function normalizeStatuses(statuses = []) {
  return statuses.map((status) => ({
    raw: status,
    label: STATUS_LABELS[status] || status
  }));
}

function formatDnsAnswer(type, answer) {
  const data = String(answer?.data || '').replace(/\.$/, '');
  if (type === 'MX') {
    const match = data.match(/^(\d+)\s+(.+)$/);
    if (match) return `${match[1]} ${match[2].replace(/\.$/, '')}`;
  }
  return data;
}

async function dnsQuery(domain, type) {
  try {
    const url = `${DNS_ENDPOINT}?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`;
    const response = await fetch(url, {
      headers: { 'accept': 'application/dns-json' },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.Answer || [])
      .filter((answer) => String(answer.type) !== '5')
      .map((answer) => formatDnsAnswer(type, answer))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function getDns(domain) {
  const [a, aaaa, mx, ns] = await Promise.all([
    dnsQuery(domain, 'A'),
    dnsQuery(domain, 'AAAA'),
    dnsQuery(domain, 'MX'),
    dnsQuery(domain, 'NS')
  ]);
  return { A: a, AAAA: aaaa, MX: mx, NS: ns };
}

function cloudflareDns(nameservers = []) {
  return nameservers.some((ns) => /\.ns\.cloudflare\.com$/i.test(ns));
}

async function queryRdap(domain, base) {
  const url = rdapUrl(base, domain);
  const response = await fetch(url, {
    headers: {
      'accept': 'application/rdap+json, application/json;q=0.9',
      'user-agent': 'WUMETAX-Domain-Lookup/1.0 (+https://wumetax.com/)'
    },
    redirect: 'follow',
    cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }
  });
  if (response.status === 404) return { found: false, raw: null, url, status: 404 };
  const text = await response.text();
  let raw = null;
  try { raw = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) return { found: null, raw, url, status: response.status };
  return { found: true, raw, url, status: response.status };
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const domain = normalizeDomain(requestUrl.searchParams.get('domain'));

  if (!validDomain(domain)) {
    return json({ registered: null, domain, message: '請輸入有效的完整網域，例如 wumetax.com。' }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(`${requestUrl.origin}/api/domain?domain=${encodeURIComponent(domain)}`, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const base = await getRdapBase(domain);
    if (!base) {
      const payload = {
        registered: null,
        domain,
        source: 'rdap',
        message: 'IANA RDAP Bootstrap 目前沒有提供此頂級網域的 RDAP 服務。'
      };
      return json(payload, 200);
    }

    const result = await queryRdap(domain, base);
    const rdapHost = new URL(result.url).hostname;

    if (result.found === false) {
      const payload = {
        registered: false,
        domain,
        source: 'rdap',
        rdapHost,
        registrar: { name: null, ianaId: null },
        dates: { registration: null, expiration: null, updated: null },
        nameservers: [],
        statuses: [],
        dnssec: null,
        cloudflareDns: false,
        dns: { A: [], AAAA: [], MX: [], NS: [] },
        raw: { status: 404, note: 'Authoritative RDAP returned 404.' }
      };
      const response = json(payload);
      context.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    if (result.found !== true || !result.raw) {
      const payload = {
        registered: null,
        domain,
        source: 'rdap',
        rdapHost,
        message: `Registry RDAP 暫時無法完成查詢（HTTP ${result.status}）。`,
        raw: result.raw || { status: result.status }
      };
      return json(payload, 200);
    }

    const raw = result.raw;
    const nameservers = (raw.nameservers || [])
      .map((item) => item.ldhName || item.unicodeName)
      .filter(Boolean)
      .map((name) => name.replace(/\.$/, '').toLowerCase());
    const dns = await getDns(domain);
    const payload = {
      registered: true,
      domain: raw.ldhName?.toLowerCase() || domain,
      unicodeName: raw.unicodeName || null,
      source: 'rdap',
      rdapHost,
      registrar: extractRegistrar(raw),
      dates: {
        registration: findEvent(raw.events, ['registration']),
        expiration: findEvent(raw.events, ['expiration']),
        updated: findEvent(raw.events, ['last changed', 'last update of rdap database'])
      },
      nameservers,
      statuses: normalizeStatuses(raw.status || []),
      dnssec: typeof raw.secureDNS?.delegationSigned === 'boolean' ? raw.secureDNS.delegationSigned : null,
      cloudflareDns: cloudflareDns(nameservers.length ? nameservers : dns.NS),
      dns,
      raw
    };

    const response = json(payload);
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return json({
      registered: null,
      domain,
      source: 'rdap',
      message: '查詢服務暫時無法連線至 Registry，請稍後再試。',
      detail: error instanceof Error ? error.message : 'Unknown error'
    }, 502);
  }
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ message: 'Method not allowed.' }, 405, { allow: 'GET' });
}
