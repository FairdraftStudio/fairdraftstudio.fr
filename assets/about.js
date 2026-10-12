// À propos: the four rules as a deck of cards. "Suivante" (or a tap on the top card, a swipe, the arrow keys) deals the
// top card off to the side and slides it under the pile; the arrow back brings the last card up again.
// Without this file: the four cards in a grid. Reduced motion: the cards change places without moving.
(function () {
  var deck = document.getElementById('deck');
  var nav = document.querySelector('.deck-nav');
  if (!deck || !nav) return;
  var cards = Array.prototype.slice.call(deck.querySelectorAll('.deck-card'));
  if (cards.length < 2) return;
  var now = nav.querySelector('.deck-now');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var order = cards.slice();   // order[0] is the card on top
  var busy = false;

  var place = function () {
    order.forEach(function (card, i) { card.dataset.pos = String(i); });
    now.textContent = String(cards.indexOf(order[0]) + 1);
  };
  var go = function (dir) {
    if (busy) return;
    var card = dir > 0 ? order.shift() : order.pop();
    if (dir > 0) order.push(card); else order.unshift(card);
    if (reduce) { place(); return; }
    busy = true;
    var done = function () {
      card.classList.remove('is-out', 'is-in');
      card.removeEventListener('animationend', done);
      busy = false;
    };
    card.addEventListener('animationend', done);
    window.setTimeout(function () { if (busy) done(); }, 1000);   // failsafe if no animation runs
    card.classList.add(dir > 0 ? 'is-out' : 'is-in');
    place();   // the other cards glide one step; the moving card follows its keyframes
  };

  deck.classList.add('is-live');
  nav.hidden = false;
  place();
  nav.querySelector('.deck-next').addEventListener('click', function () { go(1); });
  nav.querySelector('.deck-prev').addEventListener('click', function () { go(-1); });
  nav.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });
  // a tap on the top card, or a sideways swipe on the pile
  var startX = null;
  deck.addEventListener('pointerdown', function (e) { startX = e.clientX; });
  deck.addEventListener('pointerup', function (e) {
    if (startX === null) return;
    var dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    else if (e.target.closest('.deck-card[data-pos="0"]')) go(1);
  });
})();
