// ===================== Firebase (ARRIBA) =====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCnhjO0VpHC7GIWgMFAeUOLgqoMHTIHFj8",
  authDomain: "gymbro01-bfe6d.firebaseapp.com",
  projectId: "gymbro01-bfe6d",
  storageBucket: "gymbro01-bfe6d.firebasestorage.app",
  messagingSenderId: "3785625358",
  appId: "1:3785625358:web:327dac172913a9524b115f",
  measurementId: "G-37V71L5GQV"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// ===================== Helpers de fecha =====================
const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

function startOfWeekMonday(date){
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function sameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function monthNameES(m){
  return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][m];
}

function weekdayShortES(i){
  return ["Lu","Ma","Mi","Ju","Vi","Sa","Do"][i];
}

function shortDateES(d){
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
}

function niceDateES(d){
  const wd = weekdayShortES((d.getDay()+6)%7);
  return `${wd} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
}

function formatStopwatch(ms){
  const total = Math.max(0, ms);
  const mm = Math.floor(total / 60000);
  const ss = Math.floor((total % 60000) / 1000);
  const ds = Math.floor((total % 1000) / 100);
  return `${pad2(mm)}:${pad2(ss)}.${ds}`;
}

function formatTimer(sec){
  const s = Math.max(0, Math.floor(sec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
}

function fmtDurationFromSeconds(totalSec){
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}m ${pad2(ss)}s`;
}

function getTimerObj(iso){
  const t = state.timerByDate?.[iso];
  if(t == null) return null;

  // compat con datos viejos (solo número)
  if(typeof t === "number"){
    return { totalSec: t, pauseSec: 0, activeSec: t };
  }

  const totalSec = Number(t.totalSec ?? t.total ?? 0);
  const pauseSec = Number(t.pauseSec ?? t.pause ?? 0);
  const activeSec = Number(t.activeSec ?? t.active ?? Math.max(0, totalSec - pauseSec));
  return { totalSec, pauseSec, activeSec };
}

// ===================== Storage local + nube =====================
const STORAGE_KEY = "gym_tracker_v1";

function storageKeyForUser(uid){
  return uid ? `${STORAGE_KEY}_${uid}` : STORAGE_KEY;
}

function normalizeState(st){
  return {
    workoutsByDate: st.workoutsByDate || {},
    restDays: st.restDays || {},
    timerByDate: st.timerByDate || {}
  };
}

function loadStateFor(uid){
  try{
    const raw = localStorage.getItem(storageKeyForUser(uid));
    if(!raw) return normalizeState({});
    return normalizeState(JSON.parse(raw));
  }catch{
    return normalizeState({});
  }
}

function saveStateFor(uid, st){
  localStorage.setItem(storageKeyForUser(uid), JSON.stringify(normalizeState(st)));
}

async function loadStateFromCloud(uid){
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if(!snap.exists()) return normalizeState({});
  return normalizeState(snap.data() || {});
}

async function saveStateToCloud(uid, st){
  const ref = doc(db, "users", uid);
  const norm = normalizeState(st);

  // IMPORTANTE: sin merge para que borrados (rest day / workout) se reflejen en la nube
  await setDoc(ref, norm);
}

// ===================== Sugerencias =====================
const EXERCISE_SUGGESTIONS = [
  "Press banca","Press inclinado","Press militar","Press vertical",
  "Dominadas","Remo con barra","Remo con mancuerna","Jalón al pecho",
  "Sentadillas","Prensa","Peso muerto","Zancadas",
  "Curl de bíceps","Tríceps con polea","Elevaciones laterales","Barra Z",
  "Abdominales","Plancha","Apertura con máquina","Remo T","Facepull","Gemelos","Sillón cuádriceps","Sillón isquios","Abductores","Puente","Estocadas","Prensa"
];

// ===================== Defaults por grupo =====================
const DEFAULT_EXERCISES_BY_GROUP = {
  "Pecho": ["Press militar", "Press vertical", "Elevaciones", "Apertura con máquina", "Tríceps con polea"],
  "Espalda": ["Press militar", "Elevaciones", "Remo gironda", "Remo T", "Bíceps con barra Z", "Jalón al pecho", "Facepull"],
  "Piernas": ["Sentadillas", "Press militar", "Estocadas", "Prensa", "Sillón cuádriceps", "Abductores", "Gemelos", "Puente", "Peso muerto"],
  "Abdominales": ["Plancha", "Crunch", "Elevación de piernas"]
};

function defaultExerciseRowsForGroup(group){
  const names = DEFAULT_EXERCISES_BY_GROUP[group] || DEFAULT_EXERCISES_BY_GROUP["Pecho"];
  return names.map(n => ({ name:n, sets:4, reps:12, weight:30 }));
}

// ===================== Guía de ejercicios =====================
const GUIDE_EXERCISES = [{"group":"Espalda","name":"Jalón al pecho (Lat Pulldown)","how":"Sentate en la máquina y ajustá el apoyo de las piernas.\nAgarrá la barra un poco más ancho que los hombros.\nPecho levemente hacia afuera y espalda recta.\nBajá la barra hacia la parte alta del pecho.\nLlevá los codos hacia abajo y atrás (no hacia adelante).\nSubí controlando el movimiento, sin soltar de golpe.\nRespiración:\n👉 Inhalá cuando la barra sube\n👉 Exhalá cuando la bajás","muscles":["Dorsal ancho (principal)","Romboides","Trapecio medio e inferior","Bíceps","Deltoide posterior","Core (estabilización)"],"tip":"No te inclines demasiado hacia atrás.\nNo tires con los brazos: pensá en bajar los codos.\nNo lleves la barra detrás de la nuca.\nMovimiento controlado, sin balanceo."},{"group":"Espalda","name":"REMO EN MÁQUINA (AGARRE CERRADO)","how":"1️⃣ Posición inicial\nSentate con los pies apoyados y rodillas levemente flexionadas.\nAgarrá el mango cerrado (agarre neutro).\nEspalda recta y pecho abierto.\nBrazos extendidos sin perder postura.\n2️⃣ Tira hacia el abdomen\nLleva el mango hacia el ombligo o parte baja del abdomen.\nCodos pegados al cuerpo.\nNo te balancees hacia atrás.\n3️⃣ Contrae la espalda\nJunta los omóplatos fuerte al final del movimiento.\nPausa 1 segundo.\nVuelve lento y controlado.","muscles":["Dorsal ancho","Romboides","Trapecio medio","Deltoide posterior","Bíceps","Core"],"tip":"No redondees la espalda.\nNo tires solo con los brazos.\nNo uses impulso del torso.\nControlá la fase de regreso (es donde más trabajás)."},{"group":"Hombros","name":"PRESS MILITAR EN MÁQUINA","how":"🔹 Cómo hacerlo (explicación simple)\nSentate en la máquina con la espalda apoyada.\nAgarrá las manijas a la altura de los hombros.\nEmpujá hacia arriba hasta estirar los brazos, sin bloquear los codos.\nBajá controlado hasta que las manos queden cerca del hombro.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Deltoide anterior (principal)","Deltoide medio","Tríceps","Trapecio superior","Core (estabilización)"],"tip":"No arquees la espalda.\nNo bajes demasiado si te molesta el hombro.\nMovimiento controlado, no rebotes."},{"group":"Espalda","name":"Remo Gironda","how":"🔹 Cómo hacerlo (explicación simple)\nSentate en la máquina con el pecho apoyado.\nAgarrá las manijas (agarre neutro o pronado según la máquina).\nTirá llevando los codos hacia atrás, buscando juntar los omóplatos.\nPausa 1 segundo apretando la espalda.\nVolvé lento, estirando bien los brazos.\nRespiración:\n👉 Inhalá al volver\n👉 Exhalá al tirar","muscles":["Dorsal ancho","Romboides","Trapecio medio","Deltoide posterior","Bíceps"],"tip":"No uses impulso del cuerpo.\nNo subas los hombros.\nControlá la fase de vuelta."},{"group":"Espalda","name":"Face Pull","how":"🔹 Cómo hacerlo (explicación simple)\nAjustá la polea a la altura de la cara.\nAgarrá la cuerda con agarre neutro.\nTirá hacia tu cara separando las manos.\nCodos altos, a la altura de los hombros.\nPausa 1 segundo apretando la parte alta de la espalda.\nVolvé lento.\nRespiración:\n👉 Inhalá al volver\n👉 Exhalá al tirar","muscles":["Deltoide posterior (principal)","Trapecio medio e inferior","Romboides","Manguito rotador"],"tip":"No arquees la espalda.\nNo tires con los bíceps.\nControlá el movimiento."},{"group":"Brazos","name":"Bíceps con barra en polea","how":"🔹 Cómo hacerlo (explicación simple)\nPoné la polea en posición baja.\nAgarrá la barra con palmas hacia arriba.\nCodos pegados al cuerpo.\nSubí la barra flexionando el codo.\nBajá lento sin estirar de golpe.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Bíceps (principal)","Braquial","Antebrazo"],"tip":"No balancees el cuerpo.\nNo muevas los codos hacia adelante.\nBajá lento."},{"group":"Brazos","name":"Bíceps con barra Z","how":"🔹 Cómo hacerlo (explicación simple)\nAgarrá la barra Z con las manos en los ángulos.\nCodos pegados al cuerpo.\nSubí flexionando el codo hasta contraer el bíceps.\nBajá controlado.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Bíceps","Braquial","Antebrazo"],"tip":"No uses impulso.\nNo arquear la espalda.\nControlá el regreso."},{"group":"Piernas","name":"Sentadillas","how":"🔹 Cómo hacerlo (explicación simple)\nPies al ancho de hombros.\nBajá llevando la cadera hacia atrás.\nRodillas alineadas con los pies.\nBajá hasta donde mantengas espalda recta.\nSubí empujando el piso.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Cuádriceps","Glúteos","Isquios","Core"],"tip":"No juntes rodillas.\nEspalda neutra.\nControlá la bajada."},{"group":"Piernas","name":"Estocadas con mancuernas","how":"🔹 Cómo hacerlo (explicación simple)\nPaso largo hacia adelante.\nBajá hasta que ambas rodillas queden cerca de 90°.\nRodilla delantera no pasa mucho la punta del pie.\nSubí y repetí.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Cuádriceps","Glúteos","Isquios","Core"],"tip":"Torso recto.\nNo pierdas equilibrio.\nPaso suficiente largo."},{"group":"Piernas","name":"Prensa","how":"🔹 Cómo hacerlo (explicación simple)\nApoyá espalda completa.\nPies al ancho de hombros.\nBajá la plataforma controlado.\nSubí sin bloquear rodillas.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Cuádriceps","Glúteos","Isquios"],"tip":"No bloquees rodillas.\nNo bajes demasiado si se despega la espalda."},{"group":"Piernas","name":"Sillón cuádriceps","how":"🔹 Cómo hacerlo (explicación simple)\nAjustá el rodillo sobre el empeine.\nExtendé la pierna hasta contraer.\nBajá lento.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Cuádriceps"],"tip":"No patees rápido.\nPausa arriba 1 segundo."},{"group":"Piernas","name":"Sillón isquios","how":"🔹 Cómo hacerlo (explicación simple)\nAjustá el rodillo sobre los talones.\nFlexioná llevando el talón hacia el glúteo.\nBajá lento.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Isquiotibiales"],"tip":"No levantes la cadera.\nControlá el regreso."},{"group":"Piernas","name":"Abductores","how":"🔹 Cómo hacerlo (explicación simple)\nSentate con espalda apoyada.\nAbrí las piernas contra la resistencia.\nPausa 1 segundo.\nVolvé lento.\nRespiración:\n👉 Inhalá cerrando\n👉 Exhalá abriendo","muscles":["Glúteo medio","Glúteo menor"],"tip":"No rebotes.\nMovimiento corto y controlado."},{"group":"Piernas","name":"Puente de glúteo","how":"🔹 Cómo hacerlo (explicación simple)\nEspalda alta apoyada.\nPies firmes en el piso.\nSubí cadera apretando glúteos.\nPausa 1 segundo.\nBajá lento.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Glúteos","Isquios","Core"],"tip":"No hiperextiendas la espalda.\nSubí con glúteo, no con lumbar."},{"group":"Piernas","name":"GEMELOS","how":"🔹 Cómo hacerlo (explicación simple)\nApoyá la punta de los pies.\nSubí talones contrayendo gemelos.\nBajá lento estirando.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Gemelos","Sóleo"],"tip":"Hacelo lento.\nPausa arriba 1 segundo."},{"group":"Piernas","name":"PESO MUERTO","how":"🔹 Cómo hacerlo (explicación simple)\nPies al ancho de cadera.\nBajá la barra pegada al cuerpo.\nEspalda neutra.\nSubí empujando el piso.\nRespiración:\n👉 Inhalá bajando\n👉 Exhalá subiendo","muscles":["Isquios","Glúteos","Espalda baja","Core"],"tip":"Barra cerca del cuerpo.\nNo redondees espalda."}];

function guidePlaceholderSVG(label){
  const safe = String(label || "Ejercicio").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400">
    <rect width="100%" height="100%" fill="#f3f4f6"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
      font-family="Arial" font-size="42" fill="#6b7280">${safe}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

let guideGroupFilter = "Todos";

function renderGuide(){
  if(!guideList) return;
  const q = (guideSearch?.value || "").trim().toLowerCase();

  let data = GUIDE_EXERCISES.slice();
  if(guideGroupFilter !== "Todos"){
    data = data.filter(x => x.group === guideGroupFilter);
  }
  if(q){
    data = data.filter(x =>
      (x.name || "").toLowerCase().includes(q) ||
      (x.how || "").toLowerCase().includes(q) ||
      (x.tip || "").toLowerCase().includes(q)
    );
  }

  if(data.length === 0){
    guideList.innerHTML = `<div class="small-note">No hay resultados.</div>`;
    return;
  }

  guideList.innerHTML = data.map(ex => {
    const muscles = (ex.muscles || []).map(m => `<li>${m}</li>`).join("");
    const how = (ex.how || "").split("\n").filter(Boolean).map(l=>`<div>${l}</div>`).join("");
    const tip = (ex.tip || "").split("\n").filter(Boolean).map(l=>`<div>${l}</div>`).join("");
    const img = guidePlaceholderSVG(ex.name);

    return `
      <div class="guide-card">
        <div class="guide-meta">
          <span class="badge">${ex.group}</span>
        </div>
        <h3 class="guide-title">${ex.name}</h3>

        <div class="guide-img">
          <img alt="${ex.name}" src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:14px"/>
        </div>

        <div class="guide-section">
          <h4>Cómo hacerlo</h4>
          <p>${how || "-"}</p>
        </div>

        <div class="guide-section">
          <h4>Músculos</h4>
          <ul>${muscles || "<li>-</li>"}</ul>
        </div>

        <div class="guide-section">
          <h4>Tip</h4>
          <p>${tip || "-"}</p>
        </div>
      </div>
    `;
  }).join("");
}

if(guideSearch){
  guideSearch.addEventListener("input", renderGuide);
}
if(guideGroupBtn && guideGroupMenu){
  guideGroupBtn.addEventListener("click", ()=>{ guideGroupMenu.hidden = !guideGroupMenu.hidden; });

  guideGroupMenu.addEventListener("click", (e)=>{
    const btn = e.target.closest("button[data-gg]");
    if(!btn) return;
    guideGroupFilter = btn.dataset.gg;
    if(guideGroupLabel) guideGroupLabel.textContent = guideGroupFilter;
    guideGroupMenu.hidden = true;
    renderGuide();
  });

  document.addEventListener("click", (e)=>{
    if(guideGroupMenu.hidden) return;
    const inside = guideGroupMenu.contains(e.target) || guideGroupBtn.contains(e.target);
    if(!inside) guideGroupMenu.hidden = true;
  });
}

// ===================== UI refs =====================
const viewMain = document.getElementById("viewMain");
const viewLogin = document.getElementById("viewLogin");
const viewClock = document.getElementById("viewClock");
const viewDetail = document.getElementById("viewDetail");

const userBtn = document.getElementById("userBtn");
const userAvatar = document.getElementById("userAvatar");
const backToMain = document.getElementById("backToMain");

const clockBtn = document.getElementById("clockBtn");
const backFromClock = document.getElementById("backFromClock");
const backFromDetail = document.getElementById("backFromDetail");

const helpBtn = document.getElementById("helpBtn");
const helpOverlay = document.getElementById("helpOverlay");
const helpClose = document.getElementById("helpClose");

// guía
const guideBtn = document.getElementById("guideBtn");
const viewGuide = document.getElementById("viewGuide");
const backFromGuide = document.getElementById("backFromGuide");
const guideSearch = document.getElementById("guideSearch");
const guideGroupBtn = document.getElementById("guideGroupBtn");
const guideGroupMenu = document.getElementById("guideGroupMenu");
const guideGroupLabel = document.getElementById("guideGroupLabel");
const guideList = document.getElementById("guideList");

// Arranca SIEMPRE oculta
if(helpOverlay) helpOverlay.hidden = true;

function showOnly(which){
  if(viewMain) viewMain.hidden = which !== "main";
  if(viewLogin) viewLogin.hidden = which !== "login";
  if(viewClock) viewClock.hidden = which !== "clock";
  if(viewDetail) viewDetail.hidden = which !== "detail";
  if(viewGuide) viewGuide.hidden = which !== "guide";
}
function showMain(){ showOnly("main"); }
function showLogin(){ showOnly("login"); }
function showClock(){ showOnly("clock"); }
function showDetail(){ showOnly("detail"); }
function showGuide(){ showOnly("guide"); }

if(userBtn) userBtn.addEventListener("click", showLogin);
if(backToMain) backToMain.addEventListener("click", showMain);

if(clockBtn) clockBtn.addEventListener("click", showClock);
if(backFromClock) backFromClock.addEventListener("click", showMain);
if(backFromDetail) backFromDetail.addEventListener("click", showMain);

// HELP
function openHelp(){ if(helpOverlay) helpOverlay.hidden = false; }
function closeHelp(){ if(helpOverlay) helpOverlay.hidden = true; }

if(helpBtn) helpBtn.addEventListener("click", openHelp);
if(helpClose) helpClose.addEventListener("click", closeHelp);

if(guideBtn) guideBtn.addEventListener("click", ()=>{ renderGuide(); showGuide(); });
if(backFromGuide) backFromGuide.addEventListener("click", showMain);

if(helpOverlay){
  helpOverlay.addEventListener("click", (e)=>{
    if(e.target === helpOverlay) closeHelp();
  });
}
document.addEventListener("keydown", (e)=>{
  if(e.key === "Escape") closeHelp();
});

// main ui
const weekRow = document.getElementById("weekRow");
const monthToggle = document.getElementById("monthToggle");
const monthView = document.getElementById("monthView");
const monthTitle = document.getElementById("monthTitle");
const monthGrid = document.getElementById("monthGrid");
const prevMonth = document.getElementById("prevMonth");
const nextMonth = document.getElementById("nextMonth");
const streakDaysEl = document.getElementById("streakDays");

const lastWorkoutEl = document.getElementById("lastWorkout");
const selectedDatePill = document.getElementById("selectedDatePill");
const selectedTimePill = document.getElementById("selectedTimePill");

const groupDropdownBtn = document.getElementById("groupDropdownBtn");
const groupMenu = document.getElementById("groupMenu");
const groupLabel = document.getElementById("groupLabel");

const exerciseList = document.getElementById("exerciseList");
const addExerciseBtn = document.getElementById("addExercise");
const saveWorkoutBtn = document.getElementById("saveWorkout");

const restModeBtn = document.getElementById("restModeBtn");
const deleteWorkoutBtn = document.getElementById("deleteWorkoutBtn");

// auth
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const btnLogin = document.getElementById("btnLogin");
const btnSignup = document.getElementById("btnSignup");
const btnLogout = document.getElementById("btnLogout");
const btnResetPass = document.getElementById("btnResetPass");
const authStatus = document.getElementById("authStatus");

// detail view
const detailMeta = document.getElementById("detailMeta");
const detailTimes = document.getElementById("detailTimes");
const detailExercises = document.getElementById("detailExercises");

// clock view
const tabStopwatch = document.getElementById("tabStopwatch");
const tabTimer = document.getElementById("tabTimer");
const clockDisplay = document.getElementById("clockDisplay");
const pauseDisplay = document.getElementById("pauseDisplay");
const timerControls = document.getElementById("timerControls");
const timerMin = document.getElementById("timerMin");
const timerSec = document.getElementById("timerSec");
const btnStart = document.getElementById("btnStart");
const btnPause = document.getElementById("btnPause");
const btnStop = document.getElementById("btnStop");

// ===================== App state =====================
let currentUid = null;
let state = normalizeState({});
let selectedDate = new Date(); selectedDate.setHours(0,0,0,0);
let monthCursor = new Date(selectedDate); monthCursor.setDate(1);
let restMode = false;

// ===================== Lógica calendario =====================
function dayStatus(iso){
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  const hasWorkout = Boolean(state.workoutsByDate[iso]);
  const isRest = Boolean(state.restDays[iso]);

  if(hasWorkout) return "green";
  if(isRest) return "orange";
  if(d < today) return "red";
  return "neutral";
}

function renderWeek(){
  weekRow.innerHTML = "";
  const start = startOfWeekMonday(selectedDate);

  for(let i=0;i<7;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);

    const iso = toISODate(d);
    const btn = document.createElement("div");
    btn.className = "day";
    btn.textContent = weekdayShortES(i);

    const status = dayStatus(iso);
    if(status==="green") btn.classList.add("green");
    if(status==="red") btn.classList.add("red");
    if(status==="orange") btn.classList.add("orange");
    if(sameDay(d, selectedDate)) btn.classList.add("active");

    btn.addEventListener("click", ()=>{
      selectedDate = new Date(d); selectedDate.setHours(0,0,0,0);
      monthCursor = new Date(selectedDate); monthCursor.setDate(1);
      renderAll();
    });

    weekRow.appendChild(btn);
  }
}

function renderMonth(){
  const y = monthCursor.getFullYear();
  const m = monthCursor.getMonth();
  monthTitle.textContent = `${monthNameES(m)} ${y}`;

  monthGrid.innerHTML = "";

  const first = new Date(y, m, 1);
  const last = new Date(y, m+1, 0);
  const daysInMonth = last.getDate();

  const jsDay = first.getDay();
  const mondayIndex = (jsDay === 0 ? 7 : jsDay);
  const blanks = mondayIndex - 1;

  for(let i=0;i<blanks;i++){
    const b = document.createElement("div");
    b.className = "mday blank";
    monthGrid.appendChild(b);
  }

  for(let day=1; day<=daysInMonth; day++){
    const d = new Date(y, m, day);
    const iso = toISODate(d);

    const cell = document.createElement("div");
    cell.className = "mday";
    cell.textContent = String(day);

    const status = dayStatus(iso);
    if(status==="green") cell.classList.add("green");
    if(status==="red") cell.classList.add("red");
    if(status==="orange") cell.classList.add("orange");
    if(sameDay(d, selectedDate)) cell.classList.add("active");

    cell.addEventListener("click", async ()=>{
      if(restMode){
        if(state.restDays[iso]) delete state.restDays[iso];
        else state.restDays[iso] = true;

        saveStateFor(currentUid, state);
        if(currentUid) await saveStateToCloud(currentUid, state);

        renderAll();
        return;
      }

      selectedDate = new Date(d); selectedDate.setHours(0,0,0,0);
      renderAll();
    });

    monthGrid.appendChild(cell);
  }
}

function computeStreak(){
  const today = new Date(); today.setHours(0,0,0,0);
  let count = 0;
  let offset = 0;

  while(true){
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const iso = toISODate(d);

    if(state.workoutsByDate[iso]){ count++; offset++; continue; }
    if(state.restDays[iso]){ offset++; continue; }
    break;
  }
  return count;
}

// ===================== Último entrenamiento =====================
function renderLastWorkout(){
  const entries = Object.entries(state.workoutsByDate);

  if(entries.length===0){
    lastWorkoutEl.innerHTML = `<div class="workout-item"><span class="meta">Todavía no hay entrenamientos guardados.</span></div>`;
    return;
  }

  entries.sort((a,b)=> a[0].localeCompare(b[0]));
  const [iso, workout] = entries[entries.length-1];

  const group = workout.group ? workout.group : "Sin grupo";
  const t = getTimerObj(iso);

  const durTxt = t ? `⏱ ${fmtDurationFromSeconds(t.activeSec)} • pausa ${fmtDurationFromSeconds(t.pauseSec)}` : "";
  const d = new Date(iso + "T00:00:00");
  const dateTxt = shortDateES(d);

  const header = `
    <div class="workout-item last-header" data-last-iso="${iso}">
      <span>${group}</span>
      <span class="meta">${dateTxt}${durTxt ? " • " + durTxt : ""}</span>
    </div>
  `;

  const items = (workout.exercises || []).slice(0,5).map(ex => {
    const left = ex.name || "(Sin nombre)";
    const right = `${ex.sets || 0}x${ex.reps || 0}  ${ex.weight || 0}kg`;
    return `<div class="workout-item"><span>${left}</span><span class="meta">${right}</span></div>`;
  }).join("");

  lastWorkoutEl.innerHTML = header + (items || `<div class="workout-item"><span class="meta">No hay ejercicios cargados en el último día.</span></div>`);

  const headerEl = lastWorkoutEl.querySelector("[data-last-iso]");
  if(headerEl){
    headerEl.addEventListener("click", ()=> openWorkoutDetail(iso));
  }
}

function renderSelectedTime(){
  if(!selectedTimePill) return;
  const iso = toISODate(selectedDate);
  const t = getTimerObj(iso);
  if(!t){
    selectedTimePill.textContent = "⏱ --";
    return;
  }
  selectedTimePill.textContent = `⏱ ${fmtDurationFromSeconds(t.activeSec)} (pausa ${fmtDurationFromSeconds(t.pauseSec)})`;
}

function openWorkoutDetail(iso){
  const w = state.workoutsByDate[iso];
  if(!w) return;

  const d = new Date(iso + "T00:00:00");
  const dateTxt = shortDateES(d);
  const group = w.group || "Sin grupo";
  const t = getTimerObj(iso);

  if(detailMeta) detailMeta.textContent = `${group} • ${dateTxt}`;

  if(detailTimes){
    if(t){
      detailTimes.innerHTML = `
        <div class="detail-time-row"><span>Total</span><span>${fmtDurationFromSeconds(t.totalSec)}</span></div>
        <div class="detail-time-row"><span>Pausa</span><span>${fmtDurationFromSeconds(t.pauseSec)}</span></div>
        <div class="detail-time-row"><span>Entrenando</span><span>${fmtDurationFromSeconds(t.activeSec)}</span></div>
      `;
    }else{
      detailTimes.innerHTML = `<div class="small-note">No hay tiempo guardado para este día.</div>`;
    }
  }

  if(detailExercises){
    const exs = (w.exercises || []);
    if(exs.length===0){
      detailExercises.innerHTML = `<div class="small-note">No hay ejercicios cargados.</div>`;
    }else{
      detailExercises.innerHTML = exs.map(ex=>{
        const left = ex.name || "(Sin nombre)";
        const right = `${ex.sets || 0}x${ex.reps || 0}  ${ex.weight || 0}kg`;
        return `<div class="workout-item"><span>${left}</span><span class="meta">${right}</span></div>`;
      }).join("");
    }
  }

  showDetail();
}

// ===================== Form / ejercicios =====================
function repsOptions(){ return Array.from({length:30}, (_,i)=> i+1); }
function setsOptions(){ return Array.from({length:10}, (_,i)=> i+1); }
function weightOptions(){
  const out = [];
  for(let w=0; w<=200; w+=2.5) out.push(Number(w.toFixed(1)).toString().replace(".0",""));
  return out;
}

function renderExerciseRow(ex = {name:"", sets:4, reps:12, weight:30}, idx){
  const row = document.createElement("div");
  row.className = "trow";

  const nameWrap = document.createElement("div");
  nameWrap.className = "ex-name-wrap";

  const input = document.createElement("input");
  input.className = "exercise-input";
  input.placeholder = "Ejercicio";
  input.value = ex.name || "";

  const ddBtn = document.createElement("button");
  ddBtn.type = "button";
  ddBtn.className = "ex-dd-btn";
  ddBtn.textContent = "▾";

  const menu = document.createElement("div");
  menu.className = "ex-dd-menu";
  menu.hidden = true;

  function rebuildMenu(){
    menu.innerHTML = "";
    EXERCISE_SUGGESTIONS.forEach(s=>{
      const it = document.createElement("button");
      it.type = "button";
      it.className = "ex-dd-item";
      it.textContent = s;
      it.addEventListener("click", ()=>{
        input.value = s;
        menu.hidden = true;
        input.focus();
      });
      menu.appendChild(it);
    });
  }

  ddBtn.addEventListener("click", ()=>{
    menu.hidden = !menu.hidden;
    if(!menu.hidden) rebuildMenu();
  });

  document.addEventListener("click", (e)=>{
    if(menu.hidden) return;
    if(nameWrap.contains(e.target)) return;
    menu.hidden = true;
  });

  nameWrap.appendChild(input);
  nameWrap.appendChild(ddBtn);
  nameWrap.appendChild(menu);

  const setsSel = document.createElement("select");
  setsOptions().forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    if(Number(ex.sets) === v) o.selected = true;
    setsSel.appendChild(o);
  });

  const repsSel = document.createElement("select");
  repsOptions().forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    if(Number(ex.reps) === v) o.selected = true;
    repsSel.appendChild(o);
  });

  const weightSel = document.createElement("select");
  weightOptions().forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    if(String(ex.weight) === String(v)) o.selected = true;
    weightSel.appendChild(o);
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "ex-trash";
  delBtn.title = "Eliminar ejercicio";
  delBtn.textContent = "🗑";
  delBtn.addEventListener("click", ()=>{
    row.remove();
    if(exerciseList && exerciseList.querySelectorAll(".trow").length === 0){
      const r = renderExerciseRow({ name:"", sets:4, reps:12, weight:30 }, 0);
      exerciseList.appendChild(r);
    }
  });

  row.appendChild(nameWrap);
  row.appendChild(setsSel);
  row.appendChild(repsSel);
  row.appendChild(weightSel);
  row.appendChild(delBtn);

  row._refs = { input, setsSel, repsSel, weightSel };
  return row;
}

function renderFormForSelectedDate(){
  const iso = toISODate(selectedDate);
  const workout = state.workoutsByDate[iso];

  selectedDatePill.textContent = niceDateES(selectedDate);

  const group = workout?.group || (groupLabel ? groupLabel.textContent : "Pecho") || "Pecho";
  groupLabel.textContent = group;

  exerciseList.innerHTML = "";
  const exercises = (workout?.exercises?.length ? workout.exercises : defaultExerciseRowsForGroup(group));

  exercises.forEach((ex, idx)=>{
    exerciseList.appendChild(renderExerciseRow(ex, idx));
  });

  renderSelectedTime();
}

function readExercisesFromUI(){
  const rows = Array.from(exerciseList.querySelectorAll(".trow"));
  return rows
    .map(r => {
      const { input, setsSel, repsSel, weightSel } = r._refs;
      return {
        name: (input.value || "").trim(),
        sets: Number(setsSel.value),
        reps: Number(repsSel.value),
        weight: Number(weightSel.value),
      };
    })
    .filter(ex => ex.name.length > 0);
}

// ===================== Eventos UI =====================
monthToggle.addEventListener("click", ()=>{
  monthView.hidden = !monthView.hidden;
  monthToggle.textContent = monthView.hidden ? "Ver mes" : "Ocultar mes";
});

prevMonth.addEventListener("click", ()=>{
  monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth()-1, 1);
  renderMonth();
});

nextMonth.addEventListener("click", ()=>{
  monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth()+1, 1);
  renderMonth();
});

groupDropdownBtn.addEventListener("click", ()=>{
  groupMenu.hidden = !groupMenu.hidden;
});

groupMenu.addEventListener("click", (e)=>{
  const btn = e.target.closest("button[data-group]");
  if(!btn) return;
  const newGroup = btn.dataset.group;
  groupLabel.textContent = newGroup;
  groupMenu.hidden = true;

  // Si el día NO está guardado todavía, precargamos ejercicios por grupo
  const iso = toISODate(selectedDate);
  if(!state.workoutsByDate[iso]){
    exerciseList.innerHTML = "";
    defaultExerciseRowsForGroup(newGroup).forEach((ex, idx)=>{
      exerciseList.appendChild(renderExerciseRow(ex, idx));
    });
  }
});

document.addEventListener("click", (e)=>{
  if(!groupMenu.hidden){
    const inside = groupMenu.contains(e.target) || groupDropdownBtn.contains(e.target);
    if(!inside) groupMenu.hidden = true;
  }
});

addExerciseBtn.addEventListener("click", ()=>{
  const idx = exerciseList.querySelectorAll(".trow").length;
  const row = renderExerciseRow({ name:"", sets:4, reps:12, weight:30 }, idx);
  exerciseList.appendChild(row);
  row._refs.input.focus();
});

saveWorkoutBtn.addEventListener("click", async ()=>{
  const iso = toISODate(selectedDate);
  const exercises = readExercisesFromUI();
  const group = groupLabel.textContent;

  if(exercises.length === 0){
    alert("Agregá al menos 1 ejercicio (nombre) antes de guardar.");
    return;
  }

  const t = getTimerObj(iso);
  const durationSec = t ? t.activeSec : undefined;

  state.workoutsByDate[iso] = {
    group,
    exercises,
    ...(durationSec != null ? { durationSec } : {})
  };

  saveStateFor(currentUid, state);
  if(currentUid) await saveStateToCloud(currentUid, state);

  renderAll();
  alert("Guardado ✅");
});

deleteWorkoutBtn.addEventListener("click", async ()=>{
  const iso = toISODate(selectedDate);

  if(!state.workoutsByDate[iso]){
    alert("No hay entrenamiento guardado para este día.");
    return;
  }

  const ok = confirm("¿Eliminar el entrenamiento de este día?");
  if(!ok) return;

  delete state.workoutsByDate[iso];
  delete state.timerByDate[iso];

  saveStateFor(currentUid, state);
  if(currentUid) await saveStateToCloud(currentUid, state);

  renderAll();
  alert("Eliminado ✅");
});

if(restModeBtn){
  restModeBtn.addEventListener("click", ()=>{
    restMode = !restMode;
    restModeBtn.textContent = `Modo descanso: ${restMode ? "ON" : "OFF"}`;
  });
}

selectedDatePill.addEventListener("click", ()=>{
  monthView.hidden = !monthView.hidden;
  monthToggle.textContent = monthView.hidden ? "Ver mes" : "Ocultar mes";
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ===================== Auth =====================
btnSignup.addEventListener("click", async ()=>{
  try{
    const email = emailEl.value.trim();
    const pass = passEl.value.trim();
    if(!email || !pass) return alert("Completá email y contraseña.");
    await createUserWithEmailAndPassword(auth, email, pass);
    alert("Cuenta creada ✅");
  }catch(err){
    console.error(err);
    alert(`Error al crear cuenta: ${err.code || err.message}`);
  }
});

btnLogin.addEventListener("click", async ()=>{
  try{
    const email = emailEl.value.trim();
    const pass = passEl.value.trim();
    if(!email || !pass) return alert("Completá email y contraseña.");
    await signInWithEmailAndPassword(auth, email, pass);
    alert("Login OK ✅");
  }catch(err){
    console.error(err);
    alert(`Error al iniciar sesión: ${err.code || err.message}`);
  }
});

if(btnResetPass){
  btnResetPass.addEventListener("click", async ()=>{
    try{
      const email = (emailEl.value || "").trim();
      if(!email) return alert("Escribí tu email para restablecer la contraseña.");
      await sendPasswordResetEmail(auth, email);
      alert("Te enviamos un correo para restablecer tu contraseña ✅");
    }catch(err){
      console.error(err);
      alert(`Error al restablecer: ${err.code || err.message}`);
    }
  });
}

btnLogout.addEventListener("click", async ()=>{
  await signOut(auth);
});

onAuthStateChanged(auth, async (user)=>{
  if(!user){
    currentUid = null;
    authStatus.textContent = "No logueado";
    btnLogout.hidden = true;

    userAvatar.textContent = "?";
    userAvatar.classList.remove("logged");

    state = loadStateFor(null);
    renderAll();
    return;
  }

  currentUid = user.uid;
  authStatus.textContent = `Logueado: ${user.email}`;
  btnLogout.hidden = false;

  const letter = (user.email || "?").trim().charAt(0).toUpperCase();
  userAvatar.textContent = letter;
  userAvatar.classList.add("logged");

  state = await loadStateFromCloud(currentUid);
  saveStateFor(currentUid, state);

  renderAll();
  showMain();
});

// ===================== RELOJ =====================
let mode = "stopwatch";

// stopwatch (total + pausas)
let swRunning = false;
let swPaused = false;
let swStartAt = 0;
let swTotalMs = 0;
let swPauseMs = 0;
let swPauseStartAt = 0;
let swRAF = null;

// timer
let tmRunning = false;
let tmRemaining = 0;
let tmLastTick = 0;
let tmRAF = null;

function setMode(newMode){
  mode = newMode;
  tabStopwatch.classList.toggle("active", mode === "stopwatch");
  tabTimer.classList.toggle("active", mode === "timer");
  timerControls.hidden = (mode !== "timer");

  if(mode === "stopwatch"){
    clockDisplay.textContent = formatStopwatch(swTotalMs);
    if(pauseDisplay){ pauseDisplay.hidden = false; pauseDisplay.textContent = `Pausa ${formatStopwatch(swPauseMs)}`; }
  }
  else{
    clockDisplay.textContent = formatTimer(Math.ceil(tmRemaining/1000));
    if(pauseDisplay) pauseDisplay.hidden = true;
  }
}

tabStopwatch.addEventListener("click", ()=> setMode("stopwatch"));
tabTimer.addEventListener("click", ()=> setMode("timer"));

document.querySelectorAll("[data-preset]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const sec = Number(btn.dataset.preset);
    tmRemaining = sec * 1000;
    clockDisplay.textContent = formatTimer(sec);
  });
});

function readTimerInputSeconds(){
  const m = Number((timerMin.value || "0").trim());
  const s = Number((timerSec.value || "0").trim());
  const mm = Number.isFinite(m) ? Math.max(0, m) : 0;
  const ss = Number.isFinite(s) ? Math.max(0, s) : 0;
  return (mm * 60) + ss;
}

btnStart.addEventListener("click", ()=>{
  if(mode === "stopwatch"){
    if(swPaused){
      swPaused = false;
      swPauseMs += (performance.now() - swPauseStartAt);
    }
    if(swRunning) return;
    swRunning = true;
    swStartAt = performance.now();
    tickStopwatch();
  }else{
    if(tmRunning) return;
    if(tmRemaining <= 0){
      const sec = readTimerInputSeconds();
      tmRemaining = sec * 1000;
    }
    if(tmRemaining <= 0){
      alert("Poné un tiempo para el temporizador.");
      return;
    }
    tmRunning = true;
    tmLastTick = performance.now();
    tickTimer();
  }
});

btnPause.addEventListener("click", ()=>{
  if(mode === "stopwatch"){
    if(!swRunning) return;
    swRunning = false;
    swPaused = true;

    swTotalMs += (performance.now() - swStartAt);
    swPauseStartAt = performance.now();

    cancelAnimationFrame(swRAF);
    clockDisplay.textContent = formatStopwatch(swTotalMs);
    if(pauseDisplay){
      pauseDisplay.hidden = false;
      pauseDisplay.textContent = `Pausa ${formatStopwatch(swPauseMs)}`;
    }
  }else{
    if(!tmRunning) return;
    tmRunning = false;
    cancelAnimationFrame(tmRAF);
    clockDisplay.textContent = formatTimer(Math.ceil(tmRemaining/1000));
  }
});

btnStop.addEventListener("click", async ()=>{
  if(mode === "stopwatch"){
    if(swRunning){
      swRunning = false;
      swTotalMs += (performance.now() - swStartAt);
      cancelAnimationFrame(swRAF);
    }
    if(swPaused){
      swPauseMs += (performance.now() - swPauseStartAt);
      swPaused = false;
    }

    const iso = toISODate(selectedDate);
    const totalSec = Math.round(swTotalMs / 1000);
    const pauseSec = Math.round(swPauseMs / 1000);
    const activeSec = Math.max(0, totalSec - pauseSec);

    state.timerByDate[iso] = { totalSec, pauseSec, activeSec };
    if(state.workoutsByDate[iso]){
      state.workoutsByDate[iso].durationSec = activeSec;
    }

    saveStateFor(currentUid, state);
    if(currentUid) await saveStateToCloud(currentUid, state);

    renderAll();

    swTotalMs = 0;
    swPauseMs = 0;
    swStartAt = 0;
    swPauseStartAt = 0;
    clockDisplay.textContent = formatStopwatch(0);
    if(pauseDisplay){
      pauseDisplay.hidden = false;
      pauseDisplay.textContent = `Pausa ${formatStopwatch(0)}`;
    }
  }else{
    tmRunning = false;
    cancelAnimationFrame(tmRAF);
    tmRemaining = 0;
    clockDisplay.textContent = formatTimer(0);
  }
});

function tickStopwatch(){
  // si no está ni corriendo ni pausado, no renderizamos
  if(!swRunning && !swPaused) return;

  const now = performance.now();

  // tiempo total visible (si está corriendo, suma el tramo actual; si está pausado, queda fijo)
  const totalMs = swTotalMs + (swRunning ? (now - swStartAt) : 0);

  // tiempo de pausa visible (si está pausado, suma el tramo actual; si no, queda fijo)
  const pauseMs = swPauseMs + (swPaused ? (now - swPauseStartAt) : 0);

  clockDisplay.textContent = formatStopwatch(totalMs);

  if(pauseDisplay){
    pauseDisplay.hidden = false;
    pauseDisplay.textContent = `Pausa ${formatStopwatch(pauseMs)}`;
  }

  swRAF = requestAnimationFrame(tickStopwatch);
}

cancelAnimationFrame(swRAF);
swRAF = null;
swRunning = false;
swPaused = false;

function tickTimer(){
  if(!tmRunning) return;
  const now = performance.now();
  const dt = now - tmLastTick;
  tmLastTick = now;

  tmRemaining = Math.max(0, tmRemaining - dt);
  clockDisplay.textContent = formatTimer(Math.ceil(tmRemaining/1000));

  if(tmRemaining <= 0){
    tmRunning = false;
    cancelAnimationFrame(tmRAF);
    try{ navigator.vibrate?.(200); }catch{}
    return;
  }
  tmRAF = requestAnimationFrame(tickTimer);
}

// ===================== Render todo =====================
function renderAll(){
  renderWeek();
  renderMonth();
  renderLastWorkout();
  streakDaysEl.textContent = String(computeStreak());
  renderFormForSelectedDate();
}

renderAll();
setMode("stopwatch");
showMain();