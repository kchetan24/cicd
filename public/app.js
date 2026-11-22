'use strict';

const $ = (id) => document.getElementById(id);

function formatUptime(total) {
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (d ? d + 'd ' : '') + h + 'h ' + m + 'm ' + s + 's';
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed (' + res.status + ')');
  }
  return res.status === 204 ? null : res.json();
}

function setStatus(ok) {
  const badge = $('status-badge');
  badge.textContent = ok ? 'Healthy' : 'Unreachable';
  badge.className = 'px-3 py-1 rounded-full text-sm ' + (ok ? 'bg-emerald-500' : 'bg-red-500');
}

async function refreshHealth() {
  try {
    const [health, info] = await Promise.all([api('/health'), api('/api/info')]);
    setStatus(health.status === 'ok');
    $('uptime').textContent = formatUptime(health.uptimeSeconds);
    $('started').textContent = new Date(info.startedAt).toLocaleString();
    $('node').textContent = info.nodeVersion;
    $('version').textContent = info.version;
    $('commit').textContent = info.commit;
    $('build-time').textContent = info.buildTime;
    $('environment').textContent = info.environment;
    $('env').textContent = JSON.stringify(info.env, null, 2);
    $('last-check').textContent = new Date().toLocaleTimeString();
  } catch (_err) {
    setStatus(false);
  }
}

async function refreshCounter() {
  const data = await api('/api/counter');
  $('counter').textContent = data.value;
}

async function refreshMessages() {
  const messages = await api('/api/messages');
  const list = $('messages');
  list.replaceChildren();
  if (messages.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'text-sm text-slate-500';
    empty.textContent = 'No messages yet.';
    list.appendChild(empty);
    return;
  }
  for (const m of messages) {
    const li = document.createElement('li');
    li.className = 'border rounded p-2 text-sm flex justify-between gap-2';
    const body = document.createElement('div');
    const who = document.createElement('div');
    who.className = 'font-medium';
    who.textContent = m.author + ' · ' + new Date(m.createdAt).toLocaleString();
    const text = document.createElement('div');
    text.textContent = m.text; // textContent prevents XSS
    body.append(who, text);
    const del = document.createElement('button');
    del.className = 'text-red-600 hover:underline text-xs self-start';
    del.textContent = 'delete';
    del.addEventListener('click', async () => {
      await api('/api/messages/' + m.id, { method: 'DELETE' });
      refreshMessages();
    });
    li.append(body, del);
    list.appendChild(li);
  }
}

$('inc').addEventListener('click', async () => {
  const data = await api('/api/counter/increment', { method: 'POST' });
  $('counter').textContent = data.value;
});
$('reset').addEventListener('click', async () => {
  const data = await api('/api/counter/reset', { method: 'POST' });
  $('counter').textContent = data.value;
});
$('msg-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('form-error').textContent = '';
  try {
    await api('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: $('author').value, text: $('text').value }),
    });
    $('text').value = '';
    refreshMessages();
  } catch (err) {
    $('form-error').textContent = err.message;
  }
});

refreshHealth();
refreshCounter();
refreshMessages();
setInterval(refreshHealth, 5000);
