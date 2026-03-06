import { useState, useEffect } from "react";

const INTERVAL_MAP = { 1: 2, 2: 5, 3: 10, 4: 21, 5: 45 };
const GIG_MULT = { high: 1.4, medium: 1.0, low: 0.7 };
const BAND_PASSWORD = "retroactive";
const REHEARSAL_SIZE = 25;
const CONFIDENCE_LABELS = { 1: "Shaky", 2: "Uncertain", 3: "Okay", 4: "Confident", 5: "Locked In" };

const STATUS_CFG = {
  critical: { label: "OVERDUE", color: "#ff4444", bg: "rgba(255,68,68,0.12)", border: "rgba(255,68,68,0.4)" },
  due:      { label: "DUE NOW", color: "#ff9500", bg: "rgba(255,149,0,0.12)",  border: "rgba(255,149,0,0.4)" },
  soon:     { label: "SOON",    color: "#ffd60a", bg: "rgba(255,214,10,0.10)", border: "rgba(255,214,10,0.3)" },
  good:     { label: "SOLID",   color: "#30d158", bg: "rgba(48,209,88,0.10)",  border: "rgba(48,209,88,0.25)" },
};

const DEMO_SONGS = [
  { id: 1,  title: "Wonderwall",              artist: "Oasis",           gigFrequency: "high",   difficulty: 2 },
  { id: 2,  title: "Don't Look Back in Anger", artist: "Oasis",          gigFrequency: "high",   difficulty: 2 },
  { id: 3,  title: "Live Forever",             artist: "Oasis",           gigFrequency: "medium", difficulty: 3 },
  { id: 4,  title: "I Wanna Be Adored",        artist: "The Stone Roses", gigFrequency: "medium", difficulty: 3 },
  { id: 5,  title: "She Bangs the Drums",      artist: "The Stone Roses", gigFrequency: "high",   difficulty: 2 },
  { id: 6,  title: "Waterfall",                artist: "The Stone Roses", gigFrequency: "low",    difficulty: 4 },
  { id: 7,  title: "R U Mine?",                artist: "Arctic Monkeys",  gigFrequency: "high",   difficulty: 3 },
  { id: 8,  title: "505",                      artist: "Arctic Monkeys",  gigFrequency: "medium", difficulty: 3 },
  { id: 9,  title: "Do I Wanna Know?",         artist: "Arctic Monkeys",  gigFrequency: "high",   difficulty: 2 },
  { id: 10, title: "Dakota",                   artist: "Stereophonics",   gigFrequency: "low",    difficulty: 3 },
  { id: 11, title: "Have a Nice Day",          artist: "Stereophonics",   gigFrequency: "medium", difficulty: 2 },
  { id: 12, title: "Mr. Writer",               artist: "Stereophonics",   gigFrequency: "low",    difficulty: 4 },
];

function calcUrgency(last, conf, freq) {
  return last - INTERVAL_MAP[conf] * GIG_MULT[freq];
}

function calcStatus(last, conf, freq) {
  const u = calcUrgency(last, conf, freq);
  if (u >= 10) return "critical";
  if (u >= 0)  return "due";
  if (u >= -7) return "soon";
  return "good";
}

function calcDaysUntil(last, conf, freq) {
  return Math.round(INTERVAL_MAP[conf] * GIG_MULT[freq] - last);
}

function avgRatings(ratings) {
  const vals = Object.values(ratings || {});
  if (!vals.length) return 3;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(function(l) { return l.trim(); });
  if (lines.length < 2) return { error: "Needs a header row and at least one song." };
  const header = lines[0].split(",").map(function(h) { return h.trim().toLowerCase().replace(/[^a-z]/g, ""); });
  function findCol(terms) {
    return header.findIndex(function(h) { return terms.some(function(t) { return h.includes(t); }); });
  }
  const cols = {
    title: findCol(["title"]),
    artist: findCol(["artist"]),
    confidence: findCol(["conf"]),
    gigFrequency: findCol(["gig", "freq"]),
    difficulty: findCol(["diff"]),
  };
  if (cols.title === -1 || cols.artist === -1) return { error: "Columns 'Title' and 'Artist' are required." };
  const songs = [];
  const errors = [];
  lines.slice(1).forEach(function(line, i) {
    const c = line.split(",").map(function(v) { return v.trim().replace(/^"|"$/g, ""); });
    const title = c[cols.title];
    const artist = c[cols.artist];
    if (!title || !artist) { errors.push("Row " + (i + 2) + ": missing title/artist"); return; }
    const rawConf = parseInt(c[cols.confidence]);
    const confidence = (rawConf >= 1 && rawConf <= 5) ? rawConf : 3;
    const rawFreq = cols.gigFrequency >= 0 ? (c[cols.gigFrequency] || "").toLowerCase() : "";
    const gigFrequency = ["low", "medium", "high"].includes(rawFreq) ? rawFreq : "medium";
    const rawDiff = parseInt(c[cols.difficulty]);
    const difficulty = (rawDiff >= 1 && rawDiff <= 5) ? rawDiff : 3;
    songs.push({ id: Date.now() + i + Math.random(), title: title, artist: artist, gigFrequency: gigFrequency, difficulty: difficulty, initConf: confidence });
  });
  if (!songs.length) return { error: "No valid songs found." };
  return { songs: songs, errors: errors };
}

function Modal(props) {
  return (
    <div
      onClick={props.onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
    >
      <div
        onClick={function(e) { e.stopPropagation(); }}
        style={{ background: "#111114", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 24, width: "100%", maxWidth: props.wide ? 560 : 420, boxShadow: "0 20px 60px rgba(0,0,0,0.7)", maxHeight: "90vh", overflowY: "auto" }}
      >
        {props.children}
      </div>
    </div>
  );
}

function Btn(props) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      style={{
        background: props.bg || "#1a1a1e",
        color: props.color || "#ccc",
        border: "1px solid " + (props.color || "#ccc") + "33",
        borderRadius: 6,
        padding: props.small ? "5px 10px" : "8px 14px",
        fontSize: props.small ? 9 : 10,
        letterSpacing: 2,
        cursor: props.disabled ? "default" : "pointer",
        fontFamily: "inherit",
        opacity: props.disabled ? 0.4 : 1,
        flex: props.flex || undefined,
        width: props.full ? "100%" : undefined,
        transition: "all 0.15s",
      }}
    >
      {props.children}
    </button>
  );
}

function SongCard(props) {
  const song = props.song;
  const mode = props.mode;
  const conf = mode === "personal" ? (song.pConf || 3) : avgRatings(song.bRatings);
  const last = mode === "personal" ? (song.pLast != null ? song.pLast : 999) : (song.bLast != null ? song.bLast : 999);
  const st = calcStatus(last, conf, song.gigFrequency);
  const cfg = STATUS_CFG[st];
  const due = calcDaysUntil(last, conf, song.gigFrequency);

  return (
    <div style={{ background: cfg.bg, border: "1px solid " + cfg.border, borderRadius: 8, padding: "13px 16px", display: "flex", alignItems: "center", gap: 14 }}>
      {props.rank != null && (
        <div style={{ fontSize: 11, color: "#888", minWidth: 24, textAlign: "right", flexShrink: 0 }}>{"#" + props.rank}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{song.title}</span>
          <span style={{ fontSize: 8, letterSpacing: 2, color: cfg.color, background: cfg.color + "22", border: "1px solid " + cfg.color + "44", padding: "2px 6px", borderRadius: 3 }}>{cfg.label}</span>
        </div>
        <div style={{ fontSize: 10, color: "#bbb", marginTop: 3 }}>
          {song.artist}
          {" · "}
          {last >= 999 ? "never practiced" : last === 0 ? "today" : last + "d ago"}
          {" · "}
          {due <= 0
            ? <span style={{ color: cfg.color }}>{Math.abs(due)}d overdue</span>
            : <span>{"due in " + due + "d"}</span>
          }
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "#aaa", marginBottom: 4 }}>CONF</div>
          <div style={{ display: "flex", gap: 2 }}>
            {[1,2,3,4,5].map(function(n) {
              return <div key={n} style={{ width: 5, height: 16, borderRadius: 2, background: n <= conf ? "#ff9500" : "rgba(255,255,255,0.08)" }} />;
            })}
          </div>
        </div>
        <button
          onClick={props.onLog}
          style={{ background: "rgba(255,149,0,0.15)", border: "1px solid rgba(255,149,0,0.35)", color: "#ff9500", borderRadius: 6, padding: "7px 11px", fontSize: 9, letterSpacing: 2, cursor: "pointer" }}
        >
          LOG
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [songs, setSongs] = useState(function() { return lsGet("ra_songs", DEMO_SONGS); });
  const [personal, setPersonal] = useState(function() { return lsGet("ra_personal", {}); });
  const [band, setBand] = useState(function() { return lsGet("ra_band", {}); });
  const [personalLog, setPersonalLog] = useState(function() { return lsGet("ra_plog", []); });
  const [bandLog, setBandLog] = useState(function() { return lsGet("ra_blog", []); });
  const [memberName, setMemberName] = useState(function() { return lsGet("ra_member", ""); });

  const [mode, setMode] = useState("personal");
  const [bandUnlocked, setBandUnlocked] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  const [activeView, setActiveView] = useState("queue");
  const [filterStatus, setFilterStatus] = useState("all");

  const [logModal, setLogModal] = useState(null);
  const [newConf, setNewConf] = useState(3);

  const [addModal, setAddModal] = useState(false);
  const [newSongForm, setNewSongForm] = useState({ title: "", artist: "", gigFrequency: "medium", difficulty: 3 });

  const [importModal, setImportModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState("");

  const [toast, setToast] = useState(null);

  useEffect(function() { lsSet("ra_songs", songs); }, [songs]);
  useEffect(function() { lsSet("ra_personal", personal); }, [personal]);
  useEffect(function() { lsSet("ra_band", band); }, [band]);
  useEffect(function() { lsSet("ra_plog", personalLog); }, [personalLog]);
  useEffect(function() { lsSet("ra_blog", bandLog); }, [bandLog]);
  useEffect(function() { lsSet("ra_member", memberName); }, [memberName]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(function() { setToast(null); }, 2800);
  }

  var enriched = songs.map(function(s) {
    var p = personal[s.id] || {};
    var b = band[s.id] || {};
    var pConf = p.confidence != null ? p.confidence : 3;
    var pLast = p.lastPracticed != null ? p.lastPracticed : 999;
    var bRatings = b.ratings || {};
    var bConf = avgRatings(bRatings);
    var bLast = b.lastPracticed != null ? b.lastPracticed : 999;
    var conf = mode === "personal" ? pConf : bConf;
    var last = mode === "personal" ? pLast : bLast;
    return Object.assign({}, s, {
      pConf: pConf, pLast: pLast,
      bRatings: bRatings, bConf: bConf, bLast: bLast,
      _urgency: calcUrgency(last, conf, s.gigFrequency),
      _status: calcStatus(last, conf, s.gigFrequency),
    });
  }).sort(function(a, b) { return b._urgency - a._urgency; });

  var queueSongs = enriched.slice(0, 8);
  var filtered = filterStatus === "all" ? enriched : enriched.filter(function(s) { return s._status === filterStatus; });

  var stats = {
    total: songs.length,
    critical: enriched.filter(function(s) { return s._status === "critical"; }).length,
    due: enriched.filter(function(s) { return s._status === "due"; }).length,
    good: enriched.filter(function(s) { return s._status === "good"; }).length,
  };

  var weeklyPriority = enriched
    .filter(function(s) { return s._status === "critical" || s._status === "due"; })
    .slice(0, 15);

  var rehearsalSetlist = enriched.map(function(s) {
    var gigScore = s.gigFrequency === "high" ? 3 : s.gigFrequency === "medium" ? 2 : 1;
    var urgScore = Math.max(0, s._urgency);
    var conf = mode === "personal" ? s.pConf : s.bConf;
    var confPen = (5 - conf) * 2;
    return Object.assign({}, s, { _score: gigScore * 3 + urgScore + confPen });
  }).sort(function(a, b) { return b._score - a._score; }).slice(0, REHEARSAL_SIZE);

  function openLog(song) {
    var conf = mode === "personal" ? (personal[song.id] ? personal[song.id].confidence : 3) : 3;
    setNewConf(conf);
    setLogModal(song);
  }

  function logPractice() {
    if (mode === "personal") {
      setPersonal(function(prev) {
        var next = Object.assign({}, prev);
        next[logModal.id] = { confidence: newConf, lastPracticed: 0 };
        return next;
      });
      setPersonalLog(function(prev) {
        return [{ title: logModal.title, artist: logModal.artist, confidence: newConf, date: new Date().toLocaleDateString("en-GB") }].concat(prev.slice(0, 49));
      });
      showToast("Logged — " + logModal.title);
    } else {
      var name = memberName.trim() || "Unknown";
      setBand(function(prev) {
        var next = Object.assign({}, prev);
        var prevEntry = prev[logModal.id] || { ratings: {}, lastPracticed: 999 };
        var newRatings = Object.assign({}, prevEntry.ratings);
        newRatings[name] = newConf;
        next[logModal.id] = { ratings: newRatings, lastPracticed: 0 };
        return next;
      });
      setBandLog(function(prev) {
        return [{ title: logModal.title, artist: logModal.artist, member: name, confidence: newConf, date: new Date().toLocaleDateString("en-GB") }].concat(prev.slice(0, 49));
      });
      showToast("Band logged — " + logModal.title + " by " + name);
    }
    setLogModal(null);
  }

  function logGig() {
    var gigSongs = songs.filter(function(s) { return s.gigFrequency === "high"; });
    if (mode === "personal") {
      setPersonal(function(prev) {
        var next = Object.assign({}, prev);
        gigSongs.forEach(function(s) {
          var cur = prev[s.id] ? prev[s.id].confidence : 3;
          next[s.id] = { confidence: Math.min(5, cur + 1), lastPracticed: 0 };
        });
        return next;
      });
    } else {
      var name = memberName.trim() || "Unknown";
      setBand(function(prev) {
        var next = Object.assign({}, prev);
        gigSongs.forEach(function(s) {
          var prevEntry = prev[s.id] || { ratings: {}, lastPracticed: 999 };
          var cur = avgRatings(prevEntry.ratings);
          var newRatings = Object.assign({}, prevEntry.ratings);
          newRatings[name] = Math.min(5, cur + 1);
          next[s.id] = { ratings: newRatings, lastPracticed: 0 };
        });
        return next;
      });
    }
    showToast("Gig logged — " + gigSongs.length + " songs updated");
  }

  function addSong() {
    if (!newSongForm.title || !newSongForm.artist) return;
    var id = Date.now();
    setSongs(function(prev) { return prev.concat([Object.assign({ id: id }, newSongForm)]); });
    setAddModal(false);
    setNewSongForm({ title: "", artist: "", gigFrequency: "medium", difficulty: 3 });
    showToast("Added " + newSongForm.title);
  }

  function handleFile(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var result = parseCSV(ev.target.result);
      if (result.error) { setImportError(result.error); setImportPreview(null); }
      else { setImportPreview(result); setImportError(""); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handlePasteParse() {
    var result = parseCSV(pasteText);
    if (result.error) { setImportError(result.error); setImportPreview(null); }
    else { setImportPreview(result); setImportError(""); }
  }

  function confirmImport() {
    var newSongs = importPreview.songs.map(function(s, i) {
      return Object.assign({}, s, { id: Date.now() + i });
    });
    setSongs(newSongs);
    var newPersonal = {};
    importPreview.songs.forEach(function(s, i) {
      if (s.initConf) newPersonal[newSongs[i].id] = { confidence: s.initConf, lastPracticed: 999 };
    });
    setPersonal(newPersonal);
    setBand({});
    setImportModal(false);
    setImportPreview(null);
    setPasteText("");
    setImportError("");
    showToast("Imported " + newSongs.length + " songs");
  }

  function downloadTemplate() {
    var csv = "Title,Artist,Confidence (1-5),Gig Frequency (low/medium/high),Difficulty (1-5)\nWonderwall,Oasis,4,high,2\nDakota,Stereophonics,2,low,3\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "retro-active-template.csv";
    a.click();
  }

  function tryUnlock() {
    if (pwInput === BAND_PASSWORD) {
      setBandUnlocked(true);
      setMode("band");
      setShowPwModal(false);
      setPwInput("");
      setPwError(false);
      setActiveView("queue");
    } else {
      setPwError(true);
    }
  }

  function switchMode(m) {
    if (m === "band" && !bandUnlocked) {
      setShowPwModal(true);
    } else {
      setMode(m);
      setActiveView("queue");
    }
  }

  var inputStyle = {
    width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6, padding: "10px 12px", color: "#f0f0f0", fontSize: 13,
    fontFamily: "'Inter','Segoe UI',sans-serif", outline: "none", boxSizing: "border-box",
  };

  var labelStyle = { fontSize: 9, letterSpacing: 3, color: "#bbb", marginBottom: 6, display: "block" };

  var activeLog = mode === "personal" ? personalLog : bandLog;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#f0f0f0", fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10, background: "rgba(10,10,12,0.97)", backdropFilter: "blur(12px)", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 4, color: "#aaa", marginBottom: 2 }}>THE RETRO ACTIVE</div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>PRACTICE<span style={{ color: "#ff9500" }}>.</span>LOG</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 7, padding: 3, gap: 2, border: "1px solid rgba(255,255,255,0.09)" }}>
            {["personal", "band"].map(function(m) {
              return (
                <button key={m} onClick={function() { switchMode(m); }} style={{ background: mode === m ? "#ff9500" : "transparent", color: mode === m ? "#000" : "#ccc", border: "none", borderRadius: 5, padding: "5px 12px", fontSize: 9, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit", fontWeight: mode === m ? 700 : 400 }}>
                  {m === "personal" ? "PERSONAL" : "BAND"}
                </button>
              );
            })}
          </div>
          <Btn onClick={downloadTemplate} small>TEMPLATE</Btn>
          <Btn onClick={function() { setImportModal(true); setImportPreview(null); setPasteText(""); setImportError(""); }} small>IMPORT</Btn>
          <Btn onClick={function() { setAddModal(true); }} small color="#ff9500">+ SONG</Btn>
          <Btn onClick={logGig} small bg="#ff9500" color="#000">LOG GIG</Btn>
        </div>
      </div>

      {/* Band member bar */}
      {mode === "band" && bandUnlocked && (
        <div style={{ background: "rgba(255,149,0,0.07)", borderBottom: "1px solid rgba(255,149,0,0.2)", padding: "8px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "#ff9500", letterSpacing: 2, flexShrink: 0 }}>LOGGING AS:</span>
          <input value={memberName} onChange={function(e) { setMemberName(e.target.value); }} placeholder="Enter your name..." style={Object.assign({}, inputStyle, { width: 200, padding: "4px 10px", fontSize: 12 })} />
          <span style={{ fontSize: 10, color: "#aaa" }}>Ratings are averaged across all members</span>
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        {[["SONGS", stats.total, "#ccc"], ["OVERDUE", stats.critical, "#ff4444"], ["DUE NOW", stats.due, "#ff9500"], ["SOLID", stats.good, "#30d158"]].map(function(item, i) {
          return (
            <div key={i} style={{ padding: "11px 0", textAlign: "center", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: item[2] }}>{item[1]}</div>
              <div style={{ fontSize: 9, letterSpacing: 3, color: "#aaa", marginTop: 2 }}>{item[0]}</div>
            </div>
          );
        })}
      </div>

      {/* Nav */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px" }}>
        {[["queue", "QUEUE"], ["library", "LIBRARY"], ["planner", "WEEKLY PLAN"], ["log", "LOG"]].map(function(item) {
          return (
            <button key={item[0]} onClick={function() { setActiveView(item[0]); }} style={{ background: "none", border: "none", color: activeView === item[0] ? "#ff9500" : "#aaa", padding: "13px 14px", fontSize: 10, letterSpacing: 3, cursor: "pointer", borderBottom: activeView === item[0] ? "2px solid #ff9500" : "2px solid transparent", fontFamily: "inherit" }}>
              {item[1]}
            </button>
          );
        })}
      </div>

      {/* Views */}
      <div style={{ padding: "18px 20px" }}>

        {activeView === "queue" && (
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", marginBottom: 14 }}>
              {mode === "personal" ? "YOUR" : "BAND"} PRIORITY PRACTICE — TOP 8
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {queueSongs.map(function(s, i) {
                return <SongCard key={s.id} song={s} rank={i + 1} mode={mode} onLog={function() { openLog(s); }} />;
              })}
            </div>
          </div>
        )}

        {activeView === "library" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              {["all", "critical", "due", "soon", "good"].map(function(f) {
                return (
                  <Btn key={f} onClick={function() { setFilterStatus(f); }} small bg={filterStatus === f ? "#ff9500" : "#1a1a1e"} color={filterStatus === f ? "#000" : "#ccc"}>
                    {f.toUpperCase()}
                  </Btn>
                );
              })}
              <span style={{ fontSize: 10, color: "#aaa", marginLeft: 4 }}>{filtered.length} songs</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {filtered.map(function(s) {
                return <SongCard key={s.id} song={s} mode={mode} onLog={function() { openLog(s); }} />;
              })}
            </div>
          </div>
        )}

        {activeView === "planner" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#ff4444", marginBottom: 12 }}>NEEDS WORK — PRIORITY PRACTICE</div>
              {weeklyPriority.length === 0
                ? <div style={{ color: "#aaa", fontSize: 13, padding: "16px 0" }}>All songs are in good shape</div>
                : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {weeklyPriority.map(function(s, i) {
                      return <SongCard key={s.id} song={s} rank={i + 1} mode={mode} onLog={function() { openLog(s); }} />;
                    })}
                  </div>
                )
              }
            </div>
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 24 }} />
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#30d158", marginBottom: 4 }}>SUGGESTED REHEARSAL SETLIST — {REHEARSAL_SIZE} SONGS</div>
              <div style={{ fontSize: 10, color: "#aaa", marginBottom: 14 }}>Weighted by gig frequency, urgency and confidence</div>
              <div style={{ display: "grid", gap: 6 }}>
                {rehearsalSetlist.map(function(s, i) {
                  var cfg = STATUS_CFG[s._status];
                  var freqColor = s.gigFrequency === "high" ? "#ff9500" : s.gigFrequency === "medium" ? "#ffd60a" : "#aaa";
                  return (
                    <div key={s.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: "11px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 11, color: "#555", minWidth: 26, textAlign: "right" }}>{"#" + (i + 1)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</div>
                        <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>{s.artist}</div>
                      </div>
                      <span style={{ fontSize: 8, letterSpacing: 2, color: cfg.color, background: cfg.color + "22", border: "1px solid " + cfg.color + "44", padding: "2px 6px", borderRadius: 3 }}>{cfg.label}</span>
                      <span style={{ fontSize: 9, color: freqColor, letterSpacing: 1 }}>{s.gigFrequency.toUpperCase()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeView === "log" && (
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", marginBottom: 14 }}>
              {mode === "personal" ? "YOUR" : "BAND"} SESSION LOG
            </div>
            {activeLog.length === 0
              ? <div style={{ color: "#aaa", textAlign: "center", padding: "40px 0", fontSize: 13 }}>No sessions logged yet.</div>
              : (
                <div style={{ display: "grid", gap: 6 }}>
                  {activeLog.map(function(e, i) {
                    return (
                      <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{e.title}</div>
                          <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>
                            {e.artist}{e.member ? " · " + e.member : ""} · {e.date}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 9, color: "#aaa", letterSpacing: 2 }}>CONFIDENCE</div>
                          <div style={{ color: "#ff9500", fontWeight: 700, fontSize: 12 }}>{e.confidence}/5 — {CONFIDENCE_LABELS[e.confidence]}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}
      </div>

      {/* Password Modal */}
      {showPwModal && (
        <Modal onClose={function() { setShowPwModal(false); setPwInput(""); setPwError(false); }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Band Mode</div>
            <div style={{ fontSize: 11, color: "#aaa", marginBottom: 20 }}>Enter the band password to access shared data</div>
            <input
              type="password"
              value={pwInput}
              onChange={function(e) { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={function(e) { if (e.key === "Enter") tryUnlock(); }}
              placeholder="Password"
              style={Object.assign({}, inputStyle, { textAlign: "center", marginBottom: 10 })}
            />
            {pwError && <div style={{ color: "#ff4444", fontSize: 11, marginBottom: 10 }}>Incorrect password</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={function() { setShowPwModal(false); setPwInput(""); setPwError(false); }} flex={1}>CANCEL</Btn>
              <Btn onClick={tryUnlock} bg="#ff9500" color="#000" flex={2}>UNLOCK</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Log Practice Modal */}
      {logModal && (
        <Modal onClose={function() { setLogModal(null); }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", marginBottom: 8 }}>
            {mode === "personal" ? "PERSONAL" : "BAND"} SESSION
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 3 }}>{logModal.title}</div>
          <div style={{ fontSize: 12, color: "#bbb", marginBottom: 20 }}>{logModal.artist}</div>
          {mode === "band" && (
            <div style={{ marginBottom: 16 }}>
              <span style={labelStyle}>LOGGING AS</span>
              <input value={memberName} onChange={function(e) { setMemberName(e.target.value); }} placeholder="Your name" style={inputStyle} />
            </div>
          )}
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", marginBottom: 10 }}>HOW DID IT FEEL?</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 16 }}>
            {[1,2,3,4,5].map(function(n) {
              return (
                <button key={n} onClick={function() { setNewConf(n); }} style={{ background: newConf === n ? "#ff9500" : "rgba(255,255,255,0.05)", border: "1px solid " + (newConf === n ? "#ff9500" : "rgba(255,255,255,0.1)"), borderRadius: 6, padding: "9px 4px", cursor: "pointer", color: newConf === n ? "#000" : "#ddd", fontFamily: "inherit" }}>
                  <div style={{ fontSize: 17, marginBottom: 3 }}>{n}</div>
                  <div style={{ fontSize: 8, letterSpacing: 1 }}>{CONFIDENCE_LABELS[n].toUpperCase()}</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#bbb", marginBottom: 20, textAlign: "center" }}>
            Next review in{" "}
            <span style={{ color: "#ff9500" }}>{Math.round(INTERVAL_MAP[newConf] * GIG_MULT[logModal.gigFrequency])} days</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={function() { setLogModal(null); }} flex={1}>CANCEL</Btn>
            <Btn onClick={logPractice} bg="#ff9500" color="#000" flex={2}>SAVE</Btn>
          </div>
        </Modal>
      )}

      {/* Add Song Modal */}
      {addModal && (
        <Modal onClose={function() { setAddModal(false); }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", marginBottom: 18 }}>ADD SONG</div>
          {[["TITLE", "title", "e.g. Champagne Supernova"], ["ARTIST", "artist", "e.g. Oasis"]].map(function(item) {
            return (
              <div key={item[1]} style={{ marginBottom: 12 }}>
                <span style={labelStyle}>{item[0]}</span>
                <input
                  value={newSongForm[item[1]]}
                  onChange={function(e) {
                    var key = item[1];
                    var val = e.target.value;
                    setNewSongForm(function(prev) { return Object.assign({}, prev, { [key]: val }); });
                  }}
                  placeholder={item[2]}
                  style={inputStyle}
                />
              </div>
            );
          })}
          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>GIG FREQUENCY</span>
            <div style={{ display: "flex", gap: 6 }}>
              {["low", "medium", "high"].map(function(f) {
                return (
                  <Btn key={f} onClick={function() { setNewSongForm(function(prev) { return Object.assign({}, prev, { gigFrequency: f }); }); }} small bg={newSongForm.gigFrequency === f ? "#ff9500" : "#1a1a1e"} color={newSongForm.gigFrequency === f ? "#000" : "#ccc"} flex={1}>
                    {f.toUpperCase()}
                  </Btn>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <Btn onClick={function() { setAddModal(false); }} flex={1}>CANCEL</Btn>
            <Btn onClick={addSong} bg="#ff9500" color="#000" flex={2}>ADD</Btn>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {importModal && (
        <Modal onClose={function() { setImportModal(false); }} wide>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", marginBottom: 16 }}>BULK IMPORT SONGS</div>
          {!importPreview ? (
            <div>
              <label style={{ display: "block", border: "2px dashed rgba(255,149,0,0.3)", borderRadius: 8, padding: 18, textAlign: "center", cursor: "pointer", marginBottom: 12, background: "rgba(255,149,0,0.04)" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>📂</div>
                <div style={{ fontSize: 12, color: "#ddd", marginBottom: 3 }}>Click to upload a CSV file</div>
                <div style={{ fontSize: 10, color: "#aaa" }}>Exported from Excel or Google Sheets</div>
                <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: "none" }} />
              </label>
              <div style={{ textAlign: "center", color: "#666", fontSize: 11, marginBottom: 10 }}>— or paste directly from Excel —</div>
              <textarea
                value={pasteText}
                onChange={function(e) { setPasteText(e.target.value); setImportError(""); setImportPreview(null); }}
                placeholder={"Title,Artist,Confidence,Gig Frequency,Difficulty\nWonderwall,Oasis,4,high,2"}
                rows={5}
                style={Object.assign({}, inputStyle, { fontFamily: "monospace", fontSize: 11, resize: "vertical", marginBottom: 8 })}
              />
              {importError && (
                <div style={{ color: "#ff4444", fontSize: 11, marginBottom: 10, padding: "8px 12px", background: "rgba(255,68,68,0.1)", borderRadius: 6 }}>
                  {importError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <Btn onClick={function() { setImportModal(false); }} flex={1}>CANCEL</Btn>
                <Btn onClick={handlePasteParse} disabled={!pasteText.trim()} bg={pasteText.trim() ? "#ff9500" : "#2a2a2e"} color={pasteText.trim() ? "#000" : "#555"} flex={2}>PREVIEW</Btn>
              </div>
              <Btn onClick={downloadTemplate} full>DOWNLOAD BLANK TEMPLATE</Btn>
            </div>
          ) : (
            <div>
              <div style={{ background: "rgba(48,209,88,0.1)", border: "1px solid rgba(48,209,88,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ color: "#30d158", fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{importPreview.songs.length + " songs ready to import"}</div>
                {importPreview.errors && importPreview.errors.length > 0 && (
                  <div style={{ color: "#ffd60a", fontSize: 10, marginTop: 4 }}>{importPreview.errors.length + " rows skipped — " + importPreview.errors[0]}</div>
                )}
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}>
                {importPreview.songs.slice(0, 30).map(function(s, i) {
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 11 }}>
                      <span>
                        <span style={{ fontWeight: 700 }}>{s.title}</span>
                        <span style={{ color: "#aaa", marginLeft: 8 }}>{s.artist}</span>
                      </span>
                      <span style={{ color: "#ff9500", fontSize: 10 }}>{"Conf " + (s.initConf || 3) + " · " + s.gigFrequency}</span>
                    </div>
                  );
                })}
                {importPreview.songs.length > 30 && (
                  <div style={{ padding: "6px 12px", color: "#aaa", fontSize: 10, textAlign: "center" }}>{"...and " + (importPreview.songs.length - 30) + " more"}</div>
                )}
              </div>
              <div style={{ color: "#ff4444", fontSize: 10, marginBottom: 12, textAlign: "center" }}>This will replace all existing songs and reset band data</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={function() { setImportPreview(null); setImportError(""); }} flex={1}>BACK</Btn>
                <Btn onClick={confirmImport} bg="#ff9500" color="#000" flex={2}>CONFIRM IMPORT</Btn>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1e", border: "1px solid rgba(255,149,0,0.4)", color: "#ff9500", padding: "10px 20px", borderRadius: 6, fontSize: 11, letterSpacing: 2, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

    </div>
  );
}
