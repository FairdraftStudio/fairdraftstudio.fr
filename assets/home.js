// Suivel home: the task examples in the hero. The page reads fine without this file: the first example shows as it is.
(function () {
  var motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var en = document.documentElement.lang === 'en';

  // ---------- hero: pick a task, watch it go from before to after ----------
  var machine = document.querySelector('.machine');
  if (machine) {
    var tabs = Array.prototype.slice.call(machine.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    var pauseButton = machine.querySelector('.m-pause');
    var stage = machine.querySelector('.m-stage');
    var current = 0;
    var auto = false;      // examples play by themselves: one round, then they wait for the visitor
    var held = false;      // paused with the button
    var hovered = false;

    var play = function (panel) {
      if (!motionOk) return;
      panel.classList.remove('is-playing');
      void panel.offsetWidth;   // restart the CSS sequence
      panel.classList.add('is-playing');
    };
    var select = function (i, focus) {
      current = i;
      tabs.forEach(function (tab, k) {
        var on = k === i;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
        if (!on) panels[k].classList.remove('is-playing');
      });
      if (focus) tabs[i].focus();
      play(panels[i]);
    };
    var setPaused = function () {
      machine.classList.toggle('is-paused', auto && (held || hovered));
      if (pauseButton) pauseButton.textContent = held ? (en ? 'Play' : 'Lecture') : 'Pause';
    };
    var stopAuto = function () {
      auto = false;
      machine.classList.remove('is-auto', 'is-paused');
      if (pauseButton) pauseButton.hidden = true;
    };

    // The thin line on the current chip is a CSS animation: when it ends, the next task starts.
    // Pausing it (button or pointer over the examples) therefore pauses the round too.
    machine.addEventListener('animationend', function (e) {
      if (!auto || e.animationName !== 'm-progress') return;
      if (current === tabs.length - 1) { stopAuto(); return; }
      select(current + 1, false);
    });

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { stopAuto(); select(i, false); });
    });
    machine.querySelector('[role="tablist"]').addEventListener('keydown', function (e) {
      var next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      stopAuto();
      select((next + tabs.length) % tabs.length, true);
    });
    if (pauseButton) {
      pauseButton.addEventListener('click', function () { held = !held; setPaused(); });
    }
    if (stage) {
      stage.addEventListener('mouseenter', function () { hovered = true; setPaused(); });
      stage.addEventListener('mouseleave', function () { hovered = false; setPaused(); });
    }

    select(0, false);
    if (motionOk && tabs.length > 1) {
      auto = true;
      machine.classList.add('is-auto');
      if (pauseButton) pauseButton.hidden = false;
      setPaused();
    }
  }
})();
