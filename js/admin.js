import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ==================== FIREBASE INIT ====================
const firebaseConfig = {
  apiKey: "AIzaSyBs3V8rJ6cKI08IADuzecAI9XUL3740Gb4",
  authDomain: "savia-74c89.firebaseapp.com",
  projectId: "savia-74c89",
  storageBucket: "savia-74c89.firebasestorage.app",
  messagingSenderId: "627564458830",
  appId: "1:627564458830:web:deb7ee624592236a91241f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// negocio actual por ?negocio=bellezza
const params = new URLSearchParams(window.location.search);
const negocioId = params.get("negocio") || "belleza";

const negocioRef = doc(db, "negocios", negocioId);
const serviciosCol = collection(negocioRef, "servicios");
const turnosCol = collection(negocioRef, "turnos");
const especialesCol = collection(negocioRef, "especiales");

// ==================== STATE EN MEMORIA ====================
const state = {
  negocio: {
    nombre: "Estética Bellezza",
    rubro: "Estéticas · Uñas · Masajes",
    slogan: "Belleza con un clic.",
    whatsapp: "5492610000000",
    instagram: "",
    facebook: "",
    direccion: "San Martín 123",
    ciudad: "Maipú · Mendoza",
    mapsUrl: "",
    logoUrl: "",
    horariosResumen: "Lunes a viernes 09:00 a 20:00 · Sábados 09:00 a 13:00",
    colorPrincipal: "#4BAF8C"
  },
  config: {
    apertura: "09:00",
    cierre: "20:00",
    duracionMin: 30,
    aliasPago: ""
  },
  servicios: [],
  turnos: [],        // turnos del mes (según filtro)
  turnosUlt7: [],    // ✅ AHORA: turnos del rango PRÓXIMOS 7 días (para KPI)
  especiales: []
};

// ==================== HELPERS ====================
function isoFechaOffset(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ✅ convierte lo que venga a "YYYY-MM-DD" (string ISO)
// (por si algún día guardás Timestamp o fecha en otro formato)
function fechaDocToISO(fechaVal) {
  if (!fechaVal) return "";

  if (typeof fechaVal === "string") {
    const s = fechaVal.trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split("/");
      return `${yyyy}-${mm}-${dd}`;
    }
    return "";
  }

  if (typeof fechaVal?.toDate === "function") {
    const d = fechaVal.toDate();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (fechaVal instanceof Date && !isNaN(fechaVal)) {
    const yyyy = fechaVal.getFullYear();
    const mm = String(fechaVal.getMonth() + 1).padStart(2, "0");
    const dd = String(fechaVal.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function mesActualYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function siguienteMesYYYYMM(yyyyMm) {
  const [y, m] = String(yyyyMm).split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

const diasCortos = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function formateaFechaCorta(iso) {
  if (!iso) return "-";
  const partes = String(iso).split("-");
  if (partes.length !== 3) return iso;
  const y = Number(partes[0]);
  const m = Number(partes[1]);
  const d = Number(partes[2]);
  const fecha = new Date(y, m - 1, d);
  if (isNaN(fecha)) return iso;
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const yyyy = fecha.getFullYear();
  const dia = diasCortos[fecha.getDay()];
  return `${dia} ${dd}/${mm}/${yyyy}`;
}

function formatearMesLindo(yyyyMm) {
  if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return "—";
  const [y, m] = yyyyMm.split("-");
  const fecha = new Date(Number(y), Number(m) - 1, 1);
  try {
    const mes = fecha.toLocaleDateString("es-AR", { month: "long" });
    return `${mes} ${y}`;
  } catch {
    return `${m}/${y}`;
  }
}

function generarSlots(config) {
  const apertura = config.apertura || "09:00";
  const cierre = config.cierre || "20:00";
  const paso = config.duracionMin || 30;

  const [ah, am] = apertura.split(":").map(Number);
  const [ch, cm] = cierre.split(":").map(Number);

  let inicio = ah * 60 + am;
  const fin = ch * 60 + cm;
  const slots = [];

  while (inicio < fin) {
    const hh = String(Math.floor(inicio / 60)).padStart(2, "0");
    const mm = String(inicio % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
    inicio += paso;
  }

  return slots;
}

function formateaPrecio(n) {
  const num = Number(n) || 0;
  return "$ " + num.toLocaleString("es-AR");
}

function parsePrecio(str) {
  if (!str) return 0;
  const limpio = String(str).replace(/[^\d]/g, "");
  return limpio ? Number(limpio) : 0;
}

function aplicarColorAccent() {
  const color = state.negocio.colorPrincipal || "#4BAF8C";
  document.documentElement.style.setProperty("--accent", color);
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ✅ normaliza categoría
function normCat(cat) {
  const c = String(cat || "").trim();
  return c || "General";
}

function normalizarWhatsAppAR(raw = "") {
  let d = String(raw).replace(/\D/g, "");
  if (!d) return "";

  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);

  if (d.startsWith("54")) {
    if (!d.startsWith("549")) d = "549" + d.slice(2);
    return d;
  }
  if (d.startsWith("9")) return "54" + d;

  if (d.length === 12) {
    const tryRemove15 = (areaLen) => {
      if (d.slice(areaLen, areaLen + 2) === "15") {
        return d.slice(0, areaLen) + d.slice(areaLen + 2);
      }
      return d;
    };
    d = tryRemove15(2);
    d = tryRemove15(3);
    d = tryRemove15(4);
  }

  return "549" + d;
}

function armarMensajeRecordatorio(turno, servicioNombre) {
  const nombreNegocio = state.negocio.nombre || "Tu negocio";
  const rubroTxt = state.negocio.rubro ? ` (${state.negocio.rubro})` : "";
  const cliente = turno?.cliente || "hola";
  const fecha = formateaFechaCorta(turno?.fecha || "");
  const hora = turno?.hora || "";
  const notas = (turno?.notas || "").trim();
  const notasTxt = notas ? `\n Nota: ${notas}` : "";

  return `Hola ${cliente}

Recordatorio de turno — ${nombreNegocio}${rubroTxt}
${fecha} · ${hora}
Servicio: ${servicioNombre}${notasTxt}

Te esperamos.

Si necesitás reprogramar, avisanos por este WhatsApp.
¡Gracias!`;
}

function linkWhatsAppConMensaje(turno, servicioNombre) {
  if (!turno?.whatsapp) return "";
  const wa = normalizarWhatsAppAR(turno.whatsapp);
  if (!wa) return "";
  const msg = armarMensajeRecordatorio(turno, servicioNombre);
  return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
}

// ==================== DOM REFS ====================
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

const headerNombre = document.getElementById("header-nombre-negocio");
const headerRubro = document.getElementById("header-rubro");
const headerLogo = document.getElementById("header-logo");

const kpiGanancia = document.getElementById("kpi-ganancia");
const kpiTurnos7 = document.getElementById("kpi-turnos7");
const kpiCancelaciones = document.getElementById("kpi-cancelaciones");

const formNuevoTurno = document.getElementById("form-nuevo-turno");
const ntServicio = document.getElementById("nt-servicio");
const ntFecha = document.getElementById("nt-fecha");
const ntHora = document.getElementById("nt-hora");
const ntCliente = document.getElementById("nt-cliente");
const ntWa = document.getElementById("nt-wa");
const ntNotas = document.getElementById("nt-notas");
const msgTurno = document.getElementById("msg-turno");

const tablaTurnos = document.getElementById("tabla-turnos");
const filtroMes = document.getElementById("filtro-mes");
const filtroFecha = document.getElementById("filtro-fecha");
const btnLimpiarFiltros = document.getElementById("btn-limpiar-filtros");

const formNegocio = document.getElementById("form-negocio");
const cfgNombre = document.getElementById("cfg-nombre");
const cfgSlogan = document.getElementById("cfg-slogan");
const cfgRubro = document.getElementById("cfg-rubro");
const cfgWa = document.getElementById("cfg-wa");
const cfgColor = document.getElementById("cfg-color");
const cfgIg = document.getElementById("cfg-ig");
const cfgFb = document.getElementById("cfg-fb");
const cfgDireccion = document.getElementById("cfg-direccion");
const cfgCiudad = document.getElementById("cfg-ciudad");
const cfgMaps = document.getElementById("cfg-maps");
const cfgLogoUrl = document.getElementById("cfg-logo-url");
const cfgHorariosResumen = document.getElementById("cfg-horarios-resumen");

const formHorario = document.getElementById("form-horario");
const cfgApertura = document.getElementById("cfg-apertura");
const cfgCierre = document.getElementById("cfg-cierre");
const cfgDuracion = document.getElementById("cfg-duracion");
const cfgAlias = document.getElementById("cfg-alias");

const formServicio = document.getElementById("form-servicio");
const svcIdEdit = document.getElementById("svc-id-edit");
const svcCategoria = document.getElementById("svc-categoria");
const svcNombre = document.getElementById("svc-nombre");
const svcDuracion = document.getElementById("svc-duracion");
const svcPrecio = document.getElementById("svc-precio");
const btnGuardarServicio = document.getElementById("btn-guardar-servicio");
const btnLimpiarServicio = document.getElementById("btn-limpiar-servicio");
const listaServicios = document.getElementById("lista-servicios");

const tablaResumenServicios = document.getElementById("tabla-resumen-servicios");
const btnSalir = document.getElementById("btn-salir");

// dashboard
const dashFiltroMes = document.getElementById("dash-filtro-mes");
const dashBtnMesActual = document.getElementById("dash-btn-mes-actual");
const dashMesLabel = document.getElementById("dash-mes-label");
const dashTurnosMes = document.getElementById("dash-turnos-mes");
const dashIngresosMes = document.getElementById("dash-ingresos-mes");
const dashCancelacionesMes = document.getElementById("dash-cancelaciones-mes");
const dashTopServicios = document.getElementById("dash-top-servicios");

// ✅ especiales
const formEspecial = document.getElementById("form-especial");
const espIdEdit = document.getElementById("esp-id-edit");
const espCategoria = document.getElementById("esp-categoria");
const espServicio = document.getElementById("esp-servicio");
const espFecha = document.getElementById("esp-fecha");
const espActivo = document.getElementById("esp-activo");
const espPromo = document.getElementById("esp-promo");
const espSlots = document.getElementById("esp-slots");
const btnGuardarEspecial = document.getElementById("btn-guardar-especial");
const btnLimpiarEspecial = document.getElementById("btn-limpiar-especial");
const msgEspecial = document.getElementById("msg-especial");
const tablaEspeciales = document.getElementById("tabla-especiales");
const espFiltroMes = document.getElementById("esp-filtro-mes");

// ==================== TABS ====================
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
    tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tabPanel === tab);
    });
  });
});

// ==================== HEADER & KPI ====================
function renderHeader() {
  if (headerNombre) headerNombre.textContent = state.negocio.nombre || "Nombre del negocio";
  if (headerRubro) headerRubro.textContent = state.negocio.rubro || "Rubro";
  document.title = "Savia Admin · " + (state.negocio.nombre || "Panel profesional");
  aplicarColorAccent();
  if (headerLogo && state.negocio.logoUrl) headerLogo.src = state.negocio.logoUrl;
}

function obtenerMesKpiPref() {
  if (filtroMes && filtroMes.value) return filtroMes.value;
  return mesActualYYYYMM();
}

// ✅ KPI: PRÓXIMOS 7 DÍAS (hoy -> hoy+6) + cancelaciones aparte
function calcularKpis() {
  let turnos7 = 0;
  let cancelaciones7 = 0;
  let ingresosMes = 0;

  const mesKpi = obtenerMesKpiPref();

  const desdeISO = isoFechaOffset(0);
  const hastaISO = isoFechaOffset(6);

  const fuente7 =
    Array.isArray(state.turnosUlt7) && state.turnosUlt7.length
      ? state.turnosUlt7
      : state.turnos;

  fuente7.forEach((t) => {
    const fISO = fechaDocToISO(t?.fecha);
    if (!fISO) return;

    if (fISO < desdeISO || fISO > hastaISO) return;

    const estado = String(t?.estado || "").toLowerCase().trim();
    if (estado === "cancelado") cancelaciones7++;
    else turnos7++;
  });

  // ingresos del mes (confirmados)
  state.turnos.forEach((t) => {
    const fISO = fechaDocToISO(t?.fecha);
    if (!fISO || !fISO.startsWith(mesKpi)) return;

    const estado = String(t?.estado || "").toLowerCase().trim();
    if (estado !== "confirmado") return;

    const serv = state.servicios.find((s) => s.id === t.servicioId);
    if (serv) ingresosMes += serv.precio || 0;
  });

  return { turnos7, cancelaciones7, ingresosMes };
}

function renderKpis() {
  const k = calcularKpis();
  if (kpiGanancia) kpiGanancia.textContent = formateaPrecio(k.ingresosMes);
  if (kpiTurnos7) kpiTurnos7.textContent = String(k.turnos7);
  if (kpiCancelaciones) kpiCancelaciones.textContent = String(k.cancelaciones7);
}

// ==================== TURNOS ====================
function pasaFiltros(turno) {
  if (filtroMes && filtroMes.value) {
    const pref = filtroMes.value;
    if (!turno.fecha || !String(turno.fecha).startsWith(pref)) return false;
  }
  if (filtroFecha && filtroFecha.value) {
    if (String(turno.fecha) !== String(filtroFecha.value)) return false;
  }
  return true;
}

function renderTurnosTabla() {
  if (!tablaTurnos) return;
  tablaTurnos.innerHTML = "";

  const ordenados = [...state.turnos].sort((a, b) => {
    const aKey = (a.fecha || "") + " " + (a.hora || "");
    const bKey = (b.fecha || "") + " " + (b.hora || "");
    return aKey.localeCompare(bKey);
  });

  const filtrados = ordenados.filter(pasaFiltros);

  if (!filtrados.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7">Todavía no hay turnos para los filtros seleccionados.</td>`;
    tablaTurnos.appendChild(tr);
    return;
  }

  filtrados.forEach((t) => {
    const serv = state.servicios.find((s) => s.id === t.servicioId);
    const servicioNombre = serv ? serv.nombre : "—";

    const tr = document.createElement("tr");
    const claseEstado =
      t.estado === "cancelado"
        ? "badge-cancelado"
        : t.estado === "pendiente"
        ? "badge-pendiente"
        : "badge-confirmado";

    const urlWA = t.whatsapp ? linkWhatsAppConMensaje(t, servicioNombre) : "";
    const waCell = t.whatsapp
      ? (urlWA
          ? `<a href="${urlWA}" target="_blank" rel="noopener" style="color:#16a34a;text-decoration:none;font-weight:600;">
               <i class="fa-brands fa-whatsapp"></i> ${escapeHtml(t.whatsapp)}
             </a>`
          : `${escapeHtml(t.whatsapp)}`
        )
      : "";

    tr.innerHTML = `
      <td>${escapeHtml(formateaFechaCorta(t.fecha))}</td>
      <td>${escapeHtml(t.hora || "")}</td>
      <td>${escapeHtml(servicioNombre)}</td>
      <td>${escapeHtml(t.cliente || "")}</td>
      <td>${waCell}</td>
      <td><span class="badge-estado ${claseEstado}">${escapeHtml(t.estado || "")}</span></td>
      <td>
        ${
          t.estado !== "confirmado"
            ? `<button type="button" class="btn-table confirm" data-accion="confirmar" data-id="${t.id}">Confirmar</button>`
            : ""
        }
        ${
          t.estado !== "cancelado"
            ? `<button type="button" class="btn-table cancel" data-accion="cancelar" data-id="${t.id}">Cancelar</button>`
            : ""
        }
        <button type="button" class="btn-table" data-accion="borrar" data-id="${t.id}">Borrar</button>
      </td>
    `;
    tablaTurnos.appendChild(tr);
  });
}

tablaTurnos?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;

  const id = btn.dataset.id;
  const accion = btn.dataset.accion;
  if (!id || !accion) return;

  const ref = doc(turnosCol, id);

  try {
    if (accion === "confirmar") await updateDoc(ref, { estado: "confirmado" });
    if (accion === "cancelar") await updateDoc(ref, { estado: "cancelado" });
    if (accion === "borrar") await deleteDoc(ref);
  } catch (err) {
    console.error("Error actualizando turno", err);
    alert("Ocurrió un error al actualizar el turno.");
  }
});

// HORARIOS SELECT
function renderHorarioOptions() {
  if (!ntHora) return;
  ntHora.innerHTML = "";
  const slots = generarSlots(state.config);
  slots.forEach((h) => {
    const opt = document.createElement("option");
    opt.value = h;
    opt.textContent = h;
    ntHora.appendChild(opt);
  });
}

// Servicios -> select (turno normal)
function renderServiciosEnSelect() {
  if (!ntServicio) return;
  ntServicio.innerHTML = "";

  if (!state.servicios.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Cargá servicios en Config";
    ntServicio.appendChild(opt);
    ntServicio.disabled = true;
    return;
  }

  ntServicio.disabled = false;
  state.servicios.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.nombre} — ${formateaPrecio(s.precio || 0)}`;
    ntServicio.appendChild(opt);
  });
}

// ==================== ESPECIALES: CATEGORÍAS + SERVICIO OPCIONAL ====================
function getCategoriasUnicas() {
  const set = new Set();
  state.servicios.forEach((s) => set.add(normCat(s.categoria || "General")));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

function renderCategoriasEnSelectEspecial() {
  if (!espCategoria) return;

  espCategoria.innerHTML = "";
  const cats = getCategoriasUnicas();

  if (!cats.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Primero cargá servicios";
    espCategoria.appendChild(opt);
    espCategoria.disabled = true;
    return;
  }

  espCategoria.disabled = false;

  cats.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    espCategoria.appendChild(opt);
  });

  espCategoria.onchange = () => {
    renderServiciosEnSelectEspecial();
  };
}

// Servicio -> select (especial) (opcional)
function renderServiciosEnSelectEspecial() {
  if (!espServicio) return;

  espServicio.innerHTML = "";

  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "— (Sin servicio · solo categoría) —";
  espServicio.appendChild(optNone);

  if (!state.servicios.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Primero cargá servicios en Config";
    espServicio.appendChild(opt);
    espServicio.disabled = true;
    return;
  }

  espServicio.disabled = false;

  const catSel = espCategoria?.value ? normCat(espCategoria.value) : "";

  const lista = [...state.servicios]
    .filter((s) => (catSel ? normCat(s.categoria || "General") === catSel : true))
    .sort((a, b) => {
      const ak = `${a.categoria || ""} ${a.nombre || ""}`.toLowerCase();
      const bk = `${b.categoria || ""} ${b.nombre || ""}`.toLowerCase();
      return ak.localeCompare(bk);
    });

  lista.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    const cat = s.categoria ? ` (${s.categoria})` : "";
    opt.textContent = `${s.nombre}${cat} — ${formateaPrecio(s.precio || 0)}`;
    espServicio.appendChild(opt);
  });
}

// Crear nuevo turno desde el panel
formNuevoTurno?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!ntServicio.value) {
    alert("Cargá al menos un servicio en la pestaña Config.");
    return;
  }

  const nuevo = {
    fecha: ntFecha.value,
    hora: ntHora.value,
    servicioId: ntServicio.value,
    cliente: ntCliente.value.trim(),
    whatsapp: ntWa.value.trim(),
    notas: ntNotas.value.trim(),
    estado: "confirmado",
    origen: "admin",
    creadoEn: serverTimestamp()
  };

  if (!nuevo.fecha || !nuevo.hora || !nuevo.cliente || !nuevo.whatsapp) {
    alert("Completá fecha, hora, nombre y WhatsApp.");
    return;
  }

  try {
    await addDoc(turnosCol, nuevo);
    formNuevoTurno.reset();
    if (ntFecha) ntFecha.value = isoFechaOffset(0);
    msgTurno?.classList.add("show");
    setTimeout(() => msgTurno?.classList.remove("show"), 3000);
  } catch (err) {
    console.error("Error creando turno", err);
    alert("No se pudo guardar el turno.");
  }
});

// ==================== NEGOCIO & HORARIO ====================
function rellenarFormNegocio() {
  if (cfgNombre) cfgNombre.value = state.negocio.nombre || "";
  if (cfgSlogan) cfgSlogan.value = state.negocio.slogan || "";
  if (cfgRubro) cfgRubro.value = state.negocio.rubro || "";
  if (cfgWa) cfgWa.value = state.negocio.whatsapp || "";
  if (cfgColor) cfgColor.value = state.negocio.colorPrincipal || "#4BAF8C";
  if (cfgIg) cfgIg.value = state.negocio.instagram || "";
  if (cfgFb) cfgFb.value = state.negocio.facebook || "";
  if (cfgDireccion) cfgDireccion.value = state.negocio.direccion || "";
  if (cfgCiudad) cfgCiudad.value = state.negocio.ciudad || "";
  if (cfgMaps) cfgMaps.value = state.negocio.mapsUrl || "";
  if (cfgLogoUrl) cfgLogoUrl.value = state.negocio.logoUrl || "";
  if (cfgHorariosResumen) cfgHorariosResumen.value = state.negocio.horariosResumen || "";
}

function rellenarFormHorario() {
  if (cfgApertura) cfgApertura.value = state.config.apertura || "09:00";
  if (cfgCierre) cfgCierre.value = state.config.cierre || "20:00";
  if (cfgDuracion) cfgDuracion.value = state.config.duracionMin || 30;
  if (cfgAlias) cfgAlias.value = state.config.aliasPago || "";
}

formNegocio?.addEventListener("submit", async (e) => {
  e.preventDefault();

  state.negocio.nombre = cfgNombre.value.trim() || "Nombre del negocio";
  state.negocio.slogan = (cfgSlogan?.value || "").trim();
  state.negocio.rubro = cfgRubro.value.trim() || "Rubro";
  state.negocio.whatsapp = cfgWa.value.trim();
  state.negocio.colorPrincipal = cfgColor.value || "#4BAF8C";
  state.negocio.instagram = cfgIg.value.trim();
  state.negocio.facebook = cfgFb.value.trim();
  state.negocio.direccion = (cfgDireccion?.value || "").trim();
  state.negocio.ciudad = (cfgCiudad?.value || "").trim();
  state.negocio.mapsUrl = (cfgMaps?.value || "").trim();
  state.negocio.logoUrl = (cfgLogoUrl?.value || "").trim();
  state.negocio.horariosResumen = (cfgHorariosResumen?.value || "").trim();

  try {
    await setDoc(
      negocioRef,
      {
        nombre: state.negocio.nombre,
        slogan: state.negocio.slogan,
        rubro: state.negocio.rubro,
        whatsapp: state.negocio.whatsapp,
        instagram: state.negocio.instagram,
        facebook: state.negocio.facebook,
        direccion: state.negocio.direccion,
        ciudad: state.negocio.ciudad,
        mapsUrl: state.negocio.mapsUrl,
        logoUrl: state.negocio.logoUrl,
        horariosResumen: state.negocio.horariosResumen,
        colorPrincipal: state.negocio.colorPrincipal,
        color: state.negocio.colorPrincipal
      },
      { merge: true }
    );

    renderHeader();
    renderServiciosEnSelect();
    renderCategoriasEnSelectEspecial();
    renderServiciosEnSelectEspecial();
    renderTurnosTabla();
    renderKpis();
    renderDashboard();
    alert("Datos del negocio guardados.");
  } catch (err) {
    console.error("Error guardando negocio", err);
    alert("No se pudieron guardar los datos del negocio.");
  }
});

formHorario?.addEventListener("submit", async (e) => {
  e.preventDefault();

  state.config.apertura = cfgApertura.value || "09:00";
  state.config.cierre = cfgCierre.value || "20:00";
  state.config.duracionMin = Number(cfgDuracion.value) || 30;
  state.config.aliasPago = cfgAlias.value.trim();

  try {
    await setDoc(
      negocioRef,
      {
        apertura: state.config.apertura,
        cierre: state.config.cierre,
        duracionMin: state.config.duracionMin,
        aliasPago: state.config.aliasPago
      },
      { merge: true }
    );

    renderHorarioOptions();
    renderEspecialSlotsUI(true);
    renderTurnosTabla();
    alert("Horario guardado. Los horarios disponibles se actualizaron.");
  } catch (err) {
    console.error("Error guardando horario", err);
    alert("No se pudieron guardar los horarios.");
  }
});

// ==================== SERVICIOS ====================
function limpiarServicioForm() {
  if (svcIdEdit) svcIdEdit.value = "";
  if (svcCategoria) svcCategoria.value = "";
  if (svcNombre) svcNombre.value = "";
  if (svcDuracion) svcDuracion.value = "";
  if (svcPrecio) svcPrecio.value = "";
  if (btnGuardarServicio) btnGuardarServicio.textContent = "Guardar servicio";
}

function renderServiciosLista() {
  if (!listaServicios) return;
  listaServicios.innerHTML = "";

  if (!state.servicios.length) {
    const li = document.createElement("li");
    li.textContent = "Todavía no hay servicios cargados.";
    li.style.fontSize = ".78rem";
    li.style.color = "#6b7280";
    listaServicios.appendChild(li);
    return;
  }

  state.servicios.forEach((s) => {
    const li = document.createElement("li");
    li.className = "svc-item";
    li.innerHTML = `
      <div class="svc-left">
        <div class="svc-name">${escapeHtml(s.nombre || "Servicio")}</div>
        <div class="svc-meta">${escapeHtml(s.categoria || "General")} · ${escapeHtml(s.duracionMin || 30)} min</div>
      </div>
      <div class="svc-right">
        <div class="svc-precio">${escapeHtml(formateaPrecio(s.precio || 0))}</div>
        <div class="svc-actions">
          <button type="button" class="btn btn-outline" data-accion="editar-servicio" data-id="${s.id}">Editar</button>
          <button type="button" class="btn btn-outline" data-accion="borrar-servicio" data-id="${s.id}">Borrar</button>
        </div>
      </div>
    `;
    listaServicios.appendChild(li);
  });
}

listaServicios?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;

  const id = btn.dataset.id;
  const accion = btn.dataset.accion;
  if (!id || !accion) return;

  if (accion === "editar-servicio") {
    const servicio = state.servicios.find((s) => s.id === id);
    if (!servicio) return;

    svcIdEdit.value = servicio.id;
    svcCategoria.value = servicio.categoria || "";
    svcNombre.value = servicio.nombre || "";
    svcDuracion.value = servicio.duracionMin || "";
    svcPrecio.value = servicio.precio ? formateaPrecio(servicio.precio) : "";
    btnGuardarServicio.textContent = "Actualizar servicio";
  }

  if (accion === "borrar-servicio") {
    if (!confirm("¿Borrar este servicio?")) return;
    try {
      await deleteDoc(doc(serviciosCol, id));
    } catch (err) {
      console.error("Error borrando servicio", err);
      alert("No se pudo borrar el servicio.");
    }
  }
});

formServicio?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const cat = (svcCategoria.value || "").trim() || "General";
  const nom = (svcNombre.value || "").trim() || "Servicio sin nombre";
  const dur = Number(svcDuracion.value) || 30;
  const precio = parsePrecio(svcPrecio.value);

  const data = { categoria: cat, nombre: nom, duracionMin: dur, precio };

  try {
    if (svcIdEdit.value) await updateDoc(doc(serviciosCol, svcIdEdit.value), data);
    else await addDoc(serviciosCol, data);
    limpiarServicioForm();
  } catch (err) {
    console.error("Error guardando servicio", err);
    alert("No se pudo guardar el servicio.");
  }
});

btnLimpiarServicio?.addEventListener("click", limpiarServicioForm);

// ==================== DASHBOARD ====================
function obtenerMesDashboardPref() {
  if (dashFiltroMes && dashFiltroMes.value) return dashFiltroMes.value;
  return mesActualYYYYMM();
}

function renderDashboard() {
  if (!tablaResumenServicios) return;

  const mesDash = obtenerMesDashboardPref();
  if (dashMesLabel) dashMesLabel.textContent = formatearMesLindo(mesDash);

  const turnosDelMes = state.turnos.filter((t) => t?.fecha && String(t.fecha).startsWith(mesDash));

  let totalNoCancel = 0;
  let totalCancel = 0;
  let ingresosMes = 0;

  turnosDelMes.forEach((t) => {
    if (t.estado === "cancelado") {
      totalCancel++;
      return;
    }
    totalNoCancel++;

    if (t.estado === "confirmado") {
      const serv = state.servicios.find((s) => s.id === t.servicioId);
      if (serv) ingresosMes += serv.precio || 0;
    }
  });

  if (dashTurnosMes) dashTurnosMes.textContent = String(totalNoCancel);
  if (dashCancelacionesMes) dashCancelacionesMes.textContent = String(totalCancel);
  if (dashIngresosMes) dashIngresosMes.textContent = formateaPrecio(ingresosMes);

  tablaResumenServicios.innerHTML = "";
  const conteo = {};

  turnosDelMes.forEach((t) => {
    if (t.estado === "cancelado") return;
    const serv = state.servicios.find((s) => s.id === t.servicioId);
    if (!serv) return;
    if (!conteo[serv.id]) conteo[serv.id] = { servicio: serv, cantidad: 0 };
    conteo[serv.id].cantidad++;
  });

  const entries = Object.values(conteo).sort((a, b) => b.cantidad - a.cantidad);

  if (!entries.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3">Todavía no hay datos para el mes seleccionado.</td>`;
    tablaResumenServicios.appendChild(tr);
  } else {
    entries.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.servicio.nombre)}</td>
        <td>${escapeHtml(item.cantidad)}</td>
        <td>${escapeHtml(formateaPrecio(item.cantidad * (item.servicio.precio || 0)))}</td>
      `;
      tablaResumenServicios.appendChild(tr);
    });
  }

  if (!dashTopServicios) return;
  dashTopServicios.innerHTML = "";

  if (!entries.length) {
    dashTopServicios.innerHTML = `
      <div class="dash-top-item">
        <div class="dash-top-row">
          <div style="min-width:0;">
            <div class="dash-top-name">Todavía no hay datos</div>
            <div class="dash-top-meta">Cargá turnos para ver el top del mes.</div>
          </div>
          <div style="font-size:.78rem;color:#0f172a;font-weight:700;">0</div>
        </div>
        <div class="dash-bar"><span style="width:0%"></span></div>
      </div>
    `;
    return;
  }

  const max = Math.max(...entries.map((e) => e.cantidad || 0), 1);
  const topN = entries.slice(0, 5);

  topN.forEach((item) => {
    const total = item.cantidad * (item.servicio.precio || 0);
    const pct = Math.round((item.cantidad / max) * 100);

    const div = document.createElement("div");
    div.className = "dash-top-item";
    div.innerHTML = `
      <div class="dash-top-row">
        <div style="min-width:0;">
          <div class="dash-top-name">${escapeHtml(item.servicio.nombre)}</div>
          <div class="dash-top-meta">${escapeHtml(item.cantidad)} turnos · ${escapeHtml(formateaPrecio(total))}</div>
        </div>
        <div style="font-size:.78rem;color:#0f172a;font-weight:700;">${escapeHtml(item.cantidad)}</div>
      </div>
      <div class="dash-bar"><span style="width:${pct}%"></span></div>
    `;
    dashTopServicios.appendChild(div);
  });
}

// ==================== TURNOS ESPECIALES (UI + CRUD) ====================
let selectedEspecialSlots = new Set();

function setSelectedSlots(arr = []) {
  selectedEspecialSlots = new Set(Array.isArray(arr) ? arr : []);
}

function getSelectedSlotsArray() {
  return Array.from(selectedEspecialSlots);
}

function renderEspecialSlotsUI(preservar = false) {
  if (!espSlots) return;

  const disponibles = generarSlots(state.config);

  if (preservar) {
    const next = new Set();
    selectedEspecialSlots.forEach((h) => {
      if (disponibles.includes(h)) next.add(h);
    });
    selectedEspecialSlots = next;
  }

  espSlots.innerHTML = "";

  disponibles.forEach((h) => {
    const activo = selectedEspecialSlots.has(h);
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.slot = h;
    b.textContent = h;

    b.style.border = "1px solid #e5e7eb";
    b.style.borderRadius = "999px";
    b.style.padding = "6px 10px";
    b.style.fontSize = ".78rem";
    b.style.cursor = "pointer";
    b.style.userSelect = "none";

    if (activo) {
      b.style.background = "rgba(74,222,128,.18)";
      b.style.borderColor = "rgba(34,197,94,.55)";
      b.style.color = "#166534";
      b.style.fontWeight = "700";
    } else {
      b.style.background = "#ffffff";
      b.style.color = "#0f172a";
      b.style.fontWeight = "600";
    }

    espSlots.appendChild(b);
  });
}

espSlots?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-slot]");
  if (!btn) return;

  const h = btn.dataset.slot;
  if (!h) return;

  if (selectedEspecialSlots.has(h)) selectedEspecialSlots.delete(h);
  else selectedEspecialSlots.add(h);

  renderEspecialSlotsUI(true);
});

function limpiarEspecialForm() {
  if (espIdEdit) espIdEdit.value = "";
  if (espFecha) espFecha.value = isoFechaOffset(0);
  if (espActivo) espActivo.value = "true";
  if (espPromo) espPromo.value = "";

  if (espCategoria && !espCategoria.disabled) {
    espCategoria.value = espCategoria.options?.[0]?.value || "";
    renderServiciosEnSelectEspecial();
  }

  if (espServicio) espServicio.value = "";
  setSelectedSlots([]);
  renderEspecialSlotsUI(true);

  if (btnGuardarEspecial) btnGuardarEspecial.textContent = "Guardar especial";
}

async function existeEspecialActivoMismaFecha(fecha, exceptId = "") {
  const q = query(especialesCol, where("fecha", "==", fecha));
  const snap = await getDocs(q);

  const otrosActivos = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.id !== exceptId)
    .filter((x) => x.activo !== false);

  return otrosActivos.length > 0;
}

async function contarConflictosTurnos(fecha, categoriaEspecial) {
  const catEsp = normCat(categoriaEspecial);
  const q = query(turnosCol, where("fecha", "==", fecha));
  const snap = await getDocs(q);

  let conflicts = 0;

  snap.forEach((d) => {
    const t = d.data() || {};
    if (t.estado === "cancelado") return;

    const serv = state.servicios.find((s) => s.id === t.servicioId);
    const catTurno = normCat(serv?.categoria || t.categoria || "General");

    if (catTurno !== catEsp) conflicts++;
  });

  return conflicts;
}

function renderEspecialesTabla() {
  if (!tablaEspeciales) return;
  tablaEspeciales.innerHTML = "";

  const ordenados = [...state.especiales].sort((a, b) => {
    const ak = (a.fecha || "") + " " + normCat(a.categoria || "");
    const bk = (b.fecha || "") + " " + normCat(b.categoria || "");
    return ak.localeCompare(bk);
  });

  if (!ordenados.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6">Todavía no hay turnos especiales para este mes.</td>`;
    tablaEspeciales.appendChild(tr);
    return;
  }

  ordenados.forEach((esp) => {
    const cat = normCat(esp.categoria || "");
    const serv = esp.servicioId ? state.servicios.find((s) => s.id === esp.servicioId) : null;
    const nombreServ = serv?.nombre || "— (sin servicio)";

    const horarios =
      Array.isArray(esp.slots) && esp.slots.length ? esp.slots.join(", ") : "Horarios normales";

    const promo = (esp.promo || "").trim();
    const promoTxt = promo ? promo : "—";
    const activo = esp.activo !== false;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(formateaFechaCorta(esp.fecha))}</td>
      <td>
        <div style="font-weight:800;color:#0f172a;">${escapeHtml(cat)}</div>
        <div style="font-size:.78rem;color:#64748b;">${escapeHtml(nombreServ)}</div>
      </td>
      <td title="${escapeHtml(promoTxt)}">${escapeHtml(
        promoTxt.length > 60 ? promoTxt.slice(0, 60) + "…" : promoTxt
      )}</td>
      <td>${escapeHtml(horarios)}</td>
      <td>
        <span class="badge-estado ${activo ? "badge-confirmado" : "badge-cancelado"}">
          ${activo ? "activo" : "pausado"}
        </span>
      </td>
      <td>
        <button type="button" class="btn-table" data-accion="editar-especial" data-id="${esp.id}">Editar</button>
        <button type="button" class="btn-table ${activo ? "cancel" : "confirm"}" data-accion="toggle-especial" data-id="${esp.id}">
          ${activo ? "Pausar" : "Activar"}
        </button>
        <button type="button" class="btn-table" data-accion="borrar-especial" data-id="${esp.id}">Borrar</button>
      </td>
    `;
    tablaEspeciales.appendChild(tr);
  });
}

tablaEspeciales?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;

  const accion = btn.dataset.accion;
  const id = btn.dataset.id;
  if (!accion || !id) return;

  if (accion === "editar-especial") {
    const esp = state.especiales.find((x) => x.id === id);
    if (!esp) return;

    if (espIdEdit) espIdEdit.value = esp.id;
    if (espFecha) espFecha.value = esp.fecha || "";
    if (espActivo) espActivo.value = esp.activo === false ? "false" : "true";
    if (espPromo) espPromo.value = esp.promo || "";

    if (espCategoria && !espCategoria.disabled) {
      espCategoria.value = normCat(esp.categoria || "");
      renderServiciosEnSelectEspecial();
    }

    if (espServicio) espServicio.value = esp.servicioId || "";

    setSelectedSlots(Array.isArray(esp.slots) ? esp.slots : []);
    renderEspecialSlotsUI(true);

    if (btnGuardarEspecial) btnGuardarEspecial.textContent = "Actualizar especial";
    return;
  }

  if (accion === "toggle-especial") {
    const esp = state.especiales.find((x) => x.id === id);
    if (!esp) return;

    const activoActual = esp.activo !== false;

    try {
      await updateDoc(doc(especialesCol, id), {
        activo: !activoActual,
        actualizadoEn: serverTimestamp()
      });
    } catch (err) {
      console.error("Error cambiando estado especial", err);
      alert("No se pudo actualizar el estado del especial.");
    }
    return;
  }

  if (accion === "borrar-especial") {
    if (!confirm("¿Borrar este turno especial?")) return;
    try {
      await deleteDoc(doc(especialesCol, id));
    } catch (err) {
      console.error("Error borrando especial", err);
      alert("No se pudo borrar el especial.");
    }
  }
});

formEspecial?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fecha = (espFecha?.value || "").trim();
  if (!fecha) {
    alert("Elegí una fecha.");
    return;
  }

  let categoria = "";
  if (espCategoria && !espCategoria.disabled) {
    categoria = normCat(espCategoria.value || "");
    if (!categoria) {
      alert("Elegí una categoría.");
      return;
    }
  }

  const servicioId = (espServicio?.value || "").trim();

  if (!espCategoria) {
    if (!servicioId) {
      alert("No tenés #esp-categoria en el HTML. Elegí un servicio para inferir la categoría.");
      return;
    }
    const serv = state.servicios.find((s) => s.id === servicioId);
    categoria = normCat(serv?.categoria || "General");
  }

  const activo = espActivo?.value !== "false";
  const promo = (espPromo?.value || "").trim();
  const editId = (espIdEdit?.value || "").trim();

  if (activo) {
    const ya = await existeEspecialActivoMismaFecha(fecha, editId);
    if (ya) {
      alert("Ya existe un turno especial ACTIVO en esa fecha. Pausalo o borrá el anterior.");
      return;
    }
  }

  if (activo) {
    const conflicts = await contarConflictosTurnos(fecha, categoria);
    if (conflicts > 0) {
      const ok = confirm(
        `Atención: ya hay ${conflicts} turno(s) ese día que NO son de "${categoria}".\n\nSi activás este especial, el turnero bloqueará ese día para otras categorías.\n\n¿Querés continuar?`
      );
      if (!ok) return;
    }
  }

  const data = {
    fecha,
    categoria,
    activo,
    promo,
    slots: getSelectedSlotsArray(),
    actualizadoEn: serverTimestamp()
  };

  if (servicioId) data.servicioId = servicioId;
  if (!data.slots.length) delete data.slots;

  try {
    if (editId) {
      await updateDoc(doc(especialesCol, editId), data);
    } else {
      await addDoc(especialesCol, { ...data, creadoEn: serverTimestamp() });
    }

    limpiarEspecialForm();
    msgEspecial?.classList.add("show");
    setTimeout(() => msgEspecial?.classList.remove("show"), 2500);
  } catch (err) {
    console.error("Error guardando especial", err);
    alert("No se pudo guardar el turno especial.");
  }
});

btnLimpiarEspecial?.addEventListener("click", limpiarEspecialForm);

// ==================== SALIR ====================
btnSalir?.addEventListener("click", () => {
  window.location.href = "turnos.html?negocio=" + encodeURIComponent(negocioId);
});

// ==================== FIREBASE LOADERS ====================
async function cargarNegocioDesdeFirebase() {
  try {
    const snap = await getDoc(negocioRef);

    if (snap.exists()) {
      const d = snap.data();

      state.negocio.nombre = d.nombre || state.negocio.nombre;
      state.negocio.rubro = d.rubro || state.negocio.rubro;
      state.negocio.slogan = d.slogan || state.negocio.slogan;
      state.negocio.whatsapp = d.whatsapp || state.negocio.whatsapp;
      state.negocio.instagram = d.instagram || state.negocio.instagram;
      state.negocio.facebook = d.facebook || state.negocio.facebook;

      state.negocio.colorPrincipal = d.colorPrincipal || d.color || state.negocio.colorPrincipal;

      state.negocio.direccion = d.direccion || state.negocio.direccion;
      state.negocio.ciudad = d.ciudad || state.negocio.ciudad;
      state.negocio.mapsUrl = d.mapsUrl || state.negocio.mapsUrl;
      state.negocio.logoUrl = d.logoUrl || state.negocio.logoUrl;
      state.negocio.horariosResumen = d.horariosResumen || state.negocio.horariosResumen;

      state.config.apertura = d.apertura || state.config.apertura;
      state.config.cierre = d.cierre || state.config.cierre;
      state.config.duracionMin = d.duracionMin || state.config.duracionMin;
      state.config.aliasPago = d.aliasPago || state.config.aliasPago;
    } else {
      await setDoc(negocioRef, {
        ...state.negocio,
        color: state.negocio.colorPrincipal,
        apertura: state.config.apertura,
        cierre: state.config.cierre,
        duracionMin: state.config.duracionMin,
        aliasPago: state.config.aliasPago
      });
    }

    renderHeader();
    rellenarFormNegocio();
    rellenarFormHorario();
    renderHorarioOptions();
    renderEspecialSlotsUI(true);
  } catch (err) {
    console.error("Error cargando negocio", err);
  }
}

// ✅ Servicios: con fallback si orderBy rompe
let unsubServicios = null;

function escucharServiciosFirebase() {
  if (typeof unsubServicios === "function") {
    unsubServicios();
    unsubServicios = null;
  }

  const onData = (snap) => {
    state.servicios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    renderServiciosLista();
    renderServiciosEnSelect();

    renderCategoriasEnSelectEspecial();
    renderServiciosEnSelectEspecial();

    renderEspecialesTabla();
    renderTurnosTabla();
    renderKpis();
    renderDashboard();
  };

  const onError = (err) => {
    console.error("Error escuchando servicios (orderBy nombre)", err);

    try {
      if (typeof unsubServicios === "function") unsubServicios();
    } catch {}

    unsubServicios = onSnapshot(
      serviciosCol,
      onData,
      (err2) => {
        console.error("Error escuchando servicios (fallback)", err2);
        alert("No se pueden leer los servicios. Revisá reglas o consola.");
      }
    );
  };

  const q1 = query(serviciosCol, orderBy("nombre"));
  unsubServicios = onSnapshot(q1, onData, onError);
}

// ==================== TURNOS POR MES ====================
let unsubTurnos = null;

function escucharTurnosPorMes(yyyyMm) {
  const mes = yyyyMm || mesActualYYYYMM();

  if (typeof unsubTurnos === "function") {
    unsubTurnos();
    unsubTurnos = null;
  }

  const desde = `${mes}-01`;
  const hasta = `${siguienteMesYYYYMM(mes)}-01`;

  const q = query(
    turnosCol,
    where("fecha", ">=", desde),
    where("fecha", "<", hasta),
    orderBy("fecha")
  );

  unsubTurnos = onSnapshot(
    q,
    (snap) => {
      state.turnos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderTurnosTabla();
      renderKpis();
      renderDashboard();
    },
    (err) => {
      console.error("Error escuchando turnos", err);
      alert("No se pueden leer los turnos (revisá reglas/índices).");
    }
  );
}

// ==================== ✅ KPI: TURNOS PRÓXIMOS 7 DÍAS (listener dedicado) ====================
let unsubTurnosUlt7 = null;

function escucharTurnosUltimos7Dias() {
  // ✅ PRÓXIMOS 7 DÍAS: hoy ... hoy+7 (exclusive)
  const desde = isoFechaOffset(0);
  const hasta = isoFechaOffset(7);

  if (typeof unsubTurnosUlt7 === "function") {
    unsubTurnosUlt7();
    unsubTurnosUlt7 = null;
  }

  const q = query(
    turnosCol,
    where("fecha", ">=", desde),
    where("fecha", "<", hasta),
    orderBy("fecha")
  );

  unsubTurnosUlt7 = onSnapshot(
    q,
    (snap) => {
      state.turnosUlt7 = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderKpis();
    },
    (err) => {
      console.error("Error escuchando turnos próximos 7 días (KPI)", err);
      state.turnosUlt7 = [];
      renderKpis();
    }
  );
}

// ==================== ESPECIALES POR MES ====================
let unsubEspeciales = null;

function escucharEspecialesPorMes(yyyyMm) {
  if (!tablaEspeciales) return;

  const mes = yyyyMm || mesActualYYYYMM();

  if (typeof unsubEspeciales === "function") {
    unsubEspeciales();
    unsubEspeciales = null;
  }

  const desde = `${mes}-01`;
  const hasta = `${siguienteMesYYYYMM(mes)}-01`;

  const q = query(
    especialesCol,
    where("fecha", ">=", desde),
    where("fecha", "<", hasta),
    orderBy("fecha")
  );

  unsubEspeciales = onSnapshot(
    q,
    (snap) => {
      state.especiales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderEspecialesTabla();
    },
    (err) => {
      console.error("Error escuchando especiales", err);
      alert("No se pueden leer los especiales (revisá reglas/índices).");
    }
  );
}

// ==================== SYNC MES (Agenda <-> Dashboard) ====================
function syncMesUI(nuevoMes) {
  if (filtroMes && filtroMes.value !== nuevoMes) filtroMes.value = nuevoMes;
  if (dashFiltroMes && dashFiltroMes.value !== nuevoMes) dashFiltroMes.value = nuevoMes;
}

filtroMes?.addEventListener("change", () => {
  const mes = filtroMes.value || mesActualYYYYMM();
  syncMesUI(mes);

  // ✅ si cambiás mes manualmente, limpiamos el filtro por día
  if (filtroFecha) filtroFecha.value = "";

  state.turnos = [];
  renderTurnosTabla();
  renderKpis();
  renderDashboard();

  escucharTurnosPorMes(mes);
});

filtroFecha?.addEventListener("change", () => {
  const fecha = (filtroFecha?.value || "").trim();

  // ✅ si elige fecha, forzamos el mes de esa fecha y mostramos SOLO ese día
  if (fecha) {
    const mes = fecha.slice(0, 7);
    syncMesUI(mes);

    state.turnos = [];
    renderTurnosTabla();
    renderKpis();
    renderDashboard();

    escucharTurnosPorMes(mes);
    return;
  }

  // si borra la fecha, recargamos el mes actual seleccionado
  const mes = (filtroMes?.value || "").trim() || mesActualYYYYMM();
  syncMesUI(mes);

  state.turnos = [];
  renderTurnosTabla();
  renderKpis();
  renderDashboard();

  escucharTurnosPorMes(mes);
});

btnLimpiarFiltros?.addEventListener("click", () => {
  if (filtroMes) filtroMes.value = "";
  if (filtroFecha) filtroFecha.value = "";

  const mes = mesActualYYYYMM();
  syncMesUI(mes);

  state.turnos = [];
  renderTurnosTabla();
  renderKpis();
  renderDashboard();

  escucharTurnosPorMes(mes);
});

dashFiltroMes?.addEventListener("change", () => {
  const mes = dashFiltroMes.value || mesActualYYYYMM();
  syncMesUI(mes);

  // ✅ si cambiás mes desde dashboard, limpiamos día
  if (filtroFecha) filtroFecha.value = "";

  state.turnos = [];
  renderTurnosTabla();
  renderKpis();
  renderDashboard();

  escucharTurnosPorMes(mes);
});

dashBtnMesActual?.addEventListener("click", () => {
  const mes = mesActualYYYYMM();
  syncMesUI(mes);

  // ✅ limpiamos día
  if (filtroFecha) filtroFecha.value = "";

  state.turnos = [];
  renderTurnosTabla();
  renderKpis();
  renderDashboard();

  escucharTurnosPorMes(mes);
});

espFiltroMes?.addEventListener("change", () => {
  const mes = espFiltroMes.value || mesActualYYYYMM();
  state.especiales = [];
  renderEspecialesTabla();
  escucharEspecialesPorMes(mes);
});

// ==================== INIT ====================
async function initAdmin() {
  const hoy = isoFechaOffset(0);
  const mesIni = hoy.slice(0, 7);

  if (ntFecha) ntFecha.value = hoy;

  if (filtroMes) filtroMes.value = mesIni;
  if (filtroFecha) filtroFecha.value = "";

  if (dashFiltroMes) dashFiltroMes.value = mesIni;
  if (dashMesLabel) dashMesLabel.textContent = formatearMesLindo(mesIni);

  if (espFiltroMes) espFiltroMes.value = mesIni;
  if (espFecha) espFecha.value = hoy;

  await cargarNegocioDesdeFirebase();

  escucharServiciosFirebase();

  // ✅ listeners
  escucharTurnosPorMes(mesIni);
  escucharTurnosUltimos7Dias(); // ✅ KPI PRÓXIMOS 7 DÍAS
  escucharEspecialesPorMes(mesIni);

  renderEspecialSlotsUI(true);
}

initAdmin().catch((err) => console.error("Error inicializando admin", err));

