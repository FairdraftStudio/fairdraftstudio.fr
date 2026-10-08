// E-invoicing checker. Everything runs in the browser: the answers are sent nowhere.
// Rules and sources: Brainstorm/docs/facture-electronique-sources.md (official pages read 2-4 Oct 2026).
(function () {
  var form = document.getElementById('fe-form');
  if (!form) return;
  var output = document.getElementById('fe-output');
  var status = document.getElementById('fe-status');
  var copyButton = document.getElementById('fe-copy');

  var PLATFORMS = 'https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees';
  var DISCOVER = 'https://www.impots.gouv.fr/professionnel/je-decouvre-la-facturation-electronique';
  var RECEIVE = '2026-09-01';
  var DATES = {
    '2026-09-01': { short: '1<sup>er</sup> sept. 2026', long: '1<sup>er</sup>&nbsp;septembre&nbsp;2026' },
    '2027-09-01': { short: '1<sup>er</sup> sept. 2027', long: '1<sup>er</sup>&nbsp;septembre&nbsp;2027' }
  };
  var lastText = '';

  var pick = function (name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  };
  var inForce = function (iso) { return new Date() >= new Date(iso + 'T00:00:00'); };
  var plain = function (html) { return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '); };

  function build() {
    var size = pick('taille'), clients = pick('clients'), vat = pick('tva'), sales = pick('ventes');
    var issue = size === 'eti' ? '2026-09-01' : '2027-09-01';
    var now = inForce(issue);
    var b2b = clients !== 'part', b2c = clients !== 'pro', goods = sales !== 'services', services = sales !== 'biens';
    var franchise = vat === 'franchise';
    var transmit = now ? 'vous transmettez' : 'vous transmettrez';

    var steps = [];
    steps.push({
      date: RECEIVE, title: 'Recevoir des factures électroniques',
      lines: [
        'Vous devez pouvoir recevoir sous forme électronique les factures des fournisseurs obligés de les émettre&nbsp;: les grandes entreprises et les ETI depuis le&nbsp;' + DATES['2026-09-01'].long + ', puis toutes les entreprises à partir du&nbsp;' + DATES['2027-09-01'].long + '.',
        'Pour recevoir comme pour émettre, il faut avoir choisi une plateforme agréée (<a href="' + PLATFORMS + '">liste officielle sur impots.gouv.fr</a>).'
      ]
    });
    if (b2b) {
      var issueLines = ['Vos factures à vos clients entreprises en France partent au format électronique (UBL, CII ou format mixte) par votre plateforme agréée. Un PDF envoyé par e-mail ' + (now ? 'n\'est plus' : 'ne sera plus') + ' conforme.'];
      if (!now) issueLines.push('D\'ici là, vous pouvez continuer à facturer comme aujourd\'hui, ou commencer plus tôt.');
      if (franchise) issueLines.push('Les entreprises en franchise en base de TVA sont concernées, avec le même calendrier.');
      steps.push({ date: issue, title: 'Émettre vos factures électroniques', lines: issueLines });
    }
    if (b2c) {
      var reportLines = ['Vos clients particuliers ne reçoivent pas de facture électronique, mais ' + transmit + ' les données de ces ventes à l\'administration par votre plateforme agréée&nbsp;: c\'est l\'e-reporting.'];
      if (franchise) reportLines.push('En franchise en base, vérifiez sur <a href="' + DISCOVER + '">impots.gouv.fr</a> ce que vous aurez à transmettre.');
      steps.push({ date: issue, title: 'Transmettre les données de vos ventes aux particuliers', lines: reportLines });
    }
    if (services && !franchise) {
      steps.push({
        date: issue, title: 'Transmettre vos données de paiement',
        lines: [
          'Quand la TVA est due à l\'encaissement, par exemple pour des prestations de services, ' + transmit + ' aussi à l\'administration les paiements reçus, par votre plateforme agréée&nbsp;: c\'est l\'e-reporting de paiement.',
          'Ce n\'est pas le cas si vous avez opté pour le paiement de la TVA d\'après les débits.'
        ]
      });
    }

    var category = sales === 'services' ? 'prestations de services'
      : sales === 'biens' ? 'livraisons de biens'
      : 'livraisons de biens, prestations de services ou les deux, selon la facture';
    var mentions = [];
    if (b2b) mentions.push('Le numéro SIREN de votre client entreprise');
    if (goods) mentions.push('L\'adresse de livraison des biens, si elle diffère de celle du client');
    mentions.push('La nature des opérations facturées&nbsp;: ' + category);
    if (services && !franchise) mentions.push('Si vous avez opté pour le paiement de la TVA d\'après les débits&nbsp;: «&nbsp;Option pour le paiement de la taxe d\'après les débits&nbsp;»');

    var todo = [];
    if (b2b && now) todo.push('Vous devez déjà émettre vos factures au format électronique&nbsp;: faites-en la priorité si ce n\'est pas encore en place.');
    todo.push('Si ce n\'est pas fait, choisissez dès maintenant votre plateforme agréée&nbsp;: vous devez pouvoir recevoir des factures électroniques depuis le&nbsp;' + DATES[RECEIVE].long + '. Si vous avez un logiciel de facturation, demandez d\'abord à son éditeur s\'il est relié à une plateforme agréée, comme le conseille impots.gouv.fr.');
    if (b2b) todo.push('Rassemblez le numéro SIREN de chacun de vos clients entreprises.');
    if (services && franchise) todo.push('Vérifiez sur <a href="' + DISCOVER + '">impots.gouv.fr</a> si vous aurez des données de paiement à transmettre.');
    todo.push('Mettez votre modèle de facture à jour avec les mentions ci-dessus' + (now ? ', si ce n\'est pas déjà fait.' : ' avant le&nbsp;' + DATES[issue].long + '.'));

    var html = '<ol class="fe-steps">' + steps.map(function (s) {
      var tag = inForce(s.date) ? '<span class="tag">En vigueur</span>' : '<span class="tag tag-next">À venir</span>';
      return '<li><p class="fe-when"><time datetime="' + s.date + '">' + DATES[s.date].short + '</time>' + tag + '</p>' +
        '<strong>' + s.title + '</strong>' + s.lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') + '</li>';
    }).join('') + '</ol>';
    html += '<div><h3>Sur vos factures à partir du&nbsp;' + DATES[issue].long + '</h3>' +
      '<p>La réforme ajoute quatre mentions. Celles qui vous concernent&nbsp;:</p>' +
      '<ul class="fe-list">' + mentions.map(function (m) { return '<li>' + m + '</li>'; }).join('') + '</ul>' +
      (franchise ? '<p>Votre mention «&nbsp;TVA non applicable, art.&nbsp;293&nbsp;B du CGI&nbsp;» reste sur vos factures.</p>' : '') + '</div>';
    html += '<div><h3>À faire dès maintenant</h3><ul class="fe-list fe-todo">' +
      todo.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>';
    html += '<p class="fe-note">Cas non traités ici&nbsp;: clients publics, clients à l\'étranger, activités exonérées de TVA, autoliquidation, acomptes, avoirs. Pour ces cas, demandez à votre expert-comptable.</p>';
    output.innerHTML = html;

    var text = ['Facture électronique : vos dates et votre liste', ''];
    steps.forEach(function (s) {
      text.push(plain(DATES[s.date].long) + ' (' + (inForce(s.date) ? 'en vigueur' : 'à venir') + ') : ' + s.title);
      s.lines.forEach(function (l) { text.push('  ' + plain(l)); });
    });
    text.push('', 'Sur vos factures à partir du ' + plain(DATES[issue].long) + ' :');
    mentions.forEach(function (m) { text.push('- ' + plain(m)); });
    if (franchise) text.push('- Votre mention « TVA non applicable, art. 293 B du CGI » reste.');
    text.push('', 'À faire :');
    todo.forEach(function (t) { text.push('- ' + plain(t)); });
    text.push('', 'Liste des plateformes agréées : ' + PLATFORMS,
      'Outil : https://suivel.fr/outils/facture-electronique/ (sources officielles lues en octobre 2026 ; première orientation, pas un conseil fiscal)');
    lastText = text.join('\n');
    status.textContent = '';
  }

  form.addEventListener('change', build);
  copyButton.addEventListener('click', function () {
    var done = function () { status.textContent = 'Liste copiée.'; };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(lastText).then(done, function () { status.textContent = 'La copie a échoué : sélectionnez le texte à la main.'; });
    } else {
      var area = document.createElement('textarea');
      area.value = lastText; document.body.appendChild(area); area.select();
      try { document.execCommand('copy'); done(); } catch (e) { status.textContent = 'La copie a échoué : sélectionnez le texte à la main.'; }
      document.body.removeChild(area);
    }
  });
  build();
})();
