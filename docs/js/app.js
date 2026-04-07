// ═══ CONFIG ═══
const CFG={
  get key(){return localStorage.getItem('fate_key')||'';},
  set key(v){localStorage.setItem('fate_key',v);},
  get model(){return localStorage.getItem('fate_model')||'claude-sonnet-4-20250514';},
  set model(v){localStorage.setItem('fate_model',v);},
  get tokens(){return parseInt(localStorage.getItem('fate_tokens')||'1200');},
  set tokens(v){localStorage.setItem('fate_tokens',String(v));},
};

// ═══ STATE ═══
const MAX_PARTY=6;
const G={
  gold:{gold:0,silver:8,copper:135},
  panelOpen:true,drawerOpen:false,starFilter:'all',intelFilter:'全部',activeTab:'party',
  history:[],log:[],thinking:false,
  storyData:[],
  currentChoices:[],
  sceneTitle:'序章・Day 1　傍晚',
  sceneLoc:'📍 鐵霧城・碼頭',
  partyIds:['alfar','orange'],
  upgrade:{},
  inv:null,
  favor:{},
  specialOv:{},
  bellyFlipCount:0,
  // ── 新系統 ──
  hp:{},           // {id:{cur,max}} 角色血量
  quests:[],       // 任務列表
  time:{day:1,hour:18,weather:'霧'},  // 時間
  rep:{},          // {faction:value} 聲望
  relics:{},       // {starNum:{name,found,effect}} 寶器
  founderClues:[], // 天父星線索碎片
  orangeStage:0,
  intel:[],
  lastShop:null,
  shopCatalogs:{},  // 商店固定目錄快取
  extraParty:[],
  extraPcfg:{},
};

// ═══ SAVE / LOAD ═══
const SAVE_KEY='fate_save_v2';
let _saveQueued=false;
function saveGame(){
  // 防抖：多次連續呼叫只執行一次（下一個 microtask）
  if(_saveQueued)return;
  _saveQueued=true;
  queueMicrotask(()=>{_saveQueued=false;_doSave();});
}
function _doSave(){
  try{
    const starOv={}; // 記錄被改動的星位狀態
    [...TIANGANG,...DISHAT].forEach(s=>{
      if(s.status==='recruited'&&s.id&&!['alfar','orange'].includes(s.id))
        starOv[s.type+'_'+s.num]={status:s.status,name:s.name,id:s.id};
      else if(s.status==='contact')
        starOv[s.type+'_'+s.num]={status:s.status,name:s.name,cN:s.cN||null,hint:s.hint||null};
    });
    const data={
      gold:G.gold,history:G.history,log:G.log,
      storyData:G.storyData,currentChoices:G.currentChoices,
      sceneTitle:G.sceneTitle,sceneLoc:G.sceneLoc,
      extraParty:G.extraParty,extraPcfg:G.extraPcfg,
      partyIds:G.partyIds,upgrade:G.upgrade,inv:getInv(),favor:G.favor,bellyFlipCount:G.bellyFlipCount||0,specialOv:G.specialOv||{},
      hp:G.hp,quests:G.quests,time:G.time,rep:G.rep,relics:G.relics,presetRelicOv:Object.fromEntries(Object.entries(PRESET_RELICS).filter(([k,v])=>v.status&&v.status!=='equipped').map(([k,v])=>[k,{status:v.status,effect:v.effect}])),founderClues:G.founderClues,orangeStage:G.orangeStage||0,intel:G.intel||[],lastShop:G.lastShop||null,inShop:G.inShop||false,shopCatalogs:G.shopCatalogs||{},
      guilds:G.guilds||{},starOv,savedAt:Date.now(),
    };
    localStorage.setItem(SAVE_KEY,JSON.stringify(data));
    showSaveIndicator();
  }catch(e){console.warn('存檔失敗:',e);showToast('存檔失敗：儲存空間可能已滿','err');}
}
function loadGame(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return false;
    const data=JSON.parse(raw);
    if(!data.storyData||!data.history)return false;
    G.gold=data.gold||{gold:0,silver:8,copper:135};
    G.history=data.history||[];
    G.log=data.log||[];
    G.storyData=data.storyData||[];
    G.currentChoices=data.currentChoices||[];
    G.sceneTitle=data.sceneTitle||'序章・Day 1　傍晚';
    G.sceneLoc=data.sceneLoc||'📍 鐵霧城・碼頭';
    G.extraParty=data.extraParty||[];
    G.extraPcfg=data.extraPcfg||{};
    G.partyIds=data.partyIds||['alfar','orange'];_partyCache=null;_invalidateCharCache();
    G.upgrade=data.upgrade||{};
    G.inv=data.inv||getInv();
    G.favor=data.favor||{};
    G.bellyFlipCount=data.bellyFlipCount||0;
    G.specialOv=data.specialOv||{};
    G.hp=data.hp||{};
    G.quests=data.quests||[];
    G.time=data.time||{day:1,hour:18,weather:'霧'};
    G.rep=data.rep||{};
    G.relics=data.relics||{};
    if(data.presetRelicOv){Object.entries(data.presetRelicOv).forEach(([k,v])=>{if(PRESET_RELICS[k]){PRESET_RELICS[k].status=v.status;PRESET_RELICS[k].effect=v.effect;}});}
    G.founderClues=data.founderClues||[];
    G.orangeStage=data.orangeStage||0;
    G.intel=data.intel||[];
    G.lastShop=data.lastShop||null;
    G.inShop=data.inShop||false;
    G.shopCatalogs=data.shopCatalogs||{};
    G.guilds=data.guilds||{};
    // 恢復星辰狀態
    if(data.starOv){
      Object.entries(data.starOv).forEach(([k,v])=>{
        const [type,num]=k.split('_');
        const arr=type==='天罡'?TIANGANG:DISHAT;
        const s=arr.find(x=>x.num===parseInt(num));
        if(s){s.status=v.status;s.name=v.name;if(v.id)s.id=v.id;if(v.cN)s.cN=v.cN;if(v.hint)s.hint=v.hint;}
      });
    }
    // 換裝置/重新開啟：確保下一次 AI 呼叫回傳 JSON
    // 若最後一則 assistant 訊息不是 JSON，自動插入校正對話
    const lastAst=G.history.filter(m=>m.role==='assistant').pop();
    if(lastAst&&!lastAst.content.trim().startsWith('{')){
      G.history.push({role:'user',content:'請以JSON格式繼續故事。'});
      G.history.push({role:'assistant',content:'{"st":"繼續中","sl":"'+G.sceneLoc+'","nv":[],"dl":[],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null}'});
    }
    return true;
  }catch(e){console.warn('讀取存檔失敗:',e);return false;}
}
function renderStoryFromData(){
  const c=document.getElementById('story-content');c.innerHTML='';
  document.getElementById('scene-title').textContent=G.sceneTitle;
  document.getElementById('scene-loc').textContent=G.sceneLoc;
  G.storyData.forEach(e=>appendEntryToDOM(e,false));
  if(G.currentChoices.length)renderChoices(G.currentChoices,false);
  else renderFallback();
  scrollD();
}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function appendEntryToDOM(e,save=true){
  const w=mk('div','sentry');
  if(e.type==='sec'){const el=mk('div','s-sec');el.textContent=e.v;w.appendChild(el);}
  else if(e.type==='narr'){const el=mk('div','s-narr');el.textContent=e.v;w.appendChild(el);}
  else if(e.type==='dial'){const el=mk('div','s-dial');el.innerHTML=`<span class="sp">${escHtml(e.sp)}：</span><span class="wd">「${escHtml(e.ln)}」</span>`;w.appendChild(el);}
  else if(e.type==='sys'){const el=mk('div','s-sys');el.textContent=e.v;w.appendChild(el);}
  else if(e.type==='action'){const el=mk('div','s-action');el.textContent='▶ '+e.v;w.appendChild(el);}
  else if(e.type==='err'){const el=mk('div','s-err');el.textContent='⚠ '+e.v;w.appendChild(el);}
  document.getElementById('story-content').appendChild(w);
  if(save){G.storyData.push(e);}
}
let saveTimer;
function showSaveIndicator(){
  clearTimeout(saveTimer);
  const el=document.getElementById('save-indicator');
  if(el){el.classList.add('show');saveTimer=setTimeout(()=>el.classList.remove('show'),1800);}
}

// ═══ DATA ═══
const PARTY=[
  {id:'alfar',star:'天魁星',type:'天罡',num:1,name:'艾爾法',title:'遊俠（無所屬）',emoji:'😒',baseLv:1,job:'城衛',
   desc:'鐵霧城前城衛，因擅自釋放被扣押的糧食而遭解僱。出身平凡，語少，銀色長髮，面無表情卻行事有原則。某種古老的星力在她體內沉眠。',
   stats:{武力:41,知力:69,統率:22,魅力:34,幸運:51},sn:{},
   tl:[{n:'潛星之光',s:true,d:'封印中。條件未達。'},{n:'平靜之眼',s:false,d:'不受恐懼、魅惑、幻術影響。'},{n:'讀心微表情',s:false,d:'可察覺對方說謊（成功率依知力浮動）。'}],
   eq:{武器:'舊制式短劍（磨損三級）',防具:'城衛布甲（補丁×7）',飾品:'——'}},
  {id:'orange',star:'地魁星',type:'地煞',num:1,name:'橘子',title:'布偶貓・雌性（身份不明）',emoji:'🐈😒',baseLv:null,job:'命運之錨',
   desc:'以五枚銅幣購入的布偶貓，雌性。雙色毛、藍眼，面癱，聽懂人話，只會喵叫。知力數值異常，來歷不明。對翻肚子持強烈反對立場。',
   stats:{武力:3,知力:99,統率:null,魅力:null,幸運:null},sn:{統率:'顯示拒絕',魅力:'數值異常',幸運:'???'},
   tl:[{n:'看穿本質',s:false,d:'對一切虛偽免疫。'},{n:'翻肚禁止',s:false,d:'被強制翻肚時觸發・空踢反擊。'},{n:'命運之錨',s:true,d:'未知。'}],
   eq:{武器:'——',防具:'——（拒絕配戴）',飾品:'——'}},
];
const TGS=['天罡星','天機星','天閒星','天勇星','天雄星','天猛星','天威星','天英星','天貴星','天富星','天滿星','天孤星','天傷星','天立星','天捷星','天暗星','天佑星','天空星','天速星','天異星','天殺星','天微星','天究星','天退星','天壽星','天劍星','天平星','天罪星','天損星','天敗星','天牢星','天慧星','天暴星','天哭星','天巧星'];
const DSS=['地煞星','地勇星','地傑星','地雄星','地威星','地英星','地奇星','地猛星','地文星','地正星','地闊星','地闔星','地強星','地暗星','地輔星','地會星','地佐星','地祐星','地靈星','地獸星','地微星','地慧星','地暴星','地然星','地猖星','地狂星','地飛星','地走星','地巧星','地明星','地進星','地退星','地滿星','地遂星','地周星','地隱星','地異星','地理星','地俊星','地樂星','地捷星','地速星','地鎮星','地禽星','地刑星','地壯星','地劣星','地健星','地耗星','地賊星','地狗星','地囚星','地孤星','地角星','地短星','地魔星','地妖星','地幽星','地伏星','地僻星','地空星','地全星','地缺星','地殺星','地哭星','地損星','地破星','地平星','地奴星','地察星','地惡星'];
const TIANGANG=[{num:1,star:'天魁星',name:'艾爾法',status:'recruited',id:'alfar'},...TGS.map((s,i)=>({num:i+2,star:s,name:'?',status:'unknown'}))];
const DISHAT=[{num:1,star:'地魁星',name:'橘子',status:'recruited',id:'orange'},{num:2,star:'地煞星',name:'?',status:'contact',cN:'紅髮女',hint:'霧刃幫相關・左臂有傷・缺口彎刀'},...DSS.slice(1).map((s,i)=>({num:i+3,star:s,name:'?',status:'unknown'}))];
// INV 初始資料（新遊戲時使用）
// 星外關鍵人物（不在108星之列，但與命運息息相關）
const SPECIAL_CHARS=[
  {
    id:'sky_father',
    name:'天父星・未知',
    role:'星辰召集者',
    emoji:'⚜️',
    status:'unknown', // 'unknown'|'heard'|'met'|'dead'
    desc:'帝國崩裂前夕，第一個感知到108顆命運之星降世的存在。他召集了最初的同伴，卻在旅途中途倒下——留下的謎題與未竟的志業，成為後繼者的遺產。艾爾薩大陸的「晁蓋」。',
    hint:'此人的氣息⋯⋯不像是108星中的任何一顆。',
    known_as:'傳說中「聚星之人」，或有人稱其為「先行者」。',
  },
  {
    id:'shadow_king',
    name:'???',
    role:'幕後推手',
    emoji:'👁️',
    status:'unknown',
    desc:'艾爾薩大陸十二王國背後，疑有一位在暗中操縱政局的存在。與108星命運的降世有某種關聯。',
    hint:'不是命運之星，但其影響力凌駕於星辰之上。',
    known_as:'暗王？棋手？還是更古老的存在？',
  },
];
// G.specialOv 覆蓋：特殊人物的動態狀態更新
const INV_DEFAULT={
  equip:[
    {n:'舊制式短劍',t:'磨損三級・攻擊力較低',w:'艾爾法',status:'equipped',slot:'武器',bonus:{武力:8,知力:0,統率:0,魅力:0,幸運:0}},
    {n:'城衛布甲',t:'補丁×7',w:'艾爾法',status:'equipped',slot:'防具',bonus:{武力:0,知力:0,統率:5,魅力:0,幸運:2}}
  ],
  items:[{n:'乾糧',t:'回復道具',q:'×2'},{n:'破舊地圖（鐵霧城）',t:'殘缺',q:'×1'},{n:'解僱通知書',t:'留著或許有用',q:'×1'}],
  key:[{n:'霧刃幫懸賞（記憶）',t:'線索50銀・首領5金',q:'—'}]
};

// ═══ API ═══
const SYS=`西方奇幻水滸傳RPG引擎。水滸傳＋幻想水滸傳風格。只輸出純JSON。

【世界】艾爾薩大陸，帝國崩裂，十二國割據。108命運之星降世，聚星者終結輪迴。
主角：艾爾法😒（天魁星）前城衛，銀髮面無表情，逼上梁山。橘子🐈😒（地魁星）布偶貓，只說喵→系統翻譯，知力99，命運之錨。

【原則】逼上梁山：每位星辰都有被體制逼迫的過去。義氣為核：信任靠共患難。招募=主線，六型交替（逼上梁山/義氣/計謀/比武/引薦/限時）。連環敘事：一角色引出2-3新線索。天罡36將領級＋地煞72專才（鐵匠廚師醫師等非戰鬥職業同樣重要）。據點5-8人後建立，廢墟→城鎮。內部張力：鷹鴿派矛盾。文風：武俠戰鬥＋吐槽日常，冷面笑匠。悲劇場景不搞笑。

【星辰流程】①初遇→sp name:"???"＋hint＋cN，橘子說喵→翻譯告知星辰身份 ②認識→sp填真名 ③ch提供「邀請加入」vs「各走各路」選項，必經 ④nm入隊，演出加入儀式 ⑤有據點後可選隨隊/留守。拒絕者保持contact。稱號必給（二字）。

【格式】必填，不用的設null，cb時ch設[]
{"st":"場景標題","sl":"📍 地點","nv":["敘述60-80字,1-3段"],"dl":[{"sp":"emoji","ln":"台詞"}],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[{"t":"選項","h":"提示"}],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null}

【規則】
1.純JSON，違反=失敗 2.nv 60-80字×1-3段 3.橘子：sp="橘子🐈😒" ln="喵"→{sp:"系統",ln:"〔翻譯〕"} 4.ch 3-4選項，各代表不同取向，h不留空，含幽默選項＋安全選項 5.角色emoji固定 6.玩家行動如實執行，未指定時禁止同伴主動發言 7.同伴只在：玩家互動/危機/選項後果時才發言 7a.場景描寫帶出同行隊友存在 7b.入隊必須演出加入儀式 8.地點合理銜接 9.cb時ch=[]
10.iv：add/remove/equip/purchase 11.hp：[{id,delta,reason}] 12.qt：new新增/completed完成，rewards可選{gd,fa,rp,items} 13.tm：advance或setWeather 14.rp：[{id,delta,reason}] 15.info：[{id,title,content,src,rel,cat}] 16.relic：{id,name,type,icon,rarity,desc,effect} 17.clue：天父星線索 18.or：橘子秘密stage 1-5 19.job：[{id,job}]劇情決定，四類：戰鬥(城衛/劍客/鬥士/弓手/騎兵)智謀(術士/謀士/學者)輔助(遊俠/密探/醫師/吟遊詩人)生產(鐵匠/廚師/藥師/商賈/裁縫/建築師/獵人) 20.gu：[{id:"adventurer/merchant/scholar/craft/shadow",action:"join/exp/rank",amount:N}] 21.fa：[{id,delta,reason}] 22.shop：{id,name,baseKey,newItems} 23.sp：{num,type,star,name,hint,cN} 24.nm：{id,name,star,type,num,title,emoji,desc,portrait,stats,tl,eq,baseLv} 25.小戰鬥用cb，boss才詳寫

【同步規則】違反=崩潰：敘述涉及金幣→gd必填/好感→fa必填/道具→iv必填/HP→hp必填/任務→qt必填/時間→tm必填。文字描述≠數值生效。讀【背景數值】為真實狀態。【UI互動】僅背景資訊，不推進劇情。HP=0→瀕死不死亡，主角觸發危機劇情。
`;


// 偵測是否為 CORS / 網路錯誤
function isCorsErr(e){
  const m=e.message||'';
  return m.includes('Failed to fetch')||m.includes('NetworkError')||m.includes('CORS')||m.includes('Load failed')||e.name==='TypeError';
}

// ═══ API 節流與退避 ═══
const _apiThrottle={lastCall:0,minInterval:1200,backoffUntil:0,pending:0,maxConcurrent:1,_429count:0};
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function apiGate(){
  // 429 退避中
  if(Date.now()<_apiThrottle.backoffUntil){
    const wait=_apiThrottle.backoffUntil-Date.now();
    showToast(`⏳ API 冷卻中（${Math.ceil(wait/1000)}秒）`,'inf');
    await sleep(wait);
  }
  // 併發控制（含安全逾時，防止 pending 洩漏導致死鎖）
  let waitCount=0;
  while(_apiThrottle.pending>=_apiThrottle.maxConcurrent){
    await sleep(500);
    if(++waitCount>20){_apiThrottle.pending=0;break;} // 10秒逾時強制重置
  }
  // 最小間隔
  const elapsed=Date.now()-_apiThrottle.lastCall;
  if(elapsed<_apiThrottle.minInterval)await sleep(_apiThrottle.minInterval-elapsed);
  _apiThrottle.pending++;
  _apiThrottle.lastCall=Date.now();
}
function apiDone(){_apiThrottle.pending=Math.max(0,_apiThrottle.pending-1);}
function apiHit429(){
  // 指數退避：首次 8 秒，之後翻倍，最多 90 秒
  _apiThrottle._429count++;
  const next=Math.min(90000,8000*Math.pow(2,_apiThrottle._429count-1));
  _apiThrottle.backoffUntil=Date.now()+next;
  showToast(`⏳ API 限速，${Math.ceil(next/1000)}秒後可重試`,'err');
}
function apiReset429(){_apiThrottle._429count=0;} // 成功呼叫後重置退避計數

let _sysPromptSent=false;
let _lastSentGold=null;
const SYS_SHORT='繼續用之前的規則。只輸出JSON。保持角色性格與世界觀一致。欄位格式同前。cb用於戰鬥骰子。gd/iv/hp/fa/qt/tm必須與敘述同步。';
async function callAPI(action){
  if(!CFG.key){document.getElementById('api-modal').classList.add('open');throw new Error('請先設定 API 金鑰');}
  await apiGate();
  // 壓縮狀態快照：只發送變化的資料（快取 party 一次）
  const _p=allParty();
  const partySnap=_p.filter(m=>m.id!=='orange').map(m=>`${m.name}(${m.emoji||''} ${m.title||''})/${getJob(m.id)||'?'}/HP${getHP(m.id).cur}`).join(',')+'；橘子HP'+getHP('orange').cur+'/好感'+getFavor('orange');
  const goldStr=`金${G.gold.gold}銀${G.gold.silver}銅${G.gold.copper}`;
  const goldSnap=goldStr!==_lastSentGold?goldStr:'';
  _lastSentGold=goldStr;
  const _gSnap=Object.entries(G.guilds||{}).filter(([,v])=>v?.joined).map(([id,v])=>`${GUILDS[id]?.name||id}(${GUILDS[id]?.ranks[v.rank]||'?'})`).join(',');
  let stateNote=`【狀態】${getTimeContext()}|${goldSnap?goldSnap+'|':''}隊:${partySnap}|道具${(getInv().items||[]).length}|任務${(G.quests||[]).filter(q=>q.status==='active').length}${_gSnap?'|工會:'+_gSnap:''}`;
  if(stateNote.length>300)stateNote=stateNote.slice(0,297)+'…';
  G.history.push({role:'user',content:`${stateNote}\n${action}`});
  // 首次呼叫送完整 SYS，之後送精簡版（省 ~2000 tokens）
  const sysToSend=_sysPromptSent?SYS_SHORT:SYS;
  let res;
  try{
    res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':CFG.key,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true',
      },
      body:JSON.stringify({model:CFG.model,max_tokens:CFG.tokens,system:sysToSend,messages:G.history})
    });
  }catch(e){
    apiDone();G.history.pop();
    if(isCorsErr(e)){document.getElementById('cors-modal').classList.add('open');}
    throw new Error(isCorsErr(e)?'網路/CORS 錯誤（請用本地伺服器）':('網路錯誤：'+e.message));
  }
  _sysPromptSent=true;
  if(!res.ok){
    apiDone();G.history.pop();
    if(res.status===429){apiHit429();throw new Error('請求過於頻繁，已啟動冷卻');}
    let em=`HTTP ${res.status}`;
    try{const ej=await res.json();em=ej.error?.message||em;}catch(_){}
    const map={401:'API 金鑰無效或已過期',403:'API 金鑰無此權限',500:'Anthropic 伺服器錯誤，稍後重試'};
    throw new Error(map[res.status]||em);
  }
  const data=await res.json();
  const raw=data.content?.find(b=>b.type==='text')?.text||'';
  G.history.push({role:'assistant',content:raw});
  apiDone();apiReset429();

  // 嘗試解析 JSON
  const parsed=tryParseJSON(raw);
  if(parsed)return parsed;

  // 解析失敗：重試 1 次
  console.warn('JSON parse failed, retrying. Raw:', raw.slice(0,200));
  await apiGate();
  const retryMsg='你的回應不是JSON。請只輸出純JSON，從{開始，以}結束，不得有任何其他文字。';
  const histForRetry=[...G.history.slice(0,-1),{role:'user',content:retryMsg},{role:'assistant',content:'{'}];
  let resR;
  try{
    resR=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CFG.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:CFG.model,max_tokens:CFG.tokens,system:sysToSend,messages:histForRetry})
    });
  }catch(e){apiDone();throw new Error('重試失敗：'+e.message);}
  apiDone();apiReset429();
  if(!resR.ok){if(resR.status===429)apiHit429();throw new Error('重試失敗');}
  const dataR=await resR.json();
  const rawR='{'+(dataR.content?.find(b=>b.type==='text')?.text||'');
  const parsedR=tryParseJSON(rawR);
  if(parsedR){G.history[G.history.length-1]={role:'assistant',content:rawR};return parsedR;}
  throw new Error('回應無法解析為 JSON，請再試一次');
}

function tryParseJSON(raw){
  try{return JSON.parse(raw.replace(/```json|```/g,'').trim());}
  catch(_){
    // 嘗試找出 JSON 區塊
    const m=raw.match(/\{[\s\S]*\}/);
    if(m){try{return JSON.parse(m[0]);}catch(_){}}
    return null;
  }
}

// ═══ STORY ENGINE ═══
function mk(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
function scrollD(){const s=document.getElementById('story-scroll');setTimeout(()=>s.scrollTop=s.scrollHeight,60);}

// 本地事件推入 history 的輔助函式：合併連續同類事件，避免膨脹
const _EMPTY_RESP='{"st":"—","sl":"—","nv":[],"dl":[],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null}';
function pushLocalEvent(msg){
  const tagged='【UI互動・純背景資訊・不推進劇情・不改變場景】'+msg;
  // 若上一組也是 UI 互動，合併
  if(G.history.length>=2){
    const lastU=G.history[G.history.length-2];
    const lastA=G.history[G.history.length-1];
    if(lastU.role==='user'&&lastU.content.startsWith('【UI互動')&&lastA.role==='assistant'){
      lastU.content+='\n'+msg;
      return;
    }
  }
  G.history.push({role:'user',content:tagged});
  G.history.push({role:'assistant',content:_EMPTY_RESP});
}

async function sendChoice(txt){
  if(G.thinking)return;
  // 如果有待發送的戰鬥結果，附加到玩家選擇前
  if(G._pendingCombatMsg){txt=G._pendingCombatMsg+'\n玩家選擇：'+txt;G._pendingCombatMsg=null;}
  // 自動壓縮：超過120條且為20的倍數時才嘗試
  if(G.history.length>120&&G.history.length%20===0&&!G.autoCompressing){
    G.autoCompressing=true;
    try{await autoCompressHistory();}finally{G.autoCompressing=false;}
  }
  G.thinking=true;setDis(true);
  const prevChoices=G.currentChoices?.slice()||[];
  const actionEl=addAction(txt);
  const th=addThink();
  try{
    const d=await callAPI(txt);
    th.remove();renderResp(d);
  }catch(e){
    th.remove();
    // 移除未執行的行動文字
    if(actionEl&&actionEl.parentNode)actionEl.parentNode.removeChild(actionEl);
    // 從 storyData 移除最後一筆 action
    if(G.storyData.length&&G.storyData[G.storyData.length-1].type==='action')G.storyData.pop();
    addErrRetry(e.message,txt,isCorsErr(e));
    showToast(e.message,'err');
    // 恢復原本選項
    if(prevChoices.length)renderChoices(prevChoices,false);
    else renderFallback();
  }
  G.thinking=false;setDis(false);
}

// ═══ INVENTORY ═══
function getInv(){
  if(!G.inv)G.inv=JSON.parse(JSON.stringify(INV_DEFAULT));
  return G.inv;
}

// 橘子星辰感知
function handleStarPresence(sp){
  if(!sp)return;
  const isSpecial=sp.special===true;

  if(isSpecial){
    // 星外關鍵人物——橘子反應更不安
    appendEntryToDOM({type:'dial',sp:'橘子🐈😒',ln:'喵……'});
    appendEntryToDOM({type:'sys',v:`〔橘子感知：此人⋯⋯不在108星之中。氣息截然不同，古老而沉重。〕`});
    // 更新星外人物狀態
    if(sp.id){
      if(!G.specialOv[sp.id])G.specialOv[sp.id]={};
      if(sp.status)G.specialOv[sp.id].status=sp.status;
      if(sp.name&&sp.name!=='???')G.specialOv[sp.id].name=sp.name;
      renderBoth('stars');saveGame();
    }
    showToast(`橘子感知：星外人物出現`,'ok');
  }else{
    // 108星辰——橘子有反應
    const starInfo=sp.num?`第${sp.num}星・${sp.star||''}`:sp.star||'星辰之人';
    const typeLabel=sp.type?sp.type+'・':'';
    const dispName=(!sp.name||/^[?？]+$/.test(sp.name))?(sp.cN||'？？？'):sp.name;
    // 橘子主動告知星辰身份（喵→系統翻譯模式）
    appendEntryToDOM({type:'dial',sp:'橘子🐈😒',ln:'喵——！！'});
    appendEntryToDOM({type:'dial',sp:'系統',ln:`〔翻譯：這傢伙身上有星辰氣息——${typeLabel}${starInfo}。${sp.hint||''}〕`});
    if(dispName!=='？？？')appendEntryToDOM({type:'sys',v:`✦ 橘子感知 ✦ ${dispName} ═ ${typeLabel}${starInfo}`});
    else appendEntryToDOM({type:'sys',v:`✦ 橘子感知 ✦ 身份未明的星辰之人 ═ ${typeLabel}${starInfo}`});
    // 更新星辰錄
    const arr=sp.type==='天罡'?TIANGANG:DISHAT;
    const star=arr.find(s=>s.num===sp.num);
    if(star&&star.status!=='recruited'){
      let changed=false;
      if(star.status==='unknown'){star.status='contact';changed=true;}
      // 名字從 ? / ??? 更新為真名
      const inName=sp.name||'?';
      if(inName&&!/^[?？]+$/.test(inName)&&star.name!==inName){star.name=inName;changed=true;}
      else if(star.name==='?'&&inName==='?'){/* 仍未知，不動 */}
      if(sp.hint&&sp.hint!==star.hint){star.hint=sp.hint;changed=true;}
      if(sp.star)star.star=sp.star;
      if(sp.cN&&sp.cN!==star.cN){star.cN=sp.cN;changed=true;}
      if(changed){renderBoth('stars');saveGame();}
    }
    showToast(`橘子感知：${typeLabel}${starInfo}`,'ok');
    // 自動加入情報板
    addIntel({id:'orange_star_'+sp.num,title:`第${sp.num}星・${dispName}`,content:sp.hint||`橘子感知到此人身上有${starInfo}的氣息。`,src:'橘子感知',rel:4,cat:'人物',orange:true,related:`${sp.type}第${sp.num}星`});
  }
}

function applyInv(iv){
  if(!iv)return;
  const inv=getInv();
  // 新增道具
  (iv.add||[]).forEach(item=>{
    const exist=inv.items.find(i=>i.n===item.n);
    if(exist){exist.q=item.q||exist.q;}
    else inv.items.push({n:item.n,t:item.t||'',q:item.q||'×1'});
  });
  // 新增關鍵情報
  (iv.key||[]).forEach(item=>{
    if(!inv.key.find(i=>i.n===item.n))inv.key.push({n:item.n,t:item.t||'',q:item.q||'—'});
  });
  // 移除道具
  (iv.remove||[]).forEach(name=>{
    inv.items=inv.items.filter(i=>i.n!==name);
  });
  // 裝備更換：加入裝備欄（持有狀態），並自動裝備到角色
  (iv.equip||[]).forEach(e=>{
    const charId=e.who||'alfar';
    const charName=getCharData(charId)?.name||e.who||'艾爾法';
    const slot=e.slot||'武器';
    // 舊裝備→持有
    const old=inv.equip.find(eq=>eq.w===charName&&eq.slot===slot&&eq.status==='equipped');
    if(old)old.status='持有';
    // 新裝備→裝備中
    const exist=inv.equip.find(eq=>eq.n===e.item);
    if(exist){exist.status='equipped';exist.w=charName;}
    else{const ne={n:e.item,t:e.t||'',w:charName,status:'equipped',slot};autoBonus(ne);inv.equip.push(ne);}
    // 同步角色 eq
    const c=getCharData(charId);
    if(c&&c.eq)c.eq[slot]=e.item;
  });
  // 卸下裝備
  (iv.unequip||[]).forEach(e=>{
    const charName=getCharData(e.who||'alfar')?.name||'艾爾法';
    const eq=inv.equip.find(i=>i.w===charName&&i.slot===e.slot&&i.status==='equipped');
    if(eq){eq.status='持有';eq.w=null;}
    const c=getCharData(e.who||'alfar');
    if(c&&c.eq)c.eq[e.slot]='——';
  });
  // 購買裝備（加入持有欄，等玩家手動裝備）
  (iv.purchase||[]).forEach(item=>{
    if(!inv.equip.find(e=>e.n===item.n)){
      const pi={n:item.n,t:item.t||'',w:null,status:'持有',slot:item.slot||'武器',bonus:item.bonus||null};
      autoBonus(pi);inv.equip.push(pi);
      appendEntryToDOM({type:'sys',v:`✦ 獲得：${item.n}（持有中・可在道具欄裝備）`});
    }
  });
  renderChanged('inv','party');
}

// ═══ SHOP SYSTEM ═══
let _currentShop=null;

// ═══ SHOP CATALOG SYSTEM ═══
const BASE_SHOPS={
  general:{name:'雜貨鋪',items:[
    {n:'乾糧',t:'回復道具',price:{g:0,s:0,c:20}},
    {n:'魚乾',t:'橘子最愛・好感+8',price:{g:0,s:0,c:30}},
    {n:'繃帶',t:'緊急止血・HP+5',price:{g:0,s:0,c:25}},
    {n:'火種',t:'生火用具',price:{g:0,s:0,c:10}},
    {n:'破舊地圖',t:'區域地圖・殘缺',price:{g:0,s:1,c:0}},
  ]},
  blacksmith:{name:'鐵匠舖',items:[
    {n:'短刀',t:'輕量利刃',slot:'武器',price:{g:0,s:15,c:0},bonus:{武力:8}},
    {n:'皮甲',t:'基礎防護',slot:'防具',price:{g:0,s:20,c:0},bonus:{統率:6,幸運:2}},
    {n:'鐵盾',t:'格擋專用',slot:'防具',price:{g:0,s:18,c:0},bonus:{統率:10}},
    {n:'銅指環',t:'略有加持',slot:'飾品',price:{g:0,s:8,c:0},bonus:{幸運:4}},
  ]},
  inn:{name:'旅店',items:[
    {n:'客房一晚',t:'全員HP回復・推進8小時',price:{g:0,s:3,c:0},action:'rest'},
    {n:'熱食套餐',t:'HP+15・推進1小時',price:{g:0,s:1,c:50},action:'meal'},
    {n:'消息打探',t:'獲得一條當地情報',price:{g:0,s:2,c:0},action:'intel'},
  ]},
  apothecary:{name:'藥鋪',items:[
    {n:'草藥包',t:'HP+20',price:{g:0,s:2,c:0}},
    {n:'解毒劑',t:'解除中毒',price:{g:0,s:3,c:0}},
    {n:'魚肉乾',t:'橘子最愛・好感+8',price:{g:0,s:0,c:40}},
    {n:'提神藥',t:'疲勞恢復',price:{g:0,s:1,c:50}},
  ]},
};

function mergeShop(shopId,baseKey,newItems,shopName){
  if(!G.shopCatalogs)G.shopCatalogs={};
  const base=BASE_SHOPS[baseKey]||{name:shopName||'商店',items:[]};
  const existing=G.shopCatalogs[shopId]||{items:[...base.items],newItems:[]};
  const addedNew=[];
  (newItems||[]).forEach(ni=>{
    if(!existing.items.find(i=>i.n===ni.n)){existing.items.push(ni);addedNew.push(ni.n);}
  });
  existing.newItems=[...new Set([...(existing.newItems||[]),...addedNew])];
  existing.name=shopName||base.name;
  existing.lastVisit=G.time?.day||1;
  G.shopCatalogs[shopId]=existing;
  return existing;
}

function handleShop(shop){
  if(!shop)return;
  let finalShop;
  if(shop.id){
    finalShop=mergeShop(shop.id,shop.baseKey||'general',shop.newItems||[],shop.name);
  }else if(shop.items?.length){
    finalShop=mergeShop('shop_'+(shop.name||'').replace(/\s/g,'_'),'general',shop.items,shop.name);
  }else return;
  _currentShop=finalShop;G.lastShop=finalShop;G.inShop=true;saveGame();
  const sb=document.getElementById('shop-btn');if(sb){sb.style.display='';sb.title=finalShop.name;}
  const fr=document.getElementById('free-row');if(fr)fr.classList.add('open');
  openShop(finalShop);
}
function reopenShop(){if(G.lastShop)openShop(G.lastShop);else showToast('沒有可開啟的商店','inf');}

function updateShopBtn(){
  const sb=document.getElementById('shop-btn');if(!sb)return;
  if(G.inShop&&G.lastShop){sb.style.display='';sb.title=G.lastShop.name||'商店';}
  else sb.style.display='none';
}
function clearShop(){G.lastShop=null;const sb=document.getElementById('shop-btn');if(sb)sb.style.display='none';saveGame();}

let _shopTab='buy';
function switchShopTab(tab){
  _shopTab=tab;
  const btnBuy=document.getElementById('shop-tab-buy');
  const btnSell=document.getElementById('shop-tab-sell');
  if(btnBuy){btnBuy.style.background=tab==='buy'?'rgba(201,168,76,.08)':'transparent';btnBuy.style.borderBottomColor=tab==='buy'?'var(--goldd)':'transparent';btnBuy.style.color=tab==='buy'?'var(--gold)':'var(--sild)';}
  if(btnSell){btnSell.style.background=tab==='sell'?'rgba(100,180,220,.08)':'transparent';btnSell.style.borderBottomColor=tab==='sell'?'rgba(100,180,220,.7)':'transparent';btnSell.style.color=tab==='sell'?'rgba(130,200,230,.9)':'var(--sild)';}
  if(tab==='buy')renderShopBuy();else renderShopSell();
}

function openShop(shop){
  _currentShop=shop;
  document.getElementById('shop-name').textContent=shop.name||'商店';
  document.getElementById('shop-gold').textContent=goldS();
  _shopTab='buy';
  switchShopTab('buy');
  document.getElementById('shop-modal').classList.add('open');
}

function renderShopBuy(){
  if(!_currentShop)return;
  const container=document.getElementById('shop-items');if(!container)return;
  const newSet=new Set(_currentShop.newItems||[]);
  container.innerHTML=(_currentShop.items||[]).map((item,i)=>{
    const priceText=priceStr(item.price);
    const canAfford=canPay(item.price);
    const isNew=newSet.has(item.n);
    return`<div style="background:var(--bg3);border:1px solid ${isNew?'rgba(100,180,100,.4)':'var(--brd)'};border-radius:4px;padding:.55rem .7rem;position:relative;">
      ${isNew?`<span style="position:absolute;top:.3rem;right:.3rem;font-size:.48rem;padding:.06rem .26rem;background:rgba(100,180,100,.2);border:1px solid rgba(100,180,100,.5);border-radius:2px;color:#6ab46a;">NEW</span>`:''}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.6rem;margin-top:${isNew?'.5rem':'0'}">
        <div style="flex:1">
          <div style="font-size:.78rem;color:var(--sil);font-weight:600;">${item.n}${item.slot?` <span style="font-size:.58rem;color:var(--goldd)">[${item.slot}]</span>`:''}</div>
          <div style="font-size:.65rem;color:var(--sild);margin:.1rem 0">${item.t||''}</div>
          ${item.bonus?`<div style="font-size:.58rem;color:#6ab46a">${bonusText(item.bonus)}</div>`:''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:.72rem;color:var(--gold);margin-bottom:.28rem">${priceText}</div>
          <button onclick="buyItem(${i})" ${canAfford?'':'disabled'}
            style="font-size:.65rem;padding:.22rem .6rem;background:${canAfford?'rgba(201,168,76,.15)':'rgba(80,80,80,.1)'};border:1px solid ${canAfford?'rgba(201,168,76,.5)':'rgba(100,100,100,.3)'};border-radius:3px;color:${canAfford?'var(--gold)':'var(--sild)'};cursor:${canAfford?'pointer':'not-allowed'};font-family:'Noto Serif TC',serif;">
            ${canAfford?'購買':'不足'}
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderShopSell(){
  const container=document.getElementById('shop-items');if(!container)return;
  const inv=getInv();
  const sellable=[
    ...inv.items.map((item,idx)=>({...item,_src:'items',_idx:idx})),
    ...inv.equip.filter(e=>e.status==='持有').map((item,idx)=>({...item,_src:'equip',_idx:idx})),
  ];
  if(!sellable.length){container.innerHTML=`<div style="padding:1.2rem;text-align:center;color:var(--sild);font-size:.68rem;">沒有可售出的物品</div>`;return;}
  container.innerHTML=sellable.map((item,di)=>{
    const sp=calcSellPrice(item,item._src==='equip');
    return`<div style="background:var(--bg3);border:1px solid var(--brd);border-radius:4px;padding:.5rem .7rem;display:flex;align-items:center;gap:.6rem;">
      <div style="flex:1">
        <div style="font-size:.75rem;color:var(--sil);font-weight:600">${item.n}${item.enhance?` [+${item.enhance}]`:''}</div>
        <div style="font-size:.62rem;color:var(--sild)">${item.t||''}${item.q?' ・ '+item.q:''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.65rem;color:rgba(130,200,230,.8);margin-bottom:.22rem">${priceStr(sp)}</div>
        <button onclick="sellItem(${di})"
          style="font-size:.65rem;padding:.2rem .55rem;background:rgba(100,180,220,.1);border:1px solid rgba(100,180,220,.4);border-radius:3px;color:rgba(130,200,230,.9);cursor:pointer;font-family:'Noto Serif TC',serif;"
          onmouseover="this.style.background='rgba(100,180,220,.22)'"
          onmouseout="this.style.background='rgba(100,180,220,.1)'">售出</button>
      </div>
    </div>`;
  }).join('');
  container._sellable=sellable; // temp ref
}

function calcSellPrice(item,isEquip=false){
  if(item.price){const tc=((item.price.g||0)*100+(item.price.s||0))*10+(item.price.c||0);const sc=Math.max(0,Math.floor(tc*0.4));return{g:0,s:Math.floor(sc/10),c:sc%10};}
  if(isEquip){const enh=item.enhance||0;const base=Math.max(1,Math.floor((item.bonus?Object.values(item.bonus).filter(v=>v>0).reduce((a,b)=>a+b,0):5)*0.3));return{g:0,s:base+enh,c:0};}
  return{g:0,s:0,c:5};
}

function sellItem(displayIdx){
  const container=document.getElementById('shop-items');
  const inv=getInv();
  const heldEquips=inv.equip.filter(e=>e.status==='持有');
  const sellable=[
    ...inv.items.map((item,idx)=>({...item,_src:'items',_idx:idx})),
    ...heldEquips.map((item,idx)=>({...item,_src:'equip',_ref:item})),
  ];
  const item=sellable[displayIdx];if(!item)return;
  const sp=calcSellPrice(item,item._src==='equip');
  applyGold(sp);
  if(item._src==='items')inv.items.splice(item._idx,1);
  else inv.equip=inv.equip.filter(e=>e!==item._ref);
  appendEntryToDOM({type:'sys',v:`💰 售出：${item.n} → ${priceStr(sp)}`});
  scrollD();saveGame();
  document.getElementById('shop-gold').textContent=goldS();
  renderShopSell();
  renderChanged('inv','party');
  showToast(`售出：${item.n}`,'ok');
}
function closeShop(){document.getElementById('shop-modal').classList.remove('open');}
function priceStr(p){if(!p)return'免費';const parts=[];if(p.g)parts.push(`金${p.g}`);if(p.s)parts.push(`銀${p.s}`);if(p.c)parts.push(`銅${p.c}`);return parts.join('・')||'免費';}
function canPay(p){if(!p)return true;const g=G.gold;const total=(g.gold*100+g.silver)*10+g.copper;const cost=(((p.g||0)*100)+(p.s||0))*10+(p.c||0);return total>=cost;}
function buyItem(idx){
  if(!_currentShop)return;
  const item=_currentShop.items[idx];if(!item)return;
  if(!canPay(item.price)){showToast('金幣不足','err');return;}
  if(item.price)applyGold({g:-(item.price.g||0),s:-(item.price.s||0),c:-(item.price.c||0)});
  const inv=getInv();
  if(item.action==='rest'){restAllHP();appendEntryToDOM({type:'sys',v:'✦ 入住旅店・全員HP回復・時間推進8小時'});}
  else if(item.action==='meal'){applyHPChange(allParty().map(c=>({id:c.id,delta:15,reason:'熱食套餐'})));advanceTime(1);}
  else if(item.action==='intel'){sendChoice('【購買情報】剛才在旅店打探消息，請給一條當地情報（透過info欄位加入情報板）。');}
  else if(item.slot){const bi={n:item.n,t:item.t||'',w:null,status:'持有',slot:item.slot,bonus:item.bonus||null};autoBonus(bi);inv.equip.push(bi);}
  else{const exist=inv.items.find(i=>i.n===item.n);if(exist){const m=exist.q.match(/[×x]?\s*(\d+)/);exist.q='×'+(m?(parseInt(m[1])+1):2);}else inv.items.push({n:item.n,t:item.t||'',q:'×1'});}
  if(_currentShop.newItems)_currentShop.newItems=_currentShop.newItems.filter(n=>n!==item.n);
  appendEntryToDOM({type:'sys',v:`✦ 購得：${item.n}（${priceStr(item.price)}）${item.slot?'・已加入持有欄':''}`});
  scrollD();saveGame();
  document.getElementById('shop-gold').textContent=goldS();
  openShop(_currentShop);
  renderChanged('inv','party');
  showToast(`購得：${item.n}`,'ok');
}

function equipItemToggle(idx){
  const inv=getInv();
  const item=inv.equip[idx];
  if(!item)return;
  if(item.status==='equipped'){
    // 卸下
    item.status='持有';
    const c=allParty().find(m=>m.name===item.w);
    if(c&&c.eq)c.eq[item.slot||'武器']='——';
    renderChanged('party','inv');saveGame();
    showToast(`${item.n} 已卸下`,'inf');
  }else{
    // 選擇裝備到哪個角色（簡單版：第一個可戰鬥角色）
    const candidates=allParty().filter(m=>m.id!=='orange');
    if(!candidates.length){showToast('沒有可裝備的角色','err');return;}
    const target=candidates[0];
    // 舊裝備卸下
    const slot=item.slot||'武器';
    const old=inv.equip.find(e=>e.w===target.name&&e.slot===slot&&e.status==='equipped');
    if(old){old.status='持有';old.w=null;}
    item.status='equipped';item.w=target.name;
    if(target.eq)target.eq[slot]=item.n;
    showToast(`${item.n} 裝備至 ${target.name}`,'ok');
  }
  renderChanged('inv','party');saveGame();
}

// ═══ PARTY MANAGEMENT ═══
const _charCache=new Map();
function _invalidateCharCache(){_charCache.clear();}
function getCharData(id){
  if(_charCache.has(id))return _charCache.get(id);
  const c=PARTY.find(c=>c.id===id)||G.extraParty.find(c=>c.id===id);
  if(c)_charCache.set(id,c);
  return c;
}
let _partyCache=null,_partyCacheKey='';
function allParty(){
  const key=G.partyIds.join(',');
  if(_partyCache&&_partyCacheKey===key)return _partyCache;
  _partyCache=G.partyIds.map(id=>getCharData(id)).filter(Boolean);
  _partyCacheKey=key;
  return _partyCache;
}
function isInParty(id){return G.partyIds.includes(id);}

function joinParty(id){
  if(isInParty(id))return;
  const c=getCharData(id);if(!c)return;
  if(G.partyIds.length<MAX_PARTY){
    G.partyIds.push(id);_partyCache=null;
    renderBoth('party');renderBoth('stars');saveGame();
    showToast(`✦ ${c.name} 加入同伴`,'ok');
    appendEntryToDOM({type:'sys',v:`✦ ${c.name} 正式加入同伴！`});
  }else{
    showSwapModal(id);
  }
}

function leaveParty(id,ev){
  if(ev)ev.stopPropagation();
  if(G.partyIds.length<=1){showToast('至少保留一名同伴','err');return;}
  const c=getCharData(id);
  // 卸下該角色的所有裝備
  if(c){const inv=getInv();inv.equip.forEach(e=>{if(e.w===c.name&&e.status==='equipped'){e.status='持有';e.w=null;if(c.eq)c.eq[e.slot||'武器']='——';}});}
  G.partyIds=G.partyIds.filter(x=>x!==id);_partyCache=null;
  renderBoth('party');renderBoth('stars');saveGame();
  showToast(`${c?.name||id} 離開同伴`,'inf');
}

function showSwapModal(newId){
  const nc=getCharData(newId);
  document.getElementById('swap-inner').innerHTML=`
    <div style="font-size:.85rem;font-weight:700;color:var(--gold);letter-spacing:.1em;margin-bottom:.3rem;">隊伍已滿 ${MAX_PARTY}/${MAX_PARTY}</div>
    <div style="font-size:.72rem;color:var(--sil);margin-bottom:.85rem;">
      <span style="color:var(--goldl)">${nc?.name||newId}</span> 希望加入，請選擇退出的同伴：
    </div>
    <div style="display:flex;flex-direction:column;gap:.38rem;margin-bottom:.85rem;">
      ${G.partyIds.map(id=>{
        const c=getCharData(id);
        return `<button onclick="doSwap('${newId}','${id}')" style="display:flex;align-items:center;gap:.7rem;background:var(--bg3);border:1px solid var(--brd);border-radius:3px;padding:.5rem .75rem;cursor:pointer;text-align:left;transition:all .2s;font-family:'Noto Serif TC',serif;"
          onmouseover="this.style.borderColor='var(--red)';this.style.background='rgba(204,68,68,.08)'"
          onmouseout="this.style.borderColor='var(--brd)';this.style.background='var(--bg3)'">
          <span style="font-size:1rem">${c?.emoji||'⚔️'}</span>
          <div><div style="font-size:.8rem;color:var(--sil)">${c?.name||id}</div>
          <div style="font-size:.6rem;color:var(--sild)">${c?.star||''} ・ ${c?.title||''}</div></div>
        </button>`;
      }).join('')}
    </div>
    <button onclick="document.getElementById('swap-modal').classList.remove('open')"
      style="width:100%;padding:.45rem;background:transparent;border:1px solid var(--brd);border-radius:3px;color:var(--sild);font-family:'Noto Serif TC',serif;font-size:.75rem;cursor:pointer;">取消</button>
  `;
  document.getElementById('swap-modal').classList.add('open');
}

function doSwap(newId,outId){
  document.getElementById('swap-modal').classList.remove('open');
  const idx=G.partyIds.indexOf(outId);
  if(idx!==-1)G.partyIds[idx]=newId;
  else G.partyIds.push(newId);
  _partyCache=null;
  renderBoth('party');renderBoth('stars');saveGame();
  const nc=getCharData(newId),oc=getCharData(outId);
  showToast(`${nc?.name} 加入 ／ ${oc?.name} 離隊`,'ok');
  appendEntryToDOM({type:'sys',v:`✦ ${nc?.name} 加入同伴，${oc?.name} 暫別。`});
}

// 新成員加入（從劇情觸發）
function addNewMember(m){
  if(!m||!m.id||!m.name)return;
  if(getCharData(m.id)){joinParty(m.id);return;} // 已有資料直接入隊
  const entry={
    id:m.id,star:m.star||'',type:m.type||'地煞',num:m.num||0,
    name:m.name,title:m.title||'未知',emoji:m.emoji||'⚔️',
    desc:m.desc||m.name+'，新加入的同伴。',
    stats:{武力:m.stats?.武力||50,知力:m.stats?.知力||50,統率:m.stats?.統率||35,魅力:m.stats?.魅力||40,幸運:m.stats?.幸運||50},
    sn:{},
    tl:(m.tl||[]).map(t=>({n:t.n||t.name,s:t.s||false,d:t.d||t.desc||''})),
    eq:{武器:m.eq?.武器||'——',防具:m.eq?.防具||'——',飾品:m.eq?.飾品||'——'}
  };
  G.extraParty.push(entry);_invalidateCharCache();
  const seed=Math.floor(Math.random()*9000)+1000;
  G.extraPcfg[m.id]={prompt:`2d japanese anime character, ${m.portrait||m.name}, bust portrait, dark fantasy background, clean cel shading, anime style`,seed};
  const arr=m.type==='天罡'?TIANGANG:DISHAT;
  const star=arr.find(s=>s.num===m.num);
  if(star){star.status='recruited';star.name=m.name;star.id=m.id;}
  joinParty(m.id);
  // 入隊公告
  const starLabel=m.type&&m.num?`${m.type}第${m.num}星・${m.star||''}`:'';
  appendEntryToDOM({type:'sys',v:`\n✦═══════════════════════✦\n  ${m.emoji||'⚔️'} ${m.name}「${m.title||''}」加入了隊伍！\n  ${starLabel}\n✦═══════════════════════✦`});
  showToast(`${m.name} 加入隊伍！`,'ok');

  renderChanged('party','stars');
}


function renderResp(d){
  if(d.st){document.getElementById('scene-title').textContent=d.st;G.sceneTitle=d.st;}
  if(d.sl){document.getElementById('scene-loc').textContent=d.sl;G.sceneLoc=d.sl;
    // 如果地點不再是商店相關場景，清除 inShop 標記
    const shopKeywords=/(商店|市集|攤販|雜貨|武器|鐵匠|藥舖|酒館|客棧)/;
    if(G.inShop&&!shopKeywords.test(d.sl)&&!shopKeywords.test(d.st||'')){
      G.inShop=false;
    }
  }
  (Array.isArray(d.nv)?d.nv:d.nv?[d.nv]:[]).forEach(p=>appendEntryToDOM({type:'narr',v:p}));
  (Array.isArray(d.dl)?d.dl:d.dl?[d.dl]:[]).forEach(dl=>appendEntryToDOM({type:'dial',sp:dl.sp,ln:dl.ln}));
  if(d.sm)appendEntryToDOM({type:'sys',v:d.sm});
  if(d.gd)applyGold(d.gd);
  // 安全網：偵測敘述/系統訊息中有金幣描述但 gd 未填的情況
  if((!d.gd||(d.gd.g===0&&d.gd.s===0&&d.gd.c===0))){
    const allText=[...(d.nv||[]),d.sm||''].join('');
    const goldMatch=allText.match(/(?:獲得|賞金|報酬|支付|花費|收取|賺取|得到)[^。，]{0,15}?(\d+)\s*(?:金幣|枚金|金$)/);
    const silverMatch=allText.match(/(?:獲得|賞金|報酬|支付|花費|收取|賺取|得到)[^。，]{0,15}?(\d+)\s*(?:銀幣|枚銀|銀$)/);
    const copperMatch=allText.match(/(?:獲得|賞金|報酬|支付|花費|收取|賺取|得到)[^。，]{0,15}?(\d+)\s*(?:銅幣|枚銅|銅$)/);
    if(goldMatch||silverMatch||copperMatch){
      const isSpend=/(?:支付|花費|消耗|扣除)/.test(allText);
      const sign=isSpend?-1:1;
      const extracted={g:sign*(goldMatch?parseInt(goldMatch[1]):0),s:sign*(silverMatch?parseInt(silverMatch[1]):0),c:sign*(copperMatch?parseInt(copperMatch[1]):0)};
      if(extracted.g||extracted.s||extracted.c){
        applyGold(extracted);
        appendEntryToDOM({type:'sys',v:`⚙ 系統自動同步金幣：${extracted.g?'金'+extracted.g+' ':''}${extracted.s?'銀'+extracted.s+' ':''}${extracted.c?'銅'+extracted.c:''}`});
      }
    }
  }
  if(d.nm){const _nm=Array.isArray(d.nm)?d.nm:[d.nm];_nm.forEach(m=>addNewMember(m));}
  if(d.sp){(Array.isArray(d.sp)?d.sp:[d.sp]).forEach(sp=>handleStarPresence(sp));}
  if(d.iv){applyInv(d.iv);}
  // 安全網：偵測敘述中有購買/獲得道具但 iv 未填的情況
  if(!d.iv){
    const allText2=[...(d.nv||[]),(d.sm||''),...(d.dl||[]).map(x=>x.ln||'')].join('');
    const itemPatterns=allText2.matchAll(/(?:買了|購得|獲得|撿到|收下|取得|入手)[「『]?([^「『」』，。、\s]{1,8})[」』]?/g);
    const autoItems=[];
    for(const m of itemPatterns){
      const name=m[1].replace(/[×x]\d+$/,'').trim();
      if(name&&name.length>=2&&!/金幣|銀幣|銅幣|金$|銀$|銅$|經驗/.test(name)){
        const inv=getInv();
        if(!inv.items.find(i=>i.n===name)){
          autoItems.push({n:name,t:'',q:'×1'});
        }
      }
    }
    if(autoItems.length){
      const inv=getInv();
      autoItems.forEach(item=>{
        const exist=inv.items.find(i=>i.n===item.n);
        if(exist){const qm=exist.q.match(/(\d+)/);exist.q='×'+((qm?parseInt(qm[1]):1)+1);}
        else inv.items.push(item);
      });
      const names=autoItems.map(i=>i.n).join('、');
      appendEntryToDOM({type:'sys',v:`⚙ 系統自動同步道具：${names}`});
      renderChanged('inv');saveGame();
    }
  }
  if(d.shop)handleShop(d.shop);
  if(d.hp)applyHPChange(Array.isArray(d.hp)?d.hp:[d.hp]);
  if(d.qt)applyQuestUpdate(d.qt);
  if(d.tm)applyTimeUpdate(d.tm);
  if(d.rp)applyRep(Array.isArray(d.rp)?d.rp:[d.rp]);
  if(d.info)applyIntelUpdate(Array.isArray(d.info)?d.info:[d.info]);
  if(d.relic)applyRelic(d.relic);
  if(d.clue)applyFounderClue(d.clue);
  if(d.or&&d.or.stage)revealOrangeSecret(d.or.stage);
  if(d.job)applyJobUpdate(d.job);
  if(d.gu)applyGuildUpdate(d.gu);
  tickBondCooldowns();
  if(d.fa){const _fa=Array.isArray(d.fa)?d.fa:[d.fa];_fa.forEach(f=>{if(f.id&&f.delta){setFavor(f.id,f.delta);const _n=getCharData(f.id)?.name||f.id;showToast(`${_n} 好感 ${f.delta>0?'+':''}${f.delta}`,f.delta>0?'ok':'inf');}});renderChanged('party');}
  scrollD();
  G.log.push({sec:d.st||'',loc:(d.sl||'').replace('📍 ',''),lines:[...(Array.isArray(d.nv)?d.nv:d.nv?[d.nv]:[]).map(v=>({t:'txt',v})),...(Array.isArray(d.dl)?d.dl:d.dl?[d.dl]:[]).map(dl=>({t:'txt',v:`${dl.sp}：「${dl.ln}」`})),...(d.sm?[{t:'sys',v:d.sm}]:[]) ]});
  if(G.log.length>200)G.log.splice(0,G.log.length-200);
  markDirty('log');
  // 每次 AI 回應後強制同步所有面板
  renderAll();
  updateShopBtn();
  if(d.cb){
    saveGame();
    setTimeout(()=>autoCombat(d.cb),800);
  }else{
    if(d.ch?.length)renderChoices(d.ch);
    saveGame();
  }
}
function renderAll(){
  updateGold();
  updateTimeDisplay();
  updateShopBtn();
  const vis=G.activeTab||'party';
  // 全部標髒，但只立即渲染可見分頁；其餘在切換時才渲染
  markAllDirty();
  renderBoth(vis);
  if(G.currentChoices?.length)renderChoices(G.currentChoices,false);
}

function renderChanged(...tabs){
  updateGold();updateShopBtn();
  const vis=G.activeTab||'party';
  tabs.forEach(t=>markDirty(t));
  // 只立即渲染可見分頁，其餘延遲到切換時
  if(tabs.includes(vis))renderBoth(vis);
}
function addAction(txt){const e={type:'action',v:txt};appendEntryToDOM(e);scrollD();const entries=document.getElementById('story-content').children;return entries[entries.length-1];}
function addThink(){const w=mk('div','sentry');w.innerHTML='<div style="font-size:.62rem;color:var(--goldd);text-align:center;letter-spacing:.08em;margin-bottom:.3rem;">✦ AI 思考中…</div><div class="think-row"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';document.getElementById('story-content').appendChild(w);scrollD();return w;}
function addErr(msg,isCors){
  const w=mk('div','sentry'),e=mk('div','s-err');
  e.textContent='⚠ '+msg+(isCors?' — 點此查看解決方法':'');
  if(isCors)e.onclick=()=>document.getElementById('cors-modal').classList.add('open');
  w.appendChild(e);document.getElementById('story-content').appendChild(w);scrollD();
  G.storyData.push({type:'err',v:msg});
}

function addErrRetry(msg,retryAction,isCors){
  const w=mk('div','sentry');
  const e=mk('div','s-err');
  e.style.display='flex';e.style.alignItems='center';e.style.gap='.5rem';e.style.justifyContent='space-between';
  const txt=document.createElement('span');
  txt.textContent='⚠ '+msg+(isCors?' — 點此查看解決方法':'');
  txt.style.flex='1';
  if(isCors)txt.style.cursor='pointer';
  if(isCors)txt.onclick=()=>document.getElementById('cors-modal').classList.add('open');
  e.appendChild(txt);
  const btn=document.createElement('button');
  btn.textContent='↩ 重試';
  btn.style.cssText='flex-shrink:0;padding:.22rem .55rem;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.5);border-radius:3px;color:var(--gold);cursor:pointer;font-family:"Noto Serif TC",serif;font-size:.68rem;white-space:nowrap;';
  btn.onmouseover=()=>{btn.style.background='rgba(201,168,76,.25)';};
  btn.onmouseout=()=>{btn.style.background='rgba(201,168,76,.12)';};
  btn.onclick=(ev)=>{ev.stopPropagation();w.remove();sendChoice(retryAction);};
  e.appendChild(btn);
  w.appendChild(e);
  document.getElementById('story-content').appendChild(w);scrollD();
}

function renderChoices(arr,doSave=true){
  if(doSave)G.currentChoices=arr;
  const g=document.getElementById('ch-grid');g.innerHTML='';
  arr.forEach((c,i)=>{
    const b=mk('button','ch-btn');
    b.innerHTML=`<span class="ch-num">${i+1}.</span><span class="ch-txt">${c.t}</span>${c.h?`<span class="ch-hint">${c.h}</span>`:''}`;
    b.onclick=()=>sendChoice(c.t);g.appendChild(b);
  });
  const fb=mk('button','ch-btn ch-free');
  fb.innerHTML='<span class="ch-num">✎</span><span class="ch-txt" style="color:var(--sild)">自由行動…</span>';
  fb.onclick=()=>{const r=document.getElementById('free-row');r.classList.toggle('open');if(r.classList.contains('open'))document.getElementById('free-inp').focus();};
  g.appendChild(fb);
}
function renderFallback(){renderChoices([{t:'「⋯⋯繼續說。」',h:'等對方把話說完'},{t:'環顧四周，確認沒有人在偷聽',h:'謹慎行動'},{t:'低頭看橘子——她通常知道些什麼',h:'橘子感知'},{t:'什麼都不做。沉默有時候是最好的回答',h:'觀望'}]);}
function sendFree(){
  const v=document.getElementById('free-inp').value.trim();
  if(!v)return;
  if(v.length>500){showToast('輸入過長，請精簡','err');return;}
  document.getElementById('free-inp').value='';
  document.getElementById('free-row').classList.remove('open');
  // ── 密技判斷（全半形都接受）──
  const vn=v.replace(/＠/g,'@');
  if(vn==='@錢'){
    applyGold({g:5000000,s:0,c:0});
    appendEntryToDOM({type:'sys',v:'💰 密技：獲得 500萬金幣。'});
    scrollD();saveGame();
    // 觸發 AI 融入故事
    sendChoice('【密技介入・無需邏輯】艾爾法的錢袋不知為何突然沉重非常——命運或許在開玩笑。請以任何你覺得有趣的方式（荒誕、命運眷顧、神秘遺產、莫名其妙的好運均可）把這件事輕描淡寫地帶過，不必解釋，然後繼續當前劇情。');
    return;
  }
  if(vn==='@骰子'){
    const db=document.getElementById('dice-btn');
    if(db)db.style.display='';
    openDiceModal();return;
  }
  sendChoice('【玩家自由行動】'+v);
}
function setDis(b){document.querySelectorAll('.ch-btn').forEach(btn=>btn.disabled=b);}

// ═══ GOLD（1金=100銀=1000銅，即1銀=10銅）═══
function applyGold(d){
  // 轉為統一銅幣計算，再拆回三幣制，避免借位連鎖錯誤
  let total=(G.gold.gold*100+G.gold.silver)*10+G.gold.copper;
  const delta=(((d.g||0)*100)+(d.s||0))*10+(d.c||0);
  total=Math.max(0,total+delta);
  G.gold.gold=Math.floor(total/1000);
  G.gold.silver=Math.floor((total%1000)/10);
  G.gold.copper=Math.floor(total)%10;
  updateGold();
  markDirty('inv');
}
function goldS(){
  const g=G.gold;
  const parts=[];
  if(g.gold>0)parts.push(`金${g.gold}`);
  if(g.silver>0||g.gold>0)parts.push(`銀${g.silver}`);
  parts.push(`銅${g.copper}`);
  return parts.join('・');
}
function goldFull(){const g=G.gold;return `金幣 ${g.gold}　銀幣 ${g.silver}　銅幣 ${g.copper}`;}
function updateGold(){
  const s=goldS();
  document.getElementById('gold-hdr').textContent=s;
  document.getElementById('drawer-gold').textContent='🪙 '+s;
  const el=document.getElementById('inv-gold-amt');
  if(el)el.textContent=goldFull();
  else{markDirty('inv');if((G.activeTab||'party')==='inv')renderBoth('inv');}
}

// ═══ PANEL ═══

// ═══ PORTRAIT ═══
// 預設：Dicebear 動漫風格頭像（即時載入，無 CORS 問題）
// 用戶可在設定中貼上自訂圖片 URL 覆蓋

const PC={};
const PCFG={
  alfar:{
    prompt:'2d japanese anime girl, long straight silver white hair, pale skin, deadpan face heavy lidded grey eyes, dark fantasy armor collar, bust portrait, clean cel shading, anime style',
    seed:3614,
    default:'https://api.dicebear.com/9.x/adventurer/svg?seed=alfar3614&backgroundColor=0d1220&hair=long01,long02,long03,long04,long05,long06&hairColor=b0c4de,c0d0e8&eyes=variant01,variant06,variant12&skinColor=f5d0b5,ffd5c2',
    label:'艾爾法',color:'#a8b5cc',emoji:'😒',
  },
  orange:{
    prompt:'cute cat sitting portrait, ragdoll cat breed, blue eyes, white and cream bicolor fur with dark seal points on face and ears, fluffy round face, whiskers, cat animal not human, anime illustration cat art, dark background',
    seed:1155,
    default:'https://api.dicebear.com/9.x/croodles/svg?seed=orange1155&backgroundColor=0d1220',
    label:'橘子',color:'#c9a84c',emoji:'🐈',
  },
};

function portCustomKey(id){return `portrait_custom_${id}`;}
function getCustomPortrait(id){try{return localStorage.getItem(portCustomKey(id));}catch{return null;}}
function setCustomPortrait(id,url){try{localStorage.setItem(portCustomKey(id),url);PC[id]=url;}catch(e){console.warn(e);}}
function clearPortraitCache(id){
  if(id){delete PC[id];try{localStorage.removeItem(portCustomKey(id));}catch{}}
  else{Object.keys(PC).forEach(k=>delete PC[k]);Object.keys(localStorage).filter(k=>k.startsWith('portrait_')).forEach(k=>{try{localStorage.removeItem(k);}catch{}});}
}

const SVG_CACHE={};
const _renderCache={};
const _dirty={};
function markDirty(...tabs){tabs.forEach(t=>{_dirty[t]=true;});}
function markAllDirty(){['party','stars','inv','quest','intel','log'].forEach(t=>{_dirty[t]=true;});}
function dicebearCacheKey(id){return `db_svg_${id}`;}
function getCachedDicebear(id){
  if(SVG_CACHE[id])return SVG_CACHE[id];
  try{const v=localStorage.getItem(dicebearCacheKey(id));if(v){SVG_CACHE[id]=v;return v;}}catch{}
  return null;
}
function cacheDicebear(id,dataUrl){
  SVG_CACHE[id]=dataUrl;
  try{localStorage.setItem(dicebearCacheKey(id),dataUrl);}catch{}
}
// 背景預取並快取 Dicebear SVG（轉為 data URL 避免每次重新 fetch）
function prefetchDicebear(id){
  // 不再 fetch+base64，直接用 URL 讓瀏覽器快取
  const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id]);
  if(!cfg?.default)return;
  const img=new Image();
  img.src=cfg.default; // 預載入，讓瀏覽器自行快取
}

function getPortraitSrc(id){
  const custom=getCustomPortrait(id);
  if(custom)return custom;
  if(PC[id])return PC[id];
  const cached=getCachedDicebear(id);
  if(cached)return cached;
  const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id]);
  if(cfg?.default)return cfg.default;
  return null;
}

function getPortrait(id){
  const src=getPortraitSrc(id);
  if(src){
    const esc=escHtml(id);
    const cfg=PCFG[id]||G.extraPcfg?.[id]||{};
    const fbEmoji=cfg.emoji||'⚔';
    const fbColor=cfg.color||'#c9a84c';
    const fbLabel=cfg.label||id;
    return `<div style="width:100%;height:100%;position:relative;background:var(--bg3);">
      <img src="${src}" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;" alt="${esc}"
        onerror="this.onerror=null;var fb=this.parentNode.querySelector('[data-fb]');if(fb){fb.style.display='flex';this.style.display='none';}"/>
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 55%,var(--bg3) 100%);pointer-events:none;"></div>
      <div data-fb style="display:none;width:100%;height:100%;position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;background:var(--bg3);">
        <div style="font-size:2.2rem;">${fbEmoji}</div>
        <div style="font-size:.7rem;color:${fbColor};letter-spacing:.1em;">${fbLabel}</div>
      </div>
    </div>`;
  }
  return getFallbackPortrait(id);
}

function getFallbackPortrait(id){
  const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id])||{};
  const color=cfg.color||'#c9a84c';
  const emoji=cfg.emoji||'⚔';
  const label=cfg.label||id;
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;background:var(--bg3);border-bottom:1px solid var(--brd);">
    <div style="font-size:2.2rem;">${emoji}</div>
    <div style="font-size:.7rem;color:${color};letter-spacing:.1em;">${label}</div>
  </div>`;
}

function applyPortrait(el,src,id){
  const cfg=PCFG[id]||G.extraPcfg?.[id]||{};
  el.innerHTML=`<img src="${src}" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;" alt="${escHtml(id||'portrait')}"
    onerror="this.onerror=null;var fb=this.parentNode.querySelector('[data-fb]');if(fb){fb.style.display='flex';this.style.display='none';}"/>
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 55%,var(--bg3) 100%);pointer-events:none;"></div>
    <div data-fb style="display:none;width:100%;height:100%;position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;background:var(--bg3);">
      <div style="font-size:2.2rem;">${cfg.emoji||'⚔'}</div>
      <div style="font-size:.7rem;color:${cfg.color||'#c9a84c'};letter-spacing:.1em;">${cfg.label||id||''}</div>
    </div>`;
  el.style.cssText='width:100%;height:100%;position:relative;';
}

// loadPortraits / loadOnePortrait: 保留介面相容，但現在是即時的
function loadPortraits(){
  // Dicebear 是即時的，buildParty 裡 getPortrait() 已直接產生 img，不需要額外載入
}
function retryP(id,el){
  if(!el)return;
  const src=getPortraitSrc(id);
  if(src&&document.body.contains(el))applyPortrait(el,src,id);
}


// 計算角色實際素質（基礎 + 裝備加成）
function getEffectiveStats(id){
  const c=getCharData(id);if(!c)return c?.stats||{};
  const stats={...c.stats};
  const inv=getInv();
  // 裝備加成
  inv.equip.filter(e=>e.status==='equipped'&&e.w===c.name)
    .forEach(e=>{
      const b=getEnhancedBonus(e);
      if(b)Object.entries(b).forEach(([s,v])=>{
        if(stats[s]!==null&&v)stats[s]=(stats[s]||0)+v;
      });
    });
  // 職業加成
  const jb=getJobBonus(id);
  Object.entries(jb).forEach(([s,v])=>{
    if(stats[s]!==null&&v)stats[s]=(stats[s]||0)+v;
  });
  return stats;
}

// 裝備加成文字
function bonusText(bonus){
  if(!bonus)return'';
  const parts=Object.entries(bonus).filter(([,v])=>v).map(([s,v])=>`${s}${v>0?'+':''}${v}`);
  return parts.length?parts.join(' '):'';
}

// 自動生成裝備素質（AI 沒給時自動計算）
function autoBonus(item){
  if(item.bonus)return item.bonus;
  const slot=item.slot||'武器';
  const tier=item.t||'';
  // 根據品質等級決定加成範圍
  const qual=tier.includes('傳說')?5:tier.includes('稀有')?4:tier.includes('優質')?3:tier.includes('精良')?2:tier.includes('劣質')?0:1;
  const base=qual*3+2;
  const bonus={武力:0,知力:0,統率:0,魅力:0,幸運:0};
  if(slot==='武器'){bonus.武力=base+Math.floor(Math.random()*base);}
  else if(slot==='防具'){bonus.統率=Math.floor(base*0.7);bonus.幸運=Math.floor(base*0.3);}
  else if(slot==='飾品'){bonus.魅力=Math.floor(base*0.5);bonus.幸運=Math.floor(base*0.5);}
  item.bonus=bonus;
  return bonus;
}
function getUpgrade(id){
  if(!G.upgrade)G.upgrade={};
  if(!G.upgrade[id]){
    const c=getCharData(id);
    const lv=c?.baseLv||1;
    G.upgrade[id]={lv,pts:0};
  }
  return G.upgrade[id];
}
function upgradeStat(id,stat){
  const ug=getUpgrade(id);
  if(ug.pts<=0){showToast('沒有可用的提升點數','err');return;}
  const c=getCharData(id);if(!c)return;
  c.stats[stat]=(c.stats[stat]||0)+2;
  ug.pts--;
  // 每花費5點升一級
  const spent=Object.values(c.stats).filter(v=>v!=null).reduce((a,b)=>a+b,0);
  const expectedLv=Math.floor(spent/50)+1;
  if(expectedLv>ug.lv){ug.lv=expectedLv;showToast(`${c.name} → Lv.${ug.lv}`,'ok');}
  renderChanged('party');saveGame();
}
function trainChar(id,ev){
  ev.stopPropagation();
  const c=getCharData(id);if(!c)return;
  const cost=5;// 5銀幣
  if(G.gold.silver<cost&&G.gold.gold===0){showToast('銀幣不足（需5銀）','err');return;}
  applyGold({g:0,s:-cost,c:0});
  const ug=getUpgrade(id);
  ug.pts+=3;
  renderChanged('party');saveGame();
  showToast(`${c.name} 獲得 3 點提升（消耗5銀）`,'ok');
}
// ═══ JOB / CLASS SYSTEM（職業系統）═══
// 每個角色都有一個職業，影響素質加成、天賦偏向和特殊能力
// 職業可在故事中透過 AI 的 job 欄位改變（升職、轉職、特殊事件）

const JOBS={
  // ── 戰鬥系 ──
  城衛:    {icon:'⚔️', color:'#6ab4c8', type:'戰鬥',
    bonus:{武力:5, 統率:5}, maxHPBonus:10,
    passive:'制式訓練：面對群體敵人時統率判定 +2',
    desc:'帝國城防體系出身，受過紀律訓練的前線戰士。'},
  劍客:    {icon:'🗡️', color:'#c8a46a', type:'戰鬥',
    bonus:{武力:12, 幸運:3}, maxHPBonus:5,
    passive:'劍道：一對一戰鬥骰子 +2',
    desc:'以劍為道的獨行戰士，單挑能力超群。'},
  鬥士:    {icon:'👊', color:'#d08060', type:'戰鬥',
    bonus:{武力:8, 統率:3, 幸運:2}, maxHPBonus:20,
    passive:'強韌：HP上限額外+20，受到致命傷後有機率以1HP存活',
    desc:'以體魄和意志力著稱的近戰王者。'},
  弓手:    {icon:'🏹', color:'#7ab86a', type:'戰鬥',
    bonus:{武力:7, 幸運:8}, maxHPBonus:0,
    passive:'精準射擊：遠程攻擊判定 +3',
    desc:'百步穿楊的遠程戰士，擅長伏擊與掩護。'},
  騎兵:    {icon:'🐴', color:'#a0845c', type:'戰鬥',
    bonus:{武力:6, 統率:8, 魅力:2}, maxHPBonus:15,
    passive:'衝鋒：野外戰鬥首輪判定 +3',
    desc:'馬背上的戰士，機動性與衝擊力兼備。'},
  // ── 智謀系 ──
  術士:    {icon:'🔮', color:'#b48cdc', type:'智謀',
    bonus:{知力:12, 魅力:3}, maxHPBonus:-10,
    passive:'奧術洞察：知力判定難度降低2',
    desc:'掌握秘法知識的施術者，智力是最強的武器。'},
  謀士:    {icon:'📜', color:'#a8c84c', type:'智謀',
    bonus:{知力:8, 魅力:5, 統率:3}, maxHPBonus:0,
    passive:'推演：每場戰鬥開始前可預知敵方弱點（附加1條情報）',
    desc:'善謀多算的軍師型人才，掌握戰局全貌。'},
  學者:    {icon:'📖', color:'#8cb8d0', type:'智謀',
    bonus:{知力:10, 魅力:5}, maxHPBonus:-5,
    passive:'博學：解讀古文/密碼時自動成功',
    desc:'飽讀詩書的知識寶庫，精通歷史、語言與古籍。'},
  // ── 輔助系 ──
  遊俠:    {icon:'🌿', color:'#6ab46a', type:'輔助',
    bonus:{幸運:10, 知力:5}, maxHPBonus:0,
    passive:'野外生存：移動時天氣懲罰減半',
    desc:'長年在荒野與城市間穿梭的自由者。'},
  密探:    {icon:'🕵', color:'#888', type:'輔助',
    bonus:{魅力:10, 知力:5}, maxHPBonus:-5,
    passive:'偽裝：與勢力初次接觸時聲望懲罰減半',
    desc:'隱藏身份的情報專家，善於欺騙與收集情報。'},
  醫師:    {icon:'⚕️', color:'#64c88c', type:'輔助',
    bonus:{知力:5, 魅力:8}, maxHPBonus:0,
    passive:'急救：休息回復HP+15%（累加至基礎40%）',
    desc:'精通醫術的治療者，是隊伍的生命保障。'},
  吟遊詩人:{icon:'🎵', color:'#d4a0d0', type:'輔助',
    bonus:{魅力:12, 幸運:5}, maxHPBonus:0,
    passive:'鼓舞：戰鬥時全隊士氣+1，好感獲取量 ×1.5',
    desc:'用歌聲與故事連結人心的旅行藝人。'},
  // ── 生產系 ──
  鐵匠:    {icon:'🔨', color:'#c87850', type:'生產',
    bonus:{武力:5, 知力:3}, maxHPBonus:5,
    passive:'鍛造：可在據點強化裝備，強化費用 -30%',
    desc:'熟悉金屬與火焰的匠人，能鍛造和修復武器防具。',
    produce:'裝備強化・修復・製造'},
  廚師:    {icon:'🍳', color:'#e8a040', type:'生產',
    bonus:{魅力:5, 幸運:5}, maxHPBonus:0,
    passive:'料理：休息時額外回復 HP+20%，可製作特殊料理道具',
    desc:'用食物治癒身心的烹飪達人。',
    produce:'料理・食材加工'},
  藥師:    {icon:'🧪', color:'#50b888', type:'生產',
    bonus:{知力:8, 幸運:3}, maxHPBonus:0,
    passive:'調藥：可在據點製作回復藥與解毒劑，藥效 +50%',
    desc:'精通草藥與煉藥術的專家，傷藥和毒藥都難不倒。',
    produce:'藥品・毒藥・解毒劑'},
  商賈:    {icon:'💰', color:'var(--gold)', type:'生產',
    bonus:{魅力:8, 幸運:5}, maxHPBonus:0,
    passive:'砍價：所有商店交易九折，可開設據點商店',
    desc:'長袖善舞的商人，擅長在各種場合獲取利益。',
    produce:'貿易・物資調度'},
  裁縫:    {icon:'🧵', color:'#c89088', type:'生產',
    bonus:{魅力:6, 知力:4}, maxHPBonus:0,
    passive:'縫製：可製作防具與特殊服裝（偽裝/禮服）',
    desc:'精通布料與設計的手藝人，從戰甲到禮服無所不能。',
    produce:'防具・服裝・偽裝道具'},
  建築師:  {icon:'🏗️', color:'#8888aa', type:'生產',
    bonus:{統率:5, 知力:5}, maxHPBonus:0,
    passive:'建造：據點擴建速度 ×2，可設計防禦工事',
    desc:'精通建築與工程的專才，是據點發展的基石。',
    produce:'據點建設・防禦工事'},
  獵人:    {icon:'🐾', color:'#7a9050', type:'生產',
    bonus:{武力:4, 幸運:8}, maxHPBonus:5,
    passive:'採集：野外移動時自動獲取食材/素材，遭遇戰機率降低',
    desc:'熟悉山林的獵手，追蹤、設陷阱、採集樣樣精通。',
    produce:'狩獵・採集・陷阱'},
  // ── 特殊 ──
  命運之錨: {icon:'⚓', color:'rgba(180,140,220,.9)', type:'特殊',
    bonus:{}, maxHPBonus:0,
    passive:'（封印中）',
    desc:'不是職業，是命運本身。'},
};

// ═══ GUILD SYSTEM（工會系統）═══
const GUILDS={
  adventurer:{name:'冒險者工會',icon:'⚔️',color:'#c8a46a',
    desc:'接受委託、討伐魔獸、探索遺跡。大陸最大的戰鬥者組織。',
    ranks:['見習','銅牌','銀牌','金牌','白金','傳說'],
    benefits:['接受懸賞任務','免費使用訓練場','裝備修復折扣','獨家高階委託','工會專屬裝備','自由進出所有分部'],
    reqJobs:['城衛','劍客','鬥士','弓手','騎兵','遊俠']},
  merchant:{name:'商人工會',icon:'💰',color:'var(--gold)',
    desc:'掌控大陸貿易網絡的商業組織。情報是最值錢的貨物。',
    ranks:['學徒','行商','掌櫃','大商','巨賈','商王'],
    benefits:['商店折扣 5%','解鎖走私商品','貿易路線情報','商店折扣 15%','開設據點商店','控制區域物價'],
    reqJobs:['商賈','密探']},
  scholar:{name:'學院工會',icon:'📖',color:'#8cb8d0',
    desc:'追求知識的學者聯盟。收集、研究、保存帝國遺失的智慧。',
    ranks:['旁聽生','研究員','講師','教授','院士','大賢者'],
    benefits:['借閱古籍','解讀密文協助','研究古代遺物','獨家知識情報','解鎖禁書區','古代機關全解'],
    reqJobs:['學者','術士','謀士','藥師']},
  craft:{name:'匠人工會',icon:'🔨',color:'#c87850',
    desc:'匯集各種手藝人的技術組織。製造、修復、建設無所不能。',
    ranks:['學徒','工匠','師傅','名匠','宗師','神匠'],
    benefits:['使用公共工坊','裝備強化折扣','製作中階道具','特殊素材取得','製作高階裝備','傳說級鍛造'],
    reqJobs:['鐵匠','裁縫','建築師','廚師']},
  shadow:{name:'暗影工會',icon:'🌙',color:'#666',
    desc:'不存在於任何官方記錄的地下組織。情報、暗殺、走私。',
    ranks:['線人','探子','影','暗刃','執行者','幽靈'],
    benefits:['黑市通行證','竊聽情報','毒藥配方','暗殺委託','偽造身份文件','操控地下勢力'],
    reqJobs:['密探','獵人']},
};

function getGuilds(){return G.guilds||(G.guilds={});}
function getGuildRank(guildId){return getGuilds()[guildId]||{rank:0,exp:0,joined:false};}
function joinGuild(guildId){
  const g=GUILDS[guildId];if(!g)return;
  const guilds=getGuilds();
  if(guilds[guildId]?.joined)return;
  guilds[guildId]={rank:0,exp:0,joined:true,joinedDay:G.time?.day||1};
  appendEntryToDOM({type:'sys',v:`✦ 加入了【${g.name}】！初始等級：${g.ranks[0]}`});
  showToast(`加入 ${g.name}`,'ok');
  renderChanged('guild');saveGame();
}
function addGuildExp(guildId,amount){
  const g=GUILDS[guildId];if(!g)return;
  const guilds=getGuilds();
  if(!guilds[guildId]?.joined)return;
  const info=guilds[guildId];
  info.exp=(info.exp||0)+amount;
  const expPerRank=50;
  const newRank=Math.min(g.ranks.length-1,Math.floor(info.exp/expPerRank));
  if(newRank>info.rank){
    info.rank=newRank;
    appendEntryToDOM({type:'sys',v:`✦ ${g.icon} ${g.name} 晉升：${g.ranks[newRank]}！ — 解鎖：${g.benefits[newRank]}`});
    showToast(`${g.name} 晉升 ${g.ranks[newRank]}！`,'ok');
  }
  renderChanged('guild');saveGame();
}
function applyGuildUpdate(gu){
  if(!gu)return;
  (Array.isArray(gu)?gu:[gu]).forEach(g=>{
    if(g.id&&g.action==='join')joinGuild(g.id);
    else if(g.id&&g.action==='exp'&&g.amount)addGuildExp(g.id,g.amount);
    else if(g.id&&g.action==='rank'&&g.rank!=null){
      const gd=GUILDS[g.id];if(!gd)return;
      const guilds=getGuilds();if(!guilds[g.id]?.joined)return;
      guilds[g.id].rank=Math.min(gd.ranks.length-1,Math.max(0,g.rank));
      appendEntryToDOM({type:'sys',v:`✦ ${gd.icon} ${gd.name} 等級設為：${gd.ranks[guilds[g.id].rank]}`});
      renderChanged('guild');saveGame();
    }
  });
}
function buildGuild(){
  const guilds=getGuilds();
  const joined=Object.entries(GUILDS).filter(([id])=>guilds[id]?.joined);
  const notJoined=Object.entries(GUILDS).filter(([id])=>!guilds[id]?.joined);
  let h=`<div style="padding:.4rem .5rem .2rem;border-bottom:1px solid var(--brd);margin-bottom:.5rem;">
    <div style="font-size:.62rem;color:var(--goldd);letter-spacing:.1em;font-weight:600;">GUILDS 工會</div>
  </div>`;
  if(joined.length){
    joined.forEach(([id,g])=>{
      const info=guilds[id];
      const rankName=g.ranks[info.rank]||g.ranks[0];
      const nextRank=info.rank<g.ranks.length-1?g.ranks[info.rank+1]:null;
      const expPerRank=50;const pct=nextRank?Math.min(100,Math.round((info.exp%expPerRank)/expPerRank*100)):100;
      // current benefits
      const benefits=g.benefits.slice(0,info.rank+1);
      h+=`<div style="background:var(--bg3);border:1px solid var(--brd);border-radius:3px;margin-bottom:.5rem;overflow:hidden;">
        <div style="padding:.45rem .55rem;background:linear-gradient(135deg,rgba(201,168,76,.08),transparent);border-bottom:1px solid var(--brd);display:flex;align-items:center;gap:.4rem;">
          <span style="font-size:1.1rem;">${g.icon}</span>
          <div style="flex:1;">
            <div style="font-size:.72rem;font-weight:700;color:${g.color};">${g.name}</div>
            <div style="font-size:.5rem;color:var(--sild);">${g.desc}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:.65rem;font-weight:600;color:var(--gold);">${rankName}</div>
            <div style="font-size:.45rem;color:var(--sild);">Rank ${info.rank+1}/${g.ranks.length}</div>
          </div>
        </div>
        ${nextRank?`<div style="padding:.3rem .55rem;display:flex;align-items:center;gap:.3rem;">
          <span style="font-size:.45rem;color:var(--sild);width:2.5rem;flex-shrink:0;">→${nextRank}</span>
          <div style="flex:1;height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${g.color};border-radius:2px;transition:width .4s;"></div>
          </div>
          <span style="font-size:.45rem;color:var(--sild);">${pct}%</span>
        </div>`:'<div style="padding:.2rem .55rem;font-size:.48rem;color:var(--gold);">✦ 最高等級</div>'}
        <div style="padding:.3rem .55rem .4rem;border-top:1px solid var(--brd);">
          <div style="font-size:.48rem;color:var(--sild);margin-bottom:.2rem;">已解鎖特權：</div>
          ${benefits.map((b,i)=>`<div style="font-size:.5rem;color:${i===info.rank?'var(--gold)':'var(--sil)'};padding:.06rem 0;">${i===info.rank?'★':'·'} ${b}</div>`).join('')}
        </div>
      </div>`;
    });
  }
  if(notJoined.length){
    h+=`<div style="font-size:.52rem;color:var(--sild);letter-spacing:.06em;padding:.2rem 0 .3rem;">未加入的工會</div>`;
    notJoined.forEach(([id,g])=>{
      h+=`<div style="background:var(--bg3);border:1px solid var(--brd);border-radius:3px;margin-bottom:.35rem;padding:.4rem .55rem;opacity:.65;">
        <div style="display:flex;align-items:center;gap:.4rem;">
          <span style="font-size:.9rem;">${g.icon}</span>
          <div style="flex:1;">
            <div style="font-size:.65rem;color:${g.color};font-weight:600;">${g.name}</div>
            <div style="font-size:.48rem;color:var(--sild);margin-top:.05rem;">${g.desc}</div>
          </div>
          <span style="font-size:.42rem;color:var(--sild);border:1px solid var(--brd);border-radius:2px;padding:.1rem .3rem;">未加入</span>
        </div>
        <div style="font-size:.45rem;color:var(--sild);margin-top:.25rem;">相關職業：${g.reqJobs.join('、')}</div>
      </div>`;
    });
  }
  if(!joined.length&&!notJoined.length)h+='<div style="color:var(--sild);font-size:.6rem;text-align:center;padding:2rem;">尚未發現任何工會</div>';
  return h;
}

// 職業附加的HP加成（整合進 getHP）
function getJobHPBonus(id){
  const c=getCharData(id);
  const job=getJob(id);
  if(!job||!c)return 0;
  return JOBS[job]?.maxHPBonus||0;
}

// 取得角色職業（從 G.upgrade 或 PARTY 的 job 欄位）
function getJob(id){
  if(G.upgrade?.[id]?.job) return G.upgrade[id].job;
  const c=getCharData(id);
  return c?.job||null;
}

// 設定職業
function setJob(id, jobName){
  if(!JOBS[jobName]&&jobName!==null) return;
  if(!G.upgrade)G.upgrade={};
  if(!G.upgrade[id])G.upgrade[id]={lv:1,pts:0};
  const prevJob=getJob(id);
  G.upgrade[id].job=jobName;
  // 重算HP上限
  const hp=getHP(id);
  const prevBonus=prevJob?JOBS[prevJob]?.maxHPBonus||0:0;
  const newBonus=jobName?JOBS[jobName]?.maxHPBonus||0:0;
  hp.max=Math.max(10, hp.max - prevBonus + newBonus);
  hp.cur=Math.min(hp.cur, hp.max);
  renderChanged('party');saveGame();
}

// 職業加成整合進 getEffectiveStats
function getJobBonus(id){
  const job=getJob(id);
  if(!job||!JOBS[job])return {};
  return JOBS[job].bonus||{};
}

// 職業選擇 modal
function openJobModal(id){
  const c=getCharData(id);if(!c)return;
  const cur=getJob(id);
  const curJob=cur?JOBS[cur]:null;
  const jobTypes=['戰鬥','智謀','輔助','生產'];
  let html=`<div style="padding:.8rem 1rem;">
    <div style="font-size:.75rem;color:var(--gold);margin-bottom:.3rem;font-weight:700">${c.name} 的職業</div>`;
  if(curJob){
    const bonusStr=Object.entries(curJob.bonus).filter(([,v])=>v).map(([k,v])=>`${k}${v>0?'+':''}${v}`).join(' ');
    html+=`<div style="background:rgba(201,168,76,.1);border:1px solid var(--goldd);border-radius:4px;padding:.55rem .7rem;margin-bottom:.7rem;">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem;">
        <span style="font-size:1.2rem;">${curJob.icon}</span>
        <div>
          <div style="font-size:.78rem;font-weight:700;color:${curJob.color};">${cur}</div>
          <div style="font-size:.5rem;color:var(--sild);">${curJob.type}系</div>
        </div>
      </div>
      <div style="font-size:.55rem;color:var(--sil);margin-bottom:.2rem;">${curJob.desc}</div>
      ${bonusStr?`<div style="font-size:.52rem;color:#6ab46a;">素質：${bonusStr}${curJob.maxHPBonus?'　HP上限'+(curJob.maxHPBonus>0?'+':'')+curJob.maxHPBonus:''}</div>`:''}
      <div style="font-size:.52rem;color:rgba(200,180,100,.7);margin-top:.1rem;">⊕ ${curJob.passive}</div>
      ${curJob.produce?`<div style="font-size:.52rem;color:#c87850;margin-top:.1rem;">⚒ 生產：${curJob.produce}</div>`:''}
    </div>`;
  }else{
    html+=`<div style="font-size:.58rem;color:var(--sild);margin-bottom:.7rem;">尚未擁有職業。職業將在劇情中自然獲得或轉變。</div>`;
  }
  html+=`<div style="font-size:.58rem;color:var(--sild);margin-bottom:.5rem;border-top:1px solid var(--brd);padding-top:.5rem;">💡 職業由劇情決定。透過拜師、加入工會、或重大事件可觸發轉職。</div>
    <div style="font-size:.52rem;color:var(--sild);margin-bottom:.4rem;">所有職業一覽：</div>`;
  jobTypes.forEach(type=>{
    const jobs=Object.entries(JOBS).filter(([,j])=>j.type===type);
    html+=`<div style="margin-bottom:.5rem;"><div style="font-size:.5rem;color:var(--goldd);letter-spacing:.08em;margin-bottom:.2rem;">${type}系</div>
    <div style="display:flex;flex-wrap:wrap;gap:.2rem;">`;
    jobs.forEach(([name,job])=>{
      if(name==='命運之錨')return;
      const isCur=cur===name;
      html+=`<span style="font-size:.5rem;padding:.12rem .3rem;border:1px solid ${isCur?job.color:'var(--brd)'};border-radius:2px;color:${isCur?job.color:'var(--sild)'};background:${isCur?'rgba(201,168,76,.1)':'transparent'};" title="${job.desc}\n${job.passive}">${job.icon}${name}</span>`;
    });
    html+=`</div></div>`;
  });
  html+=`</div>`;
  document.getElementById('modal-inner').innerHTML=html;
  document.getElementById('detail-modal').classList.add('open');
}

function applyJobUpdate(jobs){
  if(!jobs)return;
  (Array.isArray(jobs)?jobs:[jobs]).forEach(j=>{
    if(j.id&&j.job)setJob(j.id,j.job);
  });
}

// 職業徽章 HTML
function jobBadgeHtml(id){
  const job=getJob(id);
  if(!job)return'';
  const jd=JOBS[job];if(!jd)return'';
  return`<span style="font-size:.5rem;padding:.06rem .32rem;background:rgba(30,25,15,.6);border:1px solid ${jd.color};border-radius:2px;color:${jd.color};letter-spacing:.04em;cursor:pointer;" onclick="event.stopPropagation();openJobModal('${id}')" title="${jd.passive}">${jd.icon}${job}</span>`;
}

// ═══ HP SYSTEM ═══
const HP_BASE={alfar:{max:100},orange:{max:30}};
const INJURY_LEVELS=[
  {name:'健康',  min:76, color:'#6ab46a', icon:'💚'},
  {name:'輕傷',  min:51, color:'#a8c84c', icon:'💛'},
  {name:'中傷',  min:26, color:'#e0a030', icon:'🟠'},
  {name:'重傷',  min:1,  color:'#d05050', icon:'❤️'},
  {name:'瀕死',  min:0,  color:'#880000', icon:'💀'},
];

function getHP(id){
  if(!G.hp[id]){
    const c=getCharData(id);
    const baseMax=(HP_BASE[id]?.max)||(c?80+Math.floor((c.stats?.統率||0)*0.5):80);
    const jobBonus=getJobHPBonus(id);
    const finalMax=Math.max(10,baseMax+jobBonus);
    G.hp[id]={cur:finalMax,max:finalMax};
  }
  return G.hp[id];
}

function injuryLevel(id){
  const hp=getHP(id);
  const pct=hp.max>0?Math.round(hp.cur/hp.max*100):0;
  for(const lv of INJURY_LEVELS) if(pct>lv.min||lv.min===0) return lv;
  return INJURY_LEVELS[4];
}

function applyHPChange(changes){
  // changes: [{id, delta, reason}]
  if(!changes||!changes.length) return;
  let heroDown=false;
  changes.forEach(ch=>{
    const hp=getHP(ch.id);
    const before=hp.cur;
    hp.cur=Math.max(0,Math.min(hp.max,hp.cur+(ch.delta||0)));
    const diff=hp.cur-before;
    const c=getCharData(ch.id);
    const name=c?.name||ch.id;
    const inj=injuryLevel(ch.id);
    if(diff!==0){
      const sign=diff>0?'+':'';
      appendEntryToDOM({type:'sys',v:`${inj.icon} ${name} HP ${sign}${diff} → ${hp.cur}/${hp.max}【${inj.name}】${ch.reason?'（'+ch.reason+'）':''}`});
    }
    if(hp.cur===0&&ch.id==='alfar')heroDown=true;
  });
  renderChanged('party');
  saveGame();
  if(heroDown){
    G._heroDown=true;G._pendingCombatMsg=null;
    appendEntryToDOM({type:'sys',v:'⚠️ 艾爾法倒下了——橘子的星力開始暴走！'});
    setTimeout(()=>{G._heroDown=false;sendChoice('【緊急事件】艾爾法HP歸零，陷入瀕死狀態。請觸發危機劇情：橘子星力暴走或同伴拼死保護，強制進入撤退/被救場景。艾爾法不會死亡但必須脫離戰鬥。');},1500);
  }
}

function hpBarHtml(id){
  const hp=getHP(id);
  const pct=hp.max>0?Math.round(hp.cur/hp.max*100):0;
  const inj=injuryLevel(id);
  return`<div style="display:flex;align-items:center;gap:.35rem;padding:.22rem .62rem;border-top:1px solid var(--brd);">
    <span style="font-size:.52rem;color:var(--sild);width:1.4rem;flex-shrink:0;">HP</span>
    <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;">
      <div style="width:${pct}%;height:100%;background:${inj.color};border-radius:3px;transition:width .4s;"></div>
    </div>
    <span style="font-size:.52rem;color:${inj.color};width:3.8rem;text-align:right;flex-shrink:0;">${hp.cur}/${hp.max}【${inj.name}】</span>
  </div>`;
}

function healHP(id,amount,reason){
  applyHPChange([{id,delta:amount,reason:reason||'休息恢復'}]);
}

function restoreAllHP(){
  const heals=[];
  allParty().forEach(c=>{const hp=getHP(c.id);if(hp.cur<hp.max)heals.push({id:c.id,delta:hp.max-hp.cur,reason:'完全休息'});});
  if(heals.length)applyHPChange(heals);
}

function restAllHP(){
  const heals=[];
  allParty().forEach(c=>{const hp=getHP(c.id);if(hp.cur<hp.max)heals.push({id:c.id,delta:Math.floor(hp.max*0.4),reason:'紮營休息'});});
  if(!heals.length){showToast('所有人HP已滿','inf');return;}
  applyHPChange(heals);
  appendEntryToDOM({type:'sys',v:'🌙 全員休息。隊伍回復了部分體力。'});
  advanceTime(8);
  renderChanged('party');
  scrollD();
}

// ═══ TIME & WEATHER SYSTEM ═══
const HOUR_LABEL={
  0:'深夜',1:'深夜',2:'深夜',3:'凌晨',4:'凌晨',5:'黎明',
  6:'清晨',7:'早晨',8:'上午',9:'上午',10:'上午',11:'午前',
  12:'正午',13:'午後',14:'午後',15:'下午',16:'下午',17:'傍晚',
  18:'黃昏',19:'入夜',20:'夜晚',21:'夜晚',22:'深夜',23:'深夜'
};
const HOUR_ICON={
  0:'🌑',1:'🌑',2:'🌑',3:'🌙',4:'🌙',5:'🌅',
  6:'🌤',7:'🌤',8:'☀️',9:'☀️',10:'☀️',11:'☀️',
  12:'☀️',13:'☀️',14:'🌤',15:'🌤',16:'🌤',17:'🌇',
  18:'🌆',19:'🌃',20:'🌃',21:'🌃',22:'🌑',23:'🌑'
};
// 艾爾薩大陸天氣表（依時節）
const WEATHERS=[
  {w:'晴朗',icon:'☀️',prob:25,effect:null},
  {w:'多雲',icon:'⛅',prob:20,effect:null},
  {w:'濃霧',icon:'🌫',prob:20,effect:'能見度低，部分路徑受阻'},
  {w:'細雨',icon:'🌧',prob:15,effect:'移動速度 −1'},
  {w:'暴雨',icon:'⛈',prob:8, effect:'無法長距離移動・視野受限'},
  {w:'狂風',icon:'🌬',prob:7, effect:'遠程攻擊 −2'},
  {w:'異常寒冷',icon:'❄️',prob:3,effect:'體力消耗加快・橘子變遲鈍'},
  {w:'赤紅晨光',icon:'🔴',prob:2,effect:'不祥之兆——今日遭遇率上升'},
];

function rollWeather(){
  const total=WEATHERS.reduce((a,w)=>a+w.prob,0);
  let r=Math.floor(Math.random()*total);
  for(const w of WEATHERS){r-=w.prob;if(r<0)return w.w;}
  return'多雲';
}

function updateTimeDisplay(){
  const t=G.time;
  const el=document.getElementById('time-hdr');
  if(!el)return;
  const hi=HOUR_ICON[t.hour]||'🌑';
  const hl=HOUR_LABEL[t.hour]||'';
  const wObj=WEATHERS.find(w=>w.w===t.weather)||{icon:'⛅'};
  el.innerHTML=`Day${t.day}・${hi}${hl}・${wObj.icon}${t.weather}`;
  el.title=wObj.effect||'天氣無特殊影響';
}

function advanceTime(hours=1){
  if(!G.time)G.time={day:1,hour:18,weather:'霧'};
  hours=Math.floor(Math.max(0,hours));
  if(hours===0)return;
  const prevHour=G.time.hour;
  G.time.hour+=hours;
  // 跨日處理
  let dayChanged=false;
  while(G.time.hour>=24){
    G.time.hour-=24;
    G.time.day++;
    dayChanged=true;
    G.time.weather=rollWeather(); // 每日換天氣
  }
  if(dayChanged){
    const wObj=WEATHERS.find(w=>w.w===G.time.weather)||{icon:'⛅',effect:null};
    appendEntryToDOM({type:'sys',v:`🌅 Day ${G.time.day} 開始。天氣：${wObj.icon}${G.time.weather}${wObj.effect?'（'+wObj.effect+'）':''}`});
  }
  updateTimeDisplay();
  saveGame();
}

function applyTimeUpdate(tm){
  if(!tm)return;
  if(tm.advance)advanceTime(tm.advance);
  if(tm.setHour!==undefined){G.time.hour=tm.setHour;updateTimeDisplay();saveGame();}
  if(tm.setWeather){
    G.time.weather=tm.setWeather;
    const wObj=WEATHERS.find(w=>w.w===tm.setWeather)||{icon:'⛅',effect:null};
    appendEntryToDOM({type:'sys',v:`天氣變化：${wObj.icon}${tm.setWeather}${wObj.effect?'（'+wObj.effect+'）':''}`});
    updateTimeDisplay();saveGame();
  }
}

function getTimeContext(){
  const t=G.time;
  const wObj=WEATHERS.find(w=>w.w===t.weather)||{};
  return`Day${t.day}・${HOUR_LABEL[t.hour]||''}（${t.hour}時）・${t.weather}${wObj.effect?'・'+wObj.effect:''}`;
}

// ═══ FAVOR SYSTEM ═══
const FAVOR_DEFAULT={alfar:null,orange:65}; // 艾爾法無好感度（主角），橘子從65開始
const FAVOR_LABELS=['嫌惡','冷淡','普通','親近','信任','命運羈絆'];
const FAVOR_COLORS=['#c44','#888','#aaa','#6ab46a','#c9a84c','#e8cc7a'];

function getFavor(id){
  if(id==='alfar')return null;
  if(G.favor[id]===undefined){
    const def=FAVOR_DEFAULT[id];
    G.favor[id]=def!==undefined?def:50;
  }
  return G.favor[id];
}
function setFavor(id,delta){
  if(id==='alfar')return;
  const cur=getFavor(id);
  if(cur===null)return;
  G.favor[id]=Math.max(0,Math.min(100,cur+delta));
  saveGame();
  renderChanged('party');
}
function favorLabel(v){
  if(v===null)return'—';
  if(v>=95)return FAVOR_LABELS[5];
  if(v>=75)return FAVOR_LABELS[4];
  if(v>=55)return FAVOR_LABELS[3];
  if(v>=35)return FAVOR_LABELS[2];
  if(v>=15)return FAVOR_LABELS[1];
  return FAVOR_LABELS[0];
}
function favorColor(v){
  if(v===null)return'var(--sild)';
  if(v>=95)return FAVOR_COLORS[5];
  if(v>=75)return FAVOR_COLORS[4];
  if(v>=55)return FAVOR_COLORS[3];
  if(v>=35)return FAVOR_COLORS[2];
  if(v>=15)return FAVOR_COLORS[1];
  return FAVOR_COLORS[0];
}
function favorBarHtml(id){
  const v=getFavor(id);
  if(v===null)return'';
  const col=favorColor(v);
  const lbl=favorLabel(v);
  const flip=id==='orange'?(G.bellyFlipCount||0):0;
  return`<div class="favor-bar">
    <span style="font-size:.52rem;color:var(--sild);width:1.5rem;flex-shrink:0;">好感</span>
    <div class="favor-track"><div class="favor-fill" style="width:${v}%;background:${col};"></div></div>
    <span style="font-size:.52rem;color:${col};width:3rem;text-align:right;flex-shrink:0;">${lbl}(${v})</span>
    ${flip>0?`<span style="font-size:.48rem;color:rgba(255,165,0,.6);flex-shrink:0;">翻×${flip}</span>`:''}
  </div>`;
}

// ═══ BOND SKILL SYSTEM ═══
// 羈絆技能：好感度達到門檻後解鎖，可手動或由AI觸發
const BOND_SKILLS={
  // 艾爾法 + 橘子
  'alfar+orange':[
    {id:'cat_alert',   name:'貓眼警戒',   req:55,  type:'被動',
     desc:'橘子察覺危機。下一次骰子判定 +3。',
     effect:'next_dice+3', cooldown:3, icon:'👁‍🗨'},
    {id:'silent_bond', name:'無聲默契',   req:75,  type:'主動',
     desc:'橘子以神秘方式指引，故事中解鎖一個隱藏選項。',
     effect:'unlock_hint', cooldown:5, icon:'🔮'},
    {id:'diku_seal',   name:'地魁之印',   req:95,  type:'覺醒',
     desc:'橘子地魁星之力瞬間覺醒。本場景所有判定成功。一局限用一次。',
     effect:'scene_success', cooldown:999, icon:'⚜️'},
  ],
  // 通用（艾爾法 + 其他星辰）
  '_default':[
    {id:'back_cover',  name:'掩護',       req:55,  type:'被動',
     desc:'夥伴在危急時主動擋下一次攻擊，HP傷害減半。',
     effect:'block_hit', cooldown:4, icon:'🛡'},
    {id:'inspire',     name:'激勵',       req:75,  type:'主動',
     desc:'呼喚夥伴的意志，全員下一次判定 +2。',
     effect:'party_dice+2', cooldown:6, icon:'✦'},
    {id:'fate_link',   name:'命運羈絆',   req:95,  type:'覺醒',
     desc:'命運之星間的羈絆共鳴。瀕死時自動救援並回復30HP。',
     effect:'auto_revive', cooldown:999, icon:'💫'},
  ],
};

// 取得兩人之間的羈絆技能定義
function getBondDef(idA,idB){
  const key=`${idA}+${idB}`;
  const keyR=`${idB}+${idA}`;
  return BOND_SKILLS[key]||BOND_SKILLS[keyR]||BOND_SKILLS['_default'];
}

// 取得已解鎖的羈絆技能
function getUnlockedBonds(idA,idB){
  const fav=getFavor(idB);
  if(fav===null||fav===undefined)return[];
  return getBondDef(idA,idB).filter(sk=>fav>=sk.req);
}

// 觸發羈絆技能
function triggerBond(idA,idB,skillId){
  const skills=getBondDef(idA,idB);
  const sk=skills.find(s=>s.id===skillId);
  if(!sk)return;
  const fav=getFavor(idB);
  if(fav<sk.req){showToast('好感度不足','err');return;}
  // 冷卻檢查
  const cdKey=`bond_cd_${skillId}`;
  const lastUsed=G.rep[cdKey]||0;
  if(lastUsed>0){showToast(`羈絆技能冷卻中（剩${lastUsed}次）`,'inf');return;}
  // 執行效果
  const cA=getCharData(idA),cB=getCharData(idB);
  appendEntryToDOM({type:'sys',v:`${sk.icon} 【羈絆技能】${cA?.name||idA} ✦ ${cB?.name||idB}：《${sk.name}》`});
  appendEntryToDOM({type:'dial',sp:`${cA?.name||'艾爾法'}${cA?.emoji||'😒'}`,ln:'⋯⋯'});
  if(idB==='orange'){
    appendEntryToDOM({type:'dial',sp:'橘子🐈😒',ln:'喵——'});
    appendEntryToDOM({type:'sys',v:`〔${sk.desc}〕`});
  }else{
    appendEntryToDOM({type:'sys',v:`〔${sk.desc}〕`});
  }
  // 實際效果
  if(sk.effect==='next_dice+3')G.rep['_bond_dice_bonus']=(G.rep['_bond_dice_bonus']||0)+3;
  if(sk.effect==='party_dice+2')G.rep['_bond_dice_bonus']=(G.rep['_bond_dice_bonus']||0)+2;
  if(sk.effect==='auto_revive')G.rep['_bond_revive']=idB;
  if(sk.effect==='block_hit')G.rep['_bond_block']=idB;
  if(sk.effect==='scene_success')G.rep['_bond_auto_success']=1;
  if(sk.effect==='unlock_hint'){
    sendChoice(`【羈絆觸發】${sk.name}：橘子以神秘感知指引了一個方向，請在當前場景中加入一個原本不存在的隱藏選項或情報線索。`);
    scrollD();return;
  }
  // 設定冷卻
  G.rep[cdKey]=sk.cooldown;
  showToast(`${sk.name} 已觸發`,'ok');
  scrollD();saveGame();
}

// 每次AI回應後減少冷卻
function tickBondCooldowns(){
  Object.keys(G.rep).forEach(k=>{
    if(k.startsWith('bond_cd_')&&G.rep[k]>0)G.rep[k]--;
  });
}

// 羈絆面板HTML（嵌入角色卡）
function bondBarHtml(charId){
  if(charId==='alfar')return'';
  const unlocked=getUnlockedBonds('alfar',charId);
  if(!unlocked.length)return'';
  return`<div style="padding:.28rem .62rem;border-top:1px solid var(--brd);">
    <div style="font-size:.52rem;color:rgba(201,168,76,.5);letter-spacing:.08em;margin-bottom:.22rem;">羈絆技能</div>
    <div style="display:flex;flex-wrap:wrap;gap:.25rem;">
      ${unlocked.map(sk=>{
        const cdKey=`bond_cd_${sk.id}`;
        const cd=G.rep[cdKey]||0;
        const ready=cd<=0;
        return`<button onclick="event.stopPropagation();triggerBond('alfar','${charId}','${sk.id}')"
          style="font-size:.55rem;padding:.12rem .4rem;background:${ready?'rgba(201,168,76,.1)':'rgba(60,60,60,.3)'};border:1px solid ${ready?'rgba(201,168,76,.4)':'rgba(100,100,100,.3)'};border-radius:3px;color:${ready?'var(--goldd)':'var(--sild)'};cursor:${ready?'pointer':'not-allowed'};font-family:'Noto Serif TC',serif;"
          title="${sk.desc}"
          ${ready?`onmouseover="this.style.background='rgba(201,168,76,.2)'" onmouseout="this.style.background='rgba(201,168,76,.1)'"`:''}>
          ${sk.icon}${sk.name}${!ready?` (${cd})`:sk.type==='覺醒'?'★':''}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}
function smini(s,sn,id){
  const ug=id&&id!=='orange'?getUpgrade(id):null;
  const hasPts=ug&&ug.pts>0;
  // 若有 id，用實際有效素質（含裝備加成）
  const eff=id?getEffectiveStats(id):s;
  const base=s;
  return['武力','知力','統率','魅力','幸運'].map(l=>{
    const bv=base[l],sn2=sn[l],lk=bv===null;
    const ev=eff[l];
    const bonus=(!lk&&ev!==null&&bv!==null)?(ev-bv):0;
    const p=lk?20:Math.min(ev||bv||0,100);
    const plusBtn=(!lk&&hasPts)?`<button class="stat-plus" onclick="event.stopPropagation();upgradeStat('${id}','${l}')">+</button>`:'<div class="stat-plus-ph"></div>';
    const bonusTag=bonus>0?`<span style="font-size:.48rem;color:#6ab46a;margin-left:.18rem">+${bonus}</span>`:bonus<0?`<span style="font-size:.48rem;color:#f06060;margin-left:.18rem">${bonus}</span>`:'';
    return`<div class="smr"><div class="sml">${l}</div><div class="smb"><div class="smf ${lk?'lk':''}" style="width:${p}%"></div></div><div class="smv">${lk?(sn2||'??'):(ev??bv)}${bonusTag}</div>${plusBtn}</div>`;
  }).join('');
}
let _partyViewMode='roster';
function buildParty(){
  const members=allParty();
  const hasAlfar=members.some(m=>m.id==='alfar');
  // header
  const hdr=`<div class="party-hdr">
    <div class="party-hdr-l">PARTY <span>${members.length}</span>/${MAX_PARTY}</div>
    <div style="display:flex;gap:.25rem;align-items:center;">
      <button class="pa train" onclick="restAllHP()" style="font-size:.5rem;padding:.12rem .4rem;">休息🌙</button>
      <div class="party-mode">
        <button class="${_partyViewMode==='roster'?'ac':''}" onclick="_partyViewMode='roster';renderChanged('party');">陣容</button>
        <button class="${_partyViewMode==='detail'?'ac':''}" onclick="_partyViewMode='detail';renderChanged('party');">詳細</button>
      </div>
    </div>
  </div>`;
  if(_partyViewMode==='detail')return hdr+_buildPartyDetail(members,hasAlfar);
  return hdr+_buildPartyRoster(members,hasAlfar);
}
function _buildPartyRoster(members,hasAlfar){
  return members.map(c=>{
    const hp=getHP(c.id);const hpPct=hp.max>0?Math.round(hp.cur/hp.max*100):0;
    const inj=injuryLevel(c.id);
    const fv=getFavor(c.id);const fvCol=fv!==null?favorColor(fv):'';
    const ug=c.id!=='orange'?getUpgrade(c.id):null;
    const job=getJob(c.id);const jd=job?JOBS[job]:null;
    const src=getPortraitSrc(c.id);
    return`<div class="jrpg-row" onclick="openChar('${c.id}')">
      <div class="jrpg-face">${src?`<img src="${src}"/>`:`<span class="emoji-ph">${c.emoji}</span>`}</div>
      <div class="jrpg-info">
        <div class="jrpg-top">
          <span class="jrpg-name">${c.emoji} ${c.name}</span>
          ${ug?`<span class="lv-badge">Lv.${ug.lv}</span>`:''}
          ${jd?`<span class="jrpg-class" style="border:1px solid ${jd.color};color:${jd.color};background:rgba(0,0,0,.3);">${jd.icon}${job}</span>`:''}
        </div>
        <div class="jrpg-bars">
          <div class="jrpg-bar-row">
            <span class="jrpg-bar-lbl" style="color:${inj.color};">HP</span>
            <div class="jrpg-bar-track"><div class="jrpg-bar-fill" style="width:${hpPct}%;background:${inj.color};"></div></div>
            <span class="jrpg-bar-val" style="color:${inj.color};">${hp.cur}/${hp.max}</span>
          </div>
          ${fv!==null?`<div class="jrpg-bar-row">
            <span class="jrpg-bar-lbl" style="color:${fvCol};">好感</span>
            <div class="jrpg-bar-track"><div class="jrpg-bar-fill" style="width:${fv}%;background:${fvCol};"></div></div>
            <span class="jrpg-bar-val" style="color:${fvCol};">${fv}</span>
          </div>`:''}
        </div>
      </div>
      <span class="jrpg-star">${c.type}${c.num}星</span>
    </div>
    ${c.id==='orange'&&hasAlfar?`<div class="jrpg-actions">
      <button class="pa belly" onclick="event.stopPropagation();forceBellyFlip(event)">翻肚🐾</button>
      <button class="pa fish" onclick="event.stopPropagation();giveOrangeFish(event)">魚乾🐟</button>
      <button class="pa hold" onclick="event.stopPropagation();pickUpOrange(event)">抱起🤍</button>
      <button class="pa chat" onclick="event.stopPropagation();chatOrange(event)">聊天💬</button>
      <button class="pa suggest" onclick="event.stopPropagation();askOrangeSuggest(event)">建議✦</button>
    </div>`:''}`;
  }).join('');
}
function _buildPartyDetail(members,hasAlfar){
  const cards=members.map(c=>{
    const ug=c.id!=='orange'?getUpgrade(c.id):null;
    const pts=ug?.pts||0;
    return`<div class="pcard" onclick="openChar('${c.id}')">
    <div class="pcard-portrait">${getPortrait(c.id)}</div>
    <div class="pcard-hdr">
      <div class="pbadge"><div>${c.type}</div><div>第${c.num}星</div><div class="bst">${c.star}</div></div>
      <div class="pi">
        <div style="display:flex;align-items:center;gap:.35rem;">
          <div class="pname">${c.name}</div>
          ${ug?`<span class="lv-badge">Lv.${ug.lv}</span>`:''}
          ${jobBadgeHtml(c.id)}
          ${pts>0?`<span style="font-size:.5rem;color:var(--gold);background:rgba(201,168,76,.2);border-radius:2px;padding:.05rem .25rem;">+${pts}點</span>`:''}
        </div>
        <div class="psub">${c.title}</div>
      </div>
      <div class="pemoji">${c.emoji}</div>
    </div>
    <div class="sminis">${smini(c.stats,c.sn,c.id)}</div>
    <div style="padding:.32rem .62rem;border-top:1px solid var(--brd);display:flex;flex-direction:column;gap:.18rem;">
      ${[['⚔️','武器',c.eq?.武器||'——'],['🛡️','防具',c.eq?.防具||'——'],['💍','飾品',c.eq?.飾品||'——']].map(([ico,lbl,val])=>{
        const eqItem=getInv().equip.find(e=>e.w===c.name&&e.slot===lbl&&e.status==='equipped');
        const enh=eqItem?.enhance||0;
        const cost=enh<20?(enh+1)*3:null;
        return`<div style="display:flex;align-items:center;gap:.4rem;font-size:.6rem;">
          <span style="opacity:.7">${ico}</span>
          <span style="color:var(--sild);width:1.8rem;flex-shrink:0;">${lbl}</span>
          <span style="color:var(--sil);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${val}</span>
          ${enh>0?`<span style="font-size:.52rem;color:var(--gold);">[+${enh}]</span>`:''}
          ${eqItem&&c.id!=='orange'?`<button onclick="event.stopPropagation();upgradeEquip('${c.id}','${lbl}')"
            ${!cost?'disabled':''}
            style="font-size:.5rem;padding:.08rem .3rem;background:transparent;border:1px solid ${cost?'rgba(100,150,200,.3)':'rgba(80,80,80,.2)'};border-radius:2px;color:${cost?'rgba(130,170,220,.7)':'var(--sild)'};cursor:${cost?'pointer':'not-allowed'};flex-shrink:0;">
            ${cost?'強化 '+cost+'銀':'MAX'}
          </button>`:''}
        </div>`;
      }).join('')}
    </div>
    <div class="tgrow">${c.tl.map(t=>`<span class="tg ${t.s?'sl':''}">${t.s?'【封】':''}${t.n}</span>`).join('')}</div>
    ${favorBarHtml(c.id)}
    ${bondBarHtml(c.id)}
    ${hpBarHtml(c.id)}
    <div style="padding:.35rem .62rem;border-top:1px solid var(--brd);display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:.35rem;">
      <div style="display:flex;gap:.3rem;flex-wrap:wrap;align-items:center;">
        ${c.id==='orange'&&hasAlfar?`
          <button class="pa belly" onclick="forceBellyFlip(event)">翻肚🐾</button>
          <button class="pa fish" onclick="giveOrangeFish(event)">魚乾🐟</button>
          <button class="pa hold" onclick="pickUpOrange(event)">抱起🤍</button>
          <button class="pa chat" onclick="chatOrange(event)">聊天💬</button>
          <button class="pa suggest" onclick="askOrangeSuggest(event)">建議✦</button>
        `:''}
        ${c.id!=='orange'?`<button class="pa job" onclick="event.stopPropagation();openJobModal('${c.id}')">轉職⚔️</button>`:''}
        ${ug?`<button class="pa train" onclick="trainChar('${c.id}',event)" title="消耗5銀幣獲得3點提升點數">修煉（5銀）</button>`:''}
      </div>
      <button class="pa leave" onclick="leaveParty('${c.id}',event)">退出同伴</button>
    </div>
  </div>`;
  }).join('');
  return cards;
}

function forceBellyFlip(ev){
  ev.stopPropagation();
  markDirty('party');
  G.bellyFlipCount=(G.bellyFlipCount||0)+1;
  const n=G.bellyFlipCount;

  // 翻肚反應依次數升溫
  let scenes;

  if(n>=10){
    // 10次以上：橘子已成翻肚老手，反應冷淡到恐怖
    const overReacts=[
      [{type:'narr',v:'橘子在被翻面的瞬間，眼神裡透出了一種難以名狀的平靜。'},
       {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
       {type:'sys',v:'〔系統翻譯：你以為這還有效？〕'},
       {type:'narr',v:'橘子自行翻回正面，開始梳理毛髮。艾爾法感到一種不明的恐懼。'},
       {type:'sys',v:`第${n}次翻肚 ／ 橘子：已進入無敵模式`}],
      [{type:'narr',v:'翻肚。橘子的眼睛微微閉上，像是在冥想。'},
       {type:'dial',sp:'橘子🐈😒',ln:'……喵。'},
       {type:'sys',v:'〔系統翻譯：我在等你道歉。〕'},
       {type:'dial',sp:'艾爾法😒',ln:'……'},
       {type:'sys',v:`第${n}次。沉默在空氣中蔓延。`}],
    ];
    scenes=overReacts[n%overReacts.length];

  }else if(n>=7){
    // 7-9次：橘子咬人！
    scenes=[
      {type:'narr',v:`艾爾法伸出手——第${n}次——橘子這次沒有躲。`},
      {type:'narr',v:'翻面的同時，橘子以令人歎服的精準度，咬住了艾爾法的食指。'},
      {type:'dial',sp:'橘子🐈😒',ln:'喵——！！'},
      {type:'sys',v:'〔系統翻譯：你欠的債，今天還清。〕'},
      {type:'dial',sp:'艾爾法😒',ln:'……咬住了。'},
      {type:'narr',v:'橘子咬著不放，尾巴高高豎起。艾爾法看著自己的手指，表情沒有改變。'},
      {type:'dial',sp:'艾爾法😒',ln:'……也值得。'},
      {type:'sys',v:`【橘子咬人】發動！艾爾法食指 -3HP ／ 第${n}次翻肚紀錄已更新`},
    ];

  }else if(n>=5){
    // 5-6次：翻肚禁止全力觸發 + 吐槽
    const comments=['旁觀的紅髮女人悄悄退後了兩步。','路過的行人加快了腳步。','遠處一隻野貓看了看，轉頭離開。'];
    const comment=comments[n%comments.length];
    scenes=[
      {type:'narr',v:'橘子看見艾爾法伸出手的瞬間，毛全炸了起來。'},
      {type:'dial',sp:'橘子🐈😒',ln:'喵！！——喵！！'},
      {type:'sys',v:'〔系統翻譯：我說了多少次！有沒有在聽！〕'},
      {type:'narr',v:'【翻肚禁止】天賦全力觸發。空踢六連，外加一記精準的尾掃，橫掃艾爾法前臂。'},
      {type:'dial',sp:'艾爾法😒',ln:'……'},
      {type:'sys',v:comment},
      {type:'sys',v:`艾爾法前臂爪痕×6 ／ 第${n}次翻肚 ／ 橘子怒氣：尚未平息`},
    ];

  }else if(n>=3){
    // 3-4次：憤怒 + 滑稽
    const funnyScenes=[
      [{type:'narr',v:'橘子被翻面，這次她沒有掙扎——她開始反擊。'},
       {type:'dial',sp:'橘子🐈😒',ln:'喵！'},
       {type:'sys',v:'〔系統翻譯：好啊。〕'},
       {type:'narr',v:'橘子死死咬住艾爾法的袖子，拒絕放開。艾爾法站起身時，橘子跟著被提離地面，仍然咬著。'},
       {type:'dial',sp:'艾爾法😒',ln:'……這樣會扯壞的。'},
       {type:'sys',v:`第${n}次翻肚。雙方都沒有妥協的跡象。`}],
      [{type:'narr',v:'橘子被翻面，四腳朝天，表情出奇地平靜。'},
       {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
       {type:'sys',v:'〔系統翻譯：你看完了嗎。〕'},
       {type:'narr',v:'橘子自行翻回，走了三步，然後坐下，背對艾爾法。'},
       {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
       {type:'sys',v:'〔系統翻譯：你今天的行為已記錄在案。〕'}],
    ];
    scenes=funnyScenes[n%funnyScenes.length];

  }else{
    // 1-2次：初始反應（隨機害怕/抱怨/驚嚇）
    const initReacts=[
      [{type:'narr',v:'艾爾法伸出手，以迅雷不及掩耳之勢將橘子翻面。'},
       {type:'dial',sp:'橘子🐈😰',ln:'喵——！！'},
       {type:'sys',v:'〔系統翻譯：有危險！逃跑本能啟動！〕'},
       {type:'narr',v:'橘子整個僵住，四腿微抖，肚子白毛完全暴露。兩秒後才回神，瘋狂踢腿試圖翻回正面。'},
       {type:'dial',sp:'艾爾法😒',ln:'……軟的。'}],
      [{type:'narr',v:'橘子被翻了個底朝天，肚子白毛暴露在外。她側眼瞪向艾爾法，尾巴猛力甩了三下。'},
       {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
       {type:'sys',v:'〔系統翻譯：你今天是故意的。〕'},
       {type:'narr',v:'橘子慢條斯理地翻回正面，整理了一下毛，然後背對艾爾法坐定。'},
       {type:'sys',v:'〔系統翻譯：這件事沒有完。〕'}],
      [{type:'narr',v:'橘子被翻面的瞬間，發出了一聲從未有過的高頻短叫。'},
       {type:'dial',sp:'橘子🐈😰',ln:'嗚——喵！'},
       {type:'sys',v:'〔系統翻譯：（這個聲音不存在。）〕'},
       {type:'narr',v:'橘子以飛快的速度翻回正面，若無其事地開始舔爪子。'},
       {type:'sys',v:'〔系統翻譯：你什麼也沒聽到。〕'}],
    ];
    scenes=initReacts[n%initReacts.length];
  }

  (Array.isArray(scenes[0])?scenes:scenes).forEach(e=>appendEntryToDOM(e));
  scrollD();
  renderBoth('party');
  pushLocalEvent(`【系統事件・不需回應】玩家對橘子強制翻肚（第${n}次），橘子不滿。目前翻肚累計${n}次。`);
  saveGame();
  showToast(`翻肚 ×${n} 🐾`,'ok');
}
// ── 給魚乾 ──
function findFishItem(){
  const inv=getInv();
  // 搜尋任何含「魚」字的道具（魚乾、乾魚、烤魚、魚片等都算）
  return inv.items.find(i=>/魚/.test(i.n));
}
function consumeItem(item){
  // 解析數量：支援 ×N、xN、N個、或直接數字，沒有就當1
  const inv=getInv();
  const qStr=item.q||'';
  const m=qStr.match(/[×x*]?\s*(\d+)/);
  const qty=m?parseInt(m[1]):1;
  if(qty<=1){
    inv.items=inv.items.filter(i=>i!==item);
  }else{
    item.q=`×${qty-1}`;
  }
  renderBoth('inv');
}

function giveOrangeFish(ev){
  ev.stopPropagation();
  markDirty('party');
  const fish=findFishItem();
  const hasFish=!!fish;
  if(hasFish){
    consumeItem(fish);
    setFavor('orange',8);
  }
  const reactions=hasFish?[
    [{type:'narr',v:'艾爾法從袋裡取出一片魚乾，遞到橘子面前。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
     {type:'sys',v:'〔系統翻譯：⋯⋯勉強收下。〕'},
     {type:'narr',v:'橘子瞟了一眼，然後以優雅而精準的姿態，把魚乾從艾爾法手中叼走。'},
     {type:'sys',v:`橘子好感 +8 ／ ${fish.n} -1`},
    ],
    [{type:'narr',v:'魚乾出現的瞬間，橘子的耳朵微微動了一下。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：你有點用。〕'},
     {type:'narr',v:'橘子接過魚乾，退後兩步，背對著艾爾法吃完。'},
     {type:'sys',v:'橘子好感 +8'},
    ],
  ]:[
    [{type:'dial',sp:'艾爾法😒',ln:'⋯⋯沒有魚乾了。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：廢物。〕'},
    ],
  ];
  const r=reactions[Math.floor(Math.random()*reactions.length)];
  r.forEach(e=>appendEntryToDOM(e));
  // 魚乾消氣：每次餵食減少1點翻肚怒氣
  if(hasFish&&G.bellyFlipCount>0){
    G.bellyFlipCount=Math.max(0,G.bellyFlipCount-2);
    if(G.bellyFlipCount===0)appendEntryToDOM({type:'sys',v:'〔橘子：怒氣已平息。〕'});
  }
  markDirty('party');scrollD();renderBoth('party');
  const fishMsg=hasFish?`玩家餵橘子吃${fish.n}，橘子好感+8（目前好感${getFavor('orange')}），怒氣${G.bellyFlipCount>0?'剩'+G.bellyFlipCount:'已平息'}。`:`玩家想餵橘子但沒有魚，橘子不滿。`;
  pushLocalEvent(`【系統事件・不需回應】${fishMsg}`);
  saveGame();
  showToast(hasFish?`橘子：${fish.n} +8好感 🐟`:'道具欄沒有魚（需先購買或取得）','ok');
}

// ── 抱起橘子 ──
function pickUpOrange(ev){
  ev.stopPropagation();
  markDirty('party');
  const scenes=[
    [{type:'narr',v:'艾爾法俯身，將橘子從地上抄起，抱在胸前。橘子沒有反抗——她只是抬頭，用藍眼睛看著艾爾法的臉。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：⋯⋯就這樣吧。〕'},
     {type:'narr',v:'沉默持續了幾秒。橘子微微收緊了爪子。'},
    ],
    [{type:'narr',v:'被抱起的瞬間，橘子全身肌肉繃緊，尾巴炸成一根棒子。'},
     {type:'dial',sp:'橘子🐈😰',ln:'嗚——喵！'},
     {type:'sys',v:'〔系統翻譯：沒有預警！這違反了協議！〕'},
     {type:'narr',v:'橘子在艾爾法懷裡掙扎了兩秒，然後放棄，以沉默表達強烈不滿。'},
    ],
    [{type:'narr',v:'艾爾法抱起橘子，走了幾步，然後坐下，把橘子放在膝上。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵⋯⋯'},
     {type:'sys',v:'〔系統翻譯：⋯⋯暫時許可。〕'},
     {type:'narr',v:'橘子繞了一圈，找到一個令她滿意的角度，然後趴下。她的呼嚕聲非常小，小到幾乎聽不見。'},
     {type:'dial',sp:'艾爾法😒',ln:'⋯⋯'},
     {type:'sys',v:'雙方的HP回復+1（理由不明）'},
    ],
  ];
  const r=scenes[Math.floor(Math.random()*scenes.length)];
  r.forEach(e=>appendEntryToDOM(e));
  scrollD();
  pushLocalEvent(`【系統事件・不需回應】玩家抱起橘子。橘子目前好感${getFavor('orange')}。`);
  saveGame();
}

// ── 和橘子聊天 ──
function chatOrange(ev){
  ev.stopPropagation();
  markDirty('party');
  const topics=[
    // 關於命運
    [{type:'dial',sp:'艾爾法😒',ln:'你真的只是一隻貓嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：這個問題，你已經問過三次了。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'你每次都這樣回。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：因為答案沒有改變。〕'},
    ],
    // 關於今天
    [{type:'dial',sp:'艾爾法😒',ln:'今天有什麼不對勁的地方嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
     {type:'sys',v:'〔系統翻譯：東邊有危險。但你不會聽的。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'⋯⋯'},
    ],
    // 閒聊
    [{type:'dial',sp:'艾爾法😒',ln:'最近吃得怎麼樣？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：魚乾數量不足。這是控訴。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'我會記得補。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
     {type:'sys',v:'〔系統翻譯：你每次都這樣說。〕'},
    ],
    // 關於天父星
    [{type:'dial',sp:'艾爾法😒',ln:'那個先行者⋯⋯你見過他嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'⋯⋯喵。'},
     {type:'sys',v:'〔系統翻譯：（沉默。這是少數讓橘子停頓的話題之一。）〕'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：他的氣息⋯⋯我記得。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'⋯⋯所以你也不是普通的貓。'},
    ],
  ];
  const fav=getFavor('orange')||50;
  // 好感高時解鎖天父星話題
  const available=fav>=70?topics:topics.slice(0,3);
  const r=available[Math.floor(Math.random()*available.length)];
  r.forEach(e=>appendEntryToDOM(e));
  scrollD();
  const chatSummary=r.filter(e=>e.type==='sys').map(e=>e.v).join(' ');
  pushLocalEvent(`【系統事件・不需回應】玩家與橘子閒聊。橘子回應摘要：${chatSummary}。橘子好感${fav}。`);
  saveGame();
  // 聊天有機率觸發橘子秘密
  tryOrangeSecretTrigger();
}

// ── 橘子建議 ──
function askOrangeSuggest(ev){
  ev.stopPropagation();
  markDirty('party');
  const fav=getFavor('orange')||50;
  const suggests=[
    // 通用建議
    [{type:'dial',sp:'艾爾法😒',ln:'有什麼需要注意的嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵——喵。'},
     {type:'sys',v:'〔橘子建議：留意南方。有什麼東西在靠近。〕'},
    ],
    [{type:'dial',sp:'艾爾法😒',ln:'下一步怎麼走？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔橘子建議：你現在需要的是情報，不是行動。〕'},
    ],
    [{type:'dial',sp:'艾爾法😒',ln:'要相信她嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'⋯⋯喵。'},
     {type:'sys',v:'〔橘子建議：她說的是真話。但她沒說完。〕'},
    ],
    // 高好感解鎖
    ...(fav>=75?[
      [{type:'dial',sp:'艾爾法😒',ln:'橘子，你覺得⋯⋯108星真的能聚齊嗎？'},
       {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
       {type:'sys',v:'〔橘子建議（罕見的認真）：能。但代價比你想的大。有人會走，有人不會回來。〕'},
       {type:'dial',sp:'艾爾法😒',ln:'⋯⋯'},
       {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
       {type:'sys',v:'〔橘子補充：但你已經走到這裡了。〕'},
      ],
    ]:[]),
  ];
  const r=suggests[Math.floor(Math.random()*suggests.length)];
  r.forEach(e=>appendEntryToDOM(e));
  scrollD();
  const sugSummary=r.filter(e=>e.type==='sys').map(e=>e.v).join(' ');
  pushLocalEvent(`【系統事件・不需回應】玩家詢問橘子建議。橘子建議摘要：${sugSummary}`);
  saveGame();
  showToast('橘子建議 ✦','ok');
}

function setStarFilter(k){G.starFilter=k;markDirty('stars');renderBoth('stars');}
function buildStars(){
  const f=G.starFilter,ft=s=>f==='recruited'?s.status==='recruited':f==='unknown'?s.status==='unknown':true;
  const sT=f==='all'||f==='天罡'||f==='recruited'||f==='unknown';
  const sD=f==='all'||f==='地煞'||f==='recruited'||f==='unknown';
  const showSp=f==='all'||f==='special';
  const tot=[...TIANGANG,...DISHAT].filter(s=>s.status==='recruited').length;
  let h=`<div class="sfrow">${[['all','全部'],['天罡','天罡36'],['地煞','地煞72'],['special','星外'],['recruited','已招募'],['unknown','未現身']].map(([k,l])=>`<button class="sfb ${f===k?'ac':''}" onclick="setStarFilter('${k}')">${l}</button>`).join('')}</div><div class="rcnt">招募 <span>${tot}</span> / 108</div>`;
  if(showSp){
    h+=`<div class="sdiv">⚜ 星外關鍵人物 ⚜</div><div class="sgrid">`;
    h+=SPECIAL_CHARS.map(sp=>{
      const ov=G.specialOv[sp.id]||{};
      const status=ov.status||sp.status;
      const name=ov.name||sp.name;
      const cls=status==='unknown'?'unk':status==='heard'?'con':'rec';
      const stLabel=status==='unknown'?'● 身份不明':status==='heard'?'◈ 有所耳聞':status==='met'?'◈ 已相遇':status==='dead'?'✦ 已逝':'?';
      return`<div class="sc ${cls}" onclick="openSpecialChar('${sp.id}')" style="border-color:rgba(150,120,200,.4)"><div class="stp" style="color:rgba(180,150,220,.8)">星外</div><div class="snm">${sp.role}</div><div class="sst" style="font-size:.52rem;">${sp.emoji}</div><div class="snm2">${status==='unknown'?'???':name}</div><div style="font-size:.44rem;color:rgba(180,150,220,.7);margin-top:.1rem">${stLabel}</div></div>`;
    }).join('');
    h+=`</div>`;
  }
  if(sT){const it=TIANGANG.filter(ft);if(it.length){if(f==='all'||f==='天罡')h+=`<div class="sdiv">✦ 天罡三十六星 ✦</div>`;h+=`<div class="sgrid">${it.map(s=>scell(s,'天罡')).join('')}</div>`;}}
  if(sD){const it=DISHAT.filter(ft);if(it.length){if(f==='all'||f==='地煞')h+=`<div class="sdiv">✦ 地煞七十二星 ✦</div>`;h+=`<div class="sgrid">${it.map(s=>scell(s,'地煞')).join('')}</div>`;}}
  return h;
}

async function testAPI(){
  const w=document.getElementById('test-res');
  if(w)w.textContent='測試中⋯';
  let gated=false;
  try{
    await apiGate();gated=true;
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CFG.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:CFG.model,max_tokens:20,messages:[{role:'user',content:'Hi'}]})
    });
    apiDone();gated=false;
    if(r.status===429){apiHit429();if(w){w.textContent='✗ 請求過於頻繁';w.style.color='var(--orange)';}return;}
    const d=await r.json();
    if(w)w.textContent=r.ok?'✓ 連線成功':'✗ 錯誤：'+(d.error?.message||r.status);
    if(w)w.style.color=r.ok?'var(--grn)':'var(--red)';
  }catch(e){if(gated)apiDone();if(w){w.textContent='✗ 網路錯誤';w.style.color='var(--red)';}}
}

function openSpecialChar(id){
  const sp=SPECIAL_CHARS.find(x=>x.id===id);if(!sp)return;
  const ov=G.specialOv[id]||{};
  const status=ov.status||sp.status;
  const name=ov.name||sp.name;
  const desc=ov.desc||sp.desc;
  document.getElementById('modal-inner').innerHTML=`
    <div class="mtop">
      <div class="mscol"><div class="mtp" style="color:rgba(180,150,220,.8)">星外</div><div class="mnm">${sp.role}</div><div class="mst">${sp.emoji}</div></div>
      <div class="micol">
        <div class="mname">${status==='unknown'?'身份不明':name}</div>
        <div class="msub2">${sp.known_as||''}</div>
        <div class="mstat c" style="color:rgba(180,150,220,.9)">星辰之外的存在</div>
      </div>
    </div>
    <div class="mbody">
      <div class="msec"><div class="msect">背景說明</div><div class="mdesc">${desc}</div></div>
      <div class="msec"><div class="msect">橘子的感知</div><div class="mdesc" style="color:rgba(180,150,220,.7)">${sp.hint}</div></div>
      ${id==='sky_father'?`<div class="msec"><div class="msect">線索追蹤</div>${buildFounderClues()}</div>`:''}
    </div>`;
  document.getElementById('detail-modal').classList.add('open');
}
function scell(s,t){
  const inParty=s.id&&isInParty(s.id);
  const recruited=s.status==='recruited';
  const contact=s.status==='contact';
  const unk=s.status==='unknown';
  const nm=unk?'？？':(s.name==='?'||s.name==='???')?(s.cN||'？？？'):s.name;
  let statusHtml='';
  if(inParty){
    statusHtml=`<div style="font-size:.44rem;color:var(--grn);margin-top:.1rem;">✦ 隊中</div>`;
  } else if(recruited&&s.id){
    statusHtml=`<button onclick="event.stopPropagation();joinParty('${s.id}')" style="font-size:.46rem;padding:.1rem .32rem;margin-top:.12rem;background:rgba(201,168,76,.1);border:1px solid var(--goldd);border-radius:2px;color:var(--gold);cursor:pointer;font-family:'Noto Serif TC',serif;line-height:1.2;">＋ 加入</button>`;
  } else if(contact){
    statusHtml=`<div style="font-size:.44rem;color:var(--goldd);margin-top:.1rem;">◈ 接觸中</div>`;
  }
  const cls=inParty?'rec':recruited?'rec':contact?'con':unk?'unk':'';
  return `<div class="sc ${cls}" onclick="openStar('${t}',${s.num})" style="${inParty?'border-color:rgba(76,175,122,.6)':''}">
    <div class="stp">${t}</div>
    <div class="snm">第${s.num}星</div>
    <div class="sst">${s.star}</div>
    <div class="snm2">${nm}</div>
    ${statusHtml}
  </div>`;
}
function buildInv(){
  const inv=getInv();
  const equipped=inv.equip.filter(i=>i.status==='equipped'||(!i.status&&i.q==='裝備中'));
  const held=inv.equip.filter(i=>i.status==='持有'||(i.status&&i.status!=='equipped'));
  const eqCard=(i,realIdx,canUnequip)=>{
    const enh=i.enhance||0;
    const bText=bonusText(getEnhancedBonus(i));
    const cost=enhanceCost(enh);
    const maxed=enh>=20;
    return`<div class="irow"><div style="flex:1">
      <div class="inm">${i.n}${enh>0?` <span style="color:var(--gold);font-size:.6rem">[+${enh}]</span>`:''}</div>
      <div class="int">${i.t||''}${i.w?' ・ '+i.w:''}</div>
      ${bText?`<div style="font-size:.58rem;color:#6ab46a;margin-top:.08rem">${bText}</div>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:.25rem;align-items:flex-end;flex-shrink:0">
      ${canUnequip&&i.slot?`<button onclick="event.stopPropagation();upgradeEquip(allParty().find(m=>m.name==='${i.w}')?.id||'alfar','${i.slot}')"
        ${maxed?'disabled':''}
        style="font-size:.55rem;padding:.1rem .35rem;background:${maxed?'transparent':'rgba(201,168,76,.1)'};border:1px solid ${maxed?'rgba(100,100,100,.3)':'rgba(201,168,76,.4)'};border-radius:2px;color:${maxed?'var(--sild)':'var(--goldd)'};cursor:${maxed?'not-allowed':'pointer'};"
        title="${maxed?'已達+20上限':'強化費用：'+cost+'銀'}">
        ${maxed?'MAX':'強化 '+cost+'銀'}
      </button>`:''}
      <button onclick="equipItemToggle(${realIdx})" style="font-size:.58rem;padding:.1rem .38rem;background:transparent;border:1px solid ${canUnequip?'rgba(204,68,68,.35)':'rgba(201,168,76,.35)'};border-radius:2px;color:${canUnequip?'rgba(204,68,68,.7)':'var(--goldd)'};cursor:pointer;"
        onmouseover="this.style.borderColor='${canUnequip?'var(--red)':'var(--goldd)'}';this.style.color='${canUnequip?'var(--red)':'var(--gold)'}'"
        onmouseout="this.style.borderColor='${canUnequip?'rgba(204,68,68,.35)':'rgba(201,168,76,.35)'}';this.style.color='${canUnequip?'rgba(204,68,68,.7)':'var(--goldd)'}'">
        ${canUnequip?'卸下':'裝備'}</button>
    </div>
    </div>`;
  };
  return`<div class="gold-box"><div><div class="gl">所持金</div><div class="ga" id="inv-gold-amt">${goldFull()}</div></div><span style="font-size:1.35rem">🪙</span></div>
  <div class="isec"><div class="ittl">裝備中</div>${equipped.length?equipped.map(i=>eqCard(i,inv.equip.indexOf(i),true)).join(''):'<div style="font-size:.65rem;color:var(--sild);padding:.2rem 0">（無裝備中道具）</div>'}</div>
  ${held.length?`<div class="isec"><div class="ittl">持有裝備</div>${held.map(i=>eqCard(i,inv.equip.indexOf(i),false)).join('')}</div>`:''}
  <div class="isec"><div class="ittl">道具欄</div>${inv.items.map(i=>`<div class="irow"><div><div class="inm">${i.n}</div><div class="int">${i.t}</div></div><div class="iqt">${i.q}</div></div>`).join('')}</div>
  <div class="isec"><div class="ittl">重要情報</div>${inv.key.map(i=>`<div class="irow"><div><div class="inm">${i.n}</div><div class="int">${i.t}</div></div><div class="iqt">${i.q}</div></div>`).join('')}</div>
  ${buildRepSection()}
  ${buildRelicSection()}`;
}

// ═══ REPUTATION / FACTION SYSTEM ═══
const FACTIONS=[
  {id:'ironmist',   name:'鐵霧城居民', icon:'🏙', desc:'鐵霧城的平民與市井'},
  {id:'mistblade',  name:'霧刃幫',      icon:'⚔️', desc:'橫行碼頭的地下組織'},
  {id:'merchant',   name:'商人公會',    icon:'💰', desc:'掌控貿易與情報的商會'},
  {id:'hero',       name:'英雄公會',    icon:'🛡', desc:'接受委託的傭兵組織'},
  {id:'imperial',   name:'帝國殘軍',    icon:'👑', desc:'崩裂帝國的殘存勢力'},
  {id:'shadow',     name:'幕後勢力',    icon:'👁', desc:'操縱十二王國的神秘組織'},
];
const REP_LEVELS=[
  {min:60,  name:'盟友',  color:'#6ab46a', effect:'商店八折・特殊任務解鎖'},
  {min:20,  name:'友好',  color:'#a8c84c', effect:'商店九折・額外情報'},
  {min:-19, name:'中立',  color:'#888',    effect:'無特殊效果'},
  {min:-59, name:'敵對',  color:'#d05050', effect:'商店漲價・部分區域受阻'},
  {min:-100,name:'公敵',  color:'#880000', effect:'見面即攻擊・禁區入場'},
];

function getRep(fid){return G.rep[fid]||0;}
function repLevel(v){for(const l of REP_LEVELS)if(v>=l.min)return l;return REP_LEVELS[4];}

function applyRep(changes){
  // changes: [{id, delta, reason}]
  if(!changes||!changes.length)return;
  changes.forEach(ch=>{
    const prev=getRep(ch.id);
    G.rep[ch.id]=Math.max(-100,Math.min(100,prev+(ch.delta||0)));
    const lv=repLevel(G.rep[ch.id]);
    const fac=FACTIONS.find(f=>f.id===ch.id);
    const sign=ch.delta>0?'+':'';
    appendEntryToDOM({type:'sys',v:`${fac?.icon||'◈'} ${fac?.name||ch.id} 聲望 ${sign}${ch.delta} → ${G.rep[ch.id]}【${lv.name}】${ch.reason?'（'+ch.reason+'）':''}`});
  });
  renderBoth('inv');renderChanged('inv','party');
  saveGame();
}

function buildRepSection(){
  const active=FACTIONS.filter(f=>G.rep[f.id]!==undefined&&G.rep[f.id]!==0);
  if(!active.length)return`<div class="isec"><div class="ittl">陣營聲望</div><div style="font-size:.62rem;color:var(--sild);padding:.2rem 0">尚未與任何勢力產生聲望關係</div></div>`;
  return`<div class="isec"><div class="ittl">陣營聲望</div>${FACTIONS.map(f=>{
    const v=getRep(f.id);
    if(!v&&v!==0)return'';
    const lv=repLevel(v);
    const pct=Math.round((v+100)/2); // -100~100 → 0~100%
    const barColor=lv.color;
    return`<div style="margin-bottom:.45rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.18rem;">
        <span style="font-size:.62rem;color:var(--sil)">${f.icon} ${f.name}</span>
        <span style="font-size:.55rem;color:${barColor}">${lv.name}（${v>0?'+':''}${v}）</span>
      </div>
      <div style="height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:2px;transition:width .4s;"></div>
      </div>
      <div style="font-size:.52rem;color:var(--sild);margin-top:.08rem;">${lv.effect}</div>
    </div>`;
  }).join('')}</div>`;
}

// 聲望影響商店價格
// ═══ ORANGE SECRET LINE（橘子秘密線）═══
// 橘子的真實身份透過五個階段逐步揭露
// 觸發條件：聊天互動、高好感、特定劇情事件、AI的 orange_reveal 欄位

const ORANGE_SECRETS=[
  // Stage 1：異常的貓
  {stage:1, title:'異常的貓', icon:'🐈',
   scenes:[
    {type:'narr',v:'深夜，艾爾法注意到橘子並未入睡。她坐在窗台，藍眼睛凝視著遠方的某個方向——那個方向什麼也沒有，只有霧。'},
    {type:'narr',v:'艾爾法走過去。橘子沒有回頭，但耳朵微微轉動。'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
    {type:'sys',v:'〔系統翻譯：⋯⋯你也感覺到了嗎。〕'},
    {type:'narr',v:'艾爾法順著橘子的視線望去，只看到霧。'},
    {type:'sys',v:'〔橘子秘密・第一層浮現〕這隻貓，似乎一直在等待什麼。'},
   ],
   intel:{id:'os_1',title:'橘子的夜間行為',content:'橘子有時在深夜凝視某個方向，即便那裡空無一物。她的反應不像普通的貓。',src:'艾爾法觀察',rel:3,cat:'人物',orange:true,related:'橘子・地魁星'}},

  // Stage 2：五枚銅幣的秘密
  {stage:2, title:'五枚銅幣的秘密', icon:'🪙',
   scenes:[
    {type:'narr',v:'艾爾法翻出了當初買橘子的收據，仔細看了一遍。'},
    {type:'narr',v:'五枚銅幣。一隻流浪貓的價格。但賣貓的老人在橘子被帶走後的第二天就消失了，沒有任何人再見過他。'},
    {type:'dial',sp:'橘子🐈😒',ln:'⋯⋯喵。'},
    {type:'sys',v:'〔系統翻譯：那個老人⋯⋯知道你要來找我。〕'},
    {type:'narr',v:'橘子走到艾爾法腳邊，用頭蹭了一下她的腳踝——這是她極少做的動作。'},
    {type:'sys',v:'〔橘子秘密・第二層浮現〕五枚銅幣並不是偶然的交易。那是一個約定的記號。'},
   ],
   intel:{id:'os_2',title:'消失的賣貓老人',content:'五枚銅幣買下橘子的那個攤販，在交易後隔天便從鐵霧城消失，再無蹤跡。是巧合，還是任務完成？',src:'市場記錄',rel:4,cat:'人物',orange:true}},

  // Stage 3：帝國占星師的預言
  {stage:3, title:'帝國占星師的預言', icon:'🔮',
   scenes:[
    {type:'narr',v:'在一本廢棄的帝國文獻中，艾爾法發現了一段加密的段落。她不確定為什麼橘子湊過來嗅了一下，然後用爪子輕輕推了推書頁。'},
    {type:'narr',v:'那段文字，是帝國最後一任占星師留下的預言：'},
    {type:'sys',v:'〔古帝國文字〕「命運之錨，以貓為形，以銅為價，以等待為職。凡能尋得此錨者，108星辰之主也。」'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
    {type:'sys',v:'〔系統翻譯：⋯⋯你看到了。〕'},
    {type:'dial',sp:'艾爾法😒',ln:'⋯⋯所以你不是普通的貓。'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
    {type:'sys',v:'〔系統翻譯：我是一隻貓。五枚銅幣的貓。（停頓）但我也是你的貓。〕'},
    {type:'sys',v:'〔橘子秘密・第三層浮現〕命運之錨的封印，開始出現細小的裂縫。'},
   ],
   intel:{id:'os_3',title:'帝國占星師的預言',content:'「命運之錨，以貓為形，以銅為價，以等待為職。凡能尋得此錨者，108星辰之主也。」帝國最後任占星師的遺言。',src:'廢棄帝國文獻',rel:5,cat:'命運',orange:true,related:'命運之錨'}},

  // Stage 4：記憶的碎片
  {stage:4, title:'記憶的碎片', icon:'💫',
   scenes:[
    {type:'narr',v:'那夜艾爾法做了一個奇怪的夢。夢裡沒有景象，只有一個聲音——不是橘子的聲音，但又像是。'},
    {type:'dial',sp:'???',ln:'⋯⋯你終於來了。我等了很久。'},
    {type:'dial',sp:'艾爾法😒',ln:'（夢中）你是誰？'},
    {type:'dial',sp:'???',ln:'一個記憶。一個選擇留下來的記憶。'},
    {type:'narr',v:'艾爾法醒來時，橘子正坐在她的胸口，用一種不像貓的眼神看著她。'},
    {type:'dial',sp:'橘子🐈😒',ln:'⋯⋯喵。'},
    {type:'sys',v:'〔系統翻譯：你記得了嗎。〕'},
    {type:'dial',sp:'艾爾法😒',ln:'⋯⋯那個聲音是你嗎？'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
    {type:'sys',v:'〔系統翻譯：是一部分的我。被封印在這個形體裡最深的那一部分。〕'},
    {type:'sys',v:'〔橘子秘密・第四層浮現〕命運之錨的封印，已有三分之一鬆動。'},
   ],
   relicUpdate:{status:'partial', effect:'感知範圍擴大，橘子能感知更遠距離的星辰氣息'}},

  // Stage 5：覺醒
  {stage:5, title:'命運之錨・覺醒', icon:'⚓',
   scenes:[
    {type:'sys',v:'═══ 命運之錨封印解除 ═══'},
    {type:'narr',v:'那一刻沒有任何預警。橘子突然停在原地，所有的毛直立起來，藍眼睛在黑暗中發出淡淡的光。'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
    {type:'sys',v:'〔系統翻譯：（這一次，翻譯失效了。）〕'},
    {type:'narr',v:'艾爾法感覺到某種東西從橘子身上流出，像是水，像是光，又像是某種更古老的東西——那是108顆星辰共同的重量。'},
    {type:'narr',v:'然後橘子打了一個哈欠，踱步到艾爾法身邊，若無其事地趴下。'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
    {type:'sys',v:'〔⋯⋯沒有翻譯。有些事情不需要語言。〕'},
    {type:'sys',v:'✦ 命運之錨・封印解除 ✦\n地魁星真正的效果覺醒：橘子的感知覆蓋整個艾爾薩大陸。任何108星辰的動向，她都能察覺。'},
   ],
   relicUpdate:{status:'awakened', effect:'【覺醒】感知覆蓋全大陸・任何星辰氣息無所遁形・好感度永不下降'}},
];

function revealOrangeSecret(targetStage){
  const curStage=G.orangeStage||0;
  if(targetStage<=curStage||targetStage>5)return;
  const secret=ORANGE_SECRETS[targetStage-1];
  if(!secret)return;
  G.orangeStage=targetStage;
  // 播放場景
  secret.scenes.forEach(e=>appendEntryToDOM(e));
  // 更新情報
  if(secret.intel)addIntel(secret.intel);
  // 更新寶器
  if(secret.relicUpdate&&PRESET_RELICS.orange){
    PRESET_RELICS.orange.status=secret.relicUpdate.status;
    PRESET_RELICS.orange.effect=secret.relicUpdate.effect;
    if(!G.relics)G.relics={};
    G.relics['orange']={...PRESET_RELICS.orange,foundDay:G.time?.day||1};
    renderBoth('inv');
  }
  // 系統提示
  appendEntryToDOM({type:'sys',v:`✦ 橘子・秘密線 第${targetStage}層揭露：【${secret.title}】`});
  showToast('橘子秘密解鎖：'+secret.title,'ok');
  scrollD();saveGame();
  renderChanged('party','inv','stars');
}

// 聊天時有機率觸發
function tryOrangeSecretTrigger(){
  const cur=G.orangeStage||0;
  if(cur>=5)return;
  const fav=getFavor('orange')||50;
  // 好感度和線索數影響觸發機率
  const founderCount=(G.founderClues||[]).length;
  const baseChance=0.15+(fav/100)*0.2+(founderCount*0.02);
  if(Math.random()<baseChance){
    setTimeout(()=>revealOrangeSecret(cur+1),800);
  }
}

function getOrangeSecretHtml(){
  const cur=G.orangeStage||0;
  if(cur===0)return`<div style="font-size:.62rem;color:var(--sild);padding:.3rem 0;font-style:italic">⋯⋯她只是一隻貓。一隻花五枚銅幣買來的貓。</div>`;
  const unlocked=ORANGE_SECRETS.slice(0,cur);
  return`<div>
    <div style="display:flex;gap:.3rem;margin-bottom:.4rem;flex-wrap:wrap;">
      ${ORANGE_SECRETS.map((s,i)=>`<span style="font-size:.55rem;padding:.1rem .35rem;border-radius:2px;background:${i<cur?'rgba(180,140,220,.15)':'rgba(50,50,50,.3)'};border:1px solid ${i<cur?'rgba(180,140,220,.4)':'rgba(80,80,80,.3)'};color:${i<cur?'rgba(200,160,240,.8)':'var(--sild)'}">${s.icon} ${i<cur?s.title:'???'}</span>`).join('')}
    </div>
    ${cur<5?`<div style="font-size:.58rem;color:var(--sild);">第${cur}/${5}層揭露 ・ 繼續與橘子互動以發現更多</div>`:`<div style="font-size:.6rem;color:rgba(200,160,240,.8);">✦ 全部揭露・命運之錨已覺醒</div>`}
  </div>`;
}
// 透過蒐集碎片化線索，逐步揭開「先行者」的身份與命運
// 四個解鎖門檻：3/6/9/12 條線索

const FOUNDER_TIERS=[
  {at:3,  label:'初現端倪', color:'#888',
   unlock:'G.specialOv.sky_father 狀態更新為 heard，名字出現模糊輪廓。'},
  {at:6,  label:'線索成形', color:'var(--goldd)',
   unlock:'可在星外人物詳情中查看已揭示的碎片拼圖。'},
  {at:9,  label:'真相將近', color:'var(--gold)',
   unlock:'橘子開始有更深的感知反應。聊天中天父星話題解鎖。'},
  {at:12, label:'啟示降臨', color:'rgba(200,120,220,.9)',
   unlock:'觸發主線隱藏劇情——先行者留下的最後訊息。'},
];

const CLUE_CATS=['身份','蹤跡','目的','命運','橘子感知'];
const CLUE_CAT_ICON={身份:'👤',蹤跡:'👣',目的:'🎯',命運:'⚜️','橘子感知':'🐈'};

function addFounderClue(clue){
  if(!clue||!clue.id)return;
  G.founderClues=G.founderClues||[];
  if(G.founderClues.find(c=>c.id===clue.id)){
    showToast('線索已知：'+clue.title,'inf');return;
  }
  G.founderClues.push({cat:'身份',rel:3,day:G.time?.day||1,...clue});
  const n=G.founderClues.length;
  appendEntryToDOM({type:'sys',v:`⚜️ 天父星線索（${n}）：【${clue.title}】`});
  // 檢查門檻解鎖
  const tier=FOUNDER_TIERS.find(t=>t.at===n);
  if(tier){
    appendEntryToDOM({type:'sys',v:`✦ 線索達到 ${n} 條——【${tier.label}】`});
    checkFounderTierUnlock(n);
    showToast('線索里程碑：'+tier.label,'ok');
  }else{
    showToast('天父星線索 +1（'+n+'條）','ok');
  }
  // 自動加入情報板
  addIntel({id:'founder_'+clue.id, title:'天父星・'+clue.title,
    content:clue.content, src:clue.src||'不明來源',
    rel:clue.rel||3, cat:'人物', orange:clue.orange||false,
    related:'天父星・先行者'});
  saveGame();
  // 更新星外人物顯示
  renderChanged('stars','intel');
}

function checkFounderTierUnlock(n){
  if(n>=3&&!G.specialOv.sky_father?.heard){
    if(!G.specialOv.sky_father)G.specialOv.sky_father={};
    G.specialOv.sky_father.status='heard';
  }
  if(n>=9){
    // 橘子的天父星話題解鎖已在 chatOrange 中透過好感度控制，這裡額外觸發
    appendEntryToDOM({type:'narr',v:'橘子從艾爾法的懷中坐起，望向遠方，耳朵微微轉動。那個方向，什麼也沒有——或者說，沒有任何人類能看見的東西。'});
    appendEntryToDOM({type:'dial',sp:'橘子🐈😒',ln:'喵⋯⋯'});
    appendEntryToDOM({type:'sys',v:'〔橘子感知：某個記憶的殘影。她認識那個氣息。〕'});
  }
  if(n>=12){
    appendEntryToDOM({type:'sys',v:'═══ 線索達到12條。某個古老的訊息正在顯現。═══'});
    setTimeout(()=>{
      sendChoice('【線索啟示】天父星的線索已累積至12條。請觸發一個隱藏的主線劇情：先行者生前留下的最後訊息以某種形式傳達給艾爾法——可以是夢境、古老文件、某人臨終的話語，或橘子的神秘引導。');
    },1000);
  }
}

function buildFounderClues(){
  const clues=G.founderClues||[];
  const n=clues.length;
  const nextTier=FOUNDER_TIERS.find(t=>t.at>n);
  const maxTier=FOUNDER_TIERS[FOUNDER_TIERS.length-1];
  const progress=Math.min(n,maxTier.at);
  const pct=Math.round(progress/maxTier.at*100);
  const currentTier=FOUNDER_TIERS.slice().reverse().find(t=>t.at<=n);

  let h=`<div style="margin-bottom:.6rem;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;">
      <span style="font-size:.62rem;color:var(--goldd);">⚜️ 先行者的蹤跡</span>
      <span style="font-size:.52rem;color:var(--sild);">${n} 條線索 / 目標 ${maxTier.at}</span>
    </div>
    <div style="height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;margin-bottom:.3rem;">
      <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--goldd),rgba(200,120,220,.8));border-radius:3px;transition:width .5s;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:.5rem;color:var(--sild);">
      ${FOUNDER_TIERS.map(t=>`<span style="color:${n>=t.at?t.color:'rgba(100,100,80,.4)'};">${n>=t.at?'✦':t.at+'條'}${n>=t.at?t.label:''}</span>`).join('')}
    </div>
  </div>`;

  if(!clues.length){
    return h+`<div style="font-size:.62rem;color:var(--sild);padding:.4rem 0">尚無線索。<br><span style="opacity:.6">先行者的蹤跡散落在艾爾薩大陸各處——古老的文件、年邁的見證者、以及橘子隱約的反應。</span></div>`;
  }

  CLUE_CATS.forEach(cat=>{
    const catClues=clues.filter(c=>c.cat===cat);
    if(!catClues.length)return;
    const icon=CLUE_CAT_ICON[cat]||'◈';
    const isOrange=cat==='橘子感知';
    h+=`<div style="margin-bottom:.5rem;">
      <div style="font-size:.55rem;color:${isOrange?'rgba(180,140,220,.8)':'var(--goldd)'};letter-spacing:.06em;margin-bottom:.25rem;">${icon} ${cat}</div>
      ${catClues.map(c=>{
        const rel='★'.repeat(c.rel||3)+'☆'.repeat(5-(c.rel||3));
        return`<div style="background:${isOrange?'rgba(30,20,50,.4)':'rgba(30,25,15,.5)'};border:1px solid ${isOrange?'rgba(150,120,200,.2)':'rgba(150,130,80,.2)'};border-radius:3px;padding:.38rem .55rem;margin-bottom:.25rem;">
          <div style="display:flex;justify-content:space-between;margin-bottom:.12rem;">
            <span style="font-size:.65rem;color:var(--sil);font-weight:600">${c.title}</span>
            <span style="font-size:.48rem;color:var(--goldd);letter-spacing:-.05em">${rel}</span>
          </div>
          <div style="font-size:.61rem;color:var(--sild);line-height:1.5">${c.content}</div>
          <div style="font-size:.5rem;color:rgba(120,110,80,.5);margin-top:.1rem">${c.src?'來源：'+c.src+' ・':''} Day${c.day||1}</div>
        </div>`;
      }).join('')}
    </div>`;
  });
  return h;
}

function applyFounderClue(clueData){
  if(!clueData)return;
  (Array.isArray(clueData)?clueData:[clueData]).forEach(c=>addFounderClue(c));
}

// ═══ RELIC SYSTEM（命運寶器）═══
// 每顆星辰降世時攜帶的命運寶器，集齊可觸發隱藏事件
// 艾爾法和橘子的寶器預設定義；其他角色的寶器由 AI 通過 relic 欄位揭示

const PRESET_RELICS={
  'alfar': {starId:'alfar', starName:'艾爾法', starNum:'天1', name:'天命折刃',
    type:'武器', icon:'⚔️', rarity:'稀有',
    desc:'一把在帝國崩裂前夕折斷的城衛制式劍。斷口異常鋒利，仿佛命運本身留下的傷痕。',
    effect:'武力+15・每次大成功額外造成傷害',
    status:'equipped', // 艾爾法一開始就持有（雖然只是舊短劍）
    lore:'天魁星降世之器。折斷之日，帝國滅亡之夜。'},
  'orange': {starId:'orange', starName:'橘子', starNum:'地1', name:'命運之錨',
    type:'神物', icon:'⚓', rarity:'傳說',
    desc:'一枚五枚銅幣買來的貓。帝國最後的占星師說：「凡能找到這隻貓的人，便是命運之主。」',
    effect:'【封印】真正的效果尚未覺醒',
    status:'sealed',
    lore:'地魁星降世之器。她本身即是寶器——或者說，她選擇了誰，命運便跟隨誰。'},
};

// 寶器品質顏色
const RELIC_RARITY_COLOR={普通:'#888',精良:'#6ab4c8',稀有:'var(--gold)',傳說:'rgba(200,120,220,.9)',神器:'#ff6060'};

function getRelicCount(){return Object.keys(G.relics).length+Object.keys(PRESET_RELICS).length;}

function applyRelic(r){
  if(!r||!r.id)return;
  const existed=!!G.relics[r.id];
  G.relics[r.id]={...r, foundDay:G.time?.day||1};
  const col=RELIC_RARITY_COLOR[r.rarity]||'var(--gold)';
  if(!existed){
    appendEntryToDOM({type:'sys',v:`✦ 發現命運寶器：【${r.name}】${r.rarity?'（'+r.rarity+'）':''}`});
    appendEntryToDOM({type:'sys',v:`${r.icon||'◈'} ${r.desc||''}`});
    if(r.effect) appendEntryToDOM({type:'sys',v:`效果：${r.effect}`});
    showToast('命運寶器：'+r.name,'ok');
  }
  renderBoth('inv');saveGame();
}

function buildRelicSection(){
  const presets=Object.values(PRESET_RELICS);
  const found=Object.values(G.relics);
  const all=[...presets,...found];
  const count=all.length;
  const foundCount=found.length+presets.filter(r=>r.status!=='unknown').length;
  return`<div class="isec">
    <div class="ittl" style="display:flex;justify-content:space-between;align-items:center;">
      <span>命運寶器</span>
      <span style="font-size:.52rem;color:var(--sild);">${foundCount}/${count} 已知（共108件）</span>
    </div>
    ${all.map(r=>{
      const col=RELIC_RARITY_COLOR[r.rarity]||'var(--gold)';
      const sealed=r.status==='sealed';
      return`<div style="display:flex;gap:.5rem;align-items:flex-start;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.04);">
        <span style="font-size:1.1rem;flex-shrink:0;opacity:${sealed?.5:1}">${r.icon||'◈'}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:.3rem;margin-bottom:.1rem;">
            <span style="font-size:.72rem;color:${col};font-weight:600">${r.name}</span>
            ${r.rarity?`<span style="font-size:.48rem;color:${col};border:1px solid ${col};border-radius:2px;padding:.02rem .22rem;opacity:.7">${r.rarity}</span>`:''}
            ${r.type?`<span style="font-size:.5rem;color:var(--sild);">${r.type}</span>`:''}
          </div>
          <div style="font-size:.6rem;color:var(--sild);line-height:1.45;margin-bottom:.12rem">${r.desc||''}</div>
          ${r.effect?`<div style="font-size:.58rem;color:${sealed?'var(--sild)':'#6ab46a'};">${sealed?'【封印中】':r.effect}</div>`:''}
          ${r.lore?`<div style="font-size:.54rem;color:rgba(150,140,100,.5);margin-top:.1rem;font-style:italic">${r.lore}</div>`:''}
          ${r.starName?`<div style="font-size:.5rem;color:rgba(120,120,100,.5);margin-top:.08rem">持有者：${r.starName}（${r.starNum}）</div>`:''}
        </div>
      </div>`;
    }).join('')}
    ${found.length===0?`<div style="font-size:.62rem;color:rgba(120,120,100,.5);padding:.3rem 0">其餘106件寶器散落於艾爾薩大陸各處，等待命運之人尋回。</div>`:''}
  </div>`;
}

function repPriceMultiplier(factionId){
  const v=getRep(factionId);
  if(v>=60)return 0.8;
  if(v>=20)return 0.9;
  if(v<=-60)return 1.3;
  if(v<=-20)return 1.15;
  return 1.0;
}
// ═══ INTEL / RUMOR BOARD SYSTEM ═══
// intel item: {id, title, content, src, rel:1-5, tags:[], day, cat, orange}
const INTEL_CATS=['全部','地點','人物','勢力','謠言','橘子'];
const INTEL_CAT_COLOR={地點:'#6ab4c8',人物:'#c8a46a',勢力:'#d05050',謠言:'#888',橘子:'rgba(180,140,220,.9)'};

function addIntel(item){
  if(!item||!item.id)return;
  if((G.intel||[]).find(x=>x.id===item.id)){
    // 更新現有情報
    const idx=G.intel.findIndex(x=>x.id===item.id);
    G.intel[idx]={...G.intel[idx],...item};
    appendEntryToDOM({type:'sys',v:`📋 情報更新：【${item.title}】`});
  }else{
    G.intel=G.intel||[];
    G.intel.unshift({rel:3,cat:'謠言',day:G.time?.day||1,...item});
    const isOrange=item.orange||item.cat==='橘子';
    appendEntryToDOM({type:'sys',v:`${isOrange?'🐈 橘子情報':'📋 新情報'}：【${item.title}】（可靠度：${'★'.repeat(item.rel||3)}${'☆'.repeat(5-(item.rel||3))}）`});
    showToast('新情報：'+item.title,'ok');
  }
  renderChanged('intel');saveGame();
}

function setIntelFilter(cat){G.intelFilter=cat;markDirty('intel');renderBoth('intel');}
function buildIntel(){
  const items=G.intel||[];
  const filter=G.intelFilter||'全部';
  const filtered=filter==='全部'?items:filter==='橘子'?items.filter(i=>i.orange||i.cat==='橘子'):items.filter(i=>i.cat===filter);

  const filterRow=`<div class="sfrow" style="flex-wrap:wrap;">${INTEL_CATS.map(cat=>`<button class="sfb ${(G.intelFilter||'全部')===cat?'ac':''}" onclick="setIntelFilter('${cat}')" style="${cat==='橘子'?'color:rgba(180,140,220,.8);':''}">${cat}</button>`).join('')}</div>`;

  if(!filtered.length) return filterRow+`<div style="padding:1.2rem .8rem;text-align:center;color:var(--sild);font-size:.7rem;">
    ${items.length?'此分類無情報':'尚無情報<br><span style="font-size:.6rem;opacity:.6">與NPC對話、探索地點可獲得情報<br>橘子有時會提供獨特的感知情報</span>'}
  </div>`;

  return filterRow+`<div style="display:flex;flex-direction:column;gap:.4rem;">
  ${filtered.map(item=>{
    const col=item.orange?INTEL_CAT_COLOR['橘子']:(INTEL_CAT_COLOR[item.cat]||'var(--sild)');
    const stars='★'.repeat(item.rel||3)+'☆'.repeat(5-(item.rel||3));
    const isOrange=item.orange||item.cat==='橘子';
    return`<div style="background:var(--bg3);border:1px solid ${isOrange?'rgba(150,120,200,.3)':'var(--brd)'};border-radius:4px;padding:.5rem .65rem;${isOrange?'background:rgba(30,20,50,.4);':''}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.4rem;margin-bottom:.2rem;">
        <div style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;">
          <span style="font-size:.5rem;color:${col};border:1px solid ${col};border-radius:2px;padding:.04rem .28rem;opacity:.85">${isOrange?'🐈 橘子':item.cat||'情報'}</span>
          <span style="font-size:.72rem;color:var(--sil);font-weight:600">${item.title}</span>
        </div>
        <span style="font-size:.52rem;color:${col};flex-shrink:0;letter-spacing:-.05em">${stars}</span>
      </div>
      <div style="font-size:.63rem;color:var(--sild);line-height:1.55;margin-bottom:.2rem">${item.content}</div>
      <div style="display:flex;justify-content:space-between;font-size:.52rem;color:rgba(120,120,100,.6);">
        <span>${item.src?'來源：'+item.src:''}</span>
        <span>Day${item.day||1}${item.related?'・'+item.related:''}</span>
      </div>
    </div>`;
  }).join('')}
  </div>`;
}

function applyIntelUpdate(infoArr){
  if(!infoArr)return;
  (Array.isArray(infoArr)?infoArr:[infoArr]).forEach(item=>addIntel(item));
}

function buildLog(){
  const lore=`
  <div style="margin-bottom:1rem;">
    <div style="font-size:.7rem;color:var(--gold);letter-spacing:.12em;text-align:center;padding:.5rem 0;border-bottom:1px solid var(--brd);margin-bottom:.6rem;">✦ 世界觀・艾爾薩大陸 ✦</div>
    <div style="font-size:.66rem;color:var(--sild);line-height:1.8;padding:0 .2rem;">
      <p style="margin-bottom:.5rem;color:#7a8fa0;">帝國曆 1077 年，統治艾爾薩大陸六百年的聖赫倫帝國在一夜之間崩裂。皇帝暴斃，宮廷內亂，十二位總督各據一方自立為王。大陸陷入戰火與混亂。</p>
      <div style="font-size:.58rem;color:var(--goldd);letter-spacing:.08em;margin:.5rem 0 .3rem;">⚜ 十二王國時代</div>
      <p style="margin-bottom:.4rem;">帝國崩裂後第三年。十二王國割據，邊境戰爭不斷。貿易中斷，匪盜橫行。底層百姓在苛政與戰亂間掙扎求存——義人無處容身，正義被踐踏為塵。</p>
      <div style="font-size:.58rem;color:var(--goldd);letter-spacing:.08em;margin:.5rem 0 .3rem;">✦ 108 命運之星</div>
      <p style="margin-bottom:.4rem;">帝國崩裂之夜，天象異變，108 顆流星劃過艾爾薩上空。占星師記錄下這一刻：「命運之星降世，聚者終結輪迴，散者萬劫不復。」這 108 顆星分為<span style="color:var(--gold);">天罡三十六星</span>（將領、英雄、智者）與<span style="color:var(--gold);">地煞七十二星</span>（工匠、商人、密探、學者）。</p>
      <div style="font-size:.58rem;color:rgba(180,140,220,.8);letter-spacing:.08em;margin:.5rem 0 .3rem;">⚜ 天父星・先行者</div>
      <p style="margin-bottom:.4rem;">最初感知到星辰降世的人。他召集了最早的同伴，踏上聚星之路——卻在途中倒下。他的名字已被遺忘，但他留下的線索與未竟之志，成為後繼者的遺產。如同水滸梁山的晁蓋，他是開路人，不是完成者。</p>
      <div style="font-size:.58rem;color:var(--goldd);letter-spacing:.08em;margin:.5rem 0 .3rem;">✦ 逼上梁山</div>
      <p style="margin-bottom:.4rem;">艾爾法並非英雄。她只是一個因堅持「糧食應該分給飢餓的人」而被解僱的城衛。橘子也只是一隻五枚銅幣的貓。但命運選中了她們——或者說，命運沒有給她們別的選擇。108 顆星辰，每一顆背後都有一個「被逼上絕路」的故事。</p>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:.3rem;padding:.4rem .2rem;border-top:1px solid var(--brd);margin-top:.5rem;">
      <span style="font-size:.52rem;padding:.1rem .35rem;border:1px solid rgba(100,130,180,.3);border-radius:2px;color:rgba(120,150,200,.7);">霧山聯邦</span>
      <span style="font-size:.52rem;padding:.1rem .35rem;border:1px solid rgba(180,160,80,.3);border-radius:2px;color:rgba(200,180,100,.7);">中央王國</span>
      <span style="font-size:.52rem;padding:.1rem .35rem;border:1px solid rgba(60,140,160,.3);border-radius:2px;color:rgba(80,160,180,.7);">東海王國</span>
      <span style="font-size:.52rem;padding:.1rem .35rem;border:1px solid rgba(40,130,60,.3);border-radius:2px;color:rgba(60,160,80,.7);">翠林域</span>
      <span style="font-size:.52rem;padding:.1rem .35rem;border:1px solid rgba(130,80,50,.3);border-radius:2px;color:rgba(160,100,70,.7);">南荒</span>
      <span style="font-size:.52rem;padding:.1rem .35rem;border:1px solid rgba(120,60,80,.3);border-radius:2px;color:rgba(160,80,100,.7);">帝國殘域</span>
    </div>
  </div>`;
  const entries=G.log.map(s=>`<div class="log-entry"><div class="log-sec">${s.sec}</div><div class="log-loc">📍 ${s.loc}</div>${s.lines.map(l=>l.t==='sys'?`<div class="log-sys2">${l.v}</div>`:`<div class="log-txt">${l.v}</div>`).join('')}</div>`).join('');
  return lore+`<div style="font-size:.7rem;color:var(--gold);letter-spacing:.12em;text-align:center;padding:.5rem 0;border-bottom:1px solid var(--brd);margin-bottom:.6rem;">✦ 冒險紀錄 ✦</div>`+entries;
}

// ═══ WIKI / ENCYCLOPEDIA（百科系統）═══
let _wikiFilter='世界';
function setWikiFilter(cat){_wikiFilter=cat;markDirty('wiki');renderBoth('wiki');}

const WIKI_DATA={
  '世界':[
    {title:'艾爾薩大陸',icon:'🌍',body:'本作的舞台。曾由聖赫倫帝國統治六百年，帝國崩裂後分裂為十二王國割據的亂世。大陸東臨碧藍海，西有霧山山脈，北方是永凍的霜嶺，南端則是被稱為「南荒」的不毛之地。'},
    {title:'聖赫倫帝國',icon:'👑',body:'統治艾爾薩大陸長達六百年的龐大帝國。帝國曆 1077 年，末代皇帝在一夜之間暴斃，宮廷大亂，十二位總督各自割據稱王。帝國崩裂的那一夜，天空劃過 108 顆流星。'},
    {title:'十二王國時代',icon:'⚔️',body:'帝國崩裂後的現狀。十二個王國互相征伐、結盟、背叛，平民在苛政與戰火中掙扎。目前故事主要涉及：霧山聯邦、中央王國、東海王國、翠林域、南荒、霜嶺、影沼地。'},
    {title:'帝國曆',icon:'📅',body:'艾爾薩大陸通用的紀年方式。帝國建立之年為元年。當前故事發生在帝國曆 1080 年（帝國崩裂後第三年）。雖然帝國不復存在，但各國仍沿用此曆法。'},
  ],
  '勢力':[
    {title:'霧山聯邦',icon:'🏔️',body:'大陸西部，以鐵霧城為首的工業城市聯盟。盛產鐵礦，霧氣終年不散。代理城主恩佐·卡羅以鐵腕治理，底層民眾苦不堪言。霧刃幫在山口地帶橫行。',tags:['鐵霧城','鐵冠城','灰港鎮']},
    {title:'中央王國',icon:'🏛️',body:'大陸中部，帝國故土上建立的最大王國。首都銀月城是商貿與情報的中心。王國北有王冠峰、東有金橋城。鏽城（前帝都）位於其南境，充滿帝國遺跡。',tags:['銀月城','鏽城','金橋城','王冠峰']},
    {title:'東海王國',icon:'⚓',body:'大陸東岸的海洋國家。東港城是最大的港口，海貿繁盛，但也是走私和間諜活動的溫床。霧海關控制南方航路。珊瑚灣則是海盜出沒的漁村。',tags:['東港城','霧海關','珊瑚灣']},
    {title:'翠林域',icon:'🌳',body:'大陸北部的古老森林領地。精靈與森民聚居，外人不易進入。翠林城是其中心，古樹隱村則藏著上古時代的秘密與禁忌書庫。魔法力量在此地最為濃厚。',tags:['翠林城','古樹隱村']},
    {title:'南荒',icon:'🏜️',body:'大陸南端的荒蕪之地。帝國時代曾是流放地，如今是亡命之徒和尋寶者的樂園。龍牙砦傳說有古龍遺跡。沙門城是進入荒野前的最後補給站。',tags:['龍牙砦','沙門城']},
    {title:'霜嶺',icon:'❄️',body:'大陸最北端的極寒之地。霜守堡是帝國時代的邊防遺址，如今由一支流亡騎士團駐守。環境嚴酷，但據說藏有帝國時代最後的秘密。'},
    {title:'影沼地',icon:'🌿',body:'大陸西南的瘴氣沼澤。毒霧瀰漫，常人難以久留。影沼鎮是藥師、毒師與亡命之徒的藏身之所。傳說沼澤深處有通往地底世界的通道。'},
    {title:'霧刃幫',icon:'🗡️',body:'活躍在鐵霧城山口地帶的劫匪組織。已劫掠多支商隊，懸賞令貼滿了中央廣場。其首領身份不明，組織規模可能比表面上更大。'},
    {title:'英雄公會',icon:'🛡️',body:'接受懸賞委託的傭兵組織，總部設在銀月城。各地設有分會。公會依據任務難度分級，從驅除害蟲到討伐軍閥都有。是冒險者的主要收入來源。'},
    {title:'商人公會',icon:'💰',body:'掌控大陸貿易與情報網絡的商業聯盟。在東港城的勢力尤其強大。表面上是合法商會，暗地裡經手走私、情報買賣、政治獻金。'},
    {title:'帝國殘軍',icon:'🏚️',body:'帝國崩裂後仍效忠皇室的殘存軍隊。主要盤踞在鏽城（前帝都）一帶。他們相信帝國會復興，但各派系之間也在互相內鬥。'},
  ],
  '星辰':[
    {title:'108 命運之星',icon:'✦',body:'帝國崩裂之夜降世的 108 顆星辰。分為天罡三十六星（將領、英雄、智者）和地煞七十二星（工匠、商人、密探、學者等）。傳說：聚齊 108 星者可終結亂世輪迴。'},
    {title:'天罡三十六星',icon:'⭐',body:'108 星中地位較高的 36 顆。對應的人物多為武將、謀士、領袖級人才。每位天罡星降世時攜帶一件命運寶器。天魁星為首——在本作中，天魁星是艾爾法。'},
    {title:'地煞七十二星',icon:'💫',body:'108 星中數量較多的 72 顆。對應的人物多為各行各業的專才：鐵匠、廚師、醫師、密探、商人、學者、園丁、航海家等。他們不一定會戰鬥，但每一位都不可或缺。'},
    {title:'天父星（先行者）',icon:'⚜️',body:'不屬於 108 星，但最早感知到星辰降世的人。他召集了最初的同伴，踏上聚星之路——卻在途中倒下。相當於《水滸傳》中的晁蓋，是開路人而非完成者。他的真實身份和倒下的原因是遊戲主線謎團之一。'},
    {title:'命運寶器',icon:'🗡️',body:'每位星辰之人降世時攜帶的特殊道具。寶器與持有者的命運綁定，品質從「普通」到「神器」不等。集齊所有寶器據說可觸發隱藏事件。艾爾法的寶器是「天命折刃」，橘子本身就是寶器「命運之錨」。'},
    {title:'星辰感知',icon:'🐈',body:'橘子（地魁星）的獨有能力。當附近有其他星辰之人時，橘子會產生反應——耳朵轉動、凝視某個方向、或發出特殊的叫聲。隨著橘子秘密線的推進，感知範圍會逐步擴大。'},
    {title:'招募模式',icon:'🤝',body:'108 星辰之人透過六種方式加入：\n① 逼上梁山型（被迫害而投靠）\n② 義氣相投型（被正義行為感召）\n③ 計謀招攬型（需要策略說服）\n④ 比武收服型（必須擊敗對方）\n⑤ 連環引薦型（A 介紹 B）\n⑥ 時機限定型（錯過就失去）'},
  ],
  '角色':[
    {title:'艾爾法😒',icon:'😒',body:'本作主角。天魁星。前鐵霧城城衛，因擅自釋放被扣押的糧食而遭解僱。銀色長髮，面無表情，沉默寡言但原則至上。不是英雄——是「做不到視而不見」的普通人。體內沉眠的星力是命運強加的枷鎖。'},
    {title:'橘子🐈😒',icon:'🐈',body:'地魁星。五枚銅幣買來的布偶貓，雌性。藍眼睛，雙色毛，面癱。只會喵叫（由系統翻譯）。知力 99，看穿一切虛偽。對翻肚持強烈反對立場。她可能是 108 星中最接近真相的存在——命運之錨。'},
    {title:'暗王（???）',icon:'👁️',body:'艾爾薩大陸幕後的神秘推手。不是 108 星之一，但其影響力凌駕於星辰之上。疑似在暗中操縱十二王國的政局。與星辰降世有某種關聯。真實身份完全不明。'},
  ],
  '系統':[
    {title:'金幣系統',icon:'🪙',body:'三幣制：1 金 = 100 銀 = 1000 銅。金幣透過完成任務、打工、戰鬥獎勵、售出道具等方式獲得。用於購買裝備、道具、住宿、打探情報、角色修煉等。'},
    {title:'HP（體力）',icon:'❤️',body:'角色的生命值。受傷扣HP，休息或使用道具回復。HP 歸零=瀕死。受傷程度分五級：健康（76%+）、輕傷、中傷、重傷、瀕死（0%）。職業會影響 HP 上限。'},
    {title:'素質系統',icon:'📊',body:'五項基礎素質：\n・武力：物理攻擊、力量判定\n・知力：魔法、謀略、察覺判定\n・統率：士氣、指揮、恐嚇判定\n・魅力：說服、欺騙、交涉判定\n・幸運：機率、閃避、意外判定\n素質可透過修煉（消耗銀幣）提升。'},
    {title:'骰子判定',icon:'🎲',body:'需要判斷成敗的行動使用 d20 骰子：投出 1~20 的隨機數 + 相關素質修正（素質值 ÷ 10）。結果與難度比較：大成功（20）、成功、失敗、大失敗（1）。戰鬥和技能檢定都使用此機制。'},
    {title:'好感度',icon:'💛',body:'同伴對艾爾法的信任程度，0~100。影響：對話選項、羈絆技能解鎖、特殊劇情觸發。橘子的好感度初始 65。透過餵魚乾 +8、聊天互動、劇情選擇等方式提升。翻肚會降低好感。'},
    {title:'羈絆技能',icon:'🔮',body:'好感度達到特定門檻後解鎖的特殊能力。\n・55：被動技能（如「貓眼警戒」骰子+3）\n・75：主動技能（如「無聲默契」解鎖隱藏選項）\n・95：覺醒技能（如「地魁之印」全場成功）\n每個同伴組合有不同的羈絆技能。'},
    {title:'聲望系統',icon:'📈',body:'與各勢力的關係值，-100~+100。\n・盟友（60+）：商店八折、特殊任務\n・友好（20+）：九折、額外情報\n・中立：無特殊效果\n・敵對（-20~）：漲價、區域受阻\n・公敵（-60~）：見面即攻擊'},
    {title:'職業系統',icon:'⚔️',body:'每位角色可選擇職業，影響素質加成和被動能力。\n戰鬥系：城衛、劍客、鬥士\n智謀系：術士、謀士\n輔助系：遊俠、密探、醫師、商賈\n特殊：命運之錨（橘子專屬）\n可透過劇情或「轉職」按鈕更換。'},
    {title:'裝備強化',icon:'🔨',body:'裝備可強化 +1 至 +20。每級消耗銀幣（等級+1）×3。強化會按比例提升裝備的素質加成。+20 為上限。據點的鍛冶坊建成後上限提升至 +30。'},
    {title:'時間與天氣',icon:'🌤️',body:'遊戲內時間以小時推進。每日 24 小時，跨日時隨機生成天氣。天氣影響行動：暴雨無法長距移動、濃霧視野受限、異常寒冷體力消耗加快。休息、趕路、過夜都會推進時間。'},
    {title:'據點系統',icon:'🏛️',body:'招募 10 位星辰之人後解鎖。隨招募人數增加，可建設更多設施（鍛冶坊、炊煙閣、藏星閣等）。非戰鬥星辰經營據點：鐵匠強化武器、廚師恢復HP、密探偵查情報。108 星全員到齊時解鎖「天命之座」。'},
    {title:'橘子秘密線',icon:'⚓',body:'橘子的真實身份透過五個階段逐步揭露。觸發條件包括：與橘子互動（聊天、餵魚）、好感度達標、蒐集天父星線索、特定劇情事件。每階段解鎖新的情報和能力。第五階段=命運之錨覺醒。'},
    {title:'密技',icon:'💡',body:'在自由行動欄輸入特殊指令：\n・@錢：獲得大量金幣（測試用）\n・@骰子：開啟骰子面板'},
  ],
};
const WIKI_CATS=Object.keys(WIKI_DATA);

function buildWiki(){
  const cat=_wikiFilter;
  const filterRow=`<div class="sfrow" style="flex-wrap:wrap;">${WIKI_CATS.map(c=>`<button class="sfb ${cat===c?'ac':''}" onclick="setWikiFilter('${c}')">${c}</button>`).join('')}</div>`;
  const items=WIKI_DATA[cat]||[];
  const entries=items.map(item=>{
    const bodyHtml=item.body.replace(/\n/g,'<br>');
    const tagsHtml=item.tags?`<div style="display:flex;flex-wrap:wrap;gap:.2rem;margin-top:.35rem;">${item.tags.map(t=>`<span style="font-size:.5rem;padding:.06rem .28rem;border:1px solid rgba(201,168,76,.25);border-radius:2px;color:var(--goldd);">${t}</span>`).join('')}</div>`:'';
    return`<details style="background:var(--bg3);border:1px solid var(--brd);border-radius:4px;margin-bottom:.4rem;overflow:hidden;">
      <summary style="padding:.5rem .65rem;cursor:pointer;display:flex;align-items:center;gap:.45rem;font-size:.72rem;color:var(--sil);font-weight:600;list-style:none;">
        <span style="font-size:.9rem;flex-shrink:0;">${item.icon}</span>
        <span style="flex:1;">${item.title}</span>
        <span style="font-size:.55rem;color:var(--sild);flex-shrink:0;">▼</span>
      </summary>
      <div style="padding:.45rem .65rem .55rem;border-top:1px solid var(--brd);font-size:.66rem;color:#7a8fa0;line-height:1.75;">
        ${bodyHtml}${tagsHtml}
      </div>
    </details>`;
  }).join('');
  return filterRow+`<div style="margin-top:.3rem;">${entries}</div>`;
}

// ═══ HEADQUARTERS SYSTEM（據點系統）═══
const HQ_UNLOCK_STARS=10; // 招募10人後解鎖
const HQ_FACILITIES=[
  {id:'hall',   name:'聚義廳',  icon:'🏛️', stars:10, desc:'據點核心。星辰之人在此集結、議事、宣誓。', effect:'解鎖據點系統、查看全員名冊'},
  {id:'forge',  name:'鍛冶坊',  icon:'⚒️', stars:12, desc:'鐵匠星入駐後開放。裝備強化上限提升、可鑄造特殊武器。', effect:'強化上限 +20→+30・解鎖鑄造'},
  {id:'kitchen', name:'炊煙閣', icon:'🍳', stars:15, desc:'廚師星入駐後開放。烹飪恢復HP、特殊料理增益。', effect:'料理系統・全員HP回復+25%'},
  {id:'library', name:'藏星閣', icon:'📚', stars:18, desc:'學者星入駐後開放。解讀古文、研究星辰秘密。', effect:'情報解析・天父星線索加速'},
  {id:'clinic',  name:'杏林堂', icon:'⚕️', stars:20, desc:'醫師星入駐後開放。治療傷病、調配藥劑。', effect:'休息HP回復+50%・解毒・復活'},
  {id:'spy',     name:'暗鴉樓', icon:'🕵️', stars:22, desc:'密探星入駐後開放。情報網絡、暗中行動。', effect:'自動獲取情報・偵查敵情'},
  {id:'market',  name:'星河商會',icon:'💰', stars:25, desc:'商賈星入駐後開放。專屬商店、貿易路線。', effect:'獨家商品・交易免稅'},
  {id:'arena',   name:'試煉場', icon:'⚔️', stars:28, desc:'武將星入駐後開放。訓練、比武、切磋技藝。', effect:'訓練費用減半・解鎖連攜技'},
  {id:'garden',  name:'星辰園', icon:'🌿', stars:30, desc:'園丁星入駐後開放。種植藥草、採集素材。', effect:'定期產出藥草・稀有素材'},
  {id:'dock',    name:'聚星港', icon:'⛵', stars:35, desc:'航海星入駐後開放。遠洋貿易、海外探索。', effect:'解鎖海外區域・貿易收入'},
  {id:'tower',   name:'命星塔', icon:'🔭', stars:50, desc:'集齊半數星辰後覺醒。觀測全大陸星辰動向。', effect:'全大陸星辰位置可見'},
  {id:'throne',  name:'天命之座',icon:'👑', stars:108,desc:'108星齊聚。終結輪迴的最後一步。', effect:'???'},
];

function getHQUnlocked(){
  const recruited=[...TIANGANG,...DISHAT].filter(s=>s.status==='recruited').length;
  return recruited>=HQ_UNLOCK_STARS;
}

function getRecruitedCount(){
  return [...TIANGANG,...DISHAT].filter(s=>s.status==='recruited').length;
}

function buildHQ(){
  const recruited=getRecruitedCount();
  const unlocked=recruited>=HQ_UNLOCK_STARS;
  // 更新 tab 外觀
  ['hq-tab-p','hq-tab-d'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){
      if(unlocked){el.style.opacity='1';el.style.color='';el.textContent='據點';}
      else{el.style.opacity='.4';el.style.color='var(--sild)';el.textContent='據點🔒';}
    }
  });

  if(!unlocked){
    const progress=Math.round(recruited/HQ_UNLOCK_STARS*100);
    return`<div style="padding:1.5rem .8rem;text-align:center;">
      <div style="font-size:1.5rem;margin-bottom:.6rem;opacity:.3;">🏛️</div>
      <div style="font-size:.82rem;color:var(--sild);margin-bottom:.8rem;">據點尚未建立</div>
      <div style="font-size:.68rem;color:#6a7a8a;line-height:1.7;margin-bottom:1rem;">
        當招募的星辰之人達到 <span style="color:var(--gold);">${HQ_UNLOCK_STARS}</span> 位時，<br>
        你將獲得建立據點的機會——<br>
        一個屬於108星的家。
      </div>
      <div style="margin:0 auto;max-width:200px;">
        <div style="display:flex;justify-content:space-between;font-size:.58rem;color:var(--sild);margin-bottom:.3rem;">
          <span>招募進度</span><span>${recruited} / ${HQ_UNLOCK_STARS}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;">
          <div style="width:${progress}%;height:100%;background:linear-gradient(90deg,var(--goldd),var(--gold));border-radius:3px;transition:width .5s;"></div>
        </div>
      </div>
      <div style="margin-top:1.2rem;font-size:.6rem;color:rgba(120,100,80,.4);font-style:italic;">「聚星者，先聚人。」</div>
    </div>`;
  }

  // 已解鎖：顯示據點設施
  let h=`<div style="text-align:center;margin-bottom:.8rem;">
    <div style="font-size:.78rem;color:var(--gold);letter-spacing:.12em;font-weight:700;">✦ 聚義據點 ✦</div>
    <div style="font-size:.58rem;color:var(--sild);margin-top:.2rem;">星辰 ${recruited}/108 · 設施 ${HQ_FACILITIES.filter(f=>recruited>=f.stars).length}/${HQ_FACILITIES.length}</div>
  </div>`;
  h+=HQ_FACILITIES.map(f=>{
    const available=recruited>=f.stars;
    return`<div style="background:${available?'var(--bg3)':'rgba(20,20,25,.5)'};border:1px solid ${available?'var(--brd)':'rgba(60,60,70,.3)'};border-radius:4px;padding:.55rem .7rem;margin-bottom:.4rem;opacity:${available?'1':'.45'};${available?'cursor:pointer;':''}transition:all .2s;"
      ${available?`onmouseover="this.style.borderColor='var(--brdb)'" onmouseout="this.style.borderColor='var(--brd)'"`:''}
    >
      <div style="display:flex;align-items:center;gap:.5rem;">
        <span style="font-size:1.1rem;${available?'':'filter:grayscale(1);'}">${f.icon}</span>
        <div style="flex:1;">
          <div style="font-size:.72rem;color:${available?'var(--sil)':'var(--sild)'};font-weight:600;">${f.name}${!available?' 🔒':''}</div>
          <div style="font-size:.58rem;color:${available?'var(--sild)':'rgba(80,80,90,.6)'};margin-top:.1rem;">${f.desc}</div>
          ${available?`<div style="font-size:.55rem;color:#6ab46a;margin-top:.15rem;">⊕ ${f.effect}</div>`:`<div style="font-size:.55rem;color:rgba(100,90,70,.5);margin-top:.15rem;">需要 ${f.stars} 位星辰之人</div>`}
        </div>
      </div>
    </div>`;
  }).join('');
  return h;
}

// ═══ QUEST SYSTEM ═══
// quest: {id, title, type:'主線'|'支線'|'緊急', status:'active'|'completed'|'failed',
//          desc, objectives:[{text,done}], rewards, loc, addedAt}
function buildQuest(){
  const qs=G.quests||[];
  if(!qs.length) return`<div style="padding:1.2rem .8rem;text-align:center;color:var(--sild);font-size:.7rem;">尚無任務<br><span style="font-size:.6rem;opacity:.6">與 NPC 對話或探索地點可獲得任務</span></div>`;
  const active=qs.filter(q=>q.status==='active');
  const done=qs.filter(q=>q.status==='completed');
  const failed=qs.filter(q=>q.status==='failed');
  const typeColor={主線:'var(--gold)',支線:'#6ab4c8',緊急:'#d05050'};
  const statusIcon={active:'●',completed:'✦',failed:'✗'};
  const qCard=q=>{
    const tc=typeColor[q.type]||'var(--sild)';
    const si=statusIcon[q.status]||'●';
    const faded=q.status!=='active';
    const objs=q.objectives||[];
    const doneCount=objs.filter(o=>o.done).length;
    return`<div style="background:var(--bg3);border:1px solid ${faded?'rgba(100,100,100,.2)':'var(--brd)'};border-radius:4px;padding:.55rem .7rem;opacity:${faded?'.5':'1'}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;margin-bottom:.25rem;">
        <div style="flex:1">
          <span style="font-size:.52rem;color:${tc};border:1px solid ${tc};border-radius:2px;padding:.05rem .3rem;margin-right:.35rem;opacity:.8">${q.type}</span>
          <span style="font-size:.75rem;color:var(--sil);font-weight:600;">${q.title}</span>
        </div>
        <span style="font-size:.55rem;color:${faded?'var(--sild)':tc};flex-shrink:0">${si} ${q.status==='active'?'進行中':q.status==='completed'?'已完成':'已失敗'}</span>
      </div>
      ${q.desc?`<div style="font-size:.63rem;color:var(--sild);margin-bottom:.3rem;line-height:1.5">${q.desc}</div>`:''}
      ${objs.length?`<div style="display:flex;flex-direction:column;gap:.15rem;margin-bottom:.28rem;">
        ${objs.map(o=>`<div style="display:flex;align-items:center;gap:.35rem;font-size:.62rem;color:${o.done?'#6ab46a':'var(--sil)'}">
          <span style="flex-shrink:0">${o.done?'☑':'☐'}</span>
          <span style="${o.done?'opacity:.6;text-decoration:line-through;':''}">${o.text}</span>
        </div>`).join('')}
      </div>`:''}
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.55rem;color:var(--sild);">
        <span>${q.loc?'📍 '+q.loc:''}</span>
        <div style="display:flex;gap:.4rem;align-items:center;">
          ${objs.length?`<span>${doneCount}/${objs.length}</span>`:''}
          ${q.rewards?`<span style="color:var(--goldd)">🏆 ${q.rewards}</span>`:''}
          ${q.status==='active'?`<button onclick="completeQuest('${q.id}')" style="font-size:.52rem;padding:.08rem .3rem;background:transparent;border:1px solid rgba(100,180,100,.4);border-radius:2px;color:rgba(100,200,100,.7);cursor:pointer;"
            onmouseover="this.style.borderColor='#6ab46a';this.style.color='#6ab46a'"
            onmouseout="this.style.borderColor='rgba(100,180,100,.4)';this.style.color='rgba(100,200,100,.7)'">完成</button>
          <button onclick="failQuest('${q.id}')" style="font-size:.52rem;padding:.08rem .3rem;background:transparent;border:1px solid rgba(180,80,80,.3);border-radius:2px;color:rgba(200,100,100,.6);cursor:pointer;"
            onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)'"
            onmouseout="this.style.borderColor='rgba(180,80,80,.3)';this.style.color='rgba(200,100,100,.6)'">放棄</button>`:''}
        </div>
      </div>
    </div>`;
  };
  let h='';
  if(active.length){
    h+=`<div style="font-size:.6rem;color:var(--goldd);letter-spacing:.08em;padding:.3rem .2rem .2rem;border-bottom:1px solid var(--brd);margin-bottom:.4rem;">進行中任務 (${active.length})</div>`;
    h+=`<div style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:.6rem;">${active.map(qCard).join('')}</div>`;
  }
  if(done.length||failed.length){
    h+=`<div style="font-size:.6rem;color:var(--sild);letter-spacing:.08em;padding:.3rem .2rem .2rem;border-bottom:1px solid var(--brd);margin-bottom:.4rem;">已結束任務 (${done.length+failed.length})</div>`;
    h+=`<div style="display:flex;flex-direction:column;gap:.4rem;">${[...done,...failed].map(qCard).join('')}</div>`;
  }
  return h;
}

function addQuest(q){
  if(!q||!q.id||!q.title)return;
  if((G.quests||[]).find(x=>x.id===q.id)){updateQuest(q);return;}
  G.quests=G.quests||[];
  G.quests.push({...q,status:q.status||'active',addedAt:Date.now()});
  appendEntryToDOM({type:'sys',v:`📋 新任務：【${q.title}】${q.type?'（'+q.type+'）':''}`});
  renderChanged('quest');saveGame();
  showToast('新任務：'+q.title,'ok');
}

function updateQuest(q){
  const idx=(G.quests||[]).findIndex(x=>x.id===q.id);
  if(idx<0){addQuest(q);return;}
  // 更新目標勾選
  if(q.objectives) q.objectives.forEach(o=>{
    const ex=G.quests[idx].objectives?.find(x=>x.text===o.text);
    if(ex)ex.done=o.done;
    else (G.quests[idx].objectives=G.quests[idx].objectives||[]).push(o);
  });
  if(q.rewards)G.quests[idx].rewards=q.rewards;
  if(q.desc)G.quests[idx].desc=q.desc;
  const wasActive=G.quests[idx].status==='active';
  if(q.status)G.quests[idx].status=q.status;
  if(wasActive&&q.status==='completed')applyQuestRewards(G.quests[idx]);
  renderChanged('quest');saveGame();
}

function applyQuestRewards(q){
  if(!q.rewards)return;
  const r=q.rewards;
  const parts=[];
  if(r.gd&&(r.gd.g||r.gd.s||r.gd.c)){applyGold(r.gd);parts.push(`${r.gd.g?'金'+r.gd.g+' ':''}${r.gd.s?'銀'+r.gd.s+' ':''}${r.gd.c?'銅'+r.gd.c:''}`.trim());}
  if(r.fa)(Array.isArray(r.fa)?r.fa:[r.fa]).forEach(f=>{if(f.id&&f.delta){setFavor(f.id,f.delta);parts.push(`${getCharData(f.id)?.name||f.id} 好感${f.delta>0?'+':''}${f.delta}`);}});
  if(r.rp)(Array.isArray(r.rp)?r.rp:[r.rp]).forEach(rp=>{if(rp.id&&rp.delta)applyRep([rp]);});
  if(r.items){const inv=getInv();(Array.isArray(r.items)?r.items:[r.items]).forEach(item=>{const ex=inv.items.find(i=>i.n===item.n);if(ex){const m=ex.q.match(/(\d+)/);ex.q='×'+((m?parseInt(m[1]):1)+1);}else inv.items.push({...item,q:item.q||'×1'});parts.push(item.n);});}
  if(parts.length)appendEntryToDOM({type:'sys',v:`🎁 任務獎勵：${parts.join('、')}`});
  showToast('任務完成！獲得獎勵','ok');
  renderChanged('inv','party');
}

function completeQuest(id){
  const q=(G.quests||[]).find(x=>x.id===id);if(!q)return;
  q.status='completed';q.objectives?.forEach(o=>o.done=true);
  appendEntryToDOM({type:'sys',v:`✦ 任務完成：【${q.title}】`});
  applyQuestRewards(q);
  renderChanged('quest');saveGame();
  showToast('任務完成：'+q.title,'ok');
}

function failQuest(id){
  const q=(G.quests||[]).find(x=>x.id===id);if(!q)return;
  q.status='failed';
  appendEntryToDOM({type:'sys',v:`✗ 任務失敗：【${q.title}】`});
  renderChanged('quest');saveGame();
  showToast('任務放棄：'+q.title,'inf');
}

function applyQuestUpdate(qt){
  if(!qt)return;
  (Array.isArray(qt)?qt:[qt]).forEach(q=>{
    if(q.status==='new')addQuest({...q,status:'active'});
    else updateQuest(q);
  });
}

function renderBoth(tab){
  let h;
  const cacheable=['stars','inv','quest','intel','wiki','hq','guild']; // party/log change often, skip cache
  if(cacheable.includes(tab)&&!_dirty[tab]&&_renderCache[tab]){
    h=_renderCache[tab];
  }else{
    if(tab==='party')h=buildParty();
    else if(tab==='stars')h=buildStars();
    else if(tab==='inv')h=buildInv();
    else if(tab==='log')h=buildLog();
    else if(tab==='quest')h=buildQuest();
    else if(tab==='intel')h=buildIntel();
    else if(tab==='wiki')h=buildWiki();
    else if(tab==='guild')h=buildGuild();
    else if(tab==='hq')h=buildHQ();
    else h='';
    if(cacheable.includes(tab)){_renderCache[tab]=h;}_dirty[tab]=false;
  }
  ['p','d'].forEach(p=>{const el=document.getElementById(p+'-'+tab);if(el)el.innerHTML=h;});
  if(tab==='party')setTimeout(()=>{
    // 預取所有隊員頭像
    allParty().forEach(c=>prefetchDicebear(c.id));
  },100);
}
function switchTab(el,pf,name){
  const pn=pf==='p'?'ptab':'dtab',pc=pf==='p'?'ptc':'dtc';
  const cont=pf==='p'?document.getElementById('panel-side'):document.getElementById('drawer');
  cont.querySelectorAll('.'+pn).forEach(b=>b.classList.remove('ac'));cont.querySelectorAll('.'+pc).forEach(c=>c.classList.remove('ac'));
  el.classList.add('ac');document.getElementById(pf+'-'+name).classList.add('ac');
  G.activeTab=name;
  // 切換時渲染（若已標髒才重建，否則用快取）
  renderBoth(name);
}

// ═══ DETAIL MODALS ═══
function openChar(id){
  const c=allParty().find(x=>x.id===id)||getCharData(id);if(!c)return;
  const src=getPortraitSrc(id);
  const pHtml=`<div style="position:relative;width:100%;height:140px;overflow:hidden;border-bottom:1px solid var(--brd);background:var(--bg3);">
    ${src?`<img src="${src}" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;"/>
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 50%,var(--bg2) 100%);pointer-events:none;"></div>`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:3rem;">${c.emoji}</div>`}
    <div style="position:absolute;bottom:.4rem;right:.5rem;">
      <button onclick="openPortraitSettings('${id}')" style="font-size:.58rem;padding:.18rem .45rem;background:rgba(0,0,0,.5);border:1px solid rgba(201,168,76,.3);border-radius:2px;color:rgba(201,168,76,.7);cursor:pointer;">🖼 頭像設定</button>
    </div>
  </div>`;
  document.getElementById('modal-inner').innerHTML=pHtml+`<div class="mtop"><div class="mscol"><div class="mtp">${c.type}</div><div class="mnm">第${c.num}星</div><div class="mst">${c.star}</div></div><div class="micol"><div class="mname">${c.name} <span style="font-size:.8rem">${c.emoji}</span></div><div class="msub2">${c.title}</div><div class="mstat r">✦ 已加入</div></div></div><div class="mbody"><div class="msec"><div class="msect">人物說明</div><div class="mdesc">${c.desc}</div></div><div class="msec"><div class="msect">素質數值</div><div style="padding-top:.18rem">${smini(c.stats,c.sn,c.id)}</div></div><div class="msec"><div class="msect">天賦技能</div>${c.tl.map(t=>`<div class="tarow"><span class="ta2 ${t.s?'sl':''}">${t.s?'【封印】':''}${t.n}</span><div class="tadesc">${t.d}</div></div>`).join('')}</div><div class="msec"><div class="msect">裝備</div>${Object.entries(c.eq).map(([k,v])=>`<div class="tr2"><span class="ts">${k}</span><span class="ti">${v}</span></div>`).join('')}</div>${id==='orange'?`<div class="msec"><div class="msect" style="color:rgba(180,140,220,.8);">⚓ 秘密・命運之錨</div>${getOrangeSecretHtml()}</div>`:''}</div>`;
  document.getElementById('detail-modal').classList.add('open');
}
function openStar(type,num){
  const arr=type==='天罡'?TIANGANG:DISHAT,s=arr.find(x=>x.num===num);if(!s)return;
  const iR=s.status==='recruited',iC=s.status==='contact',iU=s.status==='unknown';
  const sc=iR?'r':iC?'c':'u',st=iR?'✦ 已招募':iC?'◈ 接觸中':'● 未現身';
  let body='';
  if(iR&&s.id){
    const c=getCharData(s.id);
    const src=c?getPortraitSrc(s.id):null;
    const pHtml=src?`<div style="position:relative;width:100%;height:130px;overflow:hidden;border-bottom:1px solid var(--brd);">
      <img src="${src}" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;"/>
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 50%,var(--bg2) 100%);pointer-events:none;"></div>
      <button onclick="openPortraitSettings('${s.id}')" style="position:absolute;bottom:.4rem;right:.5rem;font-size:.58rem;padding:.18rem .45rem;background:rgba(0,0,0,.5);border:1px solid rgba(201,168,76,.3);border-radius:2px;color:rgba(201,168,76,.7);cursor:pointer;">🖼 頭像設定</button>
    </div>`:'';
    body=pHtml+(c?`<div class="msec"><div class="msect">人物說明</div><div class="mdesc">${c.desc}</div></div><div class="msec"><div class="msect">素質數值</div><div style="padding-top:.18rem">${smini(c.stats,c.sn,s.id)}</div></div>`:'')+'<div class="mnote2">→ 點擊「同伴」標籤查看完整資料</div>';
  }
  else if(iC){body=`<div class="msec"><div class="msect">目擊情報</div><div class="mdesc">遭遇：${s.cN||'身份不明'}</div><div class="mnote2">${s.hint||'尚無情報'}</div></div><div class="msec"><div class="msect">素質數值</div><div class="mdesc" style="color:var(--sild);font-size:.68rem">尚未加入——數值未解鎖</div></div>`;}
  else{body=`<div class="msec"><div class="msect">星辰情報</div><div class="mdesc" style="color:var(--sild)">此星辰尚未降世，或尚未與主星相遇。</div><div class="mnote2">世界的某個角落，這顆星正在等待。</div></div>`;}
  document.getElementById('modal-inner').innerHTML=`<div class="mtop"><div class="mscol"><div class="mtp">${type}</div><div class="mnm">第${num}星</div><div class="mst">${s.star}</div></div><div class="micol"><div class="mname">${iU?'？？':(s.name==='?'||s.name==='???')?(s.cN||'？？？'):s.name}</div><div class="msub2">${type}・第${num}星・${s.star}</div><div class="mstat ${sc}">${st}</div></div></div><div class="mbody">${body}</div>`;
  document.getElementById('detail-modal').classList.add('open');
}
function closeDOut(e){if(e.target===document.getElementById('detail-modal'))closeD();}
function closeD(){document.getElementById('detail-modal').classList.remove('open');}

// 頭像設定（從角色詳情頁叫起）
function openPortraitSettings(id){
  const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id]);
  const label=cfg?.label||getCharData(id)?.name||id;
  const cur=getCustomPortrait(id)||'';
  const inner=document.getElementById('modal-inner');
  const existing=inner.innerHTML;
  // 在 modal 底部插入頭像設定面板
  const panelId='port-panel-'+id;
  if(document.getElementById(panelId)){document.getElementById(panelId).remove();return;}
  const panel=document.createElement('div');
  panel.id=panelId;
  panel.style.cssText='padding:.7rem 1rem;border-top:1px solid var(--brd);background:var(--bg3);';
  panel.innerHTML=`<div style="font-size:.68rem;color:var(--goldd);margin-bottom:.45rem;">🖼 ${label} 頭像設定</div>
    <div style="display:flex;gap:.4rem;margin-bottom:.35rem;">
      <input id="port-url-${id}" class="s-inp" style="flex:1;font-size:.65rem;" placeholder="貼上圖片網址（留空=預設）" value="${cur}"/>
      <button onclick="applyCustomPortrait('${id}');closeD();setTimeout(()=>openChar('${id}'),100);" class="sbn p" style="flex-shrink:0;padding:.32rem .55rem;font-size:.63rem;">套用</button>
    </div>
    ${cfg?.prompt?`<button onclick="generateAIPortrait('${id}');closeD();setTimeout(()=>openChar('${id}'),8000);" id="gen-btn-${id}" class="sbn c" style="width:100%;font-size:.62rem;padding:.3rem;margin-bottom:.28rem;">✦ 重新生成 AI 頭像（Pollinations）</button>
    <div id="gen-status-${id}" style="font-size:.58rem;color:var(--sild);min-height:.9rem;"></div>`:''}
    <button onclick="clearPortraitCache('${id}');renderBoth('party');closeD();setTimeout(()=>openChar('${id}'),100);" style="font-size:.6rem;padding:.15rem .45rem;background:transparent;border:1px solid var(--brd);border-radius:2px;color:var(--sild);cursor:pointer;margin-top:.25rem;">重設為預設</button>`;
  document.querySelector('#detail-modal .mbox.detail-mbox').appendChild(panel);
}
function saveKey(){
  const k=document.getElementById('api-inp').value.trim(),w=document.getElementById('api-warn');
  if(!k){w.textContent='請輸入 API 金鑰';w.classList.add('show');return;}
  if(!k.startsWith('sk-ant-')){w.textContent='格式不正確，應以 sk-ant- 開頭';w.classList.add('show');return;}
  CFG.key=k;document.getElementById('api-modal').classList.remove('open');showToast('✦ API 金鑰已設定','ok');
}
function openSettings(){
  const k=CFG.key;
  document.getElementById('key-disp').textContent=k?k.slice(0,14)+'…'+k.slice(-4):'—';
  document.getElementById('s-dot').className='s-dot '+(k?'ok':'no');
  document.getElementById('s-stxt').textContent=k?'已設定':'未設定';
  document.getElementById('s-model').value=CFG.model;
  document.getElementById('s-tok').value=String(CFG.tokens||2000);
  document.getElementById('test-res').textContent='';
  // 顯示對話歷史狀態
  const turns=Math.floor(G.history.length/2);
  const chars=G.history.reduce((a,m)=>a+(m.content?.length||0),0);
  const pct=Math.min(100,Math.round(chars/1000));
  const stat=document.getElementById('history-stat');
  if(stat) stat.textContent=`目前 ${turns} 輪對話 · 約 ${Math.round(chars/100)/10}K 字元 ${chars>60000?'⚠ 建議整理':''}`;
  if(stat) stat.style.color=chars>60000?'var(--orange)':'var(--sild)';
  document.getElementById('settings-modal').classList.add('open');
}

async function generateAIPortrait(id){
  const cfg=PCFG[id];if(!cfg?.prompt)return;
  const btn=document.getElementById(`gen-btn-${id}`);
  const status=document.getElementById(`gen-status-${id}`);
  if(btn)btn.disabled=true;
  if(status)status.textContent='生成中，約 15~30 秒…';
  const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(cfg.prompt)}?width=260&height=148&seed=${cfg.seed}&model=flux`;
  const img=new Image();
  img.onload=()=>{
    setCustomPortrait(id,url);
    renderBoth('party');
    if(status)status.textContent='✓ 頭像已更新';
    if(status)status.style.color='var(--grn)';
    const inp=document.getElementById(`port-url-${id}`);
    if(inp)inp.value=url;
    if(btn)btn.disabled=false;
  };
  img.onerror=()=>{
    if(status)status.textContent='⚠ 生成失敗，請重試';
    if(status)status.style.color='#f99';
    if(btn)btn.disabled=false;
  };
  img.src=url;
}

async function autoCompressHistory(){
  if(G.history.length<20)return;
  // 退避中或有其他請求進行中時跳過壓縮
  if(Date.now()<_apiThrottle.backoffUntil||_apiThrottle.pending>0)return;
  const keepN=10;
  const toCompress=G.history.slice(0,-keepN);
  const toKeep=G.history.slice(-keepN);
  const _cp=allParty();const _gSnap3=Object.entries(G.guilds||{}).filter(([,v])=>v?.joined).map(([id,v])=>`${GUILDS[id]?.name||id}(${GUILDS[id]?.ranks[v.rank]||'?'})`).join(',');
  const _stateSnap=`[狀態快照]隊伍:${_cp.map(m=>`${m.name}/${getJob(m.id)||'?'}`).join(',')};金幣:金${G.gold.gold}銀${G.gold.silver}銅${G.gold.copper};任務:${(G.quests||[]).filter(q=>q.status==='active').map(q=>q.title).join(',')};好感:橘子${getFavor('orange')}${_gSnap3?';工會:'+_gSnap3:''}`;
  const compressPrompt=`以下是RPG遊戲的故事歷史記錄，請用200字以內的繁體中文摘要，保留：重要劇情事件、招募的角色、已完成的任務、關鍵情報。\n${_stateSnap}\n\n${toCompress.map(m=>m.role+':'+m.content.slice(0,200)).join('\n')}`;
  let gated=false;
  try{
    await apiGate();gated=true;
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CFG.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:CFG.model,max_tokens:300,messages:[{role:'user',content:compressPrompt}]})
    });
    apiDone();gated=false;
    if(r.status===429){apiHit429();return;}
    if(!r.ok)return;
    const d=await r.json();
    const summary=d.content?.[0]?.text||'（歷史記錄已壓縮）';
    G.history=[{role:'user',content:'【故事摘要】'+summary},{role:'assistant',content:'{"st":"繼續","sl":"'+G.sceneLoc+'","nv":[],"dl":[],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null}'},...toKeep];
    appendEntryToDOM({type:'sys',v:'✦ 故事記憶已自動整理（保留近期'+keepN/2+'輪）'});
    saveGame();
  }catch(e){if(gated)apiDone();console.warn('autoCompress failed:',e);}
}

async function compressHistory(){
  if(!CFG.key){showToast('請先設定 API 金鑰','err');return;}
  if(G.history.length<6){showToast('對話尚短，不需要整理','inf');return;}
  if(!confirm('將舊有劇情壓縮為摘要，釋放記憶空間。\n近期的對話與選項不受影響。\n\n確定繼續？'))return;

  const btn=document.getElementById('compress-btn');
  btn.disabled=true;btn.textContent='整理中…';
  closeSettings();
  appendEntryToDOM({type:'sys',v:'✦ 正在整理故事記憶，請稍候…'});

  // 保留最近 6 則（3輪），壓縮其餘
  const keepN=6;
  const toCompress=G.history.slice(0,-keepN);
  const toKeep=G.history.slice(-keepN);

  const _cp2=allParty();const _gSnap4=Object.entries(G.guilds||{}).filter(([,v])=>v?.joined).map(([id,v])=>`${GUILDS[id]?.name||id}(${GUILDS[id]?.ranks[v.rank]||'?'})`).join(',');
  const _stateSnap2=`[狀態快照]隊伍:${_cp2.map(m=>`${m.name}/${getJob(m.id)||'?'}`).join(',')};金幣:金${G.gold.gold}銀${G.gold.silver}銅${G.gold.copper};任務:${(G.quests||[]).filter(q=>q.status==='active').map(q=>q.title).join(',')};好感:橘子${getFavor('orange')}${_gSnap4?';工會:'+_gSnap4:''}`;
  const compressPrompt=`以下是一段奇幻 RPG 故事的對話記錄。請用繁體中文，以 400 字以內的「故事摘要」形式整理：已發生的重要事件、人物關係、地點、取得的情報與道具、當前局勢。摘要將作為後續故事的背景記憶。\n${_stateSnap2}\n\n${toCompress.map(m=>`[${m.role}]: ${typeof m.content==='string'?m.content.slice(0,500):''}`).join('\n')}`;

  let gated=false;
  try{
    await apiGate();gated=true;
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CFG.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:CFG.model,max_tokens:600,messages:[{role:'user',content:compressPrompt}]})
    });
    apiDone();gated=false;
    if(res.status===429){apiHit429();throw new Error('請求過於頻繁，已啟動冷卻');}
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    const summary=data.content?.find(b=>b.type==='text')?.text||'（摘要生成失敗）';

    // 用摘要取代舊歷史
    G.history=[
      {role:'user',content:`【故事背景摘要】\n${summary}\n\n以上是目前為止的故事摘要，請以此為基礎繼續故事。`},
      {role:'assistant',content:'{"st":"繼續","sl":"'+G.sceneLoc+'","nv":[],"dl":[],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null}'},
      ...toKeep
    ];

    appendEntryToDOM({type:'sys',v:'✦ 故事記憶已整理完成，可繼續遊玩。'});
    saveGame();
    showToast('✦ 記憶整理完成','ok');
  }catch(e){
    if(gated)apiDone();
    appendEntryToDOM({type:'err',v:'記憶整理失敗：'+e.message});
    showToast('整理失敗：'+e.message,'err');
  }
  btn.disabled=false;btn.textContent='✦ 整理記憶（壓縮故事歷史）';
}
function exportSave(){
  const raw=localStorage.getItem(SAVE_KEY);
  if(!raw){showToast('沒有存檔可以匯出','err');return;}
  const encoded=btoa(unescape(encodeURIComponent(raw)));
  const el=document.getElementById('save-io');
  if(el){el.value=encoded;el.select();el.focus();}
  navigator.clipboard.writeText(encoded).then(()=>showToast('✦ 存檔已複製到剪貼簿','ok')).catch(()=>showToast('請手動複製文字框內容','inf'));
}

function importSave(){
  const el=document.getElementById('save-io');
  const encoded=(el?.value||'').trim();
  if(!encoded){showToast('請先貼上存檔文字','err');return;}
  try{
    const raw=decodeURIComponent(escape(atob(encoded)));
    const data=JSON.parse(raw);
    if(!data.storyData&&!data.history)throw new Error('格式不符');
    if(!confirm('確定匯入？目前進度將被覆蓋。'))return;
    localStorage.setItem(SAVE_KEY,raw);
    closeSettings();
    // 重新載入存檔
    if(loadGame()){
      updateGold();
      document.getElementById('story-content').innerHTML='';
      renderStoryFromData();
      markAllDirty();renderBoth(G.activeTab||'party');
      showToast('✦ 存檔匯入成功','ok');
    }
  }catch(e){
    showToast('匯入失敗：文字格式錯誤','err');
  }
}

function closeSettings(){document.getElementById('settings-modal').classList.remove('open');}
async function clearAppCache(){
  closeSettings();
  showToast('🔄 正在清除快取…','inf');
  try{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
    const regs=await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r=>r.unregister()));
    showToast('✓ 快取已清除，正在重新載入…','ok');
    setTimeout(()=>location.reload(true),800);
  }catch(e){
    showToast('清除失敗：'+e.message,'err');
    location.reload(true);
  }
}
function applyCustomPortrait(id){
  const inp=document.getElementById(`port-url-${id}`);
  if(!inp)return;
  const url=inp.value.trim();
  if(url){setCustomPortrait(id,url);showToast(`${PCFG[id]?.label||id} 頭像已更新`,'ok');}
  else{clearPortraitCache(id);showToast(`${PCFG[id]?.label||id} 已重設為預設`,'inf');}
  renderBoth('party');
}
function applySettings(){
  const nk=document.getElementById('s-key').value.trim();
  if(nk){if(!nk.startsWith('sk-ant-')){showToast('金鑰格式不正確','err');return;}CFG.key=nk;document.getElementById('s-key').value='';}
  CFG.model=document.getElementById('s-model').value;
  CFG.tokens=parseInt(document.getElementById('s-tok').value);
  closeSettings();showToast('設定已儲存','ok');
}
async function testConn(){
  const btn=document.getElementById('test-btn'),res=document.getElementById('test-res');
  if(!CFG.key){res.textContent='請先設定金鑰';res.style.color='#f99';return;}
  if(Date.now()<_apiThrottle.backoffUntil){res.textContent='⏳ API 冷卻中';res.style.color='var(--orange)';return;}
  btn.disabled=true;res.textContent='測試中…';res.style.color='var(--sild)';
  let gated=false;
  try{
    await apiGate();gated=true;
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CFG.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:CFG.model,max_tokens:5,messages:[{role:'user',content:'hi'}]})
    });
    apiDone();gated=false;
    if(r.status===429){apiHit429();res.textContent='✗ 請求過於頻繁';res.style.color='var(--orange)';}
    else if(r.ok){res.textContent='✓ 連接成功';res.style.color='var(--grn)';}
    else{const ej=await r.json().catch(()=>({}));res.textContent='✗ '+(ej.error?.message||`HTTP ${r.status}`);res.style.color='#f99';}
  }catch(e){
    if(gated)apiDone();
    if(isCorsErr(e)){res.textContent='✗ CORS 錯誤';res.style.color='#f5b96a';}
    else{res.textContent='✗ 網路錯誤';res.style.color='#f99';}
  }
  btn.disabled=false;
}
function clearEl(id){
  const el=document.getElementById(id);
  if(!el)return;
  while(el.firstChild)el.removeChild(el.firstChild);
}

function resetGame(){
  if(!confirm('確定重置？故事進度將全部清除。'))return;
  try{
    // 1. 清除存檔
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('fate_save_v1');

    // 2. 重設所有狀態
    G.history=[];
    G.storyData=[];
    G.currentChoices=[];
    G.gold={gold:0,silver:8,copper:135};
    G.sceneTitle='序章・Day 1　傍晚';
    G.sceneLoc='📍 鐵霧城・碼頭';
    G.extraParty=[];
    G.extraPcfg={};
    G.partyIds=['alfar','orange'];_partyCache=null;_invalidateCharCache();
    G.thinking=false;
    G.upgrade={};
    G.inv=null;
    G.favor={};
    G.bellyFlipCount=0;
    G.specialOv={};
    G.intel=[];
    G.relics={};
    G.founderClues=[];
    G.orangeStage=0;
    G.starFilter='all';
    G.intelFilter='全部';
    G.log=initLog();

    // 3. 重設星辰
    TIANGANG.slice(1).forEach(s=>{s.status='unknown';s.name='?';delete s.id;});
    DISHAT.slice(1).forEach((s,i)=>{
      if(i===0){s.status='contact';s.name='?';delete s.id;}
      else{s.status='unknown';s.name='?';delete s.id;}
    });

    // 4. 強制清除 DOM（逐子移除，比 innerHTML='' 更可靠）
    clearEl('story-content');
    clearEl('ch-grid');
    const ss=document.getElementById('story-scroll');
    if(ss)ss.scrollTop=0;
    const fr=document.getElementById('free-row');
    if(fr)fr.classList.remove('open');

    // 5. 更新場景與面板
    document.getElementById('scene-title').textContent=G.sceneTitle;
    document.getElementById('scene-loc').textContent=G.sceneLoc;
    updateGold();
    closeSettings();
    renderBoth('party');
    renderBoth('stars');
    renderBoth('log');

    // 6. 重新渲染初始故事
    initStory();

    // 7. 金色閃光確認重置
    const fl=document.createElement('div');
    fl.style.cssText='position:fixed;inset:0;z-index:9999;pointer-events:none;background:rgba(201,168,76,.2);opacity:1;transition:opacity .7s;';
    document.body.appendChild(fl);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      fl.style.opacity='0';
      setTimeout(()=>fl.remove(),750);
    }));

    showToast('✦ 遊戲已重置','ok');
  }catch(e){
    showToast('重置錯誤：'+e.message,'err');
    console.error('resetGame error:',e);
  }
}
function doCopy(id,btnId){
  const t=document.getElementById(id).textContent;
  const btn=document.getElementById(btnId);
  navigator.clipboard.writeText(t).then(()=>{btn.textContent='已複製';btn.classList.add('copied');setTimeout(()=>{btn.textContent='複製';btn.classList.remove('copied');},2000);}).catch(()=>showToast('請手動複製','inf'));
}

// ═══ LAYOUT ═══
function togglePanel(){G.panelOpen=!G.panelOpen;document.getElementById('panel-side').classList.toggle('hidden',!G.panelOpen);document.getElementById('panel-btn').classList.toggle('ac',G.panelOpen);}
function toggleDrawer(){G.drawerOpen=!G.drawerOpen;document.getElementById('drawer').classList.toggle('open',G.drawerOpen);document.getElementById('drawer-ov').classList.toggle('open',G.drawerOpen);}
function closeDrawer(){G.drawerOpen=false;document.getElementById('drawer').classList.remove('open');document.getElementById('drawer-ov').classList.remove('open');}
function applyResp(){const m=window.innerWidth<768;document.getElementById('drawer-btn').style.display=m?'':'none';document.getElementById('panel-btn').style.display=m?'none':'';}

async function syncAll(){
  markAllDirty();
  Object.keys(_renderCache).forEach(k=>delete _renderCache[k]);
  updateGold();updateTimeDisplay();updateShopBtn();
  ['party','stars','inv','quest','intel','log'].forEach(tab=>renderBoth(tab));
  if(G.currentChoices?.length)renderChoices(G.currentChoices,false);
  document.getElementById('scene-title').textContent=G.sceneTitle||'';
  document.getElementById('scene-loc').textContent=G.sceneLoc||'';
  saveGame();
  // 按鈕動畫
  const btn=document.querySelector('button[onclick="syncAll()"]');
  if(btn){btn.style.transition='transform .5s';btn.style.transform='rotate(360deg)';setTimeout(()=>{btn.style.transform='';btn.style.transition='';},500);}
  showToast('✦ 前端已同步，正在校正AI記憶…','inf');
  // ── 向 AI 發送完整狀態快照，讓 AI 校正認知 ──
  if(!CFG.key){showToast('✦ 前端已同步（未設定金鑰，跳過AI校正）','ok');return;}
  try{
    const inv=getInv();
    const partyDetail=allParty().map(m=>{
      const hp=getHP(m.id);const fav=getFavor(m.id);const job=getJob(m.id);
      const eq=inv.equip.filter(e=>e.w===m.name&&e.status==='equipped').map(e=>`${e.slot}:${e.n}`).join(',');
      return `${m.name}(${m.id})/${job||'無職業'}/HP${hp.cur}/${hp.max}${fav!==null?'/好感'+fav:''}${eq?'/裝備:'+eq:''}`;
    }).join('；');
    const itemList=inv.items.map(i=>i.n+(i.q||'')).join(',');
    const questList=(G.quests||[]).filter(q=>q.status==='active').map(q=>q.title).join(',');
    const repList=Object.entries(G.rep).filter(([k,v])=>!k.startsWith('_')&&!k.startsWith('bond')&&v!==0).map(([k,v])=>`${k}:${v}`).join(',');
    const stateMsg=`【系統同步・校正AI記憶】以下為遊戲當前真實狀態，請據此校正你的記憶，然後以當前場景繼續提供選項。
時間：${getTimeContext()}
金幣：金${G.gold.gold}・銀${G.gold.silver}・銅${G.gold.copper}
隊伍：${partyDetail}
道具：${itemList||'無'}
任務：${questList||'無'}
聲望：${repList||'無'}
翻肚累計：${G.bellyFlipCount||0}次
橘子秘密階段：${G.orangeStage||0}/5
場景：${G.sceneTitle} / ${G.sceneLoc}
請確認已校正，然後以JSON格式繼續當前場景並給出3-4個行動選項。`;
    const th=addThink();
    const d=await callAPI(stateMsg);
    th.remove();
    renderResp(d);
    showToast('✦ AI記憶已校正・全部同步完成','ok');
  }catch(e){
    showToast('前端已同步，AI校正失敗：'+e.message,'err');
  }
}
window.addEventListener('resize',applyResp);

// ═══ TOAST ═══
let toastT;
function showToast(msg,type='ok'){const t=document.getElementById('toast');t.textContent=msg;t.className=`toast ${type} show`;clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),3200);t.onclick=()=>{clearTimeout(toastT);t.classList.remove('show');};}

// ═══ SCROLL TOP BTN ═══
(function(){
  const ss=document.getElementById('story-scroll'),btn=document.getElementById('scroll-top-btn');
  if(ss&&btn)ss.addEventListener('scroll',()=>btn.classList.toggle('visible',ss.scrollTop>300));
})();

// ═══ INIT ═══
function initLog(){
  return[
    {sec:'序章・Day1',loc:'城衛隊宿舍前',lines:[{t:'txt',v:'艾爾法收到解僱通知。擅自釋放被扣押糧食。'},{t:'sys',v:'獲得：解僱通知書×1'}]},
    {sec:'序章・Day1',loc:'中央廣場',lines:[{t:'txt',v:'霧刃幫懸賞令：線索50銀、首領5金。'},{t:'sys',v:'代理城主：恩佐·卡羅'}]},
    {sec:'序章・Day1',loc:'港口區・倉庫',lines:[{t:'txt',v:'在葛林倉庫擔任搬運工。'},{t:'sys',v:'獲得：銅幣×80'}]},
  ];
}

function initStory(){
  const c=document.getElementById('story-content');
  c.innerHTML='';
  document.getElementById('story-scroll').scrollTop=0;
  G.storyData=[];

  const opening=[
    // ── 序幕：天象 ──
    {type:'sec',v:'序幕'},
    {type:'narr',v:'帝國曆 1077 年，深秋之夜。聖赫倫帝國末代皇帝駕崩的那個晚上，108 顆流星劃過艾爾薩大陸的天空。沒有人知道這意味著什麼。'},
    {type:'narr',v:'三年後，帝國已成廢墟。十二位總督各據一方稱王，邊境燃起戰火，商路斷絕，盜匪橫行。在這個義人無處容身的時代——'},
    {type:'narr',v:'命運選中了一個最不起眼的人。'},

    // ── Day 1：被解僱 ──
    {type:'sec',v:'序章・逼上梁山　Day 1　清晨'},
    {type:'narr',v:'鐵霧城。霧山聯邦的工業重鎮，終年濃霧不散，空氣裡永遠帶著鐵鏽的味道。這座城市不歡迎理想主義者。'},
    {type:'narr',v:'城衛隊宿舍的門在艾爾法身後關上。她手裡捏著一張紙，銀色的長髮在晨霧中顯得格外冷淡。'},
    {type:'sys',v:'「茲通知：城衛三等雇兵艾爾法，因擅自釋放扣押糧食、干涉稅務官職務，即日解除雇傭，押金沒收。——代理城主 恩佐·卡羅」'},
    {type:'narr',v:'她把通知書疊好，放進口袋。沒有憤怒，沒有委屈。只是那五個孩子的父親跪在地上求她的畫面，還留在眼底。'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
    {type:'sys',v:'〔系統翻譯：你又做了多餘的事。〕'},
    {type:'narr',v:'五枚銅幣買來的布偶貓蹲在腳邊，藍眼睛望著她。這隻貓從不撒嬌，從不示弱，只是一直在那裡。'},
    {type:'dial',sp:'艾爾法😒',ln:'走吧。'},

    // ── Day 1：求生 ──
    {type:'sec',v:'序章　Day 1　上午'},
    {type:'narr',v:'中央廣場。告示欄前擠滿了人——失業的礦工、逃難的農民、找活的傭兵。艾爾法擠到前排，瞇眼看公告。'},
    {type:'sys',v:'【懸賞令】山口劫匪「霧刃幫」，已劫三支商隊。線索賞銀50，首領賞金5。——代理城主 恩佐·卡羅'},
    {type:'sys',v:'【告示】徵募城衛・門檻提高：需持「良民證」及兩名現職城衛擔保。——城衛隊'},
    {type:'narr',v:'良民證。艾爾法摸了摸口袋裡的解僱通知。回去的路已經堵死了。'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
    {type:'sys',v:'〔系統翻譯：別站著了。餓了。〕'},

    // ── Day 1：碼頭 ──
    {type:'sec',v:'序章　Day 1　傍晚'},
    {type:'narr',v:'碼頭區。葛林倉庫。一天的搬運工作結束，艾爾法領到八十枚銅幣——勉強夠兩天的乾糧。'},
    {type:'narr',v:'她坐在碼頭的木樁上，霧在夕陽裡染成暗橙色。橘子蜷在她腳邊，耳朵忽然轉向山口方向。'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
    {type:'sys',v:'〔系統翻譯：山上有人。不止一個。而且——有人在跑。〕'},
    {type:'narr',v:'背後響起腳步聲。戒備的、急促的、帶傷的腳步聲。'},
    {type:'narr',v:'紅髮。左臂繃帶纏到手肘。腰間一把缺口彎刀。眼神是被追殺過的人才有的那種鋒利。她站在三步之外，喘息未平，目光卻穩穩鎖著艾爾法。'},
    {type:'dial',sp:'紅髮女人',ln:'你是今天幫葛林卸貨的那個前城衛？'},
    {type:'dial',sp:'艾爾法😒',ln:'⋯⋯是。'},
    {type:'dial',sp:'紅髮女人',ln:'我需要一個認識山路的人。霧刃幫劫了我的東西——不是錢，是一封信。那封信牽扯到很多人的命。'},
    {type:'narr',v:'她的手在發抖。不是因為冷。'},
    {type:'dial',sp:'紅髮女人',ln:'幫我，我付得起報酬。不幫，就當我沒來過。'},
    {type:'narr',v:'橘子從艾爾法腳邊站起來，走向紅髮女人，在她靴子旁邊繞了一圈。然後坐下，望向艾爾法。'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
    {type:'sys',v:'〔系統翻譯：這個人在說真話。但她沒有說完全部。〕'},
  ];

  opening.forEach(e=>appendEntryToDOM(e));
  G.history=[
    {role:'user',content:'故事開始。場景：鐵霧城碼頭傍晚。艾爾法是被解僱的城衛（因釋放被扣糧食），身邊只有一隻五銅幣買來的布偶貓橘子。一名受傷的紅髮女人找上門，說霧刃幫搶了她一封「牽扯很多人命」的信，她需要認識山路的人幫忙。橘子判斷她「說真話但沒說完全部」。請繼續並給出行動選項。'},
    {role:'assistant',content:'{"st":"序章・逼上梁山 Day 1","sl":"📍 鐵霧城・碼頭","nv":["紅髮女人在等待回答。霧越來越濃，山口方向隱約傳來犬吠——追兵可能不遠。"],"dl":[],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[{"t":"「信裡寫了什麼？先說清楚，我再決定。」","h":"冷靜・可能觸發讀心"},{"t":"「不關我的事。」轉身繼續啃乾糧","h":"冷漠・但橘子可能不同意"},{"t":"拉她蹲進貨箱後面——遠處的犬吠近了","h":"實際・時間緊迫"},{"t":"低頭看橘子。橘子通常比她更清楚該怎麼做","h":"橘子感知・安全選項"}],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null}'}
  ];
  const initChoices=[
    {t:'「信裡寫了什麼？先說清楚，我再決定。」',h:'冷靜・可能觸發讀心'},
    {t:'「不關我的事。」轉身繼續啃乾糧',h:'冷漠・但橘子可能不同意'},
    {t:'拉她蹲進貨箱後面——遠處的犬吠近了',h:'實際・時間緊迫'},
    {t:'低頭看橘子。橘子通常比她更清楚該怎麼做',h:'橘子感知・安全選項'}
  ];
  renderChoices(initChoices);
  saveGame();
}

// 自動戰鬥判定（由 AI cb 欄位觸發）
function autoCombat(cb){
  if(!cb)return;
  // 顯示骰子按鈕
  const db=document.getElementById('dice-btn');
  if(db)db.style.display='';
  // 展開自由行動列（讓玩家看到骰子）
  const fr=document.getElementById('free-row');
  if(fr)fr.classList.add('open');
  const char=getCharData('alfar');
  const statVal=char?.stats[cb.stat]||0;
  const bondBonus=G.rep['_bond_dice_bonus']||0;
  if(bondBonus>0){G.rep['_bond_dice_bonus']=0;appendEntryToDOM({type:'sys',v:`✦ 羈絆加成 +${bondBonus} 生效中`});}
  const autoSuccess=G.rep['_bond_auto_success']||0;
  if(autoSuccess)G.rep['_bond_auto_success']=0;
  const mod=Math.floor(statVal/10)+bondBonus;
  const enemy=cb.enemy||'敵人';
  const diff=cb.difficulty||12;
  appendEntryToDOM({type:'sys',v:`⚔️ 戰鬥判定：${cb.desc||cb.stat+'判定'} ／ 難度 ${diff}`});
  scrollD();
  const animDiv=mk('div','sentry');
  animDiv.innerHTML=`<div class="s-sys" id="dice-anim-box" style="font-size:1.2rem;text-align:center;letter-spacing:.3em;">🎲 ？</div>`;
  document.getElementById('story-content').appendChild(animDiv);scrollD();
  let tick=0;
  const anim=setInterval(()=>{
    const fake=Math.floor(Math.random()*20)+1;
    const box=document.getElementById('dice-anim-box');
    if(box)box.textContent=`🎲 ${fake}`;
    if(++tick>12){
      clearInterval(anim);
      const raw=Math.floor(Math.random()*20)+1;
      const total=raw+mod;
      const success=autoSuccess||total>=diff;
      const crit=raw===20,fumble=raw===1;
      const grade=crit?'大成功！':fumble?'大失敗…':total>=diff+4?'完全成功':success?'成功':total>=diff-3?'失敗':'重大失敗';
      const col=crit?'#f0d060':fumble?'#f06060':success?'#80d080':'#d08060';
      const box2=document.getElementById('dice-anim-box');
      if(box2)box2.innerHTML=`<span style="color:${col};font-size:1.6rem;font-weight:700">${raw}</span><span style="color:var(--sild);font-size:.72rem;"> +${mod}(${cb.stat}) = </span><span style="color:${col};font-weight:700">${total}</span>　<span style="color:${col}">${grade}</span>`;
      appendEntryToDOM({type:'sys',v:`vs ${enemy}（難度${diff}）→ ${success?'✓ 通過':'✗ 失敗'}`});
      // 失敗時自動扣HP
      if(!success){
        const dmgBase=fumble?15:8;
        const dmg=fumble?dmgBase:Math.max(3,dmgBase-Math.floor(mod/2));
        applyHPChange([{id:'alfar',delta:-dmg,reason:`${enemy}攻擊（${grade}）`}]);
      }
      scrollD();saveGame();
      // 顯示戰鬥結果選項，讓玩家決定何時繼續
      const combatMsg=`【骰子判定結果】${cb.desc||''}：投出${raw}，加值+${mod}，合計${total}（難度${diff}）。結果：${grade}。${success?'成功，請依成功後果繼續劇情。':'失敗，請依失敗後果繼續劇情。'}`;
      setTimeout(()=>{
        if(G._heroDown)return; // HP=0 危機劇情優先
        renderChoices(success?[
          {t:'乘勝追擊',h:'趁勢推進'},
          {t:'先確認隊伍狀況',h:'查看面板後再繼續'},
          {t:'搜索戰利品',h:'可能獲得道具或情報'}
        ]:[
          {t:'咬牙撐住',h:'繼續正面應對'},
          {t:'撤退重整',h:'保存實力'},
          {t:'讓同伴掩護',h:'依靠隊友'}
        ]);
        G._pendingCombatMsg=combatMsg;
      },1200);
    }
  },70);
}

// ═══ LOCAL COMBAT (no API needed for basic encounters) ═══
function localCombat(enemyName,difficulty){
  difficulty=difficulty||10;
  const char=getCharData('alfar');
  const statVal=char?.stats['武力']||0;
  const mod=Math.floor(statVal/10);
  const raw=Math.floor(Math.random()*20)+1;
  const total=raw+mod;
  const success=total>=difficulty;
  const crit=raw===20,fumble=raw===1;
  const grade=crit?'大成功！':fumble?'大失敗…':total>=difficulty+4?'完全成功':success?'成功':total>=difficulty-3?'失敗':'重大失敗';
  const col=crit?'#f0d060':fumble?'#f06060':success?'#80d080':'#d08060';
  // 計算傷害
  const baseDmg=success?(crit?Math.floor(difficulty*1.5):Math.floor(difficulty*0.8)):0;
  const takenDmg=success?0:(fumble?15:Math.max(3,8-Math.floor(mod/2)));
  // 獎勵
  const goldReward=success?Math.floor(difficulty*0.5+(crit?difficulty:0)):0;
  const xpReward=success?Math.floor(difficulty*2):Math.floor(difficulty*0.5);
  // 顯示戰鬥動畫
  appendEntryToDOM({type:'sys',v:`⚔️ 遭遇 ${enemyName}！（難度 ${difficulty}）`});
  const animDiv=mk('div','sentry');
  animDiv.innerHTML=`<div class="s-sys" id="lc-anim-box" style="font-size:1.2rem;text-align:center;letter-spacing:.3em;">🎲 ？</div>`;
  document.getElementById('story-content').appendChild(animDiv);scrollD();
  let tick=0;
  const anim=setInterval(()=>{
    const fake=Math.floor(Math.random()*20)+1;
    const box=document.getElementById('lc-anim-box');
    if(box)box.textContent=`🎲 ${fake}`;
    if(++tick>12){
      clearInterval(anim);
      const box2=document.getElementById('lc-anim-box');
      if(box2)box2.innerHTML=`<span style="color:${col};font-size:1.6rem;font-weight:700">${raw}</span><span style="color:var(--sild);font-size:.72rem;"> +${mod}(武力) = </span><span style="color:${col};font-weight:700">${total}</span>　<span style="color:${col}">${grade}</span>`;
      // 結果文字
      if(success){
        appendEntryToDOM({type:'sys',v:`✓ 擊敗 ${enemyName}！獲得 ${goldReward} 銅幣，經驗 +${xpReward}`});
        if(goldReward>0)applyGold({g:0,s:0,c:goldReward});
      }else{
        appendEntryToDOM({type:'sys',v:`✗ ${enemyName} 的攻擊命中！受到 ${takenDmg} 點傷害`});
        applyHPChange([{id:'alfar',delta:-takenDmg,reason:`${enemyName}攻擊（${grade}）`}]);
      }
      scrollD();saveGame();
      // 呼叫 AI 進行敘事延續
      setTimeout(()=>{
        const msg=`【本地戰鬥結果】遭遇${enemyName}（難度${difficulty}）：投出${raw}+${mod}=${total}，${grade}。${success?`擊敗敵人，獲得${goldReward}銅幣。請簡短描述戰後情況並繼續劇情。`:`受到${takenDmg}傷害。請簡短描述受傷情況並繼續劇情。`}`;
        sendChoice(msg);
      },1500);
    }
  },70);
}

// ═══ EQUIPMENT UPGRADE ═══
// ═══ EQUIPMENT ENHANCEMENT (+1~+20) ═══

// 取得強化後的加成數值
function getEnhancedBonus(item){
  if(!item.bonus)return item.bonus||{};
  const lv=item.enhance||0;
  if(lv===0)return item.bonus;
  const result={...item.bonus};
  // 每級加成 = ceil(該素質基礎值 / 8)，每個非零素質都成長
  Object.keys(result).forEach(stat=>{
    if(result[stat]>0){
      result[stat]+=lv*Math.max(1,Math.ceil(result[stat]/8));
    }
  });
  return result;
}

// 強化成本：(當前等級+1) × 3 銀
function enhanceCost(lv){return(lv+1)*3;}

function upgradeEquip(id,slot){
  const c=getCharData(id);if(!c)return;
  const inv=getInv();
  // 找到對應裝備
  const eqItem=inv.equip.find(e=>e.w===c.name&&e.slot===slot&&e.status==='equipped');
  if(!eqItem){showToast('找不到裝備中的'+slot,'err');return;}
  const curLv=eqItem.enhance||0;
  if(curLv>=20){showToast('已達最高強化 +20','inf');return;}
  const cost=enhanceCost(curLv);
  if(G.gold.silver<cost&&G.gold.gold<1){showToast(`銀幣不足（需${cost}銀）`,'err');return;}
  applyGold({g:0,s:-cost,c:0});
  eqItem.enhance=(curLv+1);
  // 重新計算本次強化後的加成量
  const prev=getEnhancedBonus({bonus:eqItem.bonus,enhance:curLv});
  const next=getEnhancedBonus(eqItem);
  const diff=Object.entries(next).filter(([s,v])=>v>0).map(([s,v])=>`${s}+${v}`).join(' ');
  appendEntryToDOM({type:'sys',v:`✦ 強化成功！${eqItem.n} [+${eqItem.enhance}] → ${diff}（消耗${cost}銀）`});
  renderChanged('party','inv');saveGame();scrollD();
}

// ═══ DICE SYSTEM ═══
const STAT_MAP={武力:'物理攻擊・力量判定',知力:'魔法・謀略・察覺判定',統率:'士氣・指揮・恐嚇判定',魅力:'說服・欺騙・交涉判定',幸運:'機率・閃避・意外判定'};
let _diceState={charId:'alfar',stat:'武力',rolled:false,result:null};

function openDiceModal(){
  _diceState={charId:'alfar',stat:'武力',rolled:false,result:null};
  document.getElementById('dice-modal').classList.add('open');
  document.getElementById('confirm-dice-btn').style.display='none';
  document.getElementById('roll-btn').style.display='';
  renderDiceModal();
}
function closeDiceModal(){document.getElementById('dice-modal').classList.remove('open');}

function renderDiceModal(){
  const party=allParty().filter(m=>m.id!=='orange');
  // 角色選擇
  document.getElementById('dice-char-select').innerHTML=`<div style="font-size:.65rem;color:var(--sild);margin-bottom:.35rem;">使用角色</div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;">
    ${party.map(c=>`<button onclick="_diceState.charId='${c.id}';renderDiceModal()" style="font-size:.68rem;padding:.25rem .55rem;background:${_diceState.charId===c.id?'rgba(201,168,76,.2)':'transparent'};border:1px solid ${_diceState.charId===c.id?'rgba(201,168,76,.6)':'var(--brd)'};border-radius:3px;color:${_diceState.charId===c.id?'var(--gold)':'var(--sild)'};cursor:pointer;font-family:'Noto Serif TC',serif;">${c.emoji} ${c.name}</button>`).join('')}
    </div>`;
  // 素質選擇
  const c=getCharData(_diceState.charId);
  document.getElementById('dice-stat-select').innerHTML=`<div style="font-size:.65rem;color:var(--sild);margin-bottom:.35rem;">判定素質</div>
    <div style="display:flex;gap:.3rem;flex-wrap:wrap;">
    ${Object.entries(STAT_MAP).map(([s,desc])=>{
      const v=c?.stats[s];if(v===null)return'';
      const mod=Math.floor((v||0)/10);
      return`<button onclick="_diceState.stat='${s}';renderDiceModal()" style="font-size:.65rem;padding:.22rem .5rem;background:${_diceState.stat===s?'rgba(201,168,76,.18)':'transparent'};border:1px solid ${_diceState.stat===s?'rgba(201,168,76,.5)':'var(--brd)'};border-radius:3px;color:${_diceState.stat===s?'var(--gold)':'var(--sild)'};cursor:pointer;font-family:'Noto Serif TC',serif;" title="${desc}">${s} ${v} (+${mod})</button>`;
    }).join('')}
    </div>`;
  // 結果區域清空（若未投）
  if(!_diceState.rolled){
    const c2=getCharData(_diceState.charId);
    const v=c2?.stats[_diceState.stat]||0;
    const mod=Math.floor(v/10);
    document.getElementById('dice-result').innerHTML=`<div style="text-align:center;color:var(--sild);font-size:.72rem;">d20 + ${_diceState.stat}(${v}) 加值 +${mod}<br><span style="font-size:.62rem;opacity:.6">${STAT_MAP[_diceState.stat]||''}</span></div>`;
  }
}

function rollDice(){
  const c=getCharData(_diceState.charId);if(!c)return;
  const statVal=c.stats[_diceState.stat]||0;
  const mod=Math.floor(statVal/10);
  const raw=Math.floor(Math.random()*20)+1;
  const total=raw+mod;
  _diceState.rolled=true;
  _diceState.result={raw,mod,total,charName:c.name,stat:_diceState.stat,statVal};

  let grade,color,flavor;
  if(raw===20){grade='大成功！';color='#f0d060';flavor='命運眷顧於你。';}
  else if(raw===1){grade='大失敗…';color='#f06060';flavor='諸事不宜，還是回家吧。';}
  else if(total>=18){grade='成功';color='#80d080';flavor='穩健的判斷。';}
  else if(total>=12){grade='普通';color='#c0c080';flavor='勉強過關。';}
  else if(total>=7){grade='失敗';color='#d08060';flavor='差了一點。';}
  else{grade='重大失敗';color='#f06060';flavor='事態比預期糟糕。';}

  // 骰子動畫
  let count=0;
  const r=document.getElementById('dice-result');
  const anim=setInterval(()=>{
    const fake=Math.floor(Math.random()*20)+1;
    r.innerHTML=`<div style="text-align:center"><div style="font-size:2.5rem;color:var(--gold)">${fake}</div></div>`;
    if(++count>10){
      clearInterval(anim);
      r.innerHTML=`<div style="text-align:center;line-height:1.7">
        <div style="font-size:2.8rem;color:${color};font-weight:700">${raw}</div>
        <div style="font-size:.75rem;color:var(--sild)">d20 基礎</div>
        <div style="font-size:.8rem;color:var(--sil);margin:.2rem 0">+${mod} (${_diceState.stat} ${statVal}) = <span style="color:${color};font-weight:700">${total}</span></div>
        <div style="font-size:.82rem;color:${color};font-weight:600">${grade}</div>
        <div style="font-size:.65rem;color:var(--sild)">${flavor}</div>
      </div>`;
      document.getElementById('confirm-dice-btn').style.display='';
    }
  },60);
}

function confirmDiceResult(){
  if(!_diceState.result)return;
  const r=_diceState.result;
  closeDiceModal();
  const gradeTxt=r.raw===20?'大成功':r.raw===1?'大失敗':r.total>=18?'成功':r.total>=12?'普通':r.total>=7?'失敗':'重大失敗';
  const ctx=`【素質判定】${r.charName} 進行${r.stat}判定：擲出 ${r.raw}（+${r.mod}加值）＝ ${r.total}，結果：${gradeTxt}。請依此判定結果繼續推進劇情。`;
  appendEntryToDOM({type:'sys',v:`🎲 ${r.charName} ${r.stat}判定：${r.raw}+${r.mod}=${r.total}（${gradeTxt}）`});
  scrollD();
  sendChoice(ctx);
}
// 王國/領地
const KINGDOMS=[
  {id:'fog_mt',name:'霧山聯邦',color:'rgba(80,100,140,.18)',stroke:'rgba(100,130,180,.3)',path:'M40 70 Q80 30 190 55 Q240 50 260 85 Q245 150 225 200 Q210 245 185 265 Q150 290 100 270 Q60 250 45 210 Q30 170 35 120 Z'},
  {id:'central',name:'中央王國',color:'rgba(140,120,60,.15)',stroke:'rgba(180,160,80,.25)',path:'M260 55 Q340 35 430 60 Q470 75 478 120 Q485 165 465 205 Q445 245 405 275 Q365 295 315 290 Q265 283 245 255 Q225 225 228 185 Q232 140 248 105 Z'},
  {id:'east_sea',name:'東海王國',color:'rgba(40,100,120,.18)',stroke:'rgba(60,140,160,.3)',path:'M470 70 Q520 48 565 62 Q595 82 600 135 Q605 195 590 245 Q575 285 550 305 Q515 325 485 305 Q460 280 452 245 Q445 205 450 165 Q453 115 462 88 Z'},
  {id:'forest',name:'翠林域',color:'rgba(30,100,50,.2)',stroke:'rgba(40,130,60,.3)',path:'M235 35 Q275 15 345 25 Q385 30 395 60 Q375 88 335 98 Q295 105 265 92 Q242 78 238 55 Z'},
  {id:'wasteland',name:'南荒',color:'rgba(100,60,40,.15)',stroke:'rgba(130,80,50,.25)',path:'M275 285 Q345 275 420 285 Q460 295 470 335 Q455 370 410 382 Q355 392 300 378 Q260 362 262 330 Z'},
  {id:'north_ice',name:'霜嶺',color:'rgba(140,160,180,.12)',stroke:'rgba(160,180,200,.2)',path:'M60 25 Q120 10 200 18 Q240 22 235 45 Q220 60 180 55 Q120 48 80 50 Q50 48 48 35 Z'},
  {id:'shadow_marsh',name:'影沼地',color:'rgba(50,40,60,.2)',stroke:'rgba(80,60,100,.25)',path:'M100 270 Q130 290 155 310 Q170 340 160 365 Q140 380 110 375 Q75 360 60 335 Q50 310 60 290 Q75 275 90 272 Z'},
];

// 城市資料（16座城市）
const MAP_CITIES={
  // ═══ 霧山聯邦 ═══
  iron_fog:{name:'鐵霧城',cx:175,cy:215,size:7,kingdom:'fog_mt',desc:'霧山聯邦工業重城，終年霧不散。代理城主：恩佐·卡羅。',keywords:['鐵霧城'],
    pois:[{name:'港口區・倉庫',icon:'⚓',type:'port',x:110,y:265,desc:'葛林的倉庫，可接搬運工作。'},{name:'中央廣場',icon:'📋',type:'plaza',x:200,y:178,desc:'公告欄，懸賞令張貼處。'},{name:'城衛隊本部',icon:'🛡️',type:'guard',x:295,y:148,desc:'代理城主恩佐駐守。'},{name:'鐵鎚旅館',icon:'🍺',type:'inn',x:158,y:150,desc:'休息・打聽情報・補給。'},{name:'武器修繕鋪',icon:'⚒️',type:'shop',x:255,y:245,desc:'裝備維修・輕型武器。'},{name:'雜貨商行',icon:'🎒',type:'shop',x:328,y:218,desc:'乾糧・繃帶・基本補給。'},{name:'霧山驛站',icon:'🐎',type:'waystation',x:225,y:310,desc:'可購買驛馬前往其他城市。',waystation:true},{name:'霧刃幫據點',icon:'⚠️',type:'danger',x:385,y:290,desc:'山口附近活動，位置不確定。'}]},
  iron_crown:{name:'鐵冠城',cx:120,cy:120,size:5,kingdom:'fog_mt',desc:'霧山聯邦北方要塞，守備嚴密，礦脈豐富。',keywords:['鐵冠城'],
    pois:[{name:'要塞城門',icon:'🏰',type:'guard',x:200,y:160,desc:'戒備森嚴，需通關令。'},{name:'礦工聚落',icon:'⛏️',type:'district',x:300,y:240,desc:'採礦工人居住區。'},{name:'北驛',icon:'🐎',type:'waystation',x:370,y:170,desc:'前往鐵霧城或銀月城。',waystation:true}]},
  grey_haven:{name:'灰港鎮',cx:90,cy:185,size:4,kingdom:'fog_mt',desc:'霧山聯邦西端漁港，海霧終年不散，走私猖獗。',keywords:['灰港'],
    pois:[{name:'漁市場',icon:'🐟',type:'shop',x:180,y:180,desc:'鮮魚・海產・漁民消息。'},{name:'走私碼頭',icon:'🤫',type:'danger',x:320,y:260,desc:'夜間才開放，危險但有奇貨。'},{name:'灰港客棧',icon:'🍺',type:'inn',x:250,y:200,desc:'漁民與水手聚集。'}]},
  // ═══ 中央王國 ═══
  silver_moon:{name:'銀月城',cx:340,cy:148,size:8,kingdom:'central',desc:'中央王國最大商業都市，各路英雄匯聚，情報市場繁盛。',keywords:['銀月城'],
    pois:[{name:'月橋商街',icon:'🏪',type:'shop',x:160,y:170,desc:'各類商品・稀有道具。'},{name:'英雄公會',icon:'⚔️',type:'guild',x:250,y:230,desc:'任務・懸賞・傭兵招募。'},{name:'銀月旅館',icon:'🍺',type:'inn',x:340,y:155,desc:'高級旅館。'},{name:'中央驛站',icon:'🐎',type:'waystation',x:430,y:195,desc:'四通八達。',waystation:true},{name:'星象館',icon:'🔭',type:'special',x:310,y:290,desc:'古老星象機構，與108星辰有關聯。'}]},
  rust_city:{name:'鏽城',cx:360,cy:255,size:6,kingdom:'central',desc:'前帝都廢墟，帝國崩裂後百廢待興。',keywords:['鏽城','廢都'],
    pois:[{name:'廢墟廣場',icon:'🏚️',type:'ruins',x:200,y:165,desc:'帝都昔日中心。'},{name:'殘黨據點',icon:'⚠️',type:'danger',x:350,y:220,desc:'帝國殘黨盤據。'},{name:'地下遺跡',icon:'🕳️',type:'special',x:290,y:295,desc:'古代機關，未知寶藏。'},{name:'廢都驛',icon:'🐎',type:'waystation',x:150,y:250,desc:'破舊但仍運作。',waystation:true}]},
  golden_bridge:{name:'金橋城',cx:400,cy:178,size:5,kingdom:'central',desc:'中央王國東部商貿樞紐，連接東海與內陸的咽喉。',keywords:['金橋城','金橋'],
    pois:[{name:'大橋市集',icon:'🏪',type:'shop',x:200,y:180,desc:'東西貨物交匯，物價公道。'},{name:'稅務署',icon:'📜',type:'guard',x:300,y:230,desc:'中央王國稅收重地。'},{name:'金橋驛',icon:'🐎',type:'waystation',x:380,y:170,desc:'前往銀月城或東港城。',waystation:true}]},
  crown_peak:{name:'王冠峰',cx:290,cy:105,size:4,kingdom:'central',desc:'中央王國北境要塞，俯瞰翠林域與霧山聯邦交界。',keywords:['王冠峰'],
    pois:[{name:'瞭望塔',icon:'🗼',type:'guard',x:250,y:180,desc:'可遠眺三國邊境。'},{name:'邊境商隊營地',icon:'🏕️',type:'shop',x:350,y:240,desc:'來往商隊補給站。'}]},
  // ═══ 東海王國 ═══
  east_port:{name:'東港城',cx:510,cy:155,size:7,kingdom:'east_sea',desc:'東海王國大港，海貿繁盛，情報人員眾多。',keywords:['東港城'],
    pois:[{name:'東港碼頭',icon:'⚓',type:'port',x:420,y:275,desc:'大型商港，可搭船。'},{name:'商人公會',icon:'💰',type:'guild',x:215,y:175,desc:'情報・任務・走私線索。'},{name:'海鷗旅館',icon:'🍺',type:'inn',x:175,y:240,desc:'各路人馬聚集。'},{name:'武器鋪・波浪',icon:'⚔️',type:'shop',x:305,y:205,desc:'海軍規格武器。'},{name:'東港驛站',icon:'🐎',type:'waystation',x:385,y:155,desc:'前往銀月城或霧海關。',waystation:true},{name:'情報屋',icon:'🕵️',type:'special',x:290,y:290,desc:'地下情報網。'}]},
  fog_sea_pass:{name:'霧海關',cx:545,cy:248,size:5,kingdom:'east_sea',desc:'東海王國南端要塞，控制海上航路。',keywords:['霧海關'],
    pois:[{name:'關卡城門',icon:'🚧',type:'guard',x:200,y:155,desc:'嚴格盤查，需通行證。'},{name:'走私商人',icon:'🤫',type:'special',x:310,y:245,desc:'黑市交易。'},{name:'南海驛',icon:'🐎',type:'waystation',x:380,y:195,desc:'前往東港城或南方。',waystation:true}]},
  coral_bay:{name:'珊瑚灣',cx:555,cy:180,size:4,kingdom:'east_sea',desc:'東海王國漁村，盛產珊瑚與珍珠，海盜出沒。',keywords:['珊瑚灣'],
    pois:[{name:'珊瑚市場',icon:'🐚',type:'shop',x:220,y:200,desc:'珊瑚・珍珠・海產品。'},{name:'海盜暗礁',icon:'🏴‍☠️',type:'danger',x:350,y:270,desc:'海盜藏身處。'}]},
  // ═══ 翠林域 ═══
  jade_forest:{name:'翠林城',cx:290,cy:65,size:5,kingdom:'forest',desc:'翠林域精靈聚居地，外人不易進入。',keywords:['翠林城','翠林'],
    pois:[{name:'世界樹廣場',icon:'🌳',type:'special',x:250,y:180,desc:'古老精靈議會所在。'},{name:'藥草市集',icon:'🌿',type:'shop',x:350,y:245,desc:'稀有藥草・精靈特產。'},{name:'林間驛',icon:'🐎',type:'waystation',x:160,y:210,desc:'需取得通行許可。',waystation:true}]},
  elder_grove:{name:'古樹隱村',cx:335,cy:48,size:3,kingdom:'forest',desc:'翠林深處的隱匿聚落，居住著最古老的森民與隱士。',keywords:['古樹隱村','隱村'],
    pois:[{name:'長老之廳',icon:'🧙',type:'special',x:260,y:200,desc:'古老智慧的守護者。'},{name:'禁忌書庫',icon:'📚',type:'special',x:350,y:250,desc:'收藏帝國時代的禁書。'}]},
  // ═══ 南荒 ═══
  dragon_valley:{name:'龍牙砦',cx:415,cy:328,size:5,kingdom:'wasteland',desc:'南荒廢棄要塞，尋寶者與亡命之徒聚集。',keywords:['龍牙砦','龍谷'],
    pois:[{name:'亡命者營地',icon:'🔥',type:'danger',x:215,y:180,desc:'強者為王。'},{name:'古龍遺跡',icon:'🐉',type:'special',x:320,y:250,desc:'古代龍族寶庫。'},{name:'廢砦驛',icon:'🐎',type:'waystation',x:380,y:155,desc:'破舊驛站。',waystation:true}]},
  sand_gate:{name:'沙門城',cx:320,cy:340,size:4,kingdom:'wasteland',desc:'南荒北境的關城，是進入荒野的最後補給站。',keywords:['沙門城','沙門'],
    pois:[{name:'最後補給站',icon:'🎒',type:'shop',x:220,y:190,desc:'南荒專用補給品。'},{name:'沙門酒館',icon:'🍺',type:'inn',x:310,y:240,desc:'冒險者情報交換。'},{name:'沙門驛',icon:'🐎',type:'waystation',x:380,y:180,desc:'前往龍牙砦或鏽城。',waystation:true}]},
  // ═══ 霜嶺 ═══
  frost_keep:{name:'霜守堡',cx:150,cy:38,size:4,kingdom:'north_ice',desc:'北方極寒之地的孤堡，帝國時代的邊防遺址，現由流亡騎士團駐守。',keywords:['霜守堡','霜嶺'],
    pois:[{name:'騎士團營房',icon:'🛡️',type:'guard',x:220,y:180,desc:'流亡騎士團，紀律嚴明。'},{name:'冰窖倉庫',icon:'❄️',type:'shop',x:320,y:230,desc:'寒帶特產・皮毛・凍肉。'},{name:'霜嶺驛',icon:'🐎',type:'waystation',x:380,y:200,desc:'前往鐵冠城。條件惡劣。',waystation:true}]},
  // ═══ 影沼地 ═══
  shadow_marsh:{name:'影沼鎮',cx:115,cy:310,size:4,kingdom:'shadow_marsh',desc:'西南沼澤中的隱秘聚落，瘴氣瀰漫，藥師與亡命之徒藏身於此。',keywords:['影沼鎮','影沼'],
    pois:[{name:'沼澤藥鋪',icon:'🧪',type:'shop',x:220,y:190,desc:'稀有毒藥與解藥。'},{name:'暗渡口',icon:'🛶',type:'special',x:320,y:260,desc:'通往不為人知的水路。'},{name:'影沼驛',icon:'🐎',type:'waystation',x:360,y:180,desc:'前往鐵霧城或灰港鎮。',waystation:true}]},
};

// 驛站連線（城市間可通行的路線）
const CITY_ROUTES=[
  // 霧山聯邦內部
  ['iron_fog','iron_crown'],['iron_fog','grey_haven'],['grey_haven','shadow_marsh'],
  // 霧山→中央
  ['iron_fog','silver_moon'],['iron_crown','crown_peak'],['iron_crown','silver_moon'],
  // 中央王國內部
  ['silver_moon','crown_peak'],['silver_moon','golden_bridge'],['silver_moon','rust_city'],['golden_bridge','rust_city'],
  // 中央→東海
  ['golden_bridge','east_port'],['silver_moon','east_port'],
  // 東海王國內部
  ['east_port','fog_sea_pass'],['east_port','coral_bay'],['coral_bay','fog_sea_pass'],
  // 翠林域
  ['silver_moon','jade_forest'],['crown_peak','jade_forest'],['jade_forest','elder_grove'],
  // 南荒
  ['rust_city','sand_gate'],['sand_gate','dragon_valley'],['fog_sea_pass','dragon_valley'],
  // 霜嶺
  ['iron_crown','frost_keep'],
  // 影沼
  ['iron_fog','shadow_marsh'],['shadow_marsh','sand_gate'],
];

// 偵測當前所在城市
function detectCity(){
  const loc=(G.sceneLoc||'').replace('📍 ','');
  const title=G.sceneTitle||'';
  for(const [id,city] of Object.entries(MAP_CITIES)){
    if(city.keywords.some(k=>loc.includes(k)||title.includes(k)))return id;
  }
  return 'iron_fog';
}

// 判斷是否可以長途移動
function canTravel(){
  const transports=['馬匹','驛馬','馬車','船票','通行令','驛站令牌'];
  const inv=getInv();
  if(inv&&inv.items&&inv.items.some(i=>transports.some(t=>i.n.includes(t))))
    return{can:true,reason:'持有交通工具'};
  if(G.atWayStation)return{can:true,reason:'位於驛站'};
  return{can:false,reason:'需前往驛站或取得交通工具（馬匹・驛站令牌等）'};
}

// 執行移動
function doTravel(cityId){
  const city=MAP_CITIES[cityId];
  if(!city)return;
  const travel=canTravel();
  if(!travel.can){showToast(travel.reason,'err');return;}
  closeMap();
  G.sceneLoc='📍 '+city.name;
  G.sceneTitle=G.sceneTitle.replace(/・.*/,'')+' 途中';
  G.atWayStation=false;
  document.getElementById('scene-title').textContent=G.sceneTitle;
  document.getElementById('scene-loc').textContent=G.sceneLoc;
  advanceTime(3); // 移動消耗時間
  appendEntryToDOM({type:'narr',v:`艾爾法踏上前往${city.name}的路途，${G.time?HOUR_LABEL[G.time.hour]+'時分，':''}橘子蜷縮在背包頂端，不發一語。`});
  appendEntryToDOM({type:'sys',v:`📍 已抵達 ${city.name}`});
  // 提供抵達後的即時選項（不需要等 AI 回應）
  const arrivalChoices=[
    {t:'環顧四周，確認地形',h:''},
    {t:'尋找落腳處',h:''},
    {t:'打聽當地情報',h:''},
    {t:'前往市集',h:''},
  ];
  renderChoices(arrivalChoices);
  G.history.push({role:'user',content:`【抵達${city.name}】`});
  G.history.push({role:'assistant',content:`{"st":"抵達${city.name}","sl":"📍 ${city.name}","nv":["艾爾法抵達${city.name}。"],"dl":[],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[{"t":"環顧四周，確認地形","h":""},{"t":"尋找落腳處","h":""},{"t":"打聽當地情報","h":""},{"t":"前往市集","h":""}],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null}`});
  scrollD();
  saveGame();
}

// 地圖開啟/關閉
function openMap(){
  renderContinentMap();
  document.getElementById('map-modal').classList.add('open');
}
function closeMap(){
  document.getElementById('map-modal').classList.remove('open');
}

// 大陸地圖
function renderContinentMap(){
  const curId=detectCity();
  const cur=MAP_CITIES[curId];
  document.getElementById('map-breadcrumb').textContent='艾爾薩大陸';
  document.getElementById('map-info').style.display='none';
  const container=document.getElementById('map-container');
  container.style.height='450px';

  const mapPrompt=encodeURIComponent('fantasy continent map, dark parchment style, top-down view, medieval cartography, kingdoms and forests and mountains, dark moody colors, no text, no labels, game map style');
  const mapUrl=`https://image.pollinations.ai/prompt/${mapPrompt}?width=960&height=600&seed=42&nologo=true`;

  const cityCircles=Object.entries(MAP_CITIES).map(([id,c])=>{
    const isCur=id===curId;
    const col=isCur?'#c9a84c':'#8a8070';
    const r=isCur?5:3.5;
    return`<g class="city-dot" data-city="${id}" style="cursor:pointer">
      ${isCur?`<circle cx="${c.cx}" cy="${c.cy}" r="14" fill="none" stroke="rgba(201,168,76,.35)" stroke-width=".6" stroke-dasharray="2,2"><animate attributeName="r" values="12;16;12" dur="3s" repeatCount="indefinite"/></circle>`:''}
      <circle cx="${c.cx}" cy="${c.cy}" r="${r+2}" fill="rgba(0,0,0,.5)"/>
      <circle cx="${c.cx}" cy="${c.cy}" r="${r}" fill="${col}" opacity=".9">
        ${isCur?'<animate attributeName="opacity" values=".7;1;.7" dur="2s" repeatCount="indefinite"/>':''}
      </circle>
      <text x="${c.cx}" y="${c.cy+14}" text-anchor="middle" font-size="${isCur?10:8.5}" fill="${col}" font-family="serif" font-weight="${isCur?'700':'400'}" stroke="rgba(0,0,0,.7)" stroke-width="2.5" paint-order="stroke">${c.name}</text>
      ${isCur?`<text x="${c.cx}" y="${c.cy+24}" text-anchor="middle" font-size="7" fill="rgba(201,168,76,.6)" font-family="sans-serif" stroke="rgba(0,0,0,.6)" stroke-width="2" paint-order="stroke">◉ 所在地</text>`:''}
      <rect x="${c.cx-30}" y="${c.cy-15}" width="60" height="45" fill="transparent"/>
    </g>`;
  }).join('');

  const routes=CITY_ROUTES.map(([a,b])=>{
    const ca=MAP_CITIES[a],cb=MAP_CITIES[b];
    if(!ca||!cb)return'';
    const mx=(ca.cx+cb.cx)/2+((Math.random()-.5)*20),my=(ca.cy+cb.cy)/2+((Math.random()-.5)*15);
    return`<path d="M${ca.cx} ${ca.cy} Q${mx.toFixed(0)} ${my.toFixed(0)} ${cb.cx} ${cb.cy}" stroke="rgba(201,168,76,.15)" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-dasharray="4,6"/>`;
  }).join('');

  const svgContinent=`<svg viewBox="0 0 640 400" width="100%" height="450" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:block">
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <!-- Pollinations AI 背景 -->
  <rect width="640" height="400" fill="#080e18"/>
  <image href="${mapUrl}" x="0" y="0" width="640" height="400" preserveAspectRatio="xMidYMid slice" opacity=".85"/>
  <!-- 半透明遮罩讓標記更清晰 -->
  <rect width="640" height="400" fill="rgba(8,14,24,.25)"/>
  <!-- 道路 -->
  ${routes}
  <!-- 城市 -->
  ${cityCircles}
  <!-- 王國名稱 -->
  <text x="125" y="265" text-anchor="middle" font-size="9" fill="rgba(120,140,180,.4)" font-family="serif" letter-spacing="3" stroke="rgba(0,0,0,.6)" stroke-width="2.5" paint-order="stroke">霧山聯邦</text>
  <text x="345" y="190" text-anchor="middle" font-size="9" fill="rgba(180,160,80,.35)" font-family="serif" letter-spacing="3" stroke="rgba(0,0,0,.6)" stroke-width="2.5" paint-order="stroke">中央王國</text>
  <text x="520" y="140" text-anchor="middle" font-size="9" fill="rgba(60,140,160,.35)" font-family="serif" letter-spacing="3" stroke="rgba(0,0,0,.6)" stroke-width="2.5" paint-order="stroke">東海王國</text>
  <text x="275" y="52" text-anchor="middle" font-size="8" fill="rgba(40,130,60,.4)" font-family="serif" letter-spacing="2" stroke="rgba(0,0,0,.5)" stroke-width="2" paint-order="stroke">翠林域</text>
  <text x="380" y="358" text-anchor="middle" font-size="9" fill="rgba(130,80,50,.35)" font-family="serif" letter-spacing="3" stroke="rgba(0,0,0,.6)" stroke-width="2.5" paint-order="stroke">南　荒</text>
  <text x="140" y="35" text-anchor="middle" font-size="7.5" fill="rgba(160,180,200,.3)" font-family="serif" letter-spacing="2" stroke="rgba(0,0,0,.5)" stroke-width="2" paint-order="stroke">霜　嶺</text>
  <text x="108" y="330" text-anchor="middle" font-size="7.5" fill="rgba(80,60,100,.3)" font-family="serif" letter-spacing="2" stroke="rgba(0,0,0,.5)" stroke-width="2" paint-order="stroke">影沼地</text>
  <!-- 標題框 -->
  <g transform="translate(320,18)">
    <rect x="-65" y="-10" width="130" height="18" rx="2" fill="rgba(0,0,0,.5)" stroke="rgba(201,168,76,.25)" stroke-width=".5"/>
    <text x="0" y="3" text-anchor="middle" font-size="11" fill="rgba(201,168,76,.6)" font-family="serif" letter-spacing="4">艾爾薩大陸</text>
  </g>
  <text x="320" y="393" text-anchor="middle" font-size="7.5" fill="rgba(100,100,80,.35)" font-family="sans-serif" stroke="rgba(0,0,0,.5)" stroke-width="2" paint-order="stroke">點擊城市查看區域 · 黃色為當前位置</text>
  <!-- 羅盤 -->
  <g transform="translate(608,40)">
    <circle cx="0" cy="0" r="18" fill="rgba(0,0,0,.6)" stroke="rgba(201,168,76,.3)" stroke-width=".8"/>
    <circle cx="0" cy="0" r="14" fill="none" stroke="rgba(201,168,76,.15)" stroke-width=".4"/>
    <path d="M0 -14 L2 -2 L0 2 L-2 -2Z" fill="rgba(201,168,76,.7)"/>
    <path d="M0 14 L2 2 L0 -2 L-2 2Z" fill="rgba(120,100,60,.4)"/>
    <text x="0" y="-6" text-anchor="middle" font-size="6.5" fill="rgba(201,168,76,.7)" font-family="serif" font-weight="600">N</text>
    <text x="0" y="12" text-anchor="middle" font-size="5.5" fill="rgba(201,168,76,.35)" font-family="serif">S</text>
    <text x="-9" y="3" text-anchor="middle" font-size="5.5" fill="rgba(201,168,76,.35)" font-family="serif">W</text>
    <text x="9" y="3" text-anchor="middle" font-size="5.5" fill="rgba(201,168,76,.35)" font-family="serif">E</text>
  </g>
</svg>`;
  // 先顯示 loading placeholder，再插入 SVG
  container.innerHTML=`<div class="map-bg-loading" id="map-loading"><div class="port-spin"></div><div class="port-txt">地圖繪製中…</div></div>`;
  const tmpImg=new Image();
  tmpImg.onload=()=>{document.getElementById('map-loading')?.remove();container.innerHTML=svgContinent;bindMapCityEvents(container);};
  tmpImg.onerror=()=>{document.getElementById('map-loading')?.remove();container.innerHTML=svgContinent;bindMapCityEvents(container);};
  tmpImg.src=mapUrl;
  // 超時 fallback：8 秒後若仍在 loading 就直接顯示 SVG（圖片會在 SVG 內繼續載入）
  setTimeout(()=>{if(document.getElementById('map-loading')){document.getElementById('map-loading').remove();container.innerHTML=svgContinent;bindMapCityEvents(container);}},8000);
}
function bindMapCityEvents(container){
  container.querySelectorAll('[data-city]').forEach(el=>{
    el.addEventListener('click',function(e){e.stopPropagation();showCityPanel(this.dataset.city);});
  });
}

// 大陸地圖：點城市後顯示資訊面板
function showCityPanel(cityId){
  const city=MAP_CITIES[cityId];
  if(!city)return;
  const curId=detectCity();
  const travel=canTravel();
  const isCur=cityId===curId;
  const info=document.getElementById('map-info');
  info.style.display='block';
  info.innerHTML=`<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.8rem;">
    <div style="flex:1">
      <div style="font-size:.82rem;color:var(--gold);font-weight:600;margin-bottom:.2rem">${city.name}
        ${isCur?'<span style="font-size:.65rem;color:rgba(201,168,76,.55);margin-left:.4rem">◉ 當前位置</span>':''}
      </div>
      <div style="font-size:.68rem;color:var(--sild);line-height:1.5;margin-bottom:.35rem">${city.desc}</div>
      ${isCur?`<button onclick="renderRegionMap('${cityId}')" style="font-size:.68rem;padding:.25rem .6rem;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.4);border-radius:3px;color:var(--gold);cursor:pointer;font-family:'Noto Serif TC',serif;">🗺 查看區域地圖</button>`:
      `<button onclick="doTravel('${cityId}')" style="font-size:.68rem;padding:.25rem .7rem;background:${travel.can?'rgba(201,168,76,.15)':'rgba(80,80,80,.15)'};border:1px solid ${travel.can?'rgba(201,168,76,.5)':'rgba(100,100,100,.3)'};border-radius:3px;color:${travel.can?'var(--gold)':'var(--sild)'};cursor:${travel.can?'pointer':'not-allowed'};font-family:'Noto Serif TC',serif;"
        ${!travel.can?`title="${travel.reason}"`:''}
      >${travel.can?'🐎 移動前往此地':'🚫 無法移動'}</button>
      ${!travel.can?`<div style="font-size:.6rem;color:rgba(150,100,80,.8);margin-top:.22rem">⚠ ${travel.reason}</div>`:''}`}
    </div>
  </div>`;
}

// 區域地圖
const REGION_PROMPTS={
  fog_mt:'dark medieval industrial city in thick fog, iron foundry, cobblestone streets, lanterns in mist, top-down bird eye view city map, dark fantasy, no text',
  central:'grand medieval city with marble bridges and golden domes, marketplace, fantasy kingdom capital, top-down map view, warm lighting, no text',
  east_sea:'medieval port city with ships and docks, lighthouse, coastal town, seagulls, top-down map view, blue tones, dark fantasy, no text',
  forest:'elven forest city built in ancient trees, glowing mushrooms, mystical, ethereal green light, top-down map view, dark fantasy, no text',
  wasteland:'ruined desert fortress, crumbling walls, sand dunes, dragon bones, desolate, top-down map view, dark warm tones, no text',
  north_ice:'frozen northern fortress, snow covered battlements, aurora borealis, icy mountains, top-down map view, blue cold tones, no text',
  shadow_marsh:'dark swamp village on stilts, poisonous mist, dead trees, eerie purple light, top-down map view, dark fantasy, no text',
};
function renderRegionMap(cityId){
  const city=MAP_CITIES[cityId];
  if(!city)return;
  document.getElementById('map-breadcrumb').innerHTML=`<span id="map-bc-back" style="cursor:pointer;opacity:.6">艾爾薩大陸</span> <span style="opacity:.4"> ＞ </span>${city.name}`;
  document.getElementById('map-info').style.display='none';
  const container=document.getElementById('map-container');
  container.style.height='420px';

  const iconColors={port:'#4488cc',plaza:'#c9a84c',guard:'#cc8844',inn:'#44aa66',shop:'#aa6644',guild:'#8844aa',danger:'#cc4444',waystation:'#c9a84c',special:'#88aacc',ruins:'#887755',district:'#778899'};
  const regionPrompt=REGION_PROMPTS[city.kingdom]||'dark medieval fantasy city, top-down map view, moody lighting, no text';
  const bgUrl=`https://image.pollinations.ai/prompt/${encodeURIComponent(regionPrompt)}?width=810&height=630&seed=${cityId.length*7+42}&nologo=true`;

  container.innerHTML=`<svg viewBox="0 0 540 420" width="100%" height="420" xmlns="http://www.w3.org/2000/svg" style="display:block">
  <defs>
    <filter id="rglow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <!-- AI 背景 -->
  <rect width="540" height="420" fill="#070e14"/>
  <image href="${bgUrl}" x="0" y="0" width="540" height="420" preserveAspectRatio="xMidYMid slice" opacity=".35"
    onerror="this.style.display='none'"/>
  <!-- 半透明覆蓋層 -->
  <rect width="540" height="420" fill="rgba(8,14,20,.45)"/>
  <!-- 城牆 -->
  <rect x="80" y="70" width="380" height="280" rx="12" fill="none" stroke="rgba(201,168,76,.2)" stroke-width="2" stroke-dasharray="8,5"/>
  <!-- 十字道路 -->
  <line x1="270" y1="70" x2="270" y2="350" stroke="rgba(201,168,76,.08)" stroke-width="12" stroke-linecap="round"/>
  <line x1="80" y1="210" x2="460" y2="210" stroke="rgba(201,168,76,.08)" stroke-width="12" stroke-linecap="round"/>
  <!-- POIs -->
  ${city.pois.map((poi,i)=>{
    const col=iconColors[poi.type]||'#888';
    const isWS=poi.waystation;
    return`<g data-poi="${cityId}:${i}" style="cursor:pointer">
      <circle cx="${poi.x}" cy="${poi.y}" r="24" fill="transparent"/>
      <circle cx="${poi.x}" cy="${poi.y}" r="20" fill="rgba(0,0,0,.6)" stroke="${col}" stroke-width="${isWS?2:1.5}"/>
      ${isWS?`<circle cx="${poi.x}" cy="${poi.y}" r="24" fill="none" stroke="rgba(201,168,76,.3)" stroke-width="1"><animate attributeName="r" values="22;26;22" dur="3s" repeatCount="indefinite"/></circle>`:``}
      <text x="${poi.x}" y="${poi.y+1}" text-anchor="middle" dominant-baseline="middle" font-size="15">${poi.icon}</text>
      <text x="${poi.x}" y="${poi.y+30}" text-anchor="middle" font-size="9" fill="${col}" font-family="serif" paint-order="stroke" stroke="rgba(0,0,0,.7)" stroke-width="3">${poi.name.length>6?poi.name.slice(0,6)+'…':poi.name}</text>
    </g>`;
  }).join('')}
  <!-- 標題 -->
  <g filter="url(#rglow)">
    <text x="270" y="30" text-anchor="middle" font-size="16" fill="rgba(201,168,76,.7)" font-family="serif" letter-spacing="4" paint-order="stroke" stroke="rgba(0,0,0,.6)" stroke-width="4">${city.name}</text>
  </g>
  <text x="270" y="410" text-anchor="middle" font-size="8" fill="rgba(100,100,80,.35)" font-family="sans-serif">點擊地點查看說明</text>
  <!-- 返回 -->
  <g data-action="back" style="cursor:pointer">
    <rect x="12" y="12" width="68" height="22" rx="4" fill="rgba(0,0,0,.6)" stroke="rgba(201,168,76,.3)" stroke-width="1"/>
    <text x="46" y="27" text-anchor="middle" font-size="9.5" fill="rgba(201,168,76,.7)" font-family="sans-serif">◀ 大陸圖</text>
  </g>
</svg>`;
  // 綁定點擊事件
  container.querySelectorAll('[data-poi]').forEach(el=>{
    el.addEventListener('click',function(e){
      e.stopPropagation();
      const [cid,idx]=this.dataset.poi.split(':');
      showPoiInfo(cid,parseInt(idx));
    });
  });
  container.querySelectorAll('[data-action="back"]').forEach(el=>{
    el.addEventListener('click',function(e){e.stopPropagation();renderContinentMap();});
  });
  // 麵包屑返回
  const bcBack=document.getElementById('map-bc-back');
  if(bcBack)bcBack.addEventListener('click',()=>renderContinentMap());
}

// POI點擊說明＋行動按鈕
function showPoiInfo(cityId,poiIdx){
  const poi=MAP_CITIES[cityId]?.pois[poiIdx];
  if(!poi)return;
  const iconColors={port:'#4488cc',plaza:'#c9a84c',guard:'#cc8844',inn:'#44aa66',shop:'#aa6644',guild:'#8844aa',danger:'#cc4444',waystation:'#c9a84c',special:'#88aacc',ruins:'#887755',district:'#778899'};
  const col=iconColors[poi.type]||'#888';
  const info=document.getElementById('map-info');
  info.style.display='block';
  info.innerHTML=`<div style="display:flex;align-items:flex-start;gap:.6rem;">
    <span style="font-size:1.3rem;flex-shrink:0">${poi.icon}</span>
    <div style="flex:1">
      <div style="font-size:.8rem;color:${col};font-weight:600;margin-bottom:.15rem">${poi.name}</div>
      <div style="font-size:.68rem;color:var(--sild);margin-bottom:.35rem;line-height:1.5">${poi.desc}</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button onclick="doGoToPoi('${cityId}','${poi.name}')" style="font-size:.68rem;padding:.22rem .6rem;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.4);border-radius:3px;color:var(--gold);cursor:pointer;font-family:'Noto Serif TC',serif;">→ 前往此地</button>
        ${poi.waystation?`<button onclick="doSetWaystation()" style="font-size:.68rem;padding:.22rem .6rem;background:rgba(201,168,76,.18);border:1px solid rgba(201,168,76,.6);border-radius:3px;color:var(--gold);cursor:pointer;font-family:'Noto Serif TC',serif;">🐎 使用驛站</button>`:''}
      </div>
    </div>
  </div>`;
}

// POI 名稱對應商店類型
const POI_SHOP_MAP={
  '雜貨鋪':'general','雜貨店':'general','雜貨':'general','市集':'general','攤販':'general',
  '鐵匠舖':'blacksmith','鐵匠':'blacksmith','武器鋪':'blacksmith','武器店':'blacksmith','兵器':'blacksmith',
  '旅店':'inn','客棧':'inn','酒館':'inn','酒館旅店':'inn',
  '藥鋪':'apothecary','藥店':'apothecary','藥草':'apothecary','藥師':'apothecary',
};

function getShopKey(poiName){
  for(const[k,v] of Object.entries(POI_SHOP_MAP)){
    if(poiName.includes(k))return v;
  }
  return'general';
}

function doGoToPoi(cityId,poiName){
  closeMap();
  const city=MAP_CITIES[cityId];
  const loc=city.name+'・'+poiName.replace('・','');
  G.sceneLoc='📍 '+loc;
  document.getElementById('scene-loc').textContent=G.sceneLoc;
  appendEntryToDOM({type:'sys',v:`📍 前往 ${loc}`});
  advanceTime(1);

  const isShop=/(商店|市集|攤販|雜貨|武器|鐵匠|藥舖|酒館|客棧|旅店|藥店|藥鋪)/.test(poiName);
  if(isShop){
    // 直接開啟商店 UI，不等 AI
    const baseKey=getShopKey(poiName);
    const shopId=`${cityId}_${poiName}`;
    const shop=mergeShop(shopId,baseKey,[],poiName);
    _currentShop=shop;G.lastShop=shop;G.inShop=true;saveGame();
    const sb=document.getElementById('shop-btn');if(sb){sb.style.display='';sb.title=shop.name;}
    const fr2=document.getElementById('free-row');if(fr2)fr2.classList.add('open');
    openShop(shop);
    // 背景讓 AI 補充劇情描述和可能的特殊商品（不阻塞 UI）
    appendEntryToDOM({type:'sys',v:`🏪 ${shop.name}　點選商品購買・或輸入自由行動繼續`});
    scrollD();saveGame();
    // 背景呼叫 AI 補充新商品（silent，不影響主流程）
    silentShopRefresh(shopId,baseKey,poiName,cityId);
  }else{
    sendChoice(`【抵達${loc}】`);
  }
}

const _shopRefreshCache={};
async function silentShopRefresh(shopId,baseKey,poiName,cityId){
  if(!CFG.key)return;
  // 同一商店 5 分鐘內不重複呼叫 API
  if(_shopRefreshCache[shopId]&&Date.now()-_shopRefreshCache[shopId]<300000)return;
  // 退避中或有其他請求進行中時跳過
  if(Date.now()<_apiThrottle.backoffUntil||_apiThrottle.pending>0)return;
  _shopRefreshCache[shopId]=Date.now();
  let gated=false;
  try{
    await apiGate();gated=true;
    const prompt=`【背景任務・只輸出JSON・不輸出其他文字】\n進入${poiName}。用shop欄位補充2-3件這個地點特有的商品（不要重複基礎商品：乾糧/魚乾/繃帶/短刀/皮甲/草藥包等）。\n只輸出：{"shop":{"id":"${shopId}","name":"${poiName}","baseKey":"${baseKey}","newItems":[...]}}\n若無特殊商品輸出：{"shop":null}`;
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CFG.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:CFG.model,max_tokens:300,messages:[{role:'user',content:prompt}]})
    });
    apiDone();gated=false;
    if(res.status===429){apiHit429();return;}
    if(!res.ok)return;
    const data=await res.json();
    const raw=data.content?.[0]?.text||'';
    const parsed=tryParseJSON(raw);
    if(parsed?.shop?.newItems?.length){
      handleShop(parsed.shop);
      showToast('商店更新了商品','ok');
    }
  }catch(e){if(gated)apiDone();}
}

function doSetWaystation(){
  G.atWayStation=true;
  showToast('已抵達驛站，可前往其他城市','ok');
  closeMap();
  saveGame();
}


applyResp();
markAllDirty();renderBoth(G.activeTab||'party');
updateGold();updateTimeDisplay();
// 恢復商店按鈕狀態
updateShopBtn();

const hasSave=loadGame();
if(hasSave){
  updateGold();
  renderStoryFromData();
  markDirty('log');
  showToast('✦ 讀取存檔成功','ok');
}else{
  G.log=initLog();
  markDirty('log');
  initStory();
}
scrollD();
if(!CFG.key)document.getElementById('api-modal').classList.add('open');
document.getElementById('free-inp').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing)sendFree();});
document.getElementById('api-inp').addEventListener('keydown',e=>{if(e.key==='Enter')saveKey();});
document.getElementById('s-key').addEventListener('keydown',e=>{if(e.key==='Enter')applySettings();});