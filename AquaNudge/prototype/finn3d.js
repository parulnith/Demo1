/* Finn 3D: a fantail goldfish rendered on its own transparent WebGL canvas.
   The watch preview draws this canvas into its 2D tank each frame, so the
   tank keeps its water, light and tint while Finn is fully 3D.

   Usage:
     const finn = Finn3D.create();           // null if WebGL / three.js is unavailable
     finn.setSize(pxW, pxH);                  // canvas pixels, aspect 1.5
     finn.render({dt, t, mood, face, tilt, speed, burst, mouth, look});
     ctx.drawImage(finn.canvas, ...);
*/
(function(){
'use strict';
const ASPECT = 1.5;

function create(){
  const THREE = window.THREE;
  if (!THREE) return null;
  const canvas = document.createElement('canvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true, premultipliedAlpha:true, preserveDrawingBuffer:true}); }
  catch (e) { return null; }
  if (!renderer.getContext()) return null;

  const V3 = THREE.Vector3;
  const C = hex => new THREE.Color(hex).convertSRGBToLinear();
  const lerp = (a,b,t) => a + (b-a)*t;
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const sstep = (a,b,x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const rand = (a,b) => a + Math.random()*(b-a);

  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(16, ASPECT, .1, 60);
  camera.position.set(0, .05, 12); camera.lookAt(0, .05, 0);

  /* ---------- shader tweaks: mood saturation, rim glow, moving caustics ---------- */
  const U = { uTime:{value:0}, uSat:{value:1}, uBright:{value:1} };
  const rimU = {value:.3};
  const CAUSTIC = `
float caustic(vec2 uv, float t){
  vec2 p = mod(uv*6.28318, 6.28318) - 250.;
  vec2 i = p; float c = 1.; float inten = .005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1. - (3.5 / float(n+1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1./length(vec2(p.x / (sin(i.x+tt)/inten), p.y / (cos(i.y+tt)/inten)));
  }
  c /= 4.; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.), 0., 1.);
}
`;
  function enhance(mat, key, {caus = .4, sat = false, rim = null} = {}){
    mat.customProgramCacheKey = () => 'f3d-' + key;
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uSat = U.uSat; sh.uniforms.uBright = U.uBright;
      sh.uniforms.uRim = rim || {value:0};
      sh.vertexShader = 'varying vec3 vWPos; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n vWPos = (modelMatrix*vec4(transformed,1.)).xyz; vWN = normalize(mat3(modelMatrix)*objectNormal);');
      sh.fragmentShader = 'uniform float uTime; uniform float uSat; uniform float uBright; uniform float uRim; varying vec3 vWPos; varying vec3 vWN;\n' + CAUSTIC + sh.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + (sat ? '{ float g = dot(diffuseColor.rgb, vec3(.299,.587,.114)); diffuseColor.rgb = mix(vec3(g)*vec3(1.,.96,.9), diffuseColor.rgb, uSat) * uBright; }' : ''))
        .replace('#include <tonemapping_fragment>', `
          { float c = caustic(vWPos.xz*.55 + vec2(vWPos.y*.12 + uTime*.05, 0.), uTime*.45);
            gl_FragColor.rgb += c * ${caus.toFixed(2)} * vec3(.72,.95,1.) * smoothstep(-.35,.9,normalize(vWN).y) * (diffuseColor.rgb + .06);
            float fr = pow(1. - abs(dot(normalize(normal), normalize(vViewPosition))), 3.);
            gl_FragColor.rgb += uRim * fr * vec3(1.,.7,.35); }
          #include <tonemapping_fragment>`);
    };
    return mat;
  }

  /* ---------- lighting ---------- */
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#d9f6f8'); gr.addColorStop(.3, '#5fb8c6'); gr.addColorStop(.5, '#1d5c68'); gr.addColorStop(.62, '#0c2a30'); gr.addColorStop(1, '#05100f');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    const blob = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r*2, r*2); };
    blob(256, 20, 90, 'rgba(255,255,250,1)'); blob(120, 70, 50, 'rgba(180,240,255,.8)'); blob(400, 90, 45, 'rgba(255,210,170,.6)');
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(t).texture;
    t.dispose(); pm.dispose();
  }
  scene.add(new THREE.HemisphereLight(C(0x9fe6f2), C(0x4a3a22), .6));
  const key = new THREE.DirectionalLight(C(0xfff0da), 2.3); key.position.set(2.2, 6.5, 3.5); scene.add(key);
  const rimL = new THREE.DirectionalLight(C(0x7fe6ff), 1.5); rimL.position.set(-4, 2.5, -4); scene.add(rimL);
  const fill = new THREE.DirectionalLight(C(0xffb07a), .4); fill.position.set(1, -2, 5); scene.add(fill);

  /* ---------- textures ---------- */
  function canvasTex(w, h, draw, srgb = true){
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  const SCALE_W = 34, SCALE_H = 16;
  function eachScale(fn){ for (let row = 0, y = 0; y < 520; row++, y += SCALE_H) for (let x = 1010; x > 190; x -= SCALE_W) fn(x + (row % 2 ? SCALE_W/2 : 0), y); }
  const bodyTex = canvasTex(1024, 512, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    [[0,'#ffe2b0'],[.1,'#fdab4e'],[.22,'#f37a1c'],[.36,'#dc4f12'],[.5,'#a82a0a'],[.64,'#dc4f12'],[.78,'#f37a1c'],[.9,'#fdab4e'],[1,'#ffe2b0']].forEach(([o,c]) => gr.addColorStop(o,c));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const hg = g.createLinearGradient(0, 0, 230, 0);
    hg.addColorStop(0, 'rgba(210,55,15,.3)'); hg.addColorStop(1, 'rgba(210,55,15,0)');
    g.fillStyle = hg; g.fillRect(0, 0, 230, H);
    eachScale((x, y) => {
      const fade = sstep(190, 300, x)*rand(.6, 1);
      const rg = g.createRadialGradient(x - 6, y, 1, x, y, SCALE_W*.62);
      rg.addColorStop(0, `rgba(255,226,160,${.2*fade})`); rg.addColorStop(.75, `rgba(255,190,120,${.03*fade})`); rg.addColorStop(1, `rgba(130,35,5,${.1*fade})`);
      g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, SCALE_W*.62, SCALE_H*.72, 0, 0, Math.PI*2); g.fill();
    });
    g.strokeStyle = 'rgba(120,30,5,.28)'; g.lineWidth = 3;
    for (const [a,b] of [[40,230],[282,472]]) { g.beginPath(); g.moveTo(196, a); g.quadraticCurveTo(236, (a+b)/2, 196, b); g.stroke(); }
    g.strokeStyle = 'rgba(255,220,180,.25)'; g.lineWidth = 2;
    for (const [a,b] of [[48,222],[290,464]]) { g.beginPath(); g.moveTo(201, a); g.quadraticCurveTo(240, (a+b)/2, 201, b); g.stroke(); }
    g.fillStyle = 'rgba(120,35,10,.35)';
    for (let x = 260; x < 990; x += SCALE_W) for (const y of [150, 362]) { g.beginPath(); g.arc(x, y + Math.sin(x*.01)*4, 2.2, 0, Math.PI*2); g.fill(); }
  });
  const bumpTex = canvasTex(1024, 512, (g, W, H) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
    eachScale((x, y) => {
      const f = sstep(190, 320, x), v = a => `rgb(${a|0},${a|0},${a|0})`;
      const lg = g.createLinearGradient(x - SCALE_W*.6, 0, x + SCALE_W*.6, 0);
      lg.addColorStop(0, v(lerp(128,104,f))); lg.addColorStop(.85, v(lerp(128,190,f))); lg.addColorStop(1, v(lerp(128,150,f)));
      g.fillStyle = lg; g.beginPath(); g.ellipse(x, y, SCALE_W*.62, SCALE_H*.72, 0, 0, Math.PI*2); g.fill();
    });
  }, false);
  const finTex = canvasTex(512, 256, (g, W, H) => {
    const mg = g.createLinearGradient(0, 0, W, 0);
    mg.addColorStop(0, 'rgba(240,110,45,.92)'); mg.addColorStop(.35, 'rgba(248,140,70,.62)'); mg.addColorStop(.8, 'rgba(255,196,140,.36)'); mg.addColorStop(1, 'rgba(255,220,180,.12)');
    g.fillStyle = mg; g.fillRect(0, 0, W, H);
    for (let r = 0; r <= 24; r++) {
      const y0 = (r + .5)/25*H;
      const draw = dy => { g.beginPath(); g.moveTo(0, y0); for (let x = 0; x <= W*.97; x += 8) g.lineTo(x, y0 + Math.sin(x*.02 + r)*1.5 + (x > W*.55 ? (x - W*.55)*dy : 0)); g.stroke(); };
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,120,55,.75)'; g.lineWidth = 2.2; draw(0);
      g.strokeStyle = 'rgba(255,170,110,.5)'; g.lineWidth = 1.1; draw(.035); draw(-.035);
    }
    g.globalCompositeOperation = 'destination-out';
    const eg = g.createLinearGradient(W*.82, 0, W, 0); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,.9)');
    g.fillStyle = eg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(0,0,0,${rand(.2,.6)})`; g.beginPath(); g.ellipse(rand(W*.86, W), rand(0, H), rand(2,8), rand(1,3), 0, 0, Math.PI*2); g.fill(); }
    const sg = g.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, 'rgba(0,0,0,.8)'); sg.addColorStop(.06, 'rgba(0,0,0,0)'); sg.addColorStop(.94, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.8)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  });
  const irisTex = canvasTex(256, 256, (g, W, H) => {
    const ig = g.createLinearGradient(0, 0, 0, 66);
    [[0,'#2a1606'],[.4,'#6b3a0c'],[.55,'#c9821e'],[.72,'#f0b845'],[.86,'#d08a22'],[.93,'#4a2a08'],[1,'#1a0e04']].forEach(([o,c]) => ig.addColorStop(o,c));
    g.fillStyle = ig; g.fillRect(0, 0, W, 66);
    for (let i = 0; i < 160; i++) { g.strokeStyle = Math.random() < .5 ? 'rgba(255,230,150,.25)' : 'rgba(60,25,0,.25)'; g.lineWidth = rand(.5,1.6); const x = rand(0, W); g.beginPath(); g.moveTo(x, rand(24,34)); g.lineTo(x + rand(-2,2), rand(50,60)); g.stroke(); }
    g.fillStyle = '#f3eee4'; g.fillRect(0, 66, W, H - 66);
  });

  /* ---------- the fish ---------- */
  // pivot = what the watch preview turns; the fish is shifted so the pivot sits at its visual centre (body + tail)
  const pivot = new THREE.Group(); pivot.rotation.order = 'YZX'; scene.add(pivot);
  const fish = new THREE.Group(); fish.position.x = .62; pivot.add(fish);

  const MOODS = {
    happy:   {sat:1.0, bright:1.0,  spread:1.0, droop:0,   upper:.06, lower:.26, slant:0,   pupil:1.12, hz:2.1, gill:.45, rim:.32, roll:0},
    restless:{sat:.88, bright:.96,  spread:.78, droop:.15, upper:.44, lower:.06, slant:.04, pupil:.95,  hz:1.7, gill:.65, rim:.26, roll:0},
    worried: {sat:.66, bright:.9,   spread:.38, droop:.45, upper:.3,  lower:.02, slant:.45, pupil:.8,   hz:1.4, gill:1.15, rim:.2, roll:0},
    parched: {sat:.3,  bright:.82,  spread:.18, droop:1,   upper:.62, lower:.12, slant:.32, pupil:.72,  hz:.7,  gill:1.8, rim:.1,  roll:.45},
  };
  const P = Object.assign({}, MOODS.happy, {phase:0, fin:0, A:.1, bend:0, gillOpen:0, breath:0});

  function prof(u){
    const uu = Math.min(1, u), m = .4;
    const q = uu < m ? (m - uu)/m : Math.pow((uu - m)/(1 - m), 1.15);
    const e = Math.sqrt(Math.max(0, 1 - q*q));
    const ped = sstep(.7, 1, uu);
    let ht = Math.max(.6*e + .05*Math.exp(-Math.pow((uu - .3)/.13, 2)), .1*ped);
    let hb = Math.max(.66*e, .08*ped);
    let w = Math.max(.44*e, .05*ped);
    if (u > 1) { const k = Math.max(0, 1 - (u - 1)/.045); ht *= k; hb *= k; w *= k; }
    return {ht, hb, w, yc: -.04*Math.sin(Math.PI*uu)};
  }
  const xOf = u => 1 - 2*u;
  function wave(x){ const s = clamp((.8 - x)/1.8, 0, 1.6); return P.A*(.05 + s*s)*Math.sin(P.phase - s*2.6) + P.bend*s*s; }

  // body
  const NU = 64, NV = 40;
  const bodyGeo = new THREE.BufferGeometry(), bodyBase = [], bodyU = [];
  {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = .003 + (1.045 - .003)*i/NU, pr = prof(u), x = xOf(u);
      for (let j = 0; j <= NV; j++) {
        const th = -Math.PI/2 + 2*Math.PI*j/NV, s = Math.sin(th), c = Math.cos(th);
        pos.push(x, pr.yc + (s > 0 ? pr.ht*s : pr.hb*s), pr.w*Math.sign(c)*Math.pow(Math.abs(c), .9));
        uv.push(Math.min(1, u), j/NV); bodyU.push(u);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i*(NV+1) + j, b = a + 1, c = a + NV + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bodyGeo.setIndex(idx); bodyBase.push(...pos); bodyGeo.computeVertexNormals();
  }
  const body = new THREE.Mesh(bodyGeo, enhance(new THREE.MeshPhysicalMaterial({map:bodyTex, bumpMap:bumpTex, bumpScale:.005, roughness:.36, metalness:.08, clearcoat:.6, clearcoatRoughness:.22, envMapIntensity:.8}), 'body', {sat:true, rim:rimU, caus:.4}));
  body.frustumCulled = false; fish.add(body);

  // fins
  const finMat = enhance(new THREE.MeshStandardMaterial({map:finTex, emissiveMap:finTex, emissive:C(0xff8a3a), emissiveIntensity:.22, transparent:true, side:THREE.DoubleSide, depthWrite:false, roughness:.42, envMapIntensity:.8}), 'fin', {sat:true, caus:.3});
  const fins = [], o = {x:0, y:0, z:0};
  function makeFin(ns, nt, fn, order){
    const g = new THREE.BufferGeometry(), n = (ns+1)*(nt+1), uv = new Float32Array(n*2), idx = [];
    for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) { const k = j*(ns+1) + i; uv[k*2] = i/ns; uv[k*2+1] = j/nt; }
    for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) { const a = j*(ns+1) + i, b = a + 1, c = a + ns + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n*3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, finMat); m.frustumCulled = false; m.renderOrder = order; fish.add(m);
    fins.push({m, ns, nt, fn});
  }
  for (const sd of [1, -1]) makeFin(16, 20, (s, tt, o) => {
    const t = tt*2 - 1, at = Math.abs(t);
    const len = 1.3*(.5 + .5*Math.pow(at, .85))*(1 - .4*Math.pow(at, 10))*(.82 + .18*P.spread);
    o.x = -1.0 - s*len*.93;
    o.y = -.04 + t*(.06 + s*.95*(.42 + .58*P.spread)) - P.droop*.5*s*s + .035*s*Math.sin(P.fin*1.3 - s*6 + t*3);
    o.z = sd*s*len*(.16 + .3*P.spread) + .07*s*Math.sin(P.fin*1.1 - s*5 + t*2.5)*(.4 + .6*P.spread);
  }, 2);
  makeFin(10, 16, (s, t, o) => {
    const xb = .42 - t*.86, pr = prof((1 - xb)/2), yb = pr.yc + pr.ht - .035;
    const H = (.72*Math.pow(1 - t, .55)*sstep(0, .12, t) + .03)*(.42 + .58*P.spread);
    o.x = xb - s*H*(.35 + (1 - P.spread)*.7);
    o.y = yb + s*H*(1 - (1 - P.spread)*.35);
    o.z = P.droop*.3*s*s + .05*s*Math.sin(P.fin*1.2 - t*4 - s*2);
  }, 1);
  function paired(cfg){
    for (const sd of [1, -1]) makeFin(8, 8, (s, t, o) => {
      const bx = lerp(cfg.b0[0], cfg.b1[0], t), by = lerp(cfg.b0[1], cfg.b1[1], t);
      const len = cfg.len*Math.pow(Math.sin(Math.PI*(.12 + .88*t)), .7)*(.72 + .28*P.spread);
      const flap = Math.sin(P.fin*cfg.fs + cfg.ph + (sd > 0 ? 0 : .6))*cfg.fa*(.3 + .7*P.spread);
      o.x = bx + s*len*cfg.dx;
      o.y = by + s*len*(cfg.dy - P.droop*.35);
      o.z = sd*(cfg.zb + s*len*(cfg.out*(.45 + .55*P.spread) + flap)) + sd*.035*s*Math.sin(P.fin*1.4 - s*4);
    }, 3);
  }
  paired({b0:[.52,-.2], b1:[.4,-.33], len:.46, dx:-.8, dy:-.28, out:.72, zb:.35, fs:1.1, fa:.38, ph:0});
  paired({b0:[.1,-.6], b1:[-.08,-.6], len:.42, dx:-.55, dy:-.82, out:.36, zb:.2, fs:.8, fa:.14, ph:1});
  paired({b0:[-.45,-.52], b1:[-.66,-.42], len:.5, dx:-.75, dy:-.66, out:.3, zb:.17, fs:.9, fa:.12, ph:2});

  // eyes with mood-carrying lids
  const lidMat = enhance(new THREE.MeshPhysicalMaterial({color:C(0xe0581a), roughness:.42, clearcoat:.5, clearcoatRoughness:.3}), 'lid', {sat:true, rim:rimU, caus:.25});
  const lidRimMat = enhance(new THREE.MeshPhysicalMaterial({color:C(0x8a2a0c), roughness:.4, clearcoat:.4}), 'lidrim', {sat:true, caus:0});
  const eyes = [];
  function makeEye(mirror){
    const holder = new THREE.Group(); if (mirror) holder.scale.z = -1; fish.add(holder);
    const root = new THREE.Group(); holder.add(root);
    const R = .15, EX = .6, EY = .1;
    const pr = prof((1 - EX)/2), sn = clamp((EY - pr.yc)/pr.ht, -1, 1);
    root.position.set(EX, EY, pr.w*Math.sqrt(1 - sn*sn) - .055);
    root.quaternion.setFromUnitVectors(new V3(0,0,1), new V3(.34, .2, 1).normalize());
    root.add(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), new THREE.MeshPhysicalMaterial({color:C(0xf2ede3), roughness:.22, clearcoat:1, clearcoatRoughness:.06})));
    const aim = new THREE.Group(); root.add(aim);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(R*1.012, 32, 12, 0, Math.PI*2, 0, .8).rotateX(Math.PI/2), new THREE.MeshPhysicalMaterial({map:irisTex, roughness:.18, clearcoat:1, clearcoatRoughness:.04}));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(R*1.022, 24, 8, 0, Math.PI*2, 0, .42).rotateX(Math.PI/2), new THREE.MeshPhysicalMaterial({color:C(0x050608), roughness:.1, clearcoat:1, clearcoatRoughness:.02}));
    aim.add(iris, pupil);
    const glintMat = new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.95});
    for (const [ax, ay, r] of [[.2, .42, .028], [-.28, -.3, .012]]) {
      const gl = new THREE.Mesh(new THREE.CircleGeometry(r, 16), glintMat);
      const d = new V3(ax, ay, 1).normalize(); gl.position.copy(d.clone().multiplyScalar(R*1.035)); gl.lookAt(d.clone().multiplyScalar(2)); root.add(gl);
    }
    const upPivot = new THREE.Group(), loPivot = new THREE.Group(); root.add(upPivot, loPivot);
    const upper = new THREE.Mesh(new THREE.SphereGeometry(R*1.07, 32, 12, 0, Math.PI*2, 0, Math.PI/2), lidMat);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(R*1.06, 32, 12, 0, Math.PI*2, Math.PI/2, Math.PI/2), lidMat);
    const rimGeo = new THREE.TorusGeometry(R*1.07, .012, 8, 40).rotateX(Math.PI/2);
    upper.add(new THREE.Mesh(rimGeo, lidRimMat)); lower.add(new THREE.Mesh(rimGeo, lidRimMat));
    upPivot.add(upper); loPivot.add(lower);
    eyes.push({root, holder, aim, pupil, upper, lower, upPivot, loPivot, baseZ: root.position.z, x: EX});
  }
  makeEye(false); makeEye(true);

  const mouth = new THREE.Group(); mouth.position.set(.985, -.055, 0); fish.add(mouth);
  mouth.add(new THREE.Mesh(new THREE.TorusGeometry(.052, .022, 12, 28).rotateY(Math.PI/2), enhance(new THREE.MeshPhysicalMaterial({color:C(0xf0875a), roughness:.35, clearcoat:.6}), 'lips', {sat:true, caus:.25})));
  { const hole = new THREE.Mesh(new THREE.CircleGeometry(.054, 20).rotateY(Math.PI/2), new THREE.MeshBasicMaterial({color:C(0x2a0906)})); hole.position.x = -.004; mouth.add(hole); }

  /* ---------- per-frame ---------- */
  let blink = 0, blinkT = 2, lastYaw = 0, mood = 'happy';
  const tmp = new V3(), look = new V3();

  function updateBody(){
    const p = bodyGeo.attributes.position.array;
    for (let k = 0, v = 0; k < p.length; k += 3, v++) {
      const x = bodyBase[k], y = bodyBase[k+1]; let z = bodyBase[k+2];
      const u = bodyU[v];
      if (u > .15 && u < .31) z *= 1 + P.gillOpen*.075*Math.sin(Math.PI*(u - .15)/.16)*(y < .2 ? 1 : .35);
      p[k] = x; p[k+1] = y; p[k+2] = z + wave(x);
    }
    bodyGeo.attributes.position.needsUpdate = true; bodyGeo.computeVertexNormals();
  }
  function updateFins(){
    for (const f of fins) {
      const p = f.m.geometry.attributes.position.array;
      for (let j = 0, k = 0; j <= f.nt; j++) for (let i = 0; i <= f.ns; i++, k += 3) {
        f.fn(i/f.ns, j/f.nt, o); p[k] = o.x; p[k+1] = o.y; p[k+2] = o.z + wave(o.x);
      }
      f.m.geometry.attributes.position.needsUpdate = true; f.m.geometry.computeVertexNormals();
    }
  }

  // units → preview pixels: the canvas spans `viewW` scene units horizontally
  const viewH = 2*camera.position.z*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)), viewW = viewH*ASPECT;

  /* s: {dt, t, mood, face (-1..1), tilt (2D radians, y-down), speed (0..1), burst (0..1), mouth (0..1),
         look: optional {dx, dy} in the same units as the sprite width (1 = sprite width), squint (0..1)} */
  function render(s){
    const dt = s.dt || 0, t = s.t || 0;
    mood = MOODS[s.mood] ? s.mood : 'happy';
    const M = MOODS[mood], k = dt ? 1 - Math.exp(-dt*1.6) : 1;
    for (const key in M) P[key] += (M[key] - P[key])*k;
    U.uTime.value = t; U.uSat.value = P.sat; U.uBright.value = P.bright; rimU.value = P.rim;

    // pose: a 2D facing value turns Finn through three-quarter view toward you
    const face = clamp(s.face == null ? 1 : s.face, -1, 1);
    const yaw = -(Math.PI/2)*(1 - face);
    const yawRate = dt ? (yaw - lastYaw)/dt : 0; lastYaw = yaw;
    P.bend += (clamp(-yawRate*.16, -.4, .4) - P.bend)*(dt ? Math.min(1, dt*5) : 1);
    const sgn = face >= 0 ? 1 : -1;
    pivot.rotation.set(P.roll*sgn*(.9 + .1*Math.sin(t*1.1)), yaw, -(s.tilt || 0)*sgn);

    const speed = clamp(s.speed || 0, 0, 1.5), burst = s.burst || 0;
    P.A = .05 + speed*.12 + burst*.14;
    const hz = P.hz*(.55 + speed*.9) + burst*3.5;
    P.phase += dt*Math.PI*2*hz;
    P.fin += dt*Math.PI*2*(.55 + hz*.35);
    P.breath += dt*Math.PI*2*(.55 + P.gill*.9);
    P.gillOpen = P.gill*(.5 + .5*Math.sin(P.breath));

    blinkT -= dt; if (blinkT <= 0) { blink = 1; blinkT = rand(2.8, 6); }
    blink = Math.max(0, blink - dt*6.5);

    pivot.updateMatrixWorld(true);
    // gaze
    if (s.look) look.set(s.look.dx*viewW, -s.look.dy*viewW, .6);
    else if (mood === 'worried') { look.set(.4, 4, 1.5); }
    else if (mood === 'restless') { look.set(Math.cos(yaw)*5, .2, 1 - Math.sin(yaw)*5); }
    else if (mood === 'parched') { look.set(0, -1.5 + Math.sin(t*.6)*.4, 12); }
    else look.copy(camera.position);
    const up = clamp(P.upper + (s.squint ? -.05 : 0) + blink*(1 - P.upper), 0, 1);
    const lo = clamp(P.lower + (s.squint || 0)*.3 + blink*(1 - P.lower), 0, 1);
    updateBody(); updateFins();
    for (const e of eyes) {
      e.root.position.z = e.baseZ + wave(e.x)*e.holder.scale.z;
      e.upper.rotation.x = -Math.asin(clamp(1 - up, 0, 1));
      e.lower.rotation.x = Math.asin(clamp(1 - lo, 0, 1));
      e.upPivot.rotation.z = P.slant; e.loPivot.rotation.z = P.slant*.4;
      e.pupil.scale.set(P.pupil, P.pupil, 1);
      e.root.updateMatrixWorld(true);
      const d = e.root.worldToLocal(tmp.copy(look)).normalize();
      e.aim.rotation.set(-clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -.45, .5), clamp(Math.atan2(d.x, d.z), -.55, .55), 0, 'YXZ');
    }
    mouth.position.z = wave(.985);
    const mo = clamp(s.mouth || 0, 0, 1);
    mouth.scale.set(1, .34 + mo*1.25, .7 + mo*.42);

    renderer.render(scene, camera);
    return canvas;
  }

  function setSize(w, h){
    w = Math.max(16, Math.round(w)); h = Math.max(10, Math.round(h || w/ASPECT));
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
  }
  setSize(240, 160);

  // mouth tip in sprite-width units from the sprite centre, for a fish facing right
  const mouthOffset = (1.0 + .62)/viewW;
  return {canvas, render, setSize, aspect:ASPECT, mouthOffset};
}

window.Finn3D = {create};
})();
