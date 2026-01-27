// ===============================
//  TURNERO SAVIA (CLIENTE) ✅
//  - Turnos normales + Turnos especiales con filtro por categoría
//  - Bloquea turnos normales en día especial
//  - Solapa de servicios (solo categoría del especial)
//  - Evita doble reserva (fecha+hora) antes de guardar
//  ✅ NUEVO: Solapa/accordion para lista larga de servicios especiales (con scroll)
//  ✅ NUEVO: Modalidad SIEMPRE: Presencial + Online
// ===============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  setDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

console.log("Turnero Savia: módulo cargado ✅");

// =======================
//   CONFIG FIREBASE
// =======================
const firebaseConfig = {
  apiKey: "AIzaSyBs3V8rJ6cKI08IADuzecAI9XUL3740Gb4",
  authDomain: "savia-74c89.firebaseapp.com",
  projectId: "savia-74c89",
  storageBucket: "savia-74c89.firebasestorage.app",
  messagingSenderId: "627564458830",
  appId: "1:627564458830:web:deb7ee624592236a91241f",
};

let db = null;
let firebaseOK = false;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  firebaseOK = true;
  console.log("Firebase inicializado correctamente ✅");
} catch (err) {
  console.error("Error inicializando Firebase ❌", err);
}

// =======================
//   NEGOCIO ACTUAL
// =======================
const params = new URLSearchParams(window.location.search);
// ej: turnos.html?negocio=belleza
const negocioId = params.get("negocio") || "belleza";

let negocioRef = null;
let serviciosCol = null;
let turnosCol = null;
let especialesCol = null;

if (firebaseOK) {
  negocioRef = doc(db, "negocios", negocioId);
  serviciosCol = collection(negocioRef, "servicios");
  turnosCol = collection(negocioRef, "turnos");
  especialesCol = collection(negocioRef, "especiales");
}

// =======================
//   REFERENCIAS DOM
// =======================
const logoNegocio = document.getElementById("logo-negocio");
const nombreNegocioEl = document.getElementById("bk-nombre-negocio");
const sloganEl = document.getElementById("bk-slogan");
const rubroEl = document.getElementById("bk-rubro");
const direccionEl = document.getElementById("bk-direccion");
const linkMapasEl = document.getElementById("bk-link-mapas");
const horariosResumenEl = document.getElementById("bk-horarios-resumen");

const waFab = document.getElementById("wa-fab");
const waBottom = document.getElementById("bk-wa-bottom");
const igBottom = document.getElementById("bk-ig-bottom");
const fbBottom = document.getElementById("bk-fb-bottom");
const linkSaviaEl = document.getElementById("bk-link-savia");

const form = document.getElementById("booking-form");
const categoriaGroup = document.getElementById("bk-categoria-group");
const selectCategoria = document.getElementById("bk-categoria");
const selectServicio = document.getElementById("bk-servicio");
const inputDia = document.getElementById("bk-dia");
const modalidadGroup = document.getElementById("bk-modalidad-group");
const selectModalidad = document.getElementById("bk-modalidad");
const horariosScroll = document.getElementById("bk-horarios-scroll");
const selectHorario = document.getElementById("bk-horario");
const seniaInfo = document.getElementById("bk-senia-info");
const inputNombreCliente = document.getElementById("bk-nombre-cliente");
const inputTelefono = document.getElementById("bk-telefono");
const inputMail = document.getElementById("bk-mail");

// Especiales (DOM)
const specialsSection = document.getElementById("bk-specials");
const specialsList = document.getElementById("bk-specials-list");
const specialsActive = document.getElementById("bk-specials-active");
const specialsClearBtn = document.getElementById("bk-specials-clear");

// filtro categoría + empty state
const specialsCatSelect = document.getElementById("bk-specials-cat");
const specialsEmpty = document.getElementById("bk-specials-empty");

// Solapa de servicios (panel) especiales
const specialsPanel = document.getElementById("bk-specials-panel");
const specialsCatName = document.getElementById("bk-specials-catname");
const specialsSvcList = document.getElementById("bk-specials-svclist");

// Overlay confirmación
const confirmMsg = document.getElementById("bk-confirm");
const confirmData = document.getElementById("bk-confirm-data");
const cancelBtn = document.getElementById("bk-cancel-turno");
const saveExitBtn = document.getElementById("bk-save-exit");

// =======================
//   STATE
// =======================
const state = {
  negocio: {},
  config: { apertura: "09:00", cierre: "20:00", duracionMin: 30 },

  servicios: [],
  horariosBase: [],
  horariosBaseNormal: [],
  horariosOcupados: new Set(),

  especiales: [],
  modo: "normal", // "normal" | "especial"
  especialActivo: null, // {id, fecha, categoria, servicioId?, promo, slots[]}
};

let ultimoTurnoDoc = null;

// =======================
//   HELPERS
// =======================
function normCat(cat) {
  return String(cat || "General").trim();
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateObjToIsoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fechaToIso(value) {
  if (!value) return "";
  if (typeof value === "string") return value; // "YYYY-MM-DD"
  if (value instanceof Date) return dateObjToIsoLocal(value);
  if (typeof value === "object" && typeof value.toDate === "function") {
    return dateObjToIsoLocal(value.toDate());
  }
  return "";
}

function normalizarHora(h) {
  if (!h || typeof h !== "string") return "";
  const parts = h.split(":");
  const hh = String(parseInt(parts[0] || "0", 10)).padStart(2, "0");
  const mm = String(parseInt(parts[1] || "0", 10)).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatearFecha(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function sumarDiasIso(iso, dias) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return dateObjToIsoLocal(dt);
}

function generarSlots(apertura, cierre, duracionMin) {
  const [ah, am] = (apertura || "09:00").split(":").map(Number);
  const [ch, cm] = (cierre || "20:00").split(":").map(Number);
  let inicio = ah * 60 + am;
  const fin = ch * 60 + cm;
  const paso = duracionMin || 30;

  const slots = [];
  while (inicio < fin) {
    const hh = String(Math.floor(inicio / 60)).padStart(2, "0");
    const mm = String(inicio % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
    inicio += paso;
  }
  return slots;
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatearPrecio(precio) {
  const n = Number(precio || 0);
  if (!n) return "";
  return "$ " + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ✅ evita duplicar precio/duración si ya vienen en el nombre
function labelServicio(s) {
  const nombre = String(s?.nombre || "Servicio").trim();

  const traePrecioEnNombre =
    /\$|ar\$|ars\b/i.test(nombre) || /\b\d{1,3}(\.\d{3})+\b/.test(nombre);

  const traeDuracionEnNombre =
    /(\b\d{1,3}\s*(min|m)\b)|(\b\d{1,3}\s*['"]\b)/i.test(nombre);

  const parts = [nombre];
  if (Number(s?.precio || 0) > 0 && !traePrecioEnNombre) parts.push(formatearPrecio(s.precio));
  if (Number(s?.duracionMin || 0) > 0 && !traeDuracionEnNombre) parts.push(`${s.duracionMin}'`);
  return parts.join(" · ");
}

function obtenerServicioSeleccionado() {
  const id = selectServicio?.value;
  if (!id) return null;
  return state.servicios.find((s) => s.id === id) || null;
}

function servicioById(id) {
  return state.servicios.find((s) => s.id === id) || null;
}

function especialPorFecha(fechaIso) {
  if (!fechaIso) return null;
  return state.especiales.find((e) => e.fecha === fechaIso) || null;
}

function buscarProximoDiaNormal(desdeIso) {
  const base = desdeIso || todayIso();
  for (let i = 0; i < 60; i++) {
    const d = sumarDiasIso(base, i);
    if (!especialPorFecha(d)) return d;
  }
  return todayIso();
}

function clearHorarioSelection() {
  if (selectHorario) selectHorario.value = "";
  document.querySelectorAll(".slot-btn").forEach((b) => b.classList.remove("selected"));
}

// =======================
//   UI EXTRA: ocultar selects normales en día especial
// =======================
let servicioWrap = null;

function getFieldWrapper(el) {
  if (!el) return null;
  return (
    el.closest(".form-group") ||
    el.closest(".field") ||
    el.closest(".bk-field") ||
    el.closest(".input-group") ||
    el.parentElement
  );
}

function cacheWrappers() {
  servicioWrap = getFieldWrapper(selectServicio);
}

function setModoEspecialUI(isEspecial) {
  // En día especial: ocultamos los selects normales para que NO se vea doble
  if (categoriaGroup) categoriaGroup.style.display = isEspecial ? "none" : "";
  if (servicioWrap) servicioWrap.style.display = isEspecial ? "none" : "";
}

// =======================
//   UI: SOLAPA (ACCORDION) PARA LISTA LARGA
// =======================
function injectAccordionStyles() {
  if (document.getElementById("bk-acc-css")) return;

  const css = document.createElement("style");
  css.id = "bk-acc-css";
  css.textContent = `
    .bk-acc-head{
      width:100%;
      border:1px solid rgba(148,163,184,.35);
      background:rgba(255,255,255,.9);
      border-radius:18px;
      padding:12px 14px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      cursor:pointer;
      font-family:inherit;
      box-shadow:0 14px 28px rgba(15,23,42,.08);
    }
    .bk-acc-left{min-width:0;display:flex;flex-direction:column;gap:3px;text-align:left;}
    .bk-acc-title{font-weight:900;font-size:.92rem;color:#0f172a;line-height:1.1;}
    .bk-acc-sub{font-weight:800;font-size:.78rem;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .bk-acc-sub b{color:#0f172a;}
    .bk-acc-right{display:flex;align-items:center;gap:10px;flex-shrink:0;}
    .bk-acc-badge{
      padding:6px 10px;
      border-radius:999px;
      font-weight:900;
      font-size:.75rem;
      background:rgba(75,175,140,.12);
      color:var(--accent,#4BAF8C);
      border:1px solid rgba(75,175,140,.25);
    }
    .bk-acc-chev{transition:transform .25s ease;color:#334155;}
    .bk-acc-body{
      margin-top:10px;
      border:1px solid rgba(148,163,184,.25);
      border-radius:18px;
      background:rgba(255,255,255,.85);
      overflow:hidden;
      max-height:0px;
      transition:max-height .35s cubic-bezier(.2,.85,.2,1);
    }
    .bk-acc-body-inner{
      padding:10px;
      max-height:360px; /* ✅ scroll interno */
      overflow:auto;
      -webkit-overflow-scrolling:touch;
    }
    .bk-acc-panel.is-open .bk-acc-body{max-height:420px;}
    .bk-acc-panel.is-open .bk-acc-chev{transform:rotate(180deg);}
  `;
  document.head.appendChild(css);
}

function setupSpecialsAccordion() {
  if (!specialsPanel || !specialsSvcList) return;
  if (specialsPanel.dataset.accReady === "1") return;

  injectAccordionStyles();

  // Armamos estructura:
  // [button head] + [body (scroll) con specialsSvcList]
  const head = document.createElement("button");
  head.type = "button";
  head.className = "bk-acc-head";
  head.setAttribute("aria-expanded", "false");

  const left = document.createElement("div");
  left.className = "bk-acc-left";

  const title = document.createElement("div");
  title.className = "bk-acc-title";
  title.textContent = "Servicios disponibles";

  const sub = document.createElement("div");
  sub.className = "bk-acc-sub";
  // Vamos a meter ahí: "En <b>categoría</b> · Seleccionado: ..."
  const catEl = specialsCatName || document.createElement("span");
  catEl.style.fontWeight = "900";

  const sel = document.createElement("span");
  sel.id = "bk-acc-selected";
  sel.style.marginLeft = "10px";
  sel.style.fontWeight = "900";
  sel.style.color = "#0f172a";

  sub.innerHTML = `En <b></b> ·`;
  // reemplazamos ese <b></b> por el catEl real:
  const bTag = sub.querySelector("b");
  if (bTag) {
    bTag.replaceWith(catEl);
  }
  sub.appendChild(sel);

  left.appendChild(title);
  left.appendChild(sub);

  const right = document.createElement("div");
  right.className = "bk-acc-right";

  const badge = document.createElement("span");
  badge.className = "bk-acc-badge";
  badge.id = "bk-acc-badge";
  badge.textContent = "0 servicios";

  const chev = document.createElement("i");
  chev.className = "fa-solid fa-chevron-down bk-acc-chev";

  right.appendChild(badge);
  right.appendChild(chev);

  head.appendChild(left);
  head.appendChild(right);

  const body = document.createElement("div");
  body.className = "bk-acc-body";

  const inner = document.createElement("div");
  inner.className = "bk-acc-body-inner";

  // movemos la lista adentro
  inner.appendChild(specialsSvcList);
  body.appendChild(inner);

  // limpiamos panel y lo armamos
  specialsPanel.innerHTML = "";
  specialsPanel.classList.add("bk-acc-panel");
  specialsPanel.appendChild(head);
  specialsPanel.appendChild(body);

  // toggle
  head.addEventListener("click", () => {
    const open = specialsPanel.classList.toggle("is-open");
    head.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // por defecto: cerrado
  specialsPanel.classList.remove("is-open");
  head.setAttribute("aria-expanded", "false");

  specialsPanel.dataset.accReady = "1";
}

function updateSpecialsAccordionMeta({ count = 0, selectedText = "" } = {}) {
  if (!specialsPanel) return;
  const badge = specialsPanel.querySelector("#bk-acc-badge");
  const selected = specialsPanel.querySelector("#bk-acc-selected");

  if (badge) badge.textContent = `${count} servicio${count === 1 ? "" : "s"}`;
  if (selected) selected.textContent = selectedText ? ` Seleccionado: ${selectedText}` : "";
}

// =======================
//   LOGO full (opcional)
// =======================
function ajustarLogoSinPadding() {
  if (!logoNegocio) return;
  logoNegocio.style.width = "100%";
  logoNegocio.style.height = "100%";
  logoNegocio.style.objectFit = "cover";
  logoNegocio.style.display = "block";
  const wrap = logoNegocio.parentElement;
  if (wrap) {
    wrap.style.padding = "0";
    wrap.style.overflow = "hidden";
  }
}

// =======================
//   CARGA DESDE FIREBASE
// =======================
async function cargarNegocioYConfig() {
  if (!firebaseOK) {
    console.warn("Firebase no está OK, uso datos por defecto (demo).");
    return;
  }

  const snap = await getDoc(negocioRef);

  if (!snap.exists()) {
    const data = {
      nombre: "Estética Bellezza",
      rubro: "Estética · Uñas · Masajes",
      slogan: "Belleza con un clic.",
      colorPrincipal: "#4BAF8C",
      whatsapp: "5492613334444",
      instagram: "",
      facebook: "",
      direccion: "San Martín 123",
      ciudad: "Maipú · Mendoza",
      horariosResumen: "Lunes a viernes 09:00 a 20:00 hs · Sábados 09:00 a 13:00 hs",
      apertura: "09:00",
      cierre: "20:00",
      duracionMin: 30,
      aliasPago: "",
      mapsUrl: "",
      logoUrl: "",
      urlSavia: "",
    };
    await setDoc(negocioRef, data);
    state.negocio = data;
  } else {
    state.negocio = snap.data() || {};
  }

  state.config = {
    apertura: state.negocio.apertura || "09:00",
    cierre: state.negocio.cierre || "20:00",
    duracionMin: state.negocio.duracionMin || 30,
  };

  state.horariosBase = generarSlots(state.config.apertura, state.config.cierre, state.config.duracionMin);
  state.horariosBaseNormal = [...state.horariosBase];

  document.documentElement.style.setProperty(
    "--accent",
    state.negocio.colorPrincipal || state.negocio.color || "#4BAF8C"
  );

  if (nombreNegocioEl) nombreNegocioEl.textContent = state.negocio.nombre || "Nombre del negocio";
  if (sloganEl) sloganEl.textContent = state.negocio.slogan || "Slogan o frase corta.";
  if (rubroEl) rubroEl.textContent = state.negocio.rubro || "Estética · Peluquería · Bienestar";

  if (state.negocio.logoUrl && logoNegocio) {
    logoNegocio.src = state.negocio.logoUrl;
    ajustarLogoSinPadding();
  }

  if (direccionEl) {
    direccionEl.textContent =
      (state.negocio.direccion || "Dirección a confirmar") +
      (state.negocio.ciudad ? " · " + state.negocio.ciudad : "");
  }

  if (horariosResumenEl) {
    horariosResumenEl.textContent =
      state.negocio.horariosResumen || "Lunes a viernes 09:00 a 20:00 hs · Sábados 09:00 a 13:00 hs";
  }

  if (linkMapasEl) linkMapasEl.href = state.negocio.mapsUrl || "#";

  const telRaw = state.negocio.whatsapp || "";
  const telClean = String(telRaw).replace(/[^\d]/g, "");
  let waHref = "#";
  if (telClean) {
    waHref =
      "https://wa.me/" +
      telClean +
      "?text=" +
      encodeURIComponent(`Hola, quiero reservar un turno en ${state.negocio.nombre || "tu consulta"} `);
  }
  if (waFab) waFab.href = waHref;
  if (waBottom) waBottom.href = waHref;

  if (igBottom) {
    if (state.negocio.instagram) {
      igBottom.href = state.negocio.instagram;
      igBottom.style.display = "inline-flex";
    } else {
      igBottom.style.display = "none";
    }
  }

  if (fbBottom) {
    if (state.negocio.facebook) {
      fbBottom.href = state.negocio.facebook;
      fbBottom.style.display = "inline-flex";
    } else {
      fbBottom.style.display = "none";
    }
  }

  if (linkSaviaEl) {
    linkSaviaEl.href = state.negocio.urlSavia || "https://namilo1315.github.io/savia/";
  }
}

async function cargarServicios() {
  if (!firebaseOK) {
    console.warn("Firebase no OK: cargo un servicio demo.");
    state.servicios = [
      {
        id: "demo-servicio",
        categoria: "Facial",
        nombre: "Limpieza facial profunda (demo)",
        duracionMin: 60,
        precio: 0,
        modalidad: "Presencial",
        requiereSenia: false,
        seniaPorcentaje: 0,
        textoSenia: "",
        linkPago: "",
      },
    ];
    return;
  }

  const snap = await getDocs(serviciosCol);
  const servicios = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    servicios.push({
      id: docSnap.id,
      categoria: normCat(data.categoria || "General"),
      nombre: data.nombre || "Servicio sin nombre",
      duracionMin: data.duracionMin || 30,
      precio: data.precio || 0,
      modalidad: data.modalidad || "Presencial",
      requiereSenia: !!data.requiereSenia,
      seniaPorcentaje: data.seniaPorcentaje || 0,
      textoSenia: data.textoSenia || "",
      linkPago: data.linkPago || "",
    });
  });

  servicios.sort((a, b) => {
    const ca = normCat(a.categoria);
    const cb = normCat(b.categoria);
    if (ca !== cb) return ca.localeCompare(cb, "es");
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });

  state.servicios = servicios;
}

async function cargarHorariosOcupados(fechaIso) {
  state.horariosOcupados.clear();

  if (!fechaIso) {
    renderHorarios();
    return;
  }
  if (!firebaseOK) {
    renderHorarios();
    return;
  }

  const qFecha = query(turnosCol, where("fecha", "==", fechaIso));
  const snap = await getDocs(qFecha);

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (data.estado !== "cancelado" && data.hora) {
      state.horariosOcupados.add(data.hora);
    }
  });

  renderHorarios();
}

// =======================
//   UI: SERVICIOS (NORMAL)
// =======================
function syncModalidadToServicio(servicio) {
  if (!selectModalidad || !modalidadGroup) return;
  if (!servicio?.modalidad) return;

  const opts = Array.from(selectModalidad.options || []);
  const exists = opts.some((o) => o.value === servicio.modalidad);
  if (exists) selectModalidad.value = servicio.modalidad;
}

function llenarServiciosPorCategoria(cat) {
  if (!selectServicio) return;

  const catNorm = cat ? normCat(cat) : null;
  selectServicio.innerHTML = "";

  let lista = state.servicios;
  if (catNorm) lista = lista.filter((s) => normCat(s.categoria) === catNorm);

  if (!lista.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Servicios a confirmar";
    selectServicio.appendChild(opt);
    selectServicio.disabled = true;

    if (seniaInfo) {
      seniaInfo.textContent = "El negocio todavía no cargó sus servicios. Consultá por WhatsApp.";
    }
    return;
  }

  selectServicio.disabled = false;
  lista.forEach((s, idx) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = labelServicio(s);
    if (idx === 0) opt.selected = true;
    selectServicio.appendChild(opt);
  });

  syncModalidadToServicio(obtenerServicioSeleccionado());
  actualizarSenia();
}

function configurarCategoriasYServicios() {
  const setCat = new Set();
  state.servicios.forEach((s) => setCat.add(normCat(s.categoria)));
  const categorias = Array.from(setCat).sort((a, b) => a.localeCompare(b, "es"));

  if (categoriaGroup && selectCategoria) {
    if (categorias.length) {
      categoriaGroup.style.display = "block";
      selectCategoria.innerHTML = "";
      categorias.forEach((cat, idx) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        if (idx === 0) opt.selected = true;
        selectCategoria.appendChild(opt);
      });

      llenarServiciosPorCategoria(categorias[0]);

      if (!selectCategoria.dataset.bound) {
        selectCategoria.addEventListener("change", () => {
          if (state.modo === "especial") return;
          clearHorarioSelection();
          llenarServiciosPorCategoria(selectCategoria.value || null);
        });
        selectCategoria.dataset.bound = "1";
      }
    } else {
      categoriaGroup.style.display = "none";
      llenarServiciosPorCategoria(null);
    }
  } else {
    llenarServiciosPorCategoria(null);
  }

  // ✅ MODALIDAD: siempre mostrar Presencial + Online (sin romper lo actual)
  if (modalidadGroup && selectModalidad) {
    const BASE = ["Presencial", "Online"];

    // armamos set con base + lo que venga de firestore (por si algún día guardás otras)
    const setMod = new Set(BASE);
    state.servicios.forEach((s) => s.modalidad && setMod.add(String(s.modalidad).trim()));

    // orden: base primero, resto después
    const extras = Array.from(setMod).filter((m) => !BASE.includes(m) && m);
    extras.sort((a, b) => a.localeCompare(b, "es"));
    const modalidades = [...BASE, ...extras];

    modalidadGroup.style.display = "block";
    selectModalidad.innerHTML = "";
    modalidades.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      selectModalidad.appendChild(opt);
    });

    // mantiene el comportamiento actual: si el servicio tiene modalidad, se selecciona esa
    syncModalidadToServicio(obtenerServicioSeleccionado());

    // fallback si por algún motivo queda vacío
    if (!selectModalidad.value) selectModalidad.value = "Presencial";
  }

  if (selectServicio && !selectServicio.dataset.bound) {
    selectServicio.addEventListener("change", () => {
      clearHorarioSelection();
      const srv = obtenerServicioSeleccionado();
      syncModalidadToServicio(srv);
      actualizarSenia();
      if (state.modo === "especial") syncSpecialButtonsActive();
    });
    selectServicio.dataset.bound = "1";
  }
}

function actualizarSenia() {
  if (!seniaInfo) return;

  const servicio = obtenerServicioSeleccionado();
  if (!servicio) {
    seniaInfo.textContent =
      "Si el servicio requiere seña, te vamos a indicar el link de pago luego de solicitar el turno.";
    return;
  }

  if (servicio.requiereSenia) {
    const pct = servicio.seniaPorcentaje || 0;
    const txt =
      servicio.textoSenia ||
      `Reservás con una seña del ${pct}% del valor. Te compartimos el link de pago al confirmar.`;
    seniaInfo.textContent = txt;
  } else {
    seniaInfo.textContent =
      servicio.textoSenia || "Este servicio no requiere seña inmediata. Confirmamos el turno por WhatsApp.";
  }
}

// =======================
//   ESPECIALES
// =======================
async function cargarEspeciales() {
  state.especiales = [];
  if (!firebaseOK || !especialesCol) return;

  const snap = await getDocs(especialesCol);
  const hoy = todayIso();

  snap.forEach((docSnap) => {
    const d = docSnap.data() || {};

    const activo = d.activo !== false;
    if (!activo) return;

    const fecha = fechaToIso(d.fecha);
    if (!fecha) return;

    if (fecha < hoy) return;

    const slots = Array.isArray(d.slots) ? d.slots.map(normalizarHora).filter(Boolean) : [];

    let categoria = normCat(d.categoria || "");
    const servicioId = d.servicioId || "";

    if (!categoria && servicioId) {
      const srv = servicioById(servicioId);
      if (srv?.categoria) categoria = normCat(srv.categoria);
    }
    if (!categoria) categoria = "Especial";

    state.especiales.push({
      id: docSnap.id,
      fecha,
      categoria,
      servicioId,
      promo: d.promo || "",
      slots,
      activo,
    });
  });

  state.especiales.sort((a, b) => a.fecha.localeCompare(b.fecha, "es"));
}

function getEspecialesFiltrados() {
  const cat = specialsCatSelect?.value ? normCat(specialsCatSelect.value) : "";
  if (!cat) return state.especiales;
  return state.especiales.filter((e) => normCat(e.categoria) === cat);
}

function renderFiltroCategoriasEspeciales() {
  if (!specialsCatSelect) return;

  const setCat = new Set(state.especiales.map((e) => normCat(e.categoria)));
  const cats = Array.from(setCat).sort((a, b) => a.localeCompare(b, "es"));

  const prev = specialsCatSelect.value || "";
  specialsCatSelect.innerHTML = `<option value="">Todas</option>`;

  cats.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    specialsCatSelect.appendChild(opt);
  });

  specialsCatSelect.value = cats.includes(prev) ? prev : "";

  if (!specialsCatSelect.dataset.bound) {
    specialsCatSelect.addEventListener("change", () => renderEspeciales());
    specialsCatSelect.dataset.bound = "1";
  }
}

function renderEspeciales() {
  if (!specialsSection || !specialsList) return;

  if (!state.especiales.length) {
    specialsSection.style.display = "none";
    return;
  }

  specialsSection.style.display = "block";
  specialsList.innerHTML = "";

  renderFiltroCategoriasEspeciales();
  const lista = getEspecialesFiltrados();

  if (specialsEmpty) specialsEmpty.classList.toggle("js-hidden", lista.length > 0);
  if (!lista.length) return;

  lista.forEach((e) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "special-card";
    if (state.especialActivo?.id === e.id) btn.classList.add("active");

    const fechaLegible = formatearFecha(e.fecha);
    const horariosTxt = e.slots.length ? e.slots.join(", ") : "Horarios normales";
    const horariosShort = horariosTxt.length > 90 ? horariosTxt.slice(0, 90) + "…" : horariosTxt;

    btn.innerHTML = `
      <div class="special-top">
        <div class="special-name">${escapeHtml(e.categoria)}</div>
        <div class="special-badge"><i class="fa-solid fa-star"></i> Día especial</div>
      </div>

      <div class="special-meta">
        <span><i class="fa-regular fa-calendar"></i> ${escapeHtml(fechaLegible)}</span>
        <span><i class="fa-regular fa-clock"></i> ${escapeHtml(e.slots.length ? "Horarios especiales" : "Horarios normales")}</span>
      </div>

      ${e.promo ? `<div class="special-promo"><i class="fa-solid fa-tag"></i> ${escapeHtml(e.promo)}</div>` : ``}

      <div style="margin-top:8px;font-size:.76rem;color:#475569;font-weight:800;">
        <i class="fa-solid fa-lock" style="color:var(--accent);margin-right:6px;"></i>
        Ese día se dan turnos SOLO para <b>${escapeHtml(e.categoria)}</b>
      </div>

    `;

    btn.addEventListener("click", async () => {
      await activarEspecial(e, { scroll: true });
      renderEspeciales();
    });

    specialsList.appendChild(btn);
  });
}

// =======================
//   SOLAPA: SERVICIOS DE LA CATEGORÍA ESPECIAL
// =======================
function renderSpecialServicePanel() {
  if (!specialsPanel || !specialsSvcList || !specialsCatName) return;

  if (state.modo !== "especial" || !state.especialActivo) {
    specialsPanel.classList.add("js-hidden");
    specialsSvcList.innerHTML = "";
    return;
  }

  // ✅ crea la solapa una sola vez
  setupSpecialsAccordion();

  const categoria = normCat(state.especialActivo.categoria || "General");
  specialsCatName.textContent = categoria;

  const lista = state.servicios.filter((s) => normCat(s.categoria) === categoria);

  specialsSvcList.innerHTML = "";
  if (!lista.length) {
    specialsSvcList.innerHTML = `
      <div style="font-size:.78rem;color:#64748b;font-weight:800;padding:8px 6px;">
        No hay servicios cargados en esta categoría todavía.
      </div>
    `;
    specialsPanel.classList.remove("js-hidden");
    updateSpecialsAccordionMeta({ count: 0, selectedText: "" });
    return;
  }

  lista.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "svc-btn";
    b.dataset.id = s.id;
    b.textContent = labelServicio(s);

    b.addEventListener("click", () => {
      if (!selectServicio) return;
      selectServicio.value = s.id;
      selectServicio.dispatchEvent(new Event("change"));
      syncSpecialButtonsActive();

      document.getElementById("bk-horarios-scroll")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      // ✅ opcional: cerrar la solapa al elegir (para que no moleste)
      // si querés que NO cierre, comentá estas dos líneas:
      const head = specialsPanel.querySelector(".bk-acc-head");
      if (head) head.click();
    });

    specialsSvcList.appendChild(b);
  });

  specialsPanel.classList.remove("js-hidden");
  syncSpecialButtonsActive();

  updateSpecialsAccordionMeta({ count: lista.length, selectedText: "" });
}

function syncSpecialButtonsActive() {
  if (!specialsSvcList) return;

  const currentId = selectServicio?.value || "";
  let selectedText = "";

  specialsSvcList.querySelectorAll(".svc-btn").forEach((btn) => {
    const active = btn.dataset.id === currentId;
    btn.classList.toggle("active", active);
    if (active) selectedText = btn.textContent || "";
  });

  updateSpecialsAccordionMeta({
    count: specialsSvcList.querySelectorAll(".svc-btn").length,
    selectedText: selectedText ? selectedText : "",
  });
}

async function activarEspecial(especial, opts = {}) {
  if (!especial || !especial.fecha) return;

  state.modo = "especial";
  state.especialActivo = especial;

  if (inputDia) {
    inputDia.value = especial.fecha;
    inputDia.disabled = true;
  }

  // fuerza categoría del especial
  if (categoriaGroup && selectCategoria) {
    categoriaGroup.style.display = "block";
    const cat = normCat(especial.categoria || "General");

    const exists = Array.from(selectCategoria.options || []).some((o) => o.value === cat);
    if (!exists) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      selectCategoria.appendChild(opt);
    }

    selectCategoria.value = cat;
    llenarServiciosPorCategoria(cat);
    selectCategoria.disabled = true;
  } else {
    llenarServiciosPorCategoria(normCat(especial.categoria || "General"));
  }

  if (especial.servicioId && selectServicio) {
    const existsSrv = state.servicios.some((s) => s.id === especial.servicioId);
    if (existsSrv) {
      selectServicio.value = especial.servicioId;
      selectServicio.dispatchEvent(new Event("change"));
    }
  }

  if (selectServicio) selectServicio.disabled = false;

  state.horariosBase = especial.slots.length ? [...especial.slots] : [...state.horariosBaseNormal];

  if (specialsActive) {
    const fechaLegible = formatearFecha(especial.fecha);
    const horariosTxt = especial.slots.length
      ? `Horarios especiales: ${especial.slots.join(", ")}`
      : `Horarios normales`;

    specialsActive.innerHTML = `
      <i class="fa-solid fa-circle-info"></i>
      <div style="min-width:0;">
        Estás reservando un <strong>Día especial</strong> para <strong>${escapeHtml(especial.categoria)}</strong>
        · ${escapeHtml(fechaLegible)}
       
        ${especial.promo ? `<div style="margin-top:8px;font-weight:900;">${escapeHtml(especial.promo)}</div>` : ""}
        <div style="margin-top:8px;color:#64748b;font-weight:800;">
          Ese día el negocio atiende <b>solo esa categoría</b>.
        </div>
      </div>
    `;
    specialsActive.classList.remove("js-hidden");
  }

  if (specialsClearBtn) specialsClearBtn.classList.remove("js-hidden");

  // ✅ mostrar panel y ocultar selects normales
  renderSpecialServicePanel();
  setModoEspecialUI(true);

  await cargarHorariosOcupados(especial.fecha);
  clearHorarioSelection();

  if (opts.scroll) {
    document.getElementById("bk-specials")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function desactivarEspecial() {
  state.modo = "normal";
  state.especialActivo = null;

  setModoEspecialUI(false);

  if (inputDia) {
    inputDia.disabled = false;
    const candidato = inputDia.value || todayIso();
    inputDia.value = buscarProximoDiaNormal(candidato);
  }

  if (selectCategoria) selectCategoria.disabled = false;
  if (selectServicio) selectServicio.disabled = false;

  state.horariosBase = [...state.horariosBaseNormal];

  if (specialsActive) specialsActive.classList.add("js-hidden");
  if (specialsPanel) specialsPanel.classList.add("js-hidden");
  if (specialsSvcList) specialsSvcList.innerHTML = "";
  if (specialsClearBtn) specialsClearBtn.classList.add("js-hidden");

  if (selectCategoria) llenarServiciosPorCategoria(selectCategoria.value || null);
  else llenarServiciosPorCategoria(null);

  await cargarHorariosOcupados(inputDia?.value || todayIso());
  clearHorarioSelection();

  renderEspeciales();
}

// =======================
//   UI: HORARIOS
// =======================
function renderHorarios() {
  if (!horariosScroll || !selectHorario) return;

  horariosScroll.innerHTML = "";
  selectHorario.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Elegí un horario…";
  ph.disabled = true;
  ph.selected = true;
  selectHorario.appendChild(ph);

  if (!state.horariosBase.length) {
    horariosScroll.innerHTML =
      "<p style='font-size:.82rem;color:#6b7280;font-weight:700;margin:6px 0;'>Configurá tu horario desde el panel profesional.</p>";
    return;
  }

  state.horariosBase.forEach((h) => {
    const opt = document.createElement("option");
    opt.value = h;
    opt.textContent = h + " hs";
    if (state.horariosOcupados.has(h)) {
      opt.disabled = true;
      opt.textContent += " (ocupado)";
    }
    selectHorario.appendChild(opt);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.textContent = h;
    btn.dataset.valor = h;

    if (state.horariosOcupados.has(h)) {
      btn.disabled = true;
      btn.classList.add("booked");
    }

    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      document.querySelectorAll(".slot-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectHorario.value = h;
    });

    horariosScroll.appendChild(btn);
  });
}

// =======================
//   EVITAR DOBLE TURNO (fecha+hora)
// =======================
async function slotDisponible(fechaIso, hora) {
  if (!firebaseOK) return !state.horariosOcupados.has(hora);

  const qx = query(turnosCol, where("fecha", "==", fechaIso), where("hora", "==", hora));
  const snap = await getDocs(qx);

  let ocupado = false;
  snap.forEach((d) => {
    const data = d.data() || {};
    if (data.estado !== "cancelado") ocupado = true;
  });

  return !ocupado;
}

// =======================
//   GUARDAR TURNO
// =======================
async function guardarTurnoEnFirestore(turno) {
  if (!firebaseOK) {
    console.warn("Firebase no OK: turno sólo simulado, no se guarda en nube.");
    return "demo-doc-id";
  }

  const ok = await slotDisponible(turno.fecha, turno.hora);
  if (!ok) throw new Error("SLOT_OCUPADO");

  const esEspecial = state.modo === "especial" && !!state.especialActivo;

  const ref = await addDoc(turnosCol, {
    fecha: turno.fecha,
    hora: turno.hora,
    servicioId: turno.servicioId,
    servicioNombre: turno.servicioNombre,
    categoria: turno.categoria || null,
    cliente: turno.nombreCliente,
    whatsapp: turno.telefono,
    mail: turno.mail || "",
    modalidad: turno.modalidad || null,
    requiereSenia: turno.requiereSenia || false,
    estado: "pendiente",
    origen: "web",
    creadoEn: serverTimestamp(),

    tipo: esEspecial ? "especial" : "normal",
    especialId: esEspecial ? state.especialActivo.id : null,
    especialCategoria: esEspecial ? state.especialActivo.categoria || null : null,
    especialPromo: esEspecial ? state.especialActivo.promo || "" : null,
  });

  return ref.id;
}

// =======================
//   EVENTOS FORM
// =======================
function configurarForm() {
  const hoy = todayIso();

  if (inputDia) {
    inputDia.min = hoy;
    if (!inputDia.value) inputDia.value = hoy;

    if (!inputDia.dataset.bound) {
      inputDia.addEventListener("change", async () => {
        clearHorarioSelection();

        const esp = especialPorFecha(inputDia.value);

        if (esp) {
          await activarEspecial(esp);
          renderEspeciales();
          return;
        }

        if (state.modo === "especial") {
          await desactivarEspecial();
          return;
        }

        await cargarHorariosOcupados(inputDia.value);
      });
      inputDia.dataset.bound = "1";
    }
  }

  if (form && !form.dataset.bound) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fecha = inputDia?.value;
      if (!fecha) return alert("Elegí un día para tu turno.");

      const espDia = especialPorFecha(fecha);
      if (espDia && state.modo !== "especial") {
        alert(`Este día es especial para ${espDia.categoria}. Elegí un turno especial.`);
        await activarEspecial(espDia, { scroll: true });
        renderEspeciales();
        return;
      }

      const servicio = obtenerServicioSeleccionado();
      if (!servicio || !selectServicio?.value) return alert("Elegí un servicio para continuar.");
      if (!selectHorario?.value) return alert("Por favor, elegí un horario disponible.");

      const turno = {
        servicioId: servicio.id,
        servicioNombre: servicio.nombre || "Turno",
        categoria: servicio.categoria || null,
        fecha,
        hora: selectHorario.value,
        nombreCliente: (inputNombreCliente?.value || "").trim(),
        telefono: (inputTelefono?.value || "").trim(),
        mail: (inputMail?.value || "").trim(),
        modalidad: selectModalidad && selectModalidad.value ? selectModalidad.value : null,
        requiereSenia: !!servicio.requiereSenia,
      };

      if (!turno.nombreCliente || !turno.telefono) return alert("Completá tu nombre y WhatsApp.");

      if (state.horariosOcupados.has(turno.hora)) {
        alert("Ese horario ya fue reservado recién. Elegí otro horario.");
        await cargarHorariosOcupados(turno.fecha);
        clearHorarioSelection();
        return;
      }

      try {
        const docId = await guardarTurnoEnFirestore(turno);
        ultimoTurnoDoc = { id: docId, fecha: turno.fecha, hora: turno.hora };

        state.horariosOcupados.add(turno.hora);
        renderHorarios();

        const fechaLegible = formatearFecha(turno.fecha);
        const horarioLegible = turno.hora + " hs";

        if (confirmData) {
          confirmData.innerHTML = `
            <ul class="confirm-list">
              <li><strong>Nombre:</strong> ${escapeHtml(turno.nombreCliente)}</li>
              <li><strong>Servicio:</strong> ${escapeHtml(labelServicio(servicio))}</li>
              ${
                state.modo === "especial" && state.especialActivo?.categoria
                  ? `<li><strong>Día especial:</strong> ${escapeHtml(state.especialActivo.categoria)}</li>`
                  : ""
              }
              ${
                state.modo === "especial" && state.especialActivo?.promo
                  ? `<li><strong>Promo:</strong> ${escapeHtml(state.especialActivo.promo)}</li>`
                  : ""
              }
              ${turno.categoria ? `<li><strong>Categoría:</strong> ${escapeHtml(turno.categoria)}</li>` : ""}
              <li><strong>Día y horario:</strong> ${escapeHtml(fechaLegible)} · ${escapeHtml(horarioLegible)}</li>
              ${turno.modalidad ? `<li><strong>Modalidad:</strong> ${escapeHtml(turno.modalidad)}</li>` : ""}
            </ul>
          `;
        }

        confirmMsg?.classList.add("show");

        form.reset();
        if (inputDia) inputDia.min = hoy;

        if (state.modo === "especial" && state.especialActivo) {
          await activarEspecial(state.especialActivo);
          renderEspeciales();
        } else {
          if (inputDia) inputDia.value = fecha;
          await cargarHorariosOcupados(inputDia?.value || todayIso());
          clearHorarioSelection();
          actualizarSenia();
        }
      } catch (err) {
        console.error("Error al guardar turno:", err);

        if (String(err?.message || "").includes("SLOT_OCUPADO")) {
          alert("Ese horario se ocupó recién. Elegí otro horario.");
          await cargarHorariosOcupados(inputDia?.value || todayIso());
          clearHorarioSelection();
          return;
        }

        alert("No pudimos guardar tu turno. Volvé a intentar en unos minutos.");
      }
    });

    form.dataset.bound = "1";
  }

  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.addEventListener("click", async () => {
      if (ultimoTurnoDoc) {
        if (firebaseOK && ultimoTurnoDoc.id !== "demo-doc-id") {
          try {
            const docRef = doc(turnosCol, ultimoTurnoDoc.id);
            await updateDoc(docRef, { estado: "cancelado" });
          } catch (err) {
            console.error("Error al cancelar turno:", err);
          }
        }
        if (ultimoTurnoDoc.hora) state.horariosOcupados.delete(ultimoTurnoDoc.hora);
        await cargarHorariosOcupados(inputDia?.value || todayIso());
        clearHorarioSelection();
        ultimoTurnoDoc = null;
      }
      confirmMsg?.classList.remove("show");
    });
    cancelBtn.dataset.bound = "1";
  }

  if (saveExitBtn && !saveExitBtn.dataset.bound) {
    saveExitBtn.addEventListener("click", () => {
      confirmMsg?.classList.remove("show");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    saveExitBtn.dataset.bound = "1";
  }

  if (specialsClearBtn && !specialsClearBtn.dataset.bound) {
    specialsClearBtn.addEventListener("click", async () => {
      await desactivarEspecial();
    });
    specialsClearBtn.dataset.bound = "1";
  }
}

// =======================
//   INIT
// =======================
async function init() {
  console.log("Iniciando turnero Savia…");

  cacheWrappers();
  ajustarLogoSinPadding();

  state.horariosBase = generarSlots(state.config.apertura, state.config.cierre, state.config.duracionMin);
  state.horariosBaseNormal = [...state.horariosBase];

  renderHorarios();
  configurarForm();

  try {
    await cargarNegocioYConfig();
    await cargarServicios();
    configurarCategoriasYServicios();

    cacheWrappers();

    await cargarEspeciales();
    renderEspeciales();

    const fechaActual = inputDia?.value || todayIso();
    const espHoy = especialPorFecha(fechaActual);

    if (espHoy) {
      await activarEspecial(espHoy);
      renderEspeciales();
    } else {
      setModoEspecialUI(false);
      await cargarHorariosOcupados(fechaActual);
      actualizarSenia();
    }

    console.log("Turnero listo ✅");
  } catch (err) {
    console.error("Error iniciando turnero:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
