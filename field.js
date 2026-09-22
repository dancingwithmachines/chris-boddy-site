/* Dispersion field — shared renderer.
 *
 * One source of truth for the shader, its defaults and its parameter ranges.
 * index.html renders it; tuner.html renders it and exposes the controls. Tuned
 * values only ever need changing here.
 */
window.DispersionField = (function(){
  "use strict";

  const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;

// ---- tunables ----
uniform float uSeed;
uniform vec3  uHsvA;   // cool end of the dispersed spectrum
uniform vec3  uHsvB;   // warm end
uniform vec3  uCore;
uniform vec3  uBg;
uniform float uAngle, uScale, uStretch, uWarp, uOffset;
uniform float uDetail, uRough, uShape, uChroma;
uniform float uSoft, uDisp, uCoreMix, uIntensity;
// ---- end tunables ----

const int NS = 8;      // wavelengths sampled across the spectrum

vec3 hsv2rgb(vec3 c){
  vec3 k = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(k - 1.0, 0.0, 1.0), c.y);
}

// 0 at the warm end of the spectrum, 1 at the cool end
vec3 spectralRGB(float u){
  vec3 hsv = mix(uHsvB, uHsvA, u);
  return hsv2rgb(vec3(fract(hsv.x), hsv.y, hsv.z));
}

// Iterative sine warp: each pass bends x by a sine of y and y by a cosine of x,
// at rising frequency and falling amplitude. Entirely analytic — no noise — which
// is where the long, smooth, folding curves come from.
vec2 distort(vec2 p, float offset, int iters, float t){
  p += offset;
  for(int i = 1; i <= 5; i++){
    if(i > iters) break;
    float fi = float(i);
    float a  = uWarp / pow(fi, uRough);
    p.x += a * sin(fi * uScale * p.y + t);
    p.y += a * cos(fi * uScale * p.x + t);
  }
  return p;
}

vec4 shade(vec2 frag){
  vec2 uv = frag / uRes;

  vec2 q = uv - 0.5;
  float ca = cos(uAngle), sa = sin(uAngle);
  q = mat2(ca, -sa, sa, ca) * q;
  q.x *= uStretch;
  vec2 p = q + 0.5 + vec2(uOffset, 0.0) + uSeed;

  float t = uTime;
  int iters = int(uDetail + 0.5);

  // The pattern is a periodic stripe field read out of the warped coordinate.
  // Each wavelength enters the warp a little further along, so the same field is
  // sampled at a slightly different place — that is what pulls them apart, and
  // the separation varies across the frame instead of running one direction.
  vec3  col = vec3(0.0), wsum = vec3(0.0);
  for(int i = 0; i < NS; i++){
    float u = float(i) / float(NS - 1);
    float v = sin(distort(p, (u - 0.5) * uDisp, iters, t).x * uSoft) * 0.5 + 0.5;
    vec3  sw = spectralRGB(u);
    col  += sw * v;
    wsum += sw;
  }

  // How to normalise depends on the spectrum the user picked. Dividing per
  // channel makes a full spectrum's overlap cancel to neutral — but applied to a
  // narrow range (say green to blue) it hauls the missing channel up and washes
  // the whole thing grey. So lean on it only as far as the weights are already
  // balanced, which is exactly when it is a small correction.
  float meanw = (wsum.r + wsum.g + wsum.b) / 3.0;
  float mxw = max(wsum.r, max(wsum.g, wsum.b));
  float mnw = min(wsum.r, min(wsum.g, wsum.b));
  float balance = mnw / max(mxw, 1e-4);          // 1 = the span already sums neutral
  vec3  norm = mix(vec3(meanw), wsum, balance * 0.7);
  col /= max(norm, vec3(max(meanw, 1e-4) * 0.25));
  col = pow(clamp(col * uIntensity, 0.0, 1.0), vec3(uShape));
  float grey = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = clamp(mix(vec3(grey), col, uChroma), 0.0, 1.0);

  // Core bias tints only the neutral overlap
  float mnc = min(col.r, min(col.g, col.b));
  float mxc = max(col.r, max(col.g, col.b));
  col = mix(col, uCore * mxc, uCoreMix * mnc);

  // Ground is the colour the field falls back to where it goes dark. Blending a
  // fixed 15% meant the troughs were black whatever Ground was set to, so the
  // picker did nothing.
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  vec3 c = mix(uBg, col / max(a, 1e-4), a);

  float bgl = dot(uBg, vec3(0.2126, 0.7152, 0.0722));
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float cover = clamp(abs(lum - bgl) / max(max(bgl, 1.0 - bgl), 1e-3), 0.0, 1.0);

  return vec4(clamp(c, 0.0, 1.0), cover);
}

void main(){
  fragColor = vec4(shade(gl_FragCoord.xy).rgb, 1.0);
}`;

  const DEFAULTS = {
    a:'#6a3cff', core:'#ffffff', b:'#4dd2ff', bg:'#e3e3e3',
    scale:3.62, stretch:1.00, angle:0, offset:0.50,
    detail:3, rough:1.10, warp:0.41,
    soft:11.0, disp:0.260, chroma:0.80, shape:0.85, coreMix:0.00, intensity:0.75,
    speed:0.60, seed:161.91636, text:true
  };

  const PARAMS = [
    {k:'scale',     label:'Scale',      min:0.5,  max:12,   step:0.01,  dp:2, group:'form'},
    {k:'stretch',   label:'Stretch',    min:0.2,  max:3,    step:0.01,  dp:2, group:'form'},
    {k:'angle',     label:'Angle',      min:-90,  max:90,   step:1,     dp:0, group:'form', unit:'\u00B0'},
    {k:'offset',    label:'Offset',     min:-1.5, max:1.5,  step:0.01,  dp:2, group:'form'},
    {k:'detail',    label:'Folds',      min:1,    max:5,    step:1,     dp:0, group:'field'},
    {k:'rough',     label:'Falloff',    min:0.3,  max:2.5,  step:0.01,  dp:2, group:'field'},
    {k:'warp',      label:'Warp',       min:0,    max:1.2,  step:0.01,  dp:2, group:'field'},
    {k:'soft',      label:'Frequency',  min:1,    max:40,   step:0.1,   dp:1, group:'light'},
    {k:'disp',      label:'Dispersion', min:0,    max:0.35, step:0.001, dp:3, group:'light'},
    {k:'chroma',    label:'Chroma',     min:0,    max:1.5,  step:0.01,  dp:2, group:'light'},
    {k:'shape',     label:'Shape',      min:0.3,  max:3,    step:0.01,  dp:2, group:'light'},
    {k:'coreMix',   label:'Core bias',  min:0,    max:1,    step:0.01,  dp:2, group:'light'},
    {k:'intensity', label:'Intensity',  min:0.2,  max:2.5,  step:0.01,  dp:2, group:'light'},
    {k:'speed',     label:'Flow',       min:0,    max:3,    step:0.01,  dp:2, group:'motion'}
  ];

  const UNIFORMS = ['uRes','uTime','uSeed','uHsvA','uHsvB','uCore','uBg','uAngle',
    'uScale','uStretch','uWarp','uOffset','uDetail','uRough','uShape','uChroma',
    'uSoft','uDisp','uCoreMix','uIntensity'];

  function hexToRgb(hex){
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function rgbToHsv(r, g, b){
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if(d > 1e-6){
      if(mx === r) h = ((g - b) / d) % 6;
      else if(mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
      if(h < 0) h += 1;
    }
    return [h, mx > 0 ? d / mx : 0, mx];
  }
  // The sweep always descends the colour wheel, the way a real spectrum runs,
  // so the warm end is unwrapped below the cool one.
  function hueEnds(hexA, hexB){
    const A = rgbToHsv.apply(null, hexToRgb(hexA));
    const B = rgbToHsv.apply(null, hexToRgb(hexB));
    let hb = B[0];
    while(hb > A[0]) hb -= 1;
    if(A[0] - hb > 0.995) hb += 1;
    return [A, [hb, B[1], B[2]]];
  }
  function luma(hex){
    const c = hexToRgb(hex);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function create(canvas, host){
    const gl = canvas.getContext('webgl2', {antialias:false, alpha:false,
                                            powerPreference:'high-performance'});
    if(!gl) return null;

    function compile(type, srcText){
      const sh = gl.createShader(type);
      gl.shaderSource(sh, srcText);
      gl.compileShader(sh);
      if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindVertexArray(gl.createVertexArray());

    const U = {};
    UNIFORMS.forEach(function(n){ U[n] = gl.getUniformLocation(prog, n); });

    const MAX_PX = 2.2e6;
    let W = 1, H = 1;
    function resize(){
      const r = (host || canvas).getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let w = Math.max(1, Math.round(r.width  * dpr));
      let h = Math.max(1, Math.round(r.height * dpr));
      const px = w * h;
      if(px > MAX_PX){
        const k = Math.sqrt(MAX_PX / px);
        w = Math.max(1, Math.round(w * k));
        h = Math.max(1, Math.round(h * k));
      }
      if(w !== W || h !== H){
        W = w; H = h; canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }
    new ResizeObserver(resize).observe(host || canvas);
    resize();

    let state = Object.assign({}, DEFAULTS);
    let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let clock = 40.0, last = performance.now(), raf = 0;

    function push(){
      const ends = hueEnds(state.a, state.b);
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uSeed, state.seed);
      gl.uniform3fv(U.uHsvA, ends[0]);
      gl.uniform3fv(U.uHsvB, ends[1]);
      gl.uniform3fv(U.uCore, hexToRgb(state.core));
      gl.uniform3fv(U.uBg,   hexToRgb(state.bg));
      gl.uniform1f(U.uAngle, state.angle * Math.PI / 180);
      gl.uniform1f(U.uScale, state.scale);
      gl.uniform1f(U.uStretch, state.stretch);
      gl.uniform1f(U.uWarp, state.warp);
      gl.uniform1f(U.uOffset, state.offset);
      gl.uniform1f(U.uDetail, state.detail);
      gl.uniform1f(U.uRough, state.rough);
      gl.uniform1f(U.uShape, state.shape);
      gl.uniform1f(U.uChroma, state.chroma);
      gl.uniform1f(U.uSoft, state.soft);
      gl.uniform1f(U.uDisp, state.disp);
      gl.uniform1f(U.uCoreMix, state.coreMix);
      gl.uniform1f(U.uIntensity, state.intensity);
    }

    function frame(now){
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if(playing) clock += dt * state.speed;
      resize();
      push();
      gl.uniform1f(U.uTime, clock);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      get state(){ return state; },
      set: function(next){ Object.assign(state, next); },
      get playing(){ return playing; },
      setPlaying: function(v){ playing = !!v; },
      exportGLSL: exportGLSL.bind(null, function(){ return state; })
    };
  }

  // Swaps the tunable uniforms for consts holding the current values, so the
  // copied shader compiles as-is; only uRes and uTime stay dynamic.
  function exportGLSL(getState){
    const s = getState();
    const e = hueEnds(s.a, s.b);
    const n = function(v){ return v.toFixed(5); };
    const v3 = function(a){ return 'vec3(' + a.map(n).join(', ') + ')'; };
    const lines = [
      ['float', 'uSeed',      n(s.seed)],
      ['vec3 ', 'uHsvA',      v3(e[0]) + ';   // ' + s.a],
      ['vec3 ', 'uHsvB',      v3(e[1]) + ';   // ' + s.b],
      ['vec3 ', 'uCore',      v3(hexToRgb(s.core)) + ';   // ' + s.core],
      ['vec3 ', 'uBg',        v3(hexToRgb(s.bg)) + ';   // ' + s.bg],
      ['float', 'uAngle',     n(s.angle * Math.PI / 180) + ';   // ' + s.angle + ' deg'],
      ['float', 'uScale',     n(s.scale)],
      ['float', 'uStretch',   n(s.stretch)],
      ['float', 'uWarp',      n(s.warp)],
      ['float', 'uOffset',    n(s.offset)],
      ['float', 'uDetail',    n(s.detail)],
      ['float', 'uRough',     n(s.rough)],
      ['float', 'uShape',     n(s.shape)],
      ['float', 'uChroma',    n(s.chroma)],
      ['float', 'uSoft',      n(s.soft)],
      ['float', 'uDisp',      n(s.disp)],
      ['float', 'uCoreMix',   n(s.coreMix)],
      ['float', 'uIntensity', n(s.intensity)]
    ].map(function(r){
      const val = r[2].indexOf(';') === -1 ? r[2] + ';' : r[2];
      return 'const ' + r[0] + ' ' + (r[1] + '          ').slice(0, 10) + ' = ' + val;
    }).join('\n');
    return FRAG.split('// ---- tunables ----')[0] + lines +
           FRAG.split('// ---- end tunables ----')[1];
  }

  return {DEFAULTS:DEFAULTS, PARAMS:PARAMS, create:create,
          hexToRgb:hexToRgb, hueEnds:hueEnds, luma:luma};
})();
