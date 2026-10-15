/*!
 * VARELZA — chat web para prospectos (K6)
 * Ficha: diseño/varelza-ux-chat-web-prospectos.md (repo Varelza-app)
 *
 * UN solo archivo, sin dependencias y sin React. Se inserta en cualquier
 * HTML estático con una línea:
 *
 *   <script src="chat-web.js" defer
 *           data-supabase-url="https://<ref>.supabase.co"
 *           data-anon-key="<llave pública anon>"
 *           data-privacidad="https://varelza.app/<aviso-de-privacidad>"
 *           data-whatsapp="50254805226"
 *           data-whatsapp-visible="+502 5480 5226"
 *           data-whatsapp-activo="false"></script>
 *
 * Todo vive dentro de un shadow DOM: ni el CSS del sitio (ni su capa
 * responsive con !important) entra, ni el del chat sale.
 *
 * Atributos opcionales de aspecto (para alinearlo con Claude Design sin
 * tocar este archivo): data-posicion (izquierda | derecha), data-acento,
 * data-acento-texto, data-fondo, data-texto, data-apoyo, data-borde,
 * data-radio (px), data-fuente, data-titulo, data-subtitulo.
 *
 * Archivos (Mensajes F2): el staff puede mandar fotos, video, audio y
 * documentos; el visitante, solo fotos (JPG, PNG, WebP) o un PDF de hasta
 * 10 MB (decisión de Iván, 13 oct 2026). Los enlaces de los archivos los
 * firma la función por 10 minutos: por eso se vuelven a pintar con cada
 * lectura, sin recargar lo que ya se ve ni cortar lo que se reproduce.
 *
 * La copia canónica de este archivo vive en Varelza-app/web/chat-web/.
 * Si se copia al repo del sitio, se copia de aquí hacia allá, nunca al
 * revés.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script || window.__varelzaChatWeb) return;
  window.__varelzaChatWeb = true;

  // ── Configuración ────────────────────────────────────────────
  function attr(nombre, porDefecto) {
    var v = script.getAttribute('data-' + nombre);
    return v === null || v === '' ? porDefecto : v;
  }

  var SUPABASE_URL = attr('supabase-url', '').replace(/\/$/, '');
  var ANON_KEY = attr('anon-key', '');
  var FUNCION = attr('funcion', SUPABASE_URL + '/functions/v1/chat-web');
  if (!SUPABASE_URL || !ANON_KEY) {
    console.warn('[VARELZA chat] Faltan data-supabase-url o data-anon-key; el chat no se muestra.');
    return;
  }

  var CFG = {
    posicion: attr('posicion', 'izquierda') === 'derecha' ? 'derecha' : 'izquierda',
    // Durazno con letra oscura: elegido por Iván el 17 sept 2026 después
    // de ver el ladrillo y pedir «menos intenso». La letra va en tinta
    // porque sobre este durazno la blanca cae a 2.05 de contraste, y en
    // tinta llega a 7.6 y 10.1 (mínimo legible: 4.5). El ícono del botón
    // flotante SÍ es blanco, con su propio fondo un punto más fuerte
    // (abajo) para que alcance el 3 que piden los íconos.
    acento: attr('acento', '#FF9D5C'),
    acentoTexto: attr('acento-texto', '#1F2430'),
    fondo: attr('fondo', '#FFFFFF'),
    texto: attr('texto', '#1F2430'),
    apoyo: attr('apoyo', '#565F6E'),
    borde: attr('borde', '#E4E7EB'),
    suave: attr('suave', '#F4F5F7'),
    radio: parseInt(attr('radio', '18'), 10) || 18,
    fuente: attr('fuente', "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"),
    titulo: attr('titulo', 'Platiquemos 👋'),
    subtitulo: attr('subtitulo', '¿Tienes dudas sobre VARELZA? Te responde una persona del equipo.'),
    privacidad: attr('privacidad', 'https://varelza.app/privacidad/'),
    whatsapp: attr('whatsapp', '').replace(/\D/g, ''),
    whatsappActivo: attr('whatsapp-activo', 'false') === 'true',
    // Cómo se le enseña el número a una persona (datos/contacto.json →
    // whatsappVisible; lo escribe y lo revisa el generador del sitio). Si
    // falta, la tarjeta dice «Abrir WhatsApp» en vez del número.
    whatsappVisible: attr('whatsapp-visible', ''),
    // Degradado opcional: dos colores separados por coma («#FF7A45,#FFB347»).
    // Si está, sustituye al acento plano en el botón, los botones de enviar
    // y las burbujas del visitante; con degradado-cabecera también pinta
    // la cabecera del panel.
    degradado: attr('degradado', '#FF9D5C,#FFC49A'),
    degradadoCabecera: attr('degradado-cabecera', 'false') === 'true',
    degradadoControles: attr('degradado-controles', 'false') === 'true',
    degradadoBurbujas: attr('degradado-burbujas', 'true') !== 'false',
    // El botón flotante puede llevar su propio color de ícono y de fondo:
    // es lo único que se ve sin abrir el chat, y a veces pide más peso que
    // el resto (decisión de Iván, 17 sept 2026).
    // ⚠️ #E0722A con ícono blanco da 3.18 de contraste, contra un mínimo de
    // 3 para íconos: 0.18 de margen. Aclarar este naranja, bajarle opacidad
    // al ícono o ponerle una sombra clara lo tumba. No se toca sin volver
    // a medir.
    lanzadorTexto: attr('lanzador-texto', '#FFFFFF'),
    lanzadorFondo: attr('lanzador-fondo', '#E0722A'),
    // Solo para páginas de muestra: abre el panel al cargar.
    abierto: attr('abierto', 'false') === 'true',
  };

  var CLAVE = 'varelza-chat-web';
  var DIAS = 30;

  // ── Almacenamiento (puede no existir: modo privado, bloqueos) ──
  function leerSesion() {
    try {
      var s = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (s && s.token && s.exp > Date.now()) return s;
      localStorage.removeItem(CLAVE);
    } catch (e) {}
    return null;
  }
  function guardarSesion(token, canal) {
    var s = { token: token, canal: canal, exp: Date.now() + DIAS * 86400000 };
    try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) {}
    return s;
  }
  function marcarVisto(id) {
    if (!sesion) return;
    sesion.visto = id;
    try { localStorage.setItem(CLAVE, JSON.stringify(sesion)); } catch (e) {}
  }
  function borrarSesion() {
    try { localStorage.removeItem(CLAVE); } catch (e) {}
  }

  // ── Llamadas a la función ────────────────────────────────────
  function respuesta(r) {
    return r.json().catch(function () { return {}; }).then(function (datos) {
      if (!datos || typeof datos !== 'object') datos = {};
      datos.__status = r.status;
      return datos;
    });
  }

  function llamar(cuerpo) {
    return fetch(FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }).then(respuesta);
  }

  // Un archivo va como multipart/form-data (acción «adjuntar»). Sin
  // Content-Type a mano: el navegador pone el separador del multipart.
  function subirArchivo(token, archivo, texto) {
    var forma = new FormData();
    forma.append('accion', 'adjuntar');
    forma.append('token', token);
    forma.append('archivo', archivo, archivo.name || 'archivo');
    forma.append('texto', texto || '');
    forma.append('sitio_web', '');
    return fetch(FUNCION, { method: 'POST', body: forma }).then(respuesta);
  }

  // Lo que el visitante puede mandar (lo vuelve a revisar el servidor por
  // los primeros bytes; esto solo ahorra una subida que iba a fallar).
  var ADJUNTO_MAX_BYTES = 10 * 1024 * 1024;
  var TIPOS_VISITANTE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  var ACEPTA = TIPOS_VISITANTE.join(',');
  function tipoPermitido(f) {
    if (f.type) return TIPOS_VISITANTE.indexOf(f.type.toLowerCase()) >= 0;
    return /\.(jpe?g|png|webp|pdf)$/i.test(f.name || '');
  }
  function esPdf(f) {
    return (f.type || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(f.name || '');
  }

  // ── DOM ──────────────────────────────────────────────────────
  function el(tag, props, hijos) {
    var n = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (k === 'text') n.textContent = props[k];
        else if (k === 'on') for (var ev in props.on) n.addEventListener(ev, props.on[ev]);
        else n.setAttribute(k, props[k]);
      }
    }
    (hijos || []).forEach(function (h) { if (h) n.appendChild(h); });
    return n;
  }

  // `replaceChildren(null)` pinta el texto "null": se filtran los vacíos.
  function reemplazar(nodo, hijos) {
    nodo.replaceChildren.apply(nodo, hijos.filter(Boolean));
  }

  var host = document.createElement('varelza-chat');
  host.setAttribute('style', 'all: initial !important; position: static !important; display: block !important;');
  var raiz = host.attachShadow({ mode: 'closed' });

  var lado = CFG.posicion === 'derecha' ? 'right' : 'left';
  var colores = CFG.degradado.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  var hayDegradado = colores.length >= 2;
  var DEGRADADO = hayDegradado ? 'linear-gradient(135deg,' + colores.join(',') + ')' : CFG.acento;
  // Regla del manual de marca (línea 392): un degradado NUNCA va en un
  // control — «un botón con degradado deja de parecer un botón». Por eso
  // los botones usan color plano salvo que se pida lo contrario a
  // propósito con data-degradado-controles.
  var RELLENO_BOTON = CFG.degradadoControles && hayDegradado ? DEGRADADO : CFG.acento;
  var RELLENO = CFG.degradadoBurbujas ? DEGRADADO : CFG.acento;
  var LANZADOR_FONDO = CFG.lanzadorFondo || RELLENO_BOTON;
  var LANZADOR_TEXTO = CFG.lanzadorTexto || CFG.acentoTexto;
  var R = CFG.radio;
  var css =
    ':host{all:initial}' +
    '*{box-sizing:border-box;margin:0;padding:0;font-family:' + CFG.fuente + ';}' +
    '.lanzador{position:fixed;bottom:calc(20px + env(safe-area-inset-bottom));' + lado + ':20px;z-index:2147483000;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:' + LANZADOR_FONDO + ';color:' + LANZADOR_TEXTO + ';display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(15,17,21,.22);transition:transform .15s ease}' +
    '.lanzador:hover{transform:scale(1.05)}' +
    '.lanzador:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid ' + CFG.acento + ';outline-offset:2px}' +
    '.punto{position:absolute;top:4px;right:4px;width:14px;height:14px;border-radius:50%;background:#F04438;border:2px solid #fff;display:none}' +
    '.punto.si{display:block}' +
    '.panel{position:fixed;bottom:calc(92px + env(safe-area-inset-bottom));' + lado + ':20px;z-index:2147483001;width:370px;max-width:calc(100vw - 32px);height:min(690px, calc(100vh - 110px));background:' + CFG.fondo + ';color:' + CFG.texto + ';border:1px solid ' + CFG.borde + ';border-radius:' + (R + 4) + 'px;box-shadow:0 18px 50px rgba(15,17,21,.24);display:none;flex-direction:column;overflow:hidden;font-size:14.5px;line-height:1.45}' +
    '.panel.abierto{display:flex}' +
    '@media (max-width:480px){.panel{left:8px;right:8px;width:auto;max-width:none;bottom:calc(84px + env(safe-area-inset-bottom));height:calc(100vh - 100px)}}' +
    '.cab{padding:16px 18px;border-bottom:1px solid ' + CFG.borde + ';display:flex;gap:12px;align-items:flex-start}' +
    '.cab h2{font-size:16.5px;font-weight:800;line-height:1.25}' +
    '.cab p{font-size:13px;color:' + CFG.apoyo + ';margin-top:3px}' +
    '.cerrar{margin-left:auto;flex:none;width:32px;height:32px;border-radius:50%;border:0;background:' + CFG.suave + ';color:' + CFG.texto + ';cursor:pointer;font-size:18px;line-height:1}' +
    '.cuerpo{flex:1;overflow-y:auto;padding:16px 18px}' +
    '.campo{display:block;margin-bottom:12px}' +
    '.campo span{display:block;font-size:12.5px;font-weight:700;margin-bottom:5px}' +
    '.campo small{font-weight:600;color:' + CFG.apoyo + '}' +
    'input,select,textarea{width:100%;font-size:15px;color:' + CFG.texto + ';background:' + CFG.fondo + ';border:1px solid ' + CFG.borde + ';border-radius:' + Math.max(10, R - 6) + 'px;padding:10px 12px;appearance:none;-webkit-appearance:none}' +
    'textarea{resize:none;min-height:72px}' +
    '.fila{display:flex;gap:10px}.fila .campo{flex:1;min-width:0}' +
    '.ayuda{font-size:12px;color:' + CFG.apoyo + ';margin:-4px 0 12px}' +
    '.trampa{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
    '.btn{width:100%;border:0;border-radius:' + Math.max(14, R - 2) + 'px;padding:12px 16px;font-size:15px;font-weight:800;cursor:pointer;background:' + RELLENO_BOTON + ';color:' + CFG.acentoTexto + '}' +
    '.btn[disabled]{opacity:.55;cursor:default}' +
    '.legal{font-size:11.5px;color:' + CFG.apoyo + ';margin-top:10px;text-align:center}' +
    '.legal a,.wa a{color:inherit;text-decoration:underline}' +
    '.error{font-size:13px;color:#B42318;background:#FEECEA;border-radius:12px;padding:9px 12px;margin-bottom:12px;display:none}' +
    '.error.si{display:block}' +
    '.aviso{font-size:14px;color:' + CFG.apoyo + ';text-align:center;padding:30px 8px}' +
    '.burbuja{max-width:84%;padding:9px 13px;border-radius:' + R + 'px;margin-bottom:8px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}' +
    '.yo{margin-left:auto;background:' + RELLENO + ';color:' + CFG.acentoTexto + ';border-bottom-right-radius:6px}' +
    '.ellos{background:' + CFG.suave + ';border-bottom-left-radius:6px}' +
    '.quien{font-size:11.5px;font-weight:700;color:' + CFG.apoyo + ';margin:4px 0 3px 4px}' +
    '.hora{font-size:10.5px;opacity:.7;margin-top:3px;text-align:right}' +
    '.espera{font-size:12.5px;color:' + CFG.apoyo + ';text-align:center;margin:10px 0 4px}' +
    '.pie{border-top:1px solid ' + CFG.borde + ';padding:10px 12px}' +
    '.envio{display:flex;gap:8px;align-items:flex-end}' +
    '.envio textarea{min-height:44px;max-height:120px}' +
    '.enviar{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:' + RELLENO_BOTON + ';color:' + CFG.acentoTexto + ';cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.enviar[disabled]{opacity:.5;cursor:default}' +
    '.wa-tarjeta{display:flex;align-items:center;gap:12px;margin-top:14px;padding:11px 14px;border-radius:' + Math.max(14, R - 2) + 'px;background:#EAF8EF;border:1px solid #BFE8CD;color:#1F2430;text-decoration:none}' +
    '.wa-tarjeta:hover{background:#DDF3E5}' +
    '.wa-ic{flex:none;width:36px;height:36px;border-radius:50%;background:#168A44;color:#fff;display:flex;align-items:center;justify-content:center}' +
    '.wa-tx{display:flex;flex-direction:column;flex:1;min-width:0}.wa-tx b{font-size:14px;font-weight:800}.wa-tx small{font-size:12.5px;color:#3D4654}' +
    '.wa-fl{font-size:18px;font-weight:800;color:#157A3B}' +
    '.wa{font-size:12px;color:' + CFG.apoyo + ';text-align:center;margin-top:8px}' +
    // Archivos dentro de las burbujas (Mensajes F2).
    '.adj{display:block;margin:2px 0 6px;white-space:normal}' +
    '.adj-foto{line-height:0;border-radius:' + Math.max(10, R - 6) + 'px;overflow:hidden}' +
    '.adj-img{display:block;max-width:100%;max-height:240px;height:auto;border-radius:' + Math.max(10, R - 6) + 'px;background:rgba(15,17,21,.06)}' +
    '.adj-video{width:240px;max-width:100%;border-radius:' + Math.max(10, R - 6) + 'px;background:#000}' +
    '.adj-audio{width:240px;max-width:100%}' +
    '.adj-doc{display:flex;align-items:center;gap:10px;padding:8px 10px;min-width:200px;max-width:100%;border-radius:' + Math.max(12, R - 4) + 'px;background:rgba(255,255,255,.6);border:1px solid rgba(15,17,21,.08)}' +
    '.adj-ic{flex:none;width:36px;height:36px;border-radius:10px;background:' + CFG.fondo + ';color:' + CFG.texto + ';border:1px solid ' + CFG.borde + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;letter-spacing:.02em}' +
    '.adj-tx{flex:1;min-width:0;display:flex;flex-direction:column}' +
    '.adj-tx b{font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.adj-tx small{font-size:12px;opacity:.75}' +
    '.adj-abrir{flex:none;font-size:13px;font-weight:800;color:inherit;text-decoration:underline}' +
    '.adj-espera{font-size:13px;font-style:italic;opacity:.8;padding:4px 0}' +
    '.texto-adj{margin-top:4px}' +
    '.clip{flex:none;width:44px;height:44px;border-radius:50%;border:1px solid ' + CFG.borde + ';background:' + CFG.suave + ';color:' + CFG.texto + ';cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.clip[disabled]{opacity:.5;cursor:default}' +
    '.subiendo{font-size:12.5px;color:' + CFG.apoyo + ';margin:0 0 8px 4px}' +
    '.subiendo:empty{display:none}' +
    '@media (prefers-reduced-motion:reduce){.lanzador{transition:none}}' +
    (CFG.degradadoCabecera && colores.length >= 2
      ? '.cab{background:' + RELLENO + ';color:' + CFG.acentoTexto + ';border-bottom:0}.cab p{color:' + CFG.acentoTexto + ';opacity:.8}.cerrar{background:rgba(255,255,255,.4);color:' + CFG.acentoTexto + '}'
      : '');

  var ICONO_CHAT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg>';
  var ICONO_ENVIAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var ICONO_CLIP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

  var estilo = el('style');
  estilo.textContent = css;

  var punto = el('span', { class: 'punto', 'aria-hidden': 'true' });
  var lanzador = el('button', { class: 'lanzador', type: 'button', 'aria-label': 'Abrir el chat con VARELZA', 'aria-expanded': 'false' });
  lanzador.innerHTML = ICONO_CHAT;
  lanzador.appendChild(punto);

  var cuerpo = el('div', { class: 'cuerpo' });
  var pie = el('div', { class: 'pie' });
  pie.style.display = 'none';
  var btnCerrar = el('button', { class: 'cerrar', type: 'button', 'aria-label': 'Cerrar el chat', text: '×' });
  var panel = el('div', { class: 'panel', role: 'dialog', 'aria-label': 'Chat con VARELZA' }, [
    el('div', { class: 'cab' }, [
      el('div', null, [el('h2', { text: CFG.titulo }), el('p', { text: CFG.subtitulo })]),
      btnCerrar,
    ]),
    cuerpo,
    pie,
  ]);

  raiz.appendChild(estilo);
  raiz.appendChild(panel);
  raiz.appendChild(lanzador);

  // ── Estado ───────────────────────────────────────────────────
  var sesion = leerSesion();
  var abierto = false;
  var vista = null; // 'cargando' | 'apagado' | 'formulario' | 'conversacion'
  var mensajes = [];
  var formularioDesde = 0;

  function visible() {
    return abierto && document.visibilityState === 'visible';
  }

  // Tarjeta verde (formulario y aviso) o, con `compacto`, una línea (pie de
  // la conversación, para no quitarle espacio a los mensajes). Decisión de
  // Iván, 7 oct 2026: la opción de WhatsApp tiene que verse.
  // Verde #168A44: 4.42 de contraste con el blanco (el de la marca de
  // WhatsApp, #25D366/#1DA851, se queda en 1.98/3.1).
  var ICONO_WA = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>';
  function whatsappLink(compacto) {
    if (!CFG.whatsappActivo || !CFG.whatsapp) return null;
    var href = 'https://wa.me/' + CFG.whatsapp + '?text=' + encodeURIComponent('Hola, me interesa VARELZA para mi condominio.');
    if (compacto) {
      var p = el('p', { class: 'wa' });
      p.appendChild(document.createTextNode('¿Prefieres WhatsApp? '));
      p.appendChild(el('a', { href: href, target: '_blank', rel: 'noopener', text: 'Escríbenos ahí' }));
      return p;
    }
    var icono = el('span', { class: 'wa-ic' });
    icono.innerHTML = ICONO_WA;
    return el('a', { class: 'wa-tarjeta', href: href, target: '_blank', rel: 'noopener' }, [
      icono,
      el('span', { class: 'wa-tx' }, [
        el('b', { text: '¿Prefieres WhatsApp?' }),
        el('small', { text: CFG.whatsappVisible ? 'Escríbenos al ' + CFG.whatsappVisible : 'Abrir WhatsApp' }),
      ]),
      el('span', { class: 'wa-fl', 'aria-hidden': 'true', text: '→' }),
    ]);
  }

  // ── Vistas ───────────────────────────────────────────────────
  function mostrarAviso(texto) {
    vista = 'apagado';
    pie.style.display = 'none';
    reemplazar(cuerpo, [el('p', { class: 'aviso', text: texto }), whatsappLink()]);
  }

  function mostrarFormulario() {
    vista = 'formulario';
    formularioDesde = Date.now();
    pie.style.display = 'none';

    var error = el('div', { class: 'error', role: 'alert' });
    var nombre = el('input', { type: 'text', name: 'nombre', autocomplete: 'name', maxlength: '80', required: '' });
    var correo = el('input', { type: 'email', name: 'correo', autocomplete: 'email', maxlength: '120', inputmode: 'email' });
    var telefono = el('input', { type: 'tel', name: 'telefono', autocomplete: 'tel', maxlength: '20', inputmode: 'tel' });
    var unidades = el('select', { name: 'unidades' });
    [['', 'Prefiero no decir'], ['1-5', '1 a 5'], ['6-9', '6 a 9'], ['10-40', '10 a 40'], ['41-100', '41 a 100'], ['101-200', '101 a 200'], ['201-400', '201 a 400'], ['400+', 'Más de 400']]
      .forEach(function (o) { unidades.appendChild(el('option', { value: o[0], text: o[1] })); });
    var texto = el('textarea', { name: 'texto', maxlength: '1000', required: '', rows: '3' });
    // Campo trampa: invisible para personas y lectores de pantalla.
    var trampa = el('input', { type: 'text', name: 'sitio_web', tabindex: '-1', autocomplete: 'off' });
    var boton = el('button', { class: 'btn', type: 'submit', text: 'Enviar mensaje' });

    var legal = el('p', { class: 'legal' });
    legal.appendChild(document.createTextNode('Al escribirnos aceptas nuestro '));
    legal.appendChild(el('a', { href: CFG.privacidad, target: '_blank', rel: 'noopener', text: 'Aviso de Privacidad' }));
    legal.appendChild(document.createTextNode('.'));

    function campo(etiqueta, control, opcional) {
      var s = el('span', { text: etiqueta + ' ' });
      if (opcional) s.appendChild(el('small', { text: opcional }));
      return el('label', { class: 'campo' }, [s, control]);
    }

    var form = el('form', { novalidate: '' }, [
      error,
      campo('Tu nombre', nombre),
      el('div', { class: 'fila' }, [campo('Correo', correo), campo('WhatsApp', telefono)]),
      el('p', { class: 'ayuda', text: 'Déjanos al menos uno de los dos para poder responderte.' }),
      campo('Unidades del condominio', unidades, '(opcional)'),
      campo('¿En qué te ayudamos?', texto),
      el('div', { class: 'trampa', 'aria-hidden': 'true' }, [trampa]),
      boton,
      legal,
      whatsappLink(),
    ]);

    function fallar(msg, control) {
      error.textContent = msg;
      error.className = 'error si';
      if (control) control.focus();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      error.className = 'error';
      if (nombre.value.trim().length < 2) return fallar('Escribe tu nombre.', nombre);
      if (!correo.value.trim() && !telefono.value.trim()) return fallar('Déjanos un correo o un WhatsApp para poder responderte.', correo);
      if (!texto.value.trim()) return fallar('Escribe tu mensaje.', texto);

      boton.disabled = true;
      boton.textContent = 'Enviando…';
      llamar({
        accion: 'iniciar',
        nombre: nombre.value,
        correo: correo.value,
        telefono: telefono.value,
        unidades: unidades.value,
        texto: texto.value,
        pagina: location.pathname,
        sitio_web: trampa.value,
        abierto_ms: Date.now() - formularioDesde,
      }).then(function (r) {
        if (r.token) {
          sesion = guardarSesion(r.token, r.canal);
          mensajes = r.mensajes || [];
          mostrarConversacion();
          conectarTiempoReal();
          return;
        }
        boton.disabled = false;
        boton.textContent = 'Enviar mensaje';
        var controles = { nombre: nombre, correo: correo, telefono: telefono, unidades: unidades, texto: texto };
        if (r.codigo === 'apagado') return mostrarAviso(r.mensaje_apagado || r.error);
        fallar(r.error || 'No se pudo enviar. Intenta de nuevo.', controles[r.campo]);
      }).catch(function () {
        boton.disabled = false;
        boton.textContent = 'Enviar mensaje';
        fallar('No hay conexión. Revisa tu internet e intenta de nuevo.');
      });
    });

    cuerpo.replaceChildren(form);
    setTimeout(function () { if (abierto) nombre.focus(); }, 50);
  }

  var cajaTexto, btnEnviar, errorPie, btnAdjuntar, inputArchivo, estadoSubida;
  var subiendo = false;

  function mostrarConversacion() {
    vista = 'conversacion';
    pie.style.display = '';
    if (!cajaTexto) {
      cajaTexto = el('textarea', { rows: '1', maxlength: '1000', 'aria-label': 'Escribe un mensaje', placeholder: 'Escribe un mensaje…' });
      btnEnviar = el('button', { class: 'enviar', type: 'button', 'aria-label': 'Enviar' });
      btnEnviar.innerHTML = ICONO_ENVIAR;
      errorPie = el('div', { class: 'error', role: 'alert' });
      cajaTexto.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar(); }
      });
      cajaTexto.addEventListener('input', function () {
        cajaTexto.style.height = 'auto';
        cajaTexto.style.height = Math.min(120, cajaTexto.scrollHeight + 2) + 'px';
      });
      btnEnviar.addEventListener('click', enviar);
      // Adjuntar (Mensajes F2): el botón abre el selector de archivos; el
      // <input type=file> va escondido y fuera del orden de tabulación.
      inputArchivo = el('input', { type: 'file', accept: ACEPTA, multiple: '', tabindex: '-1', 'aria-hidden': 'true', style: 'display:none' });
      btnAdjuntar = el('button', { class: 'clip', type: 'button', 'aria-label': 'Adjuntar una foto o un PDF (hasta 10 MB)', title: 'Adjuntar foto o PDF (hasta 10 MB)' });
      btnAdjuntar.innerHTML = ICONO_CLIP;
      btnAdjuntar.addEventListener('click', function () { if (!btnAdjuntar.disabled) inputArchivo.click(); });
      inputArchivo.addEventListener('change', function () {
        adjuntarArchivos(inputArchivo.files);
        inputArchivo.value = ''; // para poder elegir el mismo archivo otra vez
      });
      estadoSubida = el('p', { class: 'subiendo', role: 'status', 'aria-live': 'polite' });
      reemplazar(pie, [errorPie, estadoSubida, el('div', { class: 'envio' }, [btnAdjuntar, inputArchivo, cajaTexto, btnEnviar]), whatsappLink(true)]);
    }
    pintarMensajes();
  }

  function hora(iso) {
    try { return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }

  // ── Archivos en las burbujas (Mensajes F2) ───────────────────
  // Los enlaces vienen firmados por 10 minutos y cambian en cada lectura.
  // Cada archivo ya pintado se guarda aquí por su id y se reutiliza: la
  // foto no se vuelve a descargar cada 5 s y el video o audio que se está
  // reproduciendo no se corta. Solo se actualizan los enlaces, y la fuente
  // de un video/audio se cambia cuando está detenido o cuando falla.
  var cacheAdjuntos = {};
  var RENOVAR_MEDIA_MS = 8 * 60000;

  function urlSegura(u) {
    return typeof u === 'string' && /^https:\/\//i.test(u) ? u : null;
  }

  function tamanoLegible(b) {
    if (typeof b !== 'number' || !isFinite(b) || b < 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + ' KB';
    return (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace(/\.0$/, '') + ' MB';
  }

  function etiquetaDocumento(tipo, nombre) {
    var t = (tipo || '').toLowerCase();
    if (t.indexOf('pdf') >= 0) return 'PDF';
    if (/word|opendocument\.text|rtf/.test(t)) return 'DOC';
    if (/sheet|excel|csv/.test(t)) return 'XLS';
    if (/presentation|powerpoint/.test(t)) return 'PPT';
    if (t.indexOf('text/') === 0) return 'TXT';
    var ext = (nombre || '').split('.').pop();
    return ext && ext !== nombre && ext.length <= 4 ? ext.toUpperCase() : 'DOC';
  }

  function reintentarMedia(c) {
    if (!c.media || c.url === c.usada) return;
    var m = c.media;
    var t = m.tagName === 'IMG' ? 0 : (m.currentTime || 0);
    c.usada = c.url;
    c.desde = Date.now();
    m.setAttribute('src', c.url);
    if (t) {
      m.addEventListener('loadedmetadata', function f() {
        m.removeEventListener('loadedmetadata', f);
        try { m.currentTime = t; } catch (e) {}
      });
    }
  }

  function refrescarAdjunto(c, url) {
    c.url = url;
    if (c.enlace) c.enlace.setAttribute('href', url);
    var m = c.media;
    if (!m) return;
    if (m.tagName === 'IMG') {
      if (m.complete && !m.naturalWidth) reintentarMedia(c); // no cargó a tiempo
    } else if (m.paused && (m.currentTime === 0 || m.ended) && Date.now() - c.desde > RENOVAR_MEDIA_MS) {
      reintentarMedia(c);
    }
  }

  function alCargarFoto() {
    if (cuerpo.scrollHeight - cuerpo.scrollTop - cuerpo.clientHeight < 320) cuerpo.scrollTop = cuerpo.scrollHeight;
  }

  function nodoAdjunto(a) {
    if (!a || !a.id) return null;
    var url = urlSegura(a.url);
    var nombre = typeof a.nombre === 'string' ? a.nombre : '';
    var c = cacheAdjuntos[a.id];
    if (c) {
      if (url) refrescarAdjunto(c, url);
      return c.nodo;
    }
    if (!url) {
      return el('div', { class: 'adj adj-espera', text: 'Archivo en camino…' + (nombre ? ' (' + nombre + ')' : '') });
    }
    c = { url: url, usada: url, desde: Date.now(), media: null, enlace: null, nodo: null };
    var cat = a.categoria;
    if (cat === 'imagen') {
      var img = el('img', { class: 'adj-img', src: url, alt: nombre ? 'Foto: ' + nombre : 'Foto', loading: 'lazy' });
      img.addEventListener('load', alCargarFoto);
      c.media = img;
      c.enlace = el('a', {
        class: 'adj adj-foto', href: url, target: '_blank', rel: 'noopener',
        'aria-label': 'Ver la foto en grande' + (nombre ? ' (' + nombre + ')' : '') + ', se abre en otra pestaña',
      }, [img]);
      c.nodo = c.enlace;
    } else if (cat === 'video' || cat === 'audio') {
      var props = { class: 'adj adj-' + cat, controls: '', preload: 'metadata', src: url, 'aria-label': (cat === 'video' ? 'Video' : 'Audio') + (nombre ? ': ' + nombre : '') };
      if (cat === 'video') props.playsinline = '';
      c.media = el(cat, props, [document.createTextNode('Tu navegador no puede reproducir este archivo.')]);
      c.nodo = c.media;
    } else {
      c.enlace = el('a', {
        class: 'adj-abrir', href: url, target: '_blank', rel: 'noopener', text: 'Abrir',
        'aria-label': 'Abrir ' + (nombre || 'el documento') + ', se abre en otra pestaña',
      });
      var tam = tamanoLegible(a.tamano);
      c.nodo = el('div', { class: 'adj adj-doc' }, [
        el('span', { class: 'adj-ic', 'aria-hidden': 'true', text: etiquetaDocumento(a.tipo, nombre) }),
        el('span', { class: 'adj-tx' }, [
          el('b', { text: nombre || 'Documento', title: nombre || 'Documento' }),
          tam ? el('small', { text: tam }) : null,
        ]),
        c.enlace,
      ]);
    }
    if (c.media) c.media.addEventListener('error', function () { reintentarMedia(c); });
    cacheAdjuntos[a.id] = c;
    return c.nodo;
  }

  function pintarMensajes() {
    if (vista !== 'conversacion') return;
    var cerca = cuerpo.scrollHeight - cuerpo.scrollTop - cuerpo.clientHeight < 80;
    var nodos = [];
    var hayStaff = false;
    var vistos = {};
    mensajes.forEach(function (m, i) {
      var mio = m.remitente === 'contacto';
      if (!mio) hayStaff = true;
      if (!mio && (i === 0 || mensajes[i - 1].remitente !== 'staff')) {
        nodos.push(el('p', { class: 'quien', text: (m.autor ? m.autor + ' · ' : '') + 'VARELZA' }));
      }
      var adjuntos = Array.isArray(m.adjuntos) ? m.adjuntos : [];
      var hijos = adjuntos.map(function (a) { if (a && a.id) vistos[a.id] = true; return nodoAdjunto(a); });
      // «📷 Foto» y similares son una etiqueta automática: debajo del
      // archivo no se repiten.
      var texto = typeof m.texto === 'string' ? m.texto : '';
      if (texto && !(m.solo_adjunto && adjuntos.length)) {
        hijos.push(adjuntos.length ? el('div', { class: 'texto-adj', text: texto }) : document.createTextNode(texto));
      }
      hijos.push(el('div', { class: 'hora', text: hora(m.created_at) }));
      nodos.push(el('div', { class: 'burbuja ' + (mio ? 'yo' : 'ellos') }, hijos));
    });
    for (var id in cacheAdjuntos) if (!vistos[id]) delete cacheAdjuntos[id];
    if (!hayStaff) {
      nodos.push(el('p', { class: 'espera', text: 'Recibimos tu mensaje. Te contestamos aquí mismo; si cierras la página, te escribimos al contacto que dejaste.' }));
    }
    reemplazar(cuerpo, nodos);
    if (cerca || !cuerpo.dataset.pintado) cuerpo.scrollTop = cuerpo.scrollHeight;
    cuerpo.dataset.pintado = '1';
  }

  function enviar() {
    var t = cajaTexto.value.trim();
    if (!t || btnEnviar.disabled || subiendo || !sesion) return;
    btnEnviar.disabled = true;
    errorPie.className = 'error';
    llamar({ accion: 'enviar', token: sesion.token, texto: t, sitio_web: '' }).then(function (r) {
      btnEnviar.disabled = false;
      if (r.mensajes) {
        cajaTexto.value = '';
        cajaTexto.style.height = '';
        mensajes = r.mensajes;
        pintarMensajes();
        cuerpo.scrollTop = cuerpo.scrollHeight;
      } else if (r.codigo === 'sin_conversacion') {
        reiniciar();
      } else {
        mostrarErrorPie((r.codigo === 'apagado' && r.mensaje_apagado) || r.error || 'No se pudo enviar. Intenta de nuevo.');
      }
    }).catch(function () {
      btnEnviar.disabled = false;
      mostrarErrorPie('No hay conexión. Tu mensaje no se envió.');
    });
  }

  function mostrarErrorPie(texto) {
    if (!errorPie) return;
    // El aviso agranda el pie: si la lista estaba hasta abajo, que siga ahí.
    var cerca = cuerpo.scrollHeight - cuerpo.scrollTop - cuerpo.clientHeight < 80;
    errorPie.textContent = texto;
    errorPie.className = 'error si';
    if (cerca) cuerpo.scrollTop = cuerpo.scrollHeight;
  }

  // ── Adjuntar (Mensajes F2) ───────────────────────────────────
  // Uno por uno, en orden. Si el visitante escribió algo, viaja con el
  // primer archivo (y se limpia la caja solo si ese archivo llegó).
  function errorDeSubida(r, archivo) {
    if (r.codigo === 'apagado') return r.mensaje_apagado || r.error;
    if (r.error) return r.error;
    if (r.__status === 413) return '«' + (archivo.name || 'El archivo') + '» pesa más de 10 MB. Prueba con uno más ligero.';
    return 'No se pudo subir «' + (archivo.name || 'el archivo') + '». Intenta de nuevo.';
  }

  function ponerSubiendo(si) {
    subiendo = si;
    btnAdjuntar.disabled = si;
    btnEnviar.disabled = si;
    if (si) pie.setAttribute('aria-busy', 'true');
    else { pie.removeAttribute('aria-busy'); estadoSubida.textContent = ''; }
  }

  function adjuntarArchivos(lista) {
    if (!sesion || subiendo || btnEnviar.disabled) return;
    var archivos = Array.prototype.slice.call(lista || []);
    if (!archivos.length) return;
    errorPie.className = 'error';
    var avisos = [];
    var validos = archivos.filter(function (f) {
      var n = f.name || 'Ese archivo';
      if (!tipoPermitido(f)) { avisos.push('«' + n + '» no se envió: aquí puedes mandarnos fotos (JPG, PNG o WebP) o PDF.'); return false; }
      if (f.size > ADJUNTO_MAX_BYTES) { avisos.push('«' + n + '» pesa más de 10 MB. Prueba con uno más ligero.'); return false; }
      if (!f.size) { avisos.push('«' + n + '» está vacío.'); return false; }
      return true;
    });
    if (!validos.length) return mostrarErrorPie(avisos.join(' '));

    var texto = cajaTexto.value.trim();
    var i = 0;
    ponerSubiendo(true);

    function terminar(error) {
      ponerSubiendo(false);
      if (error) avisos.push(error);
      if (avisos.length) mostrarErrorPie(avisos.join(' '));
    }

    function siguiente() {
      if (!sesion) return terminar();
      if (i >= validos.length) return terminar();
      var f = validos[i];
      estadoSubida.textContent = validos.length > 1
        ? 'Subiendo ' + (i + 1) + ' de ' + validos.length + '…'
        : (esPdf(f) ? 'Subiendo tu PDF…' : 'Subiendo tu foto…');
      subirArchivo(sesion.token, f, i === 0 ? texto : '').then(function (r) {
        if (r.mensajes) {
          if (i === 0 && texto && cajaTexto.value.trim() === texto) {
            cajaTexto.value = '';
            cajaTexto.style.height = '';
          }
          mensajes = r.mensajes;
          pintarMensajes();
          cuerpo.scrollTop = cuerpo.scrollHeight;
          i++;
          siguiente();
        } else if (r.codigo === 'sin_conversacion') {
          terminar();
          reiniciar();
        } else {
          terminar(errorDeSubida(r, f));
        }
      }).catch(function () {
        terminar('No hay conexión. «' + (f.name || 'El archivo') + '» no se envió.');
      });
    }
    siguiente();
  }

  function reiniciar() {
    borrarSesion();
    sesion = null;
    mensajes = [];
    desconectarTiempoReal();
    abrirVistaInicial();
  }

  // ── Lectura de mensajes (aviso en vivo + respaldo) ───────────
  var leyendo = false;
  function leer() {
    if (!sesion || leyendo) return;
    leyendo = true;
    llamar({ accion: 'leer', token: sesion.token, visible: visible() }).then(function (r) {
      leyendo = false;
      if (r.codigo === 'sin_conversacion') return reiniciar();
      // Chat apagado del todo (p. ej. sin el secreto de la función): se
      // dice con el aviso del staff, que ofrece el correo.
      if (r.codigo === 'apagado') {
        if (vista === 'conversacion') mostrarErrorPie(r.mensaje_apagado || r.error || 'El chat no está disponible en este momento.');
        return;
      }
      if (!r.mensajes) return;
      mensajes = r.mensajes;
      var ultimo = mensajes.length ? mensajes[mensajes.length - 1] : null;
      if (ultimo && ultimo.remitente === 'staff' && ultimo.id !== sesion.visto) {
        if (visible()) { marcarVisto(ultimo.id); punto.className = 'punto'; }
        else punto.className = 'punto si';
      }
      if (vista === 'conversacion') pintarMensajes();
    }).catch(function () { leyendo = false; });
  }

  // Realtime (Broadcast público) con el protocolo de Phoenix a mano, para
  // no cargar supabase-js desde fuera. El aviso no trae texto: solo
  // dispara `leer()`.
  var ws = null, unido = false, latido = null, reintento = 0, temporizadorReconexion = null;

  function conectarTiempoReal() {
    if (!sesion || !sesion.canal || ws || !('WebSocket' in window)) return;
    var url = SUPABASE_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(ANON_KEY) + '&vsn=1.0.0';
    var ref = 0;
    try { ws = new WebSocket(url); } catch (e) { ws = null; return; }
    ws.onopen = function () {
      reintento = 0;
      ws.send(JSON.stringify({
        topic: 'realtime:chat-web:' + sesion.canal,
        event: 'phx_join',
        payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: false }, access_token: ANON_KEY },
        ref: String(++ref),
        join_ref: '1',
      }));
      latido = setInterval(function () {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }));
      }, 25000);
    };
    ws.onmessage = function (e) {
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.event === 'phx_reply' && m.ref === '1') {
        unido = m.payload && m.payload.status === 'ok';
        if (unido) leer(); // por si llegó algo mientras no estábamos
      } else if (m.event === 'broadcast') {
        leer();
      }
    };
    ws.onclose = function () {
      clearInterval(latido);
      ws = null;
      unido = false;
      if (!sesion || document.visibilityState !== 'visible') return;
      reintento = Math.min(reintento + 1, 6);
      temporizadorReconexion = setTimeout(conectarTiempoReal, 1000 * Math.pow(2, reintento));
    };
    ws.onerror = function () { try { ws && ws.close(); } catch (e) {} };
  }

  function desconectarTiempoReal() {
    clearTimeout(temporizadorReconexion);
    clearInterval(latido);
    if (ws) { var w = ws; ws = null; try { w.onclose = null; w.close(); } catch (e) {} }
    unido = false;
  }

  // Respaldo y «visto»: con el canal unido, una consulta por minuto
  // mientras el chat está abierto (marca «visto» para que el staff no le
  // mande correo). Sin canal: cada 5 s abierto, cada 30 s cerrado.
  var ultimoTick = 0;
  setInterval(function () {
    if (!sesion || document.visibilityState !== 'visible') return;
    var cada = unido ? (abierto ? 60000 : Infinity) : (abierto ? 5000 : 30000);
    if (Date.now() - ultimoTick >= cada) { ultimoTick = Date.now(); leer(); }
  }, 1000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && sesion) {
      if (abierto) punto.className = 'punto';
      conectarTiempoReal();
      leer();
    }
  });

  // ── Abrir / cerrar ───────────────────────────────────────────
  function abrirVistaInicial() {
    if (sesion) {
      vista = 'cargando';
      cuerpo.replaceChildren(el('p', { class: 'aviso', text: 'Cargando tu conversación…' }));
      llamar({ accion: 'leer', token: sesion.token, visible: true }).then(function (r) {
        if (r.codigo === 'sin_conversacion') return reiniciar();
        if (r.codigo === 'apagado') return mostrarAviso(r.mensaje_apagado || r.error || 'El chat no está disponible en este momento.');
        mensajes = r.mensajes || [];
        mostrarConversacion();
        conectarTiempoReal();
      }).catch(function () { mostrarAviso('No hay conexión. Intenta de nuevo en un momento.'); });
      return;
    }
    vista = 'cargando';
    cuerpo.replaceChildren(el('p', { class: 'aviso', text: 'Un momento…' }));
    llamar({ accion: 'estado' }).then(function (r) {
      if (r.activo) mostrarFormulario();
      else mostrarAviso(r.mensaje_apagado || 'El chat no está disponible en este momento.');
    }).catch(function () { mostrarAviso('No hay conexión. Intenta de nuevo en un momento.'); });
  }

  function abrir() {
    abierto = true;
    panel.className = 'panel abierto';
    lanzador.setAttribute('aria-expanded', 'true');
    lanzador.setAttribute('aria-label', 'Cerrar el chat con VARELZA');
    punto.className = 'punto';
    if (!vista || vista === 'apagado') abrirVistaInicial();
    else if (vista === 'conversacion') { leer(); setTimeout(function () { cajaTexto && cajaTexto.focus(); }, 50); }
  }

  function cerrar() {
    abierto = false;
    panel.className = 'panel';
    lanzador.setAttribute('aria-expanded', 'false');
    lanzador.setAttribute('aria-label', 'Abrir el chat con VARELZA');
    lanzador.focus();
  }

  lanzador.addEventListener('click', function () { abierto ? cerrar() : abrir(); });
  btnCerrar.addEventListener('click', cerrar);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });

  function montar() {
    document.body.appendChild(host);
    // Quien ya tenía conversación recibe el aviso de respuesta aunque no
    // abra el chat (punto rojo en el botón).
    if (sesion) { conectarTiempoReal(); leer(); }
    if (CFG.abierto) abrir();
  }
  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
