// Free-tools page: each tool's stage replays the tool once when it comes into view, and again on hover or focus.
// Without this file, or with reduced motion: the stages show their finished state.
(function () {
  var list = document.querySelector('.tool-rows');
  if (!list || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var rows = Array.prototype.slice.call(list.querySelectorAll('.tool-row')).filter(function (r) {
    return r.querySelector('.tw-screen');
  });
  if (!rows.length) return;
  list.classList.add('is-live');

  var play = function (row) {
    var now = Date.now();
    if (now - (Number(row.dataset.played) || 0) < 3000) return;   // let a replay finish before starting another
    row.dataset.played = String(now);
    row.classList.remove('is-play');
    void row.offsetWidth;   // restart the CSS animations
    row.classList.add('is-play');
  };
  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      play(e.target);
      seen.unobserve(e.target);
    });
  }, { threshold: 0.3 });
  rows.forEach(function (row) {
    seen.observe(row);
    var stage = row.querySelector('.tw-screen');
    stage.addEventListener('mouseenter', function () { play(row); });
    row.addEventListener('focusin', function () { play(row); });
  });
})();
