// Suivel: small enhancements only. The page works without this file.
(function () {
  var fr = document.documentElement.lang !== 'en';
  var TO = 'contact@suivel.fr';
  var T = fr ? {
    subject: 'Demande via suivel.fr',
    offer: 'Offre',
    none: 'Je ne sais pas encore',
    name: 'Nom', email: 'E-mail', phone: 'Téléphone', company: 'Entreprise',
    missing: 'Merci de remplir : ',
    fields: { nom: 'votre nom', email: 'votre e-mail', message: 'la tâche' },
    badEmail: "L'adresse e-mail semble incomplète.",
    opened: "Votre messagerie devrait s'ouvrir avec le message prêt à envoyer.",
    to: 'À', subj: 'Objet', copied: 'Message copié'
  } : {
    subject: 'Enquiry via suivel.fr',
    offer: 'Offer',
    none: 'Not sure yet',
    name: 'Name', email: 'Email', phone: 'Phone', company: 'Business',
    missing: 'Please fill in: ',
    fields: { nom: 'your name', email: 'your email', message: 'the task' },
    badEmail: 'The email address looks incomplete.',
    opened: 'Your email app should open with the message ready to send.',
    to: 'To', subj: 'Subject', copied: 'Message copied'
  };

  // Sections fade in as they come into view; the header tightens once you scroll
  var motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealed = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (!motionOk) {
    revealed.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    // Anything at or above the fold shows straight away, so a jump to an anchor
    // (or a deep link) can never leave a section stuck invisible.
    var check = function () {
      var fold = window.innerHeight * 0.92;
      revealed = revealed.filter(function (el) {
        if (el.getBoundingClientRect().top > fold) return true;
        el.classList.add('is-in');
        return false;
      });
      if (!revealed.length) {
        window.removeEventListener('scroll', queue);
        window.removeEventListener('resize', queue);
      }
    };
    var waiting = false;
    var queue = function () {
      if (waiting) return;
      waiting = true;
      window.requestAnimationFrame(function () { waiting = false; check(); });
    };
    check();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    window.addEventListener('load', queue);
  }

  var header = document.getElementById('top');
  if (header) {
    // the phone address bar follows the header: beige at the very top, teal once scrolled
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    var setStuck = function () {
      var stuck = window.scrollY > 12;
      header.classList.toggle('is-stuck', stuck);
      var colour = stuck ? '#0B3945' : '#EFE7DB';
      if (themeMeta && themeMeta.getAttribute('content') !== colour) themeMeta.setAttribute('content', colour);
    };
    setStuck();
    window.addEventListener('scroll', setStuck, { passive: true });
  }

  var menuButton = document.getElementById('menu-toggle');
  if (menuButton && header) {
    var setMenu = function (open) {
      header.classList.toggle('is-open', open);
      menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    menuButton.addEventListener('click', function () {
      setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMenu(false);
    });
    document.addEventListener('click', function (e) {
      if (!header.contains(e.target)) setMenu(false);
    });
  }

  var form = document.getElementById('contact-form');
  var select = document.getElementById('f-offer');

  // "Request this quote" buttons link to the contact page with ?offre=<value>; preselect it here
  if (select) {
    var wanted = new URLSearchParams(window.location.search).get('offre');
    if (wanted && Array.prototype.some.call(select.options, function (o) { return o.value === wanted; })) select.value = wanted;
  }

  if (!form) return;
  var status = form.querySelector('.form-status');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var get = function (n) { return (form.elements[n].value || '').trim(); };
    var missing = ['nom', 'email', 'message'].filter(function (n) { return !get(n); });
    if (missing.length) {
      status.textContent = T.missing + missing.map(function (n) { return T.fields[n]; }).join(', ') + '.';
      form.elements[missing[0]].focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get('email'))) {
      status.textContent = T.badEmail;
      form.elements.email.focus();
      return;
    }
    var sep = fr ? ' : ' : ': ';
    var lines = [
      get('message'),
      '',
      '---',
      T.offer + sep + (select.value ? select.options[select.selectedIndex].text : T.none),
      T.name + sep + get('nom'),
      T.email + sep + get('email')
    ];
    if (get('telephone')) lines.push(T.phone + sep + get('telephone'));
    if (get('entreprise')) lines.push(T.company + sep + get('entreprise'));
    var body = lines.join('\n');
    window.location.href = 'mailto:' + TO +
      '?subject=' + encodeURIComponent(T.subject) +
      '&body=' + encodeURIComponent(body);
    status.textContent = T.opened;

    // Webmail users often have no mail app set up: show the message ready to copy
    var fallback = form.querySelector('.form-fallback');
    if (fallback) {
      fallback.querySelector('textarea').value =
        T.to + sep + TO + '\n' + T.subj + sep + T.subject + '\n\n' + body;
      fallback.hidden = false;
    }
  });

  form.addEventListener('click', function (e) {
    var button = e.target.closest('[data-copy]');
    if (!button) return;
    var text = form.querySelector('.form-fallback textarea');
    var done = function () { button.textContent = T.copied; };
    var legacy = function () { text.select(); document.execCommand('copy'); done(); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text.value).then(done, legacy);
    } else {
      legacy();
    }
  });
})();
