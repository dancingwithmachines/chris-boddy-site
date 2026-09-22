/* Tuner UI. The shader, its defaults and its ranges all live in field.js —
 * this file only builds controls over them. */
(function(){
  "use strict";

  const DF = window.DispersionField;
  const PARAMS = DF.PARAMS, DEFAULTS = DF.DEFAULTS;
  const STORE = 'dispersion-field-v6';

  const stage = document.getElementById('stage');
  const field = DF.create(document.getElementById('gl'), stage);
  if(!field){
    stage.insertAdjacentHTML('beforeend',
      '<p class="fail">This needs WebGL2, which this browser has turned off ' +
      'or does not support.</p>');
    return;
  }
  const state = field.state;

  /* ---------------- persistence ----------------
   * Saved settings carry the DEFAULTS they were built on. On load the two are
   * compared per key: a value you changed is kept, one whose default has moved
   * adopts the new default. Otherwise old saved state masks every later change
   * to DEFAULTS, which looks exactly like a failed deploy. */
  function save(){
    try{ localStorage.setItem(STORE, JSON.stringify({state:state, base:DEFAULTS})); }catch(e){}
  }
  try{
    const raw = localStorage.getItem(STORE);
    if(raw){
      const parsed = JSON.parse(raw);
      const saved = parsed && parsed.state ? parsed.state : parsed;
      const base  = parsed && parsed.base  ? parsed.base  : null;
      const range = {};
      PARAMS.forEach(function(q){ range[q.k] = q; });
      Object.keys(state).forEach(function(k){
        if(typeof saved[k] !== typeof state[k]) return;
        if(base && base[k] !== DEFAULTS[k]) return;
        let v = saved[k];
        if(typeof v === 'number'){
          if(!isFinite(v)) return;
          const q = range[k];
          if(q) v = Math.min(q.max, Math.max(q.min, v));
        }
        state[k] = v;
      });
    }
  }catch(e){}

  /* ---------------- controls ---------------- */
  const els = {};
  function format(p, v){ return v.toFixed(p.dp) + (p.unit || ''); }
  PARAMS.forEach(function(p){
    const row = document.createElement('div');
    row.className = 'row';
    const id = 'p-' + p.k;
    row.innerHTML =
      '<label for="' + id + '">' + p.label + '</label>' +
      '<input type="range" id="' + id + '" min="' + p.min + '" max="' + p.max +
      '" step="' + p.step + '">' +
      '<output for="' + id + '"></output>';
    const input = row.querySelector('input'), out = row.querySelector('output');
    input.addEventListener('input', function(){
      state[p.k] = parseFloat(input.value);
      out.textContent = format(p, state[p.k]);
      // refresh the GLSL export too — without this it kept whatever it was last
      // built with, so Copy GLSL could hand you stale values after a slider move
      syncChrome();
      save();
    });
    els[p.k] = {input:input, out:out, p:p};
    document.getElementById('g-' + p.group).appendChild(row);
  });

  const colA = document.getElementById('colA'),
        colB = document.getElementById('colB'),
        colCore = document.getElementById('colCore'),
        colBg = document.getElementById('colBg'),
        glslOut = document.getElementById('glslOut'),
        typeBlock = document.getElementById('typeBlock'),
        textBtn = document.getElementById('textBtn'),
        playBtn = document.getElementById('playBtn');

  [[colA,'a'],[colB,'b'],[colCore,'core'],[colBg,'bg']].forEach(function(pair){
    pair[0].addEventListener('input', function(){
      state[pair[1]] = pair[0].value; syncChrome(); save();
    });
  });

  textBtn.addEventListener('click', function(){
    state.text = !state.text; syncChrome(); save();
  });
  playBtn.addEventListener('click', function(){
    field.setPlaying(!field.playing);
    playBtn.textContent = field.playing ? 'Pause' : 'Play';
  });
  document.getElementById('shuffleBtn').addEventListener('click', function(){
    state.seed   = Math.random() * 400;
    state.angle  = Math.round(-80 + Math.random() * 160);
    state.scale  = +(0.9 + Math.random() * 3.0).toFixed(2);
    state.warp   = +(0.15 + Math.random() * 0.7).toFixed(2);
    state.disp   = +(0.06 + Math.random() * 0.25).toFixed(3);
    state.offset = +(-0.45 + Math.random() * 0.9).toFixed(2);
    syncAll(); save();
  });
  document.getElementById('resetBtn').addEventListener('click', function(){
    Object.keys(DEFAULTS).forEach(function(k){ state[k] = DEFAULTS[k]; });
    syncAll(); save();
  });

  document.getElementById('copyGlsl').addEventListener('click', function(){
    const btn = this, text = glslOut.textContent;
    function done(ok){
      btn.textContent = ok ? 'Copied' : 'Select and copy';
      if(!ok){
        const r = document.createRange();
        r.selectNodeContents(glslOut);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
      }
      setTimeout(function(){ btn.textContent = 'Copy GLSL'; }, 1800);
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ done(false); });
    } else done(false);
  });

  function syncAll(){
    PARAMS.forEach(function(p){
      const e = els[p.k];
      e.input.value = state[p.k];
      e.out.textContent = format(p, state[p.k]);
    });
    colA.value = state.a; colB.value = state.b;
    colCore.value = state.core; colBg.value = state.bg;
    syncChrome();
  }

  // everything that follows the chosen Ground: panel skin, stage, GLSL export
  function syncChrome(){
    const light = DF.luma(state.bg) > 0.42;
    document.documentElement.setAttribute('data-ui', light ? 'light' : 'dark');
    stage.style.background = state.bg;
    document.body.style.background = light ? '' : '';
    typeBlock.hidden = !state.text;
    textBtn.setAttribute('aria-pressed', String(state.text));
    textBtn.textContent = state.text ? 'Text' : 'Text off';
    glslOut.textContent = field.exportGLSL();
  }

  syncAll();
  if(!field.playing) playBtn.textContent = 'Play';
})();
