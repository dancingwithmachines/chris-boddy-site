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
  // A closing panel does not only lose its body: the introduction head grows
  // back from the collapsed measure to its full height as the title returns.
  // That has to be in the arithmetic below, or the scroll lands short and the
  // copy appears to jump.
  //
  // Taking the reading means briefly putting the panel in its closed state,
  // which would collapse its body. If that leaves the document shorter than
  // the current scroll position the browser clamps the scroll to fit, and
  // restoring the panel does not give those pixels back — the page lurches.
  // So the body is held at its present height for the reading, and the scroll
  // put back afterwards in case anything moved it anyway. Both happen inside
  // one task with transitions off, so no frame is ever painted mid-measure.
  const headCache = new WeakMap();
  function closedHeadHeight(p){
    const head = headOf(p);
    if(!p.classList.contains('is-open')) return head.getBoundingClientRect().height;

    const cached = headCache.get(p);
    if(cached && cached.width === window.innerWidth) return cached.height;

    const body = p.querySelector('.panel-body');
    const held = body.getBoundingClientRect().height;
    const scroll = window.scrollY;

    document.body.classList.add('measuring');
    body.style.height = held + 'px';
    p.classList.remove('is-open');

    const h = head.getBoundingClientRect().height;

    p.classList.add('is-open');
    body.style.height = '';
    if(window.scrollY !== scroll) window.scrollTo(0, scroll);
    void head.offsetHeight;
    document.body.classList.remove('measuring');

    headCache.set(p, {width: window.innerWidth, height: h});
    return h;
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
      target += closedHeadHeight(current) - headOf(current).getBoundingClientRect().height;
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

/* ---------------------------------------------------------------------------
   Layout toggle — TEMPORARY, pairs with the [data-align] block in site.css.
   Centred is the default; the choice sticks across reloads, and ?align=left
   (or ?align=center) forces one so a link shows a specific version.
   Delete this IIFE and that CSS block together once a direction is chosen.
   --------------------------------------------------------------------------- */
(function(){
  "use strict";
  const root = document.documentElement;
  const KEY = 'cb-align';

  const btn = document.createElement('button');
  btn.className = 'align-toggle';
  btn.type = 'button';

  function apply(v){
    const left = v === 'left';
    root.dataset.align = left ? 'left' : 'center';
    btn.textContent = left ? 'Left aligned' : 'Centred';
    btn.setAttribute('aria-label', 'Layout: ' + btn.textContent + '. Click to switch.');
    try{ localStorage.setItem(KEY, root.dataset.align); }catch(e){}
  }

  btn.addEventListener('click', function(){
    apply(root.dataset.align === 'left' ? 'center' : 'left');
  });
  // "l" toggles too, for flipping back and forth without moving the cursor
  document.addEventListener('keydown', function(e){
    if(e.key === 'l' && !e.metaKey && !e.ctrlKey && !e.altKey &&
       !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)){
      apply(root.dataset.align === 'left' ? 'center' : 'left');
    }
  });

  document.body.appendChild(btn);

  let saved;
  try{ saved = localStorage.getItem(KEY); }catch(e){}
  apply(new URLSearchParams(location.search).get('align') || saved || 'center');
})();
