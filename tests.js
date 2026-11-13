/* Unit tests voor puntentelling en level-up-logica.
   Draaien:  node --test
   De tests laden index.html ongewijzigd in een sandbox (vm) met een vaste "vandaag". */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
function scriptById(id) {
  const m = html.match(new RegExp('<script id="' + id + '"[^>]*>([\\s\\S]*?)</script>'));
  if (!m) throw new Error('script #' + id + ' niet gevonden');
  return m[1];
}

function fixedDate(todayKey) {
  const R = Date;
  const p = todayKey.split('-').map(Number);
  const fixed = new R(p[0], p[1] - 1, p[2], 12, 0, 0).getTime();
  function D(...a) {
    if (!(this instanceof D)) return new R(fixed).toString();
    return a.length === 0 ? new R(fixed) : new R(...a);
  }
  D.prototype = R.prototype;
  D.now = () => fixed;
  D.UTC = R.UTC;
  D.parse = R.parse;
  return D;
}

/* Laadt de app met een vaste datum en geeft de interne functies terug. */
function load(today) {
  const stateJson = scriptById('state');
  const src = scriptById('app');
  const end = src.lastIndexOf('})();');
  const exposed = src.slice(0, end) +
    'window.__t = { getState:function(){return state;}, setState:function(s){state=s;},' +
    ' levelAt:levelAt, setLevel:setLevel, hitOn:hitOn, weekStats:weekStats, weekScore:weekScore,' +
    ' record:record, evaluateLevels:evaluateLevels, addDays:addDays, mondayOf:mondayOf,' +
    ' ensureEntry:ensureEntry, habitById:habitById, buildBackup:buildBackup, validateBackup:validateBackup,' +
    ' applyState:applyState, activeIn:activeIn, activeAt:activeAt, ladderAt:ladderAt, setActive:setActive,' +
    ' addHabit:addHabit, updateHabit:updateHabit, archiveHabit:archiveHabit, restoreHabit:restoreHabit,' +
    ' rawLevel:rawLevel, checkLadder:checkLadder, levelHint:levelHint, renderOverview:renderOverview, yesterdayCard:yesterdayCard };\n' + src.slice(end);
  const doc = {
    getElementById(id) {
      if (id === 'state') return { textContent: stateJson };
      if (id === 'root') return { innerHTML: '', addEventListener() {} };
      if (id === 'css' || id === 'app') return { textContent: '' };
      return null;
    },
    addEventListener() {}
  };
  const win = {};
  const ctx = vm.createContext({
    document: doc, window: win, Date: fixedDate(today),
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout, clearTimeout
  });
  vm.runInContext(exposed, ctx);
  const t = win.__t;

  t.state = () => t.getState();
  /* Alleen deze gewoontes actief, allemaal op niveau-index lvl, met aanmaakdatum created. */
  t.setup = function (created, ids, lvl) {
    const s = t.getState();
    s.created = created;
    s.habits.forEach(function (h) {
      h.enabled = ids.indexOf(h.id) !== -1;
      h.levelHistory = [['0000-00-00', lvl || 0, 'start']];
    });
  };
  /* values: array van 7 (null/undefined = niet ingevuld) vanaf maandag wk */
  t.fill = function (wk, id, values) {
    values.forEach(function (v, i) {
      if (v === null || v === undefined) return;
      t.ensureEntry(t.addDays(wk, i)).values[id] = v;
    });
  };
  t.reflect = function (day, text) { t.ensureEntry(day).good = text; };
  return t;
}

const TODAY = '2026-10-28';           // woensdag, week van 2026-10-26
const W1 = '2026-10-12', W2 = '2026-10-19', CUR = '2026-10-26';
const PASS_WATER = [4, 4, 4, 4, 4, 4, 4];           // haalt elk niveau
const FAIL_WATER = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
const PASS_SPORT = [true, true, true, true, true, true, true];
const FAIL_SPORT = [false, false, false, false, false, false, false];

/* ================= Punten ================= */

test('dagelijkse gewoonte LV1: 6 dagen gehaald = 6x10 + 25 weekbonus', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, null]);
  assert.equal(t.weekScore(W1), 85);
});

test('dagelijkse gewoonte LV1: 7 dagen gehaald = 70 + 25', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);
  assert.equal(t.weekScore(W1), 95);
});

test('dagelijkse gewoonte: 5 van 7 dagen = wel dagpunten, geen weekbonus', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  t.fill(W1, 'water', [2, 2, 2, 2, 2, null, null]);
  assert.equal(t.weekScore(W1), 50);
  assert.equal(t.weekStats(t.habitById('water'), W1).passed, false);
});

test('hoger level geeft meer punten: LV3 = 6x20 + 35', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 2);   // doel 2,5 L
  t.fill(W1, 'water', [3, 3, 3, 3, 3, 3, null]);
  assert.equal(t.weekScore(W1), 155);
});

test('weekgewoonte LV1 (sport 3x): 3x ja = 30 + 25; 2x ja = 20 zonder bonus', () => {
  const t = load(TODAY); t.setup(W1, ['sport'], 0);
  t.fill(W1, 'sport', [true, false, true, null, true, null, null]);
  assert.equal(t.weekScore(W1), 55);
  t.fill(W2, 'sport', [true, true, false, false, null, null, null]);
  assert.equal(t.weekScore(W2), 20);
});

test('weekgewoonte LV2 (sport 4x): 4x ja = 4x15 + 30', () => {
  const t = load(TODAY); t.setup(W1, ['sport'], 1);
  t.fill(W1, 'sport', [true, true, true, true, null, null, null]);
  assert.equal(t.weekScore(W1), 90);
});

test('niet ingevuld en "nee" tellen niet als gehaald', () => {
  const t = load(TODAY); t.setup(W1, ['water', 'sport'], 0);
  const water = t.habitById('water'), sport = t.habitById('sport');
  t.fill(W1, 'water', [2]);
  t.fill(W1, 'sport', [false]);
  assert.equal(t.hitOn(water, W1), true);
  assert.equal(t.hitOn(water, t.addDays(W1, 1)), null);   // niet ingevuld
  assert.equal(t.hitOn(sport, W1), false);
});

test('dagreflectie: +5 per dag met tekst; spaties en alleen energie tellen niet', () => {
  const t = load(TODAY); t.setup(W1, [], 0);
  t.reflect(W1, 'goed gewerkt');
  t.ensureEntry(t.addDays(W1, 1)).better = 'eerder naar bed';
  t.reflect(t.addDays(W1, 2), '   ');
  t.ensureEntry(t.addDays(W1, 3)).energy = 4;
  assert.equal(t.weekScore(W1), 10);
});

test('uitgeschakelde gewoonte telt niet mee in de score', () => {
  const t = load(TODAY); t.setup(W1, ['sport'], 0);
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);            // water staat uit
  assert.equal(t.weekScore(W1), 0);
});

test('totaalscore: daggewoonte + weekgewoonte + reflecties', () => {
  const t = load(TODAY); t.setup(W1, ['water', 'sport'], 0);
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, null]);          // 85
  t.fill(W1, 'sport', [true, true, true, null, null, null, null]); // 55
  t.reflect(W1, 'a'); t.reflect(t.addDays(W1, 1), 'b');   // 10
  assert.equal(t.weekScore(W1), 150);
});

/* ================= Doelen per type ================= */

test('tijd (bedtijd LV1 = vóór 00:30): na middernacht telt als later dan 23:xx', () => {
  const t = load(TODAY); t.setup(W1, ['bedtijd'], 0);
  const h = t.habitById('bedtijd');
  t.fill(W1, 'bedtijd', ['00:30', '00:31', '23:50', '01:00', '22:00']);
  const hits = [0, 1, 2, 3, 4].map(i => t.hitOn(h, t.addDays(W1, i)));
  assert.deepEqual(hits, [true, false, true, false, true]);
});

test('tijd (bedtijd LV3 = vóór 23:30)', () => {
  const t = load(TODAY); t.setup(W1, ['bedtijd'], 2);
  const h = t.habitById('bedtijd');
  t.fill(W1, 'bedtijd', ['23:30', '23:45', '23:00']);
  assert.equal(t.hitOn(h, W1), true);
  assert.equal(t.hitOn(h, t.addDays(W1, 1)), false);
  assert.equal(t.hitOn(h, t.addDays(W1, 2)), true);
});

test('schermtijd is een maximum (<= doel), slaap een minimum (>= doel)', () => {
  const t = load(TODAY); t.setup(W1, ['scherm', 'slaap'], 0);   // scherm <= 4, slaap >= 7
  t.fill(W1, 'scherm', [4, 4.25]);
  t.fill(W1, 'slaap', [7, 6.75]);
  assert.equal(t.hitOn(t.habitById('scherm'), W1), true);
  assert.equal(t.hitOn(t.habitById('scherm'), t.addDays(W1, 1)), false);
  assert.equal(t.hitOn(t.habitById('slaap'), W1), true);
  assert.equal(t.hitOn(t.habitById('slaap'), t.addDays(W1, 1)), false);
});

test('doel wordt bepaald door het level van de week van die dag (historie klopt)', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  const h = t.habitById('water');
  t.setLevel(h, W2, 1, 'auto');                          // vanaf W2 doel 2,0 L
  t.fill(W1, 'water', [1.75]);
  t.fill(W2, 'water', [1.75]);
  assert.equal(t.hitOn(h, W1), true);                    // W1: doel 1,5
  assert.equal(t.hitOn(h, W2), false);                   // W2: doel 2,0
});

/* ================= Record ================= */

test('record = hoogste weekscore van afgeronde weken, huidige week telt niet', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);            // 95
  t.fill(W2, 'water', [2, 2, 2, 2, 2, 2, null]);         // 85
  t.fill(CUR, 'water', [2, 2, 2, 2, 2, 2, 2]);           // 95 maar loopt nog
  const r = t.record();
  assert.equal(r.score, 95);
  assert.equal(r.wk, W1);
});

test('record bij gelijke score: eerste week blijft het record', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);
  t.fill(W2, 'water', [2, 2, 2, 2, 2, 2, 2]);
  assert.equal(t.record().wk, W1);
});

/* ================= Level-up ================= */

test('2 weken op rij gehaald: level omhoog vanaf de week erna', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  const h = t.habitById('water');
  t.fill(W1, 'water', PASS_WATER); t.fill(W2, 'water', PASS_WATER);
  t.evaluateLevels();
  assert.equal(t.levelAt(h, W2), 0);
  assert.equal(t.levelAt(h, CUR), 1);
  assert.equal(t.state().evaluatedThrough, W2);
});

test('maar 1 week gehaald (tweede mislukt): geen level-up', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  t.fill(W1, 'water', PASS_WATER); t.fill(W2, 'water', FAIL_WATER);
  t.evaluateLevels();
  assert.equal(t.levelAt(t.habitById('water'), CUR), 0);
});

test('eerste week mislukt, tweede gehaald: geen level-up', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  t.fill(W1, 'water', FAIL_WATER); t.fill(W2, 'water', PASS_WATER);
  t.evaluateLevels();
  assert.equal(t.levelAt(t.habitById('water'), CUR), 0);
});

test('week vóór de startweek telt niet mee voor de 2 weken', () => {
  const t = load('2026-10-21');                          // huidige week = W2
  t.setup(W1, ['water'], 0);
  t.fill('2026-10-05', 'water', PASS_WATER);             // vóór created
  t.fill(W1, 'water', PASS_WATER);
  t.evaluateLevels();
  assert.equal(t.levelAt(t.habitById('water'), W2), 0);
});

test('evaluatie is idempotent: nogmaals draaien verandert niets', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  t.fill(W1, 'water', PASS_WATER); t.fill(W2, 'water', PASS_WATER);
  t.evaluateLevels();
  const first = JSON.stringify(t.state());
  t.evaluateLevels(); t.evaluateLevels();
  assert.equal(JSON.stringify(t.state()), first);
});

test('keten: 4 weken gehaald = level-up na wk2 en na wk4 (niet na wk3)', () => {
  const t = load(CUR);                                   // vandaag = maandag 26-10
  t.setup('2026-09-28', ['water'], 0);
  ['2026-09-28', '2026-10-05', W1, W2].forEach(w => t.fill(w, 'water', PASS_WATER));
  t.evaluateLevels();
  const h = t.habitById('water');
  const lv = ['2026-09-28', '2026-10-05', W1, W2, CUR].map(w => t.levelAt(h, w));
  assert.deepEqual(lv, [0, 0, 1, 1, 2]);
});

test('hoogste level: blijft staan, geen level voorbij de ladder', () => {
  const t = load(TODAY); t.setup(W1, ['alcohol'], 2);    // ladder heeft 3 niveaus
  t.fill(W1, 'alcohol', PASS_SPORT); t.fill(W2, 'alcohol', PASS_SPORT);
  t.evaluateLevels();
  assert.equal(t.levelAt(t.habitById('alcohol'), CUR), 2);
});

test('handmatige levelwissel: reset de "2 weken op rij" op hetzelfde level', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  const h = t.habitById('water');
  t.setLevel(h, W2, 1, 'manual');                        // in W2 al op ander level dan W1
  t.fill(W1, 'water', PASS_WATER); t.fill(W2, 'water', PASS_WATER);
  t.evaluateLevels();
  assert.equal(t.levelAt(h, CUR), 1);                    // geen extra automatische stap
  assert.equal(h.levelHistory.some(e => e[2] === 'auto'), false);
});

test('uitgeschakelde gewoonte krijgt geen level-up', () => {
  const t = load(TODAY); t.setup(W1, ['sport'], 0);      // water staat uit
  t.fill(W1, 'water', PASS_WATER); t.fill(W2, 'water', PASS_WATER);
  t.evaluateLevels();
  assert.equal(t.levelAt(t.habitById('water'), CUR), 0);
});

test('weekgewoonte (sport): 2 weken de norm gehaald = level-up; 1 week te weinig niet', () => {
  const up = load(TODAY); up.setup(W1, ['sport'], 0);
  up.fill(W1, 'sport', PASS_SPORT); up.fill(W2, 'sport', PASS_SPORT);
  up.evaluateLevels();
  assert.equal(up.levelAt(up.habitById('sport'), CUR), 1);

  const no = load(TODAY); no.setup(W1, ['sport'], 0);
  no.fill(W1, 'sport', PASS_SPORT); no.fill(W2, 'sport', FAIL_SPORT);
  no.evaluateLevels();
  assert.equal(no.levelAt(no.habitById('sport'), CUR), 0);
});

/* ================= Huidig gedrag van de data (zie opmerking in de chat) ================= */

test('BESTAANDE DATA: elke gewoonte start op niveau-index 1 (= "LV 2")', () => {
  const t = load(TODAY);
  const s = t.state();
  s.habits.forEach(h => assert.equal(t.levelAt(h, CUR), 1, h.id));
});

/* ================= Back-up: export / import ================= */

/* Maakt een geldige back-up (als gewone JSON-tekst) uit een app met wat ingevulde data. */
function sampleBackup() {
  const t = load(TODAY); t.setup(W1, ['water', 'sport', 'bedtijd'], 0);
  t.fill(W1, 'water', [2, 2.5, 1]);
  t.fill(W1, 'sport', [true, false]);
  t.fill(W1, 'bedtijd', ['23:15']);
  t.reflect(W1, 'goed gedaan');
  t.ensureEntry(W1).energy = 4;
  return { t, raw: JSON.parse(JSON.stringify(t.buildBackup())) };
}
const check = raw => load(TODAY).validateBackup(raw);
/* JSON met gesorteerde sleutels: vergelijkt de inhoud, niet de volgorde van velden */
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);

test('back-up: heeft app-naam, versie, datum en de data', () => {
  const { raw } = sampleBackup();
  assert.equal(raw.app, 'robin-habit-tracker');
  assert.equal(raw.version, 1);
  assert.match(raw.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(raw.data.habits.length, 10);
});

test('back-up: exporteren en weer importeren geeft exact dezelfde gegevens', () => {
  const { t, raw } = sampleBackup();
  const res = check(raw);
  assert.equal(res.ok, true, res.error);
  assert.equal(canon(res.state), canon(JSON.parse(JSON.stringify(t.state()))));
});

test('back-up: terugzetten in een lege app geeft dezelfde score en levels', () => {
  const { t, raw } = sampleBackup();
  const before = t.weekScore(W1);
  const fresh = load(TODAY);
  assert.equal(fresh.weekScore(W1), 0);
  fresh.applyState(check(raw).state);
  assert.equal(fresh.weekScore(W1), before);
  assert.equal(fresh.state().created, W1);
});

test('back-up: een kale state (zonder envelope) wordt ook geaccepteerd', () => {
  const { raw } = sampleBackup();
  assert.equal(check(raw.data).ok, true);
});

test('back-up: validatie wijzigt de invoer niet en houdt alleen bekende velden', () => {
  const { raw } = sampleBackup();
  raw.data.rommel = 'x'; raw.data.entries[W1].onzin = 1;
  const snapshot = JSON.stringify(raw);
  const res = check(raw);
  assert.equal(JSON.stringify(raw), snapshot);
  assert.equal(res.state.rommel, undefined);
  assert.equal(res.state.entries[W1].onzin, undefined);
});

test('back-up: onbekende gewoonte-id in een dag (bv. verwijderde gewoonte) blijft behouden', () => {
  const { raw } = sampleBackup();
  raw.data.entries[W1].values.oudehabit = 5;
  const res = check(raw);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.state.entries[W1].values.oudehabit, 5);
});

const rejects = (name, mutate, fragment) => test('back-up wordt geweigerd: ' + name, () => {
  const { raw } = sampleBackup();
  const arg = mutate(raw);
  const res = check(arg === undefined ? raw : arg);
  assert.equal(res.ok, false);
  if (fragment) assert.match(res.error, fragment);
});
rejects('geen object', () => 'hallo');
rejects('null', () => null);
rejects('lijst in plaats van object', () => []);
rejects('andere app', r => { r.app = 'iets-anders'; }, /geen back-up van deze app/);
rejects('nieuwere versie', r => { r.data.version = 2; }, /nieuwere versie/);
rejects('geen gewoontes', r => { r.data.habits = []; }, /gewoontes/);
rejects('gewoontes geen lijst', r => { r.data.habits = 'x'; }, /gewoontes/);
rejects('onbekend soort', r => { r.data.habits[0].kind = 'maandelijks'; }, /soort/);
rejects('onbekend type', r => { r.data.habits[0].type = 'tekst'; }, /type/);
rejects('lege levels', r => { r.data.habits[0].ladder = []; }, /levels/);
rejects('tekst in numerieke levels', r => { r.data.habits[0].ladder = [7, 'veel']; }, /level 2/);
rejects('ongeldige tijd in levels', r => { r.data.habits.find(h => h.id === 'bedtijd').ladder = ['25:99']; }, /level 1/);
rejects('dubbele id', r => { r.data.habits[1].id = r.data.habits[0].id; }, /dubbel/);
rejects('onveilige id', r => { r.data.habits[0].id = '<img src=x>'; }, /id/);
rejects('actief ontbreekt', r => { delete r.data.habits[0].enabled; }, /actief/);
rejects('levelgeschiedenis ontbreekt', r => { delete r.data.habits[0].levelHistory; }, /levelgeschiedenis/);
rejects('levelgeschiedenis met negatief level', r => { r.data.habits[0].levelHistory = [['0000-00-00', -1, 'start']]; }, /levelgeschiedenis/);
rejects('ongeldige dag-sleutel', r => { r.data.entries['morgen'] = { values: {} }; }, /datum/);
rejects('tekst waar een getal hoort', r => { r.data.entries[W1].values.water = 'veel'; }, /water|Water/i);
rejects('getal waar ja/nee hoort', r => { r.data.entries[W1].values.sport = 3; }, /Gesport/);
rejects('ongeldige tijd bij dag', r => { r.data.entries[W1].values.bedtijd = 'laat'; }, /Bedtijd/);
rejects('NaN/Infinity (komt als null uit JSON)', r => { r.data.entries[W1].values.water = null; }, /water|Water/i);
rejects('energie buiten 1-5', r => { r.data.entries[W1].energy = 9; }, /energie/);
rejects('reflectie geen tekst', r => { r.data.entries[W1].good = { a: 1 }; }, /reflectie/);
rejects('ongeldige startdatum', r => { r.data.created = '13-11-2026'; }, /startdatum/);

test('back-up: JSON.parse/stringify-ronde (echte bestandsinhoud) blijft geldig', () => {
  const { raw } = sampleBackup();
  const viaFile = JSON.parse(JSON.stringify(raw, null, 2));
  assert.equal(check(viaFile).ok, true);
});

test('back-up: een afgekeurde import verandert de huidige gegevens niet', () => {
  const t = load(TODAY); t.setup(W1, ['water'], 0);
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);
  const before = JSON.stringify(t.state());
  const res = t.validateBackup({ app: 'robin-habit-tracker', version: 1, data: { habits: [] } });
  assert.equal(res.ok, false);
  assert.equal(JSON.stringify(t.state()), before);
});

/* ================= Gewoontes beheren: toevoegen, aanpassen, stoppen ================= */

const fresh = (lvl) => { const t = load(TODAY); t.setup(W1, ['water'], lvl || 0); return t; };
const LEZEN = { name: 'Lezen', kind: 'daily', type: 'number', dir: 'min', unit: 'min', step: 5, ladder: ['10', '20'], start: 0 };
const NEXT_WEEK = '2026-11-02';

/* ---- geschiedenis blijft kloppen ---- */

test('stoppen vanaf deze week: eerdere weken en record veranderen niet', () => {
  const t = fresh();
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);              // 95
  t.fill(CUR, 'water', [2, 2, 2, 2, 2, 2, 2]);
  assert.equal(t.weekScore(CUR), 95);
  t.setActive(t.habitById('water'), CUR, false);
  assert.equal(t.weekScore(W1), 95);                       // verleden blijft staan
  assert.equal(t.weekScore(CUR), 0);                       // vanaf nu telt hij niet meer
  assert.equal(t.record().score, 95);
  assert.equal(t.record().wk, W1);
});

test('oude data (zonder activity) wordt bij de eerste wijziging netjes omgezet', () => {
  const t = fresh();
  const h = t.habitById('water');
  assert.equal(h.activity, undefined);
  t.setActive(h, CUR, false);
  assert.equal(JSON.stringify(h.activity), JSON.stringify([['0000-00-00', true], [CUR, false]]));
  assert.equal(h.enabled, false);                          // spiegelt de huidige week
});

test('stoppen en later weer starten: alleen de tussenliggende weken tellen niet', () => {
  const t = fresh();
  const h = t.habitById('water');
  t.setActive(h, W2, false);
  t.setActive(h, NEXT_WEEK, true);
  assert.deepEqual([W1, W2, CUR, NEXT_WEEK].map(w => t.activeIn(h, w)), [true, false, false, true]);
  assert.equal(h.enabled, false);                          // huidige week (CUR) is niet actief
});

test('gestopt (verwijderd): staat niet meer in de huidige week, wel in het verleden', () => {
  const t = fresh();
  const h = t.habitById('water');
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);
  assert.equal(t.archiveHabit('water', CUR), true);
  assert.equal(h.archived, true);
  assert.equal(t.activeAt(CUR).length, 0);
  assert.equal(t.activeAt(W1).map(x => x.id).join(), 'water');
  assert.equal(t.weekScore(W1), 95);
});

test('gestopte gewoonte herstellen in dezelfde week: geen gat', () => {
  const t = fresh();
  const h = t.habitById('water');
  t.archiveHabit('water', CUR);
  t.restoreHabit('water', CUR);
  assert.equal(h.archived, false);
  assert.deepEqual([W1, W2, CUR].map(w => t.activeIn(h, w)), [true, true, true]);
});

test('nieuwe gewoonte telt niet mee in eerdere weken, ook niet als daar data voor staat', () => {
  const t = fresh();
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);
  const r = t.addHabit(LEZEN, CUR);
  assert.equal(r.ok, true, r.error);
  t.fill(W1, 'lezen', [30, 30, 30, 30, 30, 30, 30]);        // data uit het verleden
  assert.equal(t.weekScore(W1), 95);
  assert.equal(t.activeAt(W1).map(x => x.id).join(), 'water');
  assert.equal(t.activeAt(CUR).map(x => x.id).sort().join(), 'lezen,water');
});

test('doelen aanpassen geldt vanaf deze week; eerdere weken houden hun oude doelen', () => {
  const t = fresh();
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);              // doel was 1,5 L: gehaald
  t.fill(CUR, 'water', [2, 2, 2, 2, 2, 2, 2]);
  const r = t.updateHabit('water', { name: 'Water gedronken', ladder: [3, 4] }, CUR);
  assert.equal(r.ok, true, r.error);
  assert.equal(t.weekScore(W1), 95);
  assert.equal(t.hitOn(t.habitById('water'), W1), true);
  assert.equal(t.hitOn(t.habitById('water'), CUR), false);  // nu doel 3 L
  assert.equal(t.ladderAt(t.habitById('water'), W1).length, 4);
  assert.equal(t.ladderAt(t.habitById('water'), CUR).length, 2);
});

test('weekgewoonte: nieuw aantal keer geldt vanaf deze week, vorige weken houden 3x', () => {
  const t = load(TODAY); t.setup(W1, ['sport'], 0);
  t.fill(W1, 'sport', [true, true, true]);
  t.updateHabit('sport', { name: 'Gesport', ladder: [2, 4, 5] }, CUR);
  const h = t.habitById('sport');
  assert.equal(t.weekStats(h, W1).need, 3);
  assert.equal(t.weekStats(h, W1).passed, true);
  assert.equal(t.weekStats(h, CUR).need, 2);
  assert.equal(t.weekScore(W1), 55);
});

test('minder levels: huidig level wordt teruggezet, oude weken houden hun level', () => {
  const t = fresh(3);                                      // level-index 3 van [1.5,2,2.5,3]
  t.updateHabit('water', { name: 'Water gedronken', ladder: [1.5, 2] }, CUR);
  const h = t.habitById('water');
  assert.equal(t.levelAt(h, CUR), 1);
  assert.equal(t.rawLevel(h, CUR), 1);
  assert.equal(t.levelAt(h, W2), 3);                       // verleden onaangeroerd
});

test('level-up na doel aanpassen: weken ervoor tellen met hun oude doelen', () => {
  const t = fresh();
  t.fill(W1, 'water', PASS_WATER); t.fill(W2, 'water', PASS_WATER);
  t.updateHabit('water', { name: 'Water gedronken', ladder: [3, 4, 5] }, CUR);
  t.evaluateLevels();
  assert.equal(t.levelAt(t.habitById('water'), CUR), 1);
});

test('gestopt vanaf week 2: geen level-up voor die week', () => {
  const t = fresh();
  t.fill(W1, 'water', PASS_WATER); t.fill(W2, 'water', PASS_WATER);
  t.setActive(t.habitById('water'), W2, false);
  t.evaluateLevels();
  assert.equal(t.levelAt(t.habitById('water'), CUR), 0);
  assert.equal(t.weekScore(W2), 0);
  assert.equal(t.weekScore(W1) > 0, true);
});

/* ---- toevoegen ---- */

test('toevoegen (dagelijks getal): ladder als tekst wordt getal, startlevel en punten kloppen', () => {
  const t = load(TODAY); t.setup(W1, [], 0);
  const r = t.addHabit(Object.assign({}, LEZEN, { start: 1 }), CUR);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.habit.id, 'lezen');
  assert.equal(JSON.stringify(r.habit.ladder), '[10,20]');
  assert.equal(t.levelAt(r.habit, CUR), 1);
  t.fill(CUR, 'lezen', [25, 25, 25, 25, 25, 25]);
  assert.equal(t.weekScore(CUR), 6 * 15 + 30);              // LV2: 10+5 per dag, bonus 25+5
});

test('toevoegen (tijd): "vóór"-doelen worden steeds eerder', () => {
  const t = load(TODAY); t.setup(W1, [], 0);
  const r = t.addHabit({ name: 'Naar bed', kind: 'daily', type: 'time', ladder: ['00:30', '00:00', '23:30'] }, CUR);
  assert.equal(r.ok, true, r.error);
  t.fill(CUR, 'naar-bed', ['23:50', '00:10']);
  assert.equal(t.hitOn(r.habit, CUR), true);
  assert.equal(t.hitOn(r.habit, t.addDays(CUR, 1)), true);
});

test('toevoegen (week ja/nee): levels zijn aantallen keer', () => {
  const t = load(TODAY); t.setup(W1, [], 0);
  const r = t.addHabit({ name: 'Mediteren', kind: 'weekly', type: 'bool', ladder: ['2', '4'] }, CUR);
  assert.equal(r.ok, true, r.error);
  t.fill(CUR, 'mediteren', [true, true]);
  assert.equal(t.weekStats(r.habit, CUR).need, 2);
  assert.equal(t.weekStats(r.habit, CUR).passed, true);
});

test('toevoegen: id is uniek en veilig (accenten, leestekens, dubbele namen)', () => {
  const t = load(TODAY); t.setup(W1, [], 0);
  const a = t.addHabit(Object.assign({}, LEZEN, { name: 'Meditatie é!' }), CUR).habit;
  const b = t.addHabit(Object.assign({}, LEZEN, { name: 'Meditatie é!' }), CUR).habit;
  const c = t.addHabit(Object.assign({}, LEZEN, { name: 'Water' }), CUR).habit;   // 'water' bestaat al
  assert.equal(a.id, 'meditatie-e');
  assert.equal(b.id, 'meditatie-e-2');
  assert.equal(c.id, 'water-2');
});

test('nieuwe gewoonte krijgt level-up na 2 weken, maar telt weken voor zijn start niet mee', () => {
  const up = load(TODAY); up.setup(W1, [], 0);
  const h1 = up.addHabit(LEZEN, W1).habit;
  up.fill(W1, 'lezen', [30, 30, 30, 30, 30, 30, 30]); up.fill(W2, 'lezen', [30, 30, 30, 30, 30, 30, 30]);
  up.evaluateLevels();
  assert.equal(up.levelAt(h1, CUR), 1);

  const late = load(TODAY); late.setup(W1, [], 0);
  const h2 = late.addHabit(LEZEN, W2).habit;                // pas vanaf W2
  late.fill(W1, 'lezen', [30, 30, 30, 30, 30, 30, 30]); late.fill(W2, 'lezen', [30, 30, 30, 30, 30, 30, 30]);
  late.evaluateLevels();
  assert.equal(late.levelAt(h2, CUR), 0);
});

const addFails = (name, spec, fragment) => test('toevoegen wordt geweigerd: ' + name, () => {
  const t = load(TODAY); t.setup(W1, [], 0);
  const before = JSON.stringify(t.state());
  const r = t.addHabit(Object.assign({}, LEZEN, spec), CUR);
  assert.equal(r.ok, false);
  if (fragment) assert.match(r.error, fragment);
  assert.equal(JSON.stringify(t.state()), before);          // niets veranderd
});
addFails('lege naam', { name: '' }, /naam/);
addFails('alleen spaties als naam', { name: '   ' }, /naam/);
addFails('te lange naam', { name: 'x'.repeat(61) }, /lang/);
addFails('dagelijks ja/nee bestaat niet', { type: 'bool', ladder: ['1'] }, /soort/);
addFails('week met getal bestaat niet', { kind: 'weekly' }, /soort/);
addFails('richting ontbreekt', { dir: undefined }, /minimum|maximum/);
addFails('stapgrootte 0', { step: 0 }, /stap/);
addFails('stapgrootte geen getal', { step: 'abc' }, /stap/);
addFails('geen levels', { ladder: [] }, /minstens 1/);
addFails('leeg level', { ladder: ['10', ''] }, /Level 2/);
addFails('level geen getal', { ladder: ['10', 'veel'] }, /Level 2/);
addFails('minimum-doel dat niet stijgt', { ladder: ['20', '10'] }, /moeilijker/);
addFails('gelijke levels', { ladder: ['10', '10'] }, /moeilijker/);
addFails('maximum-doel dat niet daalt', { dir: 'max', ladder: ['10', '20'] }, /moeilijker/);
addFails('negatief doel', { ladder: ['-5', '10'] }, /negatief/);
addFails('te veel levels', { ladder: Array.from({ length: 13 }, (_, i) => String(i + 1)) }, /Maximaal 12/);
addFails('startlevel buiten de levels', { start: 2 }, /startlevel/);
addFails('negatief startlevel', { start: -1 }, /startlevel/);
addFails('tijd-doel dat later wordt', { kind: 'daily', type: 'time', ladder: ['23:00', '23:30'] }, /moeilijker/);
addFails('ongeldige tijd', { kind: 'daily', type: 'time', ladder: ['25:00'] }, /tijd/);
addFails('week: aantal 0', { kind: 'weekly', type: 'bool', ladder: ['0', '2'] }, /1 tot 7/);
addFails('week: aantal 8', { kind: 'weekly', type: 'bool', ladder: ['2', '8'] }, /1 tot 7/);
addFails('week: geen heel aantal', { kind: 'weekly', type: 'bool', ladder: ['1.5', '3'] }, /1 tot 7/);
addFails('week: niet stijgend', { kind: 'weekly', type: 'bool', ladder: ['3', '3'] }, /moeilijker/);

test('komma als decimaalteken werkt (nl): 7,5 wordt 7.5', () => {
  const t = load(TODAY); t.setup(W1, [], 0);
  const r = t.addHabit(Object.assign({}, LEZEN, { name: 'Slaap2', ladder: ['7', '7,5'], step: '0,25' }), CUR);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(r.habit.ladder), '[7,7.5]');
  assert.equal(r.habit.step, 0.25);
});

/* ---- aanpassen: fouten ---- */

const updFails = (name, id, patch, fragment) => test('aanpassen wordt geweigerd: ' + name, () => {
  const t = fresh();
  const before = JSON.stringify(t.state());
  const r = t.updateHabit(id, patch, CUR);
  assert.equal(r.ok, false);
  if (fragment) assert.match(r.error, fragment);
  assert.equal(JSON.stringify(t.state()), before);
});
updFails('onbekende gewoonte', 'bestaat-niet', { name: 'x', ladder: [1] }, /niet gevonden/);
updFails('lege naam', 'water', { name: ' ', ladder: [1.5, 2] }, /naam/);
updFails('levels niet stijgend', 'water', { name: 'Water', ladder: [3, 2] }, /moeilijker/);
updFails('leeg level', 'water', { name: 'Water', ladder: [1.5, ''] }, /Level 2/);
updFails('stapgrootte 0', 'water', { name: 'Water', step: 0, ladder: [1.5, 2] }, /stap/);

test('aanpassen: naam, eenheid en stap wijzigen zonder doelen te veranderen maakt geen doelgeschiedenis', () => {
  const t = fresh();
  const r = t.updateHabit('water', { name: 'Water drinken', unit: 'liter', step: 0.5 }, CUR);
  assert.equal(r.ok, true, r.error);
  const h = t.habitById('water');
  assert.equal(h.name, 'Water drinken');
  assert.equal(h.unit, 'liter');
  assert.equal(h.step, 0.5);
  assert.equal(h.ladderHistory, undefined);
});

test('aanpassen: twee keer in dezelfde week vervangt de wijziging van die week', () => {
  const t = fresh();
  t.updateHabit('water', { name: 'Water', ladder: [3, 4] }, CUR);
  t.updateHabit('water', { name: 'Water', ladder: [2, 5] }, CUR);
  const h = t.habitById('water');
  assert.equal(JSON.stringify(t.ladderAt(h, CUR)), '[2,5]');
  assert.equal(JSON.stringify(t.ladderAt(h, W2)), '[1.5,2,2.5,3]');
  assert.equal(h.ladderHistory.length, 2);
});

/* ---- back-up met de nieuwe velden ---- */

test('back-up: toegevoegde, aangepaste en gestopte gewoontes blijven na terugzetten kloppen', () => {
  const t = fresh();
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);
  t.fill(CUR, 'water', [2]);
  t.addHabit(LEZEN, CUR);
  t.updateHabit('water', { name: 'Water', ladder: [3, 4] }, CUR);
  t.archiveHabit('lezen', CUR);
  const raw = JSON.parse(JSON.stringify(t.buildBackup()));
  const res = check(raw);
  assert.equal(res.ok, true, res.error);
  assert.equal(canon(res.state), canon(JSON.parse(JSON.stringify(t.state()))));
  const other = load(TODAY);
  other.applyState(res.state);
  assert.equal(other.weekScore(W1), 95);
  assert.equal(other.hitOn(other.habitById('water'), CUR), false);
  assert.equal(other.habitById('lezen').archived, true);
});

const bkFails = (name, mutate, fragment) => test('back-up wordt geweigerd: ' + name, () => {
  const t = fresh();
  t.addHabit(LEZEN, CUR);
  t.updateHabit('water', { name: 'Water', ladder: [3, 4] }, CUR);
  const raw = JSON.parse(JSON.stringify(t.buildBackup()));
  mutate(raw.data.habits.find(h => h.id === 'water'), raw.data.habits.find(h => h.id === 'lezen'));
  const res = check(raw);
  assert.equal(res.ok, false);
  assert.match(res.error, fragment);
});
bkFails('archived geen boolean', (w, l) => { l.archived = 'ja'; }, /status/);
bkFails('activity leeg', (w, l) => { l.activity = []; }, /actief-geschiedenis/);
bkFails('activity met tekst', (w, l) => { l.activity = [['2026-10-26', 'aan']]; }, /actief-geschiedenis/);
bkFails('ladderHistory met ongeldig level', (w) => { w.ladderHistory = [['0000-00-00', [1.5, 'x']]]; }, /eerdere levels/);
bkFails('ladderHistory met ongeldige datum', (w) => { w.ladderHistory = [['gisteren', [1.5]]]; }, /levelgeschiedenis van doelen/);

/* ================= Overzicht op de Dag-tab: level-up-hint en kaarten ================= */

test('level-up-hint, huidige week: eerst 2 weken op rij, daarna "haal deze week"', () => {
  const t = fresh();
  const h = t.habitById('water');
  assert.equal(t.levelHint(h, CUR).lvl, '2 weken op rij → LV 2');
  t.fill(W2, 'water', PASS_WATER);                          // vorige week gehaald op hetzelfde level
  const hint = t.levelHint(h, CUR);
  assert.equal(hint.lvl, 'Haal deze week → LV 2');
  assert.equal(hint.cls, 'next');
});

test('level-up-hint, afgelopen weken: gehaald (1 van 2), level up of niet gehaald', () => {
  const t = fresh();
  const h = t.habitById('water');
  t.fill(W2, 'water', PASS_WATER);
  assert.equal(t.levelHint(h, W2).lvl, 'Gehaald (1 van 2)');
  t.fill(W1, 'water', PASS_WATER);
  assert.equal(t.levelHint(h, W2).lvl, 'Gehaald → level up');
  const t2 = fresh();
  assert.equal(t2.levelHint(t2.habitById('water'), W2).lvl, 'Niet gehaald');
});

test('level-up-hint: op het hoogste level staat "Max level bereikt"', () => {
  const t = fresh(3);                                       // laatste level van water
  assert.equal(t.levelHint(t.habitById('water'), CUR).lvl, 'Max level bereikt');
});

test('level-up-hint: een gestopte vorige week telt niet als "op rij"', () => {
  const t = fresh();
  const h = t.habitById('water');
  t.fill(W2, 'water', PASS_WATER);
  t.setActive(h, W2, false);
  t.setActive(h, CUR, true);
  assert.equal(t.levelHint(h, CUR).lvl, '2 weken op rij → LV 2');
});

test('overzicht: toont score, record en je week per gewoonte', () => {
  const t = fresh();
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, 2]);               // record 95
  t.fill(CUR, 'water', [2, 2, 2, 2]);                       // 4 dagen = 40
  const html = t.renderOverview(TODAY);
  assert.match(html, /Deze week/);
  assert.match(html, /40 punten/);
  assert.match(html, /Nog 55 punten tot je record \(95\)/);
  assert.match(html, /width:42%/);                          // 40 van 95
  assert.match(html, /Water gedronken/);
  assert.match(html, />4\/6</);
});

test('overzicht: balk loopt niet over 100% en wordt goud boven je record', () => {
  const t = fresh();
  t.fill(W1, 'water', [2, 2, 2, 2, 2, 2, null]);            // 85
  t.fill(CUR, 'water', [2, 2, 2, 2, 2, 2, 2]);              // 95
  const html = t.renderOverview(TODAY);
  assert.match(html, /meter over/);
  assert.match(html, /width:100%/);
  assert.match(html, /Je zit boven je record/);
});

test('gisteren-kaart: toont je voornemen, maakt tekst veilig en verdwijnt zonder tekst', () => {
  const t = fresh();
  assert.equal(t.yesterdayCard(TODAY), '');
  t.ensureEntry('2026-10-27').better = 'Eerder naar bed <b>echt</b>';
  const html = t.yesterdayCard(TODAY);
  assert.match(html, /Dit nam je je voor/);
  assert.match(html, /Eerder naar bed &lt;b&gt;echt&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>echt/);
});
