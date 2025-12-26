import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs,
  setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, onSnapshot
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
const negocioId = params.get("negocio") || "demo";

const negocioRef = doc(db, "negocios", negocioId);
const serviciosCol = collection(negocioRef, "servicios");
const turnosCol = collection(negocioRef, "turnos");

// ==================== STATE EN MEMORIA ====================
const state = {
  negocio: {
    nombre: "Estética Bellezza",
    rubro: "Estéticas · Uñas · Masajes",
    whatsapp: "2613387305",
    instagram: "",
    facebook: "",
    color: "#4BAF8C"
  },
  config: {
    apertura: "09:00",
    cierre: "20:00",
    duracionMin: 30,
    aliasPago: ""
  },
  servicios: [],
  turnos: []
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

function mesActualYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ===== NUEVO: calcular mes siguiente (para rango [desde, hasta)) =====
function siguienteMesYYYYMM(yyyyMm) {
  const [y, m] = String(yyyyMm).split("-").map(Number);
  const d = new Date(y, (m - 1), 1);
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
  // "2025-12" -> "diciembre 2025"
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
  const color = state.negocio.color || "#4BAF8C";
  document.documentElement.style.setProperty("--accent", color);
}

// ====== NUEVO: helpers WA + mensaje ======
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizarWhatsAppAR(raw = "") {
  let d = String(raw).replace(/\D/g, "");
  if (!d) return "";

  // limpia prefijos comunes
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);

  // si viene con país
  if (d.startsWith("54")) {
    // asegurar 9 para móviles
    if (!d.startsWith("549")) d = "549" + d.slice(2);
    return d;
  }

  // si alguien pone 9... (móvil) sin país
  if (d.startsWith("9")) return "54" + d;

  // heurística: si viene con "15" pegado después del código de área, lo sacamos (AR)
  // ejemplo: 26115xxxxxxx -> 261xxxxxxx
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

  // asumimos AR móvil
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

  return (
`Hola ${cliente}

Recordatorio de turno — ${nombreNegocio}${rubroTxt}
${fecha} · ${hora}
Servicio: ${servicioNombre}${notasTxt}

Te esperamos.

Si necesitás reprogramar, avisanos por este WhatsApp.
¡Gracias!`
  );
}

function linkWhatsAppConMensaje(turno, servicioNombre) {
  if (!turno?.whatsapp) return "";
  const wa = normalizarWhatsAppAR(turno.whatsapp);
  if (!wa) return "";
  const msg = armarMensajeRecordatorio(turno, servicioNombre);
  return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
}
// ==================== FIN NUEVO ======

// ==================== DOM REFS ====================
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

const headerNombre = document.getElementById("header-nombre-negocio");
const headerRubro = document.getElementById("header-rubro");

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
const cfgRubro = document.getElementById("cfg-rubro");
const cfgWa = document.getElementById("cfg-wa");
const cfgColor = document.getElementById("cfg-color");
const cfgIg = document.getElementById("cfg-ig");
const cfgFb = document.getElementById("cfg-fb");

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

// ====== NUEVO: refs dashboard pro ======
const dashFiltroMes = document.getElementById("dash-filtro-mes");
const dashBtnMesActual = document.getElementById("dash-btn-mes-actual");
const dashMesLabel = document.getElementById("dash-mes-label");
const dashTurnosMes = document.getElementById("dash-turnos-mes");
const dashIngresosMes = document.getElementById("dash-ingresos-mes");
const dashCancelacionesMes = document.getElementById("dash-cancelaciones-mes");
const dashTopServicios = document.getElementById("dash-top-servicios");

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
  headerNombre.textContent = state.negocio.nombre || "Nombre del negocio";
  headerRubro.textContent = state.negocio.rubro || "Rubro";
  document.title = "Savia Admin · " + (state.negocio.nombre || "Panel profesional");
  aplicarColorAccent();
}

// ===== mes para KPI Ganancias (toma el filtro mes de Agenda si existe) =====
function obtenerMesKpiPref() {
  if (filtroMes && filtroMes.value) return filtroMes.value; // "yyyy-mm"
  return mesActualYYYYMM();
}

function calcularKpis() {
  const hoy = new Date();
  const ms7 = 7 * 24 * 60 * 60 * 1000;

  let turnos7 = 0;
  let cancelaciones = 0;
  let ingresos = 0;

  const mesKpi = obtenerMesKpiPref(); // <-- mensual

  state.turnos.forEach((t) => {
    if (!t.fecha) return;

    // KPI Turnos últimos 7 días + cancelaciones últimos 7 días
    const partes = String(t.fecha).split("-");
    let fecha;
    if (partes.length === 3) {
      fecha = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    } else {
      fecha = new Date(t.fecha);
    }
    if (!isNaN(fecha)) {
      const diff = hoy - fecha;
      if (diff >= 0 && diff <= ms7) {
        turnos7++;
        if (t.estado === "cancelado") cancelaciones++;
      }
    }

    // ingresos SOLO DEL MES (según filtroMes de Agenda o mes actual)
    if (t.estado === "confirmado" && t.fecha && String(t.fecha).startsWith(mesKpi)) {
      const serv = state.servicios.find((s) => s.id === t.servicioId);
      if (serv) ingresos += serv.precio || 0;
    }
  });

  return { turnos7, cancelaciones, ingresos };
}

function renderKpis() {
  const k = calcularKpis();
  if (kpiGanancia) kpiGanancia.textContent = formateaPrecio(k.ingresos);
  if (kpiTurnos7) kpiTurnos7.textContent = k.turnos7;
  if (kpiCancelaciones) kpiCancelaciones.textContent = k.cancelaciones;
}

// ==================== TURNOS ====================
function pasaFiltros(turno) {
  if (filtroMes && filtroMes.value) {
    const pref = filtroMes.value; // yyyy-mm
    if (!turno.fecha || !String(turno.fecha).startsWith(pref)) return false;
  }
  if (filtroFecha && filtroFecha.value) {
    if (turno.fecha !== filtroFecha.value) return false;
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
    if (accion === "confirmar") {
      await updateDoc(ref, { estado: "confirmado" });
    } else if (accion === "cancelar") {
      await updateDoc(ref, { estado: "cancelado" });
    } else if (accion === "borrar") {
      await deleteDoc(ref);
    }
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
    const hoyIsoVal = isoFechaOffset(0);
    ntFecha.value = hoyIsoVal;

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
  if (cfgRubro) cfgRubro.value = state.negocio.rubro || "";
  if (cfgWa) cfgWa.value = state.negocio.whatsapp || "";
  if (cfgColor) cfgColor.value = state.negocio.color || "#4BAF8C";
  if (cfgIg) cfgIg.value = state.negocio.instagram || "";
  if (cfgFb) cfgFb.value = state.negocio.facebook || "";
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
  state.negocio.rubro = cfgRubro.value.trim() || "Rubro";
  state.negocio.whatsapp = cfgWa.value.trim();
  state.negocio.color = cfgColor.value || "#4BAF8C";
  state.negocio.instagram = cfgIg.value.trim();
  state.negocio.facebook = cfgFb.value.trim();

  try {
    await setDoc(
      negocioRef,
      {
        nombre: state.negocio.nombre,
        rubro: state.negocio.rubro,
        whatsapp: state.negocio.whatsapp,
        color: state.negocio.color,
        instagram: state.negocio.instagram,
        facebook: state.negocio.facebook
      },
      { merge: true }
    );
    renderHeader();
    renderServiciosEnSelect();
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
        <div class="svc-name">${escapeHtml(s.nombre)}</div>
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
    if (svcIdEdit) svcIdEdit.value = servicio.id;
    if (svcCategoria) svcCategoria.value = servicio.categoria || "";
    if (svcNombre) svcNombre.value = servicio.nombre || "";
    if (svcDuracion) svcDuracion.value = servicio.duracionMin || "";
    if (svcPrecio) svcPrecio.value = servicio.precio ? formateaPrecio(servicio.precio) : "";
    if (btnGuardarServicio) btnGuardarServicio.textContent = "Actualizar servicio";
  } else if (accion === "borrar-servicio") {
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

  const data = {
    categoria: cat,
    nombre: nom,
    duracionMin: dur,
    precio: precio
  };

  try {
    if (svcIdEdit.value) {
      await updateDoc(doc(serviciosCol, svcIdEdit.value), data);
    } else {
      await addDoc(serviciosCol, data);
    }
    limpiarServicioForm();
  } catch (err) {
    console.error("Error guardando servicio", err);
    alert("No se pudo guardar el servicio.");
  }
});

btnLimpiarServicio?.addEventListener("click", limpiarServicioForm);

// ==================== DASHBOARD (PRO + FILTRO MENSUAL) ====================
function obtenerMesDashboardPref() {
  if (dashFiltroMes && dashFiltroMes.value) return dashFiltroMes.value; // "yyyy-mm"
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
    if (!conteo[serv.id]) {
      conteo[serv.id] = { servicio: serv, cantidad: 0 };
    }
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

  if (dashTopServicios) {
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
}

// ==================== SALIR ====================
btnSalir?.addEventListener("click", () => {
  window.location.href = "turnos.html?negocio=" + encodeURIComponent(negocioId);
});

// ==================== FIREBASE LOADERS (NEGOCIO, SERVICIOS, TURNOS) ====================
async function cargarNegocioDesdeFirebase() {
  try {
    const snap = await getDoc(negocioRef);
    if (snap.exists()) {
      const d = snap.data();
      state.negocio.nombre = d.nombre || state.negocio.nombre;
      state.negocio.rubro = d.rubro || state.negocio.rubro;
      state.negocio.whatsapp = d.whatsapp || state.negocio.whatsapp;
      state.negocio.instagram = d.instagram || state.negocio.instagram;
      state.negocio.facebook = d.facebook || state.negocio.facebook;
      state.negocio.color = d.color || state.negocio.color;

      state.config.apertura = d.apertura || state.config.apertura;
      state.config.cierre = d.cierre || state.config.cierre;
      state.config.duracionMin = d.duracionMin || state.config.duracionMin;
      state.config.aliasPago = d.aliasPago || state.config.aliasPago;
    } else {
      await setDoc(negocioRef, {
        nombre: state.negocio.nombre,
        rubro: state.negocio.rubro,
        whatsapp: state.negocio.whatsapp,
        instagram: state.negocio.instagram,
        facebook: state.negocio.facebook,
        color: state.negocio.color,
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
  } catch (err) {
    console.error("Error cargando negocio", err);
  }
}

function escucharServiciosFirebase() {
  const q = query(serviciosCol, orderBy("nombre"));
  return onSnapshot(q, (snap) => {
    state.servicios = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));
    renderServiciosLista();
    renderServiciosEnSelect();
    renderTurnosTabla();
    renderKpis();
    renderDashboard();
  });
}

// ==================== TURNOS POR MES (listener liviano) ====================
let unsubTurnos = null;

function escucharTurnosPorMes(yyyyMm) {
  const mes = yyyyMm || mesActualYYYYMM();

  // desconecta listener anterior
  if (typeof unsubTurnos === "function") {
    unsubTurnos();
    unsubTurnos = null;
  }

  // rango [desde, hasta)
  const desde = `${mes}-01`;
  const hasta = `${siguienteMesYYYYMM(mes)}-01`;

  const q = query(
    turnosCol,
    where("fecha", ">=", desde),
    where("fecha", "<", hasta),
    orderBy("fecha")
  );

  unsubTurnos = onSnapshot(q, (snap) => {
    state.turnos = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));
    renderTurnosTabla();
    renderKpis();
    renderDashboard();
  });
}

// ==================== SYNC MES (Agenda <-> Dashboard) ====================
function syncMesUI(nuevoMes) {
  if (filtroMes && filtroMes.value !== nuevoMes) filtroMes.value = nuevoMes;
  if (dashFiltroMes && dashFiltroMes.value !== nuevoMes) dashFiltroMes.value = nuevoMes;
}

// ====== CAMBIO: filtros ======
filtroMes?.addEventListener("change", () => {
  const mes = filtroMes.value || mesActualYYYYMM();

  // sincroniza dashboard al mismo mes (así siempre hay datos)
  syncMesUI(mes);

  // limpia estado visual rápido
  state.turnos = [];
  renderTurnosTabla();
  renderKpis();
  renderDashboard();

  // re-escucha el mes seleccionado
  escucharTurnosPorMes(mes);
});

filtroFecha?.addEventListener("change", () => {
  renderTurnosTabla();
});

btnLimpiarFiltros?.addEventListener("click", () => {
  if (filtroMes) filtroMes.value = "";
  if (filtroFecha) filtroFecha.value = "";

  // vuelve a mes actual
  const mes = mesActualYYYYMM();
  syncMesUI(mes);

  state.turnos = [];
  renderTurnosTabla();
  renderKpis();
  renderDashboard();

  escucharTurnosPorMes(mes);
});

// listeners del filtro del dashboard (sincroniza con agenda + recarga mes)
dashFiltroMes?.addEventListener("change", () => {
  const mes = dashFiltroMes.value || mesActualYYYYMM();
  syncMesUI(mes);

  state.turnos = [];
  renderTurnosTabla();
  renderKpis();
  renderDashboard();

  escucharTurnosPorMes(mes);
});

dashBtnMesActual?.addEventListener("click", () => {
  const mes = mesActualYYYYMM();
  syncMesUI(mes);

  state.turnos = [];
  renderTurnosTabla();
  renderKpis();
  renderDashboard();

  escucharTurnosPorMes(mes);
});

// ==================== INIT ====================
async function initAdmin() {
  const hoy = isoFechaOffset(0);
  const mesIni = hoy.slice(0, 7);

  // agenda default
  if (ntFecha) ntFecha.value = hoy;
  if (filtroFecha) filtroFecha.value = hoy;
  if (filtroMes) filtroMes.value = mesIni;

  // dashboard default
  if (dashFiltroMes) dashFiltroMes.value = mesIni;
  if (dashMesLabel) dashMesLabel.textContent = formatearMesLindo(mesIni);

  await cargarNegocioDesdeFirebase();
  escucharServiciosFirebase();

  // ✅ ahora escucha SOLO el mes seleccionado
  escucharTurnosPorMes(mesIni);
}

initAdmin().catch((err) => console.error("Error inicializando admin", err));
