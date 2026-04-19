// ===================== Firebase (ARRIBA) =====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
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
  await setDoc(ref, norm);
}

// ===================== Ejercicios predefinidos por grupo =====================
const PRESET_EXERCISES = {
  "Pecho": [
    { name:"Press militar",      sets:4, reps:10, weight:30 },
    { name:"Press vertical",     sets:4, reps:10, weight:30 },
    { name:"Elevaciones",        sets:3, reps:12, weight:10 },
    { name:"Apertura con máquina", sets:3, reps:12, weight:20 },
    { name:"Tríceps con polea",  sets:3, reps:12, weight:15 },
  ],
  "Espalda": [
    { name:"Press militar",      sets:4, reps:10, weight:30 },
    { name:"Elevaciones",        sets:3, reps:12, weight:10 },
    { name:"Remo gironda",       sets:4, reps:10, weight:40 },
    { name:"Remo T",             sets:4, reps:10, weight:40 },
    { name:"Biceps con barra Z", sets:3, reps:12, weight:20 },
    { name:"Jalón",              sets:4, reps:12, weight:35 },
    { name:"Facepull",           sets:3, reps:15, weight:15 },
  ],
  "Piernas": [
    { name:"Sentadillas",          sets:4, reps:10, weight:60 },
    { name:"Press militar",        sets:4, reps:10, weight:30 },
    { name:"Estocadas",            sets:3, reps:12, weight:20 },
    { name:"Prensa",               sets:4, reps:12, weight:80 },
    { name:"Sillón cuadriceps",    sets:3, reps:12, weight:40 },
    { name:"Abductores",           sets:3, reps:15, weight:30 },
    { name:"Gemelos",              sets:4, reps:15, weight:0  },
    { name:"Puente",               sets:3, reps:15, weight:0  },
    { name:"Peso muerto",          sets:4, reps:10, weight:60 },
  ],
  "Abdominales": []
};

// ===================== Sugerencias =====================
const EXERCISE_SUGGESTIONS = [
  "Press banca","Press inclinado","Press militar","Press vertical",
  "Dominadas","Remo con barra","Remo con mancuerna","Jalón al pecho",
  "Sentadillas","Prensa","Peso muerto","Zancadas",
  "Curl de bíceps","Tríceps con polea","Elevaciones laterales","Barra Z",
  "Abdominales","Plancha"
];

// ===================== Guía de ejercicios =====================
const GUIDE_DATA = [
  {
    group: "Pecho",
    exercises: [
      {
        name: "Press Militar",
        image: null,
        imageAlt: "Press Militar - imagen próximamente",
        howTo: "De pie o sentado, agarra la barra a la altura de los hombros con agarre prono. Empuja la barra hacia arriba hasta extender completamente los brazos, luego baja de forma controlada hasta la posición inicial.",
        muscles: "Deltoides anterior, tríceps, pecho superior y trapecio.",
        tip: "Mantené el core activo y la espalda recta durante todo el movimiento. No bloquees los codos al extender."
      },
      {
        name: "Press Vertical (Press Inclinado)",
        image: null,
        imageAlt: "Press Inclinado - imagen próximamente",
        howTo: "Recostado en un banco inclinado a 30–45°, agarra la barra o mancuernas a la altura del pecho. Empuja hacia arriba y adelante, luego bajá lentamente controlando el peso.",
        muscles: "Pecho superior (clavicular), deltoides anterior y tríceps.",
        tip: "El ángulo del banco define qué porción del pecho trabajás más. Con 30° priorizás el pecho superior sin sobrecargar el hombro."
      },
      {
        name: "Elevaciones (Aperturas)",
        image: null,
        imageAlt: "Elevaciones / Aperturas - imagen próximamente",
        howTo: "Con mancuernas o en máquina, abrí los brazos describiendo un arco amplio hasta sentir el estiramiento en el pecho. Cerrá de vuelta juntando las manos al frente.",
        muscles: "Pecho (fibras internas y externas), deltoides anterior.",
        tip: "Usá poco peso y enfocate en el estiramiento. No es un ejercicio de fuerza máxima, sino de aislamiento y conexión muscular."
      },
      {
        name: "Apertura con Máquina (Peck Deck)",
        image: null,
        imageAlt: "Apertura con Máquina - imagen próximamente",
        howTo: "Sentado en la máquina con la espalda bien apoyada, llevá los brazos hacia adelante juntando los codos o las manos al frente. Mantenés la tensión al abrir y cerrar.",
        muscles: "Pectoral mayor, enfatizando la zona interna.",
        tip: "Hacé una pausa de un segundo en el punto de máxima contracción para maximizar el trabajo muscular."
      },
      {
        name: "Tríceps con Polea",
        image: null,
        imageAlt: "Tríceps con Polea - imagen próximamente",
        howTo: "De pie frente a la polea alta, agarrá la cuerda o barra. Con los codos pegados al cuerpo, extendé los brazos hacia abajo hasta que queden rectos. Subí lento y controlado.",
        muscles: "Tríceps braquial (tres cabezas), especialmente la cabeza lateral.",
        tip: "Mantené los codos fijos al costado del torso. Si se mueven, el peso es demasiado."
      }
    ]
  },
  {
    group: "Espalda",
    exercises: [
      {
        name: "Press Militar",
        image: null,
        imageAlt: "Press Militar - imagen próximamente",
        howTo: "De pie o sentado, agarra la barra a la altura de los hombros con agarre prono. Empuja la barra hacia arriba hasta extender completamente los brazos, luego baja de forma controlada.",
        muscles: "Deltoides, tríceps, trapecio y pecho superior.",
        tip: "Activá el core para proteger la zona lumbar. No arqueés la espalda baja."
      },
      {
        name: "Elevaciones (Vuelos Posteriores)",
        image: null,
        imageAlt: "Vuelos Posteriores - imagen próximamente",
        howTo: "Inclinado hacia adelante (o en máquina posterior), levantá los brazos hacia los lados describiendo un arco hasta la altura de los hombros. Bajá controlado.",
        muscles: "Deltoides posterior, romboides, trapecio medio.",
        tip: "Usá poco peso. El error más común es usar el impulso del cuerpo en vez del músculo."
      },
      {
        name: "Remo Gironda",
        image: null,
        imageAlt: "Remo Gironda - imagen próximamente",
        howTo: "Tumbado boca abajo en un banco inclinado, agarra las mancuernas con los brazos colgando. Jalá los codos hacia arriba y atrás haciendo una contracción fuerte en la parte alta.",
        muscles: "Trapecio medio, romboides, deltoides posterior y dorsal.",
        tip: "Al llegar arriba, apretá los omóplatos entre sí y mantené 1 segundo antes de bajar."
      },
      {
        name: "Remo T",
        image: null,
        imageAlt: "Remo T - imagen próximamente",
        howTo: "Con una barra fija en un extremo (o máquina), agarrá el asa y tirá hacia el abdomen manteniendo la espalda recta. Extendé completamente los brazos entre cada repetición.",
        muscles: "Dorsal ancho, trapecio, romboides y bíceps.",
        tip: "Priorizá llevar los codos hacia atrás, no hacia arriba. Así evitás compensar con los hombros."
      },
      {
        name: "Bíceps con Barra Z",
        image: null,
        imageAlt: "Bíceps con Barra Z - imagen próximamente",
        howTo: "De pie con la barra Z a la altura de las caderas, agarre supino. Curvá los brazos subiendo la barra hasta la altura de los hombros. Bajá de forma lenta y controlada.",
        muscles: "Bíceps braquial, braquial anterior y braquiorradial.",
        tip: "La barra Z reduce la tensión en las muñecas comparada con la barra recta. Mantené los codos pegados al cuerpo."
      },
      {
        name: "Jalón al Pecho",
        image: null,
        imageAlt: "Jalón al Pecho - imagen próximamente",
        howTo: "Sentado en la máquina de jalón, agarra la barra con agarre amplio. Tira hacia abajo llevando la barra hasta la altura de la clavícula mientras inclinás levemente el torso hacia atrás.",
        muscles: "Dorsal ancho, redondo mayor, bíceps y romboides.",
        tip: "Imaginá que querés llevar los codos al suelo, no sólo bajar las manos. Eso mejora la activación del dorsal."
      },
      {
        name: "Facepull",
        image: null,
        imageAlt: "Facepull - imagen próximamente",
        howTo: "Con la polea a la altura de la cara, agarra la cuerda con ambas manos. Tirá hacia tu cara separando las manos al final del movimiento, con los codos a la altura de los hombros.",
        muscles: "Deltoides posterior, manguito rotador, romboides y trapecio.",
        tip: "Es esencial para la salud del hombro. Hacelo con poco peso y muchas reps, priorizando la técnica."
      }
    ]
  },
  {
    group: "Piernas",
    exercises: [
      {
        name: "Sentadillas",
        image: null,
        imageAlt: "Sentadillas - imagen próximamente",
        howTo: "Con la barra en los trapecios (o sin peso), pies a la anchura de los hombros. Bajá flexionando caderas y rodillas hasta que los muslos queden paralelos al suelo. Subí empujando con los talones.",
        muscles: "Cuádriceps, glúteos, isquiotibiales y core.",
        tip: "Las rodillas deben seguir la dirección de los pies. No dejes que colapsen hacia adentro."
      },
      {
        name: "Press Militar",
        image: null,
        imageAlt: "Press Militar - imagen próximamente",
        howTo: "De pie o sentado, empujá la barra desde los hombros hacia arriba hasta extender los brazos completamente. Bajá controlado.",
        muscles: "Deltoides, tríceps y trapecio.",
        tip: "Apretá el abdomen durante todo el movimiento para proteger la zona lumbar."
      },
      {
        name: "Estocadas (Zancadas)",
        image: null,
        imageAlt: "Estocadas - imagen próximamente",
        howTo: "De pie, dá un paso largo hacia adelante y bajá la rodilla trasera casi hasta el suelo. Volvé a la posición inicial empujando con el pie delantero. Alternás piernas.",
        muscles: "Cuádriceps, glúteos, isquiotibiales y estabilizadores.",
        tip: "Mantené el torso erecto y la rodilla delantera alineada con el pie, sin pasarse la punta."
      },
      {
        name: "Prensa de Piernas",
        image: null,
        imageAlt: "Prensa de Piernas - imagen próximamente",
        howTo: "Sentado en la máquina, apoyá los pies en la plataforma a la anchura de los hombros. Empujá el peso hasta casi extender completamente las piernas (sin bloquear). Bajá controlado.",
        muscles: "Cuádriceps, glúteos e isquiotibiales.",
        tip: "No dejes que las lumbares se despeguen del respaldo al bajar el peso. Ese rango es el peligroso."
      },
      {
        name: "Sillón Cuadriceps (Extensión de Piernas)",
        image: null,
        imageAlt: "Extensión de Piernas - imagen próximamente",
        howTo: "Sentado en la máquina, con el rodillo sobre el empeine. Extendé las piernas hasta que queden rectas, mantené 1 segundo y bajá despacio.",
        muscles: "Cuádriceps (aislamiento total).",
        tip: "Es un ejercicio de aislamiento. Usá un peso que permita controlar bien el movimiento, especialmente la bajada."
      },
      {
        name: "Abductores",
        image: null,
        imageAlt: "Abductores - imagen próximamente",
        howTo: "Sentado en la máquina de abductores, con las almohadillas en la parte externa de los muslos. Abrí las piernas hacia afuera contra la resistencia y volvé lento.",
        muscles: "Glúteo medio, tensor de la fascia lata y abductores.",
        tip: "La apertura de cadera y la postura del torso afectan qué fibra glútea trabajás más."
      },
      {
        name: "Gemelos (Elevaciones de Talón)",
        image: null,
        imageAlt: "Elevaciones de Talón - imagen próximamente",
        howTo: "De pie en el borde de un escalón o plataforma, bajá los talones por debajo del nivel del escalón y luego subí de puntillas lo más arriba posible. Bajá lento.",
        muscles: "Gastrocnemio y sóleo.",
        tip: "La bajada lenta es clave para el crecimiento. Los gemelos responden bien a alto volumen de reps."
      },
      {
        name: "Puente de Glúteos",
        image: null,
        imageAlt: "Puente de Glúteos - imagen próximamente",
        howTo: "Acostado boca arriba con las rodillas dobladas, levantá las caderas hasta que quede una línea recta desde los hombros hasta las rodillas. Apretá los glúteos arriba y bajá controlado.",
        muscles: "Glúteos, isquiotibiales y core.",
        tip: "Para mayor dificultad, ponete una barra o disco sobre las caderas (hip thrust). El rango de movimiento completo es fundamental."
      },
      {
        name: "Peso Muerto",
        image: null,
        imageAlt: "Peso Muerto - imagen próximamente",
        howTo: "Con la barra en el suelo, pies a la anchura de las caderas. Agarra la barra, espalda recta, levantá empujando con las piernas y extendiendo la cadera hasta quedar erguido. Bajá con control.",
        muscles: "Isquiotibiales, glúteos, dorsales, trapecios y core.",
        tip: "La espalda recta es innegociable. Empezá con poco peso para dominar la técnica antes de cargar."
      }
    ]
  }
];

// ===================== UI refs =====================
const viewMain   = document.getElementById("viewMain");
const viewLogin  = document.getElementById("viewLogin");
const viewClock  = document.getElementById("viewClock");
const viewDetail = document.getElementById("viewDetail");
const viewGuide  = document.getElementById("viewGuide");

const userBtn    = document.getElementById("userBtn");
const userAvatar = document.getElementById("userAvatar");
const backToMain = document.getElementById("backToMain");

const clockBtn      = document.getElementById("clockBtn");
const backFromClock = document.getElementById("backFromClock");
const backFromDetail = document.getElementById("backFromDetail");

const guideBtn      = document.getElementById("guideBtn");
const backFromGuide = document.getElementById("backFromGuide");

const helpBtn     = document.getElementById("helpBtn");
const helpOverlay = document.getElementById("helpOverlay");
const helpClose   = document.getElementById("helpClose");

if(helpOverlay) helpOverlay.hidden = true;

function showOnly(which){
  if(viewMain)   viewMain.hidden   = which !== "main";
  if(viewLogin)  viewLogin.hidden  = which !== "login";
  if(viewClock)  viewClock.hidden  = which !== "clock";
  if(viewDetail) viewDetail.hidden = which !== "detail";
  if(viewGuide)  viewGuide.hidden  = which !== "guide";
}
function showMain()   { showOnly("main"); }
function showLogin()  { showOnly("login"); }
function showClock()  { showOnly("clock"); }
function showDetail() { showOnly("detail"); }
function showGuide()  { showOnly("guide"); renderGuide(); }

if(userBtn)    userBtn.addEventListener("click", showLogin);
if(backToMain) backToMain.addEventListener("click", showMain);

if(clockBtn)      clockBtn.addEventListener("click", showClock);
if(backFromClock) backFromClock.addEventListener("click", showMain);
if(backFromDetail) backFromDetail.addEventListener("click", showMain);

if(guideBtn)      guideBtn.addEventListener("click", showGuide);
if(backFromGuide) backFromGuide.addEventListener("click", showMain);

// HELP
function openHelp(){ if(helpOverlay) helpOverlay.hidden = false; }
function closeHelp(){ if(helpOverlay) helpOverlay.hidden = true; }

if(helpBtn)   helpBtn.addEventListener("click", openHelp);
if(helpClose) helpClose.addEventListener("click", closeHelp);

if(helpOverlay){
  helpOverlay.addEventListener("click", (e)=>{
    if(e.target === helpOverlay) closeHelp();
  });
}
document.addEventListener("keydown", (e)=>{
  if(e.key === "Escape") closeHelp();
});

// main ui
const weekRow     = document.getElementById("weekRow");
const monthToggle = document.getElementById("monthToggle");
const monthView   = document.getElementById("monthView");
const monthTitle  = document.getElementById("monthTitle");
const monthGrid   = document.getElementById("monthGrid");
const prevMonth   = document.getElementById("prevMonth");
const nextMonth   = document.getElementById("nextMonth");
const streakDaysEl = document.getElementById("streakDays");

const lastWorkoutEl    = document.getElementById("lastWorkout");
const selectedDatePill = document.getElementById("selectedDatePill");
const selectedTimePill = document.getElementById("selectedTimePill");

const groupDropdownBtn = document.getElementById("groupDropdownBtn");
const groupMenu        = document.getElementById("groupMenu");
const groupLabel       = document.getElementById("groupLabel");

const exerciseList  = document.getElementById("exerciseList");
const addExerciseBtn = document.getElementById("addExercise");
const saveWorkoutBtn = document.getElementById("saveWorkout");

const restModeBtn      = document.getElementById("restModeBtn");
const deleteWorkoutBtn = document.getElementById("deleteWorkoutBtn");

// auth
const emailEl    = document.getElementById("email");
const passEl     = document.getElementById("password");
const btnLogin   = document.getElementById("btnLogin");
const btnSignup  = document.getElementById("btnSignup");
const btnLogout  = document.getElementById("btnLogout");
const btnResetPass = document.getElementById("btnResetPass");
const authStatus = document.getElementById("authStatus");

// detail view
const detailMeta      = document.getElementById("detailMeta");
const detailTimes     = document.getElementById("detailTimes");
const detailExercises = document.getElementById("detailExercises");

// clock view
const tabStopwatch  = document.getElementById("tabStopwatch");
const tabTimer      = document.getElementById("tabTimer");
const clockDisplay  = document.getElementById("clockDisplay");
const pauseDisplay  = document.getElementById("pauseDisplay");
const timerControls = document.getElementById("timerControls");
const timerMin      = document.getElementById("timerMin");
const timerSec      = document.getElementById("timerSec");
const btnStart      = document.getElementById("btnStart");
const btnPause      = document.getElementById("btnPause");
const btnStop       = document.getElementById("btnStop");

// guide
const guideContent = document.getElementById("guideContent");
const guideSearch  = document.getElementById("guideSearch");

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
    if(status==="green")  btn.classList.add("green");
    if(status==="red")    btn.classList.add("red");
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
  const last  = new Date(y, m+1, 0);
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
    const d   = new Date(y, m, day);
    const iso = toISODate(d);

    const cell = document.createElement("div");
    cell.className = "mday";
    cell.textContent = String(day);

    const status = dayStatus(iso);
    if(status==="green")  cell.classList.add("green");
    if(status==="red")    cell.classList.add("red");
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

  const group  = workout.group ? workout.group : "Sin grupo";
  const t      = getTimerObj(iso);
  const durTxt = t ? `⏱ ${fmtDurationFromSeconds(t.activeSec)} • pausa ${fmtDurationFromSeconds(t.pauseSec)}` : "";
  const d      = new Date(iso + "T00:00:00");
  const dateTxt = shortDateES(d);

  const header = `
    <div class="workout-item last-header" data-last-iso="${iso}">
      <span>${group}</span>
      <span class="meta">${dateTxt}${durTxt ? " • " + durTxt : ""}</span>
    </div>
  `;

  const items = (workout.exercises || []).slice(0,5).map(ex => {
    const left  = ex.name || "(Sin nombre)";
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
  const t   = getTimerObj(iso);
  if(!t){
    selectedTimePill.textContent = "⏱ --";
    return;
  }
  selectedTimePill.textContent = `⏱ ${fmtDurationFromSeconds(t.activeSec)} (pausa ${fmtDurationFromSeconds(t.pauseSec)})`;
}

function openWorkoutDetail(iso){
  const w = state.workoutsByDate[iso];
  if(!w) return;

  const d       = new Date(iso + "T00:00:00");
  const dateTxt = shortDateES(d);
  const group   = w.group || "Sin grupo";
  const t       = getTimerObj(iso);

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
        const left  = ex.name || "(Sin nombre)";
        const right = `${ex.sets || 0}x${ex.reps || 0}  ${ex.weight || 0}kg`;
        return `<div class="workout-item"><span>${left}</span><span class="meta">${right}</span></div>`;
      }).join("");
    }
  }

  showDetail();
}

// ===================== Form / ejercicios =====================
function repsOptions()  { return Array.from({length:30}, (_,i)=> i+1); }
function setsOptions()  { return Array.from({length:10}, (_,i)=> i+1); }
function weightOptions(){
  const out = [];
  for(let w=0; w<=200; w+=2.5) out.push(Number(w.toFixed(1)).toString().replace(".0",""));
  return out;
}

// Track open dropdown globally to close previous one
let activeExDdMenu = null;

function renderExerciseRow(ex = {name:"", sets:4, reps:12, weight:30}){
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

  // Menu se adjunta al body para evitar overflow/clip
  const menu = document.createElement("div");
  menu.className = "ex-dd-menu";
  menu.hidden = true;
  document.body.appendChild(menu);

  function rebuildMenu(){
    menu.innerHTML = "";
    EXERCISE_SUGGESTIONS.forEach(s=>{
      const it = document.createElement("button");
      it.type = "button";
      it.className = "ex-dd-item";
      it.textContent = s;
      it.addEventListener("mousedown", (e)=>{
        // mousedown en vez de click para evitar que onblur cierre el menu antes
        e.preventDefault();
        input.value = s;
        menu.hidden = true;
        activeExDdMenu = null;
        input.focus();
      });
      menu.appendChild(it);
    });
  }

  function positionMenu(){
    const rect = ddBtn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = 200;

    if(spaceBelow >= menuHeight || spaceBelow > rect.top){
      // abrir hacia abajo
      menu.style.top  = `${rect.bottom + window.scrollY + 4}px`;
      menu.style.left = `${rect.left + window.scrollX - 160}px`;
    } else {
      // abrir hacia arriba
      menu.style.top  = `${rect.top + window.scrollY - menuHeight - 4}px`;
      menu.style.left = `${rect.left + window.scrollX - 160}px`;
    }
    menu.style.width = "200px";
  }

  ddBtn.addEventListener("click", (e)=>{
    e.stopPropagation();
    // cerrar el que estaba abierto
    if(activeExDdMenu && activeExDdMenu !== menu){
      activeExDdMenu.hidden = true;
    }
    if(menu.hidden){
      rebuildMenu();
      menu.hidden = false;
      positionMenu();
      activeExDdMenu = menu;
    } else {
      menu.hidden = true;
      activeExDdMenu = null;
    }
  });

  // Cerrar al hacer click afuera
  document.addEventListener("click", (e)=>{
    if(!menu.hidden && !nameWrap.contains(e.target)){
      menu.hidden = true;
      if(activeExDdMenu === menu) activeExDdMenu = null;
    }
  });

  // Reposicionar al hacer scroll
  window.addEventListener("scroll", ()=>{
    if(!menu.hidden) positionMenu();
  }, { passive: true });

  nameWrap.appendChild(input);
  nameWrap.appendChild(ddBtn);

  const setsSel = document.createElement("select");
  setsOptions().forEach(v=>{
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    if(Number(ex.sets) === v) o.selected = true;
    setsSel.appendChild(o);
  });

  const repsSel = document.createElement("select");
  repsOptions().forEach(v=>{
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    if(Number(ex.reps) === v) o.selected = true;
    repsSel.appendChild(o);
  });

  const weightSel = document.createElement("select");
  weightOptions().forEach(v=>{
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    if(String(ex.weight) === String(v)) o.selected = true;
    weightSel.appendChild(o);
  });

  // Botón eliminar fila
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "row-del-btn";
  delBtn.title = "Eliminar ejercicio";
  delBtn.textContent = "🗑";
  delBtn.addEventListener("click", ()=>{
    menu.remove(); // limpiar menú del body
    row.remove();
  });

  row.appendChild(nameWrap);
  row.appendChild(setsSel);
  row.appendChild(repsSel);
  row.appendChild(weightSel);
  row.appendChild(delBtn);

  row._refs = { input, setsSel, repsSel, weightSel };

  // Limpiar menu del DOM cuando la fila se elimina (via MutationObserver)
  const mo = new MutationObserver(()=>{
    if(!document.body.contains(row)){
      menu.remove();
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  return row;
}

function renderFormForSelectedDate(){
  const iso     = toISODate(selectedDate);
  const workout = state.workoutsByDate[iso];

  selectedDatePill.textContent = niceDateES(selectedDate);

  const group = workout?.group || "Pecho";
  groupLabel.textContent = group;

  // Limpiar menus flotantes anteriores
  document.querySelectorAll(".ex-dd-menu").forEach(m => m.remove());

  exerciseList.innerHTML = "";

  const exercises = (workout?.exercises?.length ? workout.exercises : (PRESET_EXERCISES[group] || [
    { name:"Press banca",          sets:4, reps:12, weight:30 },
    { name:"Press militar",        sets:4, reps:6,  weight:30 },
    { name:"Elevaciones laterales", sets:4, reps:12, weight:10 },
  ]));

  exercises.forEach((ex)=>{
    exerciseList.appendChild(renderExerciseRow(ex));
  });

  renderSelectedTime();
}

function readExercisesFromUI(){
  const rows = Array.from(exerciseList.querySelectorAll(".trow"));
  return rows
    .map(r => {
      const { input, setsSel, repsSel, weightSel } = r._refs;
      return {
        name:   (input.value || "").trim(),
        sets:   Number(setsSel.value),
        reps:   Number(repsSel.value),
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

  // Cargar ejercicios predefinidos sólo si la lista está vacía o tiene sólo placeholders
  const iso     = toISODate(selectedDate);
  const workout = state.workoutsByDate[iso];

  if(!workout){
    // No hay entrenamiento guardado: cargar predefinidos del nuevo grupo
    document.querySelectorAll(".ex-dd-menu").forEach(m => m.remove());
    exerciseList.innerHTML = "";
    const presets = PRESET_EXERCISES[newGroup] || [];
    presets.forEach(ex => exerciseList.appendChild(renderExerciseRow(ex)));
  }
});

document.addEventListener("click", (e)=>{
  if(!groupMenu.hidden){
    const inside = groupMenu.contains(e.target) || groupDropdownBtn.contains(e.target);
    if(!inside) groupMenu.hidden = true;
  }
});

addExerciseBtn.addEventListener("click", ()=>{
  const row = renderExerciseRow({ name:"", sets:4, reps:12, weight:30 });
  exerciseList.appendChild(row);
  row._refs.input.focus();
  // Scroll para que se vea el nuevo ejercicio
  row.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

saveWorkoutBtn.addEventListener("click", async ()=>{
  const iso       = toISODate(selectedDate);
  const exercises = readExercisesFromUI();
  const group     = groupLabel.textContent;

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
    const pass  = passEl.value.trim();
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
    const pass  = passEl.value.trim();
    if(!email || !pass) return alert("Completá email y contraseña.");
    await signInWithEmailAndPassword(auth, email, pass);
    alert("Login OK ✅");
  }catch(err){
    console.error(err);
    alert(`Error al iniciar sesión: ${err.code || err.message}`);
  }
});

btnLogout.addEventListener("click", async ()=>{
  await signOut(auth);
});

// Restablecer contraseña
if(btnResetPass){
  btnResetPass.addEventListener("click", async ()=>{
    const email = emailEl.value.trim();
    if(!email){
      alert("Escribí tu email en el campo de arriba para restablecer la contraseña.");
      return;
    }
    try{
      await sendPasswordResetEmail(auth, email);
      alert(`Se envió un email de restablecimiento a ${email}. Revisá tu bandeja.`);
    }catch(err){
      console.error(err);
      alert(`Error: ${err.code || err.message}`);
    }
  });
}

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

let swRunning = false;
let swPaused  = false;
let swStartAt = 0;
let swTotalMs = 0;
let swPauseMs = 0;
let swPauseStartAt = 0;
let swRAF = null;

let tmRunning   = false;
let tmRemaining = 0;
let tmLastTick  = 0;
let tmRAF = null;

function setMode(newMode){
  mode = newMode;
  tabStopwatch.classList.toggle("active", mode === "stopwatch");
  tabTimer.classList.toggle("active",     mode === "timer");
  timerControls.hidden = (mode !== "timer");

  if(mode === "stopwatch"){
    clockDisplay.textContent = formatStopwatch(swTotalMs);
    if(pauseDisplay){ pauseDisplay.hidden = false; pauseDisplay.textContent = `Pausa ${formatStopwatch(swPauseMs)}`; }
  } else {
    clockDisplay.textContent = formatTimer(Math.ceil(tmRemaining/1000));
    if(pauseDisplay) pauseDisplay.hidden = true;
  }
}

tabStopwatch.addEventListener("click", ()=> setMode("stopwatch"));
tabTimer.addEventListener("click",     ()=> setMode("timer"));

document.querySelectorAll("[data-preset]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const sec = Number(btn.dataset.preset);
    tmRemaining = sec * 1000;
    clockDisplay.textContent = formatTimer(sec);
  });
});

function readTimerInputSeconds(){
  const m  = Number((timerMin.value || "0").trim());
  const s  = Number((timerSec.value || "0").trim());
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
  } else {
    if(tmRunning) return;
    if(tmRemaining <= 0){
      const sec = readTimerInputSeconds();
      tmRemaining = sec * 1000;
    }
    if(tmRemaining <= 0){
      alert("Poné un tiempo para el temporizador.");
      return;
    }
    tmRunning  = true;
    tmLastTick = performance.now();
    tickTimer();
  }
});

btnPause.addEventListener("click", ()=>{
  if(mode === "stopwatch"){
    if(!swRunning) return;
    swRunning = false;
    swPaused  = true;

    swTotalMs      += (performance.now() - swStartAt);
    swPauseStartAt  = performance.now();

    cancelAnimationFrame(swRAF);
    clockDisplay.textContent = formatStopwatch(swTotalMs);
    if(pauseDisplay){
      pauseDisplay.hidden = false;
      pauseDisplay.textContent = `Pausa ${formatStopwatch(swPauseMs)}`;
    }
  } else {
    if(!tmRunning) return;
    tmRunning = false;
    cancelAnimationFrame(tmRAF);
    clockDisplay.textContent = formatTimer(Math.ceil(tmRemaining/1000));
  }
});

btnStop.addEventListener("click", async ()=>{
  if(mode === "stopwatch"){
    if(swRunning){
      swRunning  = false;
      swTotalMs += (performance.now() - swStartAt);
      cancelAnimationFrame(swRAF);
    }
    if(swPaused){
      swPauseMs += (performance.now() - swPauseStartAt);
      swPaused   = false;
    }

    const iso       = toISODate(selectedDate);
    const totalSec  = Math.round(swTotalMs / 1000);
    const pauseSec  = Math.round(swPauseMs / 1000);
    const activeSec = Math.max(0, totalSec - pauseSec);

    state.timerByDate[iso] = { totalSec, pauseSec, activeSec };
    if(state.workoutsByDate[iso]){
      state.workoutsByDate[iso].durationSec = activeSec;
    }

    saveStateFor(currentUid, state);
    if(currentUid) await saveStateToCloud(currentUid, state);

    renderAll();

    swTotalMs = 0; swPauseMs = 0;
    swStartAt = 0; swPauseStartAt = 0;
    clockDisplay.textContent = formatStopwatch(0);
    if(pauseDisplay){
      pauseDisplay.hidden = false;
      pauseDisplay.textContent = `Pausa ${formatStopwatch(0)}`;
    }
  } else {
    tmRunning = false;
    cancelAnimationFrame(tmRAF);
    tmRemaining = 0;
    clockDisplay.textContent = formatTimer(0);
  }
});

function tickStopwatch(){
  if(!swRunning && !swPaused) return;

  const now     = performance.now();
  const totalMs = swTotalMs + (swRunning ? (now - swStartAt) : 0);
  const pauseMs = swPauseMs + (swPaused  ? (now - swPauseStartAt) : 0);

  clockDisplay.textContent = formatStopwatch(totalMs);
  if(pauseDisplay){
    pauseDisplay.hidden = false;
    pauseDisplay.textContent = `Pausa ${formatStopwatch(pauseMs)}`;
  }
  swRAF = requestAnimationFrame(tickStopwatch);
}

cancelAnimationFrame(swRAF);
swRAF = null; swRunning = false; swPaused = false;

function tickTimer(){
  if(!tmRunning) return;
  const now = performance.now();
  const dt  = now - tmLastTick;
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

// ===================== Guía de ejercicios =====================
let guideOpenGroups = {};

function renderGuide(filter=""){
  if(!guideContent) return;

  const q = filter.trim().toLowerCase();
  guideContent.innerHTML = "";

  let anyResult = false;

  GUIDE_DATA.forEach(groupData => {
    const filteredExs = q
      ? groupData.exercises.filter(e => e.name.toLowerCase().includes(q))
      : groupData.exercises;

    if(filteredExs.length === 0) return;
    anyResult = true;

    // Toggle de grupo
    const toggle = document.createElement("button");
    toggle.className = "guide-group-toggle" + (guideOpenGroups[groupData.group] !== false ? " open" : "");
    toggle.innerHTML = `
      <span class="guide-group-name">${groupData.group}</span>
      <span class="guide-group-chev">▼</span>
    `;

    const exList = document.createElement("div");
    exList.className = "guide-group-exercises";
    exList.hidden = guideOpenGroups[groupData.group] === false;

    toggle.addEventListener("click", ()=>{
      const isOpen = !exList.hidden;
      exList.hidden = isOpen;
      toggle.classList.toggle("open", !isOpen);
      guideOpenGroups[groupData.group] = !isOpen;
    });

    filteredExs.forEach(ex => {
      const card = document.createElement("div");
      card.className = "guide-ex-card";

      const imgDiv = document.createElement("div");
      imgDiv.className = "guide-ex-img";

      if(ex.image){
        const img = document.createElement("img");
        img.src = ex.image;
        img.alt = ex.name;
        imgDiv.appendChild(img);
      } else {
        imgDiv.innerHTML = `
          <div class="guide-ex-img-placeholder">
            <span>🏋️</span>
            <span>Imagen próximamente</span>
          </div>
        `;
      }

      const body = document.createElement("div");
      body.className = "guide-ex-body";
      body.innerHTML = `
        <h3 class="guide-ex-name">${ex.name}</h3>
        <div class="guide-ex-section-label">¿Cómo hacerlo?</div>
        <p class="guide-ex-text">${ex.howTo}</p>
        <div class="guide-ex-section-label">¿Qué músculos trabaja?</div>
        <p class="guide-ex-text">${ex.muscles}</p>
        <div class="guide-ex-tip">💡 ${ex.tip}</div>
      `;

      card.appendChild(imgDiv);
      card.appendChild(body);
      exList.appendChild(card);
    });

    guideContent.appendChild(toggle);
    guideContent.appendChild(exList);
  });

  if(!anyResult){
    guideContent.innerHTML = `<div class="guide-no-results">No se encontraron ejercicios para "${filter}"</div>`;
  }
}

if(guideSearch){
  guideSearch.addEventListener("input", ()=>{
    renderGuide(guideSearch.value);
  });
}

// Inicializar grupos abiertos por defecto
GUIDE_DATA.forEach(g => { guideOpenGroups[g.group] = true; });

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
