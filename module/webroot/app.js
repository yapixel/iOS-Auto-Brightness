// SPDX-License-Identifier: GPL-3.0-only
const $ = (id) => document.getElementById(id);
const root = '/data/adb/modules/ios_auto_brightness';
const quote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
let sequence = 0, busy = false, polling = false, dirty = false;
let legacyGamma = '2.2', runtime = null, rawInvalid = false;
const isTest = typeof navigator === 'undefined';
let lang = isTest ? 'zh' : ((typeof localStorage !== 'undefined' && localStorage.getItem('iab_lang')) || 'en');

const deviceMap = {
  'y700-main': 'Lenovo Legion Y700 Wuji (Gen 5 / TB324ZC)',
  'cheetah-main': 'Google Pixel 7 Pro (cheetah)',
  'altdb-main-hyperos4': 'Xiaomi 17 Pro Max (altdb)'
};

const I18N = {
  zh: {
    tagline: '让亮度记住你的偏好',
    titleStatus: '运行状态',
    refresh: '刷新状态',
    startService: '启动服务',
    serviceHint: '禁用模块后所有服务退出；重新启用后可点击“启动服务”恢复，无需保留后台监控。首次安装仍需重启。',
    backlightHint: '背光节点只读监测：请求值与驱动回报分别显示，不代表实测屏幕亮度；多节点不自动推断主副屏。',
    titleCurve: '亮度曲线',
    curveLegend: '蓝色：基础曲线 · 橙色：学习曲线 · 紫色：阳光模式。纵轴为面板亮度比例，最终输出受系统上限限制。',
    titleLearning: '曲线偏好样本',
    learningHint: '滑块调节记录相对预设曲线的偏好。多个样本共同生成平滑、单调且偏移有界的曲线，不强制穿过每个样本。样本保存后重启仍生效；旧版固定点记录独立保留。温控和系统限亮期间禁止学习。',
    learnArm: '学习下一次手动调节（30 秒）',
    export: '导出学习数据',
    importLabel: '导入',
    clear: '清除当前来源学习',
    titleTuning: '调光设置',
    save: '保存并应用',
    defaults: '载入默认设置',
    configImportLabel: '导入配置（含 v6）',
    tuningHint: '夜间修正作用于默认曲线，明确学习点优先。低电量限亮始终服从系统上限。旧版 Gamma 仅保留为兼容信息，学习使用系统实际亮度。',
    rawSummary: '原始配置',
    saveRaw: '保存原始配置',
    titleSensor: '光感选择',
    sensorHint: '留空使用自动发现；支持指定完整传感器名称，或具有真实 lux 单位的 sysfs 节点。学习记录按来源隔离。',
    sensorRead: '读取选择与传感器列表',
    sensorSave: '保存光感选择',
    titleDiag: '诊断',
    diagnose: '完整诊断（含离线检查）',
    logs: '读取最近日志',
    clearLog: '清空日志及备份',
    liveLogLabel: '自动刷新日志',
    cards: ['服务','控制状态','输出方式','背光状态','模式','环境光','目标','框架报告亮度','系统滑块值','处理间隔','光感来源','当前系统上限'],
    fields: {
      night_enabled:'夜间默认亮度降低 5%', low_battery_enabled:'低于 15% 电量额外限亮',
      enabled:'启用调光', learning_enabled:'记住手动调节',
      settings_learning:'持续兼容学习（根据设置变化；可能误学）',
      manual_gamma:'滑块换算 Gamma',
      alpha_fast:'快速响应', alpha_mid:'中速响应', alpha_slow:'慢速稳定',
      fast_threshold:'快速变化阈值', slow_threshold:'稳定阈值',
      spike_up:'上升尖峰阈值', spike_down:'下降尖峰阈值',
      hyst_low:'低亮度回差', hyst_high:'高亮度回差',
      high_lux_threshold:'阳光模式照度阈值', high_lux_boost_max:'阳光最高增益',
      high_lux_min_pct:'阳光模式亮度下限', high_lux_duration_ms:'强光退出延迟（毫秒）',
      user_hold_ms:'手动调整后等待（毫秒）',
      log_max_bytes:'日志上限（字节）', log_max_backups:'日志备份份数'
    }
  },
  en: {
    tagline: 'Adaptive brightness that remembers your preferences',
    titleStatus: 'Runtime Status',
    refresh: 'Refresh Status',
    startService: 'Start Service',
    serviceHint: 'All services exit when module is disabled. After re-enabling, click "Start Service" to restore without background monitoring. First install still requires reboot.',
    backlightHint: 'Backlight read-only monitoring: requested value and driver report are shown separately, not representing measured panel brightness; multiple nodes do not infer dual displays.',
    titleCurve: 'Brightness Curve',
    curveLegend: 'Blue: Baseline curve · Orange: Learned curve · Purple: Sunlight mode. Y-axis is panel ratio; bounded by system limit.',
    titleLearning: 'Curve Preference Samples',
    learningHint: 'Slider adjustments record preferences relative to baseline. Multiple samples generate a smooth, monotonic, bounded curve. Saved across reboots. Learning is blocked during thermal throttling or system capping.',
    learnArm: 'Learn Next Manual Adjustment (30s)',
    export: 'Export Learning Data',
    importLabel: 'Import',
    clear: 'Clear Current Source Learning',
    titleTuning: 'Tuning Settings',
    save: 'Save & Apply',
    defaults: 'Load Defaults',
    configImportLabel: 'Import Config (incl. v6)',
    tuningHint: 'Night shift dims baseline by 5%. Explicit learning points take precedence. Low-battery limit obeys system cap. Legacy gamma is retained for compatibility only; learning operates on direct brightness.',
    rawSummary: 'Raw Configuration',
    saveRaw: 'Save Raw Configuration',
    titleSensor: 'Sensor Selection',
    sensorHint: 'Leave blank for auto discovery. Supports full sensor names or sysfs nodes with real lux units. Learning is isolated per sensor source.',
    sensorRead: 'Read Selection & Sensor List',
    sensorSave: 'Save Sensor Selection',
    titleDiag: 'Diagnostics',
    diagnose: 'Full Diagnostics (incl. offline)',
    logs: 'Read Recent Logs',
    clearLog: 'Clear Logs & Backups',
    liveLogLabel: 'Auto-refresh logs',
    cards: ['Service','Control State','Output Backend','Backlight Status','Mode','Ambient Light','Target','Framework Brightness','System Slider','Poll Interval','Sensor Source','System Cap'],
    fields: {
      night_enabled:'Night mode: -5% baseline', low_battery_enabled:'Low battery (<15%) limit',
      enabled:'Enable Auto Brightness', learning_enabled:'Learn Manual Adjustments',
      settings_learning:'Settings Learning (fallback; may mislearn)',
      manual_gamma:'Slider Gamma',
      alpha_fast:'Fast Response Alpha', alpha_mid:'Mid Response Alpha', alpha_slow:'Slow Steady Alpha',
      fast_threshold:'Fast Change Threshold', slow_threshold:'Slow Steady Threshold',
      spike_up:'Spike Up Threshold', spike_down:'Spike Down Threshold',
      hyst_low:'Low Lux Hysteresis', hyst_high:'High Lux Hysteresis',
      high_lux_threshold:'Sunlight Threshold (lux)', high_lux_boost_max:'Sunlight Max Boost',
      high_lux_min_pct:'Sunlight Min Ratio', high_lux_duration_ms:'Sunlight Exit Delay (ms)',
      user_hold_ms:'User Hold Delay (ms)',
      log_max_bytes:'Log Max Size (bytes)', log_max_backups:'Log Max Backups'
    }
  }
};

const defaults = new Map(Object.entries({"enabled": "1", "learning_enabled": "1", "settings_learning": "0", "night_enabled": "1", "low_battery_enabled": "1", "manual_gamma": "2.2", "alpha_fast": "0.45", "alpha_mid": "0.20", "alpha_slow": "0.06", "fast_threshold": "1.0", "slow_threshold": "0.05", "spike_up": "15", "spike_down": "0.05", "hyst_low": "0.025", "hyst_high": "0.03", "high_lux_threshold": "15000", "high_lux_boost_max": "0.35", "high_lux_min_pct": "0.90", "high_lux_duration_ms": "8000", "user_hold_ms": "5000", "log_max_bytes": "1048576", "log_max_backups": "2"}));
const fields = [
  ['night_enabled','夜间默认亮度降低 5%',0,1,1], ['low_battery_enabled','低于 15% 电量额外限亮',0,1,1],
  ['enabled','启用调光',0,1,1], ['learning_enabled','记住手动调节',0,1,1],
  ['settings_learning','持续兼容学习（根据设置变化；可能误学）',0,1,1],
  ['manual_gamma','滑块换算 Gamma',1.2,3.5,.1],
  ['alpha_fast','快速响应',.01,.9,.01],['alpha_mid','中速响应',.01,.9,.01],['alpha_slow','慢速稳定',.001,.9,.001],
  ['fast_threshold','快速变化阈值',.1,5,.05],['slow_threshold','稳定阈值',.001,.5,.001],
  ['spike_up','上升尖峰阈值',2,50,.5],['spike_down','下降尖峰阈值',.001,.5,.001],
  ['hyst_low','低亮度回差',0,.2,.005],['hyst_high','高亮度回差',0,.2,.005],
  ['high_lux_threshold','阳光模式照度阈值',5000,100000,500],['high_lux_boost_max','阳光最高增益',0,1,.01],
  ['high_lux_min_pct','阳光模式亮度下限',0,1,.01],['high_lux_duration_ms','强光退出延迟（毫秒）',1000,20000,500],
  ['user_hold_ms','手动调整后等待（毫秒）',2000,30000,500],
  ['log_max_bytes','日志上限（字节）',65536,8388608,65536],['log_max_backups','日志备份份数',1,8,1],
];

function note(text) { $('notice').textContent = text; }
function exec(command,timeoutMs=10000) {
  return new Promise((resolve,reject) => {
    if (!window.ksu?.exec) return reject(new Error(lang === 'zh' ? '请使用支持 ksu.exec 的 Root 管理器 WebUI（Magisk 可使用兼容的 WebUI 宿主）。' : 'Root manager WebUI with ksu.exec required.'));
    const key = `iab_${Date.now()}_${sequence++}`;
    const timer = setTimeout(() => { delete window[key]; reject(new Error(lang === 'zh' ? '操作响应超时，请刷新状态并查看诊断' : 'Operation timed out; refresh status and check diagnostics')); },timeoutMs);
    window[key] = (code,stdout,stderr) => {clearTimeout(timer);delete window[key];Number(code) === 0 ? resolve(stdout) : reject(new Error(stderr || stdout || `错误 ${code}`));};
    try {window.ksu.exec(command,'{}',key);} catch(e) {clearTimeout(timer);delete window[key];reject(e);}
  });
}
async function ctl(command,payload) {
  const result = JSON.parse(await exec(`sh ${quote(`${root}/control.sh`)} ${quote(command)}${payload === undefined ? '' : ` ${quote(payload)}`}`,command==='start'?60000:10000));
  if (!result.ok) throw new Error(result.error || (lang === 'zh' ? '操作失败' : 'Operation failed'));
  return result;
}
function base64(text) { const bytes = new TextEncoder().encode(text);let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s); }
function parseConfig(text) {
  const entries={};
  for(const row of text.split('\n')) {
    const line=row.split('#')[0].trim();if(!line)continue;
    const m=line.match(/^(\w+)\s*=\s*([^=]+)$/);
    if(!m||Object.hasOwn(entries,m[1])||!Number.isFinite(Number(m[2])))throw new Error(lang === 'zh' ? '配置格式错误或键重复' : 'Config format error or duplicate key');
    entries[m[1]]=m[2].trim();
  }
  return entries;
}
function syncControls(text) {
  const entries=parseConfig(text);legacyGamma=entries.manual_gamma??'2.2';
  for(const [key] of fields){const input=$(key),value=entries[key]??defaults.get(key)??'';if(input.type==='checkbox')input.checked=value==='1';else input.value=value;const range=$(`${key}_range`);if(range)range.value=value;}
}
function setConfig(text) { $('config').value=text;try{syncControls(text);rawInvalid=false;preview();}catch(e){rawInvalid=true;throw e;} }
function updateKey(key,value) {
  const lines=$('config').value.split('\n');let found=false;
  const re=new RegExp(`^\\s*${key}\\s*=`);
  for(let i=0;i<lines.length;i++)if(re.test(lines[i])){lines[i]=`${key}=${value}`;found=true;}
  if(!found)lines.push(`${key}=${value}`);
  $('config').value=lines.join('\n');dirty=true;rawInvalid=false;preview();
}

function renderControls() {
  $('controls').replaceChildren();
  for (const [key,,min,max,step] of fields) {
    const label = I18N[lang]?.fields?.[key] ?? I18N.zh.fields[key];
    const row=document.createElement('div');row.className='field';
    const title=document.createElement('label');title.htmlFor=key;title.textContent=label;
    const input=document.createElement('input');input.id=key;input.type=max===1&&step===1?'checkbox':'number';
    input.min=min;input.max=max;input.step=step;
    input.addEventListener('input',()=>{if(rawInvalid){note(lang === 'zh' ? '请先修复原始配置格式' : 'Fix raw config syntax first');return;}updateKey(key,input.type==='checkbox'?(input.checked?1:0):input.value);if(input.type!=='checkbox')$(`${key}_range`).value=input.value;});
    row.append(title,input);
    if(input.type!=='checkbox'){const range=document.createElement('input');range.id=`${key}_range`;range.type='range';range.min=min;range.max=max;range.step=step;range.setAttribute('aria-label',label);range.addEventListener('input',()=>{if(rawInvalid)return;input.value=range.value;updateKey(key,range.value);});row.append(range);}
    $('controls').append(row);
  }
}
renderControls();

function applyLanguage(l) {
  lang = l;
  if (typeof localStorage !== 'undefined') localStorage.setItem('iab_lang', lang);
  if ($('langToggle')) $('langToggle').textContent = lang === 'zh' ? 'English' : '中文';
  const t = I18N[lang] || I18N.en;
  for (const [id, text] of Object.entries(t)) {
    if (id === 'cards' || id === 'fields') continue;
    const el = $(id);
    if (el) {
      if (id === 'importLabel' || id === 'configImportLabel') {
        const input = el.querySelector('input');
        el.textContent = text;
        if (input) el.append(input);
      } else {
        el.textContent = text;
      }
    }
  }
  renderControls();
  if ($('config').value) {
    try { syncControls($('config').value); } catch(e) {}
  }
  if (runtime) refresh(false);
}

if ($('langToggle')) {
  $('langToggle').onclick = () => applyLanguage(lang === 'zh' ? 'en' : 'zh');
}

$('config').addEventListener('input',()=>{dirty=true;try{syncControls($('config').value);rawInvalid=false;preview();}catch(e){rawInvalid=true;note(e.message);}});
function chart(points, current) {
  const ns='http://www.w3.org/2000/svg';$('chart').replaceChildren();
  for(let value=0;value<=100;value+=20){const line=document.createElementNS(ns,'path');line.setAttribute('d',`M30,${200-value*1.8} H580`);line.setAttribute('stroke','#ddd');$('chart').append(line);const label=document.createElementNS(ns,'text');label.setAttribute('x','0');label.setAttribute('y',200-value*1.8);label.textContent=`${value}%`;$('chart').append(label);}
  for(const lux of [0,1,10,100,1000,10000,100000]){const label=document.createElementNS(ns,'text');label.setAttribute('x',20+Math.log1p(lux)/Math.log(100001)*560);label.setAttribute('y','216');label.setAttribute('text-anchor',lux===100000?'end':'start');label.textContent=String(lux);$('chart').append(label);}
  for (const [index,color] of [[1,'#3879e5'],[2,'#ec9c32'],[3,'#af52de']]) {
    const path=document.createElementNS(ns,'path');
    path.setAttribute('d',points.map((p,i)=>`${i?'L':'M'}${20+Math.log1p(p[0])/Math.log(100001)*560},${200-Math.min(1,Math.max(0,(p[index]??p[2])))*180}`).join(' '));
    path.setAttribute('fill','none');path.setAttribute('stroke',color);path.setAttribute('stroke-width','2.5');$('chart').append(path);
  }
  if(current&&current.lux>=0&&current.current>=0) {
    const dot=document.createElementNS(ns,'circle');
    dot.setAttribute('cx',20+Math.log1p(Math.min(100000,current.lux))/Math.log(100001)*560);
    dot.setAttribute('cy',200-Math.min(1,Math.max(0,current.current))*180);
    dot.setAttribute('r','4');dot.setAttribute('fill','#b43b5d');$('chart').append(dot);
  }
}
function preview() {
  const live=runtime;
  if(!runtime?.curve) {
    const nits=(l)=>l<=.5?.222+l*1.556:l<=2?1+Math.log(l/.5)/Math.log(4)*2:l<=10?3+Math.log(l/2)/Math.log(5)*12:l<=100?15+Math.log(l/10)/Math.log(10)*85:l<=1000?100+Math.log(l/100)/Math.log(10)*200:l<=10000?300+Math.log(l/1000)/Math.log(10)*200:500+Math.log(l/10000)/Math.log(10)*38.5;
    runtime={curve:Array.from({length:81},(_,i)=>{const lux=Math.expm1(i*Math.log(100001)/80);return [lux,nits(lux)/538.5];}),maximum:1,points:[]};
  }
  try {
    const c=parseConfig($('config').value), hour=runtime.local_hour??new Date().getHours();
    const scale=(Number(c.night_enabled??1)&&(hour>=18||hour<6)) ? .95 : 1;
    const points=runtime.points??[], offset=runtime.legacy_offset??0;
    const base=(lux)=>{
      const rows=runtime.curve;let i=rows.findIndex(p=>p[0]>=lux);if(i<0)i=rows.length-1;
      if(i===0)return Math.max(0,Math.min(1,(rows[0][1]+offset)*scale));
      const a=rows[i-1],b=rows[i],t=(Math.log1p(lux)-Math.log1p(a[0]))/(Math.log1p(b[0])-Math.log1p(a[0]));
      return Math.max(0,Math.min(1,(a[1]+t*(b[1]-a[1])+offset)*scale));
    };
    const learned=(lux)=>{
      if(runtime.learning_model==='bounded_curve_offset') {
        const rows=runtime.curve;let i=rows.findIndex(p=>p[0]>=lux);if(i<0)i=rows.length-1;
        let value=rows[i][2];
        if(i>0){const a=rows[i-1],b=rows[i],t=(Math.log1p(lux)-Math.log1p(a[0]))/(Math.log1p(b[0])-Math.log1p(a[0]));value=a[2]+t*(b[2]-a[2]);}
        return Math.max(0,Math.min(1,value/(runtime.night_scale||1)*scale));
      }
      if(!points.length)return base(lux);
      const first=points[0],last=points.at(-1),left=Math.max(0,(first.lux+1)/10-1),right=Math.min(200000,(last.lux+1)*10-1);
      const knots=points.map(p=>[p.lux,p.brightness]);
      if(left<first.lux)knots.unshift([left,Math.min(base(left),first.brightness)]);
      if(right>last.lux)knots.push([right,Math.max(base(right),last.brightness)]);
      if(lux<left)return Math.min(base(lux),knots[0][1]);if(lux>right)return Math.max(base(lux),knots.at(-1)[1]);
      let i=knots.findIndex(p=>p[0]>=lux);if(i<=0)return knots[0][1];
      const a=knots[i-1],b=knots[i];return a[1]+(b[1]-a[1])*(Math.log1p(lux)-Math.log1p(a[0]))/(Math.log1p(b[0])-Math.log1p(a[0]));
    };
    const threshold=Number(c.high_lux_threshold??15000), gain=Number(c.high_lux_boost_max??.35),floor=Number(c.high_lux_min_pct??.9),cap=runtime.maximum??1;
    chart(runtime.curve.map(p=>{const normal=learned(p[0]),progress=Math.max(0,Math.min(1,(p[0]-threshold)/threshold));return [p[0],p[1]*scale,normal,Math.min(cap,Math.max(normal*(1+progress*gain),runtime.control_policy==='v68'&&p[0]>=threshold?cap*floor:normal+progress*Math.max(0,cap*floor-normal)))];}),runtime);
    $('previewState').textContent=dirty ? (lang === 'zh' ? '未保存配置预览（稳态示意，不包含过渡、保护与限温）' : 'Unsaved preview (steady-state, excluding transitions/protection)') : (lang === 'zh' ? '已保存配置曲线（稳态示意）' : 'Saved curve (steady-state)');
  }catch(e){note(e.message);}finally{runtime=live;if(!live)$('previewState').textContent=lang === 'zh' ? '离线示例预览：未经当前屏幕校准，不代表实际输出' : 'Offline sample preview: uncalibrated';}
}
async function readConfig() {try{return (await ctl('config-get')).data;}catch{return exec(`sh ${quote(`${root}/control.sh`)} config-read`);}}
async function refresh(load=false) {
  if(polling)return;polling=true;
  try {
    const s=await ctl('status');
    runtime=s;$('version').textContent=`reF1nd · ${s.version??'v7'}`;
    $('status').replaceChildren();
    const cardLabels = (lang === 'zh' || isTest) ? I18N.zh.cards : I18N.en.cards;
    const cardRows = [
      [cardLabels[0],s.bridge],
      [cardLabels[1],s.protection&&s.protection!=='clear'?(lang==='zh'?'系统保护':'System Protection'):s.ambient_guard?(lang==='zh'?'位置变化保护':'Ambient Guard'):s.reason],
      [cardLabels[2],s.output_backend==='direct_sysfs'?(lang==='zh'?'直接写背光':'Direct Backlight'):s.output_backend??'—'],
      [cardLabels[3],s.output_status??'—'],
      [cardLabels[4],s.mode],
      [cardLabels[5],s.lux>=0?`${s.lux.toFixed(1)} lux`:(lang==='zh'?'等待传感器':'Waiting for sensor')],
      [cardLabels[6],s.target===undefined?'—':`${(s.target*100).toFixed(2)}%`],
      [cardLabels[7],s.current===undefined?'—':`${(s.current*100).toFixed(2)}%`],
      [cardLabels[8],s.slider??'—'],
      [cardLabels[9],s.poll_ms===undefined?'—':`${s.poll_ms} ms`],
      [cardLabels[10],s.lux_source??'—'],
      [cardLabels[11],s.maximum===undefined?'—':`${(s.maximum*100).toFixed(1)}%`]
    ];
    for(const [label,value] of cardRows) {
      const box=document.createElement('div');box.className='card';const l=document.createElement('span'),v=document.createElement('strong');l.textContent=label;v.textContent=value??'—';box.append(l,v);$('status').append(box);
    }
    $('learningState').textContent=lang === 'zh' ? `存储：${s.storage??'未知'} · 调节事件：${s.event_status??'等待'} · 用户序号：${s.user??'—'}` : `Storage: ${s.storage??'unknown'} · Event: ${s.event_status??'idle'} · User: ${s.user??'—'}`;
    $('points').replaceChildren();const table=document.createElement('table');
    for(const p of s.points??[]){const tr=document.createElement('tr');for(const value of [`${p.lux.toFixed(1)} lux`,`${(p.brightness*100).toFixed(2)}%`,new Date(p.time).toLocaleString()]){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}$('points').append(table);
    $('diagnostics').textContent=JSON.stringify({output_backend:s.output_backend,output_status:s.output_status,backlight_write_locked:s.backlight_write_locked,driver_learning_status:s.driver_learning_status,backlight_node:s.backlight_node,backlight_requested:s.backlight_requested,backlight_actual:s.backlight_actual,backlight_maximum:s.backlight_maximum,profile:s.profile,calibration:s.calibration,brightness_listener:s.brightness_listener,interaction_guard:s.interaction_guard,learning_available:s.learning_available,event_capability:s.event_capability,learning_value_source:s.learning_value_source,settings_learning:s.settings_learning,window_override_detection:s.window_override_detection,sensor:s.sensor,back_sensor:s.back_sensor,proximity_sensor:s.proximity_sensor,temperature:s.temperature,battery:s.battery,observation_only:s.observation_only,config_status:s.config_status,last_event_rejection:s.last_event_rejection,events_dropped:s.events_dropped,uptime_ms:s.uptime_ms,cpu_bridge_percent:s.cpu_percent,cpu_core_percent:s.cpu_core_percent,cpu_total_percent:(s.cpu_percent??0)+(s.cpu_core_percent??0),protection:s.protection,protection_signals:s.protection_signals,thermal_status:s.thermal_status,brightness_max_reason:s.brightness_max_reason,learning_scope:s.learning_scope,manual_learning_armed:s.manual_learning_armed,sensor_selection:s.sensor_selection,input_lux:s.input_lux,fusion_policy:s.fusion_policy,proximity_near:s.proximity_near,front_lux:s.front_lux,back_lux:s.back_lux,back_lux_effective:s.back_lux_effective,back_sample_age_ms:s.back_sample_age_ms,lux_source:s.lux_source,fallback_status:s.fallback_status,poll_ms:s.poll_ms,alpha:s.alpha,fast_dark:s.fast_dark,ambient_guard:s.ambient_guard,night_scale:s.night_scale,slider_gamma:legacyGamma,control_policy:s.control_policy,learning_model:s.learning_model},null,2);
    $('learnArm').hidden=s.control_policy==='v68';
    $('settings_learning').disabled=s.control_policy==='v68';
    $('user_hold_ms').disabled=s.control_policy==='v68';
    preview();
    $('curvePoint').textContent=lang === 'zh'
      ? `红点：框架报告亮度 · 照度 ${s.lux>=0?s.lux.toFixed(2):'—'} lux · 系统设置 ${s.setting>=0?(s.setting*100).toFixed(2):'—'}%`
      : `Red dot: Framework brightness · Ambient ${s.lux>=0?s.lux.toFixed(2):'—'} lux · Setting ${s.setting>=0?(s.setting*100).toFixed(2):'—'}%`;
    if(load&&!dirty)setConfig(await readConfig());
    if(!busy)note(s.protection&&s.protection!=='clear'?(lang==='zh'?'系统保护优先：已释放亮度控制并暂停学习。':'System protection: released brightness control and paused learning.'):s.ambient_guard?(lang==='zh'?'前后光感变化不一致：保持亮度，暂停学习。':'Ambient disparity: holding brightness, pausing learning.'):s.observation_only?(lang==='zh'?'观察模式：记录学习，不控制屏幕。':'Observation mode: recording preferences without controlling screen.'):s.control_policy==='v68'?(lang==='zh'?'参考调光流程：多个偏好样本共同修正预设曲线，偏移有界并持久保存。':'Reference policy: preference samples calibrate baseline curve.'):s.settings_learning?(lang==='zh'?'持续兼容学习已开启：真实事件优先，也会根据设置变化推断调节，可能误学。':'Settings learning enabled.'):s.learning_available?(lang==='zh'?'已连接。手动调节后，请确认学习状态以 saved 开头。':'Connected. After manual adjustment, verify learning status begins with saved.'):(lang==='zh'?'自动事件学习不可用，可点击“学习下一次手动调节”后再拖亮度条。':'Event learning unavailable; click "Learn Next Manual Adjustment" then drag brightness.'));
    const devName = s.profile ? (deviceMap[s.profile] || s.profile) : (lang === 'zh' ? '正在检测…' : 'Detecting profile…');
    if ($('deviceFooter')) {
      $('deviceFooter').textContent = lang === 'zh'
        ? `主屏适配：${devName} · Android 12+。系统手动模式下释放控制。`
        : `Target Display: ${devName} · Android 12+. Control released in manual mode.`;
    }
  }catch(e){
    $('status').replaceChildren();
    $('learningState').textContent=lang === 'zh' ? '服务离线：旧状态已清除' : 'Service offline: state cleared';
    $('points').replaceChildren();runtime=null;preview();note(e.message);
    try{if(load&&!dirty)setConfig(await readConfig());$('diagnostics').textContent=await exec(`sh ${quote(`${root}/check_status.sh`)}`);}catch(d){$('diagnostics').textContent=d.message;}
  }finally{
    try {
      const snapshot=await ctl('backlight');
      const value=n=>Number.isFinite(n)&&n>=0?String(n):(lang==='zh'?'不可用':'N/A');
      $('backlight').textContent=snapshot.nodes.length?snapshot.nodes.map(n=>lang==='zh'||isTest?`${n.path}\n请求值 ${value(n.requested)} · 驱动回报 ${value(n.actual)} · 最大值 ${value(n.maximum)}`:`${n.path}\nRequested ${value(n.requested)} · Driver ${value(n.actual)} · Maximum ${value(n.maximum)}`).join('\n\n'):(lang==='zh'?'未发现可读背光节点':'No readable backlight nodes found');
    }catch(e){$('backlight').textContent=lang === 'zh' ? `背光读取失败：${e.message}` : `Backlight read failed: ${e.message}`;}
    if($('liveLog').checked)try{$('log').textContent=await exec(`sh ${quote(`${root}/control.sh`)} log-read`);}catch(e){$('log').textContent=lang === 'zh' ? `日志读取失败：${e.message}` : `Log read failed: ${e.message}`;}
    polling=false;
  }
}
async function action(fn) {
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await fn();}catch(e){note(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
async function save(text) {
  parseConfig(text);
  let online=false;try{await ctl('status');online=true;}catch{}
  if(online){await ctl('config-set',base64(text));note(lang === 'zh' ? '核心已确认：配置已保存并应用。' : 'Core confirmed: Configuration saved and applied.');}
  else {await exec(`sh ${quote(`${root}/control.sh`)} config-save ${quote(base64(text))}`);note(lang === 'zh' || isTest ? '配置已验证并保存；服务恢复后生效。' : 'Configuration validated and saved; effective after service restart.');}
  dirty=false;setConfig(online?await readConfig():await exec(`sh ${quote(`${root}/control.sh`)} config-read`));
}
$('save').onclick=()=>action(async()=>{if(rawInvalid)throw new Error(lang === 'zh' ? '请先修复原始配置格式' : 'Fix raw config syntax first');for(const [key] of fields){const i=$(key);if(!i.checkValidity())throw new Error(`请检查 ${key}`);}await save($('config').value);});
$('saveRaw').onclick=()=>action(()=>save($('config').value));
$('refresh').onclick=()=>refresh(true);
$('startService').onclick=()=>action(async()=>{
  note(lang === 'zh' ? '正在启动服务并核对运行状态，请稍候……' : 'Starting service and checking status, please wait…');
  const result=await ctl('start');
  await ctl('status');
  await refresh(true);
  note(result.state==='already_running'?(lang === 'zh' || isTest ? '服务已在运行，无需重复启动。' : 'Service already running.') : (lang === 'zh' || isTest ? '服务已启动，后端就绪。' : 'Service started, backend ready.'));
});
$('defaults').onclick=()=>action(async()=>{dirty=true;setConfig(await exec(`cat ${quote(`${root}/default.conf`)}`));note(lang === 'zh' ? '已载入默认值，点击保存并应用后生效。' : 'Defaults loaded. Click Save & Apply to commit.');});
$('clear').onclick=()=>{if(confirm(lang === 'zh' ? '清除当前用户、当前光感来源的学习记录？基础曲线保持不变。' : 'Clear all learning records for current user & source? Baseline curve is preserved.'))action(async()=>{await ctl('learn-clear');await refresh();note(lang === 'zh' ? '学习记录已清除并保存。' : 'Learning records cleared and saved.');});};
$('export').onclick=()=>action(async()=>{const data=(await ctl('learn-export')).data;const url=URL.createObjectURL(new Blob([data],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='ios-brightness-learning.dat';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);note(lang === 'zh' ? '已导出当前用户及光感来源的学习数据。' : 'Exported learning data for current user and sensor source.');});
$('import').onchange=()=>action(async()=>{const file=$('import').files[0];if(!file)return;if(file.size>32768)throw new Error(lang === 'zh' ? '导入文件过大' : 'Import file too large');await ctl('learn-import',base64(await file.text()));$('import').value='';await refresh();note(lang === 'zh' ? '学习数据已验证并导入。' : 'Learning data validated and imported.');});
$('diagnose').onclick=()=>action(async()=>{$('diagnostics').textContent=await exec(`sh ${quote(`${root}/check_status.sh`)}`);});
$('logs').onclick=()=>action(async()=>{$('log').textContent=await exec(`sh ${quote(`${root}/control.sh`)} log-read`);});
setConfig([...defaults].map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
try{const text=await exec(`cat ${quote(`${root}/default.conf`)}`);for(const [k,v] of Object.entries(parseConfig(text)))defaults.set(k,v);setConfig(text);}catch{}
if (!isTest && lang === 'en') applyLanguage('en');
await refresh(true);
setInterval(()=>{if(!document.hidden&&!busy)refresh();},3000);

$('configImport').onchange=()=>action(async()=>{
  const file=$('configImport').files[0];if(!file)return;
  if(file.size>32768)throw new Error(lang === 'zh' ? '配置文件过大' : 'Config file too large');
  const text=await file.text();$('configImport').value='';
  if(!confirm(lang === 'zh' ? '导入并应用此配置？当前调参会被替换，学习记录保持不变。' : 'Import and apply this config? Current tuning will be replaced, learning records preserved.'))return;
  await save(text);await refresh();
});
$('clearLog').onclick=()=>{if(confirm(lang === 'zh' ? '清空运行日志及轮转备份？学习记录保持不变。' : 'Clear running logs and backups? Learning records are preserved.'))action(async()=>{await ctl('log-clear');$('log').textContent=lang === 'zh' || isTest ? '运行日志及轮转备份已清空。' : 'Logs and backups cleared.';note(lang === 'zh' ? '当前运行日志已清空，学习记录不受影响。' : 'Current log cleared; learning records unaffected.');});};

$('learnArm').onclick=()=>action(async()=>{await ctl('learn-arm');note(lang === 'zh' || isTest ? '已开启 30 秒学习窗口：现在轻微拖动系统亮度条，然后保持环境稳定约 3 秒。' : 'Armed 30s learning window: adjust slider slightly, then keep ambient stable for ~3s.');});
$('sensorRead').onclick=()=>action(async()=>{const s=await ctl('sensors-get');$('sensorConfig').value=s.data;$('sensorList').textContent=s.sensors.join('\n');note(lang === 'zh' ? '空值为自动选择；back=none 可关闭后置参与，sysfs 只接受照度节点。' : 'Blank for auto choice; back=none disables rear sensor; sysfs accepts lux nodes only.');});
$('sensorSave').onclick=()=>action(async()=>{await ctl('sensors-save',base64($('sensorConfig').value));note(lang === 'zh' || isTest ? '光感选择已验证并保存，服务将在两秒内应用；不同来源的学习记录独立保存。' : 'Sensor selection validated and saved; applied within 2s.');});
