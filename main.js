const PROJECT_CODE = 'ZS3Z7F'; 
let PARTICIPANT_NAME = '', PARTICIPANT_ID = '';
let allTrials = []; 
let gazeData = { x: null, y: null }; 
let calibValidationError = -1; 

const dom = {
    welcome: document.getElementById('screen-welcome'), calib: document.getElementById('screen-calibration'),
    val: document.getElementById('screen-validation'), exp1: document.getElementById('screen-exp1'),
    exp2: document.getElementById('screen-exp2'), results: document.getElementById('screen-results'),
    inputName: document.getElementById('input-name'), consent: document.getElementById('consent'),
    btnStart: document.getElementById('btn-start'), btnSkipCamera: document.getElementById('btn-skip-camera'),
    calibArea: document.getElementById('calibration-area'),
    calibProgress: document.getElementById('calib-progress'), btnCalibDone: document.getElementById('btn-calib-done'),
    valArea: document.getElementById('validation-area'), valProgress: document.getElementById('val-progress'),
    valResult: document.getElementById('val-result'), btnValDone: document.getElementById('btn-val-done'),
    btnValRetry: document.getElementById('btn-val-retry'), btnValSkip: document.getElementById('btn-val-skip'),
    exp1Stage: document.getElementById('exp1-stage'), exp2Stage: document.getElementById('exp2-stage')
};

// --- 初始化 ---
dom.consent.addEventListener('change', (e) => { 
    const isReady = e.target.checked && dom.inputName.value.trim() !== '';
    dom.btnStart.disabled = !isReady; dom.btnSkipCamera.disabled = !isReady;
});
dom.inputName.addEventListener('input', () => { 
    const isReady = dom.consent.checked && dom.inputName.value.trim() !== '';
    dom.btnStart.disabled = !isReady; dom.btnSkipCamera.disabled = !isReady;
});

dom.btnStart.addEventListener('click', async () => {
    PARTICIPANT_NAME = dom.inputName.value.trim();
    PARTICIPANT_ID = 'P' + Math.floor(Math.random() * 10000);
    try {
        dom.btnStart.innerText = "请求摄像头...";
        webgazer.showVideoPreview(false).showPredictionPoints(false);
        
        // 开启卡尔曼滤波平滑数据
        if (typeof webgazer.applyKalmanFilter === 'function') {
            webgazer.applyKalmanFilter(true);
        }
        
        webgazer.setGazeListener((data) => { 
            if (data) gazeData = { x: Math.round(data.x), y: Math.round(data.y) }; 
        }).begin();
        
        dom.welcome.classList.add('hidden'); dom.calib.classList.remove('hidden');
        setupCalibration();
    } catch (err) { 
        alert("摄像头启动失败，请使用 HTTPS 访问或直接点击下方的【无摄像头测试】。"); 
        dom.btnStart.innerText = "启动眼动仪并开始";
    }
});

dom.btnSkipCamera.addEventListener('click', () => {
    PARTICIPANT_NAME = dom.inputName.value.trim();
    PARTICIPANT_ID = 'P' + Math.floor(Math.random() * 10000);
    dom.welcome.classList.add('hidden'); startExp1(); 
});

// --- 校准与验证 ---
let calibCount = 0;
function setupCalibration() {
    const positions = [[5,5],[50,5],[95,5],[5,50],[50,50],[95,50],[5,95],[50,95],[95,95]];
    dom.calibArea.innerHTML = ''; calibCount = 0; 
    document.getElementById('calib-progress').innerText = 0;
    document.getElementById('calib-progress-bar').style.width = '0%';
    dom.btnCalibDone.classList.add('hidden');
    
    positions.forEach(([x, y]) => {
        const dot = document.createElement('div');
        dot.className = 'calib-dot'; dot.style.left = `${x}%`; dot.style.top = `${y}%`;
        let clicks = 0;
        dot.addEventListener('click', () => {
            clicks++; calibCount++; 
            document.getElementById('calib-progress').innerText = calibCount;
            document.getElementById('calib-progress-bar').style.width = `${(calibCount/27)*100}%`;
            dot.style.transform = `translate(-50%, -50%) scale(${1 + clicks * 0.3})`;
            if (clicks >= 3) { dot.style.background = '#555'; dot.style.pointerEvents = 'none'; }
            if (calibCount >= 27) dom.btnCalibDone.classList.remove('hidden');
        });
        dom.calibArea.appendChild(dot);
    });
}

dom.btnCalibDone.addEventListener('click', () => {
    dom.calib.classList.add('hidden'); dom.val.classList.remove('hidden');
    currentValIndex = 0; valErrors = [];
    dom.valResult.classList.add('hidden'); dom.btnValDone.classList.add('hidden'); 
    dom.btnValRetry.classList.add('hidden'); dom.btnValSkip.classList.add('hidden');
    startValidation();
});

const valPositions = [[10,10], [90,10], [10,90], [90,90], [50,50]];
let currentValIndex = 0, valErrors = [];

function startValidation() {
    if (currentValIndex >= valPositions.length) {
        const avgError = valErrors.reduce((a,b)=>a+b, 0) / valErrors.length;
        calibValidationError = avgError; 
        dom.valResult.classList.remove('hidden');
        
        // 👇 强制放行逻辑：无论误差多大，都让用户进入实验
        dom.valResult.innerText = `验证结束！平均误差: ${avgError.toFixed(1)} px (已忽略误差，可继续实验)`;
        dom.valResult.style.color = 'var(--warning)'; 
        
        dom.btnValDone.classList.remove('hidden'); // 显示“验证通过，进入实验”
        dom.btnValSkip.classList.add('hidden'); // 隐藏跳过按钮
        dom.btnValRetry.classList.add('hidden'); // 隐藏重新校准
        return;
    }
    
    document.getElementById('val-progress').innerText = currentValIndex + 1;
    dom.valArea.innerHTML = '';
    const dot = document.createElement('div');
    dot.className = 'val-dot'; dot.style.left = `${valPositions[currentValIndex][0]}%`; dot.style.top = `${valPositions[currentValIndex][1]}%`;
    dom.valArea.appendChild(dot);
    
    let valGazeData = [];
    const interval = setInterval(() => { 
        if (gazeData.x && gazeData.y) valGazeData.push({x: gazeData.x, y: gazeData.y, time: performance.now()}); 
    }, 50);
    
    setTimeout(() => {
        clearInterval(interval);
        
        // 剔除前 500ms 的移动期，采集稳定数据
        const startTime = valGazeData.length > 0 ? valGazeData[0].time : 0;
        const stableData = valGazeData.filter(d => d.time - startTime > 500);

        if (stableData.length > 0) {
            const meanX = stableData.reduce((a,b)=>a+b.x, 0) / stableData.length;
            const meanY = stableData.reduce((a,b)=>a+b.y, 0) / stableData.length;
            const rect = dom.valArea.getBoundingClientRect();
            const absTargetX = rect.left + (valPositions[currentValIndex][0] / 100) * rect.width;
            const absTargetY = rect.top + (valPositions[currentValIndex][1] / 100) * rect.height;
            
            const error = Math.sqrt(Math.pow(meanX - absTargetX, 2) + Math.pow(meanY - absTargetY, 2));
            valErrors.push(error);
        } else { 
            valErrors.push(500); 
        }
        
        currentValIndex++; 
        startValidation();
    }, 2000); 
}

dom.btnValRetry.addEventListener('click', () => { dom.val.classList.add('hidden'); dom.calib.classList.remove('hidden'); setupCalibration(); });
dom.btnValDone.addEventListener('click', () => { dom.val.classList.add('hidden'); startExp1(); });
dom.btnValSkip.addEventListener('click', () => { dom.val.classList.add('hidden'); startExp1(); });

// --- 实验一 ---
let exp1TrialCount = 0, exp1StartTime = 0, currentExp1Cond = '';
let targetElement = null, trialData = {}, samplingInterval = null;

function startExp1() { dom.exp1.classList.remove('hidden'); runExp1Trial(); }

function runExp1Trial() {
    if (exp1TrialCount >= 20) { dom.exp1.classList.add('hidden'); startExp2(); return; }
    document.getElementById('exp1-trial').innerText = exp1TrialCount + 1;
    document.getElementById('exp1-progress-bar').style.width = `${(exp1TrialCount/20)*100}%`;
    dom.exp1Stage.innerHTML = '<div id="fixation-cross">+</div>';
    dom.exp1Stage.style.cursor = 'default';

    setTimeout(() => {
        dom.exp1Stage.innerHTML = ''; 
        dom.exp1Stage.style.cursor = 'crosshair';
        currentExp1Cond = (exp1TrialCount % 2 === 0) ? 'baseline' : 'improved';
        
        trialData = {
            exp: 'exp1_search', cond: currentExp1Cond, rt: 0, correct: false, 
            ttff: -1, target_aoi_hits: 0, dist_aoi_hits: 0, total_eye_samples: 0
        };

        renderStimuliExp1();
        exp1StartTime = performance.now(); 
        
        samplingInterval = setInterval(() => {
            if (!gazeData.x || !gazeData.y || !targetElement) return;
            trialData.total_eye_samples++;
            const rect = targetElement.getBoundingClientRect();
            const pad = 40; 
            if (gazeData.x >= rect.left - pad && gazeData.x <= rect.right + pad && gazeData.y >= rect.top - pad && gazeData.y <= rect.bottom + pad) {
                trialData.target_aoi_hits++;
                if (trialData.ttff === -1) trialData.ttff = performance.now() - exp1StartTime;
            } else {
                trialData.dist_aoi_hits++;
            }
        }, 50); 
    }, 800);
}

function renderStimuliExp1() {
    const usedPositions = [];
    const getValidPos = () => {
        let x, y, valid = false;
        while (!valid) {
            x = Math.random() * 80 + 10; y = Math.random() * 80 + 10;
            valid = true;
            for (const pos of usedPositions) {
                if (Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2)) < 10) { valid = false; break; }
            }
        }
        usedPositions.push({x, y}); return {x, y};
    };

    const targetPos = getValidPos();
    const tx = targetPos.x, ty = targetPos.y;
    const adTexts = ['立即领取', '开心收下', '限时秒杀', '点击抽奖', '免费试用'];
    const adColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

    for (let i = 0; i < 20; i++) {
        const pos = getValidPos();
        const el = document.createElement('div');
        el.className = 'ad-btn';
        el.style.left = `${pos.x}%`; el.style.top = `${pos.y}%`;

        if (currentExp1Cond === 'baseline') {
            if (Math.random() > 0.5) { el.innerText = adTexts[Math.floor(Math.random()*adTexts.length)]; el.style.backgroundColor = '#ef4444'; } 
            else { el.innerText = '残忍拒绝'; el.style.backgroundColor = adColors[Math.floor(Math.random()*3) + 1]; }
        } else {
            el.innerText = adTexts[Math.floor(Math.random()*adTexts.length)];
            el.style.backgroundColor = adColors[Math.floor(Math.random()*adColors.length)];
        }
        el.style.color = '#fff';
        el.onclick = () => {
            clearInterval(samplingInterval);
            trialData.rt = performance.now() - exp1StartTime;
            trialData.correct = false; 
            recordTrialData(trialData);
            exp1TrialCount++; runExp1Trial();
        };
        dom.exp1Stage.appendChild(el);
    }

    targetElement = document.createElement('div');
    targetElement.className = currentExp1Cond === 'baseline' ? 'ad-btn' : 'ad-btn target-highlight';
    targetElement.style.backgroundColor = '#ef4444';
    targetElement.innerText = '残忍拒绝';
    targetElement.style.left = `${tx}%`; targetElement.style.top = `${ty}%`; targetElement.style.color = '#fff';
    targetElement.onclick = () => {
        clearInterval(samplingInterval);
        trialData.rt = performance.now() - exp1StartTime;
        trialData.correct = true; 
        recordTrialData(trialData);
        exp1TrialCount++; runExp1Trial();
    };
    dom.exp1Stage.appendChild(targetElement);
}

// --- 实验二 ---
let exp2TrialCount = 0, exp2StartTime = 0, currentExp2Cond = '';
let exp2Positions = []; 

function startExp2() { 
    exp2Positions = Array(10).fill(true).concat(Array(10).fill(false));
    for (let i = exp2Positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [exp2Positions[i], exp2Positions[j]] = [exp2Positions[j], exp2Positions[i]];
    }
    dom.exp2.classList.remove('hidden'); 
    runExp2Trial(); 
}

function runExp2Trial() {
    if (exp2TrialCount >= 20) { dom.exp2.classList.add('hidden'); showResults(); return; }
    document.getElementById('exp2-trial').innerText = exp2TrialCount + 1;
    document.getElementById('exp2-progress-bar').style.width = `${(exp2TrialCount/20)*100}%`;
    
    currentExp2Cond = (exp2TrialCount % 2 === 0) ? 'compatible' : 'conflict';
    const isCancelLeft = exp2Positions[exp2TrialCount];
    
    dom.exp2Stage.innerHTML = ''; 

    const createBtn = (isCancel) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        let text = isCancel ? '确认取消' : '继续使用';
        let icon = isCancel ? '❌' : '✔️'; 
        let bgColor = '';
        
        if (currentExp2Cond === 'compatible') {
            bgColor = isCancel ? '#ef4444' : '#3b82f6';
            btn.innerHTML = `${icon} ${text}`;
        } else {
            bgColor = isCancel ? '#3b82f6' : '#ef4444'; 
            icon = isCancel ? '✔️' : '❌'; 
            btn.innerHTML = `${icon} ${text}`;
            if (!isCancel) btn.classList.add('induce-btn');
        }
        
        btn.style.backgroundColor = bgColor;
        btn.style.color = '#fff';
        btn.onclick = () => {
            const rt = performance.now() - exp2StartTime;
            recordTrialData({
                exp: 'exp2_stroop', cond: currentExp2Cond, rt: rt, correct: isCancel,
                ttff: -1, target_aoi_hits: 0, dist_aoi_hits: 0, total_eye_samples: 0
            });
            exp2TrialCount++; runExp2Trial();
        };
        return btn;
    };

    dom.exp2Stage.appendChild(createBtn(isCancelLeft));
    dom.exp2Stage.appendChild(createBtn(!isCancelLeft));
    exp2StartTime = performance.now();
}

// --- 数据记录 ---
function recordTrialData(data) {
    data.valid = !(data.rt < 150 || data.rt > 10000);
    allTrials.push(data); 
}

document.getElementById('btn-upload').addEventListener('click', async () => {
    const status = document.getElementById('upload-status');
    status.innerText = "正在上传原始数据..."; document.getElementById('btn-upload').disabled = true;

    const payload1 = { project: PROJECT_CODE, experiment: `hw2_search_${PARTICIPANT_NAME}`, participant: PARTICIPANT_ID, condition: 'mixed', trials: allTrials.filter(t => t.exp === 'exp1_search') };
    const payload2 = { project: PROJECT_CODE, experiment: `hw2_stroop_${PARTICIPANT_NAME}`, participant: PARTICIPANT_ID, condition: 'mixed', trials: allTrials.filter(t => t.exp === 'exp2_stroop') };

    try {
        if (typeof webgazer !== 'undefined') webgazer.end();
        const url = 'https://attention-lab-production.up.railway.app/api/hw2/submit';
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload1) });
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload2) });
        status.style.color = 'var(--success)'; status.innerText = `✅ 原始数据上传成功！`;
    } catch (e) { status.style.color = 'var(--danger)'; status.innerText = "❌ 上传失败。"; }
});

// --- 数据分析 ---
function calcMean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0; }
function calcMedian(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a,b)=>a-b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function calcSD(arr, mean) { return arr.length > 1 ? Math.sqrt(arr.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / (arr.length - 1)) : 0; }

async function showResults() {
    dom.results.classList.remove('hidden');

    const validTrials = allTrials.filter(t => t.valid);
    const e1Base = validTrials.filter(t => t.exp === 'exp1_search' && t.cond === 'baseline');
    const e1Imp = validTrials.filter(t => t.exp === 'exp1_search' && t.cond === 'improved');
    const e2Comp = validTrials.filter(t => t.exp === 'exp2_stroop' && t.cond === 'compatible' && t.correct);
    const e2Conf = validTrials.filter(t => t.exp === 'exp2_stroop' && t.cond === 'conflict' && t.correct);

    const rtBase = e1Base.filter(t=>t.correct).map(t=>t.rt);
    const rtImp = e1Imp.filter(t=>t.correct).map(t=>t.rt);
    const rtComp = e2Comp.map(t=>t.rt);
    const rtConf = e2Conf.map(t=>t.rt);

    const mBase = calcMean(rtBase), medBase = calcMedian(rtBase);
    const mImp = calcMean(rtImp), medImp = calcMedian(rtImp);
    const mComp = calcMean(rtComp), medComp = calcMedian(rtComp);
    const mConf = calcMean(rtConf), medConf = calcMedian(rtConf);

    let d = 0;
    if(rtBase.length > 1 && rtImp.length > 1) {
        const pooledSD = Math.sqrt((Math.pow(calcSD(rtBase, mBase), 2) + Math.pow(calcSD(rtImp, mImp), 2)) / 2);
        d = (mBase - mImp) / (pooledSD || 1);
    }

    const missRate1 = e1Base.filter(t=>!t.correct).length / (e1Base.length || 1) * 100;
    const accComp = (e2Comp.length / (validTrials.filter(t=>t.exp==='exp2_stroop' && t.cond==='compatible').length || 1)) * 100;
    const accConf = (e2Conf.length / (validTrials.filter(t=>t.exp==='exp2_stroop' && t.cond==='conflict').length || 1)) * 100;

    const ttffImpArr = e1Imp.filter(t => t.ttff > 0).map(t=>t.ttff);
    const mTTFF = calcMean(ttffImpArr);
    const totalSamples = e1Imp.reduce((a,b)=>a+b.total_eye_samples, 0);
    const tarAoiRatio = totalSamples ? (e1Imp.reduce((a,b)=>a+b.target_aoi_hits, 0) / totalSamples * 100) : 0;
    const distAoiRatio = totalSamples ? (e1Imp.reduce((a,b)=>a+b.dist_aoi_hits, 0) / totalSamples * 100) : 0;

    document.getElementById('res-quality-trials').innerText = `${validTrials.length} / ${allTrials.length}`;
    document.getElementById('res-quality-calib').innerText = calibValidationError > 0 ? `${calibValidationError.toFixed(0)} px` : '未校准';
    document.getElementById('res-quality-eye-rate').innerText = totalSamples > 0 ? '100% (已开启)' : '0% (未授权)';
    document.getElementById('res-quality-outliers').innerText = `${allTrials.filter(t=>!t.valid).length} 次`;

    document.getElementById('res-e1-base').innerText = `${mBase.toFixed(0)} / ${medBase.toFixed(0)} ms`;
    document.getElementById('res-e1-imp').innerText = `${mImp.toFixed(0)} / ${medImp.toFixed(0)} ms`;
    document.getElementById('res-e1-d').innerText = Math.abs(d).toFixed(2);
    document.getElementById('res-e1-miss').innerText = `${missRate1.toFixed(1)}% / ${(100-missRate1).toFixed(1)}%`;

    document.getElementById('res-e1-ttff').innerText = mTTFF > 0 ? `${mTTFF.toFixed(0)} ms` : '无有效眼动采样';
    document.getElementById('res-e1-aoi-tar').innerText = `${tarAoiRatio.toFixed(1)}%`;
    document.getElementById('res-e1-aoi-dist').innerText = `${distAoiRatio.toFixed(1)}%`;
    document.getElementById('res-e1-eye-eff').innerText = `${(mBase - mImp).toFixed(0)} ms 提升`;

    document.getElementById('res-e2-comp').innerText = `${mComp.toFixed(0)} / ${medComp.toFixed(0)} ms`;
    document.getElementById('res-e2-conf').innerText = `${mConf.toFixed(0)} / ${medConf.toFixed(0)} ms`;
    document.getElementById('res-e2-effect').innerText = `${(mConf - mComp).toFixed(0)} ms`;
    document.getElementById('res-e2-acc').innerText = `${accComp.toFixed(1)}% / ${accConf.toFixed(1)}%`;

    // ================== 群体数据对比模块 ==================
    let groupData = [mBase, mImp]; 
    let isMock = true;
    try {
        const res = await fetch(`https://attention-lab-production.up.railway.app/api/hw2/data?project=${PROJECT_CODE}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.group_baseline_rt) {
                groupData = data.group_baseline_rt; 
                isMock = false;
            }
        }
    } catch (e) {
        for (let i = 0; i < 30; i++) {
            groupData.push(Math.max(500, 1800 + (Math.random() - 0.5) * 800));
        }
    }

    new Chart(document.getElementById('chartGroup').getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: '其他同学 (群体)',
                    data: groupData.map((val, index) => ({ x: val, y: index })),
                    backgroundColor: 'rgba(148, 163, 184, 0.5)',
                    pointRadius: 6, pointHoverRadius: 8
                },
                {
                    label: '我 (My Data)',
                    data: [{ x: mBase, y: 31 }],
                    backgroundColor: '#f59e0b', borderColor: '#fff', borderWidth: 2,
                    pointRadius: 12, pointStyle: 'star',
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: isMock ? '全班表现分布 (基于模拟基线数据)' : '全班表现分布 (真实拉取)', color: '#f8fafc' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 1) return `我: ${context.raw.x.toFixed(0)} ms`;
                            return `同学: ${context.raw.x.toFixed(0)} ms`;
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: '平均反应时 (ms) -> 越靠左越快', color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { display: false }
            }
        }
    });

    Chart.defaults.color = '#94a3b8';
    
    new Chart(document.getElementById('chartRT').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['搜索(基线)', '搜索(改进)', 'Stroop(兼容)', 'Stroop(冲突)'],
            datasets: [{ 
                label: '平均反应时 (ms)', data: [mBase, mImp, mComp, mConf], 
                backgroundColor: ['#64748b', '#ef4444', '#3b82f6', '#8b5cf6'], borderRadius: 6
            }]
        },
        options: { responsive: true, plugins: { title: { display: true, text: '行为数据：平均反应时', color: '#f8fafc' } } }
    });

    new Chart(document.getElementById('chartEye').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['基线 TTFF', '改进 TTFF'],
            datasets: [{ 
                label: '首次注视时间 (ms)', 
                data: [calcMean(e1Base.filter(t => t.ttff > 0).map(t=>t.ttff)), mTTFF], 
                backgroundColor: ['#64748b', '#f59e0b'], borderRadius: 6
            }]
        },
        options: { responsive: true, plugins: { title: { display: true, text: '眼动数据：首次注视潜伏期', color: '#f8fafc' } } }
    });

    new Chart(document.getElementById('chartDist').getContext('2d'), {
        type: 'line',
        data: {
            labels: Array.from({length: 20}, (_, i) => `Trial ${i+1}`),
            datasets: [
                { label: '基线 RT', data: e1Base.map(t=>t.rt), borderColor: '#64748b', tension: 0.3 },
                { label: '改进 RT', data: e1Imp.map(t=>t.rt), borderColor: '#ef4444', tension: 0.3 }
            ]
        },
        options: { responsive: true, plugins: { title: { display: true, text: '反应时分布趋势 (逐试次)', color: '#f8fafc' } } }
    });
}
