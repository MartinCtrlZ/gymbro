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
    timerByDate: st.timerByDate || {},
    settings: {
      weekendRest: st.settings?.weekendRest ?? false,
      restWeekdays: Array.isArray(st.settings?.restWeekdays) ? st.settings.restWeekdays : [],
      restSettingsSavedAt: st.settings?.restSettingsSavedAt || null,
      customExercises: st.settings?.customExercises || {},
      reminders: st.settings?.reminders ?? false,
      trainingTime: st.settings?.trainingTime || "08:00"
    }
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
        image: "./img/ejercicios/pressmilitarv2.png",
        howTo: "De pie o sentado, agarra la barra a la altura de los hombros con agarre prono. Empuja la barra hacia arriba hasta extender completamente los brazos, luego baja de forma controlada hasta la posición inicial.",
        muscles: "Deltoides anterior, tríceps, pecho superior y trapecio.",
        tip: "Mantené el core activo y la espalda recta durante todo el movimiento. No bloquees los codos al extender."
      },
      {
        name: "Press Vertical (Press Inclinado)",
        image: "./img/ejercicios/pressvertcal.webp",
        howTo: "Recostado en un banco inclinado a 30–45°, agarra la barra o mancuernas a la altura del pecho. Empuja hacia arriba y adelante, luego bajá lentamente controlando el peso.",
        muscles: "Pecho superior (clavicular), deltoides anterior y tríceps.",
        tip: "El ángulo del banco define qué porción del pecho trabajás más. Con 30° priorizás el pecho superior sin sobrecargar el hombro."
      },
      {
        name: "Elevaciones (Aperturas)",
        image: "./img/ejercicios/elevacioneslaterales.png",
        howTo: "Con mancuernas o en máquina, abrí los brazos describiendo un arco amplio hasta sentir el estiramiento en el pecho. Cerrá de vuelta juntando las manos al frente.",
        muscles: "Pecho (fibras internas y externas), deltoides anterior.",
        tip: "Usá poco peso y enfocate en el estiramiento. No es un ejercicio de fuerza máxima, sino de aislamiento y conexión muscular."
      },
      {
        name: "Apertura con Máquina (Peck Deck)",
        image: "./img/ejercicios/aperturamaquina.png",
        howTo: "Sentado en la máquina con la espalda bien apoyada, llevá los brazos hacia adelante juntando los codos o las manos al frente. Mantenés la tensión al abrir y cerrar.",
        muscles: "Pectoral mayor, enfatizando la zona interna.",
        tip: "Hacé una pausa de un segundo en el punto de máxima contracción para maximizar el trabajo muscular."
      },
      {
        name: "Tríceps con Polea",
        image: "./img/ejercicios/tricepsconpolea.png",
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
        image: "./img/ejercicios/pressmilitarv2.png",
        howTo: "De pie o sentado, agarra la barra a la altura de los hombros con agarre prono. Empuja la barra hacia arriba hasta extender completamente los brazos, luego baja de forma controlada.",
        muscles: "Deltoides, tríceps, trapecio y pecho superior.",
        tip: "Activá el core para proteger la zona lumbar. No arqueés la espalda baja."
      },
      {
        name: "Elevaciones (Vuelos Posteriores)",
        image: "./img/ejercicios/elevacioneslaterales.png",
        howTo: "Inclinado hacia adelante (o en máquina posterior), levantá los brazos hacia los lados describiendo un arco hasta la altura de los hombros. Bajá controlado.",
        muscles: "Deltoides posterior, romboides, trapecio medio.",
        tip: "Usá poco peso. El error más común es usar el impulso del cuerpo en vez del músculo."
      },
      {
        name: "Remo Gironda",
        image: "./img/ejercicios/remogironda.png",
        howTo: "Tumbado boca abajo en un banco inclinado, agarra las mancuernas con los brazos colgando. Jalá los codos hacia arriba y atrás haciendo una contracción fuerte en la parte alta.",
        muscles: "Trapecio medio, romboides, deltoides posterior y dorsal.",
        tip: "Al llegar arriba, apretá los omóplatos entre sí y mantené 1 segundo antes de bajar."
      },
      {
        name: "Remo T",
        image: "./img/ejercicios/remot.png",
        howTo: "Con una barra fija en un extremo (o máquina), agarrá el asa y tirá hacia el abdomen manteniendo la espalda recta. Extendé completamente los brazos entre cada repetición.",
        muscles: "Dorsal ancho, trapecio, romboides y bíceps.",
        tip: "Priorizá llevar los codos hacia atrás, no hacia arriba. Así evitás compensar con los hombros."
      },
      {
        name: "Bíceps con Barra Z",
        image: "./img/ejercicios/barraz.png",
        howTo: "De pie con la barra Z a la altura de las caderas, agarre supino. Curvá los brazos subiendo la barra hasta la altura de los hombros. Bajá de forma lenta y controlada.",
        muscles: "Bíceps braquial, braquial anterior y braquiorradial.",
        tip: "La barra Z reduce la tensión en las muñecas comparada con la barra recta. Mantené los codos pegados al cuerpo."
      },
      {
        name: "Jalón al Pecho",
        image: "./img/ejercicios/jalonalpecho.png",
        howTo: "Sentado en la máquina de jalón, agarra la barra con agarre amplio. Tira hacia abajo llevando la barra hasta la altura de la clavícula mientras inclinás levemente el torso hacia atrás.",
        muscles: "Dorsal ancho, redondo mayor, bíceps y romboides.",
        tip: "Imaginá que querés llevar los codos al suelo, no sólo bajar las manos. Eso mejora la activación del dorsal."
      },
      {
        name: "Facepull",
        image: "./img/ejercicios/facepull.png",
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
        image: "./img/ejercicios/sentadillabarra.png",
        howTo: "Con la barra en los trapecios (o sin peso), pies a la anchura de los hombros. Bajá flexionando caderas y rodillas hasta que los muslos queden paralelos al suelo. Subí empujando con los talones.",
        muscles: "Cuádriceps, glúteos, isquiotibiales y core.",
        tip: "Las rodillas deben seguir la dirección de los pies. No dejes que colapsen hacia adentro."
      },
      {
        name: "Press Militar",
        image: "./img/ejercicios/pressmilitarv2.png",
        howTo: "De pie o sentado, empujá la barra desde los hombros hacia arriba hasta extender los brazos completamente. Bajá controlado.",
        muscles: "Deltoides, tríceps y trapecio.",
        tip: "Apretá el abdomen durante todo el movimiento para proteger la zona lumbar."
      },
      {
        name: "Estocadas (Zancadas)",
        image: "./img/ejercicios/estocadas.png",
        howTo: "De pie, dá un paso largo hacia adelante y bajá la rodilla trasera casi hasta el suelo. Volvé a la posición inicial empujando con el pie delantero. Alternás piernas.",
        muscles: "Cuádriceps, glúteos, isquiotibiales y estabilizadores.",
        tip: "Mantené el torso erecto y la rodilla delantera alineada con el pie, sin pasarse la punta."
      },
      {
        name: "Prensa de Piernas",
        image: "./img/ejercicios/prensapiernas.png",
        howTo: "Sentado en la máquina, apoyá los pies en la plataforma a la anchura de los hombros. Empujá el peso hasta casi extender completamente las piernas (sin bloquear). Bajá controlado.",
        muscles: "Cuádriceps, glúteos e isquiotibiales.",
        tip: "No dejes que las lumbares se despeguen del respaldo al bajar el peso. Ese rango es el peligroso."
      },
      {
        name: "Sillón Cuadriceps (Extensión de Piernas)",
        image: "./img/ejercicios/silloncuadriceps.png",
        howTo: "Sentado en la máquina, con el rodillo sobre el empeine. Extendé las piernas hasta que queden rectas, mantené 1 segundo y bajá despacio.",
        muscles: "Cuádriceps (aislamiento total).",
        tip: "Es un ejercicio de aislamiento. Usá un peso que permita controlar bien el movimiento, especialmente la bajada."
      },
      {
        name: "Sillón Isquios",
        image: "./img/ejercicios/sillonisquios.png",
        howTo: "Sentado en la máquina, con el rodillo apoyado detrás de los tobillos. Flexioná las rodillas llevando los talones hacia abajo y atrás, mantené 1 segundo y volvé despacio.",
muscles: "Isquiotibiales (aislamiento).",
tip: "Mantené la espalda apoyada y la cadera estable. Usá un peso que permita controlar todo el recorrido, especialmente la vuelta."
      },
      {
        name: "Abductores",
        image: "./img/ejercicios/abductores.png",
        howTo: "Sentado en la máquina de abductores, con las almohadillas en la parte externa de los muslos. Abrí las piernas hacia afuera contra la resistencia y volvé lento.",
        muscles: "Glúteo medio, tensor de la fascia lata y abductores.",
        tip: "La apertura de cadera y la postura del torso afectan qué fibra glútea trabajás más."
      },
      {
        name: "Gemelos (Elevaciones de Talón)",
        image: "./img/ejercicios/gemelos.png",
        howTo: "De pie en el borde de un escalón o plataforma, bajá los talones por debajo del nivel del escalón y luego subí de puntillas lo más arriba posible. Bajá lento.",
        muscles: "Gastrocnemio y sóleo.",
        tip: "La bajada lenta es clave para el crecimiento. Los gemelos responden bien a alto volumen de reps."
      },
      {
        name: "Puente de Glúteos",
        image: "./img/ejercicios/puenteenbanco.png",
        howTo: "Acostado boca arriba con las rodillas dobladas, levantá las caderas hasta que quede una línea recta desde los hombros hasta las rodillas. Apretá los glúteos arriba y bajá controlado.",
        muscles: "Glúteos, isquiotibiales y core.",
        tip: "Para mayor dificultad, ponete una barra o disco sobre las caderas (hip thrust). El rango de movimiento completo es fundamental."
      },
      {
        name: "Peso Muerto",
        image: "./img/ejercicios/pesomuerto.png",
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
const viewStats  = document.getElementById("viewStats");

const userBtn    = document.getElementById("userBtn");
const userAvatar = document.getElementById("userAvatar");
const backToMain = document.getElementById("backToMain");
const logoHomeBtn = document.getElementById("logoHomeBtn");

const clockBtn      = document.getElementById("clockBtn");
const backFromClock = document.getElementById("backFromClock");
const backFromDetail = document.getElementById("backFromDetail");

const guideBtn      = document.getElementById("guideBtn");
const backFromGuide = document.getElementById("backFromGuide");
const statsBtn      = document.getElementById("statsBtn");
const backFromStats = document.getElementById("backFromStats");

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
  if(viewStats)  viewStats.hidden  = which !== "stats";
}
function showMain()   { showOnly("main"); }
function showLogin()  { showOnly("login"); }
function showClock()  { showOnly("clock"); }
function showDetail() { showOnly("detail"); }
function showGuide()  { showOnly("guide"); renderGuide(); }
function showStats()  { showOnly("stats"); renderStats(); }

if(userBtn)    userBtn.addEventListener("click", showLogin);
if(backToMain) backToMain.addEventListener("click", showMain);
if(logoHomeBtn) logoHomeBtn.addEventListener("click", showMain);

if(clockBtn)      clockBtn.addEventListener("click", showClock);
if(backFromClock) backFromClock.addEventListener("click", showMain);
if(backFromDetail) backFromDetail.addEventListener("click", showMain);

if(guideBtn)      guideBtn.addEventListener("click", showGuide);
if(backFromGuide) backFromGuide.addEventListener("click", showMain);
if(statsBtn)      statsBtn.addEventListener("click", showStats);
if(backFromStats) backFromStats.addEventListener("click", showMain);

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

// stats
const statsMaxStreak       = document.getElementById("statsMaxStreak");
const statsMaxStreakPeriod = document.getElementById("statsMaxStreakPeriod");
const statsRangeLabel      = document.getElementById("statsRangeLabel");
const statsPeriodTabs      = document.getElementById("statsPeriodTabs");
const statsGroupBars       = document.getElementById("statsGroupBars");
const statsMuscleMap       = document.getElementById("statsMuscleMap");
const statsExerciseSelect  = document.getElementById("statsExerciseSelect");
const statsPR              = document.getElementById("statsPR");
const statsProgressChart   = document.getElementById("statsProgressChart");
const statsProgressDetail  = document.getElementById("statsProgressDetail");

// settings
const tabSettingsRest      = document.getElementById("tabSettingsRest");
const tabSettingsExercises = document.getElementById("tabSettingsExercises");
const tabSettingsNotif     = document.getElementById("tabSettingsNotif");
const settingsPanelRest      = document.getElementById("settingsPanelRest");
const settingsPanelExercises = document.getElementById("settingsPanelExercises");
const settingsPanelNotif     = document.getElementById("settingsPanelNotif");

const weekendRestToggle = document.getElementById("weekendRestToggle");
const weekdayPicker     = document.getElementById("weekdayPicker");
const saveRestSettings  = document.getElementById("saveRestSettings");

const exerciseGroupsConfig = document.getElementById("exerciseGroupsConfig");
const saveExerciseSettings = document.getElementById("saveExerciseSettings");

const remindersToggle   = document.getElementById("remindersToggle");
const trainingTimeInput = document.getElementById("trainingTimeInput");
const saveNotifSettings = document.getElementById("saveNotifSettings");
const notifPermHint     = document.getElementById("notifPermHint");

// ===================== App state =====================
let currentUid = null;
let state = normalizeState({});
let selectedDate = new Date(); selectedDate.setHours(0,0,0,0);
let monthCursor = new Date(selectedDate); monthCursor.setDate(1);
let restMode = false;

// ===================== Lógica calendario =====================
function isConfiguredRestDay(iso){
  const cutoff = state.settings?.restSettingsSavedAt;
  if(!cutoff) return false; // sin configuración guardada, no aplica nada (no tocar histórico)
  if(iso < cutoff) return false; // nunca hacia atrás de la fecha en que se guardó

  const d = new Date(iso + "T00:00:00");
  const jsDay = d.getDay(); // 0=Dom..6=Sab
  const mondayIndexed = (jsDay === 0 ? 6 : jsDay - 1); // 0=Lu..6=Do, igual al picker

  if(state.settings?.weekendRest && (mondayIndexed === 5 || mondayIndexed === 6)) return true;
  if(Array.isArray(state.settings?.restWeekdays) && state.settings.restWeekdays.includes(mondayIndexed)) return true;

  return false;
}

function dayStatus(iso){
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  const hasWorkout = Boolean(state.workoutsByDate[iso]);
  const isRest = Boolean(state.restDays[iso]) || isConfiguredRestDay(iso);

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
    if(state.restDays[iso] || isConfiguredRestDay(iso)){ offset++; continue; }
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

// Menú de sugerencias compartido por todas las filas.
// Evita crear listeners, observers y menús duplicados por cada ejercicio.
const exerciseSuggestionMenu = document.createElement("div");
exerciseSuggestionMenu.className = "ex-dd-menu";
exerciseSuggestionMenu.hidden = true;
document.body.appendChild(exerciseSuggestionMenu);

let activeExerciseDropdown = null;

function normalizeSearchText(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getExerciseSuggestions(){
  const names = [
    ...EXERCISE_SUGGESTIONS,
    ...Object.values(PRESET_EXERCISES).flat().map(ex => ex.name),
    ...Object.values(state.settings?.customExercises || {}).flat()
  ].filter(Boolean);

  const seen = new Set();
  return names.filter(name => {
    const key = normalizeSearchText(name);
    if(!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function closeExerciseSuggestions(){
  exerciseSuggestionMenu.hidden = true;
  exerciseSuggestionMenu.innerHTML = "";
  activeExerciseDropdown = null;
}

function positionExerciseSuggestions(){
  if(!activeExerciseDropdown || exerciseSuggestionMenu.hidden) return;
  const { anchor } = activeExerciseDropdown;
  if(!document.body.contains(anchor)) return closeExerciseSuggestions();

  const rect = anchor.getBoundingClientRect();
  const viewportPad = 8;
  const desiredWidth = Math.max(200, rect.width);
  const width = Math.min(desiredWidth, window.innerWidth - viewportPad * 2);
  exerciseSuggestionMenu.style.width = `${width}px`;

  const menuHeight = Math.min(exerciseSuggestionMenu.scrollHeight || 200, 240);
  const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
  const spaceAbove = rect.top - viewportPad;
  const openBelow = spaceBelow >= Math.min(menuHeight, 160) || spaceBelow >= spaceAbove;

  let top = openBelow ? rect.bottom + 4 : rect.top - menuHeight - 4;
  top = Math.max(viewportPad, Math.min(top, window.innerHeight - menuHeight - viewportPad));

  let left = rect.left;
  left = Math.max(viewportPad, Math.min(left, window.innerWidth - width - viewportPad));

  exerciseSuggestionMenu.style.top = `${top}px`;
  exerciseSuggestionMenu.style.left = `${left}px`;
}

function rebuildExerciseSuggestions(query=""){
  const normalizedQuery = normalizeSearchText(query);
  const matches = getExerciseSuggestions().filter(name =>
    !normalizedQuery || normalizeSearchText(name).includes(normalizedQuery)
  );

  exerciseSuggestionMenu.innerHTML = "";

  if(matches.length === 0){
    const empty = document.createElement("div");
    empty.className = "ex-dd-empty";
    empty.textContent = "Sin coincidencias";
    exerciseSuggestionMenu.appendChild(empty);
    return;
  }

  matches.forEach(name => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ex-dd-item";
    item.textContent = name;
    item.dataset.exerciseName = name;
    exerciseSuggestionMenu.appendChild(item);
  });
}

function openExerciseSuggestions(input, anchor, query=""){
  activeExerciseDropdown = { input, anchor };
  rebuildExerciseSuggestions(query);
  exerciseSuggestionMenu.hidden = false;
  requestAnimationFrame(positionExerciseSuggestions);
}

exerciseSuggestionMenu.addEventListener("pointerdown", (e)=>{
  const item = e.target.closest("button[data-exercise-name]");
  if(!item || !activeExerciseDropdown) return;
  e.preventDefault();
  activeExerciseDropdown.input.value = item.dataset.exerciseName;
  activeExerciseDropdown.input.focus();
  closeExerciseSuggestions();
});

document.addEventListener("pointerdown", (e)=>{
  if(exerciseSuggestionMenu.hidden || !activeExerciseDropdown) return;
  const { anchor } = activeExerciseDropdown;
  if(exerciseSuggestionMenu.contains(e.target) || anchor.contains(e.target)) return;
  closeExerciseSuggestions();
});

window.addEventListener("scroll", positionExerciseSuggestions, { passive:true });
window.addEventListener("resize", positionExerciseSuggestions);

function renderExerciseRow(ex = {name:"", sets:4, reps:12, weight:30}){
  const row = document.createElement("div");
  row.className = "trow";

  const nameWrap = document.createElement("div");
  nameWrap.className = "ex-name-wrap";

  const input = document.createElement("input");
  input.className = "exercise-input";
  input.placeholder = "Ejercicio";
  input.autocomplete = "off";
  input.value = ex.name || "";

  const ddBtn = document.createElement("button");
  ddBtn.type = "button";
  ddBtn.className = "ex-dd-btn";
  ddBtn.textContent = "▾";
  ddBtn.setAttribute("aria-label", "Ver ejercicios sugeridos");

  ddBtn.addEventListener("click", (e)=>{
    e.stopPropagation();
    const sameRowOpen = activeExerciseDropdown?.anchor === nameWrap && !exerciseSuggestionMenu.hidden;
    if(sameRowOpen){
      closeExerciseSuggestions();
      return;
    }
    openExerciseSuggestions(input, nameWrap, input.value);
  });

  input.addEventListener("input", ()=>{
    const query = input.value.trim();
    if(!query){
      if(activeExerciseDropdown?.anchor === nameWrap) closeExerciseSuggestions();
      return;
    }
    openExerciseSuggestions(input, nameWrap, query);
  });

  input.addEventListener("focus", ()=>{
    if(input.value.trim()) openExerciseSuggestions(input, nameWrap, input.value);
  });

  nameWrap.append(input, ddBtn);

  const setsSel = document.createElement("select");
  setsSel.setAttribute("aria-label", "Cantidad de series");
  setsOptions().forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    if(Number(ex.sets) === v) o.selected = true;
    setsSel.appendChild(o);
  });

  const repsSel = document.createElement("select");
  repsSel.setAttribute("aria-label", "Cantidad de repeticiones");
  repsOptions().forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    if(Number(ex.reps) === v) o.selected = true;
    repsSel.appendChild(o);
  });

  const weightSel = document.createElement("select");
  weightSel.setAttribute("aria-label", "Peso");
  weightOptions().forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    if(String(ex.weight) === String(v)) o.selected = true;
    weightSel.appendChild(o);
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "row-del-btn";
  delBtn.title = "Eliminar ejercicio";
  delBtn.textContent = "🗑";
  delBtn.addEventListener("click", ()=>{
    if(activeExerciseDropdown?.anchor === nameWrap) closeExerciseSuggestions();
    row.remove();
  });

  row.append(nameWrap, setsSel, repsSel, weightSel, delBtn);
  row._refs = { input, setsSel, repsSel, weightSel };
  return row;
}

function getGroupExercisesForForm(groupKey){
  const presetList = PRESET_EXERCISES[groupKey] || [];

  // Buscamos configuración personalizada guardada para este grupo (clave singular "Pierna" para Piernas)
  const configKey = groupKey === "Piernas" ? "Pierna" : groupKey;
  const customNames = state.settings?.customExercises?.[configKey];

  if(Array.isArray(customNames) && customNames.length){
    return customNames.map(name=>{
      // Si el nombre coincide con un preset existente, mantenemos sus valores de sets/reps/peso
      const match = presetList.find(p => p.name === name);
      return match ? { ...match } : { name, sets:4, reps:12, weight:30 };
    });
  }

  return presetList;
}

function renderFormForSelectedDate(){
  const iso     = toISODate(selectedDate);
  const workout = state.workoutsByDate[iso];

  selectedDatePill.textContent = niceDateES(selectedDate);

  const group = workout?.group || "Pecho";
  groupLabel.textContent = group;

  closeExerciseSuggestions();
  exerciseList.innerHTML = "";

  const configuredExercises = getGroupExercisesForForm(group);
  const fallbackExercises = [
    { name:"Press banca",           sets:4, reps:12, weight:30 },
    { name:"Press militar",         sets:4, reps:6,  weight:30 },
    { name:"Elevaciones laterales", sets:4, reps:12, weight:10 },
  ];
  const exercises = workout?.exercises?.length
    ? workout.exercises
    : (configuredExercises.length ? configuredExercises : fallbackExercises);

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

function positionGroupMenu(){
  const rect = groupDropdownBtn.getBoundingClientRect();
  const viewportPad = 8;
  const menuWidth = Math.min(180, window.innerWidth - viewportPad * 2);
  groupMenu.style.width = `${menuWidth}px`;

  const menuHeight = Math.min(groupMenu.scrollHeight || 200, 260, window.innerHeight - viewportPad * 2);
  const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
  const spaceAbove = rect.top - viewportPad;
  const openBelow = spaceBelow >= Math.min(menuHeight, 150) || spaceBelow >= spaceAbove;

  let top = openBelow ? rect.bottom + 4 : rect.top - menuHeight - 4;
  top = Math.max(viewportPad, Math.min(top, window.innerHeight - menuHeight - viewportPad));

  let left = rect.left;
  left = Math.max(viewportPad, Math.min(left, window.innerWidth - menuWidth - viewportPad));

  groupMenu.style.top = `${top}px`;
  groupMenu.style.left = `${left}px`;
}

groupDropdownBtn.addEventListener("click", ()=>{
  const willOpen = groupMenu.hidden;
  groupMenu.hidden = !groupMenu.hidden;
  if(willOpen) positionGroupMenu();
});

window.addEventListener("scroll", ()=>{
  if(!groupMenu.hidden) positionGroupMenu();
}, { passive: true });

window.addEventListener("resize", ()=>{
  if(!groupMenu.hidden) positionGroupMenu();
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
    closeExerciseSuggestions();
    exerciseList.innerHTML = "";
    const presets = getGroupExercisesForForm(newGroup);
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

// ===================== Estadísticas =====================
let statsPeriod = "week";

const MUSCLE_LABELS = {
  pecho: "Pecho",
  espalda: "Espalda",
  hombros: "Hombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  abdominales: "Abdominales",
  cuadriceps: "Cuádriceps",
  gluteos: "Glúteos",
  isquios: "Isquiotibiales",
  gemelos: "Gemelos"
};

const MUSCLE_HEAT_COLORS = ["#e5e7eb", "#fecdd3", "#fda4af", "#fb7185", "#ef4444", "#b91c1c"];

const EXERCISE_MUSCLE_RULES = [
  { keys:["press banca","press inclinado","press vertical"], muscles:{ pecho:1, triceps:.45, hombros:.35 } },
  { keys:["apertura","peck deck"], muscles:{ pecho:1 } },
  { keys:["press militar"], muscles:{ hombros:1, triceps:.55 } },
  { keys:["elevaciones","vuelos"], muscles:{ hombros:1 } },
  { keys:["remo","jalon","dominadas","facepull"], muscles:{ espalda:1, biceps:.45 } },
  { keys:["facepull"], muscles:{ hombros:.6 } },
  { keys:["biceps","barra z","curl"], muscles:{ biceps:1 } },
  { keys:["triceps"], muscles:{ triceps:1 } },
  { keys:["sentadilla","prensa","sillon cuadriceps","extension de piernas","zancada","estocada"], muscles:{ cuadriceps:1, gluteos:.55 } },
  { keys:["peso muerto"], muscles:{ isquios:1, gluteos:.8, espalda:.35 } },
  { keys:["puente","hip thrust"], muscles:{ gluteos:1, isquios:.5 } },
  { keys:["abductores"], muscles:{ gluteos:1 } },
  { keys:["gemelos","talon"], muscles:{ gemelos:1 } },
  { keys:["abdominal","plancha"], muscles:{ abdominales:1 } }
];

function parseISODate(iso){
  return new Date(`${iso}T00:00:00`);
}

function addDays(date, amount){
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function statsPeriodRange(period, anchorDate=selectedDate){
  const anchor = new Date(anchorDate);
  anchor.setHours(0,0,0,0);
  let start = new Date(anchor);
  let end = new Date(anchor);

  if(period === "week"){
    start = startOfWeekMonday(anchor);
    end = addDays(start, 6);
  } else if(period === "month"){
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth()+1, 0);
  } else if(period === "year"){
    start = new Date(anchor.getFullYear(), 0, 1);
    end = new Date(anchor.getFullYear(), 11, 31);
  }

  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);
  return { start, end, startIso:toISODate(start), endIso:toISODate(end) };
}

function statsRangeText(period, range){
  if(period === "day") return shortDateES(range.start);
  if(period === "week") return `${shortDateES(range.start)} – ${shortDateES(range.end)}`;
  if(period === "month") return `${monthNameES(range.start.getMonth())} ${range.start.getFullYear()}`;
  return String(range.start.getFullYear());
}

function workoutsInRange(range){
  return Object.entries(state.workoutsByDate)
    .filter(([iso]) => iso >= range.startIso && iso <= range.endIso)
    .sort((a,b) => a[0].localeCompare(b[0]));
}

function computeMaxStreak(){
  const workoutDates = Object.keys(state.workoutsByDate).sort();
  if(workoutDates.length === 0) return { count:0, start:null, end:null };

  let cursor = parseISODate(workoutDates[0]);
  const last = parseISODate(workoutDates[workoutDates.length-1]);
  let current = 0;
  let currentStart = null;
  let currentEnd = null;
  let best = { count:0, start:null, end:null };

  while(cursor <= last){
    const iso = toISODate(cursor);
    const trained = Boolean(state.workoutsByDate[iso]);
    const rest = Boolean(state.restDays[iso]) || isConfiguredRestDay(iso);

    if(trained){
      if(current === 0) currentStart = iso;
      current++;
      currentEnd = iso;
      if(current > best.count){
        best = { count:current, start:currentStart, end:currentEnd };
      }
    } else if(!rest){
      current = 0;
      currentStart = null;
      currentEnd = null;
    }

    cursor = addDays(cursor, 1);
  }

  return best;
}

function groupWorkload(entries){
  const totals = { Pecho:0, Espalda:0, Piernas:0, Abdominales:0 };
  entries.forEach(([, workout])=>{
    const group = workout.group === "Pierna" ? "Piernas" : workout.group;
    const sets = (workout.exercises || []).reduce((sum, ex) => sum + (Number(ex.sets) || 0), 0);
    if(group in totals) totals[group] += sets;
  });
  return totals;
}

function fallbackMusclesForGroup(group){
  if(group === "Pecho") return { pecho:1 };
  if(group === "Espalda") return { espalda:1 };
  if(group === "Piernas" || group === "Pierna") return { cuadriceps:1, gluteos:.5, isquios:.35 };
  if(group === "Abdominales") return { abdominales:1 };
  return {};
}

function musclesForExercise(name, group){
  const normalizedName = normalizeSearchText(name);
  const combined = {};

  EXERCISE_MUSCLE_RULES.forEach(rule=>{
    if(rule.keys.some(key => normalizedName.includes(normalizeSearchText(key)))){
      Object.entries(rule.muscles).forEach(([muscle, factor])=>{
        combined[muscle] = Math.max(combined[muscle] || 0, factor);
      });
    }
  });

  return Object.keys(combined).length ? combined : fallbackMusclesForGroup(group);
}

function muscleWorkload(entries){
  const totals = Object.fromEntries(Object.keys(MUSCLE_LABELS).map(key => [key, 0]));

  entries.forEach(([, workout])=>{
    (workout.exercises || []).forEach(ex=>{
      const sets = Number(ex.sets) || 0;
      const muscles = musclesForExercise(ex.name, workout.group);
      Object.entries(muscles).forEach(([muscle, factor])=>{
        totals[muscle] += sets * factor;
      });
    });
  });

  return totals;
}

function muscleHeatLevel(value){
  if(value <= 0) return 0;
  if(value <= 3) return 1;
  if(value <= 6) return 2;
  if(value <= 10) return 3;
  if(value <= 16) return 4;
  return 5;
}

function renderStatsGroupBars(entries){
  if(!statsGroupBars) return;
  const totals = groupWorkload(entries);
  const max = Math.max(1, ...Object.values(totals));

  statsGroupBars.innerHTML = Object.entries(totals).map(([group, value])=>{
    const pct = Math.round((value / max) * 100);
    return `
      <div class="stats-group-row">
        <span>${group}</span>
        <div class="stats-group-track"><div class="stats-group-fill" style="width:${pct}%"></div></div>
        <span class="stats-group-value">${Math.round(value)} s.</span>
      </div>`;
  }).join("");
}

function renderStatsMuscleMap(entries){
  if(!statsMuscleMap) return;
  const load = muscleWorkload(entries);
  const fill = muscle => MUSCLE_HEAT_COLORS[muscleHeatLevel(load[muscle] || 0)];

  statsMuscleMap.innerHTML = `
    <svg class="stats-muscle-svg" viewBox="0 0 340 330" role="img" aria-label="Mapa de grupos musculares trabajados">
      <text x="90" y="18">Frente</text>
      <text x="250" y="18">Espalda</text>

      <g aria-hidden="true">
        <circle class="body-outline" cx="90" cy="46" r="19" />
        <path class="body-outline" d="M66 70 Q90 60 114 70 L124 162 Q110 178 106 205 L104 302 L83 302 L80 205 Q76 178 56 162 Z" />
        <path class="body-outline" d="M66 76 L42 94 L32 170 L47 173 L62 115 Z" />
        <path class="body-outline" d="M114 76 L138 94 L148 170 L133 173 L118 115 Z" />

        <circle class="body-outline" cx="250" cy="46" r="19" />
        <path class="body-outline" d="M226 70 Q250 60 274 70 L284 162 Q270 178 266 205 L264 302 L243 302 L240 205 Q236 178 216 162 Z" />
        <path class="body-outline" d="M226 76 L202 94 L192 170 L207 173 L222 115 Z" />
        <path class="body-outline" d="M274 76 L298 94 L308 170 L293 173 L278 115 Z" />
      </g>

      <g class="muscle-zone" data-muscle="hombros" fill="${fill("hombros")}">
        <circle cx="62" cy="83" r="12"/><circle cx="118" cy="83" r="12"/>
        <circle cx="222" cy="83" r="12"/><circle cx="278" cy="83" r="12"/>
      </g>
      <g class="muscle-zone" data-muscle="pecho" fill="${fill("pecho")}">
        <path d="M71 88 Q89 78 89 112 Q76 116 67 104 Z"/><path d="M91 88 Q109 78 113 104 Q104 116 91 112 Z"/>
      </g>
      <g class="muscle-zone" data-muscle="abdominales" fill="${fill("abdominales")}">
        <rect x="78" y="116" width="24" height="48" rx="8"/>
      </g>
      <g class="muscle-zone" data-muscle="biceps" fill="${fill("biceps")}">
        <ellipse cx="51" cy="119" rx="8" ry="19"/><ellipse cx="129" cy="119" rx="8" ry="19"/>
      </g>
      <g class="muscle-zone" data-muscle="triceps" fill="${fill("triceps")}">
        <ellipse cx="211" cy="119" rx="8" ry="19"/><ellipse cx="289" cy="119" rx="8" ry="19"/>
      </g>
      <g class="muscle-zone" data-muscle="espalda" fill="${fill("espalda")}">
        <path d="M229 86 Q250 74 271 86 L274 148 Q250 165 226 148 Z"/>
      </g>
      <g class="muscle-zone" data-muscle="gluteos" fill="${fill("gluteos")}">
        <ellipse cx="240" cy="176" rx="16" ry="13"/><ellipse cx="260" cy="176" rx="16" ry="13"/>
      </g>
      <g class="muscle-zone" data-muscle="cuadriceps" fill="${fill("cuadriceps")}">
        <path d="M63 174 L86 174 L82 238 L64 238 Z"/><path d="M94 174 L117 174 L116 238 L98 238 Z"/>
      </g>
      <g class="muscle-zone" data-muscle="isquios" fill="${fill("isquios")}">
        <path d="M223 188 L246 188 L242 244 L224 244 Z"/><path d="M254 188 L277 188 L276 244 L258 244 Z"/>
      </g>
      <g class="muscle-zone" data-muscle="gemelos" fill="${fill("gemelos")}">
        <ellipse cx="73" cy="267" rx="9" ry="25"/><ellipse cx="107" cy="267" rx="9" ry="25"/>
        <ellipse cx="233" cy="267" rx="9" ry="25"/><ellipse cx="267" cy="267" rx="9" ry="25"/>
      </g>
    </svg>
    <div class="stats-muscle-tooltip">Tocá una zona muscular para ver el volumen.</div>`;

  const tooltip = statsMuscleMap.querySelector(".stats-muscle-tooltip");
  statsMuscleMap.querySelectorAll(".muscle-zone").forEach(zone=>{
    zone.addEventListener("click", ()=>{
      const key = zone.dataset.muscle;
      const value = load[key] || 0;
      tooltip.textContent = `${MUSCLE_LABELS[key]}: ${value ? value.toFixed(1).replace(".0", "") : "0"} series estimadas`;
    });
  });
}

function getExerciseHistory(){
  const map = new Map();
  Object.entries(state.workoutsByDate)
    .sort((a,b)=> a[0].localeCompare(b[0]))
    .forEach(([iso, workout])=>{
      (workout.exercises || []).forEach(ex=>{
        const name = String(ex.name || "").trim();
        if(!name) return;
        const key = normalizeSearchText(name);
        if(!map.has(key)) map.set(key, { name, byDate:new Map() });
        const entry = map.get(key);
        entry.name = name;
        const point = {
          iso,
          weight:Number(ex.weight) || 0,
          sets:Number(ex.sets) || 0,
          reps:Number(ex.reps) || 0
        };
        const previous = entry.byDate.get(iso);
        if(!previous || point.weight >= previous.weight) entry.byDate.set(iso, point);
      });
    });

  return Array.from(map.entries()).map(([key, entry])=>({
    key,
    name:entry.name,
    points:Array.from(entry.byDate.values()).sort((a,b)=> a.iso.localeCompare(b.iso))
  })).sort((a,b)=> a.name.localeCompare(b.name, "es", { sensitivity:"base" }));
}

function renderStatsExerciseOptions(){
  if(!statsExerciseSelect) return [];
  const history = getExerciseHistory();
  const current = statsExerciseSelect.value;
  statsExerciseSelect.innerHTML = "";

  if(history.length === 0){
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Sin ejercicios guardados";
    statsExerciseSelect.appendChild(option);
    return history;
  }

  history.forEach(ex=>{
    const option = document.createElement("option");
    option.value = ex.key;
    option.textContent = ex.name;
    statsExerciseSelect.appendChild(option);
  });

  if(history.some(ex => ex.key === current)) statsExerciseSelect.value = current;
  return history;
}

function renderProgressChart(history=null){
  if(!statsProgressChart || !statsExerciseSelect || !statsPR) return;
  const allHistory = history || getExerciseHistory();
  const selected = allHistory.find(ex => ex.key === statsExerciseSelect.value) || allHistory[0];

  if(!selected){
    statsPR.textContent = "--";
    statsProgressChart.innerHTML = `<div class="small-note" style="padding:35px 0;text-align:center;">Todavía no hay pesos registrados.</div>`;
    if(statsProgressDetail) statsProgressDetail.textContent = "Guardá entrenamientos con peso para ver la progresión.";
    return;
  }

  if(statsExerciseSelect.value !== selected.key) statsExerciseSelect.value = selected.key;
  const points = selected.points;
  const pr = Math.max(...points.map(p => p.weight));
  statsPR.textContent = `${pr} kg`;

  const width = Math.max(300, 48 + points.length * 54);
  const height = 180;
  const pad = { left:38, right:18, top:18, bottom:34 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxWeight = Math.max(1, ...points.map(p => p.weight));
  const minWeight = Math.min(...points.map(p => p.weight));
  const floor = Math.max(0, minWeight - Math.max(5, (maxWeight-minWeight)*.2));
  const ceil = maxWeight + Math.max(5, (maxWeight-floor)*.12);
  const range = Math.max(1, ceil - floor);

  const coords = points.map((point, index)=>{
    const x = points.length === 1 ? pad.left + chartW/2 : pad.left + (index/(points.length-1))*chartW;
    const y = pad.top + ((ceil - point.weight)/range)*chartH;
    return { ...point, x, y };
  });

  const line = coords.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const gridLines = [0,.25,.5,.75,1].map(frac=>{
    const y = pad.top + chartH*frac;
    const val = (ceil - range*frac).toFixed(0);
    return `<line class="stats-chart-grid" x1="${pad.left}" y1="${y}" x2="${width-pad.right}" y2="${y}"/><text class="stats-chart-label" x="4" y="${y+3}">${val}</text>`;
  }).join("");

  const pointEls = coords.map((point, i)=>{
    const date = shortDateES(parseISODate(point.iso));
    return `<circle class="stats-chart-point" data-point-index="${i}" cx="${point.x}" cy="${point.y}" r="6"><title>${date}: ${point.weight} kg</title></circle>`;
  }).join("");

  const dateLabels = coords.map((point, i)=>{
    if(points.length > 7 && i % Math.ceil(points.length/6) !== 0 && i !== points.length-1) return "";
    const d = parseISODate(point.iso);
    return `<text class="stats-chart-label" x="${point.x}" y="${height-10}" text-anchor="middle">${pad2(d.getDate())}/${pad2(d.getMonth()+1)}</text>`;
  }).join("");

  statsProgressChart.innerHTML = `
    <svg class="stats-chart-svg" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-label="Progresión de peso de ${selected.name}">
      ${gridLines}
      ${coords.length > 1 ? `<polyline class="stats-chart-line" points="${line}"/>` : ""}
      ${pointEls}
      ${dateLabels}
    </svg>`;

  const detail = statsProgressDetail;
  statsProgressChart.querySelectorAll("[data-point-index]").forEach(el=>{
    el.addEventListener("click", ()=>{
      const point = coords[Number(el.dataset.pointIndex)];
      detail.textContent = `${shortDateES(parseISODate(point.iso))} · ${point.weight} kg · ${point.sets} series × ${point.reps} reps`;
    });
  });

  if(detail && points.length){
    const last = points[points.length-1];
    detail.textContent = `Último registro: ${shortDateES(parseISODate(last.iso))} · ${last.weight} kg`;
  }
}

function renderStats(){
  const range = statsPeriodRange(statsPeriod);
  const entries = workoutsInRange(range);
  const streak = computeMaxStreak();

  if(statsMaxStreak) statsMaxStreak.textContent = String(streak.count);
  if(statsMaxStreakPeriod){
    statsMaxStreakPeriod.textContent = streak.count
      ? `${shortDateES(parseISODate(streak.start))} – ${shortDateES(parseISODate(streak.end))}`
      : "Sin entrenamientos guardados";
  }
  if(statsRangeLabel) statsRangeLabel.textContent = statsRangeText(statsPeriod, range);

  if(statsPeriodTabs){
    statsPeriodTabs.querySelectorAll("[data-stats-period]").forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.statsPeriod === statsPeriod);
    });
  }

  renderStatsGroupBars(entries);
  renderStatsMuscleMap(entries);
  const history = renderStatsExerciseOptions();
  renderProgressChart(history);
}

if(statsPeriodTabs){
  statsPeriodTabs.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-stats-period]");
    if(!btn) return;
    statsPeriod = btn.dataset.statsPeriod;
    renderStats();
  });
}

if(statsExerciseSelect){
  statsExerciseSelect.addEventListener("change", ()=> renderProgressChart());
}

// ===================== Configuración: pestañas =====================
function showSettingsTab(which){
  if(settingsPanelRest)      settingsPanelRest.hidden      = which !== "rest";
  if(settingsPanelExercises) settingsPanelExercises.hidden = which !== "exercises";
  if(settingsPanelNotif)     settingsPanelNotif.hidden     = which !== "notif";

  if(tabSettingsRest)      tabSettingsRest.classList.toggle("active", which === "rest");
  if(tabSettingsExercises) tabSettingsExercises.classList.toggle("active", which === "exercises");
  if(tabSettingsNotif)     tabSettingsNotif.classList.toggle("active", which === "notif");
}

if(tabSettingsRest)      tabSettingsRest.addEventListener("click", ()=> showSettingsTab("rest"));
if(tabSettingsExercises) tabSettingsExercises.addEventListener("click", ()=>{ showSettingsTab("exercises"); renderExerciseGroupsConfig(); });
if(tabSettingsNotif)     tabSettingsNotif.addEventListener("click", ()=> showSettingsTab("notif"));

// ===================== Configuración: Descansos =====================
function setSwitch(btn, on){
  if(!btn) return;
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-checked", on ? "true" : "false");
}

function renderRestSettingsUI(){
  setSwitch(weekendRestToggle, Boolean(state.settings?.weekendRest));

  if(weekdayPicker){
    weekdayPicker.querySelectorAll(".weekday-circle").forEach(btn=>{
      const dayIdx = Number(btn.dataset.day);
      const selected = Array.isArray(state.settings?.restWeekdays) && state.settings.restWeekdays.includes(dayIdx);
      btn.classList.toggle("selected", selected);
    });
  }
}

if(weekendRestToggle){
  weekendRestToggle.addEventListener("click", ()=>{
    const next = !weekendRestToggle.classList.contains("on");
    setSwitch(weekendRestToggle, next);
  });
}

if(weekdayPicker){
  weekdayPicker.addEventListener("click", (e)=>{
    const btn = e.target.closest(".weekday-circle");
    if(!btn) return;
    btn.classList.toggle("selected");
  });
}

if(saveRestSettings){
  saveRestSettings.addEventListener("click", async ()=>{
    const selectedDays = weekdayPicker
      ? Array.from(weekdayPicker.querySelectorAll(".weekday-circle.selected")).map(b=> Number(b.dataset.day))
      : [];

    state.settings = state.settings || {};
    state.settings.weekendRest = weekendRestToggle ? weekendRestToggle.classList.contains("on") : false;
    state.settings.restWeekdays = selectedDays;
    // Sólo aplica desde hoy en adelante; nunca modifica datos históricos
    state.settings.restSettingsSavedAt = toISODate(new Date());

    saveStateFor(currentUid, state);
    if(currentUid) await saveStateToCloud(currentUid, state);

    renderAll();
    alert("Configuración de descansos guardada ✅");
  });
}

// ===================== Configuración: Ejercicios por grupo =====================
const MUSCLE_GROUPS = ["Pecho","Espalda","Pierna","Abdominales"];

function groupKeyToPresetKey(groupKey){
  // El picker de configuración usa "Pierna" (singular) según lo solicitado,
  // mientras que el resto de la app usa "Piernas". Lo mapeamos para no romper
  // la lógica de ejercicios existente (PRESET_EXERCISES, dropdown del form, etc).
  return groupKey === "Pierna" ? "Piernas" : groupKey;
}

function getCustomExercisesFor(groupKey){
  const presetKey = groupKeyToPresetKey(groupKey);
  const stored = state.settings?.customExercises?.[groupKey];
  if(Array.isArray(stored) && stored.length){
    return stored.slice();
  }
  // Si no hay configuración guardada, partimos de los ejercicios predefinidos actuales
  return (PRESET_EXERCISES[presetKey] || []).map(e => e.name);
}

function renderExerciseGroupsConfig(){
  if(!exerciseGroupsConfig) return;
  exerciseGroupsConfig.innerHTML = "";

  MUSCLE_GROUPS.forEach(groupKey=>{
    const block = document.createElement("div");
    block.className = "exercise-group-block";
    block.dataset.group = groupKey;

    const title = document.createElement("div");
    title.className = "exercise-group-title";
    title.textContent = groupKey;

    const list = document.createElement("div");
    list.className = "exercise-group-list";

    function addRow(name=""){
      const row = document.createElement("div");
      row.className = "exercise-group-row";

      const input = document.createElement("input");
      input.className = "exercise-input";
      input.placeholder = "Nombre del ejercicio";
      input.value = name;

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "exercise-group-del";
      delBtn.title = "Eliminar";
      delBtn.textContent = "🗑";
      delBtn.addEventListener("click", ()=> row.remove());

      row.appendChild(input);
      row.appendChild(delBtn);
      list.appendChild(row);
    }

    getCustomExercisesFor(groupKey).forEach(name => addRow(name));

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "exercise-group-add";
    addBtn.textContent = "+ Agregar ejercicio";
    addBtn.addEventListener("click", ()=> addRow(""));

    block.appendChild(title);
    block.appendChild(list);
    block.appendChild(addBtn);
    exerciseGroupsConfig.appendChild(block);
  });
}

if(saveExerciseSettings){
  saveExerciseSettings.addEventListener("click", async ()=>{
    const customExercises = { ...(state.settings?.customExercises || {}) };

    exerciseGroupsConfig.querySelectorAll(".exercise-group-block").forEach(block=>{
      const groupKey = block.dataset.group;
      const names = Array.from(block.querySelectorAll(".exercise-input"))
        .map(inp => inp.value.trim())
        .filter(Boolean);
      customExercises[groupKey] = names;
    });

    state.settings = state.settings || {};
    state.settings.customExercises = customExercises;

    saveStateFor(currentUid, state);
    if(currentUid) await saveStateToCloud(currentUid, state);

    alert("Ejercicios guardados ✅");
  });
}

// ===================== Configuración: Notificaciones =====================
let trainingReminderTimeouts = [];

function clearScheduledReminders(){
  trainingReminderTimeouts.forEach(id => clearTimeout(id));
  trainingReminderTimeouts = [];
}

function updateNotifPermHint(){
  if(!notifPermHint) return;
  if(!("Notification" in window)){
    notifPermHint.textContent = "Este navegador no soporta notificaciones web.";
    return;
  }
  if(Notification.permission === "denied"){
    notifPermHint.textContent = "Notificaciones bloqueadas en el navegador. Habilitalas en la configuración del sitio.";
  } else if(Notification.permission === "granted"){
    notifPermHint.textContent = "Notificaciones activas (sólo mientras la app está abierta).";
  } else {
    notifPermHint.textContent = "Se pedirá permiso al guardar.";
  }
}

function renderNotifSettingsUI(){
  setSwitch(remindersToggle, Boolean(state.settings?.reminders));
  if(trainingTimeInput) trainingTimeInput.value = state.settings?.trainingTime || "08:00";
  updateNotifPermHint();
}

if(remindersToggle){
  remindersToggle.addEventListener("click", ()=>{
    const next = !remindersToggle.classList.contains("on");
    setSwitch(remindersToggle, next);
  });
}

function scheduleTodayReminders(){
  clearScheduledReminders();

  if(!state.settings?.reminders) return;
  if(!("Notification" in window) || Notification.permission !== "granted") return;

  const todayIso = toISODate(new Date());
  if(isConfiguredRestDay(todayIso)) return; // no molestar en días de descanso configurados

  const [hh, mm] = (state.settings.trainingTime || "08:00").split(":").map(Number);
  if(!Number.isFinite(hh) || !Number.isFinite(mm)) return;

  const target = new Date();
  target.setHours(hh, mm, 0, 0);

  const offsets = [ { mins: 30, msg: "En 30 min entrenas ¿Ya estás preparado?" }, { mins: 15, msg: "¿Todavía no estás listo?" } ];

  offsets.forEach(({ mins, msg })=>{
    const fireAt = new Date(target.getTime() - mins*60000);
    const delay  = fireAt.getTime() - Date.now();
    if(delay <= 0) return; // ya pasó ese horario hoy

    const id = setTimeout(()=>{
      try{
        new Notification("GymBro", { body: msg });
      }catch(err){
        console.error("No se pudo mostrar la notificación:", err);
      }
    }, delay);

    trainingReminderTimeouts.push(id);
  });
}

if(saveNotifSettings){
  saveNotifSettings.addEventListener("click", async ()=>{
    const wantsReminders = remindersToggle ? remindersToggle.classList.contains("on") : false;
    const time = trainingTimeInput?.value || "08:00";

    if(wantsReminders && "Notification" in window && Notification.permission === "default"){
      try{
        await Notification.requestPermission();
      }catch(err){
        console.error(err);
      }
    }

    if(wantsReminders && (!("Notification" in window) || Notification.permission !== "granted")){
      updateNotifPermHint();
      alert("No se pudo activar: falta el permiso de notificaciones del navegador.");
      return;
    }

    state.settings = state.settings || {};
    state.settings.reminders = wantsReminders;
    state.settings.trainingTime = time;

    saveStateFor(currentUid, state);
    if(currentUid) await saveStateToCloud(currentUid, state);

    updateNotifPermHint();
    scheduleTodayReminders();
    alert("Configuración de notificaciones guardada ✅");
  });
}

// ===================== Render todo =====================
function renderAll(){
  renderWeek();
  renderMonth();
  renderLastWorkout();
  streakDaysEl.textContent = String(computeStreak());
  renderFormForSelectedDate();
  renderRestSettingsUI();
  renderNotifSettingsUI();
  scheduleTodayReminders();
  if(viewStats && !viewStats.hidden) renderStats();
}

renderAll();
setMode("stopwatch");
showMain();
