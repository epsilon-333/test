// Page-aware script handling reaction.html and click.html
function $(id){return document.getElementById(id)}
function qAll(sel, root=document){return Array.from(root.querySelectorAll(sel))}

const modal = $('modal');
const modalTitle = modal ? $('modal-title') : null;
const modalBody = modal ? $('modal-body') : null;
const modalClose = modal ? $('modal-close') : null;
const modalShare = modal ? $('modal-share') : null;

function rand(min, max){ return Math.random()*(max-min)+min }
function ms(n){ return Math.round(n) }

function pushScore(key, val){ try{ const arr = JSON.parse(localStorage.getItem(key) || '[]'); arr.push(val); localStorage.setItem(key, JSON.stringify(arr)); return arr; }catch(e){ return [val]; } }
function percentileFor(key, val, higherIsBetter=true){ try{ const arr = JSON.parse(localStorage.getItem(key) || '[]'); if(arr.length===0) return 100; if(higherIsBetter){ const less = arr.filter(x=>x<val).length; return Math.round(less/arr.length*100); } else { const worse = arr.filter(x=>x>val).length; return Math.round(worse/arr.length*100); } }catch(e){ return 100 } }

function placeDotOn(element, x, y){ const dot = document.createElement('div'); dot.className = 'click-dot'; dot.style.left = x + 'px'; dot.style.top = y + 'px'; element.appendChild(dot); setTimeout(()=>dot.remove(),900); }

function showModal(title, html, shareText){
  if(!modal) return alert(title+'\n\n'+(typeof html==='string'?html:modalBody.textContent));
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.classList.remove('hidden');
  modal.dataset.share = shareText || '';
}
function hideModal(){ if(modal) modal.classList.add('hidden'); }

if(modalClose) modalClose.addEventListener('click', hideModal);
if(modal) modal.addEventListener('click', (e)=>{ if(e.target===modal) hideModal(); });

async function doShare(text){
  if(navigator.share){
    try{ await navigator.share({text}); return }
    catch(e){}
  }
  try{ await navigator.clipboard.writeText(text); alert('결과가 클립보드에 복사되었습니다. 친구에게 붙여넣기 하세요.'); }
  catch(e){ location.href = `mailto:?subject=${encodeURIComponent('내 테스트 점수')}&body=${encodeURIComponent(text)}` }
}

if(modalShare) modalShare.addEventListener('click', ()=>{ const t = modal.dataset.share||''; if(t) doShare(t); });

// --- Reaction page ---
if(document.body.id === 'reaction-page'){
  const startBtn = $('reaction-start');
  const backBtn = $('reaction-back');
  const circle = $('circle');
  const info = $('reaction-info');
  const resultsDiv = $('reaction-results');
  const maxEl = $('max'), minEl = $('min'), avgEl = $('avg');
  const shareBtn = $('reaction-share');
  let reactionTimes = [];
  let running = false;
  let greenAt = 0;
  let chart = null;

  function setCircleRed(){ circle.classList.remove('green'); circle.classList.add('red'); circle.textContent='준비'; }
  function setCircleGreen(){ circle.classList.remove('red'); circle.classList.add('green'); circle.textContent='클릭!'; }

  function getSelectedTrials(){ const r = document.querySelector('input[name="trials"]:checked'); return r?parseInt(r.value,10):3 }

  // click handling is managed inside runSequence (listener attached per-trial)

  async function countdown(){
    const nums = ['3','2','1'];
    for(const n of nums){ circle.textContent = n; await new Promise(r=>setTimeout(r,600)); }
    circle.textContent = '준비';
  }

  async function runSequence(){
    if(running) return; running = true; reactionTimes = []; resultsDiv.classList.add('hidden');
    const trials = getSelectedTrials();
    info.textContent = `총 ${trials}회 진행합니다.`;
    await countdown();
    for(let i=0;i<trials;i++){
      info.textContent = `시도 ${i+1} / ${trials} — 준비...`;
      setCircleRed();
      // random wait: 1.0s ~ 4.0s in 0.5s steps
      const waits = [1000,1500,2000,2500,3000,3500,4000];
      const wait = waits[Math.floor(Math.random()*waits.length)];

      let greenTimeout = null;
      let lateTimeout = null;

      const result = await new Promise(resolve=>{
        function onClick(e){
          const rect = circle.getBoundingClientRect();
          const x = e.clientX - rect.left; const y = e.clientY - rect.top;
          placeDotOn(circle, x, y);
          if(circle.classList.contains('green')){
            const t = performance.now() - greenAt;
            cleanup();
            resolve({type:'hit', t});
          } else {
            // early click: cancel green, repeat
            cleanup();
            if(greenTimeout) clearTimeout(greenTimeout);
            resolve({type:'early'});
          }
        }
        function cleanup(){ circle.removeEventListener('click', onClick); if(lateTimeout){ clearTimeout(lateTimeout); lateTimeout=null; } }
        circle.addEventListener('click', onClick);
        greenTimeout = setTimeout(()=>{
          setCircleGreen(); greenAt = performance.now(); info.textContent = `시도 ${i+1} — 초록! 클릭하세요.`;
          // wait for click up to 5s
          lateTimeout = setTimeout(()=>{ cleanup(); resolve({type:'timeout'}); }, 5000);
        }, wait);
      });

      if(result.type === 'early'){
        alert('너무 빨리 클릭했습니다. 이번 시도를 다시 진행합니다.');
        info.textContent='너무 빨리 클릭했습니다 — 이번 시도 반복합니다.'; i--; setCircleRed(); await new Promise(r=>setTimeout(r,700)); continue;
      }
      if(result.type === 'timeout'){
        info.textContent='응답 없음 — 다음 시도'; i--; await new Promise(r=>setTimeout(r,700)); continue;
      }
      reactionTimes.push(ms(result.t)); info.textContent = `시도 ${i+1} 완료: ${ms(result.t)} ms`; setCircleRed(); await new Promise(r=>setTimeout(r,700));
    }
    running = false; showResults();
  }

  function showResults(){
    resultsDiv.classList.remove('hidden');
    const labels = reactionTimes.map((_,i)=>`#${i+1}`);
    const data = {labels, datasets:[{label:'반응시간 (ms)',data:reactionTimes,borderColor:'#2b7cff',backgroundColor:'#2b7cff33',tension:0.25}]};
    const ctx = document.getElementById('reaction-chart').getContext('2d');
    if(chart) chart.destroy(); chart = new Chart(ctx,{type:'line',data,options:{responsive:true,plugins:{legend:{display:false}}}});
    const mx = Math.max(...reactionTimes); const mn = Math.min(...reactionTimes);
    const avg = Math.round(reactionTimes.reduce((a,b)=>a+b,0)/reactionTimes.length);
    maxEl.textContent = mx; minEl.textContent = mn; avgEl.textContent = avg;
    const shareText = `반응속도 테스트 결과 - ${reactionTimes.join(', ')} ms (최고:${mx} 최저:${mn} 평균:${avg})`;
    if(shareBtn) shareBtn.onclick = ()=>doShare(shareText);
    // store and compute percentile (lower is better)
    const arr = pushScore('reaction_scores', avg);
    const pct = percentileFor('reaction_scores', avg, false);
    showModal('반응속도 결과', `<div>결과: ${reactionTimes.join(' ms, ')} ms</div><div style="margin-top:6px">최고: ${mx} ms • 최저: ${mn} ms • 평균: ${avg} ms</div><div style="margin-top:6px">상위 ${pct}%</div>`, shareText + ` 상위 ${pct}%`);
  }

  startBtn.addEventListener('click', runSequence);
  // allow starting by clicking the circle when idle
  circle.addEventListener('click', (e)=>{ if(!running) runSequence(); });
  backBtn.addEventListener('click', ()=>location.href='index.html');
}

// --- Click page ---
if(document.body.id === 'click-page'){
  const startBtn = $('click-start');
  const backBtn = $('click-back');
  const clickArea = $('click-area');
  const timeLeftEl = $('time-left');
  const clickCountEl = $('click-count');
  let running = false, accepting = false, count = 0, timerId = null, intervalId = null;

  function getDuration(){ const r = document.querySelector('input[name="duration"]:checked'); return r?parseInt(r.value,10):5 }

  async function startClickTest(){
    if(running) return;
    running = true; accepting = false; count = 0; clickCountEl.textContent = '0';
    const seconds = getDuration();
    // 3초 카운트다운 표시
    const prev = clickArea.textContent;
    for(let n=3;n>=1;n--){ clickArea.textContent = String(n); await new Promise(r=>setTimeout(r,1000)); }
    // 시작
    clickArea.textContent = '클릭하세요!'; accepting = true; timeLeftEl.textContent = seconds;
    const startAt = performance.now();
    intervalId = setInterval(()=>{ const elapsed = (performance.now()-startAt)/1000; timeLeftEl.textContent = Math.max(0, Math.ceil(seconds-elapsed)); }, 120);
    timerId = setTimeout(()=>{ endTest(); }, seconds*1000);
  }

  function endTest(){ clearTimeout(timerId); clearInterval(intervalId); running = false; accepting = false; clickArea.textContent = '클릭 완료';
    // save and compute percentile (higher is better)
    pushScore('click_scores', count);
    const pct = percentileFor('click_scores', count, true);
    showModal('클릭속도 결과', `<div>총 클릭: <strong>${count}</strong></div><div style="margin-top:6px">상위 ${pct}%</div>`, `클릭속도 테스트 결과 - 총 클릭: ${count} 상위 ${pct}%`);
  }

  clickArea.addEventListener('click', (e)=>{ if(!running || !accepting) return; count++; clickCountEl.textContent = String(count); const rect = clickArea.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; placeDotOn(clickArea, x, y); });
  startBtn.addEventListener('click', startClickTest);
  backBtn && backBtn.addEventListener('click', ()=>location.href='index.html');
}
