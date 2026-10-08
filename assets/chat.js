/* Suivel: chat assistant widget, loaded by every page (build_site.py).
   On the live site it talks to the Worker at LIVE (set at the name switch, 7 Oct 2026). On the local preview it talks to the
   deployed Worker (add ?mock to the address for the local mock, worker/test/dev-server.js). The conversation lives
   in this page's memory only: no cookie and no browser storage. Answers are inserted as text nodes and links built
   by hand (never as HTML). */
(function () {
  'use strict';

  var LIVE = 'https://fairdraft-chat.fairdraft-chat.workers.dev/chat';   /* the Worker's /chat address for the live site */
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var ENDPOINT = window.FAIRDRAFT_CHAT_ENDPOINT || (LOCAL
    ? (/[?&]mock\b/.test(location.search) ? 'http://localhost:8787/chat' : 'https://fairdraft-chat.fairdraft-chat.workers.dev/chat')
    : LIVE);
  if (!ENDPOINT || document.getElementById('chat-assistant')) return;

  var LANG = (document.documentElement.lang || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr';
  var MAX_CHARS = 500;       /* same limits as the Worker (it enforces them) */
  var MAX_TURNS = 8;
  var MAX_ANSWER_CHARS = 4000;
  var TIMEOUT_MS = 40000;

  var T = {
    fr: {
      label: 'Assistant IA',
      panel: 'Assistant IA de Suivel',
      close: 'Fermer l’assistant',
      closeText: 'Fermer',
      reset: 'Nouvelle conversation',
      intro: 'Bonjour, je suis l’assistant IA de Suivel. Une question sur les offres, les prix ou les outils ?',
      input: 'Votre question',
      placeholder: 'Votre question…',
      send: 'Envoyer',
      fine: 'N’écrivez ni données personnelles ni données de vos clients.',
      pending: 'L’assistant rédige sa réponse…',
      you: 'Vous : ',
      bot: 'Assistant IA : ',
      limit: 'Cette conversation a atteint sa limite. Ouvrez une nouvelle conversation pour continuer, ou écrivez via la page Contact : https://suivel.fr/contact/',
      offline: 'Je n’arrive pas à joindre l’assistant. Vous pouvez écrire via la page Contact : https://suivel.fr/contact/',
      suggestions: ['Quelles offres et quels prix ?', 'Quels sont les délais ?', 'Comment vous contacter ?']
    },
    en: {
      label: 'AI assistant',
      panel: 'Suivel AI assistant',
      close: 'Close the assistant',
      closeText: 'Close',
      reset: 'New conversation',
      intro: 'Hello, I’m Suivel’s AI assistant. Any question about the offers, prices or tools?',
      input: 'Your question',
      placeholder: 'Your question…',
      send: 'Send',
      fine: 'Please don’t type personal data or your clients’ data.',
      pending: 'The assistant is writing its answer…',
      you: 'You: ',
      bot: 'AI assistant: ',
      limit: 'This conversation has reached its limit. Start a new conversation to continue, or write through the Contact page: https://suivel.fr/en/contact/',
      offline: 'I can’t reach the assistant right now. You can write through the Contact page: https://suivel.fr/en/contact/',
      suggestions: ['What do you offer, and at what price?', 'What are the delivery times?', 'How can I contact you?']
    }
  }[LANG];

  var history = [];   /* [{role:'user'|'assistant', content}], sent to the Worker on every question; kept nowhere else */
  var busy = false;
  var epoch = 0;              /* bumped by every new conversation, so a late answer to an old one is ignored */
  var currentController = null;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  /* ---------- structure ---------- */
  var root = el('div', 'chat');
  root.id = 'chat-assistant';

  var launch = el('button', 'chat-launch');
  launch.type = 'button';
  launch.setAttribute('aria-expanded', 'false');
  launch.setAttribute('aria-controls', 'chat-panel');
  var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  var bubble = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  bubble.setAttribute('d', 'M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4 3.5V17H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z');
  bubble.setAttribute('fill', 'currentColor');
  icon.appendChild(bubble);
  launch.appendChild(icon);
  launch.appendChild(el('span', '', T.label));

  var panel = el('section', 'chat-panel');
  panel.id = 'chat-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', T.panel);
  panel.hidden = true;

  /* Header: the title and two icon buttons (new conversation, close); their names are in aria-label and title. */
  function iconButton(name, d) {
    var b = el('button', 'chat-head-btn');
    b.type = 'button';
    b.setAttribute('aria-label', name);
    b.title = name;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2.2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    b.appendChild(svg);
    return b;
  }
  var head = el('header', 'chat-head');
  var title = el('p', 'chat-title', T.label);
  var resetBtn = iconButton(T.reset, 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5');
  var closeBtn = iconButton(T.close, 'M6 6l12 12M18 6L6 18');
  head.appendChild(title);
  head.appendChild(resetBtn);
  head.appendChild(closeBtn);

  var log = el('div', 'chat-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-relevant', 'additions');
  log.setAttribute('aria-label', T.label);
  log.tabIndex = 0;

  var suggest = el('div', 'chat-suggest');

  var form = el('form', 'chat-form');
  form.setAttribute('novalidate', '');
  var label = el('label', 'visually-hidden', T.input);
  label.htmlFor = 'chat-input';
  var input = el('textarea', 'chat-input');
  input.id = 'chat-input';
  input.rows = 2;
  input.maxLength = MAX_CHARS;
  input.placeholder = T.placeholder;
  input.setAttribute('autocomplete', 'off');
  var send = el('button', 'chat-send', T.send);
  send.type = 'submit';
  form.appendChild(label);
  form.appendChild(input);
  form.appendChild(send);

  var fine = el('p', 'chat-fine', T.fine);

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(suggest);
  panel.appendChild(form);
  panel.appendChild(fine);
  root.appendChild(launch);
  root.appendChild(panel);
  document.body.appendChild(root);

  /* ---------- text rendering (text nodes and links only) ---------- */
  var LINK = /https:\/\/suivel\.fr(\/[^\s<>"')\]]*)?|[A-Za-z0-9._%+-]+@suivel\.fr/g;

  function tidy(text) {
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '');
    if (LANG === 'fr') text = text.replace(/ ([:;?!»])/g, ' $1').replace(/« /g, '« ');
    return text;
  }

  function addRich(parent, text) {
    var pos = 0;
    var match;
    LINK.lastIndex = 0;
    while ((match = LINK.exec(text))) {
      var raw = match[0].replace(/[.,;:!?]+$/, '');
      if (match.index > pos) parent.appendChild(document.createTextNode(text.slice(pos, match.index)));
      var a = document.createElement('a');
      a.textContent = raw;
      a.href = raw.indexOf('https:') === 0 ? (raw.replace('https://suivel.fr', '') || '/') : 'mailto:' + raw;
      parent.appendChild(a);
      pos = match.index + raw.length;
      LINK.lastIndex = pos;
    }
    if (pos < text.length) parent.appendChild(document.createTextNode(text.slice(pos)));
  }

  function addMessage(who, text, kind) {
    var msg = el('div', 'chat-msg chat-msg-' + who + (kind ? ' chat-msg-' + kind : ''));
    msg.appendChild(el('span', 'visually-hidden', who === 'user' ? T.you : T.bot));
    tidy(text).split(/\n{2,}/).forEach(function (block) {
      var p = el('p');
      addRich(p, block.trim());
      msg.appendChild(p);
    });
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
    return msg;
  }

  /* ---------- behaviour ---------- */
  function userTurns() {
    return history.filter(function (m) { return m.role === 'user'; }).length;
  }

  function setBusy(on) {
    busy = on;
    send.disabled = on;
    input.disabled = on || userTurns() >= MAX_TURNS;
    panel.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function showSuggestions(on) {
    suggest.hidden = !on;
    if (on && !suggest.firstChild) {
      T.suggestions.forEach(function (q) {
        var b = el('button', 'chat-chip', q);
        b.type = 'button';
        b.addEventListener('click', function () { ask(q); });
        suggest.appendChild(b);
      });
    }
  }

  function reset() {
    epoch += 1;
    if (currentController) currentController.abort();
    history = [];
    log.textContent = '';
    addMessage('bot', T.intro, 'intro');
    input.value = '';
    setBusy(false);
    showSuggestions(true);
    input.focus();
  }

  function ask(text) {
    text = String(text || '').replace(/\s+$/, '').replace(/^\s+/, '');
    if (!text || busy) return;
    if (userTurns() >= MAX_TURNS) { addMessage('bot', T.limit, 'error'); return; }
    history.push({ role: 'user', content: text });
    addMessage('user', text);
    input.value = '';
    showSuggestions(false);
    setBusy(true);
    var pending = addMessage('bot', T.pending, 'pending');

    var mine = epoch;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    currentController = controller;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    function done() {
      if (timer) clearTimeout(timer);
      if (currentController === controller) currentController = null;
      if (pending.parentNode) pending.parentNode.removeChild(pending);
    }

    function fail(message) {
      if (mine !== epoch) { done(); return; }
      done();
      history.pop();               /* the question was not answered: keep the conversation valid and let the visitor retry */
      input.value = text;
      addMessage('bot', message, 'error');
      setBusy(false);
      input.focus();
    }

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, lang: LANG }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; });
    }).then(function (data) {
      if (mine !== epoch) { done(); return; }
      if (!data || !data.ok || typeof data.answer !== 'string') {
        fail(data && typeof data.message === 'string' ? data.message : T.offline);
        return;
      }
      done();
      var answer = data.answer.slice(0, MAX_ANSWER_CHARS);
      history.push({ role: 'assistant', content: answer });
      addMessage('bot', answer);
      if (userTurns() >= MAX_TURNS) addMessage('bot', T.limit, 'error');
      setBusy(false);
      if (!input.disabled) input.focus();
    }).catch(function () {
      fail(T.offline);
    });
  }

  function open() {
    panel.hidden = false;
    root.setAttribute('data-open', 'true');
    launch.setAttribute('aria-expanded', 'true');
    if (!log.firstChild) reset(); else input.focus();
  }

  function close() {
    panel.hidden = true;
    root.setAttribute('data-open', 'false');
    launch.setAttribute('aria-expanded', 'false');
    launch.focus();
  }

  launch.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  resetBtn.addEventListener('click', reset);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    ask(input.value);
  });
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      ask(input.value);
    }
  });
  panel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  });
})();
