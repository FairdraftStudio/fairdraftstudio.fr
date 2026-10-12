// Routes (offers page, À propos career line): the orange line follows the scroll down each route, each stop lights up
// when the line reaches it and plays its entrance once (the offer's before → after, the career card sliding in).
// Without this file, or with reduced motion: everything lit and shown.
(function () {
  var routes = Array.prototype.slice.call(document.querySelectorAll('.route'));
  if (!routes.length || !('requestAnimationFrame' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var all = routes.map(function (route) {
    route.classList.add('is-live');
    return { route: route, stops: Array.prototype.slice.call(route.querySelectorAll('.stop')) };
  });

  var update = function () {
    var h = window.innerHeight;
    var line = h * 0.55;   // the "reading line": a little below the middle of the screen
    all.forEach(function (r) {
      var box = r.route.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (line - box.top) / box.height));
      r.route.style.setProperty('--p', p.toFixed(4));
      r.stops.forEach(function (stop) {
        var top = stop.getBoundingClientRect().top;
        stop.classList.toggle('is-on', top < line);
        // play once, as soon as the stop is well inside the screen (or already passed, after a jump to an anchor)
        if (top < h * 0.75) stop.classList.add('is-played');
      });
    });
  };
  var waiting = false;
  var queue = function () {
    if (waiting) return;
    waiting = true;
    window.requestAnimationFrame(function () { waiting = false; update(); });
  };
  update();
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('load', queue);
})();
