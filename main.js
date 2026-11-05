// ==========================================
// 核心配置
// ==========================================
const PROJECT_CODE = 'ZS3Z7F'; 
let PARTICIPANT_NAME = '';
let PARTICIPANT_ID = '';
let allTrials = []; 
let gazeData = { x: null, y: null }; 

const EXP1_TRIALS = 20;
const EXP2_TRIALS = 20;

const dom = {
    welcome: document.getElementById('screen-welcome'),
    calib: document.getElementById('screen-calibration'),
    val: document.getElementById('screen-validation'),
    exp1: document.getElementById('screen-exp1'),
    exp2: document.getElementById('screen-exp2'),
    results: document.getElementById('screen-results'),
    inputName: document.getElementById('input-name'),
    consent: document.getElementById('consent'),
    btnStart: document.getElementById('btn-start'),
    calibArea: document.getElementById('calibration-area'),
    calibProgress: document.getElementById('calib-progress'),
    btnCalibDone: document.getElementById('btn-calib-done'),
    valArea: document.getElementById('validation-area'),
    valProgress: document.getElementById('val-progress'),
    valResult: document.getElementById('val-result'),
    btnValDone: document.getElementById('btn-val-done'),
    exp1Stage: document.getElementById('exp1-stage'),
    exp2Stage: document.getElementById('exp2-stage'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right')
};

// ==========================================
// 1. 欢迎页与初始化 (隐藏视频画面)
// ==========================================
dom.consent.addEventListener('change', (e) => {
    dom.btnStart.disabled = !(e.target.checked && dom.inputName.value.trim() !== '');
});
dom.inputName.addEventListener('input', () => {
    dom.btnStart.disabled = !(dom.consent.checked && dom.inputName.value.trim() !== '');
});

dom.btnStart.addEventListener('click', async () => {
    PARTICIPANT_NAME = dom.inputName.value.trim();
    PARTICIPANT_ID = 'P' + Math.floor(Math.random() * 10000);
    
    try {
        dom.btnStart.innerText = "正在请求摄像头...";
        
        // 🚨 核心修正 1：隐藏摄像头画面，静默采集
        webgazer.showVideoPreview(false); 
        // 隐藏默认的预测红点，避免干扰被试
        webgazer.showPredictionPoints(false); 

        webgazer.setGazeListener((data) => {
            if (data) gazeData = { x: Math.round(data.x), y: Math.round(data.y) };
        }).begin();
        
        dom.welcome.classList.add('hidden');
        dom.calib.classList.remove('hidden');
        setupCalibration();
    } catch (err) {
        alert("摄像头启动失败，请检查权限或使用 HTTPS/localhost 访问。");
        console.error(err);
    }
});

// ==========================================
// 2. 眼动仪校准 (Calibration)
// ==========================================
let calibCount = 0;
function setupCalibration() {
    const margin = 10;
    const positions = [
        [margin, margin], [50, margin], [100-margin, margin],
        [margin, 50], [50, 50], [100-margin, 50],
        [margin, 100-margin], [50, 100-margin], [100-margin, 100-margin]
    ];

    positions.forEach(([x, y], index) => {
        const dot = document.createElement('div');
        dot.className = 'calib-dot';
        dot.style.left = `${x}%`;
        dot.style.top = `${y}%`;
        let clicks = 0;
        
        dot.addEventListener('click', () => {
            clicks++;
            calibCount++;
            dom.calibProgress.innerText = calibCount;
            dot.style.transform = `translate(-50%, -50%) scale(${1 + clicks * 0.2})`;
            
            if (clicks >= 3) {
                dot.style.background = '#555';
                dot.style.pointerEvents = 'none';
            }

            if (calibCount >= 27) {
                dom.btnCalibDone.classList.remove('hidden');
            }
        });
        dom.calibArea.appendChild(dot);
    });
}

// 校准完成，进入验证
dom.btnCalibDone.addEventListener('click', () => {
    dom.calib.classList.add('hidden');
    dom.val.classList.remove('hidden');
    startValidation();
});

// ==========================================
// 3. 眼动仪验证 (Validation) - 核心修正 2
// ==========================================
const valPositions = [
    [20, 20], [80, 20], [20, 80], [80, 80], [50, 50] // 四个角和中心
];
let currentValIndex = 0;
let valErrors = []; // 记录误差

function startValidation() {
    if (currentValIndex >= valPositions.length) {
        // 验证结束，计算误差
        const avgError = valErrors.reduce((a,b)=>a+b, 0) / valErrors.length;
        dom.valResult.classList.remove('hidden');
        dom.btnValDone.classList.remove('hidden');
        
        // WebGazer 在网页上的典型误差是 100px - 200px 左右
        if (avgError < 200) {
            dom.valResult.innerText = `验证通过！平均误差: ${avgError.toFixed(1)} px`;
            dom.valResult.style.color = 'var(--success)';
        } else {
            dom.valResult.innerText = `误差较大 (${avgError.toFixed(1)} px)，建议重新校准。`;
            dom.valResult.style.color = 'var(--danger)';
        }
        return;
    }

    dom.valProgress.innerText = currentValIndex + 1;
    dom.valArea.innerHTML = '';
    
    const targetX = (valPositions[currentValIndex][0] / 100) * dom.valArea.clientWidth;
    const targetY = (valPositions[currentValIndex][1] / 100) * dom.valArea.clientHeight;

    const dot = document.createElement('div');
    dot.className = 'val-dot';
    dot.style.left = `${valPositions[currentValIndex][0]}%`;
    dot.style.top = `${valPositions[currentValIndex][1]}%`;
    dom.valArea.appendChild(dot);

    // 收集 1.5 秒的眼动数据
    let valGazeData = [];
    const interval = setInterval(() => {
        if (gazeData.x && gazeData.y) {
            valGazeData.push({x: gazeData.x, y: gazeData.y});
        }
    }, 50); // 每 50ms 采样一次

    setTimeout(() => {
        clearInterval(interval);
        
        // 计算这 1.5 秒内眼动的平均落点
        if (valGazeData.length > 0) {
            const meanX = valGazeData.reduce((a,b)=>a+b.x, 0) / valGazeData.length;
            const meanY = valGazeData.reduce((a,b)=>a+b.y, 0) / valGazeData.length;
            
            // 计算与目标点的欧氏距离
            const rect = dom.valArea.getBoundingClientRect();
            const absTargetX = rect.left + (valPositions[currentValIndex][0] / 100) * rect.width;
            const absTargetY = rect.top + (valPositions[currentValIndex][1] / 100) * rect.height;
            
            const error = Math.sqrt(Math.pow(meanX - absTargetX, 2) + Math.pow(meanY - absTargetY, 2));
            valErrors.push(error);
        } else {
            valErrors.push(999); // 如果丢失视线，记大误差
        }
        
        currentValIndex++;
        startValidation(); // 下一个点
    }, 1500); // 每个点注视 1.5 秒
}

dom.btnValDone.addEventListener('click', () => {
    dom.val.classList.add('hidden');
    startExp1();
});

// ==========================================
// 4. 实验一：视觉搜索
// ==========================================
let exp1TrialCount = 0;
let exp1StartTime = 0;
let currentExp1Cond = '';

const adTexts = ['立即领取', '开心收下', '限时秒杀', '点击抽奖', '免费试用'];
const adColors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'];

function startExp1() {
    dom.exp1.classList.remove('hidden');
    runExp1Trial();
}

function runExp1Trial() {
    if (exp1TrialCount >= EXP1_TRIALS) {
        dom.exp1.classList.add('hidden');
        startExp2();
        return;
    }
    
    document.getElementById('exp1-trial').innerText = exp1TrialCount + 1;
    dom.exp1Stage.innerHTML = '';
    currentExp1Cond = (exp1TrialCount % 2 === 0) ? 'baseline' : 'improved';

    for (let i = 0; i < 15; i++) {
        const btn = document.createElement('div');
        btn.className = 'ad-btn';
        btn.innerText = adTexts[Math.floor(Math.random()*adTexts.length)];
        const color = adColors[Math.floor(Math.random()*adColors.length)];
        btn.style.backgroundColor = color;
        btn.style.color = '#fff';
        btn.style.left = Math.random() * 85 + 5 + '%';
        btn.style.top = Math.random() * 85 + 5 + '%';
        
        btn.onclick = () => {
            if(btn.innerText !== '错误') {
                btn.innerText = '❌ 误触';
                btn.style.backgroundColor = '#333';
                recordTrial('exp1_search', currentExp1Cond, performance.now() - exp1StartTime, false);
            }
        };
        dom.exp1Stage.appendChild(btn);
    }

    const target = document.createElement('div');
    if (currentExp1Cond === 'baseline') {
        target.className = 'target-btn-base';
        target.innerText = '残忍拒绝';
    } else {
        target.className = 'target-btn-improved';
        target.innerText = '残忍拒绝';
    }
    target.style.left = Math.random() * 85 + 5 + '%';
    target.style.top = Math.random() * 85 + 5 + '%';
    
    target.onclick = () => {
        const rt = performance.now() - exp1StartTime;
        recordTrial('exp1_search', currentExp1Cond, rt, true);
        exp1TrialCount++;
        runExp1Trial();
    };
    dom.exp1Stage.appendChild(target);

    exp1StartTime = performance.now();
}

// ==========================================
// 5. 实验二：UI Stroop
// ==========================================
let exp2TrialCount = 0;
let exp2StartTime = 0;
let currentExp2Cond = '';

function startExp2() {
    dom.exp2.classList.remove('hidden');
    runExp2Trial();
}

function runExp2Trial() {
    if (exp2TrialCount >= EXP2_TRIALS) {
        dom.exp2.classList.add('hidden');
        showResults();
        return;
    }

    document.getElementById('exp2-trial').innerText = exp2TrialCount + 1;
    currentExp2Cond = (exp2TrialCount % 2 === 0) ? 'compatible' : 'conflict';
    const isCancelLeft = Math.random() > 0.5;
    
    const setBtn = (btn, isCancel, cond) => {
        btn.innerText = isCancel ? '确认取消' : '继续使用';
        let colorClass = '';
        if (cond === 'compatible') colorClass = isCancel ? 'btn-red' : 'btn-blue';
        else colorClass = isCancel ? 'btn-blue' : 'btn-red';
        
        btn.className = 'choice-btn ' + colorClass;
        btn.onclick = () => {
            const rt = performance.now() - exp2StartTime;
            recordTrial('exp2_stroop', currentExp2Cond, rt, isCancel);
            exp2TrialCount++;
            runExp2Trial();
        };
    };

    setBtn(dom.btnLeft, isCancelLeft, currentExp2Cond);
    setBtn(dom.btnRight, !isCancelLeft, currentExp2Cond);
    exp2StartTime = performance.now();
}

// ==========================================
// 6. 数据记录与上传引擎
// ==========================================
function recordTrial(experiment, cond, rt, correct) {
    if (rt < 150 || rt > 10000) return; 
    allTrials.push({
        exp: experiment,
        cond: cond,
        rt: Math.round(rt),
        correct: correct ? 1 : 0,
        gaze_x: gazeData.x,
        gaze_y: gazeData.y
    });
}

document.getElementById('btn-upload').addEventListener('click', async () => {
    const status = document.getElementById('upload-status');
    status.innerText = "正在上传数据...";
    document.getElementById('btn-upload').disabled = true;

    const exp1Data = allTrials.filter(t => t.exp === 'exp1_search');
    const exp2Data = allTrials.filter(t => t.exp === 'exp2_stroop');
    const formatData = (arr) => arr.map(t => ({ cond: t.cond, rt: t.rt, correct: t.correct, gx: t.gaze_x, gy: t.gaze_y }));

    const payload1 = { project: PROJECT_CODE, experiment: `hw2_search_${PARTICIPANT_NAME}`, participant: PARTICIPANT_ID, condition: 'mixed', trials: formatData(exp1Data) };
    const payload2 = { project: PROJECT_CODE, experiment: `hw2_stroop_${PARTICIPANT_NAME}`, participant: PARTICIPANT_ID, condition: 'mixed', trials: formatData(exp2Data) };

    try {
        if (typeof webgazer !== 'undefined') webgazer.end();
        const url = 'https://attention-lab-production.up.railway.app/api/hw2/submit';
        
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload1) });
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload2) });

        status.style.color = '#2ecc71';
        status.innerText = `✅ ${PARTICIPANT_NAME} 的数据上传成功！感谢您的参与。`;
    } catch (e) {
        status.style.color = '#e74c3c';
        status.innerText = "❌ 上传失败，请检查网络。";
    }
});

// ==========================================
// 7. 结果分析
// ==========================================
function calcMean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0; }
function calcSD(arr, mean) { return arr.length > 1 ? Math.sqrt(arr.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / (arr.length - 1)) : 0; }

function showResults() {
    dom.results.classList.remove('hidden');

    const exp1BaseRT = allTrials.filter(t => t.exp === 'exp1_search' && t.cond === 'baseline' && t.correct).map(t => t.rt);
    const exp1ImpRT = allTrials.filter(t => t.exp === 'exp1_search' && t.cond === 'improved' && t.correct).map(t => t.rt);
    const exp2CompRT = allTrials.filter(t => t.exp === 'exp2_stroop' && t.cond === 'compatible' && t.correct).map(t => t.rt);
    const exp2ConfRT = allTrials.filter(t => t.exp === 'exp2_stroop' && t.cond === 'conflict' && t.correct).map(t => t.rt);

    const mExp1Base = calcMean(exp1BaseRT);
    const sdExp1Base = calcSD(exp1BaseRT, mExp1Base);
    const mExp1Imp = calcMean(exp1ImpRT);
    const sdExp1Imp = calcSD(exp1ImpRT, mExp1Imp);
    const mExp2Comp = calcMean(exp2CompRT);
    const mExp2Conf = calcMean(exp2ConfRT);

    let cohensD = 0;
    if(exp1BaseRT.length > 1 && exp1ImpRT.length > 1) {
        const diffMean = mExp1Base - mExp1Imp;
        const pooledSD = Math.sqrt((Math.pow(sdExp1Base, 2) + Math.pow(sdExp1Imp, 2)) / 2);
        cohensD = diffMean / (pooledSD || 1);
    }

    document.getElementById('res-exp1-base').innerText = mExp1Base.toFixed(0);
    document.getElementById('res-exp1-base-sd').innerText = sdExp1Base.toFixed(0);
    document.getElementById('res-exp1-imp').innerText = mExp1Imp.toFixed(0);
    document.getElementById('res-exp1-imp-sd').innerText = sdExp1Imp.toFixed(0);
    document.getElementById('res-exp1-d').innerText = Math.abs(cohensD).toFixed(2);
    
    const exp1Diff = mExp1Base - mExp1Imp;
    document.getElementById('res-exp1-text').innerHTML = exp1Diff > 0 
        ? `得益于视觉显著性锚点，找按钮速度快了 <b>${exp1Diff.toFixed(0)}ms</b>。验证了 SEEV 理论中显著性对注意捕获的强力驱动。`
        : `改进效果不明显，可能因为干扰项过多导致视觉拥挤。`;

    const stroopEffect = mExp2Conf - mExp2Comp;
    document.getElementById('res-exp2-effect').innerText = stroopEffect.toFixed(0) + " ms";
    
    let compareText = stroopEffect > 80 ? "更高" : (stroopEffect < 50 ? "较低" : "相当");
    document.getElementById('res-exp2-compare').innerText = compareText;

    const ctx = document.getElementById('resultChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['搜索(基线)', '搜索(改进)', 'Stroop(兼容)', 'Stroop(冲突)'],
            datasets: [{ label: '平均反应时 (ms)', data: [mExp1Base, mExp1Imp, mExp2Comp, mExp2Conf], backgroundColor: ['#777', '#e74c3c', '#3498db', '#9b59b6'] }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, title: { display: true, text: '反应时 (ms)' } } }, plugins: { legend: { display: false } } }
    });
}