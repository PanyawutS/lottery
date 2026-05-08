/* ════════════════════════════════════════════════════
   NIKKEI MODULE v2 — สูตรคำนวณตำแหน่ง (Positional)
   ════════════════════════════════════════════════════ */

/* ── Parser ── */
function parseNikkeiInput(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const entries = [];
  lines.forEach((line, idx) => {
    let date = '', top = '', bot = '';
    const m1 = line.match(/^(.+?),(\d{3}),(\d{2})$/);
    const m2 = line.match(/^(\d{3})-(\d{2})$/);
    const m3 = line.match(/^(\d{5})$/);
    if (m1) { date = m1[1]; top = m1[2]; bot = m1[3]; }
    else if (m2) { date = `งวด ${idx+1}`; top = m2[1]; bot = m2[2]; }
    else if (m3) { date = `งวด ${idx+1}`; top = m3[1].slice(0,3); bot = m3[1].slice(3); }
    else return;
    entries.push({ date, top, bot });
  });
  return entries;
}

/* ══════════════════════════════
   สูตร 1: ความถี่แยกตามตำแหน่ง
   วิเคราะห์แต่ละตำแหน่งแยกกัน
   ตำแหน่งหลักร้อย/สิบ/หน่วย มีพฤติกรรมต่างกัน
══════════════════════════════ */
function posFreq(entries, field) {
  const len = entries[0]?.[field]?.length || 0;
  const pf = Array.from({length: len}, () => Array(10).fill(0));
  entries.forEach(e => {
    [...e[field]].forEach((ch, pos) => pf[pos][parseInt(ch)]++);
  });
  return pf; // pf[pos][digit] = count
}

function posDecay(entries, field, decay = 0.85) {
  const len = entries[0]?.[field]?.length || 0;
  const pd = Array.from({length: len}, () => Array(10).fill(0));
  entries.forEach((e, idx) => {
    const w = Math.pow(decay, idx);
    [...e[field]].forEach((ch, pos) => pd[pos][parseInt(ch)] += w);
  });
  return pd;
}

/* ── ดีที่สุดต่อตำแหน่ง ── */
function topPerPos(posD, topN = 3) {
  return posD.map(col => {
    return col.map((v,d)=>({d,v})).sort((a,b)=>b.v-a.v).slice(0,topN).map(x=>x.d);
  });
}

/* ══════════════════════════════
   สูตร 2: Positional Markov
   ตำแหน่งเดิม → ตำแหน่งเดิมงวดถัดไป
   (ไม่ใช่ผสมข้ามตำแหน่ง)
══════════════════════════════ */
function posMarkov(entries, field) {
  const len = entries[0]?.[field]?.length || 0;
  const mx = Array.from({length: len}, () => {
    const m = {};
    for(let i=0;i<=9;i++){m[i]={};for(let j=0;j<=9;j++)m[i][j]=0;}
    return m;
  });
  for(let i=0;i<entries.length-1;i++){
    const cur = entries[i][field];
    const nxt = entries[i+1][field];
    [...cur].forEach((ch, pos) => {
      if(pos < nxt.length) mx[pos][parseInt(ch)][parseInt(nxt[pos])]++;
    });
  }
  // normalize to prob
  return mx.map(m => {
    const p = {};
    for(let d=0;d<=9;d++){
      const tot = Object.values(m[d]).reduce((a,b)=>a+b,0)||1;
      p[d]={};
      for(let e=0;e<=9;e++) p[d][e]=m[d][e]/tot;
    }
    return p;
  });
}

/* ── Markov score ต่อตำแหน่ง ── */
function posMarkovScore(entries, field, probMx) {
  if(!entries.length) return [];
  const cur = entries[0][field];
  return probMx.map((prob, pos) => {
    const d = parseInt(cur[pos]);
    const row = prob[d];
    const scores = Array(10).fill(0);
    for(let e=0;e<=9;e++) scores[e] = row[e]||0;
    return scores;
  });
}

/* ══════════════════════════════
   สูตร 3: ผลรวมหลัก (Digit Sum)
   หาว่าผลรวมช่วงไหนออกบ่อย
   แล้วให้คะแนนตัวเลขที่ผลรวมตรง
══════════════════════════════ */
function digitSumPattern(entries, field) {
  const sums = entries.map(e => [...e[field]].reduce((a,c)=>a+parseInt(c),0));
  const freq = {};
  sums.forEach(s => { freq[s]=(freq[s]||0)+1; });
  // คาดการณ์ผลรวมงวดถัดไป: ใช้ค่าเฉลี่ยถ่วงน้ำหนักของ 5 งวดล่าสุด
  const recent = sums.slice(0,5);
  const weightedSum = recent.reduce((acc,s,i)=>acc+s*Math.pow(0.8,i),0);
  const weightTotal = recent.reduce((acc,_,i)=>acc+Math.pow(0.8,i),0);
  const predictedSum = Math.round(weightedSum/weightTotal);
  return { freq, predictedSum, recentSums: recent };
}

/* ─ score ว่าตัวเลข N หลักมีผลรวมใกล้เป้าไหม ─ */
function sumProximityScore(numStr, targetSum, tolerance = 2) {
  const s = [...numStr].reduce((a,c)=>a+parseInt(c),0);
  const diff = Math.abs(s - targetSum);
  if(diff === 0) return 1.0;
  if(diff <= tolerance) return 1 - (diff/(tolerance+1));
  return 0;
}

/* ══════════════════════════════
   สูตร 4: Mirror Pattern
   กลับเลขของงวดล่าสุด → เป็น candidate
══════════════════════════════ */
function mirrorCandidates(entries) {
  if(!entries.length) return {top:[],bot:[]};
  const last = entries[0];
  const mirTop = last.top.split('').reverse().join('');
  const mirBot = last.bot.split('').reverse().join('');
  // rotate: เลื่อนหลักซ้าย-ขวา
  const rotTop1 = last.top.slice(1)+last.top[0];
  const rotTop2 = last.top[last.top.length-1]+last.top.slice(0,-1);
  return { top:[mirTop,rotTop1,rotTop2], bot:[mirBot] };
}

/* ══════════════════════════════
   สูตร 5: Last-digit Link
   หลักสุดท้ายของ บน3 มักสัมพันธ์กับ ล่าง2
══════════════════════════════ */
function lastDigitLink(entries) {
  // สร้าง map: หลักสุดท้ายบน → หลักแรกล่าง
  const map = {};
  entries.slice(0,-1).forEach((e,i)=>{
    const lastTop = parseInt(e.top[e.top.length-1]);
    const firstBot = parseInt(entries[i+1]?.bot?.[0]??-1);
    if(firstBot>=0){
      if(!map[lastTop]) map[lastTop]=Array(10).fill(0);
      map[lastTop][firstBot]++;
    }
  });
  const curLastTop = parseInt(entries[0].top[entries[0].top.length-1]);
  const linkProb = map[curLastTop] || Array(10).fill(0);
  const tot = linkProb.reduce((a,b)=>a+b,0)||1;
  return linkProb.map(v=>v/tot);
}

/* ══════════════════════════════
   COMPOSITE SCORE (Positional)
   รวมสัญญาณทั้งหมดต่อตำแหน่ง
══════════════════════════════ */
function nkCompositePos(posD, markovS, topField, entries) {
  // คืน score[pos][digit]
  const len = posD.length;
  const result = [];
  for(let pos=0; pos<len; pos++){
    const decCol = posD[pos];
    const mkCol  = markovS[pos] || Array(10).fill(0);
    const maxDec = Math.max(...decCol)||1;
    const maxMk  = Math.max(...mkCol)||1;
    const scores = [];
    for(let d=0;d<=9;d++){
      const dNorm = decCol[d]/maxDec;
      const mNorm = mkCol[d]/maxMk;
      scores.push(dNorm*0.55 + mNorm*0.45);
    }
    result.push(scores);
  }
  return result;
}

/* ══════════════════════════════
   สร้าง candidates จาก composite per position
══════════════════════════════ */
function buildCandidates(compPos, n = 3) {
  // compPos[pos] = scores array[10]
  // คืน array ของตัวเลข N หลัก
  const topPerPosition = compPos.map(scores =>
    scores.map((v,d)=>({d,v})).sort((a,b)=>b.v-a.v).slice(0,n).map(x=>x.d)
  );

  const results = [];
  function gen(pos, cur) {
    if(pos === compPos.length){ results.push(cur); return; }
    topPerPosition[pos].forEach(d => gen(pos+1, cur+d));
  }
  gen(0,'');

  // score each candidate
  const scored = results.map(num => {
    let s = 0;
    [...num].forEach((ch,pos) => s += compPos[pos][parseInt(ch)]);
    return { num, score: s };
  });
  return scored.sort((a,b)=>b.score-a.score);
}

/* ══════════════════════════════
   RENDER
══════════════════════════════ */
function renderNikkeiHistory(entries) {
  const wrap = document.getElementById('nkHistoryWrap');
  if(!wrap) return;
  wrap.innerHTML = entries.map((e,i) => `
    <div class="nk-history-row ${i===0?'nk-latest':''}">
      <div class="nk-hist-date">${e.date}</div>
      <div class="nk-hist-nums">
        <span class="nk-top3">${e.top}</span>
        <span class="nk-sep">-</span>
        <span class="nk-bot2">${e.bot}</span>
      </div>
      ${i===0?'<span class="nk-badge-latest">ล่าสุด</span>':''}
    </div>`).join('');
}

function renderNkPosHeatmap(posD3, posD2) {
  const sec = document.getElementById('nkPosHeatmap');
  if(!sec) return;

  // Build simple position card: top 3 digits per position
  const mkPosCards = (posD, labels, groupTitle, accentColor) => {
    let html = `<div class="nk-pos-group-title" style="color:${accentColor}">${groupTitle}</div>`;
    html += `<div class="nk-pos-cards">`;
    posD.forEach((col, pos) => {
      const sorted = col.map((v,d)=>({d,v})).sort((a,b)=>b.v-a.v);
      const maxV = sorted[0].v || 1;
      const top3 = sorted.slice(0,3);
      const rest = sorted.slice(3);
      html += `<div class="nk-pos-card">
        <div class="nk-pos-card-label">${labels[pos]}</div>
        <div class="nk-pos-top-digits">
          ${top3.map((x,i)=>`
            <div class="nk-pos-digit-row">
              <div class="nk-pos-digit-num" style="color:${i===0?accentColor:'var(--text)'}">${x.d}</div>
              <div class="nk-pos-bar-wrap">
                <div class="nk-pos-bar" style="width:0;background:${i===0?accentColor:'var(--border)'}" data-pct="${Math.round(x.v/maxV*100)}"></div>
              </div>
              <div class="nk-pos-bar-cnt">${x.v}ครั้ง</div>
            </div>`).join('')}
        </div>
        <div class="nk-pos-other-label">เลขอื่น: ${rest.map(x=>`<span class="nk-pos-other-d">${x.d}</span>`).join('')}</div>
      </div>`;
    });
    html += `</div>`;
    return html;
  };

  sec.innerHTML =
    mkPosCards(posD3, ['หลักร้อย','หลักสิบ','หลักหน่วย'], '🎯 บน 3 ตัว — เลขเด่นแต่ละหลัก', 'var(--accent)') +
    `<div style="margin-top:16px"></div>` +
    mkPosCards(posD2, ['หลักสิบ','หลักหน่วย'], '🎯 ล่าง 2 ตัว — เลขเด่นแต่ละหลัก', 'var(--accent3)');

  requestAnimationFrame(()=>document.querySelectorAll('.nk-pos-bar').forEach(el=>{
    el.style.width = el.dataset.pct + '%';
  }));
}

function renderNkSumPattern(sp3, sp2) {
  const sec = document.getElementById('nkSumPattern');
  if(!sec) return;
  const mkChips = (sp) => {
    const top = Object.entries(sp.freq).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return `<div class="dsum-chips">${top.map(([s,c])=>`<div class="dsum-chip"><span class="ds-val">${s}</span><span class="ds-cnt">${c}ครั้ง</span></div>`).join('')}</div>
    <div class="dsum-root" style="margin-top:8px">ผลรวมที่คาดงวดถัดไป → <strong style="color:var(--accent);font-size:20px;font-family:var(--font-mono)">${sp.predictedSum}</strong></div>`;
  };
  sec.innerHTML = `
    <div class="nk-zsec-title">🔢 ผลรวมหลัก บน 3 ตัว</div>${mkChips(sp3)}
    <div class="nk-zsec-title" style="margin-top:14px">🔢 ผลรวมหลัก ล่าง 2 ตัว</div>${mkChips(sp2)}`;
}

function renderNkPredictions(cands3, cands2, sp3, sp2, mirrors) {
  const sec = document.getElementById('nkPredictions');
  if(!sec) return;

  // boost by sum proximity
  const boosted3 = cands3.map(c=>({...c, final: c.score + sumProximityScore(c.num, sp3.predictedSum)*0.3}));
  const boosted2 = cands2.map(c=>({...c, final: c.score + sumProximityScore(c.num, sp2.predictedSum)*0.3}));
  boosted3.sort((a,b)=>b.final-a.final);
  boosted2.sort((a,b)=>b.final-a.final);

  // add mirror candidates
  const mirTop = mirrors.top.filter(m=>!boosted3.slice(0,3).find(c=>c.num===m));
  const mirBot = mirrors.bot.filter(m=>!boosted2.slice(0,3).find(c=>c.num===m));

  const maxS3 = boosted3[0]?.final||1;
  const maxS2 = boosted2[0]?.final||1;

  const mkRow = (num,sc,maxSc,isMirror=false) => {
    const pct = Math.round((sc/maxSc)*100);
    return `<div class="nk-pred-row">
      <div class="nk-pred-num">${num}${isMirror?'<span style="font-size:9px;color:var(--accent4);margin-left:6px;font-family:var(--font-mono)">กระจก</span>':''}</div>
      <div class="nk-pred-right">
        <div class="nk-pred-bar-wrap"><div class="nk-pred-bar" style="width:${pct}%"></div></div>
        <div class="nk-pred-score">${(sc*100).toFixed(0)}</div>
      </div>
    </div>`;
  };

  // Full 5 combos
  const full5 = [];
  boosted3.slice(0,3).forEach(t=>{
    boosted2.slice(0,2).forEach(b=>{
      full5.push({num:t.num+b.num, score:t.final+b.final});
    });
  });
  full5.sort((a,b)=>b.score-a.score);
  const maxS5 = full5[0]?.score||1;

  sec.innerHTML = `
    <div class="nk-pred-section">
      <div class="nk-pred-label">🎯 เลขบน 3 ตัว (Positional)</div>
      ${boosted3.slice(0,6).map(c=>mkRow(c.num,c.final,maxS3)).join('')}
      ${mirTop.slice(0,2).map(m=>mkRow(m,maxS3*0.5,maxS3,true)).join('')}
    </div>
    <div class="nk-pred-section">
      <div class="nk-pred-label">🎯 เลขล่าง 2 ตัว (Positional)</div>
      ${boosted2.slice(0,6).map(c=>mkRow(c.num,c.final,maxS2)).join('')}
      ${mirBot.slice(0,1).map(m=>mkRow(m,maxS2*0.5,maxS2,true)).join('')}
    </div>
    <div class="nk-pred-section">
      <div class="nk-pred-label">🏆 ชุดรวม 5 ตัว (บน+ล่าง)</div>
      ${full5.slice(0,6).map(c=>`<div class="nk-pred-row">
        <div class="nk-pred-num" style="letter-spacing:3px">${c.num.slice(0,3)}<span style="color:var(--border)">-</span>${c.num.slice(3)}</div>
        <div class="nk-pred-right">
          <div class="nk-pred-bar-wrap"><div class="nk-pred-bar" style="width:${Math.round(c.score/maxS5*100)}%"></div></div>
          <div class="nk-pred-score">${(c.score*100).toFixed(0)}</div>
        </div>
      </div>`).join('')}
    </div>`;
}

function renderNkHotCold(entries) {
  const sec = document.getElementById('nkHotCold');
  if(!sec) return;
  const mkHC = (field, title, color) => {
    const win = Math.min(5,entries.length);
    const recent = entries.slice(0,win);
    const fAll = {}, fRec = {};
    for(let d=0;d<=9;d++){fAll[d]=0;fRec[d]=0;}
    entries.forEach(e=>[...e[field]].forEach(c=>{fAll[parseInt(c)]++;}));
    recent.forEach(e=>[...e[field]].forEach(c=>{fRec[parseInt(c)]++;}));
    const lastSeen = {};
    for(let d=0;d<=9;d++){
      const idx=entries.findIndex(e=>e[field].includes(String(d)));
      lastSeen[d]=idx===-1?entries.length:idx;
    }
    const hot = Object.entries(fRec).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const cold = Object.entries(lastSeen).sort((a,b)=>b[1]-a[1]).slice(0,3);
    return `<div class="nk-hc-section">
      <div class="nk-hc-title" style="color:${color}">${title}</div>
      <div class="hot-cold-grid">
        <div class="hc-box hot">
          <div class="hc-label">🔥 HOT (${win}งวดล่าสุด)</div>
          <div class="hc-digits">${hot.map(([d,c])=>`<div class="hc-digit"><span class="d">${d}</span><span class="info">${c}ครั้ง</span></div>`).join('')}</div>
        </div>
        <div class="hc-box cold">
          <div class="hc-label">❄️ COLD — ค้างนาน</div>
          <div class="hc-digits">${cold.map(([d,ls])=>`<div class="hc-digit"><span class="d">${d}</span><span class="info">${ls===0?'ล่าสุด':ls+'งวดที่แล้ว'}</span></div>`).join('')}</div>
        </div>
      </div>
    </div>`;
  };
  sec.innerHTML = mkHC('top','📊 บน 3 ตัว','var(--accent)') + mkHC('bot','📊 ล่าง 2 ตัว','var(--accent3)');
}

function renderNkMarkov(pmx3, pmx2, entries) {
  const sec = document.getElementById('nkMarkov');
  if(!sec||!entries.length) return;
  const mkSec = (title, pmx, field) => {
    const cur = entries[0][field];
    let html = `<div class="nk-mksec-title">${title}</div>`;
    [...cur].forEach((ch,pos)=>{
      const d = parseInt(ch);
      const prob = pmx[pos]?.[d];
      if(!prob) return;
      const top = Object.entries(prob).sort((a,b)=>b[1]-a[1]).slice(0,5);
      html+=`<div class="markov-row">
        <div class="markov-from">ตำแหน่ง${pos+1}[${d}]→</div>
        <div class="markov-targets">${top.map(([e,p])=>`<div class="markov-cell ${p>0.2?'markov-hot':''}"><span class="mc-d">${e}</span><span class="mc-p">${(p*100).toFixed(0)}%</span></div>`).join('')}</div>
      </div>`;
    });
    return html;
  };
  sec.innerHTML = mkSec('🔀 บน 3 ตัว — Positional Markov',pmx3,'top') + mkSec('🔀 ล่าง 2 ตัว — Positional Markov',pmx2,'bot');
}

/* ══════════════════════════════
   MAIN
══════════════════════════════ */
function runNikkei() {
  const raw = document.getElementById('nkInput').value;
  const entries = parseNikkeiInput(raw);
  const errEl = document.getElementById('nkError');
  if(entries.length < 3){
    errEl.innerHTML='⚠️ ต้องการข้อมูลอย่างน้อย 3 งวด';
    errEl.className='alert show'; return;
  }
  errEl.className='alert';
  document.getElementById('nkLoading').className='loading show';
  document.getElementById('btnNkAnalyse').disabled=true;

  setTimeout(()=>{
    try{
      /* บน 3 ตัว */
      const pd3  = posDecay(entries,'top');
      const pmx3 = posMarkov(entries,'top');
      const mks3 = posMarkovScore(entries,'top',pmx3);
      const cp3  = nkCompositePos(pd3, mks3,'top',entries);
      const cands3 = buildCandidates(cp3,3);
      const sp3  = digitSumPattern(entries,'top');

      /* ล่าง 2 ตัว */
      const pd2  = posDecay(entries,'bot');
      const pmx2 = posMarkov(entries,'bot');
      const mks2 = posMarkovScore(entries,'bot',pmx2);
      const cp2  = nkCompositePos(pd2, mks2,'bot',entries);
      const cands2 = buildCandidates(cp2,4);
      const sp2  = digitSumPattern(entries,'bot');

      const mirrors = mirrorCandidates(entries);

      /* Render */
      renderNikkeiHistory(entries);
      renderNkPosHeatmap(posFreq(entries,'top'),posFreq(entries,'bot'));
      renderNkHotCold(entries);
      renderNkSumPattern(sp3,sp2);
      renderNkMarkov(pmx3,pmx2,entries);
      renderNkPredictions(cands3,cands2,sp3,sp2,mirrors);

      document.getElementById('nkLoading').className='loading';
      document.getElementById('btnNkAnalyse').disabled=false;
      document.getElementById('nkResults').style.display='block';
      requestAnimationFrame(()=>{
        document.getElementById('nkResults').style.opacity='1';
        document.getElementById('nkResults').scrollIntoView({behavior:'smooth',block:'start'});
      });
    }catch(e){
      document.getElementById('nkLoading').className='loading';
      document.getElementById('btnNkAnalyse').disabled=false;
      errEl.innerHTML='เกิดข้อผิดพลาด: '+e.message;
      errEl.className='alert show';
    }
  },600);
}

function initNikkei(){
  const inp=document.getElementById('nkInput');
  if(inp&&!inp.value.trim()) inp.value=NIKKEI_DEFAULT_DATA;
}
