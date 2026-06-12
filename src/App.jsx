import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from './firebase'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DOC_ID       = 'lemans-2024'
const TEAM_PALETTE = ['#39FF14','#00CFFF','#FF4560','#FFD700','#BB86FC','#FF8C00','#00FFD1','#FF69B4']
const DRV_PALETTE  = ['#39FF14','#00CFFF','#FF4560','#FFD700','#BB86FC','#FF8C00','#00FFD1','#FF69B4','#40E0D0','#FFA07A']

const PHASE_META = {
  day:   { label:'☀️ Dia',          rowBg:'#09140a', badgeBg:'#162600', badgeColor:'#70e828', badgeBorder:'#264000', text:'Dia'       },
  night: { label:'🌙 Noite',        rowBg:'#070c12', badgeBg:'#00102a', badgeColor:'#4888f0', badgeBorder:'#002860', text:'Noite'     },
  dawn:  { label:'🌅 Madrugada',    rowBg:'#0c0c07', badgeBg:'#2a1600', badgeColor:'#f08828', badgeBorder:'#482800', text:'Madrugada' },
  final: { label:'🏁 Sprint Final', rowBg:'#0c1000', badgeBg:'#2a1e00', badgeColor:'#f0d838', badgeBorder:'#503800', text:'Final'     },
}

let _seq = Date.now()
const uid = () => String(++_seq)

// ─── TIME HELPERS ─────────────────────────────────────────────────────────────
const pad2 = n => String(Math.floor(n)).padStart(2,'0')

function addMins(t, m) {
  const [h,mn] = t.split(':').map(Number)
  const tot = h*60 + mn + m
  return pad2(Math.floor(tot/60)%24) + ':' + pad2(tot%60)
}

function raceLabel(m) {
  return 'H+' + pad2(Math.floor(m/60)) + (m%60 ? ':'+pad2(m%60) : '')
}

function getPhase(raceH, cfg) {
  if (raceH >= cfg.finalAt) return 'final'
  if (raceH >= cfg.dawnAt)  return 'dawn'
  if (raceH >= cfg.nightAt) return 'night'
  return 'day'
}

// ─── DEFAULTS ────────────────────────────────────────────────────────────────
const mkDriver = (name, color, reserve=false) => ({ id:uid(), name, color, reserve, availability:[] })
const mkTeam = (name, color, carNum) => ({
  id:uid(), name, color, carNum,
  drivers:[
    mkDriver('DRIVER A', DRV_PALETTE[0]),
    mkDriver('DRIVER B', DRV_PALETTE[1]),
    mkDriver('DRIVER C', DRV_PALETTE[2]),
    mkDriver('DRIVER D', DRV_PALETTE[3]),
    mkDriver('DRIVER E', DRV_PALETTE[4], true),
  ],
  overrides:{},
})

const DEFAULT_STATE = {
  race:{ startTime:'15:00', durationH:24, stintMin:60, nightAt:6, dawnAt:14, finalAt:20 },
  teams:[ mkTeam('STORMLINE TEAM','#39FF14','64') ],
}

// ─── COMPUTE STINTS ───────────────────────────────────────────────────────────
function computeStints(team, race) {
  const total = Math.floor((race.durationH*60) / race.stintMin)
  return Array.from({ length:total }, (_,s) => {
    const ov = team.overrides?.[s] || {}
    const sm = s * race.stintMin
    const dur = ov.duration ?? race.stintMin
    const startClock = ov.startClock || addMins(race.startTime, sm)
    const endClock   = ov.endClock   || addMins(race.startTime, sm+dur)
    const phase      = ov.phase || getPhase(Math.floor(sm/60), race)
    const pit        = ov.pit ?? (s < total-1)
    const laps       = ov.laps ?? Math.max(1, Math.round(dur/3))
    const notes      = ov.notes || ''
    let driver = null
    if (ov.driverId) {
      driver = team.drivers.find(d => d.id === ov.driverId) || null
    } else {
      const cands = team.drivers.filter(d => (d.availability||[]).includes(s))
      if (cands.length===1) driver = cands[0]
      else if (cands.length>1) driver = { id:'CONFLICT', name:'⚠ CONFLITO', color:'#ff4040' }
    }
    return { s, startClock, endClock, raceStart:raceLabel(sm), raceEnd:raceLabel(sm+dur), phase, pit, laps, dur, notes, driver, isLast:s===total-1 }
  })
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const C = {
  bg:'#030503', card:'#080d08', panel:'#050905', deep:'#020402',
  border:'#152215', text:'#c0dcc0', muted:'#4a664a', white:'#eef6ee',
  green:'#39FF14', gdim:'#1a7a00', gdark:'#0d3d00',
}

const S = {
  app:       { background:C.bg, minHeight:'100vh', color:C.text, fontFamily:"'Rajdhani','Segoe UI',sans-serif" },
  header:    { padding:'20px 24px 16px', borderBottom:`2px solid ${C.gdim}`, background:'radial-gradient(ellipse 100% 200% at 50% -40%,#0a240a,transparent 65%)', display:'flex', flexDirection:'column', alignItems:'center', gap:4 },
  logoRow:   { display:'flex', alignItems:'center', gap:12 },
  bolt:      { fontSize:'1.7rem', color:C.green, filter:`drop-shadow(0 0 12px ${C.green})` },
  title:     { fontFamily:'monospace', fontWeight:900, fontSize:'1.6rem', letterSpacing:5, color:C.green, textShadow:`0 0 20px ${C.green}90` },
  sub:       { fontFamily:'monospace', fontSize:'0.58rem', letterSpacing:5, color:C.muted, textTransform:'uppercase', marginTop:3 },
  racebar:   { background:C.panel, borderBottom:`1px solid ${C.border}`, padding:'10px 20px', display:'flex', flexWrap:'wrap', gap:'8px 16px', alignItems:'flex-end' },
  rfLabel:   { fontSize:'0.5rem', letterSpacing:2, color:C.muted, textTransform:'uppercase', display:'block', marginBottom:2 },
  rfInput:   { background:'#0a130a', border:`1px solid ${C.border}`, borderRadius:3, color:C.white, fontFamily:'monospace', fontSize:'0.8rem', padding:'4px 7px', outline:'none', width:82 },
  tabsRow:   { display:'flex', alignItems:'center', gap:0, borderBottom:`2px solid ${C.border}`, background:C.deep, padding:'0 16px', overflowX:'auto', flexShrink:0 },
  tab:       (active,color) => ({ fontFamily:'monospace', fontSize:'0.58rem', letterSpacing:2, padding:'11px 15px', cursor:'pointer', borderBottom:`2px solid ${active?color:'transparent'}`, marginBottom:-2, whiteSpace:'nowrap', color:active?color:C.muted, display:'flex', alignItems:'center', gap:6, textTransform:'uppercase' }),
  tabDot:    c => ({ width:8, height:8, borderRadius:'50%', background:c, boxShadow:`0 0 5px ${c}` }),
  addTeamBtn:{ fontFamily:'monospace', fontSize:'0.5rem', letterSpacing:2, padding:'8px 14px', background:'transparent', border:'none', color:C.muted, cursor:'pointer', marginLeft:4 },
  panel:     { padding:16, maxWidth:1600, margin:'0 auto' },
  sl:        { fontFamily:'monospace', fontSize:'0.5rem', letterSpacing:4, color:C.muted, textTransform:'uppercase', margin:'16px 0 10px', display:'flex', alignItems:'center', gap:10 },
  slLine:    { flex:1, height:1, background:C.border },
  teamHead:  c => ({ display:'flex', flexWrap:'wrap', alignItems:'center', gap:12, marginBottom:16, padding:'12px 16px', background:C.card, borderRadius:7, border:`1px solid ${c}30` }),
  carWrap:   { display:'flex', flexDirection:'column', gap:2 },
  carInput:  { fontFamily:'monospace', fontSize:'0.82rem', background:'#0a130a', border:`1px solid ${C.border}`, borderRadius:3, color:C.white, padding:'3px 8px', outline:'none', width:68 },
  rmTeamBtn: { marginLeft:'auto', padding:'5px 12px', background:'#1a0000', border:'1px solid #3d0000', borderRadius:3, color:'#cc4040', fontFamily:'monospace', fontSize:'0.48rem', letterSpacing:1, cursor:'pointer' },
  dGrid:     { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10, marginBottom:4 },
  dCard:     c => ({ background:C.card, border:`1px solid ${c}30`, borderRadius:7, overflow:'hidden' }),
  dHead:     { padding:'10px 12px', display:'flex', alignItems:'center', gap:9, borderBottom:`1px solid ${C.border}` },
  dNameIn:   c => ({ fontFamily:'monospace', fontSize:'0.8rem', fontWeight:700, background:'transparent', border:'none', borderBottom:'1px dashed transparent', color:c, outline:'none', width:'100%', cursor:'text' }),
  dMeta:     { display:'flex', alignItems:'center', gap:6, marginTop:3 },
  resBtn:    (a,c) => ({ padding:'2px 7px', borderRadius:2, border:`1px dashed ${a?c:'#2a3a2a'}`, fontFamily:'monospace', fontSize:'0.44rem', letterSpacing:1, cursor:'pointer', background:'transparent', color:a?c:C.muted, textTransform:'uppercase' }),
  rmDrvBtn:  { background:'transparent', border:'none', cursor:'pointer', color:'#3d1515', fontSize:'0.75rem', marginLeft:'auto' },
  availBody: { padding:'10px 12px' },
  availLbl:  { fontSize:'0.5rem', letterSpacing:2, color:C.muted, textTransform:'uppercase', marginBottom:6, display:'block' },
  slots:     { display:'flex', flexWrap:'wrap', gap:3 },
  slot:      (on,c) => ({ fontFamily:'monospace', fontSize:'0.6rem', padding:'3px 5px', borderRadius:3, border:`1px solid ${on?c:'#162216'}`, background:on?'#0a200a':'#0a140a', color:on?c:'#253525', cursor:'pointer', boxShadow:on?`0 0 4px ${c}50`:'none' }),
  dFoot:     { padding:'6px 12px', borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', fontSize:'0.62rem', color:C.muted, fontFamily:'monospace' },
  addDrvBtn: { display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:'transparent', border:`1px dashed ${C.border}`, borderRadius:7, padding:16, cursor:'pointer', color:C.muted, fontFamily:'monospace', fontSize:'0.52rem', letterSpacing:2, textTransform:'uppercase', minHeight:80, width:'100%' },
  banner:    { padding:'8px 14px', background:'#180000', border:'1px solid #4d0000', borderRadius:4, color:'#ff5555', fontSize:'0.72rem', marginBottom:12 },
  statsGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))', gap:7, marginBottom:12 },
  sbox:      { background:C.card, border:`1px solid ${C.border}`, borderRadius:4, padding:'9px 10px', textAlign:'center' },
  sval:      w => ({ fontFamily:'monospace', fontSize:'0.95rem', fontWeight:900, color:w?'#ff6060':C.green, textShadow:w?'':'0 0 8px #39ff1450' }),
  slab:      { fontSize:'0.48rem', letterSpacing:2, color:C.muted, textTransform:'uppercase', marginTop:2 },
  legend:    { display:'flex', flexWrap:'wrap', gap:'7px 14px', marginBottom:12, alignItems:'center' },
  twrap:     { overflowX:'auto', borderRadius:7, border:`1px solid ${C.border}`, background:C.card },
  th:        { background:'#060e06', padding:'9px 10px', textAlign:'left', fontFamily:'monospace', fontSize:'0.46rem', letterSpacing:2, color:C.muted, textTransform:'uppercase', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' },
  sepTd:     { padding:'2px 10px', background:'#050d05', fontFamily:'monospace', fontSize:'0.44rem', letterSpacing:3, color:'#284028', textTransform:'uppercase', borderTop:'1px solid #101e10', borderBottom:'1px solid #101e10' },
  td:        { padding:'7px 10px', verticalAlign:'middle', whiteSpace:'nowrap' },
  pbadge:    pm => ({ display:'inline-block', padding:'2px 7px', borderRadius:3, fontFamily:'monospace', fontSize:'0.46rem', letterSpacing:1, background:pm.badgeBg, color:pm.badgeColor, border:`1px solid ${pm.badgeBorder}` }),
  note:      { marginTop:14, padding:'10px 14px', background:'#060e06', border:`1px solid ${C.border}`, borderLeft:`3px solid ${C.green}`, borderRadius:4, fontSize:'0.7rem', color:C.muted, lineHeight:1.8 },
  gline:     { height:1, background:`linear-gradient(90deg,transparent,${C.gdim},transparent)`, margin:'16px 0' },
  ovGrid:    { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))', gap:12 },
  ovCard:    c => ({ background:C.card, border:`1px solid ${c}30`, borderLeft:`3px solid ${c}`, borderRadius:7, overflow:'hidden', cursor:'pointer' }),
  ovHead:    { padding:'10px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10 },
  ovRow:     { display:'flex', justifyContent:'space-between', fontSize:'0.7rem', padding:'3px 14px', borderBottom:`1px solid #0c160c` },
  syncBadge: (ok) => ({ position:'fixed', bottom:18, right:18, background: ok?'#0a260a':'#1a0800', border:`1px solid ${ok?C.green:'#ff8c00'}`, borderRadius:4, color:ok?C.green:'#ff8c00', fontFamily:'monospace', fontSize:'0.55rem', letterSpacing:2, padding:'8px 14px', zIndex:9999 }),
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [syncStatus, setSyncStatus] = useState('connecting') // connecting | synced | saving | error
  const saveTimer = useRef(null)
  const isRemote  = useRef(false)

  // Live listener from Firestore
  useEffect(() => {
    const ref = doc(db, 'sessions', DOC_ID)
    const unsub = onSnapshot(ref,
      snap => {
        if (snap.exists()) {
          const data = snap.data().state
          isRemote.current = true
          setAppState(data)
          if (activeTab === 'overview' || !data.teams?.find(t => t.id === activeTab)) {
            setActiveTab(data.teams?.[0]?.id || 'overview')
          }
        } else {
          // First time: save defaults
          const def = DEFAULT_STATE
          setDoc(ref, { state: def })
          setAppState(def)
          setActiveTab(def.teams[0].id)
        }
        setSyncStatus('synced')
      },
      () => setSyncStatus('error')
    )
    return () => unsub()
  }, [])

  // Save to Firestore with debounce
  const saveToFirestore = useCallback((nextState) => {
    if (isRemote.current) { isRemote.current = false; return }
    setSyncStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'sessions', DOC_ID), { state: nextState })
        setSyncStatus('synced')
      } catch { setSyncStatus('error') }
    }, 600)
  }, [])

  const update = useCallback(fn => {
    setAppState(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      fn(next)
      saveToFirestore(next)
      return next
    })
  }, [saveToFirestore])

  if (!appState) return (
    <div style={{ ...S.app, display:'flex', alignItems:'center', justifyContent:'center', gap:12, fontSize:'1rem', color:C.green, fontFamily:'monospace', letterSpacing:3 }}>
      <span style={{ animation:'spin 1s linear infinite' }}>⚡</span> CONECTANDO...
    </div>
  )

  const { race, teams } = appState

  const setRace = (key, val) => update(s => { s.race[key] = val })

  const addTeam = () => update(s => {
    const t = mkTeam('NOVO TIME', TEAM_PALETTE[s.teams.length % TEAM_PALETTE.length], String(s.teams.length+1).padStart(2,'0'))
    s.teams.push(t)
    setActiveTab(t.id)
  })

  const removeTeam = id => update(s => {
    if (s.teams.length <= 1) return
    s.teams = s.teams.filter(t => t.id !== id)
    setActiveTab(s.teams[0].id)
  })

  const updateTeam   = (id,k,v) => update(s => { const t=s.teams.find(t=>t.id===id); if(t) t[k]=v })
  const addDriver    = tid => update(s => { const t=s.teams.find(t=>t.id===tid); if(!t)return; t.drivers.push(mkDriver('DRIVER '+(t.drivers.length+1), DRV_PALETTE[t.drivers.length%DRV_PALETTE.length])) })
  const removeDriver = (tid,did) => update(s => { const t=s.teams.find(t=>t.id===tid); if(!t||t.drivers.length<=1)return; t.drivers=t.drivers.filter(d=>d.id!==did) })
  const updateDriver = (tid,did,k,v) => update(s => { const t=s.teams.find(t=>t.id===tid); if(!t)return; const d=t.drivers.find(d=>d.id===did); if(d) d[k]=v })

  const toggleSlot = (tid,did,si) => update(s => {
    const t=s.teams.find(t=>t.id===tid); if(!t)return
    const d=t.drivers.find(d=>d.id===did); if(!d)return
    const idx=d.availability.indexOf(si)
    if(idx>=0) d.availability.splice(idx,1)
    else d.availability.push(si)
  })

  const setOverride = (tid,si,k,v) => update(s => {
    const t=s.teams.find(t=>t.id===tid); if(!t)return
    if(!t.overrides) t.overrides={}
    if(!t.overrides[si]) t.overrides[si]={}
    if(k==='driverId') {
      t.overrides[si].driverId=v
      const d=t.drivers.find(d=>d.id===v)
      if(d&&!d.availability.includes(si)) d.availability.push(si)
    } else { t.overrides[si][k]=v }
  })

  const togglePit = (tid,si,cur) => update(s => {
    const t=s.teams.find(t=>t.id===tid); if(!t)return
    if(!t.overrides) t.overrides={}
    if(!t.overrides[si]) t.overrides[si]={}
    t.overrides[si].pit=!cur
  })

  const syncLabel = { connecting:'⚡ Conectando...', synced:'✓ Sincronizado', saving:'↑ Salvando...', error:'⚠ Erro de conexão' }

  return (
    <div style={S.app}>
      {/* HEADER */}
      <header style={S.header}>
        <img src="/logo.jpg" alt="Stormline Team" style={{ height: 140, objectFit: "contain", mixBlendMode: "multiply", filter: "invert(1) drop-shadow(0 0 20px #39FF1480)" }} />
        <div style={S.sub}>24h Le Mans · iRacing · Gerenciador de Escalação · Sync em Tempo Real</div>
      </header>

      {/* RACE CONFIG */}
      <div style={S.racebar}>
        {[['Largada','startTime','time'],['Duração (h)','durationH','number'],['Stint (min)','stintMin','number'],['Noite H+','nightAt','number'],['Madrugada H+','dawnAt','number'],['Sprint H+','finalAt','number']].map(([lbl,key,type]) => (
          <div key={key}>
            <label style={S.rfLabel}>{lbl}</label>
            <input type={type} style={S.rfInput} value={race[key]}
              onChange={e => setRace(key, type==='number' ? Number(e.target.value) : e.target.value)} />
          </div>
        ))}
      </div>

      {/* TABS */}
      <div style={S.tabsRow}>
        <div style={S.tab(activeTab==='overview',C.green)} onClick={() => setActiveTab('overview')}>⚡ Visão Geral</div>
        {teams.map(t => (
          <div key={t.id} style={S.tab(activeTab===t.id,t.color)} onClick={() => setActiveTab(t.id)}>
            <div style={S.tabDot(t.color)} />{t.name}
          </div>
        ))}
        <button style={S.addTeamBtn} onClick={addTeam}>+ Nova Equipe</button>
      </div>

      {/* PANEL */}
      {activeTab === 'overview'
        ? <OverviewPanel teams={teams} race={race} onSelect={setActiveTab} />
        : (() => { const team=teams.find(t=>t.id===activeTab); return team
            ? <TeamPanel key={team.id} team={team} race={race}
                updateTeam={updateTeam} removeTeam={removeTeam}
                addDriver={addDriver} removeDriver={removeDriver} updateDriver={updateDriver}
                toggleSlot={toggleSlot} setOverride={setOverride} togglePit={togglePit} />
            : null })()
      }

      {/* SYNC BADGE */}
      <div style={S.syncBadge(syncStatus==='synced')}>{syncLabel[syncStatus]}</div>
    </div>
  )
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────
function OverviewPanel({ teams, race, onSelect }) {
  return (
    <div style={S.panel}>
      <SL>Resumo por Equipe</SL>
      <div style={S.ovGrid}>
        {teams.map(team => {
          const stints = computeStints(team, race)
          const assigned   = stints.filter(s=>s.driver&&s.driver.id!=='CONFLICT').length
          const unassigned = stints.filter(s=>!s.driver).length
          const conflicts  = stints.filter(s=>s.driver?.id==='CONFLICT').length
          const counts = {}
          team.drivers.forEach(d=>counts[d.id]=0)
          stints.forEach(s=>{ if(s.driver&&s.driver.id!=='CONFLICT') counts[s.driver.id]=(counts[s.driver.id]||0)+1 })
          return (
            <div key={team.id} style={S.ovCard(team.color)} onClick={()=>onSelect(team.id)}>
              <div style={S.ovHead}>
                <div style={{width:11,height:11,borderRadius:'50%',background:team.color,boxShadow:`0 0 8px ${team.color}`}} />
                <span style={{fontFamily:'monospace',fontWeight:900,fontSize:'0.85rem',color:team.color}}>{team.name}</span>
                <span style={{fontFamily:'monospace',fontSize:'0.68rem',color:C.muted,marginLeft:'auto'}}>CAR #{team.carNum}</span>
              </div>
              {[['Stints totais',stints.length,false],['Atribuídos',assigned,false],['Sem piloto',unassigned,unassigned>0],['Conflitos',conflicts,conflicts>0]].map(([k,v,w])=>(
                <div key={k} style={S.ovRow}>
                  <span style={{color:C.muted}}>{k}</span>
                  <span style={{fontFamily:'monospace',color:w?'#ff6060':C.text}}>{v}</span>
                </div>
              ))}
              {team.drivers.map(d=>{
                const c=counts[d.id]||0, h=Math.round(c*race.stintMin/60*10)/10
                return (
                  <div key={d.id} style={S.ovRow}>
                    <span style={{color:d.color,opacity:.8}}>{d.reserve?'[RES] ':''}{d.name}</span>
                    <span style={{fontFamily:'monospace',color:C.muted}}>{d.reserve?'—':`${c} stints · ${h}h`}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── TEAM PANEL ──────────────────────────────────────────────────────────────
function TeamPanel({ team, race, updateTeam, removeTeam, addDriver, removeDriver, updateDriver, toggleSlot, setOverride, togglePit }) {
  const stints = computeStints(team, race)
  const T = Math.floor((race.durationH*60)/race.stintMin)
  const conflicts = stints.filter(s=>s.driver?.id==='CONFLICT')
  const vacants   = stints.filter(s=>!s.driver)
  const counts = {}
  team.drivers.forEach(d=>counts[d.id]=0)
  stints.forEach(s=>{ if(s.driver&&s.driver.id!=='CONFLICT') counts[s.driver.id]=(counts[s.driver.id]||0)+1 })

  return (
    <div style={S.panel}>
      {/* Team header */}
      <div style={S.teamHead(team.color)}>
        <input type="color" value={team.color} onChange={e=>updateTeam(team.id,'color',e.target.value)}
          style={{width:32,height:32,borderRadius:'50%',border:`3px solid ${team.color}`,cursor:'pointer',padding:0,background:'none'}} />
        <input style={{...S.dNameIn(team.color),fontSize:'1rem',fontWeight:900,minWidth:160}}
          value={team.name} onChange={e=>updateTeam(team.id,'name',e.target.value)} placeholder="Nome da equipe" />
        <div style={S.carWrap}>
          <label style={S.rfLabel}>Carro #</label>
          <input style={S.carInput} value={team.carNum} onChange={e=>updateTeam(team.id,'carNum',e.target.value)} maxLength={4} />
        </div>
        <button style={S.rmTeamBtn} onClick={()=>removeTeam(team.id)}>✕ Remover Equipe</button>
      </div>

      {(conflicts.length>0||vacants.length>0) && (
        <div style={S.banner}>
          {conflicts.length>0 && `⚠ Conflito nos stints: ${conflicts.map(s=>s.s+1).join(', ')}. `}
          {vacants.length>0 && `⚡ Sem piloto: ${vacants.slice(0,5).map(s=>addMins(race.startTime,s.s*race.stintMin)).join(', ')}${vacants.length>5?' …':''}.`}
        </div>
      )}

      {/* Driver cards */}
      <SL>Pilotos — clique nos horários que cada piloto quer correr</SL>
      <div style={S.dGrid}>
        {team.drivers.map(d => {
          const myS = (d.availability||[]).filter(s=>s<T).length
          const myH = Math.round(myS*race.stintMin/60*10)/10
          return (
            <div key={d.id} style={S.dCard(d.color)}>
              <div style={S.dHead}>
                <input type="color" value={d.color} onChange={e=>updateDriver(team.id,d.id,'color',e.target.value)}
                  style={{width:24,height:24,borderRadius:'50%',border:`2px solid ${d.color}`,cursor:'pointer',padding:0,background:'none',flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <input style={S.dNameIn(d.color)} value={d.name} onChange={e=>updateDriver(team.id,d.id,'name',e.target.value)} placeholder="Nome" />
                  <div style={S.dMeta}>
                    <button style={S.resBtn(d.reserve,d.color)} onClick={()=>updateDriver(team.id,d.id,'reserve',!d.reserve)}>
                      {d.reserve?'⚡ Reserva':'🏎 Principal'}
                    </button>
                    <button style={S.rmDrvBtn} onClick={()=>removeDriver(team.id,d.id)}>✕</button>
                  </div>
                </div>
              </div>
              <div style={S.availBody}>
                <span style={S.availLbl}>{d.reserve?'Cobertura disponível:':'Horários que quero correr:'}</span>
                <div style={S.slots}>
                  {Array.from({length:T},(_,s)=>{
                    const on=(d.availability||[]).includes(s)
                    return (
                      <button key={s} style={S.slot(on,d.color)}
                        title={`Stint ${s+1}: ${addMins(race.startTime,s*race.stintMin)} → ${addMins(race.startTime,s*race.stintMin+race.stintMin)}`}
                        onClick={()=>toggleSlot(team.id,d.id,s)}>
                        {addMins(race.startTime,s*race.stintMin)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={S.dFoot}>
                <span>{myS} stint{myS!==1?'s':''}</span><span>{myH}h</span>
              </div>
            </div>
          )
        })}
        <button style={S.addDrvBtn} onClick={()=>addDriver(team.id)}>+ Piloto</button>
      </div>

      <div style={S.gline} />

      {/* Stats */}
      <SL>Resumo</SL>
      <div style={S.statsGrid}>
        {[['Stints',stints.length,false],['Duração',race.durationH+'h',false],['Stint',race.stintMin+'min',false],
          ['Atribuídos',stints.filter(s=>s.driver&&s.driver.id!=='CONFLICT').length,false],
          ['Sem piloto',vacants.length,vacants.length>0],['Carro','#'+team.carNum,false]].map(([l,v,w])=>(
          <div key={l} style={S.sbox}><div style={S.sval(w)}>{v}</div><div style={S.slab}>{l}</div></div>
        ))}
      </div>

      {/* Legend */}
      <div style={S.legend}>
        {team.drivers.map(d=>{
          const c=counts[d.id]||0, h=Math.round(c*race.stintMin/60*10)/10
          return (
            <div key={d.id} style={{display:'flex',alignItems:'center',gap:5,fontSize:'0.75rem',fontWeight:600}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:d.reserve?'transparent':d.color,border:d.reserve?`1px dashed ${d.color}`:'none',boxShadow:`0 0 4px ${d.color}`,flexShrink:0}} />
              <span style={{color:d.color,opacity:d.reserve?.75:1}}>
                {d.reserve?'[RES] ':''}{d.name}
                <span style={{color:C.muted,fontSize:'0.62rem',marginLeft:3}}>{d.reserve?'Emergência':`${c} stints · ${h}h`}</span>
              </span>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <SL>Tabela de Stints — clique em qualquer célula para editar</SL>
      <StintTable stints={stints} team={team} race={race} setOverride={setOverride} togglePit={togglePit} />

      <div style={S.note}>
        <strong style={{color:C.green}}>⚡ Sync em tempo real:</strong> Qualquer alteração feita aqui aparece instantaneamente para todos os membros da equipe que tiverem o link aberto.
      </div>
    </div>
  )
}

// ─── STINT TABLE ─────────────────────────────────────────────────────────────
function StintTable({ stints, team, race, setOverride, togglePit }) {
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')

  const startEdit = (s,field,cur) => { setEditing({s,field}); setEditVal(String(cur)) }
  const commit    = (s,field,val) => {
    if(field==='duration'||field==='laps') setOverride(team.id,s,field,parseInt(val)||0)
    else setOverride(team.id,s,field,val)
    setEditing(null)
  }

  let lastPhase = null
  const rows = []

  stints.forEach(st => {
    const pm = PHASE_META[st.phase]
    if (st.phase!==lastPhase) {
      rows.push(<tr key={'sep'+st.s}><td colSpan={10} style={S.sepTd}>{pm.label}</td></tr>)
      lastPhase = st.phase
    }
    const isVac=!st.driver, isConf=st.driver?.id==='CONFLICT'
    const bg=isVac||isConf?'#170707':pm.rowBg

    const EC = ({s,field,value,children,w}) => {
      const me = editing?.s===s&&editing?.field===field
      return me
        ? <input autoFocus value={editVal} style={{background:'#091409',border:`1px solid ${C.green}`,borderRadius:3,color:C.white,fontFamily:'monospace',fontSize:'0.75rem',padding:'2px 5px',outline:'none',width:w||90}}
            onChange={e=>setEditVal(e.target.value)}
            onBlur={()=>commit(s,field,editVal)}
            onKeyDown={e=>{if(e.key==='Enter')commit(s,field,editVal);if(e.key==='Escape')setEditing(null)}} />
        : <span onClick={()=>startEdit(s,field,value)} style={{cursor:'pointer',display:'inline-flex',alignItems:'center',gap:2}}>
            {children}<span style={{opacity:0,fontSize:'0.52rem',color:C.green}} className="ei">✏</span>
          </span>
    }

    const DrvCell = () => {
      const me=editing?.s===st.s&&editing?.field==='driverId'
      if(isVac) return <span style={{color:'#3d1515',fontStyle:'italic',fontSize:'0.78rem'}}>— sem piloto —</span>
      if(isConf) return <span style={{color:'#ff4040',fontWeight:700}}>⚠ CONFLITO</span>
      return me
        ? <select autoFocus value={editVal} style={{background:'#091409',border:`1px solid ${C.green}`,borderRadius:3,color:C.white,fontFamily:'monospace',fontSize:'0.75rem',padding:'2px 5px',outline:'none'}}
            onChange={e=>{setEditVal(e.target.value);commit(st.s,'driverId',e.target.value)}}
            onBlur={()=>setEditing(null)}>
            {team.drivers.map(d=><option key={d.id} value={d.id}>{d.reserve?'[RES] ':''}{d.name}</option>)}
          </select>
        : <span onClick={()=>startEdit(st.s,'driverId',st.driver?.id||'')} style={{cursor:'pointer',fontWeight:700,fontSize:'0.83rem',color:st.driver?.color,display:'inline-flex',alignItems:'center',gap:3}}>
            {st.driver?.name}<span className="ei" style={{opacity:0,fontSize:'0.52rem',color:C.green}}>✏</span>
          </span>
    }

    const PhCell = () => {
      const me=editing?.s===st.s&&editing?.field==='phase'
      return me
        ? <select autoFocus value={editVal} style={{background:'#091409',border:`1px solid ${C.green}`,borderRadius:3,color:C.white,fontFamily:'monospace',fontSize:'0.7rem',padding:'2px 4px',outline:'none'}}
            onChange={e=>{setEditVal(e.target.value);commit(st.s,'phase',e.target.value)}}
            onBlur={()=>setEditing(null)}>
            {Object.entries(PHASE_META).map(([k,v])=><option key={k} value={k}>{v.text}</option>)}
          </select>
        : <span onClick={()=>startEdit(st.s,'phase',st.phase)} style={{cursor:'pointer',...S.pbadge(pm)}}>{pm.text}</span>
    }

    rows.push(
      <tr key={st.s} style={{background:bg,borderBottom:'1px solid #0c160c'}}>
        <td style={S.td}><span style={{fontFamily:'monospace',fontSize:'0.62rem',fontWeight:700,color:C.muted}}>ST {pad2(st.s+1)}</span></td>
        <td style={S.td}><EC s={st.s} field="startClock" value={st.startClock} w={70}><span style={{fontFamily:'monospace',fontSize:'0.78rem'}}>{st.startClock}</span></EC></td>
        <td style={S.td}><EC s={st.s} field="endClock" value={st.endClock} w={70}><span style={{fontFamily:'monospace',fontSize:'0.78rem'}}>{st.endClock}</span></EC></td>
        <td style={S.td}><span style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.muted}}>{st.raceStart}→{st.raceEnd}</span></td>
        <td style={S.td}><DrvCell /></td>
        <td style={{...S.td,textAlign:'center'}}><EC s={st.s} field="duration" value={st.dur} w={50}><span style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.muted}}>{st.dur}min</span></EC></td>
        <td style={{...S.td,textAlign:'center'}}><EC s={st.s} field="laps" value={st.laps} w={40}><span style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.muted}}>~{st.laps}</span></EC></td>
        <td style={{...S.td,textAlign:'center'}}>
          {st.isLast?<span>🏁</span>
            :<span onClick={()=>togglePit(team.id,st.s,st.pit)} style={{cursor:'pointer'}}>
              {st.pit
                ?<span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.green,boxShadow:`0 0 4px ${C.green}`}} />
                :<span style={{color:'#253525',fontSize:'0.65rem'}}>—</span>}
            </span>}
        </td>
        <td style={{...S.td,textAlign:'center'}}><PhCell /></td>
        <td style={S.td}><EC s={st.s} field="notes" value={st.notes} w={120}><span style={{fontSize:'0.65rem',color:st.notes?C.text:'#2a3a2a',fontStyle:st.notes?'normal':'italic'}}>{st.notes||'+ nota'}</span></EC></td>
      </tr>
    )
  })

  return (
    <div style={S.twrap}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
        <thead><tr>
          {['Stint','Início','Fim','H. Corrida','Piloto','Duração','Voltas','Pit','Fase','Notas'].map((h,i)=>(
            <th key={h} style={{...S.th,textAlign:i>=5&&i<=8?'center':'left'}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}

function SL({ children }) {
  return <div style={S.sl}>{children}<div style={S.slLine} /></div>
}
