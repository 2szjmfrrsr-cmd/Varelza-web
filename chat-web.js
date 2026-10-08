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
  function llamar(cuerpo) {
    return fetch(FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (datos) {
        datos.__status = r.status;
        return datos;
      });
    });
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
    '.panel{position:fixed;bottom:calc(92px + env(safe-area-inset-bottom));' + lado + ':20px;z-index:2147483001;width:370px;max-width:calc(100vw - 32px);height:min(600px, calc(100vh - 120px));background:' + CFG.fondo + ';color:' + CFG.texto + ';border:1px solid ' + CFG.borde + ';border-radius:' + (R + 4) + 'px;box-shadow:0 18px 50px rgba(15,17,21,.24);display:none;flex-direction:column;overflow:hidden;font-size:14.5px;line-height:1.45}' +
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
    'textarea{resize:none;min-height:84px}' +
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
    '.wa{font-size:12px;color:' + CFG.apoyo + ';text-align:center;margin-top:8px}' +
    '@media (prefers-reduced-motion:reduce){.lanzador{transition:none}}' +
    (CFG.degradadoCabecera && colores.length >= 2
      ? '.cab{background:' + RELLENO + ';color:' + CFG.acentoTexto + ';border-bottom:0}.cab p{color:' + CFG.acentoTexto + ';opacity:.8}.cerrar{background:rgba(255,255,255,.4);color:' + CFG.acentoTexto + '}'
      : '');

  var ICONO_CHAT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg>';
  var ICONO_ENVIAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

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

  function whatsappLink() {
    if (!CFG.whatsappActivo || !CFG.whatsapp) return null;
    var p = el('p', { class: 'wa' });
    p.appendChild(document.createTextNode('¿Prefieres WhatsApp? '));
    p.appendChild(el('a', {
      href: 'https://wa.me/' + CFG.whatsapp + '?text=' + encodeURIComponent('Hola, me interesa VARELZA para mi condominio.'),
      target: '_blank',
      rel: 'noopener',
      text: 'Escríbenos ahí',
    }));
    return p;
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
        if (r.codigo === 'apagado') return mostrarAviso(r.error);
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

  var cajaTexto, btnEnviar, errorPie;

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
      reemplazar(pie, [errorPie, el('div', { class: 'envio' }, [cajaTexto, btnEnviar]), whatsappLink()]);
    }
    pintarMensajes();
  }

  function hora(iso) {
    try { return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function pintarMensajes() {
    if (vista !== 'conversacion') return;
    var cerca = cuerpo.scrollHeight - cuerpo.scrollTop - cuerpo.clientHeight < 80;
    var nodos = [];
    var hayStaff = false;
    mensajes.forEach(function (m, i) {
      var mio = m.remitente === 'contacto';
      if (!mio) hayStaff = true;
      if (!mio && (i === 0 || mensajes[i - 1].remitente !== 'staff')) {
        nodos.push(el('p', { class: 'quien', text: (m.autor ? m.autor + ' · ' : '') + 'VARELZA' }));
      }
      nodos.push(el('div', { class: 'burbuja ' + (mio ? 'yo' : 'ellos') }, [
        document.createTextNode(m.texto),
        el('div', { class: 'hora', text: hora(m.created_at) }),
      ]));
    });
    if (!hayStaff) {
      nodos.push(el('p', { class: 'espera', text: 'Recibimos tu mensaje. Te contestamos aquí mismo; si cierras la página, te escribimos al contacto que dejaste.' }));
    }
    reemplazar(cuerpo, nodos);
    if (cerca || !cuerpo.dataset.pintado) cuerpo.scrollTop = cuerpo.scrollHeight;
    cuerpo.dataset.pintado = '1';
  }

  function enviar() {
    var t = cajaTexto.value.trim();
    if (!t || btnEnviar.disabled || !sesion) return;
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
        errorPie.textContent = r.error || 'No se pudo enviar. Intenta de nuevo.';
        errorPie.className = 'error si';
      }
    }).catch(function () {
      btnEnviar.disabled = false;
      errorPie.textContent = 'No hay conexión. Tu mensaje no se envió.';
      errorPie.className = 'error si';
    });
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
