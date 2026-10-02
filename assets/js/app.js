(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const HISTORY_KEY = 'wumetax_domain_lookup_history_v1';

  const form = $('#lookupForm');
  const input = $('#domainInput');
  const clearInput = $('#clearInput');
  const lookupButton = $('#lookupButton');
  const messageSection = $('#messageSection');
  const resultSection = $('#resultSection');
  const registeredContent = $('#registeredContent');
  const historyList = $('#historyList');
  const historyEmpty = $('#historyEmpty');
  const shareDialog = $('#shareDialog');
  const shareUrlPreview = $('#shareUrlPreview');
  const downloadPdfButton = $('#downloadPdf');
  const shareUrlButton = $('#shareUrl');

  let currentResult = null;
  let toastTimer = null;

  function normalizeInput(value) {
    let text = String(value || '').trim();
    if (!text) return '';
    try {
      const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
      text = url.hostname;
    } catch {
      text = text.replace(/^https?:\/\//i, '').split('/')[0];
    }
    return text.replace(/^www\./i, '').replace(/\.$/, '').toLowerCase();
  }

  function formatDate(value) {
    if (!value) return '未提供';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
  }

  function relativeDays(value, mode = 'future') {
    if (!value) return 'Registry 未提供日期';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const days = Math.round((date.getTime() - today.getTime()) / 86400000);

    if (mode === 'age') {
      const years = Math.max(0, Math.floor((today.getTime() - date.getTime()) / 31557600000));
      return years > 0 ? `約 ${years} 年前建立` : '建立未滿 1 年';
    }
    if (days > 0) return `約 ${days.toLocaleString('zh-TW')} 天後到期`;
    if (days === 0) return '今天到期';
    return `已超過 ${Math.abs(days).toLocaleString('zh-TW')} 天`;
  }

  function escapeForCopy(value) {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  async function copyText(text, label = '已複製') {
    const value = String(text || '');
    try {
      await navigator.clipboard.writeText(value);
      showToast(label);
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      showToast(label);
    }
  }

  function showToast(message) {
    let toast = $('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
  }

  function showMessage(message, type = 'notice') {
    messageSection.hidden = false;
    messageSection.innerHTML = '';
    const box = document.createElement('div');
    box.className = `message-box${type === 'error' ? ' error' : ''}`;
    box.textContent = message;
    messageSection.appendChild(box);
    messageSection.animate?.([
      { opacity: 0, transform: 'translateY(-6px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 260, easing: 'ease-out' });
  }

  function hideMessage() {
    messageSection.hidden = true;
    messageSection.innerHTML = '';
  }

  function setLoading(loading) {
    lookupButton.disabled = loading;
    lookupButton.classList.toggle('is-loading', loading);
    input.disabled = loading;
  }

  function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value ?? '—';
  }

  function getResultUrl(domain = currentResult?.domain) {
    const url = new URL(window.location.href);
    url.search = '';
    if (domain) url.searchParams.set('domain', domain);
    return url.toString();
  }

  function renderNameservers(items = []) {
    const box = $('#nameserverList');
    box.innerHTML = '';
    if (!items.length) {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.textContent = '未提供 Nameserver';
      box.appendChild(row);
      return;
    }
    items.forEach((ns, index) => {
      const row = document.createElement('div');
      row.className = 'list-item';
      const code = document.createElement('code');
      code.textContent = ns;
      const tag = document.createElement('span');
      tag.textContent = `NS ${String(index + 1).padStart(2, '0')}`;
      row.append(code, tag);
      box.appendChild(row);
    });
  }

  function renderStatuses(items = []) {
    const box = $('#statusList');
    box.innerHTML = '';
    if (!items.length) {
      const pill = document.createElement('span');
      pill.className = 'status-pill';
      pill.textContent = 'Registry 未提供狀態';
      box.appendChild(pill);
      return;
    }
    items.forEach((status) => {
      const pill = document.createElement('span');
      pill.className = 'status-pill';
      pill.textContent = status.label || status.raw || status;
      if (status.raw && status.label && status.raw !== status.label) pill.title = status.raw;
      box.appendChild(pill);
    });
  }

  function renderDns(groups = {}) {
    const box = $('#dnsRecords');
    box.innerHTML = '';
    ['A', 'AAAA', 'MX', 'NS'].forEach((type) => {
      const group = document.createElement('div');
      group.className = 'dns-group';
      const typeEl = document.createElement('span');
      typeEl.className = 'dns-type';
      typeEl.textContent = type;
      const values = document.createElement('div');
      values.className = 'dns-values';
      const records = Array.isArray(groups[type]) ? groups[type] : [];
      if (!records.length) {
        const empty = document.createElement('div');
        empty.className = 'dns-empty';
        empty.textContent = '查無記錄';
        values.appendChild(empty);
      } else {
        records.slice(0, 8).forEach((record) => {
          const value = document.createElement('div');
          value.className = 'dns-value';
          value.textContent = record;
          values.appendChild(value);
        });
      }
      group.append(typeEl, values);
      box.appendChild(group);
    });
  }

  function renderResult(data) {
    currentResult = data;
    hideMessage();
    resultSection.hidden = false;
    resultSection.classList.remove('is-visible');

    const domain = data.domain || '—';
    setText('#resultDomain', domain);
    setText('#sourceBadge', data.source === 'rdap' ? 'RDAP' : (data.source || 'LOOKUP').toUpperCase());

    const panel = $('#statusPanel');
    panel.classList.remove('available', 'unknown');

    if (data.registered === true) {
      setText('#statusBadge', '已註冊');
      setText('#statusTitle', '此網域已有註冊紀錄');
      setText('#statusDescription', '以下資訊由 Registry / Registrar 的 RDAP 資料與公開 DNS 記錄整理。');
      registeredContent.hidden = false;
    } else if (data.registered === false) {
      panel.classList.add('available');
      setText('#statusBadge', '查無註冊');
      setText('#statusTitle', '目前查無此網域的註冊紀錄');
      setText('#statusDescription', '此結果通常代表網域可能尚未註冊；是否能實際購買仍需以網域註冊商的即時結果為準。');
      registeredContent.hidden = true;
    } else {
      panel.classList.add('unknown');
      setText('#statusBadge', '無法確認');
      setText('#statusTitle', '目前無法確認註冊狀態');
      setText('#statusDescription', data.message || 'Registry 暫時無法回應，請稍後再試。');
      registeredContent.hidden = true;
    }

    setText('#registrar', data.registrar?.name || '未提供');
    setText('#registrarId', data.registrar?.ianaId ? `IANA ID ${data.registrar.ianaId}` : '未提供 IANA Registrar ID');
    setText('#registeredAt', formatDate(data.dates?.registration));
    setText('#domainAge', relativeDays(data.dates?.registration, 'age'));
    setText('#expiresAt', formatDate(data.dates?.expiration));
    setText('#expiryHint', relativeDays(data.dates?.expiration));
    setText('#updatedAt', formatDate(data.dates?.updated));
    setText('#dnssec', data.dnssec === true ? '已簽署' : data.dnssec === false ? '未簽署 / 未提供' : '未提供');
    setText('#cloudflareDns', data.cloudflareDns ? '是' : '否 / 無法判斷');
    setText('#rdapHost', data.rdapHost || '未提供');

    renderNameservers(data.nameservers || []);
    renderStatuses(data.statuses || []);
    renderDns(data.dns || {});
    setText('#rawJson', JSON.stringify(data.raw || data, null, 2));

    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('domain', domain);
    history.replaceState(null, '', url);
    saveHistory(domain);
    renderHistory();

    requestAnimationFrame(() => {
      resultSection.classList.add('is-visible');
      setTimeout(() => resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    });
  }

  async function lookup(domainValue) {
    const domain = normalizeInput(domainValue);
    input.value = domain;
    clearInput.hidden = !domain;

    if (!domain || !domain.includes('.')) {
      resultSection.hidden = true;
      showMessage('請輸入完整網域，例如 wumetax.com。', 'error');
      return;
    }

    setLoading(true);
    hideMessage();
    try {
      const response = await fetch(`/api/domain?domain=${encodeURIComponent(domain)}`, {
        headers: { Accept: 'application/json' }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && typeof data.registered === 'undefined') {
        throw new Error(data.message || `查詢失敗（HTTP ${response.status}）`);
      }
      renderResult(data);
    } catch (error) {
      resultSection.hidden = true;
      showMessage(error?.message || '查詢失敗，請稍後再試。', 'error');
    } finally {
      setLoading(false);
      if (window.innerWidth > 720) input.focus({ preventScroll: true });
    }
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  }

  function saveHistory(domain) {
    if (!domain) return;
    const next = [domain, ...getHistory().filter((item) => item !== domain)].slice(0, 8);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  function renderHistory() {
    const items = getHistory();
    historyList.innerHTML = '';
    historyEmpty.hidden = items.length > 0;
    items.forEach((domain) => {
      const button = document.createElement('button');
      button.className = 'history-item';
      button.type = 'button';
      button.textContent = domain;
      button.addEventListener('click', () => lookup(domain));
      historyList.appendChild(button);
    });
  }

  function openShareDialog() {
    if (!currentResult?.domain) return;
    shareUrlPreview.textContent = getResultUrl();
    if (typeof shareDialog.showModal === 'function') shareDialog.showModal();
    else copyText(getResultUrl(), '查詢網址已複製');
  }

  async function shareResultUrl() {
    if (!currentResult?.domain) return;
    const url = getResultUrl();
    const title = `${currentResult.domain} 網域查詢｜WUMETAX`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${currentResult.domain} 網域查詢結果`, url });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await copyText(url, '查詢網址已複製');
  }

  async function exportPdf() {
    if (!currentResult?.domain) return;
    const originalLabel = downloadPdfButton.querySelector('strong')?.textContent || '產出 PDF';
    const strong = downloadPdfButton.querySelector('strong');
    if (strong) strong.textContent = 'PDF 產生中…';
    downloadPdfButton.disabled = true;

    const clone = resultSection.cloneNode(true);
    clone.removeAttribute('hidden');
    clone.classList.add('pdf-export', 'is-visible');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    clone.querySelectorAll('button,.result-actions,.raw-details').forEach((node) => node.remove());
    clone.style.position = 'fixed';
    clone.style.left = '-10000px';
    clone.style.top = '0';
    clone.style.zIndex = '-1';
    document.body.appendChild(clone);

    try {
      if (typeof window.html2pdf === 'function') {
        await window.html2pdf().set({
          margin: [8, 8, 8, 8],
          filename: `WUMETAX-${currentResult.domain}-domain-report.pdf`,
          image: { type: 'jpeg', quality: 0.96 },
          html2canvas: { scale: 1.65, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        }).from(clone).save();
        showToast('PDF 已產出');
      } else {
        showToast('PDF 元件載入失敗，改用列印功能');
        window.print();
      }
    } catch (error) {
      console.error(error);
      showToast('PDF 產生失敗，請稍後再試');
    } finally {
      clone.remove();
      downloadPdfButton.disabled = false;
      if (strong) strong.textContent = originalLabel;
    }
  }

  function setupReveal() {
    const targets = $$('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => observer.observe(el));
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    lookup(input.value);
  });

  input.addEventListener('input', () => { clearInput.hidden = input.value.trim().length === 0; });
  clearInput.addEventListener('click', () => {
    input.value = '';
    clearInput.hidden = true;
    input.focus();
  });

  $$('#lookupForm, body').forEach(() => {});
  $$('[data-domain]').forEach((button) => button.addEventListener('click', () => lookup(button.dataset.domain)));

  $('#copyDomain').addEventListener('click', () => currentResult?.domain && copyText(currentResult.domain, '網域已複製'));
  $('#copyNs').addEventListener('click', () => {
    const list = currentResult?.nameservers || [];
    if (list.length) copyText(list.join('\n'), 'Nameserver 已複製');
    else showToast('目前沒有 Nameserver 可複製');
  });
  $('#copyRaw').addEventListener('click', () => currentResult && copyText(escapeForCopy(currentResult.raw || currentResult), 'JSON 已複製'));
  $('#shareResult').addEventListener('click', openShareDialog);
  shareUrlButton.addEventListener('click', shareResultUrl);
  downloadPdfButton.addEventListener('click', exportPdf);

  $('#clearHistory').addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    showToast('查詢紀錄已清除');
  });

  shareDialog.addEventListener('click', (event) => {
    const rect = shareDialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) shareDialog.close();
  });

  renderHistory();
  setupReveal();

  const preset = new URLSearchParams(window.location.search).get('domain');
  if (preset) {
    input.value = preset;
    clearInput.hidden = false;
    lookup(preset);
  }
})();
