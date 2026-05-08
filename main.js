/* ── STATE ── */
let currentMode = 6;

/* ── MODE ── */
function selectMode(n){
  currentMode=n;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.mode)===n));
  document.getElementById('results').className='';
}

/* ── PARSE ── */
function parseInput(raw){return raw.split('\n').map(l=>l.trim().replace(/\s+/g,'')).filter(l=>l.length>0)}
function validateLines(lines){const bad=[];lines.forEach((l,i)=>{if(!/^\d{6}$/.test(l))bad.push({line:i+1,value:l})});return bad}
function extractByMode(s,mode){switch(mode){case 6:return s;case 5:return s.slice(0,5);case 4:return s.slice(0,4);case 3:return s.slice(-3);case 2:return s.slice(-2);default:return s}}

/* ══════════════════════════════
   ALGORITHM 1 — Raw Frequency
══════════════════════════════ */
function countFrequency(list){
  const f={};for(let d=0;d<=9;d++)f[d]=0;
  list.forEach(num=>{for(const ch of num)f[parseInt(ch)]++});
  return f;
}

/* ══════════════════════════════
   ALGORITHM 2 — Exponential Decay Weight
   w = decay^idx  (idx=0 = latest)
══════════════════════════════ */
function decayWeightedFrequency(list,decay=0.88){
  const s={};for(let d=0;d<=9;d++)s[d]=0;
  list.forEach((num,idx)=>{const w=Math.pow(decay,idx);for(const ch of num)s[parseInt(ch)]+=w});
  return s;
}

/* ══════════════════════════════
   ALGORITHM 3 — Hot / Cold Detection
   Hot  = ออกบ่อยใน window งวดล่าสุด
   Cold = ไม่ออกมานานที่สุด (lastSeen index)
══════════════════════════════ */
function getHotCold(list,window=15){
  const recent=list.slice(0,Math.min(window,list.length));
  const hot=countFrequency(recent);
  const lastSeen={};
  for(let d=0;d<=9;d++){
    const idx=list.findIndex(num=>num.includes(String(d)));
    lastSeen[d]=idx===-1?list.length:idx;
  }
  const hotTop=Object.entries(hot).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([d,c])=>({digit:parseInt(d),count:c}));
  const coldTop=Object.entries(lastSeen).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([d,ls])=>({digit:parseInt(d),lastSeen:ls}));
  return{hotTop,coldTop,hot,lastSeen};
}

/* ══════════════════════════════
   ALGORITHM 4 — Position-Based Frequency
══════════════════════════════ */
function positionFrequency(list){
  if(!list.length)return[];
  const len=list[0].length;
  const posFreq=Array.from({length:len},()=>Array(10).fill(0));
  list.forEach(num=>[...num].forEach((d,pos)=>posFreq[pos][parseInt(d)]++));
  return posFreq;
}

/* ══════════════════════════════
   ALGORITHM 5 — Pair Co-occurrence
══════════════════════════════ */
function pairCooccurrence(list){
  const pairs={};
  list.forEach(num=>{
    const digits=[...new Set([...num].map(Number))];
    for(let i=0;i<digits.length;i++)
      for(let j=i+1;j<digits.length;j++){
        const k=`${digits[i]}${digits[j]}`;
        pairs[k]=(pairs[k]||0)+1;
      }
  });
  return Object.entries(pairs).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([p,c])=>({pair:p,count:c}));
}

/* ══════════════════════════════
   ALGORITHM 6 — Cycle / Periodicity
══════════════════════════════ */
function detectCycles(list){
  const result=[];
  for(let d=0;d<=9;d++){
    const gaps=[];let last=-1;
    list.forEach((num,idx)=>{
      if(num.includes(String(d))){
        if(last>=0)gaps.push(idx-last);
        last=idx;
      }
    });
    const avg=gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null;
    const lastIdx=list.findIndex(num=>num.includes(String(d)));
    const dueIn=avg&&lastIdx>=0?Math.max(0,Math.round(avg-lastIdx)):null;
    result.push({digit:d,avgGap:avg?+avg.toFixed(1):null,lastSeen:lastIdx,dueIn,gaps});
  }
  return result.sort((a,b)=>(a.dueIn??999)-(b.dueIn??999));
}

/* ══════════════════════════════
   ALGORITHM 7 — Markov Chain Transition Matrix
   หลังเลข X ออก เลขไหนมักตามมางวดถัดไป
══════════════════════════════ */
function markovTransition(list){
  const matrix={};
  for(let d=0;d<=9;d++){matrix[d]={};for(let e=0;e<=9;e++)matrix[d][e]=0;}
  for(let i=0;i<list.length-1;i++){
    const cur=[...new Set([...list[i]].map(Number))];
    const nxt=[...new Set([...list[i+1]].map(Number))];
    cur.forEach(a=>nxt.forEach(b=>{if(a!==b)matrix[a][b]++;}));
  }
  const prob={};
  for(let d=0;d<=9;d++){
    const total=Object.values(matrix[d]).reduce((a,b)=>a+b,0)||1;
    prob[d]={};
    for(let e=0;e<=9;e++)prob[d][e]=matrix[d][e]/total;
  }
  return prob;
}
function markovScore(list,prob){
  const scores={};
  for(let d=0;d<=9;d++)scores[d]=0;
  if(!list.length)return scores;
  const lastDigits=[...new Set([...list[0]].map(Number))];
  lastDigits.forEach(prev=>{for(let d=0;d<=9;d++)scores[d]+=(prob[prev]?.[d]||0);});
  return scores;
}

/* ══════════════════════════════
   ALGORITHM 8 — Z-Score Anomaly Detection
   เลขที่ออกน้อย/มากกว่าค่าเฉลี่ย (negative = due)
══════════════════════════════ */
function zScoreAnalysis(freq,totalDigits){
  const expected=totalDigits/10;
  const values=Object.values(freq);
  const mean=values.reduce((a,b)=>a+b,0)/10;
  const sd=Math.sqrt(values.map(v=>(v-mean)**2).reduce((a,b)=>a+b,0)/10)||1;
  const result={};
  for(let d=0;d<=9;d++)result[d]=(freq[d]-expected)/sd;
  return result;
}

/* ══════════════════════════════
   ALGORITHM 9 — Moving Average Trend
   เปรียบ window ใหม่ vs เก่า → เลขกำลังขึ้น/ลง
══════════════════════════════ */
function movingAverageTrend(list,wNew=10,wOld=20){
  const n=list.length;
  const recentF=countFrequency(list.slice(0,Math.min(wNew,n)));
  const olderRaw=list.slice(Math.min(wNew,n),Math.min(wOld,n));
  const olderF=countFrequency(olderRaw);
  const recentLen=Math.min(wNew,n)*list[0].length||1;
  const olderLen=(olderRaw.length*(list[0]||'').length)||1;
  const trend={};
  for(let d=0;d<=9;d++)trend[d]=(recentF[d]/recentLen)-(olderF[d]/olderLen);
  return trend;
}

/* ══════════════════════════════
   ALGORITHM 10 — Digit Sum Pattern
   ผลรวมหลักของแต่ละงวด + Digital Root
══════════════════════════════ */
function digitSumAnalysis(list){
  const sums=list.map(num=>[...num].reduce((a,c)=>a+parseInt(c),0));
  const sumFreq={};
  sums.forEach(s=>{sumFreq[s]=(sumFreq[s]||0)+1;});
  const topSums=Object.entries(sumFreq).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([s,c])=>({sum:parseInt(s),count:c}));
  const roots=sums.map(s=>{let r=s;while(r>9)r=[...String(r)].reduce((a,c)=>a+parseInt(c),0);return r;});
  const rootFreq={};
  roots.forEach(r=>{rootFreq[r]=(rootFreq[r]||0)+1;});
  const topRoot=Object.entries(rootFreq).sort((a,b)=>b[1]-a[1])[0];
  return{topSums,topRoot:topRoot?{root:parseInt(topRoot[0]),count:topRoot[1]}:null,sums,roots};
}

/* ══════════════════════════════
   COMPOSITE SCORE (7 signals)
   decay 30% + position 20% + hot 15% + cold 5%
   + markov 15% + zScore 10% + trend 5%
══════════════════════════════ */
function compositeScore(decayS,posFreq,hotS,lastSeen,list,markovS,zScore,trend){
  const n=list.length||1;
  const maxDecay=Math.max(...Object.values(decayS))||1;
  const maxHot=Math.max(...Object.values(hotS))||1;
  const maxMark=Math.max(...Object.values(markovS))||1;
  const scores={};
  for(let d=0;d<=9;d++){
    const dNorm=decayS[d]/maxDecay;
    let posScore=0;
    if(posFreq.length){
      posFreq.forEach(col=>{const mx=Math.max(...col)||1;posScore+=col[d]/mx;});
      posScore/=posFreq.length;
    }
    const hNorm=hotS[d]/maxHot;
    const coldBonus=lastSeen[d]/n;
    const mNorm=markovS[d]/maxMark;
    const zNorm=Math.max(0,(-(zScore[d]||0)+2)/4);
    const tNorm=Math.max(0,(trend[d]||0)+0.5);
    scores[d]=dNorm*0.30+posScore*0.20+hNorm*0.15+coldBonus*0.05+mNorm*0.15+zNorm*0.10+tNorm*0.05;
  }
  return scores;
}

/* ══════════════════════════════
   GENERATE SUGGESTIONS from composite scores
══════════════════════════════ */
function generateSuggestions(composite,posFreq,mode,count=5){
  const sorted=Object.entries(composite).sort((a,b)=>b[1]-a[1]).map(([d])=>parseInt(d));
  const suggestions=[];

  if(posFreq.length===mode){
    // position-aware: pick best digit per position
    const base=posFreq.map(col=>{
      const mx=Math.max(...col);
      const tops=col.map((v,d)=>({d,v})).filter(x=>x.v===mx);
      return tops[0].d;
    });
    suggestions.push(base.join(''));

    // variations: swap one position with 2nd-best composite
    for(let p=0;p<mode&&suggestions.length<count;p++){
      const variant=[...base];variant[p]=sorted.find(d=>d!==base[p])??sorted[0];
      const s=variant.join('');if(!suggestions.includes(s))suggestions.push(s);
    }
  }

  // fill remaining with composite-sorted patterns
  const patMap={
    6:[[0,0,1,1,2,3],[0,1,2,3,4,0],[0,0,1,2,3,4]],
    5:[[0,0,1,1,2],[0,1,2,3,4],[0,0,1,2,3]],
    4:[[0,0,1,1],[0,1,2,3],[0,0,1,2]],
    3:[[0,1,2],[0,0,1],[0,1,1]],
    2:[[0,1],[0,2],[1,2]],
  };
  (patMap[mode]||patMap[6]).forEach(pat=>{
    const s=pat.map(i=>sorted[i]??sorted[0]).join('');
    if(!suggestions.includes(s))suggestions.push(s);
  });

  return suggestions.slice(0,count);
}

/* ══════════════════════════════
   RENDER HELPERS
══════════════════════════════ */
const MEDALS=['🥇','🥈','🥉','④','⑤'];
const MODE_LABEL={6:'หกตัว',5:'ห้าตัว',4:'สี่ตัว',3:'สามตัว',2:'สองตัว'};
const MODE_DESC={6:'ใช้ทั้ง 6 หลัก',5:'5 หลักแรก',4:'4 หลักแรก',3:'3 หลักท้าย',2:'2 หลักท้าย'};

function renderModeBadge(mode,count){
  document.getElementById('modeBadge').innerHTML=`🎯 ${MODE_LABEL[mode]} &nbsp;·&nbsp; ${MODE_DESC[mode]} &nbsp;·&nbsp; ${count} ชุด`;
}
function renderSummary(lines,mode){
  document.getElementById('summaryBar').innerHTML=`
    <div class="summary-chip">ชุดข้อมูล <span>${lines.length}</span></div>
    <div class="summary-chip">ตัวเลขวิเคราะห์ <span>${lines.length*mode}</span></div>
    <div class="summary-chip">Decay Factor <span>0.88</span></div>
    <div class="summary-chip">Window Hot/Cold <span>15 งวด</span></div>`;
}

function renderFrequency(freq,topDigits,maxFreq){
  const topSet=new Set(topDigits.map(t=>t.digit));
  const grid=document.getElementById('freqGrid');grid.innerHTML='';
  for(let d=0;d<=9;d++){
    const isTop=topSet.has(d);
    const pct=maxFreq>0?Math.round((freq[d]/maxFreq)*100):0;
    grid.innerHTML+=`<div class="freq-cell ${isTop?'top':''}">
      <div class="digit">${d}</div>
      <div class="count">${freq[d]}ครั้ง</div>
      <div class="freq-bar-wrap"><div class="freq-bar-fill" style="width:0" data-pct="${pct}"></div></div>
    </div>`;
  }
  requestAnimationFrame(()=>{document.querySelectorAll('.freq-bar-fill').forEach(el=>{el.style.width=el.dataset.pct+'%'})});
}

function renderTopN(topN){
  document.getElementById('topNTitle').textContent=`⭐ เลขเด่น (Exponential Decay) ${topN.length} อันดับ`;
  document.getElementById('topNRow').innerHTML=topN.map((t,i)=>`
    <div class="topN-badge">
      <span class="rank">${MEDALS[i]}</span>
      <span class="num">${t.digit}</span>
      <span class="wt">${t.score.toFixed(2)}</span>
    </div>`).join('');
}

function renderHotCold({hotTop,coldTop}){
  const wl=Math.min(15,document.getElementById('inputData').value.split('\n').filter(l=>l.trim()).length);
  document.getElementById('hotColdSection').innerHTML=`
    <div class="hot-cold-grid">
      <div class="hc-box hot">
        <div class="hc-label">🔥 HOT — ${wl} งวดล่าสุด</div>
        <div class="hc-digits">${hotTop.map(x=>`<div class="hc-digit"><span class="d">${x.digit}</span><span class="info">${x.count}ครั้ง</span></div>`).join('')}</div>
      </div>
      <div class="hc-box cold">
        <div class="hc-label">❄️ COLD — ค้างนาน</div>
        <div class="hc-digits">${coldTop.map(x=>`<div class="hc-digit"><span class="d">${x.digit}</span><span class="info">${x.lastSeen===0?'ล่าสุด':x.lastSeen+'งวดที่แล้ว'}</span></div>`).join('')}</div>
      </div>
    </div>`;
}

function renderPosition(posFreq,mode){
  if(!posFreq.length){document.getElementById('posCard').style.display='none';return}
  document.getElementById('posCard').style.display='';
  const posLabels=mode===6?['ล้าน','แสน','หมื่น','พัน','ร้อย','สิบ']:mode===3?['ร้อย','สิบ','หน่วย']:mode===2?['สิบ','หน่วย']:posFreq.map((_,i)=>`P${i+1}`);
  const maxPerPos=posFreq.map(col=>Math.max(...col)||1);
  let html=`<table class="pos-table"><thead><tr><th>เลข</th>${posLabels.map(l=>`<th>${l}</th>`).join('')}</tr></thead><tbody>`;
  for(let d=0;d<=9;d++){
    html+=`<tr>`;
    html+=`<td><strong style="font-family:var(--font-mono);color:var(--muted)">${d}</strong></td>`;
    posFreq.forEach((col,p)=>{
      const v=col[d],mx=maxPerPos[p];
      const pct=Math.round((v/mx)*100);
      const isTop=v===mx;
      html+=`<td class="${isTop?'pos-top':''}"><div class="pos-cell-inner"><span>${v}</span><div class="pos-cell-bar" style="width:0" data-pct="${pct}"></div></div></td>`;
    });
    html+=`</tr>`;
  }
  html+=`</tbody></table>`;
  document.getElementById('posTableWrap').innerHTML=html;
  requestAnimationFrame(()=>{document.querySelectorAll('.pos-cell-bar').forEach(el=>{el.style.width=el.dataset.pct+'%'})});
}

function renderPairs(pairs,mode){
  if(mode===2){document.getElementById('pairCard').style.display='none';return}
  document.getElementById('pairCard').style.display='';
  document.getElementById('pairGrid').innerHTML=pairs.map(({pair,count})=>`
    <div class="pair-tag">${pair}<span class="pair-cnt">${count}ครั้ง</span></div>`).join('');
}

function renderCycles(cycles){
  const top=cycles.slice(0,5);
  const maxGap=Math.max(...top.map(c=>c.avgGap||0))||1;
  document.getElementById('cycleList').innerHTML=top.map(c=>`
    <div class="cycle-row">
      <div class="cycle-digit">${c.digit}</div>
      <div class="cycle-info">
        ${c.avgGap?`รอบเฉลี่ย <strong>${c.avgGap}</strong> งวด &nbsp;·&nbsp;`:''}
        ${c.lastSeen===0?'ออก<strong>งวดล่าสุด</strong>':c.lastSeen>0?`ไม่ออก <strong>${c.lastSeen}</strong> งวด`:'ไม่มีข้อมูล'}
        ${c.dueIn!==null?`&nbsp;· ถึงรอบอีก <strong style="color:var(--accent3)">${c.dueIn}</strong> งวด`:''}
        <div class="cycle-bar-wrap"><div class="cycle-bar-fill" style="width:0" data-pct="${c.avgGap?Math.round((c.avgGap/maxGap)*100):0}"></div></div>
      </div>
    </div>`).join('');
  requestAnimationFrame(()=>{document.querySelectorAll('.cycle-bar-fill').forEach(el=>{el.style.width=el.dataset.pct+'%'});});
}

function renderMarkov(prob,list){
  if(!list.length)return;
  const lastDigits=[...new Set([...list[0]].map(Number))].slice(0,3);
  let html='';
  lastDigits.forEach(prev=>{
    const row=Object.entries(prob[prev]).sort((a,b)=>b[1]-a[1]).slice(0,5);
    html+=`<div class="markov-row">
      <div class="markov-from">${prev}&nbsp;→</div>
      <div class="markov-targets">${row.map(([d,p])=>`<div class="markov-cell ${p>0.15?'markov-hot':''}"><span class="mc-d">${d}</span><span class="mc-p">${(p*100).toFixed(0)}%</span></div>`).join('')}</div>
    </div>`;
  });
  document.getElementById('markovSection').innerHTML=html||'<p style="color:var(--muted);font-size:12px">ต้องการข้อมูลอย่างน้อย 2 งวด</p>';
}

function renderZScore(zScore,trend){
  const sorted=Object.entries(zScore).sort((a,b)=>a[1]-b[1]);
  document.getElementById('zScoreSection').innerHTML=sorted.map(([d,z])=>{
    const t=trend[parseInt(d)]||0;
    const barW=Math.min(100,Math.abs(z)/3*100);
    const isUnder=z<-0.5,isOver=z>0.5;
    const tArrow=t>0.02?'↑':t<-0.02?'↓':'→';
    const tColor=t>0.02?'var(--accent3)':t<-0.02?'var(--accent2)':'var(--muted)';
    return `<div class="zscore-row">
      <div class="zscore-digit ${isUnder?'z-under':isOver?'z-over':''}">${d}</div>
      <div class="zscore-bars">
        <div class="zscore-bar-wrap"><div class="zscore-bar-fill ${isUnder?'zb-under':'zb-over'}" style="width:0" data-pct="${barW.toFixed(0)}"></div></div>
        <span class="zscore-val">${z.toFixed(2)}</span>
        <span class="trend-arrow" style="color:${tColor}">${tArrow}</span>
      </div>
    </div>`;
  }).join('');
  requestAnimationFrame(()=>document.querySelectorAll('.zscore-bar-fill').forEach(el=>{el.style.width=el.dataset.pct+'%';}));
}

function renderDigitSum({topSums,topRoot}){
  document.getElementById('digitSumSection').innerHTML=`
    <div class="dsum-top">
      <div class="dsum-label">ผลรวมที่ออกบ่อย</div>
      <div class="dsum-chips">${topSums.map(({sum,count})=>`<div class="dsum-chip"><span class="ds-val">${sum}</span><span class="ds-cnt">${count}ครั้ง</span></div>`).join('')}</div>
    </div>
    ${topRoot?`<div class="dsum-root">Digital Root ประจำ &rarr; <strong style="color:var(--accent);font-size:22px;font-family:var(--font-mono)">${topRoot.root}</strong> <span style="color:var(--muted);font-size:11px">(${topRoot.count}ครั้ง)</span></div>`:''}`;
}

function renderComposite(suggestions,composite,mode){
  const scores=suggestions.map(s=>[...s].reduce((acc,d)=>acc+(composite[parseInt(d)]||0),0));
  const maxS=Math.max(...scores)||1;
  document.getElementById('compositeList').innerHTML=suggestions.map((num,i)=>{
    const sc=scores[i];const pct=Math.round((sc/maxS)*100);
    return `<div class="composite-item">
      <div class="composite-num">${num}</div>
      <div class="composite-right">
        <div class="composite-score">${(sc*100).toFixed(0)}</div>
        <div class="composite-label">composite score</div>
      </div>
      <div class="composite-bar" style="width:${pct}%"></div>
    </div>`;
  }).join('');
}

function renderCombos(topN,mode){
  const card=document.getElementById('comboCard');
  if(mode===2){card.style.display='none';return}
  card.style.display='';
  const d=topN.map(t=>t.digit);
  const combos=[];
  for(let i=0;i<d.length;i++)for(let j=i+1;j<d.length;j++)combos.push(`${d[i]}${d[j]}`);
  document.getElementById('comboWrap').innerHTML=combos.slice(0,10).map(c=>`<div class="combo-tag">${c}</div>`).join('');
}

/* ══════════════════════════════
   UI HELPERS
══════════════════════════════ */
function showError(msg){const el=document.getElementById('errorAlert');el.innerHTML=msg;el.className='alert show'}
function clearError(){document.getElementById('errorAlert').className='alert'}
function setLoading(on){document.getElementById('loading').className=on?'loading show':'loading';document.getElementById('btnAnalyse').disabled=on}
function showResults(){document.getElementById('results').className='show'}

/* ══════════════════════════════
   MAIN
══════════════════════════════ */
function runAnalysis(){
  clearError();
  document.getElementById('results').className='';
  const raw=document.getElementById('inputData').value;
  const lines=parseInput(raw);
  const mode=currentMode;
  if(!lines.length){showError('⚠️ กรุณากรอกเลขหวยอย่างน้อย 1 ชุด');return}
  const errors=validateLines(lines);
  if(errors.length){
    const detail=errors.slice(0,3).map(e=>`บรรทัดที่ ${e.line}: "<strong>${e.value||'(ว่าง)'}</strong>"`).join('<br>');
    showError(`⚠️ ต้องเป็นตัวเลข 6 หลักต่อบรรทัด<br>${detail}${errors.length>3?`<br>...และอีก ${errors.length-3} รายการ`:''}`);
    return;
  }
  setLoading(true);
  setTimeout(()=>{
    try{
      const extracted=lines.map(l=>extractByMode(l,mode));

      // All algorithms
      const freq=countFrequency(extracted);
      const decayS=decayWeightedFrequency(extracted,0.88);
      const topN=Object.entries(decayS).map(([d,s])=>({digit:parseInt(d),score:s,freq:freq[d]})).sort((a,b)=>b.score-a.score).slice(0,5);
      const maxFreq=Math.max(...Object.values(freq));
      const {hotTop,coldTop,hot,lastSeen}=getHotCold(extracted,15);
      const posFreq=positionFrequency(extracted);
      const pairs=pairCooccurrence(extracted);
      const cycles=detectCycles(extracted);
      // New algorithms
      const markovProb=markovTransition(extracted);
      const markovS=markovScore(extracted,markovProb);
      const totalDigits=extracted.reduce((a,s)=>a+s.length,0);
      const zScore=zScoreAnalysis(freq,totalDigits);
      const trend=movingAverageTrend(extracted,10,20);
      const digitSum=digitSumAnalysis(extracted);
      const composite=compositeScore(decayS,posFreq,hot,lastSeen,extracted,markovS,zScore,trend);
      const suggestions=generateSuggestions(composite,posFreq,mode,5);

      // Render all
      renderModeBadge(mode,lines.length);
      renderSummary(lines,mode);
      renderFrequency(freq,topN,maxFreq);
      renderTopN(topN);
      renderHotCold({hotTop,coldTop});
      renderPosition(posFreq,mode);
      renderPairs(pairs,mode);
      renderCycles(cycles);
      renderMarkov(markovProb,extracted);
      renderZScore(zScore,trend);
      renderDigitSum({topSums:digitSum.topSums,topRoot:digitSum.topRoot});
      renderComposite(suggestions,composite,mode);
      renderCombos(topN,mode);

      setLoading(false);
      showResults();
      document.getElementById('results').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){
      setLoading(false);
      showError('เกิดข้อผิดพลาด: '+e.message);
    }
  },600);
}
