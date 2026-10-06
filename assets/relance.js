// Invoice reminder letter generator. Everything runs in the browser: what the visitor types is sent nowhere.
(function () {
  var form = document.getElementById('relance-form');
  if (!form) return;
  var output = document.getElementById('relance-output');
  var status = document.getElementById('relance-status');
  var copyButton = document.getElementById('relance-copy');
  var downloadLink = document.getElementById('relance-download');

  var euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  var frenchDate = function (d) {
    var text = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    return d.getDate() === 1 ? text.replace(/^1 /, '1er ') : text;   // "1er août", not "1 août"
  };
  var longDate = function (value) {
    var d = new Date(value + 'T12:00:00');
    if (isNaN(d)) return '';
    return frenchDate(d);
  };
  var daysBetween = function (from, to) {
    return Math.round((to - from) / 86400000);
  };
  var value = function (name) { return (form.elements[name].value || '').trim(); };

  function build() {
    var invoice = value('numero') || '[numéro de facture]';
    var sender = value('vous') || '[votre nom]';
    var city = value('ville') || '[votre ville]';
    var amountRaw = parseFloat(value('montant').replace(',', '.'));
    var amount = isNaN(amountRaw) ? '[montant]' : euros.format(amountRaw);
    var issued = longDate(value('emission')) || '[date de la facture]';
    var dueValue = value('echeance');
    var due = longDate(dueValue) || '[date d\'échéance]';
    var level = value('niveau');

    var today = new Date();
    today.setHours(12, 0, 0, 0);
    var late = dueValue ? daysBetween(new Date(dueValue + 'T12:00:00'), today) : null;
    var lateText = late && late > 0 ? ', soit ' + late + ' jour' + (late > 1 ? 's' : '') + ' de retard' : '';
    var hello = 'Bonjour,';
    var signature = sender + (value('entreprise') ? '\n' + value('entreprise') : '');
    var recipient = value('client') ? 'Destinataire : ' + value('client') + '\n' : '';   // formal letter only (address block)

    if (level === '1') {
      return 'Objet : Facture ' + invoice + ' — rappel\n\n' + hello + '\n\n' +
        'Sauf erreur de ma part, la facture ' + invoice + ' du ' + issued + ', d\'un montant de ' + amount +
        ', arrivée à échéance le ' + due + ', n\'a pas encore été réglée.\n\n' +
        'Il s\'agit sans doute d\'un oubli : je vous remets la facture en pièce jointe.\n\n' +
        'Si le règlement a déjà été fait, merci de ne pas tenir compte de ce message.\n\n' +
        'Bien à vous,\n' + signature;
    }

    if (level === '2') {
      return 'Objet : Facture ' + invoice + ' — relance\n\n' + hello + '\n\n' +
        'Je reviens vers vous au sujet de la facture ' + invoice + ' du ' + issued + ', d\'un montant de ' + amount +
        ', échue le ' + due + lateText + '.\n\n' +
        'À ce jour, je n\'ai pas reçu votre règlement. Merci de procéder au paiement sous huit jours, ou de m\'indiquer une date à laquelle il sera fait.\n\n' +
        'Je vous rappelle qu\'entre professionnels, tout retard de paiement fait courir des pénalités de retard et une indemnité forfaitaire de 40 € pour frais de recouvrement (articles L441-10 et D441-5 du Code de commerce).\n\n' +
        'Bien à vous,\n' + signature;
    }

    return 'Objet : Mise en demeure de payer — facture ' + invoice + '\n\n' +
      city + ', le ' + frenchDate(today) + '\n' +
      'Lettre recommandée avec accusé de réception\n' + recipient + '\n' +
      'Madame, Monsieur,\n\n' +
      'Malgré mes relances, la facture ' + invoice + ' du ' + issued + ', d\'un montant de ' + amount +
      ', échue le ' + due + lateText + ', reste impayée à ce jour.\n\n' +
      'Par la présente, je vous mets en demeure de régler la somme de ' + amount +
      ' sous huit jours à compter de la réception de ce courrier.\n\n' +
      'À défaut de paiement dans ce délai, je me réserve le droit d\'engager une procédure de recouvrement, y compris une requête en injonction de payer, et de réclamer les pénalités de retard ainsi que l\'indemnité forfaitaire de 40 € pour frais de recouvrement prévues par les articles L441-10 et D441-5 du Code de commerce.\n\n' +
      'Si vous rencontrez une difficulté de trésorerie, écrivez-moi : un échéancier est toujours préférable à une procédure.\n\n' +
      'Veuillez agréer, Madame, Monsieur, mes salutations distinguées.\n\n' + signature;
  }

  function refresh() {
    var text = build();
    output.value = text;
    if (downloadLink) {
      if (downloadLink.dataset.url) URL.revokeObjectURL(downloadLink.dataset.url);
      var url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      downloadLink.href = url;
      downloadLink.dataset.url = url;
      downloadLink.download = 'relance-' + (value('numero') || 'facture').replace(/[^\w.-]+/g, '-') + '.txt';
    }
    if (status) status.textContent = '';
  }

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', function (e) { e.preventDefault(); refresh(); });

  if (copyButton) {
    copyButton.addEventListener('click', function () {
      var done = function () { status.textContent = 'Lettre copiée. Collez-la dans votre e-mail ou votre traitement de texte.'; };
      var legacy = function () { output.select(); document.execCommand('copy'); done(); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(output.value).then(done, legacy);
      } else {
        legacy();
      }
    });
  }

  refresh();
})();
