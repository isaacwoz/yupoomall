// @ts-nocheck
"use client";
import React, { useEffect, useRef } from "react";

interface ColorRGB { r: number; g: number; b: number; }
interface Pointer { id: number; texcoordX: number; texcoordY: number; prevTexcoordX: number; prevTexcoordY: number; deltaX: number; deltaY: number; down: boolean; moved: boolean; color: ColorRGB; }

function pointerPrototype(): Pointer {
  return { id: -1, texcoordX: 0, texcoordY: 0, prevTexcoordX: 0, prevTexcoordY: 0, deltaX: 0, deltaY: 0, down: false, moved: false, color: { r: 0, g: 0, b: 0 } };
}

interface SplashCursorProps {
  SIM_RESOLUTION?: number;
  DYE_RESOLUTION?: number;
  DENSITY_DISSIPATION?: number;
  VELOCITY_DISSIPATION?: number;
  PRESSURE?: number;
  PRESSURE_ITERATIONS?: number;
  CURL?: number;
  SPLAT_RADIUS?: number;
  SPLAT_FORCE?: number;
  SHADING?: boolean;
  COLOR_UPDATE_SPEED?: number;
  BACK_COLOR?: ColorRGB;
  TRANSPARENT?: boolean;
}

export default function SplashCursor({
  SIM_RESOLUTION = 128,
  DYE_RESOLUTION = 1440,
  DENSITY_DISSIPATION = 3.5,
  VELOCITY_DISSIPATION = 2,
  PRESSURE = 0.1,
  PRESSURE_ITERATIONS = 20,
  CURL = 3,
  SPLAT_RADIUS = 0.2,
  SPLAT_FORCE = 6000,
  SHADING = true,
  COLOR_UPDATE_SPEED = 10,
  BACK_COLOR = { r: 0, g: 0, b: 0 },
  TRANSPARENT = true,
}: SplashCursorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pointers: Pointer[] = [pointerPrototype()];
    const config = { SIM_RESOLUTION, DYE_RESOLUTION, CAPTURE_RESOLUTION: 512, DENSITY_DISSIPATION, VELOCITY_DISSIPATION, PRESSURE, PRESSURE_ITERATIONS, CURL, SPLAT_RADIUS, SPLAT_FORCE, SHADING, COLOR_UPDATE_SPEED, PAUSED: false, BACK_COLOR, TRANSPARENT };

    const { gl, ext } = getWebGLContext(canvas);
    if (!gl || !ext) return;
    if (!ext.supportLinearFiltering) { config.DYE_RESOLUTION = 256; config.SHADING = false; }

    function getWebGLContext(c: HTMLCanvasElement) {
      const p = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
      let g = c.getContext("webgl2", p) as WebGL2RenderingContext | null;
      if (!g) g = (c.getContext("webgl", p) || c.getContext("experimental-webgl", p)) as WebGL2RenderingContext | null;
      if (!g) return { gl: null, ext: null };
      const isWebGL2 = "drawBuffers" in g;
      let supportLinearFiltering = false;
      let halfFloat: any = null;
      if (isWebGL2) { g.getExtension("EXT_color_buffer_float"); supportLinearFiltering = !!g.getExtension("OES_texture_float_linear"); }
      else { halfFloat = g.getExtension("OES_texture_half_float"); supportLinearFiltering = !!g.getExtension("OES_texture_half_float_linear"); }
      g.clearColor(0, 0, 0, 1);
      const halfFloatTexType = isWebGL2 ? g.HALF_FLOAT : (halfFloat?.HALF_FLOAT_OES || 0);
      let formatRGBA: any, formatRG: any, formatR: any;
      if (isWebGL2) {
        formatRGBA = getSupportedFormat(g, g.RGBA16F, g.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(g, g.RG16F, g.RG, halfFloatTexType);
        formatR = getSupportedFormat(g, g.R16F, g.RED, halfFloatTexType);
      } else {
        formatRGBA = getSupportedFormat(g, g.RGBA, g.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(g, g.RGBA, g.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(g, g.RGBA, g.RGBA, halfFloatTexType);
      }
      return { gl: g, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
    }

    function getSupportedFormat(g: any, internalFormat: number, format: number, type: number): any {
      if (!supportRenderTextureFormat(g, internalFormat, format, type)) {
        if ("drawBuffers" in g) {
          if (internalFormat === g.R16F) return getSupportedFormat(g, g.RG16F, g.RG, type);
          if (internalFormat === g.RG16F) return getSupportedFormat(g, g.RGBA16F, g.RGBA, type);
        }
        return null;
      }
      return { internalFormat, format };
    }

    function supportRenderTextureFormat(g: any, iF: number, f: number, t: number) {
      const tex = g.createTexture(); if (!tex) return false;
      g.bindTexture(g.TEXTURE_2D, tex); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.texImage2D(g.TEXTURE_2D, 0, iF, 4, 4, 0, f, t, null);
      const fbo = g.createFramebuffer(); if (!fbo) return false;
      g.bindFramebuffer(g.FRAMEBUFFER, fbo); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
      return g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
    }

    function hashCode(s: string) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }
    function addKeywords(src: string, kw: string[] | null) { if (!kw) return src; return kw.map(k => `#define ${k}\n`).join("") + src; }

    function compileShader(type: number, source: string, keywords: string[] | null = null) {
      const s = gl.createShader(type); if (!s) return null;
      gl.shaderSource(s, addKeywords(source, keywords)); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.trace(gl.getShaderInfoLog(s));
      return s;
    }

    function createProgram(vs: WebGLShader | null, fs: WebGLShader | null) {
      if (!vs || !fs) return null;
      const p = gl.createProgram(); if (!p) return null;
      gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.trace(gl.getProgramInfoLog(p));
      return p;
    }

    function getUniforms(program: WebGLProgram) {
      const u: Record<string, WebGLUniformLocation | null> = {};
      const c = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < c; i++) { const info = gl.getActiveUniform(program, i); if (info) u[info.name] = gl.getUniformLocation(program, info.name); }
      return u;
    }

    class Program { program: WebGLProgram | null; uniforms: Record<string, WebGLUniformLocation | null>;
      constructor(vs: WebGLShader | null, fs: WebGLShader | null) { this.program = createProgram(vs, fs); this.uniforms = this.program ? getUniforms(this.program) : {}; }
      bind() { if (this.program) gl.useProgram(this.program); }
    }

    class Material { vertexShader: WebGLShader | null; fragmentShaderSource: string; programs: Record<number, WebGLProgram | null> = {}; activeProgram: WebGLProgram | null = null; uniforms: Record<string, WebGLUniformLocation | null> = {};
      constructor(vs: WebGLShader | null, fss: string) { this.vertexShader = vs; this.fragmentShaderSource = fss; }
      setKeywords(keywords: string[]) { let h = 0; for (const k of keywords) h += hashCode(k);
        let p = this.programs[h]; if (!p) { p = createProgram(this.vertexShader, compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords)); this.programs[h] = p; }
        if (p === this.activeProgram) return; if (p) this.uniforms = getUniforms(p); this.activeProgram = p; }
      bind() { if (this.activeProgram) gl.useProgram(this.activeProgram); }
    }

    const baseVS = compileShader(gl.VERTEX_SHADER, `precision highp float;attribute vec2 aPosition;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform vec2 texelSize;void main(){vUv=aPosition*0.5+0.5;vL=vUv-vec2(texelSize.x,0.0);vR=vUv+vec2(texelSize.x,0.0);vT=vUv+vec2(0.0,texelSize.y);vB=vUv-vec2(0.0,texelSize.y);gl_Position=vec4(aPosition,0.0,1.0);}`);
    const copyFS = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;uniform sampler2D uTexture;void main(){gl_FragColor=texture2D(uTexture,vUv);}`);
    const clearFS = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;uniform sampler2D uTexture;uniform float value;void main(){gl_FragColor=value*texture2D(uTexture,vUv);}`);
    const displaySrc = `precision highp float;precision highp sampler2D;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uTexture;uniform vec2 texelSize;vec3 linearToGamma(vec3 c){c=max(c,vec3(0));return max(1.055*pow(c,vec3(0.416666667))-0.055,vec3(0));}void main(){vec3 c=texture2D(uTexture,vUv).rgb;#ifdef SHADING\nvec3 lc=texture2D(uTexture,vL).rgb;vec3 rc=texture2D(uTexture,vR).rgb;vec3 tc=texture2D(uTexture,vT).rgb;vec3 bc=texture2D(uTexture,vB).rgb;float dx=length(rc)-length(lc);float dy=length(tc)-length(bc);vec3 n=normalize(vec3(dx,dy,length(texelSize)));vec3 l=vec3(0.0,0.0,1.0);float diffuse=clamp(dot(n,l)+0.7,0.7,1.0);c*=diffuse;\n#endif\nfloat a=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c,a);}`;
    const splatFS = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uTarget;uniform float aspectRatio;uniform vec3 color;uniform vec2 point;uniform float radius;void main(){vec2 p=vUv-point.xy;p.x*=aspectRatio;vec3 splat=exp(-dot(p,p)/radius)*color;vec3 base=texture2D(uTarget,vUv).xyz;gl_FragColor=vec4(base+splat,1.0);}`);
    const advFS = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uVelocity;uniform sampler2D uSource;uniform vec2 texelSize;uniform vec2 dyeTexelSize;uniform float dt;uniform float dissipation;vec4 bilerp(sampler2D sam,vec2 uv,vec2 tsize){vec2 st=uv/tsize-0.5;vec2 iuv=floor(st);vec2 fuv=fract(st);vec4 a=texture2D(sam,(iuv+vec2(0.5,0.5))*tsize);vec4 b=texture2D(sam,(iuv+vec2(1.5,0.5))*tsize);vec4 c=texture2D(sam,(iuv+vec2(0.5,1.5))*tsize);vec4 d=texture2D(sam,(iuv+vec2(1.5,1.5))*tsize);return mix(mix(a,b,fuv.x),mix(c,d,fuv.x),fuv.y);}void main(){#ifdef MANUAL_FILTERING\nvec2 coord=vUv-dt*bilerp(uVelocity,vUv,texelSize).xy*texelSize;vec4 result=bilerp(uSource,coord,dyeTexelSize);\n#else\nvec2 coord=vUv-dt*texture2D(uVelocity,vUv).xy*texelSize;vec4 result=texture2D(uSource,coord);\n#endif\nfloat decay=1.0+dissipation*dt;gl_FragColor=result/decay;}`, ext.supportLinearFiltering ? null : ["MANUAL_FILTERING"]);
    const divFS = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).x;float R=texture2D(uVelocity,vR).x;float T=texture2D(uVelocity,vT).y;float B=texture2D(uVelocity,vB).y;vec2 C=texture2D(uVelocity,vUv).xy;if(vL.x<0.0){L=-C.x;}if(vR.x>1.0){R=-C.x;}if(vT.y>1.0){T=-C.y;}if(vB.y<0.0){B=-C.y;}float div=0.5*(R-L+T-B);gl_FragColor=vec4(div,0.0,0.0,1.0);}`);
    const curlFS = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).y;float R=texture2D(uVelocity,vR).y;float T=texture2D(uVelocity,vT).x;float B=texture2D(uVelocity,vB).x;float vorticity=R-L-T+B;gl_FragColor=vec4(0.5*vorticity,0.0,0.0,1.0);}`);
    const vortFS = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uVelocity;uniform sampler2D uCurl;uniform float curl;uniform float dt;void main(){float L=texture2D(uCurl,vL).x;float R=texture2D(uCurl,vR).x;float T=texture2D(uCurl,vT).x;float B=texture2D(uCurl,vB).x;float C=texture2D(uCurl,vUv).x;vec2 force=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L));force/=length(force)+0.0001;force*=curl*C;force.y*=-1.0;vec2 velocity=texture2D(uVelocity,vUv).xy;velocity+=force*dt;velocity=min(max(velocity,-1000.0),1000.0);gl_FragColor=vec4(velocity,0.0,1.0);}`);
    const pressFS = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uPressure;uniform sampler2D uDivergence;void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;float divergence=texture2D(uDivergence,vUv).x;float pressure=(L+R+B+T-divergence)*0.25;gl_FragColor=vec4(pressure,0.0,0.0,1.0);}`);
    const gradFS = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uPressure;uniform sampler2D uVelocity;void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;vec2 velocity=texture2D(uVelocity,vUv).xy;velocity.xy-=vec2(R-L,T-B);gl_FragColor=vec4(velocity,0.0,1.0);}`);

    const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,1,1,-1]), gl.STATIC_DRAW);
    const eb = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);

    interface FBO { texture: WebGLTexture; fbo: WebGLFramebuffer; width: number; height: number; texelSizeX: number; texelSizeY: number; attach: (id: number) => number; }
    interface DoubleFBO { width: number; height: number; texelSizeX: number; texelSizeY: number; read: FBO; write: FBO; swap: () => void; }

    const blit = (target: FBO | null, clear = false) => {
      if (!target) { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
      else { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
      if (clear) { gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };

    let dye: DoubleFBO, velocity: DoubleFBO, divergence: FBO, curl: FBO, pressure: DoubleFBO;
    const copyProg = new Program(baseVS, copyFS);
    const clearProg = new Program(baseVS, clearFS);
    const splatProg = new Program(baseVS, splatFS);
    const advProg = new Program(baseVS, advFS);
    const divProg = new Program(baseVS, divFS);
    const curlProg = new Program(baseVS, curlFS);
    const vortProg = new Program(baseVS, vortFS);
    const pressProg = new Program(baseVS, pressFS);
    const gradProg = new Program(baseVS, gradFS);
    const displayMat = new Material(baseVS, displaySrc);

    function createFBO(w: number, h: number, iF: number, f: number, t: number, p: number): FBO {
      gl.activeTexture(gl.TEXTURE0);
      const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, p); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, p);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, iF, w, h, 0, f, t, null);
      const fbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture: tex, fbo, width: w, height: h, texelSizeX: 1/w, texelSizeY: 1/h, attach(id: number) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
    }

    function createDoubleFBO(w: number, h: number, iF: number, f: number, t: number, p: number): DoubleFBO {
      const f1 = createFBO(w, h, iF, f, t, p), f2 = createFBO(w, h, iF, f, t, p);
      return { width: w, height: h, texelSizeX: f1.texelSizeX, texelSizeY: f1.texelSizeY, read: f1, write: f2, swap() { const tmp = this.read; this.read = this.write; this.write = tmp; } };
    }

    function resizeFBO(target: FBO, w: number, h: number, iF: number, f: number, t: number, p: number) {
      const n = createFBO(w, h, iF, f, t, p); copyProg.bind(); if (copyProg.uniforms.uTexture) gl.uniform1i(copyProg.uniforms.uTexture, target.attach(0)); blit(n); return n;
    }

    function resizeDoubleFBO(target: DoubleFBO, w: number, h: number, iF: number, f: number, t: number, p: number) {
      if (target.width === w && target.height === h) return target;
      target.read = resizeFBO(target.read, w, h, iF, f, t, p); target.write = createFBO(w, h, iF, f, t, p);
      target.width = w; target.height = h; target.texelSizeX = 1/w; target.texelSizeY = 1/h; return target;
    }

    function getResolution(res: number) {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      let aspect = w / h; if (aspect < 1) aspect = 1 / aspect;
      const min = Math.round(res), max = Math.round(res * aspect);
      return w > h ? { width: max, height: min } : { width: min, height: max };
    }

    function initFramebuffers() {
      const simRes = getResolution(config.SIM_RESOLUTION), dyeRes = getResolution(config.DYE_RESOLUTION);
      const texType = ext.halfFloatTexType, rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
      const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
      gl.disable(gl.BLEND);
      if (!dye) dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
      else dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
      if (!velocity) velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
      else velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
      divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    }

    function updateKeywords() { const kw: string[] = []; if (config.SHADING) kw.push("SHADING"); displayMat.setKeywords(kw); }

    const scaleByPixelRatio = (v: number) => Math.floor(v * (window.devicePixelRatio || 1));

    updateKeywords(); initFramebuffers();
    let lastUpdateTime = Date.now();
    let colorUpdateTimer = 0;

    function updateFrame() { const dt = calcDeltaTime(); if (resizeCanvas()) initFramebuffers(); updateColors(dt); applyInputs(); step(dt); render(null); requestAnimationFrame(updateFrame); }
    function calcDeltaTime() { const now = Date.now(); let dt = (now - lastUpdateTime) / 1000; dt = Math.min(dt, 0.016666); lastUpdateTime = now; return dt; }
    function resizeCanvas() { const w = scaleByPixelRatio(canvas!.clientWidth), h = scaleByPixelRatio(canvas!.clientHeight); if (canvas!.width !== w || canvas!.height !== h) { canvas!.width = w; canvas!.height = h; return true; } return false; }
    function updateColors(dt: number) { colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED; if (colorUpdateTimer >= 1) { colorUpdateTimer = wrap(colorUpdateTimer, 0, 1); pointers.forEach(p => { p.color = generateColor(); }); } }
    function applyInputs() { for (const p of pointers) { if (p.moved) { p.moved = false; splatPointer(p); } } }

    function step(dt: number) {
      gl.disable(gl.BLEND);
      curlProg.bind(); if (curlProg.uniforms.texelSize) gl.uniform2f(curlProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); if (curlProg.uniforms.uVelocity) gl.uniform1i(curlProg.uniforms.uVelocity, velocity.read.attach(0)); blit(curl);
      vortProg.bind(); if (vortProg.uniforms.texelSize) gl.uniform2f(vortProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); if (vortProg.uniforms.uVelocity) gl.uniform1i(vortProg.uniforms.uVelocity, velocity.read.attach(0)); if (vortProg.uniforms.uCurl) gl.uniform1i(vortProg.uniforms.uCurl, curl.attach(1)); if (vortProg.uniforms.curl) gl.uniform1f(vortProg.uniforms.curl, config.CURL); if (vortProg.uniforms.dt) gl.uniform1f(vortProg.uniforms.dt, dt); blit(velocity.write); velocity.swap();
      divProg.bind(); if (divProg.uniforms.texelSize) gl.uniform2f(divProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); if (divProg.uniforms.uVelocity) gl.uniform1i(divProg.uniforms.uVelocity, velocity.read.attach(0)); blit(divergence);
      clearProg.bind(); if (clearProg.uniforms.uTexture) gl.uniform1i(clearProg.uniforms.uTexture, pressure.read.attach(0)); if (clearProg.uniforms.value) gl.uniform1f(clearProg.uniforms.value, config.PRESSURE); blit(pressure.write); pressure.swap();
      pressProg.bind(); if (pressProg.uniforms.texelSize) gl.uniform2f(pressProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); if (pressProg.uniforms.uDivergence) gl.uniform1i(pressProg.uniforms.uDivergence, divergence.attach(0));
      for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) { if (pressProg.uniforms.uPressure) gl.uniform1i(pressProg.uniforms.uPressure, pressure.read.attach(1)); blit(pressure.write); pressure.swap(); }
      gradProg.bind(); if (gradProg.uniforms.texelSize) gl.uniform2f(gradProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); if (gradProg.uniforms.uPressure) gl.uniform1i(gradProg.uniforms.uPressure, pressure.read.attach(0)); if (gradProg.uniforms.uVelocity) gl.uniform1i(gradProg.uniforms.uVelocity, velocity.read.attach(1)); blit(velocity.write); velocity.swap();
      advProg.bind(); if (advProg.uniforms.texelSize) gl.uniform2f(advProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); if (!ext.supportLinearFiltering && advProg.uniforms.dyeTexelSize) gl.uniform2f(advProg.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      let vid = velocity.read.attach(0); if (advProg.uniforms.uVelocity) gl.uniform1i(advProg.uniforms.uVelocity, vid); if (advProg.uniforms.uSource) gl.uniform1i(advProg.uniforms.uSource, vid); if (advProg.uniforms.dt) gl.uniform1f(advProg.uniforms.dt, dt); if (advProg.uniforms.dissipation) gl.uniform1f(advProg.uniforms.dissipation, config.VELOCITY_DISSIPATION); blit(velocity.write); velocity.swap();
      if (!ext.supportLinearFiltering && advProg.uniforms.dyeTexelSize) gl.uniform2f(advProg.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      if (advProg.uniforms.uVelocity) gl.uniform1i(advProg.uniforms.uVelocity, velocity.read.attach(0)); if (advProg.uniforms.uSource) gl.uniform1i(advProg.uniforms.uSource, dye.read.attach(1)); if (advProg.uniforms.dissipation) gl.uniform1f(advProg.uniforms.dissipation, config.DENSITY_DISSIPATION); blit(dye.write); dye.swap();
    }

    function render(target: FBO | null) { gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.BLEND); displayMat.bind(); if (config.SHADING && displayMat.uniforms.texelSize) gl.uniform2f(displayMat.uniforms.texelSize, 1 / (target ? target.width : gl.drawingBufferWidth), 1 / (target ? target.height : gl.drawingBufferHeight)); if (displayMat.uniforms.uTexture) gl.uniform1i(displayMat.uniforms.uTexture, dye.read.attach(0)); blit(target, false); }

    function splatPointer(pointer: Pointer) { splat(pointer.texcoordX, pointer.texcoordY, pointer.deltaX * config.SPLAT_FORCE, pointer.deltaY * config.SPLAT_FORCE, pointer.color); }
    function clickSplat(pointer: Pointer) { const c = generateColor(); c.r *= 10; c.g *= 10; c.b *= 10; splat(pointer.texcoordX, pointer.texcoordY, 10 * (Math.random() - 0.5), 30 * (Math.random() - 0.5), c); }

    function splat(x: number, y: number, dx: number, dy: number, color: ColorRGB) {
      splatProg.bind(); if (splatProg.uniforms.uTarget) gl.uniform1i(splatProg.uniforms.uTarget, velocity.read.attach(0)); if (splatProg.uniforms.aspectRatio) gl.uniform1f(splatProg.uniforms.aspectRatio, canvas!.width / canvas!.height); if (splatProg.uniforms.point) gl.uniform2f(splatProg.uniforms.point, x, y); if (splatProg.uniforms.color) gl.uniform3f(splatProg.uniforms.color, dx, dy, 0); if (splatProg.uniforms.radius) gl.uniform1f(splatProg.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100)); blit(velocity.write); velocity.swap();
      if (splatProg.uniforms.uTarget) gl.uniform1i(splatProg.uniforms.uTarget, dye.read.attach(0)); if (splatProg.uniforms.color) gl.uniform3f(splatProg.uniforms.color, color.r, color.g, color.b); blit(dye.write); dye.swap();
    }

    function correctRadius(r: number) { const a = canvas!.width / canvas!.height; if (a > 1) r *= a; return r; }
    function generateColor(): ColorRGB { const base = 0.58 + Math.random() * 0.08; const c = HSVtoRGB(base, 0.6, 0.8); c.r *= 0.06; c.g *= 0.06; c.b *= 0.06; return c; }
    function HSVtoRGB(h: number, s: number, v: number): ColorRGB { let r=0,g=0,b=0; const i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s); switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;} return {r,g,b}; }
    function wrap(v: number, min: number, max: number) { const range = max - min; if (range === 0) return min; return ((v - min) % range) + min; }
    function updatePointerDownData(p: Pointer, id: number, x: number, y: number) { p.id = id; p.down = true; p.moved = false; p.texcoordX = x / canvas!.width; p.texcoordY = 1 - y / canvas!.height; p.prevTexcoordX = p.texcoordX; p.prevTexcoordY = p.texcoordY; p.deltaX = 0; p.deltaY = 0; p.color = generateColor(); }
    function updatePointerMoveData(p: Pointer, x: number, y: number, color: ColorRGB) { p.prevTexcoordX = p.texcoordX; p.prevTexcoordY = p.texcoordY; p.texcoordX = x / canvas!.width; p.texcoordY = 1 - y / canvas!.height; const ar = canvas!.width / canvas!.height; p.deltaX = (p.texcoordX - p.prevTexcoordX) * (ar < 1 ? ar : 1); p.deltaY = (p.texcoordY - p.prevTexcoordY) / (ar > 1 ? ar : 1); p.moved = Math.abs(p.deltaX) > 0 || Math.abs(p.deltaY) > 0; p.color = color; }
    function updatePointerUpData(p: Pointer) { p.down = false; }

    const onMouseDown = (e: MouseEvent) => { updatePointerDownData(pointers[0], -1, scaleByPixelRatio(e.clientX), scaleByPixelRatio(e.clientY)); clickSplat(pointers[0]); };
    const firstMouseMove = (e: MouseEvent) => { updateFrame(); updatePointerMoveData(pointers[0], scaleByPixelRatio(e.clientX), scaleByPixelRatio(e.clientY), generateColor()); document.body.removeEventListener("mousemove", firstMouseMove); };
    const onMouseMove = (e: MouseEvent) => { updatePointerMoveData(pointers[0], scaleByPixelRatio(e.clientX), scaleByPixelRatio(e.clientY), pointers[0].color); };

    document.body.addEventListener("mousemove", firstMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      document.body.removeEventListener("mousemove", firstMouseMove);
    };
  }, [SIM_RESOLUTION, DYE_RESOLUTION, DENSITY_DISSIPATION, VELOCITY_DISSIPATION, PRESSURE, PRESSURE_ITERATIONS, CURL, SPLAT_RADIUS, SPLAT_FORCE, SHADING, COLOR_UPDATE_SPEED, BACK_COLOR, TRANSPARENT]);

  return (
    <div className="fixed top-0 left-0 z-50 pointer-events-none w-full h-full">
      <canvas ref={canvasRef} className="w-screen h-screen block" />
    </div>
  );
}
