#!/usr/bin/env node
// ============================================================
// ⚠️ ARCHIVO GENERADO por varelza-platform/scripts/generar-sitio.mjs.
// No lo edites aquí: edita la plantilla en platform y regenera.
// ============================================================
// Candado del sitio público: los números que ve un prospecto (precios del
// simulador, rangos de las tarjetas, IVA) salen de varelza-platform/datos/,
// los mismos que cobra la app. Hasta el 21 sept 2026 estaban escritos a
// mano aquí y el simulador anunciaba precios viejos en 361 de 401 tamaños.
//
// Comprueba, sobre lo que se va a comitear (el ÍNDICE), contra origin/main
// de varelza-platform (nunca su checkout):
//   0. que este candado es el de platform, sin recortes;
//   1. que cada región <!--gen:…--> / /*gen:…*/ de index.html es EXACTAMENTE
//      lo que sale de la fuente de hoy (ni editada a mano, ni desfasada);
//   2. que están todas las regiones obligatorias;
//   3. que fuera de las regiones no hay montos, tasa de IVA ni escalones
//      escritos a mano;
//   4. que cada correo @varelza.app, cada número de wa.me y cada
//      data-whatsapp de las páginas con contacto es el oficial
//      (datos/contacto.json);
//   5. que chat-web.js es EXACTAMENTE el de web/chat-web/ de platform, y que
//      está si alguna página lo carga;
//   6. que terminos/index.html, si existe, trae EXACTAMENTE los Términos que
//      aceptan los Administradores (datos/terminos-servicio.{md,json}), y que
//      ese texto ya es el final (sin marcas de borrador: regla de Iván);
//   7. que privacidad/index.html trae EXACTAMENTE el Aviso de Privacidad que
//      acepta cada usuario de la app (datos/aviso-privacidad.md).
// La lógica que calcula las regiones NO está copiada aquí: se lee de
// platform (scripts/sitio/regiones.mjs) y se ejecuta.
// ============================================================
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const SIN_GIT = { ...process.env };
for (const v of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR']) delete SIN_GIT[v];
const REF = process.env.VARELZA_PLATFORM_REF || 'origin/main';
const PADRE = resolve(dirname(execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: RAIZ, encoding: 'utf8' }).trim()), '..');
const PLATFORM = process.env.VARELZA_PLATFORM_DIR || join(PADRE, 'varelza-platform');

function morir(...l) { console.error(`\n❌ ${l[0]}`); for (const x of l.slice(1)) console.error(`   ${x}`); console.error(''); process.exit(1); }
function dePlatform(ruta) {
  try {
    if (!existsSync(PLATFORM)) throw new Error();
    return execFileSync('git', ['show', `${REF}:${ruta}`], { cwd: PLATFORM, encoding: 'utf8', env: SIN_GIT, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    morir(`No pude leer ${ruta} en ${REF} de varelza-platform.`, 'Clona varelza-platform al lado (o VARELZA_PLATFORM_DIR). Si el cambio aún no está fusionado', 'en platform, ése es el orden que falta: primero platform, después el sitio.');
  }
}
const delIndice = (ruta) => {
  try { return execFileSync('git', ['show', `:${ruta}`], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
};

// ── 0. este candado es el de platform ──
const mio = delIndice('scripts/check-sitio.mjs');
if (mio !== null && mio !== dePlatform('scripts/plantillas/check-sitio.plantilla.mjs')) {
  morir(`scripts/check-sitio.mjs no es el de ${REF} de varelza-platform.`, 'O lo editaron aquí, o se quedó viejo. Regenera: VARELZA_WEB_DIR=<este repo> node ../varelza-platform/scripts/generar-sitio.mjs');
}

// ── la lógica de platform, ejecutada tal cual ──
const d = mkdtempSync(join(tmpdir(), 'varelza-check-sitio-'));
writeFileSync(join(d, 'regiones.mjs'), dePlatform('scripts/sitio/regiones.mjs'));
const { regiones, leerRegiones, REQUERIDAS, PROHIBIDO_FUERA, PAGINAS_CONTACTO, revisarContacto, CHAT_WEB, usaChatWeb, PAGINA_TERMINOS, regionesTerminos, problemasParaPublicar, PAGINA_PRIVACIDAD, regionesPrivacidad } = await import(pathToFileURL(join(d, 'regiones.mjs')).href);
const fuentes = {
  tabulador: JSON.parse(dePlatform('datos/tabulador.json')),
  iva: JSON.parse(dePlatform('datos/iva.json')),
  nombresDePlan: JSON.parse(dePlatform('datos/nombres-de-plan.json')),
  contacto: JSON.parse(dePlatform('datos/contacto.json')),
};

const html = delIndice('index.html');
if (html === null) morir('index.html no está en git.');
const mN = html.match(/id="cot-slider"[^>]*\bvalue="(\d+)"/);
if (!mN) morir('no encontré el valor inicial del simulador (id="cot-slider" … value="N").');
const esperadas = regiones(fuentes, { nInicial: Number(mN[1]) });
const presentes = leerRegiones(html);

const mal = [];
// ── 1. cada región, exacta ──
for (const g of presentes) {
  if (!(g.id in esperadas)) mal.push(`región «${g.id}»: la fuente no la conoce`);
  else if (g.contenido !== esperadas[g.id]) mal.push(`región «${g.id}»: no es lo que sale de la fuente de hoy (editada a mano o desfasada)`);
}
// ── 2. las obligatorias ──
for (const id of REQUERIDAS) if (!presentes.some((g) => g.id === id)) mal.push(`falta la región obligatoria «${id}»`);
// ── 3. nada de números a mano fuera de las regiones ──
let fuera = '';
let desde = 0;
for (const g of presentes) { fuera += html.slice(desde, g.inicio) + '\n'; desde = g.fin; }
fuera += html.slice(desde);
fuera.split('\n').forEach((linea, i) => {
  for (const p of PROHIBIDO_FUERA) if (p.patron.test(linea)) mal.push(`fuera de las regiones hay ${p.que}: «${linea.trim().slice(0, 90)}»`);
});

// ── 4. el contacto oficial ──
for (const pagina of PAGINAS_CONTACTO) {
  const texto = delIndice(pagina);
  if (texto === null) continue;
  for (const p of revisarContacto(texto, fuentes)) mal.push(`${pagina}: ${p}`);
}

// ── 5. el chat web es la copia exacta del de platform ──
const chatWeb = delIndice(CHAT_WEB.destino);
const loCargan = PAGINAS_CONTACTO.filter((p) => usaChatWeb(delIndice(p) ?? ''));
if (loCargan.length && chatWeb === null) mal.push(`${loCargan.join(' y ')} carga${loCargan.length > 1 ? 'n' : ''} ${CHAT_WEB.destino}, pero no está en git`);
if (chatWeb !== null && chatWeb !== dePlatform(CHAT_WEB.fuente)) mal.push(`${CHAT_WEB.destino} no es el ${CHAT_WEB.fuente} de ${REF} de platform (editado aquí o desfasado)`);

// ── 6. /terminos/ es el texto que aceptan los Administradores ──
if (PAGINA_TERMINOS) {
  const terminos = delIndice(PAGINA_TERMINOS);
  if (terminos !== null) {
    const textoT = dePlatform('datos/terminos-servicio.md');
    const metaT = JSON.parse(dePlatform('datos/terminos-servicio.json'));
    for (const x of problemasParaPublicar ? problemasParaPublicar(textoT, metaT) : []) mal.push(`${PAGINA_TERMINOS}: los Términos aún no se pueden publicar: ${x}`);
    const esperadasT = regionesTerminos(textoT, metaT);
    const presentesT = leerRegiones(terminos);
    for (const id of Object.keys(esperadasT)) {
      const g = presentesT.find((x) => x.id === id);
      if (!g) mal.push(`${PAGINA_TERMINOS}: falta la región «${id}»`);
      else if (g.contenido !== esperadasT[id]) mal.push(`${PAGINA_TERMINOS}: la región «${id}» no es el texto de datos/terminos-servicio de ${REF} (editada a mano o desfasada)`);
    }
    for (const g of presentesT) if (!(g.id in esperadasT)) mal.push(`${PAGINA_TERMINOS}: región «${g.id}» que la fuente no conoce`);
  }
}

// ── 7. /privacidad/ es el aviso que acepta cada usuario de la app ──
if (PAGINA_PRIVACIDAD) {
  const privacidad = delIndice(PAGINA_PRIVACIDAD);
  if (privacidad === null) mal.push(`${PAGINA_PRIVACIDAD}: falta (el sitio tiene que publicar el Aviso de Privacidad)`);
  else {
    const esperadasP = regionesPrivacidad(dePlatform('datos/aviso-privacidad.md'));
    const presentesP = leerRegiones(privacidad);
    for (const id of Object.keys(esperadasP)) {
      const g = presentesP.find((x) => x.id === id);
      if (!g) mal.push(`${PAGINA_PRIVACIDAD}: falta la región «${id}»`);
      else if (g.contenido !== esperadasP[id]) mal.push(`${PAGINA_PRIVACIDAD}: la región «${id}» no es el texto de datos/aviso-privacidad.md de ${REF} (editada a mano o desfasada)`);
    }
    for (const g of presentesP) if (!(g.id in esperadasP)) mal.push(`${PAGINA_PRIVACIDAD}: región «${g.id}» que la fuente no conoce`);
  }
}

if (mal.length) {
  morir('Los números del sitio no salen de varelza-platform:', ...mal.map((m) => `· ${m}`),
        'Se regeneran con: VARELZA_WEB_DIR=<este repo> node ../varelza-platform/scripts/generar-sitio.mjs',
        'Para cambiar un precio, el IVA, el contacto, el chat web, los Términos o el Aviso de Privacidad se edita la fuente en platform, nunca este archivo.');
}
console.log(`✅ Los números del sitio salen de varelza-platform (${presentes.length} regiones, ${REF}).`);
