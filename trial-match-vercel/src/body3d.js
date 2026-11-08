// Trial Match: the 3D levels of the zoom (body -> lungs -> cancer cell). The protein after them is 3Dmol's.
// Everything is an illustration built from code: the body and lungs are signed distance fields meshed with
// surface nets, so there is no model file to download or license. Drawn in the Gemini style: glowing
// silhouettes with a blue -> purple -> rose gradient on a dark surface.
//
// Bundled into public/app/protein/body3d.js by scripts/build-3d.mjs and exposed as window.TMBody3D:
//   TMBody3D.supported()                       -> WebGL available?
//   var b = TMBody3D.create(container, opts)   opts: { gene, membrane, dark, level, onFrame(focus) }
//   b.ready                                    -> Promise, resolves once the meshes are built
//   b.go(level, ms)                            -> Promise; level is body | lung | cell | protein
//   b.focus()                                  -> { x, y, visible } of the glowing target, in px inside the container
//   b.pause(bool), b.destroy()
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Points, Sprite, InstancedMesh, Object3D,
  BufferGeometry, BufferAttribute, IcosahedronGeometry, CylinderGeometry, SphereGeometry, CapsuleGeometry, PlaneGeometry,
  ShaderMaterial, MeshBasicMaterial, SpriteMaterial, CanvasTexture,
  AdditiveBlending, NormalBlending, DoubleSide, FrontSide, Color, Vector3, Matrix4, Quaternion,
  ColorManagement, LinearSRGBColorSpace
} from 'three';

ColorManagement.enabled = false;   // colours below are the exact hex values the design uses

// ------------------------------------------------------------------ signed distance fields
function smin(a, b, k) { var h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }
function E(cx, cy, cz, rx, ry, rz, k, m) { return { t: 0, cx: cx, cy: cy, cz: cz, rx: rx, ry: ry, rz: rz, k: k, m: !!m }; }
function R(ax, ay, az, bx, by, bz, r1, r2, k, m) {   // round cone (a capsule whose radius tapers from r1 at a to r2 at b)
  var bax = bx - ax, bay = by - ay, baz = bz - az, l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2;
  return { t: 1, ax: ax, ay: ay, az: az, bax: bax, bay: bay, baz: baz, l2: l2, rr: rr, a2: l2 - rr * rr, il2: 1 / l2, r1: r1, r2: r2, k: k, m: !!m };
}
function dEll(p, x, y, z) {
  var X = (x - p.cx) / p.rx, Y = (y - p.cy) / p.ry, Z = (z - p.cz) / p.rz;
  var k0 = Math.sqrt(X * X + Y * Y + Z * Z);
  var X2 = X / p.rx, Y2 = Y / p.ry, Z2 = Z / p.rz, k1 = Math.sqrt(X2 * X2 + Y2 * Y2 + Z2 * Z2);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(p.rx, p.ry, p.rz);
}
function dRc(p, x, y, z) {
  var pax = x - p.ax, pay = y - p.ay, paz = z - p.az;
  var yy = pax * p.bax + pay * p.bay + paz * p.baz, zz = yy - p.l2;
  var qx = pax * p.l2 - p.bax * yy, qy = pay * p.l2 - p.bay * yy, qz = paz * p.l2 - p.baz * yy;
  var x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * p.l2, z2 = zz * zz * p.l2;
  var k = Math.sign(p.rr) * p.rr * p.rr * x2;
  if (Math.sign(zz) * p.a2 * z2 > k) return Math.sqrt(x2 + z2) * p.il2 - p.r2;
  if (Math.sign(yy) * p.a2 * y2 < k) return Math.sqrt(x2 + y2) * p.il2 - p.r1;
  return (Math.sqrt(x2 * p.a2 * p.il2) + yy * p.rr) * p.il2 - p.r1;
}
function blend(prims) {   // smooth union; m: mirrored across x = 0
  return function (x, y, z) {
    var d = 0, ax = Math.abs(x);
    for (var i = 0; i < prims.length; i++) {
      var p = prims[i], px = p.m ? ax : x, di = p.t ? dRc(p, px, y, z) : dEll(p, px, y, z);
      d = i ? smin(d, di, p.k) : di;
    }
    return d;
  };
}

// A standing adult, 1.76 m, facing +z, arms a little away from the body. Metres.
var bodySdf = blend([
  E(0, 1.637, 0.004, 0.077, 0.101, 0.093, 0),             // head
  E(0, 1.662, -0.018, 0.079, 0.088, 0.089, 0.03),         // back of the skull
  E(0, 1.566, 0.026, 0.056, 0.05, 0.064, 0.035),          // jaw
  E(0, 1.604, 0.094, 0.011, 0.021, 0.017, 0.012),         // nose
  E(0.078, 1.62, -0.004, 0.012, 0.026, 0.016, 0.01, 1),   // ears
  R(0, 1.535, -0.012, 0, 1.43, -0.006, 0.047, 0.056, 0.04),                 // neck
  R(0, 1.47, -0.022, 0.152, 1.413, -0.022, 0.05, 0.044, 0.05, 1),           // trapezius slope
  E(0.188, 1.392, -0.006, 0.06, 0.068, 0.064, 0.04, 1),                    // shoulder
  E(0, 1.302, 0.0, 0.163, 0.165, 0.104, 0.06),                             // chest
  E(0.074, 1.318, 0.05, 0.083, 0.064, 0.058, 0.04, 1),                     // pectorals
  E(0, 1.13, 0.0, 0.138, 0.16, 0.094, 0.07),                               // ribs and waist
  E(0, 1.04, 0.018, 0.133, 0.11, 0.094, 0.06),                             // belly
  E(0, 0.94, 0.0, 0.158, 0.1, 0.1, 0.06),                                  // pelvis
  E(0.074, 0.9, -0.042, 0.084, 0.094, 0.079, 0.05, 1),                     // glutes
  R(0.204, 1.36, -0.012, 0.252, 1.1, -0.032, 0.048, 0.037, 0.03, 1),       // upper arm
  R(0.252, 1.1, -0.032, 0.287, 0.862, 0.012, 0.037, 0.026, 0.02, 1),       // forearm
  E(0.3, 0.786, 0.02, 0.021, 0.064, 0.039, 0.022, 1),                      // hand
  R(0.288, 0.83, 0.032, 0.283, 0.78, 0.062, 0.012, 0.009, 0.012, 1),       // thumb
  R(0.094, 0.9, 0.0, 0.104, 0.5, 0.012, 0.084, 0.052, 0.05, 1),            // thigh
  E(0.105, 0.49, 0.02, 0.049, 0.054, 0.049, 0.03, 1),                     // knee
  R(0.105, 0.48, -0.006, 0.1, 0.08, -0.01, 0.049, 0.031, 0.03, 1),         // shin
  E(0.105, 0.37, -0.026, 0.047, 0.088, 0.044, 0.03, 1),                    // calf
  R(0.1, 0.046, -0.032, 0.11, 0.03, 0.118, 0.037, 0.029, 0.03, 1)          // foot
]);
var BODY_BOX = [-0.36, -0.02, -0.17, 0.36, 1.77, 0.17];

// The lungs, inside the chest. The right lung (the patient's right, -x) has the tumour; the left has the heart's notch.
var LR = [E(-0.078, 1.3, 0.005, 0.068, 0.15, 0.078, 0), R(-0.07, 1.25, 0, -0.056, 1.43, -0.006, 0.07, 0.028, 0.045), E(-0.085, 1.2, 0.004, 0.075, 0.085, 0.085, 0.05)];
function oneLung(X, y, z, left) {
  var d = smin(smin(dEll(LR[0], X, y, z), dRc(LR[1], X, y, z), 0.045), dEll(LR[2], X, y, z), 0.05);
  var dx = X + 0.068, dy = y - 0.985, dz = z - 0.01;
  d = smax(d, 0.155 - Math.sqrt(dx * dx + dy * dy + dz * dz), 0.02);     // dome of the diaphragm under it
  d = smax(d, X + 0.021, 0.015);                                          // flat inner side, next to the heart
  if (left) { var cx = X + 0.03, cy = y - 1.215, cz = z - 0.055; d = smax(d, 0.062 - Math.sqrt(cx * cx + cy * cy + cz * cz), 0.02); }
  return d;
}
function lungSdf(x, y, z) { return Math.min(oneLung(x, y, z, false), oneLung(-x, y, z, true)); }
var LUNG_BOX = [-0.17, 1.08, -0.11, 0.17, 1.47, 0.11];
var TUMOUR = new Vector3(-0.113, 1.348, 0.05);

// ------------------------------------------------------------------ surface nets: field -> smooth mesh
function mesh(sdf, box, h) {
  var x0 = box[0], y0 = box[1], z0 = box[2];
  var nx = Math.ceil((box[3] - x0) / h) + 1, ny = Math.ceil((box[4] - y0) / h) + 1, nz = Math.ceil((box[5] - z0) / h) + 1;
  var F = new Float32Array(nx * ny * nz), i, j, k;
  for (k = 0; k < nz; k++) for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) F[i + nx * (j + ny * k)] = sdf(x0 + i * h, y0 + j * h, z0 + k * h);
  var cx = nx - 1, cy = ny - 1, cz = nz - 1, cell = new Int32Array(cx * cy * cz).fill(-1), pos = [];
  var C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  var EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  var v = new Float32Array(8);
  for (k = 0; k < cz; k++) for (j = 0; j < cy; j++) for (i = 0; i < cx; i++) {
    var neg = 0;
    for (var c = 0; c < 8; c++) { v[c] = F[(i + C[c][0]) + nx * ((j + C[c][1]) + ny * (k + C[c][2]))]; if (v[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    var sx = 0, sy = 0, sz = 0, n = 0;
    for (var e = 0; e < 12; e++) {
      var a = EDGES[e][0], b = EDGES[e][1];
      if ((v[a] < 0) === (v[b] < 0)) continue;
      var t = v[a] / (v[a] - v[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    cell[i + cx * (j + cy * k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  // one quad per grid edge that crosses the surface, from the four cells around it (counter-clockwise from outside)
  var idx = [], dims = [nx, ny, nz];
  function cellAt(p) { return (p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= cx || p[1] >= cy || p[2] >= cz) ? -1 : cell[p[0] + cx * (p[1] + cy * p[2])]; }
  for (k = 0; k < nz; k++) for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
    var g = [i, j, k], f0 = F[i + nx * (j + ny * k)];
    for (var ax = 0; ax < 3; ax++) {
      if (g[ax] + 1 >= dims[ax]) continue;
      var g1 = g.slice(); g1[ax]++;
      var f1 = F[g1[0] + nx * (g1[1] + ny * g1[2])];
      if ((f0 < 0) === (f1 < 0)) continue;
      var b1 = (ax + 1) % 3, c1 = (ax + 2) % 3, q = [];
      [[-1, -1], [0, -1], [0, 0], [-1, 0]].forEach(function (o) { var p = g.slice(); p[b1] += o[0]; p[c1] += o[1]; q.push(cellAt(p)); });
      if (q.indexOf(-1) >= 0) continue;
      if (f0 < 0) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); else idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    }
  }
  // normals from the field's gradient: smooth shading without a smoothing pass
  var nrm = new Float32Array(pos.length), d = h * 0.5;
  for (var p = 0; p < pos.length; p += 3) {
    var X = pos[p], Y = pos[p + 1], Z = pos[p + 2];
    var gx = sdf(X + d, Y, Z) - sdf(X - d, Y, Z), gy = sdf(X, Y + d, Z) - sdf(X, Y - d, Z), gz = sdf(X, Y, Z + d) - sdf(X, Y, Z - d);
    var l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    nrm[p] = gx / l; nrm[p + 1] = gy / l; nrm[p + 2] = gz / l;
  }
  return { pos: new Float32Array(pos), nrm: nrm, idx: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}

// ------------------------------------------------------------------ airways: a seeded branching tree inside the lungs
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function airways() {
  var r = rng(7), segs = [];
  var V3 = function (x, y, z) { return new Vector3(x, y, z); };
  var top = V3(0, 1.5, -0.012), carina = V3(0, 1.358, -0.008);
  segs.push([top, carina, 0.0092, 0.0084]);
  function grow(p, dir, len, rad, depth, drop) {
    if (depth > 5 || rad < 0.0011) return;
    for (var c = 0; c < 2; c++) {
      var axis = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).cross(dir).normalize();
      var d = dir.clone().applyAxisAngle(axis, (c ? 1 : -1) * (0.42 + r() * 0.32));
      d.y -= drop; d.normalize();
      var L = len * (0.7 + r() * 0.18), q = p.clone().addScaledVector(d, L), tries = 0;
      while (lungSdf(q.x, q.y, q.z) > -0.005 && tries++ < 5) { L *= 0.68; q = p.clone().addScaledVector(d, L); }
      if (lungSdf(q.x, q.y, q.z) > -0.003) continue;
      segs.push([p, q, rad, rad * 0.74]);
      grow(q, d, L, rad * 0.74, depth + 1, drop);
    }
  }
  [[-1, V3(-0.05, 1.316, -0.006), 0.0072], [1, V3(0.056, 1.31, -0.006), 0.0064]].forEach(function (m) {
    segs.push([carina, m[1], 0.0082, m[2]]);
    grow(m[1], m[1].clone().sub(carina).normalize().add(V3(m[0] * 0.15, -0.55, 0.05)).normalize(), 0.05, m[2] * 0.82, 0, 0.18);
    var upper = m[1].clone().add(V3(m[0] * 0.012, 0.006, 0));   // upper-lobe bronchus, heading up and out
    segs.push([m[1], upper, m[2] * 0.8, m[2] * 0.72]);
    grow(upper, V3(m[0] * 0.75, 0.62, 0.12).normalize(), 0.04, m[2] * 0.66, 1, -0.05);
  });
  var pos = [], nrm = [], idx = [], up = V3(0, 1, 0), q = new Quaternion(), M = new Matrix4();
  segs.forEach(function (s) {
    var dir = s[1].clone().sub(s[0]), L = dir.length();
    var g = new CylinderGeometry(s[3], s[2], L, 7, 1, true);
    q.setFromUnitVectors(up, dir.normalize());
    M.compose(s[0].clone().add(s[1]).multiplyScalar(0.5), q, V3(1, 1, 1));
    g.applyMatrix4(M);
    var base = pos.length / 3, P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array;
    for (var i = 0; i < P.length; i++) { pos.push(P[i]); nrm.push(N[i]); }
    for (var j = 0; j < I.length; j++) idx.push(base + I[j]);
    g.dispose();
  });
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
}

// meshes are built once per page and shared by every view
var CACHE = null;
function build(fine) {
  if (!CACHE) CACHE = { body: mesh(bodySdf, BODY_BOX, fine ? 0.0105 : 0.013), lung: mesh(lungSdf, LUNG_BOX, fine ? 0.0042 : 0.0052), air: airways() };
  return CACHE;
}
function geom(m) {
  var g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new BufferAttribute(m.nrm, 3));
  if (m.idx) g.setIndex(new BufferAttribute(m.idx, 1));
  return g;
}

// ------------------------------------------------------------------ materials
var BLUE = '#4285F4', PURPLE = '#9B72CB', ROSE = '#D96570', ICE = '#A8C7FA', CHANGE = '#FF6B81';
var VERT = [
  'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
  'void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }'
].join('\n');
var FRAG = [
  'uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uLo; uniform float uHi; uniform float uRim; uniform float uFill;',
  'uniform float uPow; uniform float uOpacity; uniform float uTime; uniform float uScan;',
  'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
  'void main(){',
  '  float f = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), uPow);',
  '  float t = clamp((vP.y - uLo) / (uHi - uLo), 0.0, 1.0);',
  '  vec3 col = t < 0.5 ? mix(uA, uB, t * 2.0) : mix(uB, uC, t * 2.0 - 1.0);',
  '  float band = uScan * smoothstep(0.045, 0.0, abs(fract(uTime * 0.11) * 1.5 - 0.25 - t));',   // a soft light that sweeps up now and then
  '  float a = (uFill + f * uRim + band * 0.55) * uOpacity;',
  '  gl_FragColor = vec4(mix(col, vec3(1.0), band * 0.35) * (1.0 + f * 0.5), a);',
  '}'
].join('\n');
function holo(o, dark) {
  return new ShaderMaterial({
    uniforms: {
      uA: { value: new Color(o.a) }, uB: { value: new Color(o.b) }, uC: { value: new Color(o.c) },
      uLo: { value: o.lo }, uHi: { value: o.hi }, uRim: { value: o.rim }, uFill: { value: o.fill }, uPow: { value: o.pow || 2.4 },
      uOpacity: { value: 1 }, uTime: { value: 0 }, uScan: { value: o.scan || 0 }
    },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: dark ? AdditiveBlending : NormalBlending, side: o.side || FrontSide
  });
}
var PVERT = [
  'attribute float aPhase; uniform float uTime; uniform float uSize; uniform float uPR; varying float vTw; varying float vY;',
  'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;',
  '  float s = 0.5 + 0.5 * sin(uTime * 1.7 + aPhase); vTw = s * s; vY = position.y;',
  '  gl_PointSize = min(uSize * uPR / max(-mv.z, 0.05), 4.5 * uPR); }'
].join('\n');
var PFRAG = [
  'uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uLo; uniform float uHi; uniform float uOpacity;',
  'varying float vTw; varying float vY;',
  'void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);',
  '  float t = clamp((vY - uLo) / (uHi - uLo), 0.0, 1.0); vec3 col = t < 0.5 ? mix(uA, uB, t * 2.0) : mix(uB, uC, t * 2.0 - 1.0);',
  '  gl_FragColor = vec4(col, a * (0.25 + 0.75 * vTw) * uOpacity); }'
].join('\n');
function sparkles(src, every, lift, o, dark, pr) {
  var P = [], ph = [], r = rng(11);
  for (var i = 0; i < src.pos.length / 3; i += every) {
    P.push(src.pos[i * 3] + src.nrm[i * 3] * lift, src.pos[i * 3 + 1] + src.nrm[i * 3 + 1] * lift, src.pos[i * 3 + 2] + src.nrm[i * 3 + 2] * lift);
    ph.push(r() * 6.283);
  }
  var g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('aPhase', new BufferAttribute(new Float32Array(ph), 1));
  var m = new ShaderMaterial({
    uniforms: { uA: { value: new Color(o.a) }, uB: { value: new Color(o.b) }, uC: { value: new Color(o.c) }, uLo: { value: o.lo }, uHi: { value: o.hi },
      uOpacity: { value: 1 }, uTime: { value: 0 }, uSize: { value: o.size }, uPR: { value: pr } },
    vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, blending: dark ? AdditiveBlending : NormalBlending
  });
  return new Points(g, m);
}
function glowTexture() {
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}
function glow(tex, color, size, dark) {
  var s = new Sprite(new SpriteMaterial({ map: tex, color: new Color(color), transparent: true, depthWrite: false, blending: dark ? AdditiveBlending : NormalBlending }));
  s.scale.set(size, size, 1);
  return s;
}

// a receptor: a stem through the membrane and two arms, like the letter Y
function receptorGeometry() {
  var parts = [], V3 = function (x, y, z) { return new Vector3(x, y, z); }, up = V3(0, 1, 0), q = new Quaternion(), M = new Matrix4();
  function rod(a, b, r) {
    var d = b.clone().sub(a), g = new CylinderGeometry(r, r, d.length(), 8, 1, false);
    q.setFromUnitVectors(up, d.normalize()); M.compose(a.clone().add(b).multiplyScalar(0.5), q, V3(1, 1, 1)); g.applyMatrix4(M); parts.push(g);
  }
  function knob(p, r) { var g = new SphereGeometry(r, 10, 8); g.translate(p.x, p.y, p.z); parts.push(g); }
  var fork = V3(0, 0.075, 0);
  rod(V3(0, -0.02, 0), fork, 0.0075);
  rod(fork, V3(0.034, 0.122, 0), 0.0062); rod(fork, V3(-0.034, 0.122, 0), 0.0062);
  knob(V3(0.034, 0.122, 0), 0.0115); knob(V3(-0.034, 0.122, 0), 0.0115);
  var pos = [], nrm = [];
  parts.forEach(function (g) {
    var gi = g.index ? g.toNonIndexed() : g, P = gi.attributes.position.array, N = gi.attributes.normal.array;
    for (var i = 0; i < P.length; i++) { pos.push(P[i]); nrm.push(N[i]); }
    if (gi !== g) gi.dispose(); g.dispose();
  });
  return geom({ pos: new Float32Array(pos), nrm: new Float32Array(nrm) });
}

// ------------------------------------------------------------------ the view
var easeIO = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
var easeIn = function (t) { return t * t * t; };
var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

function supported() {
  try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}

function create(container, opts) {
  opts = opts || {};
  var dark = opts.dark !== false, membrane = opts.membrane !== false;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
  var S = { alive: true, paused: false, idle: false, level: opts.level || 'body', raf: 0, t0: performance.now(), tw: null, drag: null, hold: 0, offs: [] };

  var renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 0);
  var canvas = renderer.domElement;
  canvas.className = 'pv-w3c';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
  container.appendChild(canvas);
  var flash = document.createElement('div');   // the glow you pass through between the lung and the cell
  flash.className = 'pv-w3f';
  flash.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 50%,rgba(255,107,129,.85),rgba(155,114,203,.55) 38%,rgba(66,133,244,.18) 62%,transparent 80%)';
  container.appendChild(flash);

  var scene = new Scene(), camera = new PerspectiveCamera(30, 1, 0.005, 60), tex = glowTexture();
  var disposables = [tex];
  function keep(o) { disposables.push(o); return o; }

  // ---- body world
  var bodyW = new Group(), bodyG = new Group(); bodyW.add(bodyG); scene.add(bodyW);
  var ready = new Promise(function (ok) { setTimeout(ok, 30); }).then(function () {
    if (!S.alive) return;
    var M = build(!coarse);
    var bodyMat = keep(holo({ a: BLUE, b: PURPLE, c: ROSE, lo: 0, hi: 1.76, rim: 1.25, fill: 0.035, pow: 2.2, scan: 1 }, dark));
    var body = new Mesh(keep(geom(M.body)), bodyMat); body.renderOrder = 1; bodyG.add(body);
    var lungMat = keep(holo({ a: PURPLE, b: ROSE, c: '#F2B8B5', lo: 1.1, hi: 1.45, rim: 1.1, fill: 0.09, pow: 1.8, side: DoubleSide }, dark));
    var lungs = new Mesh(keep(geom(M.lung)), lungMat); lungs.renderOrder = 2; bodyG.add(lungs);
    var airMat = keep(holo({ a: ICE, b: '#C2E7FF', c: ICE, lo: 1.15, hi: 1.5, rim: 1.35, fill: 0.22, pow: 1.4 }, dark));
    var air = new Mesh(keep(geom(M.air)), airMat); air.renderOrder = 3; bodyG.add(air);
    var bodyDots = sparkles(M.body, coarse ? 9 : 6, 0.004, { a: ICE, b: PURPLE, c: ROSE, lo: 0, hi: 1.76, size: 9 }, dark, pr);
    var lungDots = sparkles(M.lung, coarse ? 6 : 4, 0.002, { a: PURPLE, b: ROSE, c: '#F2B8B5', lo: 1.1, hi: 1.45, size: 3 }, dark, pr);
    keep(bodyDots.geometry); keep(bodyDots.material); keep(lungDots.geometry); keep(lungDots.material);
    bodyG.add(bodyDots); bodyG.add(lungDots);
    // the tumour: a lumpy glowing knot in the upper lobe of the right lung
    var tg = keep(new IcosahedronGeometry(0.017, 3)), tp = tg.attributes.position, tv = new Vector3();
    var tn = [];
    for (var i = 0; i < tp.count; i++) {
      tv.fromBufferAttribute(tp, i); var n = 1 + 0.16 * Math.sin(tv.x * 410 + 1) * Math.sin(tv.y * 380 + 2) * Math.sin(tv.z * 450);
      var l = tv.length() || 1; tn.push(tv.x / l, tv.y / l, tv.z / l); tv.multiplyScalar(n); tp.setXYZ(i, tv.x, tv.y, tv.z);
    }
    tg.setAttribute('normal', new BufferAttribute(new Float32Array(tn), 3));
    var tumour = new Mesh(tg, keep(holo({ a: CHANGE, b: CHANGE, c: ROSE, lo: -0.02, hi: 0.02, rim: 1.4, fill: 0.7, pow: 1.6 }, dark)));
    tumour.position.copy(TUMOUR); tumour.renderOrder = 4; bodyG.add(tumour);
    var tGlow = glow(tex, CHANGE, 0.11, dark); tGlow.position.copy(TUMOUR); keep(tGlow.material); bodyG.add(tGlow);
    // a soft ring on the floor
    var floor = new Mesh(keep(new PlaneGeometry(1.2, 1.2)), keep(new ShaderMaterial({
      uniforms: { uC: { value: new Color(BLUE) }, uOpacity: { value: 1 } }, transparent: true, depthWrite: false, blending: dark ? AdditiveBlending : NormalBlending,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uC; uniform float uOpacity; varying vec2 vU; void main(){ float r = length(vU) * 2.0; float ring = smoothstep(0.035, 0.0, abs(r - 0.42)) * 0.6 + smoothstep(0.75, 0.0, r) * 0.16; gl_FragColor = vec4(uC, ring * uOpacity); }'
    })));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; bodyG.add(floor);
    S.b = { bodyMat: bodyMat, lungMat: lungMat, airMat: airMat, bodyDots: bodyDots, lungDots: lungDots, tumour: tumour, tGlow: tGlow, floor: floor };

    // ---- cell world: a cancer cell with receptors on its surface; one carries the change
    var cellW = new Group(), cellG = new Group(); cellW.add(cellG); scene.add(cellW); cellW.visible = false;
    var mg = keep(new SphereGeometry(1, coarse ? 96 : 160, coarse ? 72 : 120)), mp = mg.attributes.position, mv = new Vector3(), mn = [];
    for (var k = 0; k < mp.count; k++) {
      mv.fromBufferAttribute(mp, k).normalize(); mn.push(mv.x, mv.y, mv.z);
      var w = 1 + 0.025 * Math.sin(mv.x * 5 + 1) * Math.sin(mv.y * 6 + 2) * Math.sin(mv.z * 7) + 0.012 * Math.sin(mv.x * 13 + mv.y * 11);
      mp.setXYZ(k, mv.x * w, mv.y * w, mv.z * w);
    }
    mg.setAttribute('normal', new BufferAttribute(new Float32Array(mn), 3));
    var cellMat = keep(holo({ a: BLUE, b: PURPLE, c: ROSE, lo: -1, hi: 1, rim: 1.15, fill: 0.04, pow: 2.0, side: DoubleSide }, dark));
    cellG.add(new Mesh(mg, cellMat));
    var nuc = new Mesh(keep(new IcosahedronGeometry(0.36, 4)), keep(holo({ a: BLUE, b: PURPLE, c: PURPLE, lo: -0.4, hi: 0.4, rim: 1.0, fill: 0.1, pow: 1.8 }, dark)));
    nuc.position.set(-0.12, -0.1, -0.08); cellG.add(nuc);
    var nucleolus = glow(tex, PURPLE, 0.28, dark); nucleolus.position.copy(nuc.position).add(new Vector3(0.06, 0.05, 0.05)); keep(nucleolus.material); cellG.add(nucleolus);
    var orgMat = keep(holo({ a: ICE, b: PURPLE, c: ROSE, lo: -1, hi: 1, rim: 0.9, fill: 0.06, pow: 1.6 }, dark)), r = rng(3);
    for (var o = 0; o < 9; o++) {   // mitochondria
      var cap = new Mesh(keep(new CapsuleGeometry(0.035, 0.11, 4, 10)), orgMat);
      var dir = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      cap.position.copy(dir.multiplyScalar(0.5 + r() * 0.3)); cap.rotation.set(r() * 3, r() * 3, r() * 3); cellG.add(cap);
    }
    var tdir = new Vector3(0.36, 0.46, 0.81).normalize();
    var rgeo = keep(receptorGeometry()), up = new Vector3(0, 1, 0), dummy = new Object3D(), dirs = [], N = coarse ? 120 : 170;
    for (var s = 0; s < N; s++) {   // evenly spread over the sphere (Fibonacci), leaving room around the target
      var yy = 1 - (s + 0.5) / N * 2, rad = Math.sqrt(1 - yy * yy), th = s * 2.39996;
      var dv = new Vector3(Math.cos(th) * rad, yy, Math.sin(th) * rad);
      if (dv.angleTo(tdir) > 0.3) dirs.push(dv);
    }
    var recMat = keep(new MeshBasicMaterial({ color: new Color(ICE), transparent: true, opacity: 0.36, depthWrite: false, blending: dark ? AdditiveBlending : NormalBlending }));
    var recs = new InstancedMesh(rgeo, recMat, dirs.length);
    dirs.forEach(function (d, i) {
      dummy.position.copy(d).multiplyScalar(0.99); dummy.quaternion.setFromUnitVectors(up, d); dummy.scale.setScalar(0.78);
      dummy.rotateY(i * 1.7); dummy.updateMatrix(); recs.setMatrixAt(i, dummy.matrix);
    });
    cellG.add(recs);
    var target = new Group(), tip = new Vector3();
    var tMat = keep(new MeshBasicMaterial({ color: new Color(CHANGE), transparent: true, opacity: 0.95, depthWrite: false, blending: dark ? AdditiveBlending : NormalBlending }));
    if (membrane) {   // the changed receptor stands in the surface
      var tr = new Mesh(rgeo, tMat); tr.scale.setScalar(1.9); tr.quaternion.setFromUnitVectors(up, tdir); tr.position.copy(tdir).multiplyScalar(0.99);
      target.add(tr); tip.copy(tdir).multiplyScalar(0.99 + 0.12 * 1.9);
    } else {          // the changed protein works just inside the cell
      var blob = new Mesh(keep(new IcosahedronGeometry(0.055, 2)), tMat); blob.position.copy(tdir).multiplyScalar(0.84);
      target.add(blob); tip.copy(blob.position);
    }
    var tGlow2 = glow(tex, CHANGE, 0.42, dark); tGlow2.position.copy(tip); keep(tGlow2.material); target.add(tGlow2);
    cellG.add(target);
    // signals running from the changed protein to the nucleus: "grow"
    var SIG = 26, sigPos = new Float32Array(SIG * 3), sigPh = new Float32Array(SIG), sr = rng(5);
    for (var q = 0; q < SIG; q++) sigPh[q] = sr();
    var sigG = keep(new BufferGeometry()); sigG.setAttribute('position', new BufferAttribute(sigPos, 3)); sigG.setAttribute('aPhase', new BufferAttribute(new Float32Array(SIG), 1));
    var sigM = keep(new ShaderMaterial({
      uniforms: { uA: { value: new Color(CHANGE) }, uB: { value: new Color(ROSE) }, uC: { value: new Color(PURPLE) }, uLo: { value: -1 }, uHi: { value: 1 },
        uOpacity: { value: 1 }, uTime: { value: 0 }, uSize: { value: 26 }, uPR: { value: pr } },
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, blending: dark ? AdditiveBlending : NormalBlending
    }));
    var signals = new Points(sigG, sigM); cellG.add(signals);
    S.c = { cellW: cellW, cellG: cellG, cellMat: cellMat, tdir: tdir, tip: tip, sigPos: sigPos, sigPh: sigPh, sigG: sigG, sigM: sigM, nucPos: nuc.position.clone(), tGlow2: tGlow2 };
    S.allMats = [bodyMat, lungMat, airMat, cellMat, bodyDots.material, lungDots.material, sigM];

    apply(S.cur = pose(S.level));
    setWorld(world(S.level));
    resize();
    loop();
  });

  // ---- poses: where the camera is, and what is shown, at each level
  var CAM_CELL = new Vector3(0.24, 0.26, 1).normalize();
  function world(l) { return l === 'cell' || l === 'protein' ? 'cell' : 'body'; }
  function tumourWorld(yaw) { var p = TUMOUR.clone(); p.applyAxisAngle(new Vector3(0, 1, 0), yaw); return p; }
  function pose(l) {
    var p = { pos: new Vector3(), look: new Vector3(), yaw: 0, cyaw: 0, bodyOp: 1, lungOp: 0.6, floorOp: 1, sway: 0, canvasOp: 1, flash: 0, tg: 0.12 };
    if (l === 'body') { p.pos.set(0, 0.98, 4.05); p.look.set(0, 0.885, 0); p.sway = reduce ? 0 : 1; p.tg = 0.22; }   // tg: the tumour's glow, bigger when far away
    else if (l === 'lung') { p.yaw = 0.42; p.pos.set(0.1, 1.33, 1.04); p.look.set(-0.03, 1.29, 0); p.bodyOp = 0.2; p.lungOp = 1; p.floorOp = 0; }
    else if (l === 'tumour') { p.yaw = 0.42; var t = tumourWorld(0.42); p.look.copy(t); p.pos.copy(t).add(new Vector3(0.1, 1.33, 1.04).sub(t).normalize().multiplyScalar(0.014)); p.bodyOp = 0.05; p.lungOp = 0.5; p.floorOp = 0; }
    else if (l === 'cell') { p.pos.copy(CAM_CELL).multiplyScalar(4.45); p.sway = reduce ? 0 : 1; }
    else if (l === 'cellNear') { p.pos.copy(CAM_CELL).multiplyScalar(1.25); }
    else if (l === 'cellFar') { p.pos.copy(CAM_CELL).multiplyScalar(11); }
    else if (l === 'protein') { var tip = S.c ? S.c.tip : new Vector3(0, 0, 1); p.look.copy(tip); p.pos.copy(tip).add(CAM_CELL.clone().multiplyScalar(0.05)); p.canvasOp = 0; }
    return p;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(a, b, t) {
    return { pos: a.pos.clone().lerp(b.pos, t), look: a.look.clone().lerp(b.look, t), yaw: lerp(a.yaw, b.yaw, t), cyaw: lerp(a.cyaw, b.cyaw, t),
      bodyOp: lerp(a.bodyOp, b.bodyOp, t), lungOp: lerp(a.lungOp, b.lungOp, t), floorOp: lerp(a.floorOp, b.floorOp, t), sway: lerp(a.sway, b.sway, t),
      canvasOp: lerp(a.canvasOp, b.canvasOp, t), flash: lerp(a.flash, b.flash, t), tg: lerp(a.tg, b.tg, t) };
  }
  function apply(p) {
    if (!S.b) return;
    camera.position.copy(p.pos); camera.lookAt(p.look);
    S.b.bodyMat.uniforms.uOpacity.value = p.bodyOp; S.b.bodyDots.material.uniforms.uOpacity.value = p.bodyOp * 0.9;
    S.b.lungMat.uniforms.uOpacity.value = p.lungOp; S.b.lungDots.material.uniforms.uOpacity.value = p.lungOp; S.b.airMat.uniforms.uOpacity.value = 0.85 * p.lungOp;
    S.b.floor.material.uniforms.uOpacity.value = p.floorOp;
    canvas.style.opacity = p.canvasOp; flash.style.opacity = p.flash;
  }
  function setWorld(w) { if (!S.c) return; bodyW.visible = w === 'body'; S.c.cellW.visible = w === 'cell'; }

  // ---- transitions: a list of timed segments, eased; the last one lands on the level's pose
  function go(target, ms) {
    return ready.then(function () {
      if (!S.alive) return;
      if (S.tw) { S.tw.finish(); }
      var from = S.level;
      S.level = target; S.idle = false;
      if (target === from) return;
      var segs = [], A = world(from), B = world(target), start = mix(S.cur, S.cur, 0);
      start.yaw += S.userYaw || 0; start.cyaw += S.userYawC || 0;   // keep any turn the user gave it, then ease back to the level's angle
      S.userYaw = S.userYawC = S.userPitchC = 0;
      if (from === 'protein') { start = pose('protein'); start.canvasOp = 0; apply(start); setWorld('cell'); }
      if (A === B) segs.push({ to: pose(target), f: 1, ease: easeIO });
      else {
        var exit = A === 'body' ? pose('tumour') : pose('cellFar'), entry = B === 'cell' ? pose('cellNear') : pose('tumour');
        exit.flash = 1; entry.flash = 1; exit.canvasOp = entry.canvasOp = 1;
        if (A === 'cell') { exit.cyaw = start.cyaw; }
        segs.push({ to: exit, f: 0.5, ease: easeIn });
        segs.push({ to: entry, f: 0, jump: true, w: B });
        segs.push({ to: pose(target), f: 0.5, ease: easeOut });
      }
      return run(start, segs, reduce ? 0 : ms);
    });
  }
  function run(start, segs, ms) {
    return new Promise(function (done) {
      var i = 0, segStart = performance.now(), from = start, finished = false;
      function finish() {
        if (finished) return; finished = true; clearTimeout(timer);
        for (; i < segs.length; i++) { if (segs[i].w) setWorld(segs[i].w); from = segs[i].to; }
        S.cur = from; apply(from); S.tw = null; done();
      }
      function step(now) {
        if (finished) return;
        while (i < segs.length) {
          var s = segs[i], d = s.f * ms;
          if (s.jump) { setWorld(s.w); from = s.to; i++; segStart = now; continue; }
          var t = d > 0 ? Math.min(1, (now - segStart) / d) : 1;
          S.cur = mix(from, s.to, s.ease ? s.ease(t) : t); apply(S.cur);
          if (t < 1) return;
          from = s.to; i++; segStart = now;
        }
        finish();
      }
      var timer = setTimeout(finish, ms + 120);   // a background tab can stall animation frames: land anyway
      S.tw = { step: step, finish: finish };
      if (!ms) finish();
    });
  }

  // ---- frame loop
  var tmp = new Vector3();
  function loop() {
    S.raf = requestAnimationFrame(loop);
    if (S.paused || S.idle || !S.b) return;
    var now = performance.now(), t = (now - S.t0) / 1000;
    if (S.tw) S.tw.step(now);
    var p = S.cur, sw = p.sway * (now < S.hold ? 0 : 1);
    bodyG.rotation.y = p.yaw + (S.userYaw || 0) + sw * 0.42 * Math.sin(t * 0.32);
    S.c.cellG.rotation.y = p.cyaw + (S.userYawC || 0) + sw * 0.22 * Math.sin(t * 0.27);
    S.c.cellG.rotation.x = (S.userPitchC || 0) + sw * 0.08 * Math.sin(t * 0.21);
    if (S.level === 'body' || S.level === 'lung') { S.userYawC = 0; S.userPitchC = 0; } else S.userYaw = 0;
    S.allMats.forEach(function (m) { if (m.uniforms.uTime) m.uniforms.uTime.value = t; });
    var pulse = 1 + 0.12 * Math.sin(t * 3.2);
    S.b.tumour.scale.setScalar(pulse); S.b.tGlow.scale.setScalar(p.tg * (0.9 + 0.25 * Math.sin(t * 3.2)));
    S.c.tGlow2.scale.setScalar(0.42 * (0.9 + 0.2 * Math.sin(t * 3.2)));
    for (var i = 0; i < S.c.sigPh.length; i++) {   // signals from the target to the nucleus, on a loop
      var f = (t * 0.22 + S.c.sigPh[i]) % 1, w = Math.sin(f * Math.PI) * 0.06;
      tmp.copy(S.c.tip).lerp(S.c.nucPos, f);
      S.c.sigPos[i * 3] = tmp.x + Math.sin(i * 7.1 + t) * w; S.c.sigPos[i * 3 + 1] = tmp.y + Math.cos(i * 5.3 + t) * w; S.c.sigPos[i * 3 + 2] = tmp.z;
    }
    S.c.sigG.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
    if (opts.onFrame) { try { opts.onFrame(focus()); } catch (e) { /* host error */ } }
    if (S.level === 'protein' && !S.tw) S.idle = true;   // the protein view has taken over: stop drawing
  }
  function focus() {
    if (!S.b) return { visible: false };
    var p = world(S.level) === 'body' ? S.b.tumour.getWorldPosition(tmp) : S.c.tGlow2.getWorldPosition(tmp);
    p.project(camera);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, visible: p.z > -1 && p.z < 1 };
  }

  // ---- drag to turn the body or the cell
  function down(e) { if (e.pointerType === 'touch' && e.isPrimary === false) return; S.drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); }
  function move(e) {
    if (!S.drag) return;
    var dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y; S.drag.x = e.clientX; S.drag.y = e.clientY;
    S.hold = performance.now() + 4000;
    if (world(S.level) === 'body') S.userYaw = (S.userYaw || 0) + dx * 0.01;
    else { S.userYawC = (S.userYawC || 0) + dx * 0.01; S.userPitchC = Math.max(-0.6, Math.min(0.6, (S.userPitchC || 0) + dy * 0.008)); }
  }
  function up() { S.drag = null; }
  canvas.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  S.offs.push(function () { canvas.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); });

  function resize() {
    var w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 0.85 ? 34 : 30;   // narrow phones: a little wider so the whole body fits
    camera.updateProjectionMatrix();
  }
  if (window.ResizeObserver) { var ro = new ResizeObserver(resize); ro.observe(container); S.offs.push(function () { ro.disconnect(); }); }
  if (window.IntersectionObserver) {   // draw only while on screen
    var io = new IntersectionObserver(function (es) { S.paused = !es.some(function (x) { return x.isIntersecting; }); });
    io.observe(container); S.offs.push(function () { io.disconnect(); });
  }

  function destroy() {
    if (!S.alive) return;
    S.alive = false; cancelAnimationFrame(S.raf);
    if (S.tw) S.tw.finish();
    S.offs.forEach(function (f) { f(); });
    disposables.forEach(function (d) { try { d.dispose(); } catch (e) { /* gone */ } });
    renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* gone */ }
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (flash.parentNode) flash.parentNode.removeChild(flash);
  }
  return {
    ready: ready, go: go, focus: focus, destroy: destroy,
    pause: function (p) { S.paused = !!p; if (!p) S.idle = false; },
    level: function () { return S.level; }
  };
}

window.TMBody3D = { supported: supported, create: create, version: '1.0.0' };
