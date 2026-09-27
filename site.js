/* Site behaviour: the two shader bands, and the accordion. */
(function(){
  "use strict";

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = reduced ? 0 : 620;                 // matches --dur in site.css
  const ease = function(t){                      // quart in-out, matches --ease
    return t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t + 2, 4) / 2;
  };

  /* ---------------- shader bands ---------------- */
  // The footer band is much shorter than the header, so filling it would squash
  // the field. It is composed for the header's proportions and crops to fit,
  // read live so the two stay matched as the viewport changes.
  const heroAspect = function(){
    const r = document.getElementById('hero').getBoundingClientRect();
    return r.height > 0 ? r.width / r.height : 0;
  };

  [['gl-hero','hero',null], ['gl-outro','outro',{aspect:heroAspect}]].forEach(function(pair){
    const canvas = document.getElementById(pair[0]);
    const band = document.getElementById(pair[1]);
    if(!canvas || !band) return;
    const field = window.DispersionField &&
                  window.DispersionField.create(canvas, band, pair[2]);
    if(!field){ band.classList.add('no-webgl'); return; }
    // only the band you can see keeps its loop running
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(entries){
        entries.forEach(function(e){ field.setActive(e.isIntersecting); });
      }, {rootMargin:'120px'}).observe(band);
    }
  });

  /* ---------------- accordion ---------------- */
  const panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));

  function headOf(p){ return p.querySelector('.panel-head'); }
  function clipOf(p){ return p.querySelector('.panel-body > .clip'); }
  function openHeight(p){
    const c = clipOf(p);
    return c ? c.getBoundingClientRect().height : 0;
  }
  function docTop(el){ return el.getBoundingClientRect().top + window.scrollY; }

  let scrollToken = 0;
  function tweenScrollTo(y){
    const token = ++scrollToken;
    const from = window.scrollY;
    if(DUR === 0){ window.scrollTo(0, Math.max(0, y)); return; }
    const t0 = performance.now();
    (function step(now){
      if(token !== scrollToken) return;            // a newer tween took over
      const t = Math.min(1, (now - t0) / DUR);
      // The document is shrinking and growing underneath us while the panels
      // animate, so the reachable maximum is recomputed every frame rather than
      // clamped once up front.
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const to = Math.max(0, Math.min(y, max));
      window.scrollTo(0, from + (to - from) * ease(t));
      if(t < 1) requestAnimationFrame(step);
    })(t0);
  }

  // The softening mask is only wanted while the panel is actually moving. A
  // timer rather than transitionend: that event can fire more than once, or not
  // at all if a second click interrupts the first.
  function markMoving(panel){
    panel.classList.add('is-moving');
    clearTimeout(panel._moveTimer);
    panel._moveTimer = setTimeout(function(){
      panel.classList.remove('is-moving');
    }, DUR + 40);
  }

  function setOpen(panel, open){
    panel.classList.toggle('is-open', open);
    headOf(panel).setAttribute('aria-expanded', String(open));
    markMoving(panel);
  }

  function activate(panel){
    const current = panels.find(function(p){ return p.classList.contains('is-open'); });

    if(current === panel){            // clicking the open one closes it
      setOpen(panel, false);
      return;
    }

    // Where this panel will sit once the one above it has finished closing.
    // Measured before anything moves, because both animate together.
    let target = docTop(panel);
    if(current && panels.indexOf(current) < panels.indexOf(panel)){
      target -= openHeight(current);
    }

    if(current) setOpen(current, false);
    setOpen(panel, true);
    tweenScrollTo(target);
  }

  panels.forEach(function(panel){
    headOf(panel).addEventListener('click', function(){ activate(panel); });
  });

  // a manual scroll should win over an in-flight tween
  ['wheel','touchstart','keydown'].forEach(function(type){
    window.addEventListener(type, function(){ scrollToken++; }, {passive:true});
  });
})();
