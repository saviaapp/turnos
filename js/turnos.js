// js/turnos.js
console.log("Turnero Savia: módulo cargado ✅");

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

if (firebaseOK) {
  negocioRef = doc(db, "negocios", negocioId);
  serviciosCol = collection(negocioRef, "servicios");
  turnosCol = collection(negocioRef, "turnos");
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
// ESTA PUEDE NO EXISTIR EN EL HTML, LA PROTEGEMOS
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
  horariosOcupados: new Set(),
};

let ultimoTurnoDoc = null;

// =======================
//   HELPERS
// =======================
function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatearFecha(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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

function obtenerServicioSeleccionado() {
  const id = selectServicio.value;
  if (!id) return null;
  return state.servicios.find((s) => s.id === id) || null;
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
      instagram: "https://www.instagram.com/",
      facebook: "",
      direccion: "San Martín 123",
      ciudad: "Maipú · Mendoza",
      horariosResumen:
        "Lunes a viernes 09:00 a 20:00 hs · Sábados 09:00 a 13:00 hs",
      apertura: "09:00",
      cierre: "20:00",
      duracionMin: 30,
      aliasPago: "",
    };
    await setDoc(negocioRef, data);
    state.negocio = data;
  } else {
    state.negocio = snap.data();
  }

  state.config = {
    apertura: state.negocio.apertura || "09:00",
    cierre: state.negocio.cierre || "20:00",
    duracionMin: state.negocio.duracionMin || 30,
  };
  state.horariosBase = generarSlots(
    state.config.apertura,
    state.config.cierre,
    state.config.duracionMin
  );

  // UI header
  document.documentElement.style.setProperty(
    "--accent",
    state.negocio.colorPrincipal || "#4BAF8C"
  );

  nombreNegocioEl.textContent = state.negocio.nombre || "Nombre del negocio";
  sloganEl.textContent = state.negocio.slogan || "Slogan o frase corta.";
  rubroEl.textContent =
    state.negocio.rubro || "Estética · Peluquería · Bienestar";

  if (state.negocio.logoUrl) {
    logoNegocio.src = state.negocio.logoUrl;
  }

  direccionEl.textContent =
    (state.negocio.direccion || "Dirección a confirmar") +
    (state.negocio.ciudad ? " · " + state.negocio.ciudad : "");

  horariosResumenEl.textContent =
    state.negocio.horariosResumen ||
    "Lunes a viernes 09:00 a 20:00 hs · Sábados 09:00 a 13:00 hs";

  linkMapasEl.href = state.negocio.mapsUrl || "#";

  const telRaw = state.negocio.whatsapp || "";
  const telClean = telRaw.replace(/[^\d]/g, "");
  let waHref = "#";
  if (telClean) {
    waHref =
      "https://wa.me/" +
      telClean +
      "?text=" +
      encodeURIComponent(
        `Hola, quiero reservar un turno en ${state.negocio.nombre || "tu consulta"} 🙌`
      );
  }
  waFab.href = waHref;
  if (waBottom) waBottom.href = waHref;

  if (state.negocio.instagram) {
    igBottom.href = state.negocio.instagram;
    igBottom.style.display = "inline-flex";
  } else {
    igBottom.style.display = "none";
  }

  if (state.negocio.facebook) {
    fbBottom.href = state.negocio.facebook;
    fbBottom.style.display = "inline-flex";
  } else {
    fbBottom.style.display = "none";
  }

  // 👇 ESTE ERA EL ERROR: protegemos porque el elemento no existe en el HTML
  if (linkSaviaEl) {
    linkSaviaEl.href =
      state.negocio.urlSavia || "https://namilo1315.github.io/savia/";
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
    const data = docSnap.data();
    servicios.push({
      id: docSnap.id,
      categoria: data.categoria || "General",
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
    const data = docSnap.data();
    if (data.estado !== "cancelado") {
      state.horariosOcupados.add(data.hora);
    }
  });

  renderHorarios();
}

// =======================
//   UI: SERVICIOS
// =======================
function llenarServiciosPorCategoria(cat) {
  selectServicio.innerHTML = "";

  let lista = state.servicios;
  if (cat) {
    lista = lista.filter((s) => (s.categoria || "General") === cat);
  }

  if (!lista.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Servicios a confirmar";
    selectServicio.appendChild(opt);
    selectServicio.disabled = true;
    seniaInfo.textContent =
      "El negocio todavía no cargó sus servicios. Consultá por WhatsApp.";
    return;
  }

  selectServicio.disabled = false;
  lista.forEach((s, idx) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.nombre;
    if (idx === 0) opt.selected = true;
    selectServicio.appendChild(opt);
  });

  actualizarSenia();
}

function configurarCategoriasYServicios() {
  const setCat = new Set();
  state.servicios.forEach((s) => setCat.add(s.categoria || "General"));
  const categorias = Array.from(setCat);

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

    selectCategoria.addEventListener("change", () => {
      llenarServiciosPorCategoria(selectCategoria.value || null);
    });
  } else {
    categoriaGroup.style.display = "none";
    llenarServiciosPorCategoria(null);
  }

  // Modalidades
  const setMod = new Set();
  state.servicios.forEach((s) => s.modalidad && setMod.add(s.modalidad));
  const modalidades = Array.from(setMod);

  if (modalidades.length) {
    modalidadGroup.style.display = "block";
    selectModalidad.innerHTML = "";
    modalidades.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      selectModalidad.appendChild(opt);
    });
  } else {
    modalidadGroup.style.display = "none";
  }

  selectServicio.addEventListener("change", actualizarSenia);
}

function actualizarSenia() {
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
      servicio.textoSenia ||
      "Este servicio no requiere seña inmediata. Confirmamos el turno por WhatsApp.";
  }
}

// =======================
//   UI: HORARIOS
// =======================
function renderHorarios() {
  horariosScroll.innerHTML = "";
  selectHorario.innerHTML = "";

  if (!state.horariosBase.length) {
    horariosScroll.innerHTML =
      "<p style='font-size:.78rem;color:#6b7280;'>Configura tu horario desde el panel profesional.</p>";
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
      document
        .querySelectorAll(".slot-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectHorario.value = h;
    });

    horariosScroll.appendChild(btn);
  });
}

// =======================
//   GUARDAR TURNO
// =======================
async function guardarTurnoEnFirestore(turno) {
  if (!firebaseOK) {
    console.warn(
      "Firebase no OK: turno sólo simulado, no se guarda en nube."
    );
    return "demo-doc-id";
  }

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
  });
  return ref.id;
}

// =======================
//   EVENTOS FORM
// =======================
function configurarForm() {
  const hoy = todayIso();
  inputDia.min = hoy;
  if (!inputDia.value) inputDia.value = hoy;

  inputDia.addEventListener("change", () => {
    cargarHorariosOcupados(inputDia.value);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (selectServicio.disabled) {
      alert(
        "Por favor, consultá directamente con el negocio: todavía no cargó sus servicios."
      );
      return;
    }

    if (!selectHorario.value) {
      alert("Por favor, elegí un horario disponible.");
      return;
    }

    const servicio = obtenerServicioSeleccionado();
    const fecha = inputDia.value;

    if (!fecha) {
      alert("Elegí un día para tu turno.");
      return;
    }

    const turno = {
      servicioId: servicio ? servicio.id : "",
      servicioNombre: servicio ? servicio.nombre : "",
      categoria: servicio ? servicio.categoria : null,
      fecha,
      hora: selectHorario.value,
      nombreCliente: inputNombreCliente.value.trim(),
      telefono: inputTelefono.value.trim(),
      mail: inputMail.value.trim(),
      modalidad:
        selectModalidad && selectModalidad.value
          ? selectModalidad.value
          : null,
      requiereSenia: servicio ? !!servicio.requiereSenia : false,
    };

    if (!turno.nombreCliente || !turno.telefono) {
      alert("Completá tu nombre y WhatsApp.");
      return;
    }

    try {
      const docId = await guardarTurnoEnFirestore(turno);
      ultimoTurnoDoc = {
        id: docId,
        fecha: turno.fecha,
        hora: turno.hora,
      };

      state.horariosOcupados.add(turno.hora);
      renderHorarios();

      const fechaLegible = formatearFecha(turno.fecha);
      const horarioLegible = turno.hora + " hs";

      confirmData.innerHTML = `
        <ul class="confirm-list">
          <li><strong>Nombre:</strong> ${turno.nombreCliente}</li>
          <li><strong>Servicio:</strong> ${turno.servicioNombre}</li>
          ${
            turno.categoria
              ? `<li><strong>Categoría:</strong> ${turno.categoria}</li>`
              : ""
          }
          <li><strong>Día y horario:</strong> ${fechaLegible} · ${horarioLegible}</li>
          ${
            turno.modalidad
              ? `<li><strong>Modalidad:</strong> ${turno.modalidad}</li>`
              : ""
          }
        </ul>
      `;
      confirmMsg.classList.add("show");

      form.reset();
      inputDia.min = hoy;
      inputDia.value = fecha;
    } catch (err) {
      console.error("Error al guardar turno:", err);
      alert(
        "No pudimos guardar tu turno. Volvé a intentar en unos minutos."
      );
    }
  });

  // Cancelar turno (lo marca cancelado y libera horario)
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
      if (ultimoTurnoDoc.hora) {
        state.horariosOcupados.delete(ultimoTurnoDoc.hora);
      }
      await cargarHorariosOcupados(inputDia.value || todayIso());
      ultimoTurnoDoc = null;
    }
    confirmMsg.classList.remove("show");
  });

  // Guardar y salir: deja el turno pendiente y solo cierra
  saveExitBtn.addEventListener("click", () => {
    confirmMsg.classList.remove("show");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// =======================
//   INIT
// =======================
async function init() {
  console.log("Iniciando turnero Savia…");

  // horarios base por defecto, en caso de que Firebase falle
  state.horariosBase = generarSlots(
    state.config.apertura,
    state.config.cierre,
    state.config.duracionMin
  );
  renderHorarios();
  configurarForm();

  try {
    await cargarNegocioYConfig();
    await cargarServicios();
    configurarCategoriasYServicios();
    await cargarHorariosOcupados(inputDia.value || todayIso());
    console.log("Turnero listo ✅");
  } catch (err) {
    console.error("Error iniciando turnero:", err);
  }
}

document.addEventListener("DOMContentLoaded", init);
