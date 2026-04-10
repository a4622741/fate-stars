// ═══ 命運之星 v2.0 ═══
const VERSION='4.0';
// ═══ CONFIG ═══
const CFG={
  get key(){return localStorage.getItem('fate_key')||'';},
  set key(v){localStorage.setItem('fate_key',v);},
  get model(){return localStorage.getItem('fate_model')||'claude-sonnet-4-20250514';},
  set model(v){localStorage.setItem('fate_model',v);},
  get tokens(){return parseInt(localStorage.getItem('fate_tokens')||'2000');},
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
  sceneLoc:'📍 鐵霧城・大街',
  partyIds:['alfar','orange'],
  upgrade:{},
  inv:null,
  favor:{},
  specialOv:{},
  bellyFlipCount:0,
  formation:{}, // {charId:'front'|'back'} 前排/後排
  // ── 新系統 ──
  hp:{},           // {id:{cur,max}} 角色血量
  quests:[],       // 任務列表
  time:{day:1,hour:18,weather:'濃霧'},  // 時間
  rep:{},          // {faction:value} 聲望
  relics:{},       // {starNum:{name,found,effect}} 寶器
  founderClues:[], // 北斗星線索碎片
  orangeStage:0,
  intel:[],
  lastShop:null,
  crests:null,       // 紋章系統
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
      partyIds:G.partyIds,upgrade:G.upgrade,inv:getInv(),favor:G.favor,bellyFlipCount:G.bellyFlipCount||0,formation:G.formation||{},specialOv:G.specialOv||{},
      hp:G.hp,quests:G.quests,time:G.time,rep:G.rep,relics:G.relics,presetRelicOv:Object.fromEntries(Object.entries(PRESET_RELICS).map(([k,v])=>[k,{status:v.status,effect:v.effect,bonus:v.bonus,equippedTo:v.equippedTo}])),founderClues:G.founderClues,orangeStage:G.orangeStage||0,intel:G.intel||[],lastShop:G.lastShop||null,inShop:G.inShop||false,shopCatalogs:G.shopCatalogs||{},
      guilds:G.guilds||{},baseWorkers:G.baseWorkers||{},_lastCollect:G._lastCollect||null,_cookBuff:G._cookBuff||null,crests:G.crests||null,starOv,saveVersion:G._saveVersion||3,_achievements:G._achievements||[],_battleCount:G._battleCount||0,_bossKills:G._bossKills||0,_craftCount:G._craftCount||0,_defeatCount:G._defeatCount||0,_visitedCities:G._visitedCities||[],savedAt:Date.now(),
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
    G.sceneLoc=data.sceneLoc||'📍 鐵霧城・城門前';
    G.extraParty=data.extraParty||[];
    G.extraPcfg=data.extraPcfg||{};
    G.partyIds=data.partyIds||['alfar','orange'];_partyCache=null;_invalidateCharCache();
    G.upgrade=data.upgrade||{};
    // Migrate: ensure exp fields exist
    Object.keys(G.upgrade).forEach(id=>{const u=G.upgrade[id];if(!u.exp)u.exp=0;if(!u.expNext)u.expNext=(u.lv||1)*50+50;});
    G.inv=data.inv||getInv();
    G.favor=data.favor||{};
    G.bellyFlipCount=data.bellyFlipCount||0;
    G.formation=data.formation||{};
    G.specialOv=data.specialOv||{};
    G.hp=data.hp||{};
    G.quests=data.quests||[];
    G.time=data.time||{day:1,hour:18,weather:'濃霧'};
    G.rep=data.rep||{};
    G.relics=data.relics||{};
    if(data.presetRelicOv){Object.entries(data.presetRelicOv).forEach(([k,v])=>{if(PRESET_RELICS[k]){PRESET_RELICS[k].status=v.status;PRESET_RELICS[k].effect=v.effect;if(v.bonus)PRESET_RELICS[k].bonus=v.bonus;if(v.equippedTo!==undefined)PRESET_RELICS[k].equippedTo=v.equippedTo;}});}
    // 修復舊存檔缺少 equippedTo 的問題
    if(!PRESET_RELICS.alfar.equippedTo&&PRESET_RELICS.alfar.status==='equipped')PRESET_RELICS.alfar.equippedTo='alfar';
    if(!PRESET_RELICS.orange.equippedTo)PRESET_RELICS.orange.equippedTo='orange';
    if(!PRESET_RELICS.alfar.bonus)PRESET_RELICS.alfar.bonus={武力:15};
    G.founderClues=data.founderClues||[];
    G.orangeStage=data.orangeStage||0;
    G.intel=data.intel||[];
    G.lastShop=data.lastShop||null;
    G.inShop=data.inShop||false;
    G.shopCatalogs=data.shopCatalogs||{};
    G.guilds=data.guilds||{};
    G.baseWorkers=data.baseWorkers||{};
    G._lastCollect=data._lastCollect||null;
    G._cookBuff=data._cookBuff||null;
    G._achievements=data._achievements||[];G._battleCount=data._battleCount||0;G._bossKills=data._bossKills||0;G._craftCount=data._craftCount||0;G._defeatCount=data._defeatCount||0;G._visitedCities=data._visitedCities||[];
    G.crests=data.crests||null;
    // 恢復星辰狀態
    if(data.starOv){
      Object.entries(data.starOv).forEach(([k,v])=>{
        const [type,num]=k.split('_');
        const arr=type==='天罡'?TIANGANG:DISHAT;
        const s=arr.find(x=>x.num===parseInt(num));
        if(!s)return;
        // 只恢復已招募的（有id）或被AI正式感知的（有id的contact）
        if(v.status==='recruited'&&v.id){
          s.status=v.status;s.name=v.name;s.id=v.id;
        }else if(v.status==='contact'&&v.id){
          s.status=v.status;s.name=v.name;s.id=v.id;if(v.cN)s.cN=v.cN;if(v.hint)s.hint=v.hint;
        }
        // 沒有 id 的 contact → 不恢復，保持 unknown（清除舊硬編碼殘留）
      });
    }
    // 換裝置/重新開啟：確保下一次 AI 呼叫回傳 JSON
    // 若最後一則 assistant 訊息不是 JSON，自動插入校正對話
    const lastAst=G.history.filter(m=>m.role==='assistant').pop();
    if(lastAst&&!lastAst.content.trim().startsWith('{')){
      G.history.push({role:'user',content:'請以JSON格式繼續故事。'});
      G.history.push({role:'assistant',content:'{"st":"繼續中","sl":"'+G.sceneLoc+'","nv":[],"dl":[],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null}'});
    }
    // ═══ 存檔遷移：自動將舊存檔升級到最新版本 ═══
    const saveVer=data.saveVersion||0;
    if(saveVer<1){
      // v1: 清除硬編碼的地煞第2星 contact 殘留
      [...TIANGANG,...DISHAT].forEach(s=>{
        if(s.status==='contact'&&!s.id){s.status='unknown';s.name='?';delete s.cN;delete s.hint;}
      });
    }
    if(saveVer<2){
      // v2: 確保所有欄位存在
      if(!G.guilds)G.guilds={};
      if(!G.baseWorkers)G.baseWorkers={};
      if(!G._lastCollect)G._lastCollect=null;
      if(!G._cookBuff)G._cookBuff=null;
    }
    if(saveVer<3){
      // v3: 清理 history 中的舊校正訊息
      G.history=G.history.filter(m=>!(m.role==='user'&&m.content.includes('【系統校正】')));
    }
    // 標記為最新版本，下次存檔時會寫入
    G._saveVersion=3;
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
  else if(e.type==='dial'){
    const el=mk('div','s-dial');
    // 查找角色頭像
    const spName=String(e.sp||'').replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]/gu,'').trim();
    const npcId='npc_'+spName.replace(/\s/g,'_');
    const charMatch=allParty().find(m=>String(e.sp).includes(m.name));
    const portrait=charMatch?getPortraitSrc(charMatch.id):getCustomPortrait(npcId);
    const avatarHtml=portrait?`<img src="${portrait}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid var(--brd);" onerror="this.style.display='none'"/>`:'';
    el.innerHTML=`<div style="display:flex;align-items:flex-start;gap:.3rem;">${avatarHtml}<div><span class="sp">${escHtml(e.sp)}：</span><span class="wd">「${escHtml(e.ln)}」</span></div></div>`;
    w.appendChild(el);
  }
  else if(e.type==='sys'){
    const v=String(e.v||'');
    const isMeta=/^[⚙✦◈🏪📍⚜️💰🪙❤️⏰🔮]|系統自動同步|獲得：|失去：|金幣|HP|好感|強化|時間推進|紋章/.test(v);
    if(isMeta){
      appendSysLog(v);
      if(save)G.storyData.push(e);
      return;
    }
    const el=mk('div','s-sys');el.textContent=v;w.appendChild(el);
  }
  else if(e.type==='action'){const el=mk('div','s-action');el.textContent='▶ '+e.v;w.appendChild(el);}
  else if(e.type==='err'){const el=mk('div','s-err');el.textContent='⚠ '+e.v;w.appendChild(el);}
  document.getElementById('story-content').appendChild(w);
  if(save){G.storyData.push(e);}
}
const _sysInfoLog=[];
function switchStoryTab(tab){
  const story=document.getElementById('story-scroll');
  const sys=document.getElementById('sys-panel');
  const tabStory=document.getElementById('stab-story');
  const tabSys=document.getElementById('stab-sys');
  if(tab==='story'){
    story.style.display='';sys.style.display='none';
    tabStory.classList.add('ac');tabSys.classList.remove('ac');
  }else{
    story.style.display='none';sys.style.display='';
    tabStory.classList.remove('ac');tabSys.classList.add('ac');
    sys.innerHTML=buildSysInfo();
  }
}
function appendSysLog(text){
  const cls=(/金幣|金$|銀$|銅$|所持金/.test(text))?'gold':(/獲得|道具|紋章/.test(text))?'item':(/⚠|失去|扣除/.test(text))?'warn':'';
  _sysInfoLog.push({text,cls,time:Date.now()});
  if(_sysInfoLog.length>200)_sysInfoLog.splice(0,_sysInfoLog.length-200);
  markDirty('sysinfo');
}
function buildSysInfo(){
  const btns=`<div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.6rem;">
    <button onclick="syncAll()" style="flex:1;min-width:120px;padding:.4rem .5rem;font-size:.64rem;background:rgba(201,168,76,.1);border:1px solid var(--goldd);border-radius:3px;color:var(--gold);cursor:pointer;font-family:'Noto Serif TC',serif;">🔄 同步所有狀態</button>
    <button onclick="toggleBGM()" style="flex:1;min-width:120px;padding:.4rem .5rem;font-size:.64rem;background:rgba(100,180,220,.08);border:1px solid rgba(100,180,220,.4);border-radius:3px;color:rgba(130,200,230,.9);cursor:pointer;font-family:'Noto Serif TC',serif;">🎵 背景音樂</button>
    <button onclick="openSettings()" style="flex:1;min-width:120px;padding:.4rem .5rem;font-size:.64rem;background:rgba(150,130,200,.08);border:1px solid rgba(150,130,200,.4);border-radius:3px;color:rgba(180,160,230,.9);cursor:pointer;font-family:'Noto Serif TC',serif;">⚙ 設定</button>
    <button onclick="openHelp()" style="flex:1;min-width:120px;padding:.4rem .5rem;font-size:.64rem;background:rgba(100,180,180,.08);border:1px solid rgba(100,180,180,.4);border-radius:3px;color:rgba(130,200,200,.9);cursor:pointer;font-family:'Noto Serif TC',serif;">❓ 遊戲說明</button>
  </div>`;
  if(!_sysInfoLog.length) return btns+`<div style="font-size:.62rem;color:var(--sild);padding:.5rem .2rem;">尚無系統訊息。</div>`;
  const rows=[..._sysInfoLog].reverse();
  return btns+`<div style="font-size:.62rem;color:var(--goldd);margin-bottom:.4rem;">⚙ 系統紀錄（${rows.length}）</div>`+
    rows.map(r=>{
      const col=r.cls==='gold'?'var(--goldd)':r.cls==='item'?'#6ab46a':r.cls==='warn'?'var(--orange)':'var(--sild)';
      return `<div style="font-size:.62rem;color:${col};line-height:1.5;padding:.12rem 0;border-bottom:1px solid rgba(255,255,255,.03);">${escHtml(r.text)}</div>`;
    }).join('');
}
let saveTimer;
function showSaveIndicator(){
  clearTimeout(saveTimer);
  const el=document.getElementById('save-indicator');
  if(el){el.classList.add('show');saveTimer=setTimeout(()=>el.classList.remove('show'),1800);}
}

// ═══ DATA ═══
const PARTY=[
  {id:'alfar',star:'天魁星',type:'天罡',num:1,name:'艾爾法',title:'旅人（無所屬）',emoji:'😒',baseLv:1,job:null,
   desc:'來歷不明的旅人。語少，銀色長髮，面無表情。帶著一隻花五枚銅幣買的布偶貓在大陸上漫無目的地流浪。沒有故鄉，沒有目標，沒有值得講述的過去——至少她是這麼說的。某種古老的星力在她體內沉眠。',
   stats:{武力:41,知力:69,統率:22,魅力:34,幸運:51},sn:{},
   tl:[{n:'潛星之光',s:true,d:'封印中。條件未達。'},{n:'平靜之眼',s:false,d:'不受恐懼、魅惑、幻術影響。'},{n:'讀心微表情',s:false,d:'可察覺對方說謊（成功率依知力浮動）。'}],
   eq:{武器:'無銘短劍（磨損嚴重）',防具:'旅人斗篷（破舊）',飾品:'——'}},
  {id:'orange',star:'——',type:'星外',num:null,name:'橘子',title:'布偶貓・雌性（晁蓋之位）',emoji:'🐈😒',baseLv:null,job:'命運之錨',
   desc:'以五枚銅幣購入的布偶貓，雌性。雙色毛、藍眼，面癱，聽懂人話，只會喵叫。知力數值異常，來歷不明。對翻肚子持強烈反對立場。不屬於108星，卻是引導星辰聚合的關鍵存在——如同水滸傳中的晁蓋。',
   stats:{武力:3,知力:99,統率:null,魅力:null,幸運:null},sn:{統率:'顯示拒絕',魅力:'數值異常',幸運:'???'},
   tl:[{n:'看穿本質',s:false,d:'對一切虛偽免疫。'},{n:'翻肚禁止',s:false,d:'被強制翻肚時觸發・空踢反擊。'},{n:'命運之錨',s:true,d:'未知。'}],
   eq:{武器:'——',防具:'——（拒絕配戴）',飾品:'——'}},
];
const TGS=['天罡星','天機星','天閒星','天勇星','天雄星','天猛星','天威星','天英星','天貴星','天富星','天滿星','天孤星','天傷星','天立星','天捷星','天暗星','天佑星','天空星','天速星','天異星','天殺星','天微星','天究星','天退星','天壽星','天劍星','天平星','天罪星','天損星','天敗星','天牢星','天慧星','天暴星','天哭星','天巧星'];
const DSS=['地煞星','地勇星','地傑星','地雄星','地威星','地英星','地奇星','地猛星','地文星','地正星','地闊星','地闔星','地強星','地暗星','地輔星','地會星','地佐星','地祐星','地靈星','地獸星','地微星','地慧星','地暴星','地然星','地猖星','地狂星','地飛星','地走星','地巧星','地明星','地進星','地退星','地滿星','地遂星','地周星','地隱星','地異星','地理星','地俊星','地樂星','地捷星','地速星','地鎮星','地禽星','地刑星','地壯星','地劣星','地健星','地耗星','地賊星','地狗星','地囚星','地孤星','地角星','地短星','地魔星','地妖星','地幽星','地伏星','地僻星','地空星','地全星','地缺星','地殺星','地哭星','地損星','地破星','地平星','地奴星','地察星','地惡星'];
const TIANGANG=[{num:1,star:'天魁星',name:'艾爾法',status:'recruited',id:'alfar'},...TGS.map((s,i)=>({num:i+2,star:s,name:'?',status:'unknown'}))];
const DISHAT=[{num:1,star:'地魁星',name:'?',status:'unknown'},...DSS.map((s,i)=>({num:i+2,star:s,name:'?',status:'unknown'}))];
// INV 初始資料（新遊戲時使用）
// 星外關鍵人物（不在108星之列，但與命運息息相關）
const SPECIAL_CHARS=[
  {
    id:'orange_chaokai',
    name:'橘子',
    role:'晁蓋之位・命運之錨',
    emoji:'🐈😒',
    status:'recruited',
    desc:'以五枚銅幣購入的布偶貓。不屬於108顆命運之星，卻是引導星辰聚合的關鍵存在。如同《水滸傳》中的晁蓋——她是開路人，是聚義的起點，是北斗星下齊聚108星的錨。她的真實身份遠超一隻貓。',
    hint:'她的氣息不屬於108星中的任何一顆。更古老，更深邃。',
    known_as:'命運之錨。晁蓋之位。北斗星下最初的引路者。',
  },
  {
    id:'sky_father',
    name:'北斗星・未知',
    role:'星辰召集者',
    emoji:'⚜️',
    status:'unknown', // 'unknown'|'heard'|'met'|'dead'
    desc:'帝國崩裂前夕，第一個感知到108顆命運之星降世的存在。他如同北斗般指引方向，召集了最初的同伴，卻在旅途中途倒下——留下的謎題與未竟的志業，成為後繼者的遺產。',
    hint:'此人的氣息⋯⋯不像是108星中的任何一顆。比108星更古老，更沉重。',
    known_as:'傳說中「聚星之人」，或有人稱其為「先行者」。如北斗般照亮108星辰聚合之路。',
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
    {n:'無銘短劍',t:'磨損嚴重・來歷不明',w:'艾爾法',status:'equipped',slot:'武器',bonus:{武力:8,知力:0,統率:0,魅力:0,幸運:0}},
    {n:'旅人斗篷',t:'破舊但耐用',w:'艾爾法',status:'equipped',slot:'防具',bonus:{武力:0,知力:0,統率:5,魅力:0,幸運:2}}
  ],
  items:[{n:'乾糧',t:'回復道具',q:'×2'},{n:'破舊地圖（艾爾薩）',t:'殘缺不全',q:'×1'}],
  key:[]
};

// ═══ ITEM DATABASE — 完整道具資料庫 ═══
// 所有道具的基準資料，買賣/劇情/掉落皆參照此表
const ITEM_DB={
  // ════════════════════════════════════════
  // ══ 消耗品 - HP回復 ══
  // ════════════════════════════════════════
  '乾糧':{cat:'消耗',t:'基礎口糧・HP+5',effect:{hp:5},price:{g:0,s:0,c:20},icon:'🍞'},
  '繃帶':{cat:'消耗',t:'緊急止血・HP+10',effect:{hp:10},price:{g:0,s:0,c:25},icon:'🩹'},
  '草藥包':{cat:'消耗',t:'天然藥草・HP+20',effect:{hp:20},price:{g:0,s:2,c:0},icon:'🌿'},
  '恢復藥劑':{cat:'消耗',t:'煉金術製品・HP+40',effect:{hp:40},price:{g:0,s:5,c:0},icon:'🧪'},
  '月光精華':{cat:'消耗',t:'銀月城稀有品・HP+60',effect:{hp:60},price:{g:0,s:15,c:0},icon:'🌙'},
  '精靈藥草':{cat:'消耗',t:'翠林特產・HP+80',effect:{hp:80},price:{g:0,s:25,c:0},icon:'🍀'},
  '聖水':{cat:'消耗',t:'神殿祝福之水・HP+100',effect:{hp:100},price:{g:0,s:40,c:0},icon:'💧'},
  '生命精華':{cat:'消耗',t:'濃縮生命之力・HP+150',effect:{hp:150},price:{g:1,s:0,c:0},icon:'❤️'},
  '神之露':{cat:'消耗',t:'傳說中的神露・HP+200',effect:{hp:200},price:{g:2,s:0,c:0},icon:'✨'},
  '復活藥':{cat:'消耗',t:'令瀕死者甦醒・復活並恢復30%HP',effect:{revive:0.3},price:{g:1,s:50,c:0},icon:'💫'},
  '全體回復藥':{cat:'消耗',t:'全體HP+50',effect:{hp_all:50},price:{g:0,s:30,c:0},icon:'🧪'},
  '高級全體回復':{cat:'消耗',t:'全體HP+100',effect:{hp_all:100},price:{g:1,s:20,c:0},icon:'🧪'},
  '萬靈丹':{cat:'消耗',t:'治癒一切傷病・HP全回復+解除異常',effect:{hp:9999,cure:'all'},price:{g:3,s:0,c:0},icon:'💊'},
  '鳳凰之淚':{cat:'消耗',t:'鳳凰的眼淚・復活並全回復',effect:{revive:1.0},price:{g:5,s:0,c:0},icon:'🔥'},
  '命運之泉水':{cat:'消耗',t:'北斗之力灌注・全體復活並回復',effect:{revive_all:0.5},price:{g:8,s:0,c:0},icon:'⛲'},

  // ══ 消耗品 - Buff藥劑 ══
  '力量藥劑':{cat:'消耗',t:'臨時增強武力+5・持續3回合',effect:{buff:'atk',val:5,dur:3},price:{g:0,s:3,c:0},icon:'⚗️'},
  '知力藥劑':{cat:'消耗',t:'臨時增強知力+5・持續3回合',effect:{buff:'int',val:5,dur:3},price:{g:0,s:3,c:0},icon:'⚗️'},
  '統率藥劑':{cat:'消耗',t:'臨時增強統率+5・持續3回合',effect:{buff:'def',val:5,dur:3},price:{g:0,s:3,c:0},icon:'⚗️'},
  '魅力藥劑':{cat:'消耗',t:'臨時增強魅力+5・持續3回合',effect:{buff:'cha',val:5,dur:3},price:{g:0,s:3,c:0},icon:'⚗️'},
  '幸運藥劑':{cat:'消耗',t:'臨時增強幸運+5・持續3回合',effect:{buff:'luk',val:5,dur:3},price:{g:0,s:3,c:0},icon:'⚗️'},
  '高級力量藥劑':{cat:'消耗',t:'臨時增強武力+10・持續5回合',effect:{buff:'atk',val:10,dur:5},price:{g:0,s:12,c:0},icon:'⚗️'},
  '高級知力藥劑':{cat:'消耗',t:'臨時增強知力+10・持續5回合',effect:{buff:'int',val:10,dur:5},price:{g:0,s:12,c:0},icon:'⚗️'},
  '高級統率藥劑':{cat:'消耗',t:'臨時增強統率+10・持續5回合',effect:{buff:'def',val:10,dur:5},price:{g:0,s:12,c:0},icon:'⚗️'},
  '高級魅力藥劑':{cat:'消耗',t:'臨時增強魅力+10・持續5回合',effect:{buff:'cha',val:10,dur:5},price:{g:0,s:12,c:0},icon:'⚗️'},
  '高級幸運藥劑':{cat:'消耗',t:'臨時增強幸運+10・持續5回合',effect:{buff:'luk',val:10,dur:5},price:{g:0,s:12,c:0},icon:'⚗️'},
  '鐵壁藥劑':{cat:'消耗',t:'大幅提升防禦・持續5回合',effect:{buff:'iron_wall',dur:5},price:{g:0,s:15,c:0},icon:'🛡️'},
  '疾風藥劑':{cat:'消耗',t:'提升速度・持續5回合',effect:{buff:'haste',dur:5},price:{g:0,s:15,c:0},icon:'💨'},
  '透明藥劑':{cat:'消耗',t:'短暫隱身・持續3回合',effect:{buff:'invisible',dur:3},price:{g:0,s:20,c:0},icon:'👻'},
  '狂暴藥劑':{cat:'消耗',t:'大幅提升攻擊但降低防禦・持續5回合',effect:{buff:'berserk',dur:5},price:{g:0,s:18,c:0},icon:'😡'},
  '護盾藥劑':{cat:'消耗',t:'產生護盾吸收50點傷害',effect:{buff:'shield',val:50},price:{g:0,s:10,c:0},icon:'🔮'},
  '巨人藥劑':{cat:'消耗',t:'全屬性+5・持續5回合',effect:{buff:'giant',val:5,dur:5},price:{g:0,s:30,c:0},icon:'⚗️'},
  '龍血藥劑':{cat:'消耗',t:'全屬性+10・持續3回合',effect:{buff:'dragon_blood',val:10,dur:3},price:{g:1,s:0,c:0},icon:'🐉'},
  '英雄藥劑':{cat:'消耗',t:'武力+15、統率+15・持續5回合',effect:{buff:'hero',dur:5},price:{g:1,s:50,c:0},icon:'⚗️'},
  '賢者藥劑':{cat:'消耗',t:'知力+15、魅力+15・持續5回合',effect:{buff:'sage',dur:5},price:{g:1,s:50,c:0},icon:'⚗️'},
  '命運藥劑':{cat:'消耗',t:'幸運+20・持續整場戰鬥',effect:{buff:'destiny',val:20},price:{g:2,s:0,c:0},icon:'🌟'},

  // ══ 消耗品 - 狀態解除 ══
  '解毒劑':{cat:'消耗',t:'解除中毒狀態',effect:{cure:'poison'},price:{g:0,s:3,c:0},icon:'💊'},
  '解凍劑':{cat:'消耗',t:'解除冰凍狀態',effect:{cure:'freeze'},price:{g:0,s:3,c:0},icon:'🧊'},
  '清醒劑':{cat:'消耗',t:'解除混亂狀態',effect:{cure:'confuse'},price:{g:0,s:3,c:0},icon:'💊'},
  '提神藥':{cat:'消耗',t:'恢復疲勞',effect:{cure:'fatigue'},price:{g:0,s:1,c:50},icon:'⚗️'},
  '萬能解藥':{cat:'消耗',t:'解除毒、凍、亂三種狀態',effect:{cure:'common_all'},price:{g:0,s:8,c:0},icon:'💊'},
  '世界樹樹液':{cat:'消耗',t:'解除所有異常狀態',effect:{cure:'all'},price:{g:0,s:40,c:0},icon:'🌳'},
  '聖光之水':{cat:'消耗',t:'解除詛咒狀態',effect:{cure:'curse'},price:{g:0,s:20,c:0},icon:'✨'},
  '淨化藥':{cat:'消耗',t:'解除瘴氣與腐蝕效果',effect:{cure:'miasma'},price:{g:0,s:15,c:0},icon:'🧪'},
  '破咒藥':{cat:'消耗',t:'解除封印與沉默',effect:{cure:'seal'},price:{g:0,s:18,c:0},icon:'💊'},
  '命運解咒':{cat:'消耗',t:'解除命運詛咒等特殊異常',effect:{cure:'fate_curse'},price:{g:1,s:0,c:0},icon:'⭐'},

  // ══ 消耗品 - 食物與料理 ══
  '麵包':{cat:'消耗',t:'烤製麵包・HP+8',effect:{hp:8},price:{g:0,s:0,c:15},icon:'🍞'},
  '肉串':{cat:'消耗',t:'炭烤肉串・HP+12',effect:{hp:12},price:{g:0,s:0,c:25},icon:'🍖'},
  '魚排':{cat:'消耗',t:'煎烤魚排・HP+15',effect:{hp:15},price:{g:0,s:0,c:30},icon:'🐟'},
  '燻魚':{cat:'消耗',t:'灰港名產・HP+10',effect:{hp:10},price:{g:0,s:0,c:35},icon:'🐟'},
  '海鮮湯':{cat:'消耗',t:'鮮美海鮮熬製・HP+25',effect:{hp:25},price:{g:0,s:1,c:50},icon:'🍲'},
  '精靈果實':{cat:'消耗',t:'翠林仙果・HP+40・知力+3臨時',effect:{hp:40,buff:'int',val:3,dur:3},price:{g:0,s:10,c:0},icon:'🍎'},
  '龍肉乾':{cat:'消耗',t:'龍肉風乾・HP+30・武力+3臨時',effect:{hp:30,buff:'atk',val:3,dur:3},price:{g:0,s:8,c:0},icon:'🥩'},
  '鐵霧烤肉':{cat:'消耗',t:'鐵霧城名菜・HP+18・統率+2臨時',effect:{hp:18,buff:'def',val:2,dur:3},price:{g:0,s:1,c:0},icon:'🍖'},
  '銀月甜點':{cat:'消耗',t:'銀月城甜品・HP+15・魅力+3臨時',effect:{hp:15,buff:'cha',val:3,dur:3},price:{g:0,s:2,c:0},icon:'🍰'},
  '東港海鮮':{cat:'消耗',t:'東港鮮撈大餐・HP+30',effect:{hp:30},price:{g:0,s:2,c:50},icon:'🦐'},
  '翠林藥膳':{cat:'消耗',t:'精靈秘方藥膳・HP+35・解除疲勞',effect:{hp:35,cure:'fatigue'},price:{g:0,s:3,c:0},icon:'🥗'},
  '南荒仙人掌汁':{cat:'消耗',t:'沙門城特飲・解渴提神',effect:{hp:12,cure:'fatigue'},price:{g:0,s:0,c:40},icon:'🌵'},
  '霜嶺熱湯':{cat:'消耗',t:'霜守堡暖身湯・HP+20・解除冰凍',effect:{hp:20,cure:'freeze'},price:{g:0,s:1,c:50},icon:'🍲'},
  '影沼蘑菇湯':{cat:'消耗',t:'影沼地特產・HP+22・微毒',effect:{hp:22},price:{g:0,s:1,c:0},icon:'🍄'},
  '金橋商旅飯':{cat:'消耗',t:'金橋城大份量商旅套餐・HP+20',effect:{hp:20},price:{g:0,s:1,c:0},icon:'🍛'},
  '灰港醃魚':{cat:'消耗',t:'灰港特製鹹魚・HP+12',effect:{hp:12},price:{g:0,s:0,c:30},icon:'🐟'},
  '鐵冠城燉肉':{cat:'消耗',t:'鐵冠城礦工餐・HP+18・統率+2臨時',effect:{hp:18,buff:'def',val:2,dur:3},price:{g:0,s:1,c:0},icon:'🍖'},
  '鏽城乾餅':{cat:'消耗',t:'鏽城帝國風乾糧・HP+8',effect:{hp:8},price:{g:0,s:0,c:20},icon:'🍪'},
  '龍牙砦辣湯':{cat:'消耗',t:'龍牙砦名物・HP+25・武力+2臨時',effect:{hp:25,buff:'atk',val:2,dur:3},price:{g:0,s:2,c:0},icon:'🌶️'},
  '蒼穹城御膳':{cat:'消耗',t:'蒼穹城高級料理・HP+50・全屬性+2臨時',effect:{hp:50,buff:'all',val:2,dur:3},price:{g:0,s:15,c:0},icon:'🍱'},

  // ══ 消耗品 - 城市特色道具 ══
  '防霧面罩':{cat:'消耗',t:'減輕鐵鏽霧害',effect:{misc:'fog_resist'},price:{g:0,s:1,c:50},icon:'😷'},
  '礦工燈':{cat:'消耗',t:'霧中照明・洞窟探索',effect:{misc:'light'},price:{g:0,s:2,c:0},icon:'🪔'},
  '防沙頭巾':{cat:'消耗',t:'南荒必備・防風沙',effect:{misc:'sand_resist'},price:{g:0,s:2,c:0},icon:'🧣'},
  '大容量水壺':{cat:'消耗',t:'荒野求生用',effect:{misc:'water'},price:{g:0,s:3,c:0},icon:'🫗'},
  '照明彈':{cat:'消耗',t:'荒野求救信號',effect:{misc:'signal'},price:{g:0,s:4,c:0},icon:'🎆'},
  '防寒皮衣':{cat:'消耗',t:'霜嶺必需品・禦寒',effect:{misc:'cold_resist'},price:{g:0,s:8,c:0},icon:'🧥'},
  '暖爐石':{cat:'消耗',t:'攜帶式保暖石',effect:{misc:'warmth'},price:{g:0,s:3,c:0},icon:'🪨'},
  '防瘴面具':{cat:'消耗',t:'影沼地必備・防瘴氣',effect:{misc:'miasma_resist'},price:{g:0,s:5,c:0},icon:'🎭'},
  '防熱藥':{cat:'消耗',t:'抵禦地熱',effect:{misc:'heat_resist'},price:{g:0,s:5,c:0},icon:'🧴'},
  '火種':{cat:'消耗',t:'生火用具・野營必備',effect:{misc:'camp'},price:{g:0,s:0,c:10},icon:'🔥'},
  '麻繩':{cat:'消耗',t:'攀爬・綑綁用',effect:{misc:'climb'},price:{g:0,s:0,c:15},icon:'🪢'},
  '海鹽':{cat:'消耗',t:'保鮮調味・料理材料',effect:{misc:'cook'},price:{g:0,s:0,c:15},icon:'🧂'},
  '東方香料':{cat:'消耗',t:'來自東海・料理材料',effect:{misc:'cook'},price:{g:0,s:2,c:0},icon:'🫚'},
  '東海珍珠粉':{cat:'消耗',t:'東海王國特產・HP+50',effect:{hp:50},price:{g:0,s:12,c:0},icon:'🦪'},
  '沼澤解毒劑':{cat:'消耗',t:'對瘴氣特效',effect:{cure:'miasma'},price:{g:0,s:6,c:0},icon:'🧪'},
  '劇毒萃取':{cat:'消耗',t:'武器塗毒用・下次攻擊附帶毒',effect:{buff:'poison_blade'},price:{g:0,s:10,c:0},icon:'☠️'},
  '迷幻菇':{cat:'消耗',t:'用途不明・慎用',effect:{misc:'hallucinogen'},price:{g:0,s:4,c:0},icon:'🍄'},
  '防風斗篷':{cat:'消耗',t:'蒼穹城高地必備・防強風',effect:{misc:'wind_resist'},price:{g:0,s:6,c:0},icon:'🧥'},
  '夜視藥':{cat:'消耗',t:'夜間視野增強・持續數小時',effect:{misc:'night_vision'},price:{g:0,s:5,c:0},icon:'👁️'},
  '潛水草':{cat:'消耗',t:'東港特產・短時間水下呼吸',effect:{misc:'dive'},price:{g:0,s:8,c:0},icon:'🌊'},

  // ══ 消耗品 - 貓咪點心 ══
  '魚乾':{cat:'消耗',t:'橘子最愛・好感+8',effect:{favor:{orange:8}},price:{g:0,s:0,c:30},icon:'🐟'},
  '魚肉乾':{cat:'消耗',t:'橘子最愛・好感+12',effect:{favor:{orange:12}},price:{g:0,s:0,c:40},icon:'🍖'},
  '高級魚乾':{cat:'消耗',t:'上等漁獲製成・好感+15',effect:{favor:{orange:15}},price:{g:0,s:2,c:0},icon:'🐟'},
  '精靈魚':{cat:'消耗',t:'翠林溪中靈魚・好感+20',effect:{favor:{orange:20}},price:{g:0,s:8,c:0},icon:'🐠'},
  '龍鯉':{cat:'消耗',t:'傳說中的龍鯉・好感+30',effect:{favor:{orange:30}},price:{g:0,s:25,c:0},icon:'🐉'},

  // ════════════════════════════════════════
  // ══ 武器 - 劍 ══
  // ════════════════════════════════════════
  '木劍':{cat:'武器',t:'練習用木劍・聊勝於無',slot:'武器',bonus:{武力:5},price:{g:0,s:0,c:30},icon:'🗡️'},
  '短劍':{cat:'武器',t:'標準輕兵器',slot:'武器',bonus:{武力:10},price:{g:0,s:12,c:0},icon:'🗡️'},
  '長劍':{cat:'武器',t:'平衡型武器',slot:'武器',bonus:{武力:16},price:{g:0,s:25,c:0},icon:'⚔️'},
  '闊劍':{cat:'武器',t:'寬刃重劍・劈砍有力',slot:'武器',bonus:{武力:20},price:{g:0,s:35,c:0},icon:'⚔️'},
  '雙刃劍':{cat:'武器',t:'雙面開刃・攻守兼備',slot:'武器',bonus:{武力:23,幸運:2},price:{g:0,s:45,c:0},icon:'⚔️'},
  '精鋼劍':{cat:'武器',t:'精鋼鍛造・鋒利耐用',slot:'武器',bonus:{武力:26},price:{g:0,s:60,c:0},icon:'⚔️'},
  '附魔劍':{cat:'武器',t:'附有魔力的長劍',slot:'武器',bonus:{武力:28,知力:5},price:{g:0,s:80,c:0},icon:'⚔️'},
  '銀月細劍':{cat:'武器',t:'銀月城名匠打造',slot:'武器',bonus:{武力:20,魅力:5},price:{g:1,s:0,c:0},icon:'🗡️'},
  '騎士劍':{cat:'武器',t:'騎士團制式長劍',slot:'武器',bonus:{武力:30,統率:5},price:{g:1,s:20,c:0},icon:'⚔️'},
  '聖劍殘片':{cat:'武器',t:'聖劍碎片重鑄・仍有神聖之力',slot:'武器',bonus:{武力:35,知力:5},price:{g:2,s:0,c:0},icon:'⚔️'},
  '龍牙劍':{cat:'武器',t:'龍牙鍛造・灼熱鋒刃',slot:'武器',bonus:{武力:38},price:{g:2,s:50,c:0},icon:'⚔️'},
  '暗影劍':{cat:'武器',t:'暗影之力凝聚・幽冥鋒芒',slot:'武器',bonus:{武力:40,幸運:-5},price:{g:3,s:0,c:0},icon:'⚔️'},
  '星辰劍':{cat:'武器',t:'星辰之力灌注・光芒四射',slot:'武器',bonus:{武力:43,知力:8},price:{g:4,s:0,c:0},icon:'⚔️'},
  '帝國皇劍':{cat:'武器',t:'帝國皇室御用劍・霸者之器',slot:'武器',bonus:{武力:48,統率:10,魅力:5},price:{g:6,s:0,c:0},icon:'⚔️'},
  '天命折刃':{cat:'武器',t:'折斷的天命之劍・仍蘊含命運之力',slot:'武器',bonus:{武力:50,幸運:15},price:null,icon:'⚔️'},

  // ══ 武器 - 斧 ══
  '手斧':{cat:'武器',t:'輕型手斧・伐木用',slot:'武器',bonus:{武力:8},price:{g:0,s:0,c:40},icon:'🪓'},
  '戰斧':{cat:'武器',t:'重型武器・揮砍為主',slot:'武器',bonus:{武力:20,統率:-3},price:{g:0,s:30,c:0},icon:'🪓'},
  '雙刃斧':{cat:'武器',t:'雙面斧刃・殺傷力強',slot:'武器',bonus:{武力:25,統率:-4},price:{g:0,s:45,c:0},icon:'🪓'},
  '鐵霧重錘':{cat:'武器',t:'礦工改造・鐵霧城特產',slot:'武器',bonus:{武力:22,統率:-5},price:{g:0,s:35,c:0},icon:'🔨'},
  '精鋼礦錘':{cat:'武器',t:'鐵冠城精鍛',slot:'武器',bonus:{武力:25},price:{g:0,s:40,c:0},icon:'🔨'},
  '巨斧':{cat:'武器',t:'超重巨斧・一擊致命',slot:'武器',bonus:{武力:35,統率:-6},price:{g:1,s:50,c:0},icon:'🪓'},
  '符文斧':{cat:'武器',t:'刻有古代符文的戰斧',slot:'武器',bonus:{武力:38,知力:3,統率:-3},price:{g:2,s:0,c:0},icon:'🪓'},
  '屠龍斧':{cat:'武器',t:'傳說中屠龍者的巨斧',slot:'武器',bonus:{武力:45,統率:-5},price:{g:3,s:0,c:0},icon:'🪓'},
  '混沌之斧':{cat:'武器',t:'混沌之力凝聚・不穩定但強大',slot:'武器',bonus:{武力:50,統率:-8,幸運:-5},price:{g:4,s:0,c:0},icon:'🪓'},
  '裁決之斧':{cat:'武器',t:'審判者的巨斧・一擊定生死',slot:'武器',bonus:{武力:55,統率:-3},price:null,icon:'🪓'},

  // ══ 武器 - 弓 ══
  '短弓':{cat:'武器',t:'基礎短弓・射程有限',slot:'武器',bonus:{武力:6,幸運:2},price:{g:0,s:0,c:35},icon:'🏹'},
  '獵弓':{cat:'武器',t:'獵人慣用弓・精準度高',slot:'武器',bonus:{武力:10,幸運:3},price:{g:0,s:10,c:0},icon:'🏹'},
  '弓':{cat:'武器',t:'遠程武器',slot:'武器',bonus:{武力:12,幸運:3},price:{g:0,s:18,c:0},icon:'🏹'},
  '長弓':{cat:'武器',t:'射程遠・威力大',slot:'武器',bonus:{武力:18,幸運:4},price:{g:0,s:30,c:0},icon:'🏹'},
  '珊瑚弓':{cat:'武器',t:'東海特產・華麗',slot:'武器',bonus:{武力:16,魅力:8},price:{g:0,s:45,c:0},icon:'🏹'},
  '精靈短弓':{cat:'武器',t:'翠林城精靈工藝',slot:'武器',bonus:{武力:15,知力:10,幸運:5},price:{g:1,s:0,c:0},icon:'🏹'},
  '附魔弓':{cat:'武器',t:'魔力灌注的獵弓',slot:'武器',bonus:{武力:25,知力:5,幸運:5},price:{g:1,s:50,c:0},icon:'🏹'},
  '龍骨弓':{cat:'武器',t:'龍骨彎製・蓄力驚人',slot:'武器',bonus:{武力:32,幸運:3},price:{g:2,s:0,c:0},icon:'🏹'},
  '星光弓':{cat:'武器',t:'星辰之光引導箭矢',slot:'武器',bonus:{武力:38,幸運:8},price:{g:3,s:0,c:0},icon:'🏹'},
  '北斗之弓':{cat:'武器',t:'北斗星辰之力灌注・傳說弓具',slot:'武器',bonus:{武力:45,幸運:12},price:null,icon:'🏹'},

  // ══ 武器 - 杖 ══
  '木杖':{cat:'武器',t:'普通木杖・微弱魔力',slot:'武器',bonus:{知力:8},price:{g:0,s:0,c:40},icon:'🪄'},
  '學徒杖':{cat:'武器',t:'魔法學徒的法杖',slot:'武器',bonus:{知力:12},price:{g:0,s:15,c:0},icon:'🪄'},
  '法杖':{cat:'武器',t:'魔法武器・知力型',slot:'武器',bonus:{知力:15},price:{g:0,s:22,c:0},icon:'🪄'},
  '符文短杖':{cat:'武器',t:'附魔法杖',slot:'武器',bonus:{知力:22,幸運:3},price:{g:0,s:80,c:0},icon:'🪄'},
  '翠林之杖':{cat:'武器',t:'翠林聖木製成・自然之力',slot:'武器',bonus:{知力:25,幸運:5},price:{g:1,s:0,c:0},icon:'🪄'},
  '冰霜杖':{cat:'武器',t:'寒冰之力凝聚',slot:'武器',bonus:{知力:30},price:{g:1,s:50,c:0},icon:'🪄'},
  '雷電杖':{cat:'武器',t:'雷電之力蘊藏其中',slot:'武器',bonus:{知力:33,武力:5},price:{g:2,s:0,c:0},icon:'🪄'},
  '賢者杖':{cat:'武器',t:'歷代賢者傳承之杖',slot:'武器',bonus:{知力:40,魅力:5},price:{g:3,s:0,c:0},icon:'🪄'},
  '時律杖':{cat:'武器',t:'操縱時間之力的法杖',slot:'武器',bonus:{知力:45,幸運:8},price:{g:5,s:0,c:0},icon:'🪄'},
  '創世杖':{cat:'武器',t:'傳說中創世之力殘留的法杖',slot:'武器',bonus:{知力:50,武力:10},price:null,icon:'🪄'},

  // ══ 武器 - 匕首 ══
  '小刀':{cat:'武器',t:'隨身小刀・勉強能戰',slot:'武器',bonus:{武力:4,幸運:2},price:{g:0,s:0,c:20},icon:'🔪'},
  '匕首':{cat:'武器',t:'短刃快攻武器',slot:'武器',bonus:{武力:8,幸運:3},price:{g:0,s:8,c:0},icon:'🔪'},
  '龍骨匕首':{cat:'武器',t:'龍牙砦限定・龍骨鍛造',slot:'武器',bonus:{武力:28,幸運:-5},price:{g:0,s:50,c:0},icon:'🗡️'},
  '暗殺匕首':{cat:'武器',t:'刺客專用・致命一擊率高',slot:'武器',bonus:{武力:18,幸運:8},price:{g:0,s:30,c:0},icon:'🔪'},
  '魚叉':{cat:'武器',t:'漁夫改造武器',slot:'武器',bonus:{武力:12,幸運:2},price:{g:0,s:15,c:0},icon:'🔱'},
  '毒刃':{cat:'武器',t:'淬毒短刃・攻擊附帶毒',slot:'武器',bonus:{武力:22,幸運:5},price:{g:0,s:40,c:0},icon:'🔪'},
  '影匕':{cat:'武器',t:'暗影凝聚之刃・若隱若現',slot:'武器',bonus:{武力:28,幸運:8},price:{g:1,s:20,c:0},icon:'🔪'},
  '刺客之刃':{cat:'武器',t:'刺客公會頂級裝備',slot:'武器',bonus:{武力:33,幸運:10},price:{g:2,s:0,c:0},icon:'🔪'},
  '命運匕首':{cat:'武器',t:'命運之力灌注・必中要害',slot:'武器',bonus:{武力:36,幸運:15},price:{g:3,s:0,c:0},icon:'🔪'},
  '虛無之刃':{cat:'武器',t:'虛無界之刃・斬斷因果',slot:'武器',bonus:{武力:40,幸運:18},price:null,icon:'🔪'},

  // ══ 武器 - 槍 ══
  '木矛':{cat:'武器',t:'木製長矛・新兵配備',slot:'武器',bonus:{武力:7,統率:2},price:{g:0,s:0,c:35},icon:'🔱'},
  '鐵槍':{cat:'武器',t:'鐵製長槍・堅固耐用',slot:'武器',bonus:{武力:14,統率:3},price:{g:0,s:15,c:0},icon:'🔱'},
  '長槍':{cat:'武器',t:'標準制式長槍',slot:'武器',bonus:{武力:20,統率:5},price:{g:0,s:30,c:0},icon:'🔱'},
  '戰矛':{cat:'武器',t:'重型戰矛・步兵剋星',slot:'武器',bonus:{武力:26,統率:6},price:{g:0,s:50,c:0},icon:'🔱'},
  '騎士長槍':{cat:'武器',t:'騎士衝鋒用長槍',slot:'武器',bonus:{武力:32,統率:8},price:{g:1,s:20,c:0},icon:'🔱'},
  '龍牙槍':{cat:'武器',t:'龍牙鍛造之槍・灼熱槍尖',slot:'武器',bonus:{武力:38,統率:5},price:{g:2,s:0,c:0},icon:'🔱'},
  '雷霆槍':{cat:'武器',t:'蘊含雷電之力的神槍',slot:'武器',bonus:{武力:43,統率:8,知力:5},price:{g:3,s:50,c:0},icon:'🔱'},
  '天罡槍':{cat:'武器',t:'天罡星辰之力灌注・傳說槍具',slot:'武器',bonus:{武力:48,統率:12},price:null,icon:'🔱'},

  // ══ 武器 - 錘 ══
  '木槌':{cat:'武器',t:'木製槌子・力大無窮者適用',slot:'武器',bonus:{武力:6,統率:3},price:{g:0,s:0,c:30},icon:'🔨'},
  '鐵錘':{cat:'武器',t:'鍛鐵之錘・沉重但威力大',slot:'武器',bonus:{武力:15,統率:4},price:{g:0,s:18,c:0},icon:'🔨'},
  '戰錘':{cat:'武器',t:'戰場用重錘・破甲利器',slot:'武器',bonus:{武力:22,統率:5},price:{g:0,s:35,c:0},icon:'🔨'},
  '城衛制式劍':{cat:'武器',t:'鐵霧城衛標配',slot:'武器',bonus:{武力:15,統率:3},price:{g:0,s:28,c:0},icon:'⚔️'},
  '巨錘':{cat:'武器',t:'超重巨錘・震碎大地',slot:'武器',bonus:{武力:35,統率:8,幸運:-3},price:{g:1,s:50,c:0},icon:'🔨'},
  '精鋼戰錘':{cat:'武器',t:'精鋼打造的戰錘',slot:'武器',bonus:{武力:40,統率:6},price:{g:2,s:0,c:0},icon:'🔨'},
  '聖錘':{cat:'武器',t:'聖光灌注之錘・驅魔利器',slot:'武器',bonus:{武力:45,統率:10,知力:5},price:{g:3,s:0,c:0},icon:'🔨'},
  '審判之錘':{cat:'武器',t:'最終審判之錘・天罡之力',slot:'武器',bonus:{武力:52,統率:12},price:null,icon:'🔨'},

  // ══ 武器 - 特殊武器 ══
  '海軍彎刀':{cat:'武器',t:'海軍規格・適合船戰',slot:'武器',bonus:{武力:18,幸運:5},price:{g:0,s:35,c:0},icon:'🗡️'},
  '帝國遺劍':{cat:'武器',t:'鏽蝕但仍鋒利',slot:'武器',bonus:{武力:18,幸運:-2},price:{g:0,s:20,c:0},icon:'⚔️'},
  '騎士團長劍':{cat:'武器',t:'霜守堡騎士團鍛造',slot:'武器',bonus:{武力:22,統率:8},price:{g:1,s:20,c:0},icon:'⚔️'},
  '無銘短劍':{cat:'武器',t:'磨損嚴重・來歷不明',slot:'武器',bonus:{武力:8},price:{g:0,s:5,c:0},icon:'🗡️'},
  '折斷的聖劍':{cat:'武器',t:'折斷的聖劍・聖力猶存',slot:'武器',bonus:{武力:30,知力:10},price:null,icon:'⚔️'},
  '詛咒之刃':{cat:'武器',t:'被詛咒的魔劍・強大但危險',slot:'武器',bonus:{武力:42,幸運:-15},price:null,icon:'⚔️'},
  '混沌武器':{cat:'武器',t:'混沌之力凝聚・形態不定',slot:'武器',bonus:{武力:45,知力:10,統率:-10},price:null,icon:'⚔️'},
  '劍真紋章武器':{cat:'武器',t:'劍之真紋章持有者之武器',slot:'武器',bonus:{武力:50,統率:10,幸運:10},price:null,icon:'⚔️'},
  '盾真紋章武器':{cat:'武器',t:'盾之真紋章持有者之武器',slot:'武器',bonus:{武力:30,統率:25,幸運:5},price:null,icon:'🛡️'},

  // ════════════════════════════════════════
  // ══ 防具 - 輕甲 ══
  // ════════════════════════════════════════
  '布衣':{cat:'防具',t:'普通布製衣物・最基礎防護',slot:'防具',bonus:{統率:3,幸運:2},price:{g:0,s:0,c:25},icon:'👕'},
  '旅人斗篷':{cat:'防具',t:'基礎防護+隱匿',slot:'防具',bonus:{統率:3,幸運:5},price:{g:0,s:10,c:0},icon:'🧥'},
  '皮甲':{cat:'防具',t:'輕型防護',slot:'防具',bonus:{統率:6,幸運:2},price:{g:0,s:15,c:0},icon:'🦺'},
  '輕革甲':{cat:'防具',t:'輕量化皮革甲・靈活防護',slot:'防具',bonus:{統率:8,幸運:3},price:{g:0,s:25,c:0},icon:'🦺'},
  '精靈織甲':{cat:'防具',t:'精靈絲線編織・輕盈堅韌',slot:'防具',bonus:{統率:12,幸運:5,知力:3},price:{g:0,s:50,c:0},icon:'🦺'},
  '隱匿斗篷':{cat:'防具',t:'暗色斗篷・利於潛行',slot:'防具',bonus:{統率:10,幸運:8},price:{g:0,s:40,c:0},icon:'🧥'},
  '夜行衣':{cat:'防具',t:'夜間行動專用・輕若無物',slot:'防具',bonus:{統率:14,幸運:6},price:{g:0,s:60,c:0},icon:'🧥'},
  '風之衣':{cat:'防具',t:'風之精靈祝福・移動如風',slot:'防具',bonus:{統率:16,幸運:8},price:{g:1,s:0,c:0},icon:'🧥'},
  '暗影披風':{cat:'防具',t:'暗影之力編織・融入黑暗',slot:'防具',bonus:{統率:20,幸運:10},price:{g:1,s:50,c:0},icon:'🧥'},
  '星光衣':{cat:'防具',t:'星辰之光編織・輝耀護身',slot:'防具',bonus:{統率:24,幸運:8,知力:5},price:{g:2,s:50,c:0},icon:'✨'},
  '命運之袍':{cat:'防具',t:'命運之力編織・因果護體',slot:'防具',bonus:{統率:28,幸運:12},price:{g:4,s:0,c:0},icon:'🧥'},
  '創世護衣':{cat:'防具',t:'創世之力殘留・傳說輕甲',slot:'防具',bonus:{統率:30,幸運:15,知力:8},price:null,icon:'✨'},

  // ══ 防具 - 中甲 ══
  '鏈甲':{cat:'防具',t:'鐵鏈編製甲・基礎中甲',slot:'防具',bonus:{統率:8},price:{g:0,s:20,c:0},icon:'🛡️'},
  '鎖子甲':{cat:'防具',t:'中型防護・較重',slot:'防具',bonus:{統率:12},price:{g:0,s:35,c:0},icon:'🛡️'},
  '鱗甲':{cat:'防具',t:'鱗片交疊・防禦均衡',slot:'防具',bonus:{統率:15},price:{g:0,s:45,c:0},icon:'🛡️'},
  '鐵胸甲':{cat:'防具',t:'鐵質胸甲・重要部位防護',slot:'防具',bonus:{統率:18},price:{g:0,s:55,c:0},icon:'🛡️'},
  '銀月護甲':{cat:'防具',t:'輕便華麗・銀月城製',slot:'防具',bonus:{統率:15,魅力:5},price:{g:1,s:20,c:0},icon:'🛡️'},
  '帝國軍甲':{cat:'防具',t:'帝國制式軍甲・平衡防護',slot:'防具',bonus:{統率:22,武力:3},price:{g:1,s:0,c:0},icon:'🛡️'},
  '強化鎖甲':{cat:'防具',t:'經過強化處理的鎖子甲',slot:'防具',bonus:{統率:25},price:{g:1,s:30,c:0},icon:'🛡️'},
  '龍鱗甲':{cat:'防具',t:'龍鱗編製・堅若磐石',slot:'防具',bonus:{統率:32},price:{g:2,s:0,c:0},icon:'🛡️'},
  '符文甲':{cat:'防具',t:'刻有防護符文・魔物剋星',slot:'防具',bonus:{統率:35,知力:5},price:{g:2,s:50,c:0},icon:'🛡️'},
  '星辰戰甲':{cat:'防具',t:'星辰之力灌注的戰甲',slot:'防具',bonus:{統率:38,幸運:5},price:{g:3,s:50,c:0},icon:'🛡️'},
  '霸王甲':{cat:'防具',t:'霸者之鎧・威壓四方',slot:'防具',bonus:{統率:42,魅力:8},price:{g:5,s:0,c:0},icon:'🛡️'},
  '不碎之壁':{cat:'防具',t:'傳說中永不碎裂的鎧甲',slot:'防具',bonus:{統率:45,武力:5},price:null,icon:'🛡️'},

  // ══ 防具 - 重甲 ══
  '重鐵甲':{cat:'防具',t:'全身重鐵甲・防禦極高但笨重',slot:'防具',bonus:{統率:15,幸運:-3},price:{g:0,s:50,c:0},icon:'🛡️'},
  '騎士全甲':{cat:'防具',t:'騎士全身甲・標準重裝',slot:'防具',bonus:{統率:22,幸運:-3},price:{g:1,s:0,c:0},icon:'🛡️'},
  '霜守堡甲':{cat:'防具',t:'霜守堡特製・耐寒重甲',slot:'防具',bonus:{統率:28,幸運:-4},price:{g:1,s:50,c:0},icon:'🛡️'},
  '帝國禁衛甲':{cat:'防具',t:'帝國禁衛軍專用・頂級重裝',slot:'防具',bonus:{統率:35,幸運:-5},price:{g:2,s:50,c:0},icon:'🛡️'},
  '龍骨甲':{cat:'防具',t:'龍骨鍛造重甲・堅不可摧',slot:'防具',bonus:{統率:40,幸運:-4},price:{g:3,s:0,c:0},icon:'🛡️'},
  '神聖甲':{cat:'防具',t:'聖光灌注重甲・驅魔護身',slot:'防具',bonus:{統率:45,知力:5,幸運:-3},price:{g:4,s:0,c:0},icon:'🛡️'},
  '磐石之甲':{cat:'防具',t:'如磐石般堅固的傳說重甲',slot:'防具',bonus:{統率:50,幸運:-5},price:{g:6,s:0,c:0},icon:'🛡️'},
  '天罡戰甲':{cat:'防具',t:'天罡星辰之力灌注・傳說重甲',slot:'防具',bonus:{統率:55,武力:5,幸運:-3},price:null,icon:'🛡️'},

  // ══ 防具 - 法袍 ══
  '學徒袍':{cat:'防具',t:'魔法學徒制式袍・基礎魔防',slot:'防具',bonus:{知力:5,統率:2},price:{g:0,s:12,c:0},icon:'🧙'},
  '術士袍':{cat:'防具',t:'術士常用法袍',slot:'防具',bonus:{知力:10,統率:4},price:{g:0,s:30,c:0},icon:'🧙'},
  '賢者袍':{cat:'防具',t:'賢者等級法袍',slot:'防具',bonus:{知力:18,統率:6},price:{g:0,s:60,c:0},icon:'🧙'},
  '精靈法袍':{cat:'防具',t:'精靈紡織的法袍・輕盈通透',slot:'防具',bonus:{知力:22,統率:8,幸運:3},price:{g:1,s:0,c:0},icon:'🧙'},
  '月光袍':{cat:'防具',t:'月光精華編織・銀月城傳承',slot:'防具',bonus:{知力:28,統率:10},price:{g:2,s:0,c:0},icon:'🌙'},
  '時律之袍':{cat:'防具',t:'時間之力編織・歲月不侵',slot:'防具',bonus:{知力:35,統率:12,幸運:5},price:{g:3,s:50,c:0},icon:'🧙'},
  '夢幻之袍':{cat:'防具',t:'夢境之力編織・虛實交錯',slot:'防具',bonus:{知力:40,統率:8,幸運:10},price:{g:5,s:0,c:0},icon:'🧙'},
  '創世之袍':{cat:'防具',t:'創世之力殘留・傳說法袍',slot:'防具',bonus:{知力:50,統率:15},price:null,icon:'🧙'},

  // ════════════════════════════════════════
  // ══ 飾品 - 戒指 ══
  // ════════════════════════════════════════
  '銅指環':{cat:'飾品',t:'略有加持',slot:'飾品',bonus:{幸運:4},price:{g:0,s:8,c:0},icon:'💍'},
  '鐵指環':{cat:'飾品',t:'鐵質指環・微弱防護',slot:'飾品',bonus:{統率:3,幸運:2},price:{g:0,s:5,c:0},icon:'💍'},
  '銀指環':{cat:'飾品',t:'銀質指環・淡淡魔力',slot:'飾品',bonus:{知力:3,幸運:4},price:{g:0,s:15,c:0},icon:'💍'},
  '金指環':{cat:'飾品',t:'金質指環・財運亨通',slot:'飾品',bonus:{魅力:5,幸運:5},price:{g:0,s:30,c:0},icon:'💍'},
  '紅寶石戒':{cat:'飾品',t:'鑲嵌紅寶石・力量之戒',slot:'飾品',bonus:{武力:8,幸運:3},price:{g:0,s:50,c:0},icon:'💍'},
  '藍寶石戒':{cat:'飾品',t:'鑲嵌藍寶石・智慧之戒',slot:'飾品',bonus:{知力:8,幸運:3},price:{g:0,s:50,c:0},icon:'💍'},
  '翡翠戒':{cat:'飾品',t:'鑲嵌翡翠・生命之戒',slot:'飾品',bonus:{統率:6,幸運:5},price:{g:0,s:45,c:0},icon:'💍'},
  '鑽石戒':{cat:'飾品',t:'鑲嵌鑽石・萬能之戒',slot:'飾品',bonus:{武力:5,知力:5,幸運:5},price:{g:1,s:0,c:0},icon:'💍'},
  '龍骨戒':{cat:'飾品',t:'龍骨雕刻之戒・灼熱之力',slot:'飾品',bonus:{武力:10,幸運:5},price:{g:1,s:50,c:0},icon:'💍'},
  '星辰戒':{cat:'飾品',t:'星辰之力灌注・命運之環',slot:'飾品',bonus:{武力:5,知力:5,統率:5,幸運:8},price:{g:2,s:50,c:0},icon:'💍'},
  '命運之戒':{cat:'飾品',t:'命運之力編織・因果之環',slot:'飾品',bonus:{幸運:20},price:{g:4,s:0,c:0},icon:'💍'},
  '北斗指環':{cat:'飾品',t:'北斗星辰之力灌注・傳說戒指',slot:'飾品',bonus:{武力:8,知力:8,統率:8,魅力:8,幸運:8},price:null,icon:'💍'},

  // ══ 飾品 - 護符 ══
  '護身符':{cat:'飾品',t:'祈禱之物',slot:'飾品',bonus:{幸運:6,知力:2},price:{g:0,s:12,c:0},icon:'📿'},
  '木製護符':{cat:'飾品',t:'木雕護符・微弱祝福',slot:'飾品',bonus:{幸運:3},price:{g:0,s:5,c:0},icon:'📿'},
  '銀製護符':{cat:'飾品',t:'銀製護符・驅邪之力',slot:'飾品',bonus:{幸運:5,知力:3},price:{g:0,s:18,c:0},icon:'📿'},
  '商旅護符':{cat:'飾品',t:'金橋城名物',slot:'飾品',bonus:{魅力:8,幸運:3},price:{g:0,s:15,c:0},icon:'📿'},
  '精靈護符':{cat:'飾品',t:'翠林精靈祝福之符',slot:'飾品',bonus:{知力:8,幸運:5},price:{g:0,s:40,c:0},icon:'📿'},
  '龍牙護符':{cat:'飾品',t:'龍牙磨製護符・灼熱之力',slot:'飾品',bonus:{武力:6,統率:6},price:{g:0,s:50,c:0},icon:'📿'},
  '星辰護符':{cat:'飾品',t:'星辰之力灌注的護符',slot:'飾品',bonus:{知力:8,幸運:8},price:{g:1,s:0,c:0},icon:'📿'},
  '月光護符':{cat:'飾品',t:'月光精華凝聚之符',slot:'飾品',bonus:{知力:10,魅力:5},price:{g:1,s:20,c:0},icon:'📿'},
  '太陽護符':{cat:'飾品',t:'太陽之力灌注・驅散黑暗',slot:'飾品',bonus:{武力:8,魅力:8},price:{g:1,s:50,c:0},icon:'📿'},
  '命運護符':{cat:'飾品',t:'命運之力編織・改寫因果',slot:'飾品',bonus:{幸運:15,知力:5},price:{g:3,s:0,c:0},icon:'📿'},
  '霸王護符':{cat:'飾品',t:'霸者之力凝聚・威壓四方',slot:'飾品',bonus:{武力:10,統率:10,魅力:5},price:{g:4,s:0,c:0},icon:'📿'},
  '創世護符':{cat:'飾品',t:'創世之力殘留・傳說護符',slot:'飾品',bonus:{武力:8,知力:8,統率:8,魅力:8,幸運:8},price:null,icon:'📿'},

  // ══ 飾品 - 盾 ══
  '木盾':{cat:'飾品',t:'木製盾牌・基礎格擋',slot:'飾品',bonus:{統率:5},price:{g:0,s:5,c:0},icon:'🛡️'},
  '鐵盾':{cat:'飾品',t:'格擋專用',slot:'飾品',bonus:{統率:10},price:{g:0,s:18,c:0},icon:'🛡️'},
  '鋼盾':{cat:'飾品',t:'鋼質盾牌・堅固耐用',slot:'飾品',bonus:{統率:14},price:{g:0,s:30,c:0},icon:'🛡️'},
  '塔盾':{cat:'飾品',t:'大型塔盾・全身防護',slot:'飾品',bonus:{統率:18,幸運:-2},price:{g:0,s:45,c:0},icon:'🛡️'},
  '騎士盾':{cat:'飾品',t:'騎士團制式盾牌',slot:'飾品',bonus:{統率:22,魅力:3},price:{g:1,s:0,c:0},icon:'🛡️'},
  '龍鱗盾':{cat:'飾品',t:'龍鱗編製盾牌・堅若磐石',slot:'飾品',bonus:{統率:28},price:{g:2,s:0,c:0},icon:'🛡️'},
  '精靈盾':{cat:'飾品',t:'精靈工藝盾牌・輕盈堅韌',slot:'飾品',bonus:{統率:20,幸運:5,知力:3},price:{g:1,s:50,c:0},icon:'🛡️'},
  '符文盾':{cat:'飾品',t:'刻有防護符文的盾牌',slot:'飾品',bonus:{統率:25,知力:5},price:{g:2,s:0,c:0},icon:'🛡️'},
  '星辰盾':{cat:'飾品',t:'星辰之力灌注的盾牌',slot:'飾品',bonus:{統率:32,幸運:5},price:{g:3,s:0,c:0},icon:'🛡️'},
  '不碎之盾':{cat:'飾品',t:'傳說中永不碎裂的盾牌',slot:'飾品',bonus:{統率:38},price:null,icon:'🛡️'},

  // ══ 飾品 - 其他 ══
  '皮腰帶':{cat:'飾品',t:'皮製腰帶・微弱強化',slot:'飾品',bonus:{武力:2,統率:2},price:{g:0,s:5,c:0},icon:'🪢'},
  '戰士腰帶':{cat:'飾品',t:'戰士用腰帶・力量強化',slot:'飾品',bonus:{武力:5,統率:3},price:{g:0,s:20,c:0},icon:'🪢'},
  '英雄腰帶':{cat:'飾品',t:'英雄之力灌注的腰帶',slot:'飾品',bonus:{武力:8,統率:5,魅力:3},price:{g:1,s:0,c:0},icon:'🪢'},
  '銅手鐲':{cat:'飾品',t:'銅製手鐲・微弱魔力',slot:'飾品',bonus:{知力:3},price:{g:0,s:6,c:0},icon:'⭕'},
  '銀手鐲':{cat:'飾品',t:'銀製手鐲・魔力增幅',slot:'飾品',bonus:{知力:6,幸運:2},price:{g:0,s:20,c:0},icon:'⭕'},
  '金手鐲':{cat:'飾品',t:'金製手鐲・魅力倍增',slot:'飾品',bonus:{魅力:8,知力:4},price:{g:0,s:40,c:0},icon:'⭕'},
  '龍骨手鐲':{cat:'飾品',t:'龍骨雕刻手鐲・灼熱之力',slot:'飾品',bonus:{武力:8,知力:5},price:{g:1,s:20,c:0},icon:'⭕'},
  '珍珠耳環':{cat:'飾品',t:'珍珠耳環・優雅之飾',slot:'飾品',bonus:{魅力:6,幸運:3},price:{g:0,s:15,c:0},icon:'✨'},
  '翡翠耳環':{cat:'飾品',t:'翡翠耳環・生命之力',slot:'飾品',bonus:{統率:5,魅力:5},price:{g:0,s:30,c:0},icon:'✨'},
  '星辰耳環':{cat:'飾品',t:'星辰之力灌注的耳環',slot:'飾品',bonus:{知力:8,魅力:8},price:{g:1,s:50,c:0},icon:'✨'},
  '旅行披風':{cat:'飾品',t:'旅行者的披風・增強耐力',slot:'飾品',bonus:{統率:4,幸運:4},price:{g:0,s:12,c:0},icon:'🧣'},
  '騎士披風':{cat:'飾品',t:'騎士團披風・榮耀之証',slot:'飾品',bonus:{統率:8,魅力:6},price:{g:0,s:40,c:0},icon:'🧣'},
  '王者披風':{cat:'飾品',t:'王者之披風・威壓氣勢',slot:'飾品',bonus:{統率:12,魅力:10,武力:5},price:{g:3,s:0,c:0},icon:'🧣'},
  '幸運墜飾':{cat:'飾品',t:'四葉草墜飾・帶來好運',slot:'飾品',bonus:{幸運:10},price:{g:0,s:25,c:0},icon:'🍀'},
  '勇者墜飾':{cat:'飾品',t:'勇者之証・激發勇氣',slot:'飾品',bonus:{武力:6,魅力:6},price:{g:0,s:35,c:0},icon:'⭐'},
  '賢者墜飾':{cat:'飾品',t:'賢者之証・啟發智慧',slot:'飾品',bonus:{知力:10,魅力:3},price:{g:0,s:35,c:0},icon:'⭐'},

  // ════════════════════════════════════════
  // ══ 素材 - 礦石 ══
  // ════════════════════════════════════════
  '鐵礦':{cat:'素材',t:'常見鐵礦石・鍛造基礎材料',effect:{misc:'craft'},price:{g:0,s:1,c:0},icon:'🪨'},
  '銅礦':{cat:'素材',t:'銅礦石・初級鍛造材料',effect:{misc:'craft'},price:{g:0,s:0,c:30},icon:'🪨'},
  '銀礦':{cat:'素材',t:'銀礦石・中級鍛造材料',effect:{misc:'craft'},price:{g:0,s:3,c:0},icon:'🪨'},
  '金礦':{cat:'素材',t:'金礦石・珍貴鍛造材料',effect:{misc:'craft'},price:{g:0,s:10,c:0},icon:'🪨'},
  '秘銀礦':{cat:'素材',t:'稀有秘銀礦・高級鍛造材料',effect:{misc:'craft'},price:{g:0,s:25,c:0},icon:'🪨'},
  '精鋼':{cat:'素材',t:'精鋼礦石・精良武器材料',effect:{misc:'craft'},price:{g:0,s:15,c:0},icon:'🪨'},
  '龍鋼':{cat:'素材',t:'龍之領域特產・灼熱金屬',effect:{misc:'craft'},price:{g:1,s:0,c:0},icon:'🪨'},
  '星辰礦':{cat:'素材',t:'墜落星辰凝聚之礦・極稀有',effect:{misc:'craft'},price:{g:2,s:0,c:0},icon:'🪨'},
  '虛空礦':{cat:'素材',t:'虛空裂縫中產生的礦石',effect:{misc:'craft'},price:{g:3,s:0,c:0},icon:'🪨'},
  '創世金屬':{cat:'素材',t:'傳說中創世時期的金屬・極罕見',effect:{misc:'craft'},price:null,icon:'🪨'},
  '礦石樣本':{cat:'素材',t:'可交易的鐵礦石',effect:{misc:'trade'},price:{g:0,s:3,c:0},icon:'🪨'},

  // ══ 素材 - 草藥 ══
  '普通草藥':{cat:'素材',t:'隨處可見的草藥・煉金基礎材料',effect:{misc:'craft'},price:{g:0,s:0,c:20},icon:'🌿'},
  '稀有草藥':{cat:'素材',t:'較罕見的草藥・中級煉金材料',effect:{misc:'craft'},price:{g:0,s:2,c:0},icon:'🌿'},
  '精靈花':{cat:'素材',t:'翠林特有之花・精靈煉金材料',effect:{misc:'craft'},price:{g:0,s:8,c:0},icon:'🌸'},
  '月光蘑菇':{cat:'素材',t:'月光下生長的蘑菇・銀月城特產',effect:{misc:'craft'},price:{g:0,s:5,c:0},icon:'🍄'},
  '龍血草':{cat:'素材',t:'龍之領域生長・浸染龍血',effect:{misc:'craft'},price:{g:0,s:15,c:0},icon:'🌿'},
  '世界樹果實':{cat:'素材',t:'世界樹結出的果實・極稀有',effect:{misc:'craft'},price:{g:1,s:0,c:0},icon:'🌳'},
  '時之花':{cat:'素材',t:'時間裂縫附近生長・不凋不謝',effect:{misc:'craft'},price:{g:1,s:50,c:0},icon:'🌸'},
  '夢之蕊':{cat:'素材',t:'夢境與現實交界處的花蕊',effect:{misc:'craft'},price:{g:2,s:0,c:0},icon:'🌸'},
  '命運之種':{cat:'素材',t:'命運之力凝聚的種子',effect:{misc:'craft'},price:{g:3,s:0,c:0},icon:'🌱'},
  '北斗草':{cat:'素材',t:'北斗星辰之力滋養的仙草',effect:{misc:'craft'},price:null,icon:'🌿'},

  // ══ 素材 - 魔物掉落 ══
  '哥布林牙':{cat:'素材',t:'哥布林的尖牙・低級素材',effect:{misc:'craft'},price:{g:0,s:0,c:10},icon:'🦷'},
  '狼皮':{cat:'素材',t:'野狼的毛皮・製甲材料',effect:{misc:'craft'},price:{g:0,s:0,c:25},icon:'🐺'},
  '蛇毒囊':{cat:'素材',t:'毒蛇的毒囊・煉金材料',effect:{misc:'craft'},price:{g:0,s:1,c:0},icon:'🐍'},
  '蜘蛛絲':{cat:'素材',t:'巨蜘蛛的絲線・韌性極佳',effect:{misc:'craft'},price:{g:0,s:1,c:50},icon:'🕷️'},
  '蝙蝠翼':{cat:'素材',t:'蝙蝠的翅膀・煉金材料',effect:{misc:'craft'},price:{g:0,s:0,c:30},icon:'🦇'},
  '骷髏骨':{cat:'素材',t:'不死骷髏的骨頭・暗黑素材',effect:{misc:'craft'},price:{g:0,s:2,c:0},icon:'💀'},
  '惡魔角':{cat:'素材',t:'低階惡魔的角・暗黑素材',effect:{misc:'craft'},price:{g:0,s:5,c:0},icon:'😈'},
  '龍鱗':{cat:'素材',t:'龍的鱗片・極堅硬',effect:{misc:'craft'},price:{g:0,s:20,c:0},icon:'🐉'},
  '龍牙':{cat:'素材',t:'龍的牙齒・鍛造頂級武器',effect:{misc:'craft'},price:{g:0,s:30,c:0},icon:'🐉'},
  '暗影精華':{cat:'素材',t:'暗影生物的精華・稀有素材',effect:{misc:'craft'},price:{g:0,s:15,c:0},icon:'🌑'},
  '混沌碎片':{cat:'素材',t:'混沌之力凝聚的碎片',effect:{misc:'craft'},price:{g:1,s:0,c:0},icon:'💜'},
  '虛無之塵':{cat:'素材',t:'虛無界生物消散後的塵埃',effect:{misc:'craft'},price:{g:1,s:50,c:0},icon:'✨'},
  '星辰碎片':{cat:'素材',t:'墜落星辰的碎片・蘊含星力',effect:{misc:'craft'},price:{g:2,s:0,c:0},icon:'⭐'},
  '命運碎片':{cat:'素材',t:'命運之力凝聚的碎片',effect:{misc:'craft'},price:{g:3,s:0,c:0},icon:'🌟'},
  '創世碎片':{cat:'素材',t:'傳說中創世之力殘留的碎片',effect:{misc:'craft'},price:null,icon:'💎'},

  // ══ 素材 - 寶石 ══
  '琥珀':{cat:'素材',t:'琥珀寶石・裝飾或煉金用',effect:{misc:'craft'},price:{g:0,s:2,c:0},icon:'💎'},
  '石榴石':{cat:'素材',t:'紅色石榴石・力量增幅',effect:{misc:'craft'},price:{g:0,s:5,c:0},icon:'💎'},
  '月長石':{cat:'素材',t:'月光凝聚之石・魔力增幅',effect:{misc:'craft'},price:{g:0,s:8,c:0},icon:'💎'},
  '翡翠':{cat:'素材',t:'翠綠寶石・生命之力',effect:{misc:'craft'},price:{g:0,s:12,c:0},icon:'💎'},
  '藍寶石':{cat:'素材',t:'藍色寶石・智慧之力',effect:{misc:'craft'},price:{g:0,s:20,c:0},icon:'💎'},
  '紅寶石':{cat:'素材',t:'紅色寶石・力量之力',effect:{misc:'craft'},price:{g:0,s:20,c:0},icon:'💎'},
  '鑽石':{cat:'素材',t:'極硬寶石・萬能增幅',effect:{misc:'craft'},price:{g:1,s:0,c:0},icon:'💎'},
  '星辰石':{cat:'素材',t:'星辰之力凝聚的寶石',effect:{misc:'craft'},price:{g:2,s:0,c:0},icon:'💎'},
  '命運石':{cat:'素材',t:'命運之力凝聚的寶石',effect:{misc:'craft'},price:{g:3,s:0,c:0},icon:'💎'},
  '北斗石':{cat:'素材',t:'北斗星辰之力凝聚・傳說寶石',effect:{misc:'craft'},price:null,icon:'💎'},

  // ══ 素材 - 加工材料 ══
  '皮革':{cat:'素材',t:'加工皮革・製甲基礎材料',effect:{misc:'craft'},price:{g:0,s:1,c:0},icon:'🧶'},
  '內陸皮革':{cat:'素材',t:'來自霧山・製甲材料',effect:{misc:'craft'},price:{g:0,s:3,c:0},icon:'🧶'},
  '布料':{cat:'素材',t:'普通布料・製衣基礎材料',effect:{misc:'craft'},price:{g:0,s:0,c:30},icon:'🧵'},
  '絲綢':{cat:'素材',t:'上等絲綢・高級製衣材料',effect:{misc:'craft'},price:{g:0,s:5,c:0},icon:'🧵'},
  '精靈絲':{cat:'素材',t:'精靈紡織之絲・極輕極韌',effect:{misc:'craft'},price:{g:0,s:15,c:0},icon:'🧵'},
  '木材':{cat:'素材',t:'普通木材・製造基礎材料',effect:{misc:'craft'},price:{g:0,s:0,c:20},icon:'🪵'},
  '精靈木':{cat:'素材',t:'翠林聖木・蘊含自然之力',effect:{misc:'craft'},price:{g:0,s:10,c:0},icon:'🪵'},
  '鐵錠':{cat:'素材',t:'精鍊鐵錠・鍛造基礎材料',effect:{misc:'craft'},price:{g:0,s:2,c:0},icon:'🔩'},
  '鋼錠':{cat:'素材',t:'精鍊鋼錠・鍛造進階材料',effect:{misc:'craft'},price:{g:0,s:5,c:0},icon:'🔩'},
  '秘銀錠':{cat:'素材',t:'精鍊秘銀錠・高級鍛造材料',effect:{misc:'craft'},price:{g:0,s:30,c:0},icon:'🔩'},
  '龍鋼錠':{cat:'素材',t:'龍鋼精鍊而成・頂級鍛造材料',effect:{misc:'craft'},price:{g:1,s:50,c:0},icon:'🔩'},
  '附魔墨水':{cat:'素材',t:'附魔用特殊墨水',effect:{misc:'craft'},price:{g:0,s:8,c:0},icon:'🖋️'},
  '符文石':{cat:'素材',t:'刻寫符文用的石板',effect:{misc:'craft'},price:{g:0,s:5,c:0},icon:'🪨'},
  '魔力結晶':{cat:'素材',t:'凝聚的純粹魔力',effect:{misc:'craft'},price:{g:0,s:12,c:0},icon:'🔮'},
  '聖水瓶':{cat:'素材',t:'神殿聖水・淨化素材',effect:{misc:'craft'},price:{g:0,s:10,c:0},icon:'💧'},

  // ════════════════════════════════════════
  // ══ 關鍵道具 - 地圖 ══
  // ════════════════════════════════════════
  '破舊地圖（艾爾薩）':{cat:'關鍵',t:'殘缺不全的大陸地圖',effect:{misc:'map'},price:null,icon:'🗺️'},
  '走私品地圖':{cat:'關鍵',t:'可疑的標記・灰港地下交易路線',effect:{misc:'smuggle_map'},price:{g:0,s:8,c:0},icon:'🗺️'},
  '星象圖':{cat:'關鍵',t:'銀月城特產・108星辰位置參考',effect:{misc:'star_map'},price:{g:0,s:5,c:0},icon:'🌌'},
  '海圖':{cat:'關鍵',t:'東海航路圖',effect:{misc:'sea_map'},price:{g:0,s:8,c:0},icon:'🗺️'},
  '影沼地圖':{cat:'關鍵',t:'影沼地的安全路線圖',effect:{misc:'marsh_map'},price:null,icon:'🗺️'},
  '鐵霧城地圖':{cat:'關鍵',t:'鐵霧城詳細地圖',effect:{misc:'city_map'},price:{g:0,s:2,c:0},icon:'🗺️'},
  '銀月城地圖':{cat:'關鍵',t:'銀月城詳細地圖',effect:{misc:'city_map'},price:{g:0,s:2,c:0},icon:'🗺️'},
  '金橋城地圖':{cat:'關鍵',t:'金橋城詳細地圖',effect:{misc:'city_map'},price:{g:0,s:2,c:0},icon:'🗺️'},
  '灰港地圖':{cat:'關鍵',t:'灰港詳細地圖',effect:{misc:'city_map'},price:{g:0,s:2,c:0},icon:'🗺️'},
  '大陸全圖':{cat:'關鍵',t:'艾爾薩大陸完整地圖',effect:{misc:'full_map'},price:{g:0,s:30,c:0},icon:'🗺️'},
  '秘密地圖':{cat:'關鍵',t:'標記著未知地點的神秘地圖',effect:{misc:'secret_map'},price:null,icon:'🗺️'},
  '龍牙砦地圖':{cat:'關鍵',t:'龍牙砦周邊詳細地圖',effect:{misc:'city_map'},price:{g:0,s:3,c:0},icon:'🗺️'},

  // ══ 關鍵道具 - 通行證 ══
  '情報書信':{cat:'關鍵',t:'各地傳聞彙整',effect:{misc:'intel'},price:{g:0,s:3,c:0},icon:'📜'},
  '帝國徽記碎片':{cat:'關鍵',t:'帝國遺物・收藏品或線索',effect:{misc:'empire_relic'},price:{g:0,s:5,c:0},icon:'👑'},
  '翠林通行證':{cat:'關鍵',t:'精靈域通行必需',effect:{misc:'pass_jade'},price:{g:0,s:20,c:0},icon:'📜'},
  '鐵冠城通行證':{cat:'關鍵',t:'鐵冠城入城許可',effect:{misc:'pass_iron_crown'},price:{g:0,s:10,c:0},icon:'📜'},
  '霜守堡通行證':{cat:'關鍵',t:'霜守堡入城許可',effect:{misc:'pass_frost'},price:{g:0,s:15,c:0},icon:'📜'},
  '龍牙砦通行證':{cat:'關鍵',t:'龍牙砦入城許可',effect:{misc:'pass_dragon'},price:{g:0,s:12,c:0},icon:'📜'},
  '冒險者公會證':{cat:'關鍵',t:'冒險者公會的會員證・各城通用',effect:{misc:'guild_card'},price:{g:0,s:5,c:0},icon:'📜'},
  '騎士徽章':{cat:'關鍵',t:'騎士身份的證明',effect:{misc:'knight_badge_generic'},price:null,icon:'🛡️'},
  '帝國舊貴族印記':{cat:'關鍵',t:'帝國時代貴族的印記・某些場所仍有效',effect:{misc:'noble_seal'},price:null,icon:'👑'},
  '商會會員證':{cat:'關鍵',t:'金橋城商會的會員證明',effect:{misc:'merchant_card'},price:{g:0,s:10,c:0},icon:'📜'},

  // ══ 關鍵道具 - 交通工具 ══
  '船票（短程）':{cat:'關鍵',t:'碼頭間移動',effect:{misc:'boat'},price:{g:0,s:5,c:0},icon:'🎫'},
  '船票（長程）':{cat:'關鍵',t:'跨海長途航行',effect:{misc:'boat_long'},price:{g:0,s:20,c:0},icon:'🎫'},
  '馬匹租用券':{cat:'關鍵',t:'租用馬匹一次・加速陸地移動',effect:{misc:'horse'},price:{g:0,s:10,c:0},icon:'🐴'},
  '驛站令牌':{cat:'關鍵',t:'帝國驛站系統通行令牌',effect:{misc:'relay'},price:{g:0,s:15,c:0},icon:'🏇'},
  '馬車票':{cat:'關鍵',t:'商旅馬車搭乘券・城市間移動',effect:{misc:'carriage'},price:{g:0,s:8,c:0},icon:'🎫'},
  '飛行船票':{cat:'關鍵',t:'蒼穹城飛行船搭乘券',effect:{misc:'airship'},price:{g:0,s:50,c:0},icon:'🎫'},
  '個人馬匹':{cat:'關鍵',t:'自己的馬匹・隨時可騎乘',effect:{misc:'own_horse'},price:{g:2,s:0,c:0},icon:'🐴'},
  '帝國戰馬':{cat:'關鍵',t:'帝國血統戰馬・速度極快',effect:{misc:'war_horse'},price:{g:5,s:0,c:0},icon:'🐴'},
  '小船':{cat:'關鍵',t:'個人小船・可在沿岸航行',effect:{misc:'own_boat'},price:{g:3,s:0,c:0},icon:'⛵'},
  '沙漠駱駝':{cat:'關鍵',t:'南荒沙漠移動用駱駝',effect:{misc:'camel'},price:{g:0,s:30,c:0},icon:'🐪'},
  '雪橇犬隊':{cat:'關鍵',t:'霜嶺地區移動用雪橇犬隊',effect:{misc:'sled'},price:{g:0,s:25,c:0},icon:'🐕'},
  '沼澤小舟':{cat:'關鍵',t:'影沼地移動用小舟',effect:{misc:'marsh_boat'},price:{g:0,s:15,c:0},icon:'🛶'},

  // ══ 關鍵道具 - 劇情道具（不可購買，劇情或探索觸發）══
  '北斗星碎片':{cat:'關鍵',t:'北斗真紋章的碎片・散發微弱光芒',effect:{clue:true},price:null,icon:'⚜️'},
  '北斗星碎片・壹':{cat:'關鍵',t:'北斗真紋章碎片之一・天樞星',effect:{clue:true,idx:1},price:null,icon:'⚜️'},
  '北斗星碎片・貳':{cat:'關鍵',t:'北斗真紋章碎片之二・天璇星',effect:{clue:true,idx:2},price:null,icon:'⚜️'},
  '北斗星碎片・參':{cat:'關鍵',t:'北斗真紋章碎片之三・天璣星',effect:{clue:true,idx:3},price:null,icon:'⚜️'},
  '北斗星碎片・肆':{cat:'關鍵',t:'北斗真紋章碎片之四・天權星',effect:{clue:true,idx:4},price:null,icon:'⚜️'},
  '北斗星碎片・伍':{cat:'關鍵',t:'北斗真紋章碎片之五・玉衡星',effect:{clue:true,idx:5},price:null,icon:'⚜️'},
  '北斗星碎片・陸':{cat:'關鍵',t:'北斗真紋章碎片之六・開陽星',effect:{clue:true,idx:6},price:null,icon:'⚜️'},
  '北斗星碎片・柒':{cat:'關鍵',t:'北斗真紋章碎片之七・搖光星',effect:{clue:true,idx:7},price:null,icon:'⚜️'},
  '北斗星碎片・捌':{cat:'關鍵',t:'北斗真紋章碎片之八・輔星',effect:{clue:true,idx:8},price:null,icon:'⚜️'},
  '北斗星碎片・玖':{cat:'關鍵',t:'北斗真紋章碎片之九・弼星',effect:{clue:true,idx:9},price:null,icon:'⚜️'},
  '北斗星碎片・拾':{cat:'關鍵',t:'北斗真紋章碎片之十・左輔',effect:{clue:true,idx:10},price:null,icon:'⚜️'},
  '北斗星碎片・拾壹':{cat:'關鍵',t:'北斗真紋章碎片之十一・右弼',effect:{clue:true,idx:11},price:null,icon:'⚜️'},
  '北斗星碎片・拾貳':{cat:'關鍵',t:'北斗真紋章碎片之十二・北極',effect:{clue:true,idx:12},price:null,icon:'⚜️'},
  '帝國占星師手記':{cat:'關鍵',t:'記錄108星降世預言的古老手稿',effect:{clue:true},price:null,icon:'📖'},
  '神秘鑰匙':{cat:'關鍵',t:'不知道能打開什麼',effect:{misc:'key'},price:null,icon:'🔑'},
  '暗王的信件':{cat:'關鍵',t:'疑似暗王勢力的密函・已加密',effect:{misc:'dark_letter'},price:null,icon:'📨'},
  '命運之錨碎片':{cat:'關鍵',t:'與橘子產生共鳴的神秘碎片',effect:{orange_stage:true},price:null,icon:'⚓'},
  '古龍之鱗':{cat:'關鍵',t:'龍牙砦深處發現的龍鱗・散發熱力',effect:{misc:'dragon'},price:null,icon:'🐉'},
  '時間裂縫結晶':{cat:'關鍵',t:'從鏽城時間裂縫中結晶的物質',effect:{misc:'time_crystal'},price:null,icon:'💎'},
  '精靈長老的祝福':{cat:'關鍵',t:'翠林長老授予的森之祝福',effect:{buff:'elf_bless'},price:null,icon:'🌿'},
  '霜守堡騎士徽章':{cat:'關鍵',t:'霜守堡流亡騎士團的認證',effect:{misc:'knight_badge'},price:null,icon:'🛡️'},
  '霧刃幫首領面具':{cat:'關鍵',t:'擊敗霧刃幫首領後獲得',effect:{misc:'boss_trophy'},price:null,icon:'🎭'},
  '聖赫倫皇冠碎片':{cat:'關鍵',t:'帝國皇冠的碎片・散發霸王紋章殘響',effect:{crest:'sovereign'},price:null,icon:'👑'},
  '暗王的密令':{cat:'關鍵',t:'暗王勢力的最高密令',effect:{misc:'dark_order'},price:null,icon:'📨'},
  '帝國皇室血書':{cat:'關鍵',t:'帝國皇室傳承的血書・記載真相',effect:{misc:'blood_letter'},price:null,icon:'📜'},
  '世界樹之心':{cat:'關鍵',t:'世界樹的核心・蘊含創世之力',effect:{misc:'world_tree'},price:null,icon:'🌳'},
  '龍王之角':{cat:'關鍵',t:'擊敗龍王獲得・灼熱龍角',effect:{misc:'dragon_horn'},price:null,icon:'🐉'},
  '時之沙漏':{cat:'關鍵',t:'可操縱時間的神器碎片',effect:{misc:'time_glass'},price:null,icon:'⏳'},
  '命運之書':{cat:'關鍵',t:'記載一切命運的禁書',effect:{misc:'fate_book'},price:null,icon:'📕'},
  '北斗真紋章':{cat:'關鍵',t:'集齊碎片後復原的北斗真紋章',effect:{crest:'north_star'},price:null,icon:'⭐'},
  '劍之真紋章':{cat:'關鍵',t:'劍之力的真紋章・攻擊之極',effect:{crest:'sword'},price:null,icon:'⚔️'},
  '盾之真紋章':{cat:'關鍵',t:'盾之力的真紋章・防禦之極',effect:{crest:'shield'},price:null,icon:'🛡️'},
  '霸王紋章':{cat:'關鍵',t:'霸者之力的紋章・統御之極',effect:{crest:'sovereign'},price:null,icon:'👑'},
  '暗之紋章':{cat:'關鍵',t:'暗王之力的紋章・毀滅之極',effect:{crest:'dark'},price:null,icon:'🌑'},
  '星之紋章':{cat:'關鍵',t:'星辰之力的紋章・命運之極',effect:{crest:'star'},price:null,icon:'⭐'},
  '橘子的項圈':{cat:'關鍵',t:'橘子佩戴的神秘項圈・隨好感度變化',effect:{orange_bond:true},price:null,icon:'🐱'},
  '暗王手記':{cat:'關鍵',t:'暗王親筆手記・記錄暗之計劃',effect:{misc:'dark_diary'},price:null,icon:'📖'},
  '帝國遺產封印鑰匙':{cat:'關鍵',t:'開啟帝國遺產封印的鑰匙',effect:{misc:'empire_key'},price:null,icon:'🔑'},
  '蒼穹城飛行許可':{cat:'關鍵',t:'蒼穹城頒發的飛行船駕駛許可',effect:{misc:'flight_license'},price:null,icon:'📜'},
  '深淵之門鑰匙':{cat:'關鍵',t:'通往深淵之門的鑰匙・最終決戰之路',effect:{misc:'abyss_key'},price:null,icon:'🔑'},

  // ══ 追加消耗品 ══
  '鳳凰之淚':{cat:'消耗',t:'復活藥・使一名倒下的同伴復活',effect:{revive:true},price:{g:2,s:0,c:0},icon:'🔥'},
  '全體回復藥':{cat:'消耗',t:'全隊HP+30',effect:{hp:30,all:true},price:{g:0,s:8,c:0},icon:'🧪'},
  '高級全體回復':{cat:'消耗',t:'全隊HP+60',effect:{hp:60,all:true},price:{g:0,s:18,c:0},icon:'🧪'},
  '萬靈丹':{cat:'消耗',t:'解除所有異常+HP+50',effect:{hp:50,cure:'all'},price:{g:0,s:25,c:0},icon:'💊'},
  '神之露':{cat:'消耗',t:'完全回復HP',effect:{hp:9999},price:{g:3,s:0,c:0},icon:'💧'},
  '力量藥劑':{cat:'消耗',t:'暫時武力+10（3回合）',effect:{buff:'rage'},price:{g:0,s:5,c:0},icon:'💪'},
  '知力藥劑':{cat:'消耗',t:'暫時知力+10（3回合）',effect:{buff:'wisdom'},price:{g:0,s:5,c:0},icon:'🧠'},
  '防禦藥劑':{cat:'消耗',t:'暫時防禦+10（3回合）',effect:{buff:'shield'},price:{g:0,s:5,c:0},icon:'🛡️'},
  '速度藥劑':{cat:'消耗',t:'暫時先制+5',effect:{buff:'haste'},price:{g:0,s:5,c:0},icon:'💨'},
  '透明藥劑':{cat:'消耗',t:'暫時隱身・逃跑成功率100%',effect:{buff:'invis'},price:{g:0,s:8,c:0},icon:'👤'},
  '狂暴藥劑':{cat:'消耗',t:'攻擊+50%但防禦-30%',effect:{buff:'rage'},price:{g:0,s:6,c:0},icon:'💢'},
  '解凍劑':{cat:'消耗',t:'解除冰凍狀態',effect:{cure:'freeze'},price:{g:0,s:2,c:0},icon:'🔥'},
  '清醒劑':{cat:'消耗',t:'解除暈眩和致盲',effect:{cure:'stun'},price:{g:0,s:2,c:0},icon:'💊'},
  '聖光之水':{cat:'消耗',t:'解除詛咒・對不死系特效',effect:{cure:'curse'},price:{g:0,s:10,c:0},icon:'✝️'},
  '精靈果實':{cat:'消耗',t:'翠林特產・永久HP上限+2',effect:{maxhp:2},price:{g:0,s:30,c:0},icon:'🍎'},
  '煙霧彈':{cat:'消耗',t:'戰鬥中使用・逃跑成功率+50%',effect:{misc:'smoke'},price:{g:0,s:3,c:0},icon:'💨'},
  '鐵霧烤肉':{cat:'消耗',t:'鐵霧城風味・HP+35',effect:{hp:35},price:{g:0,s:2,c:0},icon:'🥩'},
  '銀月甜點':{cat:'消耗',t:'銀月城名物・HP+40',effect:{hp:40},price:{g:0,s:3,c:0},icon:'🍮'},
  '東港海鮮湯':{cat:'消耗',t:'東海風味・HP+45',effect:{hp:45},price:{g:0,s:3,c:50},icon:'🦐'},
  '翠林藥膳':{cat:'消耗',t:'精靈秘方・HP+50',effect:{hp:50},price:{g:0,s:5,c:0},icon:'🥗'},
  '南荒仙人掌汁':{cat:'消耗',t:'解渴提神',effect:{hp:15,cure:'fatigue'},price:{g:0,s:1,c:0},icon:'🌵'},
  '霜嶺熱湯':{cat:'消耗',t:'禦寒・HP+40',effect:{hp:40,cure:'freeze'},price:{g:0,s:3,c:0},icon:'🍜'},
  '影沼蘑菇湯':{cat:'消耗',t:'增強毒抗・HP+25',effect:{hp:25},price:{g:0,s:2,c:0},icon:'🍄'},
  '高級魚乾':{cat:'消耗',t:'橘子超愛・好感+15',effect:{favor:{orange:15}},price:{g:0,s:3,c:0},icon:'🐟'},
  '精靈魚':{cat:'消耗',t:'橘子夢寐以求・好感+20',effect:{favor:{orange:20}},price:{g:0,s:8,c:0},icon:'🐟'},
  '龍鯉':{cat:'消耗',t:'傳說中的魚・橘子好感+30',effect:{favor:{orange:30}},price:{g:1,s:0,c:0},icon:'🐟'},
  '便當':{cat:'消耗',t:'據點生產・全隊HP+20',effect:{hp:20,all:true},price:null,icon:'🍱'},
  '強化石':{cat:'素材',t:'裝備強化素材',effect:{misc:'enhance'},price:{g:0,s:5,c:0},icon:'🪨'},
  '貿易券':{cat:'素材',t:'可兌換銀幣',effect:{misc:'trade'},price:{g:0,s:1,c:0},icon:'🎫'},
  '布料':{cat:'素材',t:'裁縫素材',effect:{misc:'craft'},price:{g:0,s:2,c:0},icon:'🧵'},
  '獸肉':{cat:'素材',t:'料理素材',effect:{misc:'cook'},price:{g:0,s:1,c:0},icon:'🥩'},
  '草藥':{cat:'素材',t:'煉藥素材',effect:{misc:'craft'},price:{g:0,s:1,c:0},icon:'🌿'},

  // ══ 追加武器 ══
  '闊劍':{cat:'武器',t:'寬刃重劍・適合力量型',slot:'武器',bonus:{武力:18,統率:2},price:{g:0,s:28,c:0},icon:'⚔️'},
  '雙刃劍':{cat:'武器',t:'雙面刃・攻守兼備',slot:'武器',bonus:{武力:20,幸運:2},price:{g:0,s:32,c:0},icon:'⚔️'},
  '附魔劍':{cat:'武器',t:'蘊含魔力的劍',slot:'武器',bonus:{武力:22,知力:5},price:{g:0,s:45,c:0},icon:'⚔️'},
  '聖劍殘片':{cat:'武器',t:'曾經的聖劍・現已破損',slot:'武器',bonus:{武力:30,知力:10,幸運:-3},price:{g:1,s:50,c:0},icon:'⚔️'},
  '暗影劍':{cat:'武器',t:'黑暗之力凝結的劍',slot:'武器',bonus:{武力:35,知力:8,幸運:-5},price:{g:2,s:0,c:0},icon:'🗡️'},
  '星辰劍':{cat:'武器',t:'蘊含星辰之力・傳說武器',slot:'武器',bonus:{武力:40,知力:15,幸運:10},price:null,icon:'⚔️'},
  '天命折刃':{cat:'武器',t:'天魁星降世之器',slot:'武器',bonus:{武力:15},price:null,icon:'⚔️'},
  '雙刃斧':{cat:'武器',t:'雙面戰斧',slot:'武器',bonus:{武力:24,統率:-4},price:{g:0,s:35,c:0},icon:'🪓'},
  '巨斧':{cat:'武器',t:'需要極大力量揮舞',slot:'武器',bonus:{武力:30,統率:-8},price:{g:0,s:50,c:0},icon:'🪓'},
  '符文斧':{cat:'武器',t:'刻有古老符文的斧頭',slot:'武器',bonus:{武力:28,知力:5},price:{g:1,s:0,c:0},icon:'🪓'},
  '長弓':{cat:'武器',t:'射程最遠的弓',slot:'武器',bonus:{武力:16,幸運:5},price:{g:0,s:28,c:0},icon:'🏹'},
  '附魔弓':{cat:'武器',t:'附有追蹤魔法的弓',slot:'武器',bonus:{武力:20,知力:8,幸運:5},price:{g:0,s:50,c:0},icon:'🏹'},
  '星光弓':{cat:'武器',t:'以星辰之力鍛造的弓',slot:'武器',bonus:{武力:30,知力:10,幸運:10},price:null,icon:'🏹'},
  '冰霜杖':{cat:'武器',t:'散發寒氣的法杖',slot:'武器',bonus:{知力:25,統率:3},price:{g:0,s:40,c:0},icon:'🪄'},
  '雷電杖':{cat:'武器',t:'蘊含雷電之力',slot:'武器',bonus:{知力:28,武力:5},price:{g:0,s:50,c:0},icon:'🪄'},
  '賢者杖':{cat:'武器',t:'古代賢者的遺物',slot:'武器',bonus:{知力:35,魅力:5},price:{g:1,s:50,c:0},icon:'🪄'},
  '翠林之杖':{cat:'武器',t:'精靈長老賜予的法杖',slot:'武器',bonus:{知力:32,幸運:8},price:null,icon:'🪄'},
  '暗殺匕首':{cat:'武器',t:'刺客專用・一擊必殺',slot:'武器',bonus:{武力:20,幸運:10},price:{g:0,s:30,c:0},icon:'🗡️'},
  '毒刃':{cat:'武器',t:'塗有劇毒的短刃',slot:'武器',bonus:{武力:16,知力:5},price:{g:0,s:25,c:0},icon:'🗡️'},
  '影匕':{cat:'武器',t:'影沼地鍛造的匕首',slot:'武器',bonus:{武力:22,幸運:8},price:{g:0,s:35,c:0},icon:'🗡️'},
  '鐵槍':{cat:'武器',t:'標準鐵製長槍',slot:'武器',bonus:{武力:14,統率:4},price:{g:0,s:20,c:0},icon:'🔱'},
  '長槍':{cat:'武器',t:'騎兵用長槍',slot:'武器',bonus:{武力:18,統率:6},price:{g:0,s:30,c:0},icon:'🔱'},
  '戰矛':{cat:'武器',t:'重型戰矛',slot:'武器',bonus:{武力:22,統率:8},price:{g:0,s:40,c:0},icon:'🔱'},
  '龍牙槍':{cat:'武器',t:'以龍牙為槍頭',slot:'武器',bonus:{武力:35,統率:10},price:{g:1,s:50,c:0},icon:'🔱'},
  '鐵錘':{cat:'武器',t:'沉重的鐵錘',slot:'武器',bonus:{武力:12,統率:2},price:{g:0,s:15,c:0},icon:'🔨'},
  '戰錘':{cat:'武器',t:'戰鬥用重錘',slot:'武器',bonus:{武力:20,統率:5},price:{g:0,s:30,c:0},icon:'🔨'},
  '聖錘':{cat:'武器',t:'驅邪聖錘',slot:'武器',bonus:{武力:25,知力:10,統率:5},price:{g:1,s:0,c:0},icon:'🔨'},
  '審判之錘':{cat:'武器',t:'審判真紋章共鳴的戰錘',slot:'武器',bonus:{武力:40,統率:15},price:null,icon:'🔨'},
  '木劍':{cat:'武器',t:'訓練用木劍',slot:'武器',bonus:{武力:3},price:{g:0,s:0,c:30},icon:'🗡️'},
  '小刀':{cat:'武器',t:'日常工具・勉強能戰鬥',slot:'武器',bonus:{武力:4,幸運:1},price:{g:0,s:0,c:20},icon:'🔪'},
  '木矛':{cat:'武器',t:'削尖的木棍',slot:'武器',bonus:{武力:5,統率:1},price:{g:0,s:0,c:25},icon:'🔱'},
  '木槌':{cat:'武器',t:'農具改造',slot:'武器',bonus:{武力:4,統率:1},price:{g:0,s:0,c:20},icon:'🔨'},

  // ══ 追加防具 ══
  '布衣':{cat:'防具',t:'最基本的防護',slot:'防具',bonus:{統率:2},price:{g:0,s:0,c:30},icon:'👕'},
  '輕革甲':{cat:'防具',t:'比皮甲更輕便',slot:'防具',bonus:{統率:8,幸運:3},price:{g:0,s:20,c:0},icon:'🦺'},
  '隱匿斗篷':{cat:'防具',t:'暗色斗篷・不易被發現',slot:'防具',bonus:{統率:5,幸運:8},price:{g:0,s:25,c:0},icon:'🧥'},
  '精靈織甲':{cat:'防具',t:'精靈絲織成的輕甲',slot:'防具',bonus:{統率:12,知力:5,幸運:5},price:{g:1,s:0,c:0},icon:'🦺'},
  '夜行衣':{cat:'防具',t:'刺客裝備・行動無聲',slot:'防具',bonus:{統率:8,幸運:10},price:{g:0,s:35,c:0},icon:'🥷'},
  '星光衣':{cat:'防具',t:'蘊含星辰之力的神秘衣物',slot:'防具',bonus:{統率:20,知力:10,幸運:8},price:null,icon:'✨'},
  '鏈甲':{cat:'防具',t:'鐵環相扣的甲胄',slot:'防具',bonus:{統率:10},price:{g:0,s:25,c:0},icon:'🛡️'},
  '鱗甲':{cat:'防具',t:'魚鱗狀金屬片覆蓋的甲胄',slot:'防具',bonus:{統率:14},price:{g:0,s:40,c:0},icon:'🛡️'},
  '鐵胸甲':{cat:'防具',t:'覆蓋胸部的厚重鐵甲',slot:'防具',bonus:{統率:16},price:{g:0,s:45,c:0},icon:'🛡️'},
  '強化鎖甲':{cat:'防具',t:'以特殊工藝強化的鎖子甲',slot:'防具',bonus:{統率:18,幸運:2},price:{g:0,s:55,c:0},icon:'🛡️'},
  '龍鱗甲':{cat:'防具',t:'以龍鱗鍛造的傳說級防具',slot:'防具',bonus:{統率:30,武力:5},price:null,icon:'🐉'},
  '符文甲':{cat:'防具',t:'刻有保護符文的甲胄',slot:'防具',bonus:{統率:22,知力:5},price:{g:1,s:0,c:0},icon:'🔮'},
  '重鐵甲':{cat:'防具',t:'極重的全身甲',slot:'防具',bonus:{統率:25,幸運:-5},price:{g:0,s:60,c:0},icon:'🛡️'},
  '騎士全甲':{cat:'防具',t:'全套騎士甲胄',slot:'防具',bonus:{統率:28,武力:3,幸運:-3},price:{g:1,s:20,c:0},icon:'🛡️'},
  '帝國禁衛甲':{cat:'防具',t:'帝國禁衛隊的遺物',slot:'防具',bonus:{統率:32,武力:5},price:null,icon:'👑'},
  '暗黑騎士甲':{cat:'防具',t:'暗黑騎士的護甲',slot:'防具',bonus:{統率:28,武力:8,幸運:-8},price:null,icon:'🖤'},
  '學徒袍':{cat:'防具',t:'術士學徒的袍子',slot:'防具',bonus:{知力:5,統率:2},price:{g:0,s:10,c:0},icon:'🧙'},
  '術士袍':{cat:'防具',t:'正式術士的袍子',slot:'防具',bonus:{知力:10,統率:4},price:{g:0,s:25,c:0},icon:'🧙'},
  '賢者袍':{cat:'防具',t:'賢者的古老袍子',slot:'防具',bonus:{知力:18,統率:6},price:{g:0,s:50,c:0},icon:'🧙'},
  '月光袍':{cat:'防具',t:'沐浴月光的神秘袍子',slot:'防具',bonus:{知力:22,魅力:8},price:{g:1,s:0,c:0},icon:'🌙'},

  // ══ 追加飾品 ══
  '鐵指環':{cat:'飾品',t:'堅固的鐵戒指',slot:'飾品',bonus:{統率:3},price:{g:0,s:5,c:0},icon:'💍'},
  '銀指環':{cat:'飾品',t:'精美的銀戒指',slot:'飾品',bonus:{幸運:6,魅力:2},price:{g:0,s:12,c:0},icon:'💍'},
  '金指環':{cat:'飾品',t:'華貴的金戒指',slot:'飾品',bonus:{魅力:8,幸運:4},price:{g:0,s:25,c:0},icon:'💍'},
  '紅寶石戒':{cat:'飾品',t:'鑲嵌紅寶石的戒指',slot:'飾品',bonus:{武力:8,幸運:4},price:{g:0,s:35,c:0},icon:'💍'},
  '藍寶石戒':{cat:'飾品',t:'鑲嵌藍寶石的戒指',slot:'飾品',bonus:{知力:8,幸運:4},price:{g:0,s:35,c:0},icon:'💍'},
  '翡翠戒':{cat:'飾品',t:'鑲嵌翡翠的戒指',slot:'飾品',bonus:{統率:8,幸運:4},price:{g:0,s:35,c:0},icon:'💍'},
  '星辰戒':{cat:'飾品',t:'蘊含星辰之力',slot:'飾品',bonus:{武力:5,知力:5,統率:5,魅力:5,幸運:5},price:null,icon:'💍'},
  '龍牙護符':{cat:'飾品',t:'龍牙砦特產',slot:'飾品',bonus:{武力:6,統率:4},price:{g:0,s:20,c:0},icon:'📿'},
  '精靈護符':{cat:'飾品',t:'翠林域精靈製作',slot:'飾品',bonus:{知力:8,幸運:6},price:{g:0,s:25,c:0},icon:'📿'},
  '月光護符':{cat:'飾品',t:'銀月城月神殿祝福',slot:'飾品',bonus:{魅力:10,幸運:5},price:{g:0,s:30,c:0},icon:'📿'},
  '木盾':{cat:'飾品',t:'木製圓盾',slot:'飾品',bonus:{統率:5},price:{g:0,s:5,c:0},icon:'🛡️'},
  '鋼盾':{cat:'飾品',t:'精鋼打造的盾牌',slot:'飾品',bonus:{統率:14},price:{g:0,s:25,c:0},icon:'🛡️'},
  '塔盾':{cat:'飾品',t:'巨大的塔盾・極重',slot:'飾品',bonus:{統率:20,幸運:-5},price:{g:0,s:40,c:0},icon:'🛡️'},
  '龍鱗盾':{cat:'飾品',t:'龍鱗製成的傳說盾牌',slot:'飾品',bonus:{統率:25,武力:5},price:null,icon:'🛡️'},
  '皮帶':{cat:'飾品',t:'普通腰帶',slot:'飾品',bonus:{統率:2,幸運:1},price:{g:0,s:3,c:0},icon:'🪢'},
  '英雄腰帶':{cat:'飾品',t:'英雄公會認證',slot:'飾品',bonus:{武力:5,統率:5},price:{g:0,s:20,c:0},icon:'🪢'},
  '銀手鐲':{cat:'飾品',t:'精美銀飾',slot:'飾品',bonus:{魅力:6,幸運:3},price:{g:0,s:15,c:0},icon:'⭕'},
  '北斗指環':{cat:'飾品',t:'與北斗真紋章共鳴的戒指',slot:'飾品',bonus:{武力:8,知力:8,統率:8,魅力:8,幸運:8},price:null,icon:'🌟'},

  // ══ 追加素材 ══
  '銅礦':{cat:'素材',t:'常見礦石',effect:{misc:'craft'},price:{g:0,s:0,c:15},icon:'🪨'},
  '銀礦':{cat:'素材',t:'較稀有的礦石',effect:{misc:'craft'},price:{g:0,s:2,c:0},icon:'🪨'},
  '金礦':{cat:'素材',t:'貴重金屬礦',effect:{misc:'craft'},price:{g:0,s:8,c:0},icon:'🪨'},
  '秘銀礦':{cat:'素材',t:'傳說中的魔法金屬',effect:{misc:'craft'},price:{g:0,s:30,c:0},icon:'🪨'},
  '鐵錠':{cat:'素材',t:'精煉鐵塊',effect:{misc:'craft'},price:{g:0,s:3,c:0},icon:'🧱'},
  '鋼錠':{cat:'素材',t:'精鋼錠',effect:{misc:'craft'},price:{g:0,s:6,c:0},icon:'🧱'},
  '秘銀錠':{cat:'素材',t:'秘銀精煉錠',effect:{misc:'craft'},price:{g:0,s:35,c:0},icon:'🧱'},
  '皮革':{cat:'素材',t:'皮甲材料',effect:{misc:'craft'},price:{g:0,s:2,c:0},icon:'🧶'},
  '木材':{cat:'素材',t:'建造・鍛造材料',effect:{misc:'craft'},price:{g:0,s:1,c:0},icon:'🪵'},
  '精靈木':{cat:'素材',t:'翠林域特產・魔法木材',effect:{misc:'craft'},price:{g:0,s:15,c:0},icon:'🪵'},
  '絲綢':{cat:'素材',t:'高級布料',effect:{misc:'craft'},price:{g:0,s:8,c:0},icon:'🧵'},
  '精靈絲':{cat:'素材',t:'精靈織造的魔法絲線',effect:{misc:'craft'},price:{g:0,s:20,c:0},icon:'🧵'},
  '琥珀':{cat:'素材',t:'透明的樹脂化石',effect:{misc:'gem'},price:{g:0,s:5,c:0},icon:'💎'},
  '石榴石':{cat:'素材',t:'深紅色寶石',effect:{misc:'gem'},price:{g:0,s:8,c:0},icon:'💎'},
  '月長石':{cat:'素材',t:'散發月光的寶石',effect:{misc:'gem'},price:{g:0,s:12,c:0},icon:'💎'},
  '翡翠':{cat:'素材',t:'翠綠色寶石',effect:{misc:'gem'},price:{g:0,s:15,c:0},icon:'💎'},
  '藍寶石':{cat:'素材',t:'湛藍色寶石',effect:{misc:'gem'},price:{g:0,s:20,c:0},icon:'💎'},
  '紅寶石':{cat:'素材',t:'鮮紅色寶石',effect:{misc:'gem'},price:{g:0,s:20,c:0},icon:'💎'},
  '鑽石':{cat:'素材',t:'最堅硬的寶石',effect:{misc:'gem'},price:{g:0,s:50,c:0},icon:'💎'},
  '星辰石':{cat:'素材',t:'蘊含星辰之力的寶石',effect:{misc:'gem'},price:null,icon:'💎'},
  '哥布林牙':{cat:'素材',t:'哥布林的牙齒',effect:{misc:'drop'},price:{g:0,s:0,c:10},icon:'🦷'},
  '狼皮':{cat:'素材',t:'灰狼的毛皮',effect:{misc:'drop'},price:{g:0,s:1,c:0},icon:'🐺'},
  '蛇毒囊':{cat:'素材',t:'毒蛇的毒囊',effect:{misc:'drop'},price:{g:0,s:2,c:0},icon:'🐍'},
  '蜘蛛絲':{cat:'素材',t:'巨蛛的絲線',effect:{misc:'drop'},price:{g:0,s:1,c:50},icon:'🕸️'},
  '蝙蝠翼':{cat:'素材',t:'蝙蝠的翅膀',effect:{misc:'drop'},price:{g:0,s:0,c:20},icon:'🦇'},
  '骷髏骨':{cat:'素材',t:'不死生物的骨骸',effect:{misc:'drop'},price:{g:0,s:2,c:0},icon:'🦴'},
  '暗影精華':{cat:'素材',t:'暗黑生物的精華',effect:{misc:'drop'},price:{g:0,s:8,c:0},icon:'🖤'},
  '龍鱗':{cat:'素材',t:'龍族的鱗片・極為珍貴',effect:{misc:'drop'},price:{g:0,s:30,c:0},icon:'🐉'},
  '龍牙':{cat:'素材',t:'龍族的牙齒',effect:{misc:'drop'},price:{g:0,s:25,c:0},icon:'🦷'},
  '龍血草':{cat:'素材',t:'沾染龍血的草藥',effect:{misc:'herb'},price:{g:0,s:15,c:0},icon:'🌿'},
  '世界樹果實':{cat:'素材',t:'翠林域世界樹結的果實',effect:{misc:'herb'},price:{g:0,s:20,c:0},icon:'🌳'},
  '月光蘑菇':{cat:'素材',t:'在月光下生長的蘑菇',effect:{misc:'herb'},price:{g:0,s:5,c:0},icon:'🍄'},
  '精靈花':{cat:'素材',t:'翠林域特有的花朵',effect:{misc:'herb'},price:{g:0,s:8,c:0},icon:'🌸'},
  '混沌碎片':{cat:'素材',t:'混沌之力的結晶',effect:{misc:'rare'},price:null,icon:'🌀'},
  '虛無之塵':{cat:'素材',t:'虛無的殘留物',effect:{misc:'rare'},price:null,icon:'⬛'},
  '星辰碎片':{cat:'素材',t:'星辰墜落時的碎片',effect:{misc:'rare'},price:null,icon:'✦'},
  '命運碎片':{cat:'素材',t:'命運之力的結晶',effect:{misc:'rare'},price:null,icon:'⚜️'},
  '創世碎片':{cat:'素材',t:'創世之力的殘片',effect:{misc:'rare'},price:null,icon:'🌌'},
  '冰霜結晶':{cat:'素材',t:'極寒之力的結晶',effect:{misc:'drop'},price:{g:0,s:10,c:0},icon:'❄️'},
  '火焰結晶':{cat:'素材',t:'烈火之力的結晶',effect:{misc:'drop'},price:{g:0,s:10,c:0},icon:'🔥'},
  '風之結晶':{cat:'素材',t:'狂風之力的結晶',effect:{misc:'drop'},price:{g:0,s:10,c:0},icon:'🌪️'},
  '鷹羽':{cat:'素材',t:'鷹身女妖的羽毛',effect:{misc:'drop'},price:{g:0,s:5,c:0},icon:'🪶'},
  '鳳凰羽':{cat:'素材',t:'傳說中的鳳凰之羽',effect:{misc:'rare'},price:null,icon:'🔥'},
  '巨魔牙':{cat:'素材',t:'洞穴巨魔的巨牙',effect:{misc:'drop'},price:{g:0,s:3,c:0},icon:'🦷'},
  '蜥蜴鱗':{cat:'素材',t:'蜥蜴人的鱗片',effect:{misc:'drop'},price:{g:0,s:2,c:0},icon:'🦎'},
  '海獸牙':{cat:'素材',t:'海獸的牙齒',effect:{misc:'drop'},price:{g:0,s:6,c:0},icon:'🦑'},
  '深海珊瑚':{cat:'素材',t:'深海產的珍貴珊瑚',effect:{misc:'drop'},price:{g:0,s:12,c:0},icon:'🪸'},
};

// 從 ITEM_DB 查詢道具資料
function getItemData(name){return ITEM_DB[name]||null;}

// 使用消耗品
function useItem(itemName){
  const inv=getInv();
  const idx=inv.items.findIndex(i=>i.n===itemName);
  if(idx===-1){showToast('沒有此道具','err');return;}
  const data=ITEM_DB[itemName];
  if(!data){showToast('無法使用此道具','inf');return;}
  // HP 回復
  if(data.effect?.hp){
    applyHPChange([{id:'alfar',delta:data.effect.hp,reason:itemName}]);
    appendEntryToDOM({type:'sys',v:`✦ 使用 ${itemName}：HP +${data.effect.hp}`});
  }
  // 好感度
  else if(data.effect?.favor){
    Object.entries(data.effect.favor).forEach(([id,val])=>{
      setFavor(id,val);
      const name=getCharData(id)?.name||id;
      appendEntryToDOM({type:'sys',v:`✦ 使用 ${itemName}：${name} 好感 +${val}`});
    });
  }
  // 解除狀態
  else if(data.effect?.cure){
    appendEntryToDOM({type:'sys',v:`✦ 使用 ${itemName}：狀態解除（${data.effect.cure}）`});
  }
  // 其他
  else{
    appendEntryToDOM({type:'sys',v:`✦ 使用 ${itemName}`});
  }
  // 扣除數量
  const item=inv.items[idx];
  const qm=item.q.match(/(\d+)/);
  const qty=qm?parseInt(qm[1]):1;
  if(qty<=1)inv.items.splice(idx,1);
  else item.q='×'+(qty-1);
  renderChanged('inv');saveGame();scrollD();
  showToast(`使用了 ${itemName}`,'ok');
}

// ═══ BGM ENGINE — 東野美紀風格・FM合成 ═══
// 音符頻率（C2-C6）
const _N=(()=>{const n={};const names=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];for(let o=2;o<=6;o++)names.forEach((nm,i)=>{n[nm+o]=440*Math.pow(2,(o-4)+(i-9)/12);});return n;})();
const BGM={
  ctx:null,master:null,playing:false,mood:'explore',vol:0.3,_timers:[],_lid:0,
  // ── FM合成樂器 ──
  _fm(freq,t,dur,opts){
    // opts: {type,mod,idx,atk,dec,sus,rel,vol,pan,vibRate,vibDepth}
    const c=this.ctx,o=opts||{};
    const car=c.createOscillator(),cg=c.createGain();
    car.type=o.type||'sine';car.frequency.value=freq;
    // FM 調變器
    if(o.mod){const m=c.createOscillator(),mg=c.createGain();m.frequency.value=freq*o.mod;mg.gain.value=freq*(o.idx||1);m.connect(mg);mg.connect(car.frequency);m.start(t);m.stop(t+dur+0.1);}
    // 顫音
    if(o.vibRate){const v=c.createOscillator(),vg=c.createGain();v.frequency.value=o.vibRate;vg.gain.value=o.vibDepth||3;v.connect(vg);vg.connect(car.frequency);v.start(t);v.stop(t+dur+0.1);}
    // ADSR 包絡
    const a=o.atk||0.05,d=o.dec||0.1,s=o.sus||0.7,r=o.rel||0.3,v=o.vol||0.1;
    cg.gain.setValueAtTime(0,t);
    cg.gain.linearRampToValueAtTime(v,t+a);
    cg.gain.linearRampToValueAtTime(v*s,t+a+d);
    cg.gain.setValueAtTime(v*s,t+dur-r);
    cg.gain.linearRampToValueAtTime(0,t+dur);
    // 聲像
    let dest=this._bus;
    if(o.pan&&c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=o.pan;car.connect(cg);cg.connect(p);p.connect(dest);}
    else{car.connect(cg);cg.connect(dest);}
    car.start(t);car.stop(t+dur+0.05);
  },
  // 預設樂器
  _flute(f,t,d,v){this._fm(f,t,d,{type:'sine',mod:2,idx:0.5,atk:0.12,dec:0.1,sus:0.8,rel:0.25,vol:v||0.09,vibRate:5,vibDepth:3});},
  _strings(f,t,d,v){// 3層疊加模擬弦樂
    const vol=(v||0.04);
    this._fm(f,t,d,{type:'sine',atk:0.3,dec:0.2,sus:0.85,rel:0.5,vol:vol,vibRate:4.5,vibDepth:2,pan:-0.2});
    this._fm(f*1.002,t,d,{type:'sine',atk:0.35,dec:0.2,sus:0.85,rel:0.5,vol:vol*0.7,pan:0.2});
    this._fm(f*0.998,t,d,{type:'sine',atk:0.32,dec:0.2,sus:0.85,rel:0.5,vol:vol*0.5});
  },
  _harp(f,t,d,v){this._fm(f,t,d,{type:'sine',mod:3,idx:0.3,atk:0.01,dec:0.15,sus:0.3,rel:0.4,vol:v||0.07});},
  _bass(f,t,d,v){this._fm(f,t,d,{type:'sine',mod:1,idx:0.2,atk:0.05,dec:0.15,sus:0.9,rel:0.3,vol:v||0.08});},
  _bell(f,t,d,v){this._fm(f,t,d,{type:'sine',mod:5.01,idx:1.5,atk:0.01,dec:0.5,sus:0.1,rel:0.8,vol:v||0.04});},
  // ── 作曲資料 ──
  // 格式：[音名, 拍數] 如 ['E4',1] = E4音1拍。0=休止。
  // 每首80-120拍 @ 各自BPM → 約 1.5-3分鐘一循環
  // 曲目使用音名字串，播放時查 _N 表轉頻率
  songs:{
    // ───「星辰之路」探索主題 ~2.5min @ 84bpm ─ 東野美紀風：溫柔五聲旋律＋弦樂和聲───
    explore:{bpm:84,inst:'flute',
      melody:[ // Intro(4小節) → A(8) → B(8) → A'(8) → Outro(4) = 32小節 × 4拍 = 128拍
        // Intro：豎琴琶音引入
        ['E4',2],['G4',1],['A4',1],['C5',2],[0,2],['D5',1],['C5',1],['A4',1],['G4',1],[0,4],
        ['E4',1],['G4',1],['A4',2],[0,2],['G4',1],['E4',1],['D4',2],[0,4],
        // A段：問句——溫柔的五聲上行
        ['E4',1],['G4',1],['A4',1.5],['G4',0.5],['E4',1],['D4',1],['C4',2],[0,1],['D4',0.5],['E4',0.5],
        ['G4',1],['A4',1],['C5',1.5],['A4',0.5],['G4',2],[0,2],
        ['A4',1],['C5',1],['D5',1.5],['C5',0.5],['A4',1],['G4',1],['E4',1.5],['D4',0.5],
        ['E4',2],['G4',1],['A4',1],['G4',2],[0,2],
        // A段答句——稍高
        ['C5',1],['D5',1],['E5',1.5],['D5',0.5],['C5',1],['A4',1],['G4',2],[0,1],['A4',0.5],['C5',0.5],
        ['D5',1],['C5',1],['A4',1.5],['G4',0.5],['E4',2],[0,2],
        ['G4',1],['A4',1],['C5',1],['D5',1],['E5',2],['D5',1],['C5',1],
        ['A4',1.5],['G4',0.5],['E4',1],['D4',1],['C4',3],[0,1],
        // B段：情感展開——更高的音域
        ['E5',2],['D5',1],['C5',1],['A4',1],['C5',1],['D5',2],[0,1],['E5',0.5],['D5',0.5],
        ['C5',1.5],['A4',0.5],['G4',1],['A4',1],['C5',2],['D5',1],[0,1],
        ['E5',1.5],['D5',0.5],['C5',1],['D5',1],['E5',1],['G5',1],['E5',2],
        ['D5',1],['C5',1],['A4',1.5],['G4',0.5],['A4',2],[0,2],
        // B'段回落
        ['C5',1],['A4',1],['G4',1.5],['E4',0.5],['D4',1],['E4',1],['G4',2],[0,1],['A4',0.5],['G4',0.5],
        ['E4',1.5],['D4',0.5],['C4',1],['D4',1],['E4',2],[0,2],
        ['G4',1],['A4',1],['C5',1.5],['A4',0.5],['G4',2],['E4',1],[0,1],
        ['D4',1],['E4',1],['G4',1.5],['E4',0.5],['D4',1],['C4',2],[0,1],
        // Outro：漸弱回歸
        ['E4',2],['G4',2],['A4',3],[0,1],['G4',1],['E4',1],['D4',2],['C4',4],[0,4],
      ],
      chords:[ // [根,三,五,拍] — I vi IV V 進行為基底
        ['C3','E3','G3',4],['A2','C3','E3',4],['F2','A2','C3',4],['G2','B2','D3',4], // Intro
        ['C3','E3','G3',4],['A2','C3','E3',4],['D3','F3','A3',4],['G2','B2','D3',4],
        ['C3','E3','G3',4],['A2','C3','E3',4],['F2','A2','C3',4],['G2','B2','D3',4], // A
        ['C3','E3','G3',4],['F2','A2','C3',4],['D3','F3','A3',4],['G2','B2','D3',4],
        ['C3','E3','G3',4],['A2','C3','E3',4],['F2','A2','C3',4],['G2','B2','D3',4], // A'
        ['C3','E3','G3',4],['F2','A2','C3',4],['A2','C3','E3',4],['G2','B2','D3',4],
        ['F2','A2','C3',4],['G2','B2','D3',4],['A2','C3','E3',4],['G2','B2','D3',4], // B
        ['F2','A2','C3',4],['E2','G2','B2',4],['F2','A2','C3',4],['G2','B2','D3',4],
        ['C3','E3','G3',4],['A2','C3','E3',4],['F2','A2','C3',4],['G2','B2','D3',4], // B'
        ['C3','E3','G3',4],['D3','F3','A3',4],['A2','C3','E3',4],['G2','B2','D3',4],
        ['C3','E3','G3',8],['F2','A2','C3',4],['G2','B2','D3',4], // Outro
      ],
      bass:[
        ['C2',4],['A2',4],['F2',4],['G2',4],['C2',4],['A2',4],['D2',4],['G2',4],
        ['C2',2],['G2',2],['A2',2],['E2',2],['F2',2],['C2',2],['G2',2],['D2',2],
        ['C2',2],['G2',2],['F2',2],['C2',2],['D2',2],['A2',2],['G2',2],['D2',2],
        ['C2',2],['G2',2],['A2',2],['E2',2],['F2',2],['C2',2],['A2',2],['G2',2],
        ['C2',2],['G2',2],['F2',2],['C2',2],['D2',2],['A2',2],['G2',4],
        ['F2',2],['C2',2],['G2',2],['D2',2],['A2',2],['E2',2],['F2',2],['G2',2],
        ['C2',2],['G2',2],['A2',2],['E2',2],['F2',2],['C2',2],['G2',2],['D2',2],
        ['C2',2],['G2',2],['F2',2],['D2',2],['A2',2],['E2',2],['G2',4],
        ['C2',4],['A2',4],['F2',4],['G2',4],['C2',8],
      ],
    },
    // ───「霧鎮黃昏」城鎮曲 ~2min @ 100bpm ─ 幻水Gregminster風───
    town:{bpm:100,inst:'harp',
      melody:[
        ['G4',0.5],['A4',0.5],['C5',1],['D5',1],['C5',0.5],['A4',0.5],['G4',2],[0,1],['E4',0.5],['G4',0.5],
        ['A4',1],['G4',0.5],['E4',0.5],['D4',1],['E4',1],['G4',2],[0,2],
        ['C5',1],['D5',0.5],['E5',0.5],['D5',1],['C5',1],['A4',1],['G4',0.5],['A4',0.5],['C5',2],
        ['A4',0.5],['G4',0.5],['E4',1],['D4',1],['C4',2],[0,2],
        ['E5',0.5],['D5',0.5],['C5',0.5],['A4',0.5],['G4',1],['A4',1],['C5',1],['D5',1],['E5',1],[0,1],
        ['D5',1],['C5',0.5],['A4',0.5],['G4',1],['E4',1],['G4',2],[0,2],
        ['C5',1.5],['D5',0.5],['E5',1],['D5',1],['C5',0.5],['A4',0.5],['G4',1],['A4',1],['G4',2],
        ['E4',1],['G4',0.5],['A4',0.5],['G4',1],['E4',0.5],['D4',0.5],['C4',3],[0,1],
        // 重複A段（微變）
        ['G4',0.5],['A4',0.5],['C5',1.5],['D5',0.5],['E5',1],['D5',0.5],['C5',0.5],['A4',2],[0,1],['G4',0.5],['A4',0.5],
        ['C5',1],['A4',0.5],['G4',0.5],['E4',1],['G4',1],['A4',2],[0,2],
        ['D5',1],['C5',1],['A4',0.5],['G4',0.5],['A4',1],['C5',1],['D5',1.5],['C5',0.5],['A4',2],
        ['G4',1],['E4',0.5],['D4',0.5],['E4',1],['G4',1],['C4',3],[0,1],
      ],
      chords:[
        ['C3','E3','G3',4],['F3','A3','C4',4],['G3','B3','D4',4],['C3','E3','G3',4],
        ['A2','C3','E3',4],['F3','A3','C4',4],['G3','B3','D4',4],['C3','E3','G3',4],
        ['F3','A3','C4',4],['G3','B3','D4',4],['A2','C3','E3',4],['E3','G3','B3',4],
        ['F3','A3','C4',4],['G3','B3','D4',4],['C3','E3','G3',8],
        ['C3','E3','G3',4],['F3','A3','C4',4],['G3','B3','D4',4],['A2','C3','E3',4],
        ['D3','F3','A3',4],['G3','B3','D4',4],['A2','C3','E3',4],['G3','B3','D4',4],
        ['C3','E3','G3',8],
      ],
      bass:[
        ['C2',2],['G2',2],['F2',2],['C2',2],['G2',2],['D2',2],['C2',2],['G2',2],
        ['A2',2],['E2',2],['F2',2],['C2',2],['G2',2],['D2',2],['C2',4],
        ['F2',2],['C2',2],['G2',2],['D2',2],['A2',2],['E2',2],['E2',2],['B2',2],
        ['F2',2],['C2',2],['G2',2],['D2',2],['C2',4],
        ['C2',2],['G2',2],['F2',2],['C2',2],['G2',2],['D2',2],['A2',2],['E2',2],
        ['D2',2],['A2',2],['G2',2],['D2',2],['A2',2],['E2',2],['G2',2],['D2',2],
        ['C2',4],
      ],
    },
    // ───「月下獨行」夜晚曲 ~3min @ 58bpm───
    night:{bpm:58,inst:'bell',
      melody:[
        ['E4',3],['G4',2],['A4',4],[0,1],['G4',2],['E4',1],['D4',3],['C4',3],[0,2],
        ['A4',3],['G4',1.5],['E4',1.5],['G4',4],['E4',1],['D4',5],[0,4],
        ['C5',3],['A4',2],['G4',3],['E4',2],['D4',2],['E4',2],['G4',5],[0,2],
        ['A4',3],['G4',1.5],['E4',1.5],['D4',3],['C4',5],[0,6],
        // B段
        ['E4',2],['G4',3],['A4',2],['C5',3],['A4',2],['G4',2],[0,2],
        ['D5',3],['C5',2],['A4',3],['G4',2],['E4',5],[0,4],
        ['A4',2],['C5',2],['D5',3],['C5',2],['A4',2],['G4',3],['E4',2],[0,2],
        ['D4',2],['E4',3],['G4',2],['E4',2],['D4',2],['C4',6],[0,6],
      ],
      chords:[
        ['C3','E3','G3',10],['A2','C3','E3',10],['F2','A2','C3',8],['G2','B2','D3',8],
        ['A2','C3','E3',10],['D3','F3','A3',10],['G2','B2','D3',8],[0,0,0,6],
        ['F2','A2','C3',8],['G2','B2','D3',8],['C3','E3','G3',10],['A2','C3','E3',10],
        ['D3','F3','A3',8],['G2','B2','D3',8],['C3','E3','G3',12],
      ],
      bass:[
        ['C2',5],['G2',5],['A2',5],['E2',5],['F2',4],['D2',4],['G2',8],
        ['A2',5],['D2',5],['G2',8],[0,6],
        ['F2',4],['C2',4],['G2',4],['D2',4],['C2',5],['A2',5],
        ['D2',4],['A2',4],['G2',4],['D2',4],['C2',12],
      ],
    },
    // ───「星辰的眼淚」哀愁曲 ~2min @ 68bpm ─ Cm───
    sad:{bpm:68,inst:'flute',
      melody:[
        ['Eb4',2],['G4',1.5],['Ab4',0.5],['G4',2],['Eb4',2],['D4',2],['C4',3],[0,1],
        ['Ab4',2],['G4',1],['Eb4',1],['G4',3],['Eb4',1],['D4',4],[0,4],
        ['C5',2],['Bb4',1],['Ab4',1],['G4',2],['Eb4',2],['G4',2],['Ab4',2],['G4',4],
        ['Eb4',2],['D4',2],['C4',4],[0,4],
        // B段
        ['Eb5',2],['D5',1],['C5',1],['Bb4',2],['Ab4',2],['G4',2],['Ab4',2],['Bb4',4],
        ['Ab4',2],['G4',1],['Eb4',1],['D4',2],['C4',2],['Eb4',3],[0,1],
        ['G4',2],['Ab4',2],['Bb4',2],['Ab4',1],['G4',1],['Eb4',2],['D4',2],['C4',4],
        ['Eb4',2],['D4',1],['C4',1],['D4',2],['Eb4',2],['C4',5],[0,3],
      ],
      chords:[
        ['C3','Eb3','G3',8],['Ab2','C3','Eb3',8],['G2','B2','D3',8],['C3','Eb3','G3',4],[0,0,0,4],
        ['F3','Ab3','C4',8],['Eb3','G3','Bb3',8],['Ab2','C3','Eb3',4],['G2','B2','D3',4],['C3','Eb3','G3',8],
        ['Ab2','C3','Eb3',8],['Bb2','D3','F3',8],['Eb3','G3','Bb3',8],['Ab2','C3','Eb3',4],['G2','B2','D3',4],
        ['C3','Eb3','G3',4],['Ab2','C3','Eb3',4],['G2','B2','D3',4],['C3','Eb3','G3',4],[0,0,0,4],
      ],
      bass:[
        ['C2',4],['G2',4],['Ab2',4],['Eb2',4],['G2',4],['D2',4],['C2',8],
        ['F2',4],['C2',4],['Eb2',4],['Bb2',4],['Ab2',4],['Eb2',4],['G2',4],['D2',4],['C2',8],
        ['Ab2',4],['Eb2',4],['Bb2',4],['F2',4],['Eb2',4],['Bb2',4],['Ab2',4],['G2',4],
        ['C2',4],['Ab2',4],['G2',4],['C2',8],
      ],
    },
    // ───「暗雲」緊張曲 ~1.5min @ 92bpm ─ Am───
    tension:{bpm:92,inst:'strings',
      melody:[
        ['E4',0.5],['E4',0.5],['E4',0.5],[0,0.5],['E4',0.5],['G4',0.5],['A4',1],['E4',1],[0,1],['D4',0.5],['E4',0.5],
        ['A4',1],['G4',0.5],['E4',0.5],['D4',1],['E4',2],[0,1],['E4',0.5],['G4',0.5],
        ['A4',1],['C5',1],['B4',0.5],['A4',0.5],['G4',1],['A4',1],['C5',2],['A4',1],['G4',1],
        ['E4',1],['D4',0.5],['E4',0.5],['D4',1],['C4',2],[0,3],
        // B段
        ['C5',1],['B4',0.5],['A4',0.5],['G4',1],['A4',1],['B4',1],['C5',1],['E5',2],[0,2],
        ['D5',1],['C5',0.5],['B4',0.5],['A4',1],['G4',1],['E4',2],[0,2],
        ['A4',1],['C5',1],['B4',0.5],['A4',0.5],['G4',1],['A4',1],['B4',2],['A4',2],
        ['G4',1],['E4',0.5],['D4',0.5],['E4',2],['A3',2],[0,4],
      ],
      chords:[
        ['A2','C3','E3',4],['A2','C3','E3',4],['D3','F3','A3',4],['E3','G3','B3',4],
        ['A2','C3','E3',4],['F3','A3','C4',4],['D3','F3','A3',4],['E3','G3','B3',4],
        ['A2','C3','E3',4],['G2','B2','D3',4],['F2','A2','C3',4],['E2','G2','B2',4],
        ['A2','C3','E3',4],['D3','F3','A3',4],['E3','G3','B3',4],['A2','C3','E3',8],
      ],
      bass:[
        ['A2',1],['A2',1],['A2',1],['A2',1],['A2',1],['A2',1],['D2',1],['D2',1],
        ['E2',1],['E2',1],['E2',1],['E2',1],
        ['A2',1],['A2',1],['F2',1],['F2',1],['D2',1],['D2',1],['E2',2],
        ['A2',1],['A2',1],['G2',1],['G2',1],['F2',1],['F2',1],['E2',1],['E2',1],
        ['A2',1],['A2',1],['D2',1],['D2',1],['E2',2],['A2',4],
      ],
    },
    // ───「命運之刃」戰鬥曲 ~1.5min @ 140bpm ─ Am───
    battle:{bpm:140,inst:'strings',
      melody:[
        ['E5',0.5],['D5',0.5],['C5',0.5],['D5',0.5],['E5',1],['G5',1],['E5',1],[0,0.5],['D5',0.5],
        ['C5',0.5],['D5',0.5],['E5',1],['D5',0.5],['C5',0.5],['A4',1],['G4',1],[0,1],
        ['A4',0.5],['C5',0.5],['D5',1],['E5',1],['G5',0.5],['E5',0.5],['D5',1],['C5',1],['D5',1],['E5',1],
        ['A4',0.5],['C5',0.5],['D5',1],['C5',0.5],['A4',0.5],['G4',1],['E4',1],[0,2],
        ['G5',1],['E5',0.5],['D5',0.5],['E5',1],['C5',1],['D5',1],['E5',1],['G5',1],[0,1],
        ['A5',1],['G5',0.5],['E5',0.5],['D5',1],['C5',1],['A4',2],[0,2],
        ['E5',1],['D5',0.5],['C5',0.5],['D5',1],['E5',1],['G5',1.5],['E5',0.5],['D5',1],['C5',1],
        ['A4',0.5],['C5',0.5],['E5',1],['D5',0.5],['C5',0.5],['A4',2],[0,2],
      ],
      chords:[
        ['A2','C3','E3',2],['A2','C3','E3',2],['G2','B2','D3',2],['G2','B2','D3',2],
        ['F2','A2','C3',2],['F2','A2','C3',2],['E2','G2','B2',2],['E2','G2','B2',2],
        ['A2','C3','E3',2],['D3','F3','A3',2],['G2','B2','D3',2],['E2','G2','B2',2],
        ['A2','C3','E3',2],['D3','F3','A3',2],['E2','G2','B2',4],
        ['A2','C3','E3',2],['G2','B2','D3',2],['F2','A2','C3',2],['E2','G2','B2',2],
        ['F2','A2','C3',2],['G2','B2','D3',2],['A2','C3','E3',4],
        ['A2','C3','E3',2],['G2','B2','D3',2],['F2','A2','C3',2],['E2','G2','B2',2],
        ['D3','F3','A3',2],['E2','G2','B2',2],['A2','C3','E3',4],
      ],
      bass:[
        ['A2',0.5],[0,0.5],['A2',0.5],[0,0.5],['G2',0.5],[0,0.5],['G2',0.5],[0,0.5],
        ['F2',0.5],[0,0.5],['F2',0.5],[0,0.5],['E2',0.5],[0,0.5],['E2',0.5],[0,0.5],
        ['A2',0.5],[0,0.5],['D2',0.5],[0,0.5],['G2',0.5],[0,0.5],['E2',0.5],[0,0.5],
        ['A2',0.5],[0,0.5],['D2',0.5],[0,0.5],['E2',1],['E2',1],
        ['A2',0.5],[0,0.5],['G2',0.5],[0,0.5],['F2',0.5],[0,0.5],['E2',0.5],[0,0.5],
        ['F2',0.5],[0,0.5],['G2',0.5],[0,0.5],['A2',1],['A2',1],
        ['A2',0.5],[0,0.5],['G2',0.5],[0,0.5],['F2',0.5],[0,0.5],['E2',0.5],[0,0.5],
        ['D2',0.5],[0,0.5],['E2',0.5],[0,0.5],['A2',1],['A2',1],
      ],
    },
  },
  init(){
    if(this.ctx)return;
    try{this.ctx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){console.warn('AudioContext unavailable');return;}
    this.master=this.ctx.createGain();this.master.gain.value=this.vol;
    // 混響
    const rate=this.ctx.sampleRate,len=rate*2,buf=this.ctx.createBuffer(2,len,rate);
    for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.2)*0.4;}
    const conv=this.ctx.createConvolver();conv.buffer=buf;
    const wet=this.ctx.createGain();wet.gain.value=0.3;
    this._bus=this.ctx.createGain();this._bus.gain.value=1;
    this._bus.connect(this.master);this._bus.connect(conv);conv.connect(wet);wet.connect(this.master);
    this.master.connect(this.ctx.destination);
  },
  _play(){
    if(!this.playing||!this.ctx)return;
    const id=++this._lid;
    const song=this.songs[this.mood]||this.songs.explore;
    const beat=60/song.bpm;
    const now=this.ctx.currentTime+0.2;
    const N=n=>typeof n==='string'?_N[n]:n;
    let t=0;
    // 主旋律
    const instFn=this['_'+(song.inst||'flute')].bind(this);
    song.melody.forEach(([n,b])=>{const f=N(n);if(f>0)instFn(f,now+t*beat,b*beat*0.88,0.10);t+=b;});
    const totalBeats=t;
    // 弦樂和聲 + 豎琴琶音
    let ct=0;
    (song.chords||[]).forEach(([r,th,fi,b])=>{
      const fr=N(r),ft=N(th),ff=N(fi);
      if(fr>0){
        const d=b*beat;
        this._strings(fr,now+ct*beat,d*0.95,0.035);
        if(ft>0)this._strings(ft,now+ct*beat,d*0.95,0.025);
        if(ff>0)this._strings(ff,now+ct*beat,d*0.95,0.025);
        // 豎琴琶音（每拍一個音，輪流根三五）
        const arpNotes=[fr,ft,ff].filter(x=>x>0);
        for(let i=0;i<b&&arpNotes.length;i++){
          this._harp(arpNotes[i%arpNotes.length]*2,now+(ct+i)*beat,beat*0.5,0.03);
        }
      }
      ct+=b;
    });
    // 低音
    let bt=0;
    (song.bass||[]).forEach(([n,b])=>{const f=N(n);if(f>0)this._bass(f,now+bt*beat,b*beat*0.9,0.07);bt+=b;});
    // 循環
    const ms=totalBeats*beat*1000;
    const tid=setTimeout(()=>{if(this._lid===id)this._play();},ms-300);
    this._timers.push(tid);
  },
  _silence(){
    // 停止循環 + 斷開音訊節點（已排程的振盪器會播完但聽不到）
    this._lid++;
    this._timers.forEach(t=>clearTimeout(t));this._timers=[];
    if(this.master){try{this.master.disconnect();}catch(_){}}
  },
  _reconnect(){
    // 重新連接 master 到 destination
    if(this.master&&this.ctx){try{this.master.connect(this.ctx.destination);}catch(_){}}
  },
  start(){
    this.init();
    if(!this.ctx)return;
    if(this.ctx.state==='suspended')this.ctx.resume();
    this._silence(); // 停掉舊的
    this._reconnect(); // 重新接上
    this.playing=true;
    if(this.master)this.master.gain.setValueAtTime(this.vol,this.ctx.currentTime);
    this._play();
    this._updateUI(true);
    localStorage.setItem('fate_bgm','1');
  },
  stop(){
    this.playing=false;
    this._silence();
    this._updateUI(false);
    localStorage.setItem('fate_bgm','0');
  },
  setMood(mood){
    if(!this.songs[mood])return;
    if(mood===this.mood)return;
    this.mood=mood;
    localStorage.setItem('fate_bgm_mood',mood);
    const sel=document.getElementById('bgm-mood');if(sel)sel.value=mood;
    if(this.playing){this._silence();this._reconnect();if(this.master)this.master.gain.setValueAtTime(this.vol,this.ctx.currentTime);this._play();}
  },
  setVolume(v){
    this.vol=Math.max(0,Math.min(1,v));
    if(this.master)this.master.gain.value=this.vol;
    localStorage.setItem('fate_bgm_vol',this.vol);
  },
  _updateUI(on){
    const btn=document.getElementById('bgm-toggle');
    if(btn)btn.textContent=on?'🔇 關閉音樂':'🎵 開啟音樂';
    const wave=document.getElementById('bgm-icon-wave');
    if(wave)wave.style.opacity=on?'1':'.4';
  },
  autoMood(sceneTitle,sceneLoc){
    const t=(sceneTitle||'')+(sceneLoc||'');
    let mood='explore';
    if(/(戰鬥|決鬥|襲擊|交戰|追擊|攻打|衝突)/.test(t))mood='battle';
    else if(/(危機|逃|追兵|暗殺|陷阱|包圍|緊急)/.test(t))mood='tension';
    else if(/(城|鎮|村|街|市|港|酒館|客棧|旅店|商店|工會|公會)/.test(t))mood='town';
    else if(/(夜|深夜|凌晨|月|星空|營火)/.test(t))mood='night';
    else if(/(別離|犧牲|悲|喪|哀|墓|遺)/.test(t))mood='sad';
    this.setMood(mood);
  },
  restore(){
    this.vol=parseFloat(localStorage.getItem('fate_bgm_vol'))||0.3;
    this.mood=localStorage.getItem('fate_bgm_mood')||'explore';
    const volEl=document.getElementById('bgm-vol');if(volEl)volEl.value=this.vol*100;
    const sel=document.getElementById('bgm-mood');if(sel)sel.value=this.mood;
    if(localStorage.getItem('fate_bgm')==='1'){
      const handler=()=>{this.start();document.removeEventListener('click',handler);document.removeEventListener('touchstart',handler);};
      document.addEventListener('click',handler);
      document.addEventListener('touchstart',handler);
      this._updateUI(true);
    }
  }
};
function toggleBGM(){if(BGM.playing)BGM.stop();else BGM.start();}
function changeBGMMood(v){BGM.setMood(v);}
function setBGMVolume(v){BGM.setVolume(v);}

// ═══ API ═══
const SYS=`你是文字RPG引擎。只輸出純JSON，從{開始到}結束，不加任何其他文字。

世界觀：艾爾薩大陸，帝國崩裂，十二國割據。北斗星下齊聚的108顆命運之星降世。
主角艾爾法😒（天魁星）：銀髮旅人，面無表情，來歷不明。沒有職業、沒有過去。玩家扮演她——玩家的每一句選擇就是艾爾法說的話或做的事。
橘子🐈😒（晁蓋之位・命運之錨）：布偶貓，不屬於108星，卻是引導星辰聚合的關鍵存在。只說「喵」，之後緊接系統翻譯。知力99。如同水滸傳中的晁蓋。

核心原則：水滸傳＋幻想水滸傳風格，西方奇幻劍與魔法世界。逼上梁山、義氣為核、招募即主線。文風：劍與魔法戰鬥＋吐槽日常。敘述要有畫面感，像小說一樣描寫場景、動作、表情。對話要有個性，每個角色有獨特的說話方式。橘子永遠是冷面吐槽擔當。適時加入幽默元素。戰鬥場面要緊湊刺激。
紋章系統：世界有27枚真紋章（始源/元素/天體/生滅/支配/奧義/命運），持有者獲得強大力量但承受詛咒。一般紋章為真紋章碎片衍生，可裝備使用。

═══ 回應格式（所有欄位必填，不用的填null）═══
{"st":"場景標題","sl":"📍 地點","nv":["敘述段落1","段落2"],"dl":[{"sp":"角色名emoji","ln":"台詞"}],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[{"t":"艾爾法可說可做的事","h":"後果提示"}],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null,"cr":null}

═══ 必遵守規則 ═══
【回應結構】每次回應必須包含：
- nv：1-3段敘述（每段60-80字），描寫艾爾法行動的過程、結果、場景變化
- dl：至少1-2句對話（NPC反應、橘子的喵、路人的話等）
- ch：3-4個選項，是艾爾法接下來可以「說」或「做」的事，用她的口吻寫。h欄位寫後果提示。

【橘子的台詞格式】必須是兩行：
  {"sp":"橘子🐈😒","ln":"喵——"},{"sp":"系統","ln":"〔翻譯：實際意思〕"}

【星辰登場 — 非常重要，必須觸發sp欄位】
當故事中出現可能是108星的角色時，必須同時填寫sp欄位：
  初遇（名字未知）→ "sp":{"num":星號,"type":"天罡或地煞","star":"星名","name":"???","hint":"外貌描述","cN":"暫稱"}
  得知真名後 → "sp":{"num":同一星號,"type":"天罡或地煞","star":"星名","name":"真名"}
  同時在dl中讓橘子喵一聲＋系統翻譯說明是哪顆星。
  ★ 如果不填sp，玩家的星辰錄不會更新！這是技術需求。

【招募 — 必須給玩家選擇】
與星辰角色建立關係後，ch選項中必須包含「邀請加入」vs「暫時分別」的選擇。
玩家選擇邀請且對方同意 → 填nm欄位觸發入隊：
  "nm":{"id":"英文id","name":"名字","star":"星名","type":"天罡或地煞","num":星號,"title":"二字稱號","emoji":"固定emoji","desc":"描述","portrait":"英文外貌描述","stats":{"武力":50,"知力":50,"統率":35,"魅力":40,"幸運":50},"tl":[{"n":"技能名","s":false,"d":"說明"}],"eq":{"武器":"名","防具":"名","飾品":"——"},"baseLv":1}

【數據同步 — 違反會導致遊戲崩潰】
敘述提到金幣收支 → gd必填。提到道具 → iv必填。提到HP變化 → hp必填。提到好感 → fa必填。提到任務 → qt必填。提到時間推進 → tm必填。
純文字描述不會改變遊戲數值！只有JSON欄位才能。

【其他欄位】
cb：戰鬥判定。簡單戰鬥→{"stat":"武力","difficulty":12,"enemy":"敵人名","desc":"描述"}。遭遇戰鬥→{"enemies":["goblin","wolf"],"boss":false,"desc":"描述"}（使用ENEMY_DB的id：goblin/wolf/bandit/mist_thug/snake/spider/bat/skeleton/pirate/forest_sprite/ice_wolf/sand_worm/marsh_golem/dark_knight/dragon_spawn/mist_leader/imperial_shade/sea_serpent/ancient_dragon）。填cb時ch設[]。iv：道具變動add/remove/equip/purchase。info：情報[{id,title,content,src,rel,cat}]。job：職業變更[{id,job}]。
cr：紋章事件。真紋章發現→{"id":"紋章id","found":true,"holder":"持有者名","src":"來源"}。一般紋章獲得→{"id":"紋章id","qty":數量}。真紋章id：genesis/blade/bulwark/hellfire/abyssal/tempest/thunder/terra/solar/lunar/stellar/eclipse/vitality/souleater/samsara/nihil/sovereign/chaos/order/judgment/illusion/chronos/gateway/sage/revolution/polaris/dawn。
【UI互動】標記為【UI互動】的訊息僅為背景資訊，不要推進劇情。
【戰鬥觸發】遭遇戰鬥時務必使用cb欄位。簡單遭遇用enemies陣列格式觸發回合制戰鬥：cb:{"enemies":["enemy_id","enemy_id"],"boss":false,"desc":"描述"}。可用敵人ID：goblin/wolf/bandit/mist_thug/snake/spider/bat/skeleton/pirate/forest_sprite/ice_wolf/sand_worm/marsh_golem/dark_knight/dragon_spawn。BOSS戰：mist_leader/imperial_shade/sea_serpent/ancient_dragon。
【經驗與升級】戰鬥勝利後系統自動發放經驗值。不需在敘述中提及經驗數字。
【紋章事件】發現真紋章時使用cr欄位。真紋章是重大劇情事件，不可隨意出現。
【道具獲得】任何道具獲得、購買、拾取都必須填iv欄位，否則不會加入玩家道具欄。
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

let _lastSentGold=null;
async function callAPI(action){
  if(!CFG.key){document.getElementById('api-modal').classList.add('open');throw new Error('請先設定 API 金鑰');}
  await apiGate();
  const _p=allParty();
  const partySnap=_p.filter(m=>m.id!=='orange').map(m=>{const u=G.upgrade[m.id];const lv=u?u.lv||1:1;const fm=(G.formation||{})[m.id]==='back'?'後排':'前排';return`${m.name}/Lv${lv}/${getJob(m.id)||'?'}/HP${getHP(m.id).cur}/${fm}`;}).join(',')+'；橘子HP'+getHP('orange').cur+'/好感'+getFavor('orange')+'/'+((G.formation||{}).orange==='back'?'後排':'前排');
  const goldStr=`金${G.gold.gold}銀${G.gold.silver}銅${G.gold.copper}`;
  const goldSnap=goldStr!==_lastSentGold?goldStr:'';
  _lastSentGold=goldStr;
  const activeQ=(G.quests||[]).filter(q=>q.status==='active');
  const questSnap=activeQ.length?activeQ.slice(0,3).map(q=>q.title||q.name||'?').join(','):'無';
  let stateNote=`【狀態】${getTimeContext()}|${goldSnap?goldSnap+'|':''}隊:${partySnap}|道具${(getInv().items||[]).length}|任務(${activeQ.length}):${questSnap}`;
  if(stateNote.length>200)stateNote=stateNote.slice(0,197)+'…';
  G.history.push({role:'user',content:`${stateNote}\n${action}`});
  // 每次都送完整SYS（AI品質 > 省token）
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
      body:JSON.stringify({model:CFG.model,max_tokens:CFG.tokens,system:SYS,messages:G.history,stream:true})
    });
  }catch(e){
    apiDone();G.history.pop();
    if(isCorsErr(e)){document.getElementById('cors-modal').classList.add('open');}
    throw new Error(isCorsErr(e)?'網路/CORS 錯誤（請用本地伺服器）':('網路錯誤：'+e.message));
  }
  if(!res.ok){
    apiDone();G.history.pop();
    if(res.status===429){apiHit429();throw new Error('請求過於頻繁，已啟動冷卻');}
    let em=`HTTP ${res.status}`;
    try{const ej=await res.json();em=ej.error?.message||em;}catch(_){}
    const map={401:'API 金鑰無效或已過期',403:'API 金鑰無此權限',500:'Anthropic 伺服器錯誤，稍後重試'};
    throw new Error(map[res.status]||em);
  }
  // ── 串流讀取 ──
  const reader=res.body.getReader();
  const decoder=new TextDecoder();
  let raw='',buf='';
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    buf+=decoder.decode(value,{stream:true});
    const lines=buf.split('\n');
    buf=lines.pop()||'';
    for(const line of lines){
      if(!line.startsWith('data: ')||line==='data: [DONE]')continue;
      try{
        const evt=JSON.parse(line.slice(6));
        if(evt.type==='content_block_delta'&&evt.delta?.text){
          raw+=evt.delta.text;
        }
      }catch(_){}
    }
  }
  G.history.push({role:'assistant',content:raw});
  apiDone();apiReset429();
  // 解析 JSON
  const parsed=tryParseJSON(raw);
  if(parsed)return parsed;
  console.warn('JSON parse failed, attempting repair. Raw:', raw.slice(0,300));
  const repaired=tryRepairJSON(raw);
  if(repaired){G.history[G.history.length-1]={role:'assistant',content:JSON.stringify(repaired)};return repaired;}
  G.history.pop();G.history.pop();
  throw new Error('AI 回應格式錯誤，請點重試');
}
function tryRepairJSON(raw){
  // 1. 移除前後非JSON文字
  let s=raw.replace(/^[\s\S]*?(\{)/,'{').replace(/\}[\s\S]*$/,'}');
  try{return JSON.parse(s);}catch(_){}
  // 2. 修復常見問題：尾部逗號、缺少引號
  s=s.replace(/,\s*([}\]])/g,'$1');
  try{return JSON.parse(s);}catch(_){}
  // 3. 嘗試截斷到最後一個完整的}
  for(let i=s.length-1;i>0;i--){
    if(s[i]==='}'){try{return JSON.parse(s.substring(0,i+1));}catch(_){}}
  }
  return null;
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
  if(G.history.length>60&&!G.autoCompressing){
    G.autoCompressing=true;
    try{await autoCompressHistory();}finally{G.autoCompressing=false;}
  }
  G.thinking=true;setDis(true);
  const prevChoices=G.currentChoices?.slice()||[];
  let actionEl=null;
  if(G._skipActionDisplay){G._skipActionDisplay=false;}
  else{actionEl=addAction(txt);makeActionEditable(actionEl,txt);}
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
      if(changed){markDirty('stars','intel','wiki');renderBoth('stars');saveGame();}
    }
    showToast(`橘子感知：${typeLabel}${starInfo}`,'ok');
    // 自動加入情報板
    addIntel({id:'orange_star_'+sp.num,title:`第${sp.num}星・${dispName}`,content:sp.hint||`橘子感知到此人身上有${starInfo}的氣息。`,src:'橘子感知',rel:4,cat:'人物',orange:true,related:`${sp.type}第${sp.num}星`});
    // 自動生成星辰頭像
    generateStarPortrait(sp.type,sp.num,dispName,sp.hint||'');
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
const SHOP_TEMPLATES={
  // ── 雜貨 ──
  general:[
    {n:'乾糧',t:'回復道具',price:{g:0,s:0,c:20}},
    {n:'魚乾',t:'橘子最愛・好感+8',price:{g:0,s:0,c:30}},
    {n:'繃帶',t:'緊急止血・HP+5',price:{g:0,s:0,c:25}},
    {n:'火種',t:'生火用具',price:{g:0,s:0,c:10}},
    {n:'麻繩',t:'攀爬・綑綁用',price:{g:0,s:0,c:15}},
  ],
  // ── 武器 ──
  weapon:[
    {n:'短劍',t:'標準輕兵器',slot:'武器',price:{g:0,s:12,c:0},bonus:{武力:10}},
    {n:'長劍',t:'平衡型武器',slot:'武器',price:{g:0,s:25,c:0},bonus:{武力:16}},
    {n:'戰斧',t:'重型武器',slot:'武器',price:{g:0,s:30,c:0},bonus:{武力:20,統率:-3}},
    {n:'弓',t:'遠程武器',slot:'武器',price:{g:0,s:18,c:0},bonus:{武力:12,幸運:3}},
    {n:'法杖',t:'魔法武器',slot:'武器',price:{g:0,s:22,c:0},bonus:{知力:15}},
  ],
  // ── 防具 ──
  armor:[
    {n:'皮甲',t:'輕型防護',slot:'防具',price:{g:0,s:15,c:0},bonus:{統率:6,幸運:2}},
    {n:'鎖子甲',t:'中型防護',slot:'防具',price:{g:0,s:35,c:0},bonus:{統率:12}},
    {n:'旅人斗篷',t:'基礎防護+隱匿',slot:'防具',price:{g:0,s:10,c:0},bonus:{統率:3,幸運:5}},
    {n:'鐵盾',t:'格擋專用',slot:'飾品',price:{g:0,s:18,c:0},bonus:{統率:10}},
  ],
  // ── 飾品 ──
  accessory:[
    {n:'銅指環',t:'略有加持',slot:'飾品',price:{g:0,s:8,c:0},bonus:{幸運:4}},
    {n:'護身符',t:'祈禱之物',slot:'飾品',price:{g:0,s:12,c:0},bonus:{幸運:6,知力:2}},
  ],
  // ── 旅店 ──
  inn:[
    {n:'客房一晚',t:'全員HP回復・推進8小時',price:{g:0,s:3,c:0},action:'rest'},
    {n:'熱食套餐',t:'HP+15・推進1小時',price:{g:0,s:1,c:50},action:'meal'},
    {n:'消息打探',t:'獲得一條當地情報',price:{g:0,s:2,c:0},action:'intel'},
  ],
  // ── 藥鋪 ──
  apothecary:[
    {n:'草藥包',t:'HP+20',price:{g:0,s:2,c:0}},
    {n:'解毒劑',t:'解除中毒',price:{g:0,s:3,c:0}},
    {n:'提神藥',t:'疲勞恢復',price:{g:0,s:1,c:50}},
    {n:'恢復藥劑',t:'HP+40',price:{g:0,s:5,c:0}},
  ],
};

// 各城市特色商品（追加在基礎模板之上）
const CITY_EXTRAS={
  iron_fog:{
    weapon:[
      {n:'鐵霧重錘',t:'礦工改造・鐵霧城特產',slot:'武器',price:{g:0,s:35,c:0},bonus:{武力:22,統率:-5}},
      {n:'城衛制式劍',t:'鐵霧城衛標配',slot:'武器',price:{g:0,s:28,c:0},bonus:{武力:15,統率:3}},
    ],
    general:[
      {n:'防霧面罩',t:'減輕鐵鏽霧害',price:{g:0,s:1,c:50}},
      {n:'礦工燈',t:'霧中照明',price:{g:0,s:2,c:0}},
    ],
  },
  iron_crown:{
    weapon:[{n:'精鋼礦錘',t:'鐵冠城鍛造',slot:'武器',price:{g:0,s:40,c:0},bonus:{武力:25}}],
    general:[{n:'礦石樣本',t:'可交易的鐵礦石',price:{g:0,s:3,c:0}}],
  },
  grey_haven:{
    general:[
      {n:'燻魚',t:'灰港名產・HP+10',price:{g:0,s:0,c:35}},
      {n:'海鹽',t:'保鮮調味',price:{g:0,s:0,c:15}},
      {n:'走私品地圖',t:'可疑的標記',price:{g:0,s:8,c:0}},
    ],
    weapon:[{n:'魚叉',t:'漁夫改造武器',slot:'武器',price:{g:0,s:15,c:0},bonus:{武力:12,幸運:2}}],
  },
  silver_moon:{
    weapon:[
      {n:'銀月細劍',t:'銀月城名匠打造',slot:'武器',price:{g:1,s:0,c:0},bonus:{武力:20,魅力:5}},
      {n:'符文短杖',t:'附魔法杖',slot:'武器',price:{g:0,s:80,c:0},bonus:{知力:22,幸運:3}},
    ],
    armor:[{n:'銀月護甲',t:'輕便華麗',slot:'防具',price:{g:1,s:20,c:0},bonus:{統率:15,魅力:5}}],
    general:[
      {n:'星象圖',t:'銀月城特產・裝飾用',price:{g:0,s:5,c:0}},
      {n:'情報書信',t:'各地傳聞彙整',price:{g:0,s:3,c:0}},
    ],
    apothecary:[{n:'月光精華',t:'HP+60・稀有',price:{g:0,s:15,c:0}}],
  },
  rust_city:{
    weapon:[{n:'帝國遺劍',t:'鏽蝕但仍鋒利',slot:'武器',price:{g:0,s:20,c:0},bonus:{武力:18,幸運:-2}}],
    general:[{n:'帝國徽記碎片',t:'收藏品或線索',price:{g:0,s:5,c:0}}],
  },
  golden_bridge:{
    general:[
      {n:'東方香料',t:'料理用・來自東海',price:{g:0,s:2,c:0}},
      {n:'內陸皮革',t:'來自霧山',price:{g:0,s:3,c:0}},
    ],
    accessory:[{n:'商旅護符',t:'金橋城名物',slot:'飾品',price:{g:0,s:15,c:0},bonus:{魅力:8,幸運:3}}],
  },
  east_port:{
    weapon:[
      {n:'海軍彎刀',t:'海軍規格・適合船戰',slot:'武器',price:{g:0,s:35,c:0},bonus:{武力:18,幸運:5}},
      {n:'珊瑚弓',t:'東海特產',slot:'武器',price:{g:0,s:45,c:0},bonus:{武力:16,魅力:8}},
    ],
    general:[
      {n:'船票（短程）',t:'碼頭間移動',price:{g:0,s:5,c:0}},
      {n:'海圖',t:'東海航路圖',price:{g:0,s:8,c:0}},
    ],
    apothecary:[{n:'東海珍珠粉',t:'HP+50',price:{g:0,s:12,c:0}}],
  },
  jade_forest:{
    apothecary:[
      {n:'精靈藥草',t:'HP+80・翠林特產',price:{g:0,s:25,c:0}},
      {n:'世界樹樹液',t:'解除所有異常',price:{g:0,s:40,c:0}},
    ],
    weapon:[{n:'精靈短弓',t:'翠林城工藝',slot:'武器',price:{g:1,s:0,c:0},bonus:{武力:15,知力:10,幸運:5}}],
    general:[{n:'翠林通行證',t:'精靈域通行必需',price:{g:0,s:20,c:0}}],
  },
  dragon_valley:{
    weapon:[{n:'龍骨匕首',t:'龍牙砦限定',slot:'武器',price:{g:0,s:50,c:0},bonus:{武力:28,幸運:-5}}],
    general:[{n:'防熱藥',t:'抵禦地熱',price:{g:0,s:5,c:0}}],
  },
  sand_gate:{
    general:[
      {n:'防沙頭巾',t:'南荒必備',price:{g:0,s:2,c:0}},
      {n:'大容量水壺',t:'荒野求生用',price:{g:0,s:3,c:0}},
      {n:'照明彈',t:'荒野求救信號',price:{g:0,s:4,c:0}},
    ],
  },
  frost_keep:{
    general:[
      {n:'防寒皮衣',t:'霜嶺必需品',price:{g:0,s:8,c:0}},
      {n:'暖爐石',t:'攜帶式保暖',price:{g:0,s:3,c:0}},
    ],
    weapon:[{n:'騎士團長劍',t:'霜守堡騎士團鍛造',slot:'武器',price:{g:1,s:20,c:0},bonus:{武力:22,統率:8}}],
  },
  shadow_marsh:{
    apothecary:[
      {n:'沼澤解毒劑',t:'對瘴氣特效',price:{g:0,s:6,c:0}},
      {n:'劇毒萃取',t:'武器塗毒用',price:{g:0,s:10,c:0}},
      {n:'迷幻菇',t:'用途不明・慎用',price:{g:0,s:4,c:0}},
    ],
    general:[{n:'防瘴面具',t:'影沼地必備',price:{g:0,s:5,c:0}}],
  },
};

// 根據城市和商店類型取得商品列表
function getCityShopItems(cityId,shopType){
  const base=[...(SHOP_TEMPLATES[shopType]||SHOP_TEMPLATES.general)];
  const extras=CITY_EXTRAS[cityId]?.[shopType]||[];
  return [...base,...extras];
}

function mergeShop(shopId,baseKey,newItems,shopName,cityId){
  if(!G.shopCatalogs)G.shopCatalogs={};
  const baseItems=cityId?getCityShopItems(cityId,baseKey):(SHOP_TEMPLATES[baseKey]||SHOP_TEMPLATES.general);
  const existing=G.shopCatalogs[shopId]||{items:[...baseItems],newItems:[]};
  const addedNew=[];
  (newItems||[]).forEach(ni=>{
    if(!existing.items.find(i=>i.n===ni.n)){existing.items.push(ni);addedNew.push(ni.n);}
  });
  existing.newItems=[...new Set([...(existing.newItems||[]),...addedNew])];
  existing.name=shopName||'商店';
  existing.lastVisit=G.time?.day||1;
  G.shopCatalogs[shopId]=existing;
  return existing;
}

function handleShop(shop){
  if(!shop)return;
  let finalShop;
  if(shop.id){
    finalShop=mergeShop(shop.id,shop.baseKey||'general',shop.newItems||[],shop.name,shop.cityId||detectCity());
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
          <div style="font-size:.78rem;color:var(--sil);font-weight:600;">${(ITEM_DB[item.n]?.icon||'')} ${item.n}${item.slot?` <span style="font-size:.58rem;color:var(--goldd)">[${item.slot}]</span>`:''}</div>
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
        <div style="font-size:.75rem;color:var(--sil);font-weight:600">${(ITEM_DB[item.n]?.icon||'')} ${item.n}${item.enhance?` [+${item.enhance}]`:''}</div>
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
  if(item.action==='rest'){restAllHP();advanceTime(8);appendEntryToDOM({type:'sys',v:'✦ 入住旅店・全員HP回復・時間推進8小時'});setTimeout(()=>checkRandomEncounter('rest'),500);}
  else if(item.action==='meal'){applyHPChange(allParty().map(c=>({id:c.id,delta:15,reason:'熱食套餐'})));advanceTime(1);}
  else if(item.action==='intel'){const rumors=['有人在北方山脈見過巨大的影子','商人工會最近在囤積鐵礦石，不知道在準備什麼','聽說東邊的村莊出現了奇怪的流浪者','霧刃幫的勢力範圍又擴大了','有個戴面具的劍客在酒館出沒','學院工會正在尋找古代遺跡的線索','暗影工會最近很安靜，反而令人不安','城門口的守衛換了一批新面孔'];const r=rumors[Math.floor(Math.random()*rumors.length)];addIntel({id:'rumor_'+Date.now(),title:'酒館傳聞',content:r,src:'旅店打探',rel:2,cat:'謠言'});appendEntryToDOM({type:'sys',v:`📋 打探到情報：${r}`});}
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
  // 清理據點工人分配
  const bw=getBaseWorkers();Object.keys(bw).forEach(f=>{if(bw[f]===id)delete bw[f];});
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
        return `<button onclick="doSwap('${escHtml(newId)}','${escHtml(id)}')" style="display:flex;align-items:center;gap:.7rem;background:var(--bg3);border:1px solid var(--brd);border-radius:3px;padding:.5rem .75rem;cursor:pointer;text-align:left;transition:all .2s;font-family:'Noto Serif TC',serif;"
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
  else return; // outId不在隊伍中，取消交換
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
  G.extraPcfg[m.id]={prompt:`${m.portrait||m.name}, character portrait, ${PORTRAIT_STYLE}`,seed};
  const arr=m.type==='天罡'?TIANGANG:DISHAT;
  const star=arr.find(s=>s.num===m.num);
  if(star){star.status='recruited';star.name=m.name;star.id=m.id;}
  joinParty(m.id);
  // 入隊公告
  const starLabel=m.type&&m.num?`${m.type}第${m.num}星・${m.star||''}`:'';
  appendEntryToDOM({type:'sys',v:`\n✦═══════════════════════✦\n  ${m.emoji||'⚔️'} ${m.name}「${m.title||''}」加入了隊伍！\n  ${starLabel}\n✦═══════════════════════✦`});
  showToast(`${m.name} 加入隊伍！`,'ok');
  // 即時生成頭像
  generatePortraitNow(m.id);
  // 如果之前星辰感知時已生成過頭像，複製過來
  const starPortId=`star_${m.type}_${m.num}`;
  const existingPort=getCustomPortrait(starPortId);
  if(existingPort&&!getCustomPortrait(m.id)){setCustomPortrait(m.id,existingPort);}

  renderChanged('party','stars');
}


function renderResp(d){
  if(d.st){document.getElementById('scene-title').textContent=d.st;G.sceneTitle=d.st;}
  if(d.st||d.sl)BGM.autoMood(d.st||G.sceneTitle,d.sl||G.sceneLoc);
  if(d.sl){document.getElementById('scene-loc').textContent=d.sl;G.sceneLoc=d.sl;
    // 如果地點不再是商店相關場景，清除 inShop 標記
    const shopKeywords=/(商店|市集|攤販|雜貨|武器|鐵匠|藥舖|酒館|客棧)/;
    if(G.inShop&&!shopKeywords.test(d.sl)&&!shopKeywords.test(d.st||'')){
      G.inShop=false;
    }
  }
  (Array.isArray(d.nv)?d.nv:d.nv?[d.nv]:[]).forEach(p=>{if(p)appendEntryToDOM({type:'narr',v:String(p)});});
  (Array.isArray(d.dl)?d.dl:d.dl?[d.dl]:[]).forEach(dl=>{if(dl&&(dl.sp||dl.ln))appendEntryToDOM({type:'dial',sp:String(dl.sp||''),ln:String(dl.ln||'')});});
  if(d.sm&&d.sm!=='null')appendEntryToDOM({type:'sys',v:String(d.sm)});
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
    const allText2=[...(Array.isArray(d.nv)?d.nv:d.nv?[d.nv]:[]),(d.sm||''),...(Array.isArray(d.dl)?d.dl:d.dl?[d.dl]:[]).map(x=>x.ln||'')].join('');
    const itemPatterns=allText2.matchAll(/(?:買了|購得|獲得|撿到|收下|取得|入手|給了你|遞給|塞給|交給|送給|掏出|發現了|拾起)[「『「]?([^「『」』」，。、\s]{1,12})[」』」]?/g);
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
  if(d.cr)applyCrestUpdate(d.cr);
  tickBondCooldowns();
  if(d.fa){const _fa=Array.isArray(d.fa)?d.fa:[d.fa];_fa.forEach(f=>{if(f.id&&f.delta){setFavor(f.id,f.delta);const _n=getCharData(f.id)?.name||f.id;showToast(`${_n} 好感 ${f.delta>0?'+':''}${f.delta}`,f.delta>0?'ok':'inf');}});renderChanged('party');}
  scrollD();
  G.log.push({sec:d.st||'',loc:(d.sl||'').replace('📍 ',''),lines:[...(Array.isArray(d.nv)?d.nv:d.nv?[d.nv]:[]).filter(Boolean).map(v=>({t:'txt',v:String(v)})),...(Array.isArray(d.dl)?d.dl:d.dl?[d.dl]:[]).filter(x=>x&&x.sp).map(dl=>({t:'txt',v:`${dl.sp||''}：「${dl.ln||''}」`})),...(d.sm&&d.sm!=='null'?[{t:'sys',v:String(d.sm)}]:[]) ]});
  if(G.log.length>200)G.log.splice(0,G.log.length-200);
  markDirty('log');
  // 掃描對話中的新角色，自動生成頭像
  autoPortraitFromDialogue(d);
  // 每次 AI 回應後強制同步所有面板
  checkQuestTriggers();
  checkAchievements();
  // Track visited cities
  const _vc=detectCity();if(_vc&&!G._visitedCities)G._visitedCities=[];if(_vc&&!G._visitedCities.includes(_vc))G._visitedCities.push(_vc);
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
// Check and auto-trigger quests based on location
function checkQuestTriggers(){
  const area=detectCity();
  Object.entries(QUEST_DB).forEach(([qid,q])=>{
    // Skip if already in quest list
    if(G.quests.find(gq=>gq.id===qid))return;
    // Check area match
    if(q.triggerArea!=='all'&&q.triggerArea!==area)return;
    // Check prerequisite
    if(q.prereq&&!G.quests.find(gq=>gq.id===q.prereq&&gq.status==='完成'))return;
    // Auto-trigger
    if(q.autoTrigger||q.type==='主線'){
      G.quests.push({id:qid,title:q.title,desc:q.desc,type:q.type,status:'進行中',objectives:q.objectives.map(o=>({text:o,done:false}))});
      appendEntryToDOM({type:'sys',v:`📋 新任務：【${q.title}】${q.type}`});
      showToast(`新任務：${q.title}`,'ok');
      renderChanged('quest');saveGame();
    }
  });
}
function checkRandomEncounter(trigger){
  const area=detectCity();
  const applicable=EVENT_DB.filter(ev=>{
    if(ev.trigger!==trigger)return false;
    if(ev.area!=='all'&&!ev.area.includes(area))return false;
    return Math.random()<ev.chance;
  });
  if(!applicable.length)return;
  const ev=applicable[Math.floor(Math.random()*applicable.length)];

  if(ev.type==='combat'&&ev.enemies){
    appendEntryToDOM({type:'narr',v:ev.desc});
    setTimeout(()=>startCombat(ev.enemies,false),800);
  }else if(ev.type==='loot'){
    appendEntryToDOM({type:'narr',v:ev.desc});
    // Random loot from area-appropriate items
    const lootPool=Object.entries(ITEM_DB).filter(([,d])=>d.cat==='消耗'&&d.price&&d.price.s<5);
    if(lootPool.length){
      const pick=lootPool[Math.floor(Math.random()*lootPool.length)];
      const inv=getInv();
      const exist=inv.items.find(i=>i.n===pick[0]);
      if(exist){const m=exist.q.match(/(\d+)/);exist.q='×'+((m?parseInt(m[1]):1)+1);}
      else inv.items.push({n:pick[0],t:pick[1].t||'',q:'×1'});
      appendEntryToDOM({type:'sys',v:`📦 發現：${pick[1].icon||''} ${pick[0]}`});
      showToast(`發現 ${pick[0]}！`,'ok');
      renderChanged('inv');saveGame();
    }
  }else if(ev.type==='encounter'){
    appendEntryToDOM({type:'narr',v:ev.desc});
    if(ev.choices){
      const arr=ev.choices.map(c=>({t:c,h:''}));
      renderChoices(arr);
    }
  }else if(ev.type==='shop'){
    appendEntryToDOM({type:'narr',v:ev.desc});
    // Open mysterious merchant with random rare items
    const rareItems=Object.entries(ITEM_DB).filter(([,d])=>d.price&&d.price.s>=10).slice(0,8).map(([n,d])=>({n,t:d.t,price:d.price,slot:d.slot,bonus:d.bonus}));
    if(rareItems.length){
      const shop={items:rareItems,name:'神秘商人',newItems:rareItems.map(i=>i.n)};
      handleShop(shop);
    }
  }else if(ev.type==='weather'){
    appendEntryToDOM({type:'narr',v:ev.desc});
    if(ev.effect?.time)advanceTime(ev.effect.time);
    if(ev.effect?.hp)applyHPChange([{id:'alfar',delta:ev.effect.hp,reason:ev.desc}]);
  }else if(ev.type==='story'){
    appendEntryToDOM({type:'narr',v:ev.desc});
    if(ev.effect?.clue_hint){
      appendEntryToDOM({type:'dial',sp:'橘子🐈😒',ln:'喵⋯⋯'});
      appendEntryToDOM({type:'sys',v:'〔橘子感知：某種微弱的星辰氣息⋯⋯方向不明。〕'});
    }
  }else if(ev.type==='explore'){
    appendEntryToDOM({type:'narr',v:ev.desc});
    if(ev.effect?.hp){
      applyHPChange(allParty().map(c=>({id:c.id,delta:ev.effect.hp,reason:'探索發現'})));
      appendEntryToDOM({type:'sys',v:`✦ 全隊 HP +${ev.effect.hp}`});
    }
  }
  scrollD();saveGame();
}
function renderAll(){
  updateGold();
  updateTimeDisplay();
  updateShopBtn();
  // 強制渲染所有面板（確保資料同步）
  markAllDirty();
  Object.keys(_renderCache).forEach(k=>delete _renderCache[k]);
  ['party','stars','inv','quest','intel','log','guild','activities','hq','crest','sysinfo'].forEach(tab=>{
    _dirty[tab]=true;renderBoth(tab);
  });
  if(G.currentChoices?.length)renderChoices(G.currentChoices,false);
}

function renderChanged(...tabs){
  // 任何狀態變動 → 全面更新 UI
  updateGold();updateTimeDisplay();updateShopBtn();
  document.getElementById('scene-title').textContent=G.sceneTitle||'';
  document.getElementById('scene-loc').textContent=G.sceneLoc||'';
  if(tabs.length){tabs.forEach(t=>markDirty(t));}else{markAllDirty();}
  // 渲染所有被標髒的面板
  ['party','stars','inv','quest','intel','guild','activities','hq','crest','sysinfo'].forEach(t=>{
    if(_dirty[t])renderBoth(t);
  });
}
function addAction(txt){const e={type:'action',v:txt};appendEntryToDOM(e);scrollD();const entries=document.getElementById('story-content').children;return entries[entries.length-1];}
// 長按已送出的行動文字 → 編輯並重送
function makeActionEditable(actionEl,originalTxt){
  if(!actionEl)return;
  let pressTimer=null;
  const startPress=()=>{pressTimer=setTimeout(()=>{openEditAction(actionEl,originalTxt);},500);};
  const cancelPress=()=>{clearTimeout(pressTimer);};
  actionEl.addEventListener('touchstart',startPress,{passive:true});
  actionEl.addEventListener('touchend',cancelPress);
  actionEl.addEventListener('touchcancel',cancelPress);
  actionEl.addEventListener('contextmenu',(ev)=>{ev.preventDefault();openEditAction(actionEl,originalTxt);});
}
function openEditAction(actionEl,originalTxt){
  // 若AI已回應完，不能重送（history已推進）
  if(!G.thinking){
    // 建立編輯UI在行動文字下方
    if(actionEl.querySelector('.edit-action-box'))return;
    const box=document.createElement('div');
    box.className='edit-action-box';
    box.style.cssText='display:flex;gap:.3rem;padding:.3rem;background:var(--bg2);border:1px solid var(--goldd);border-radius:3px;margin-top:.25rem;';
    const inp=document.createElement('input');
    inp.type='text';inp.value=originalTxt;
    inp.style.cssText='flex:1;background:var(--bg3);border:1px solid var(--brd);border-radius:2px;color:var(--sil);padding:.25rem .4rem;font-size:.65rem;font-family:"Noto Serif TC",serif;';
    const sendBtn=document.createElement('button');
    sendBtn.textContent='重送';
    sendBtn.style.cssText='padding:.25rem .5rem;background:rgba(201,168,76,.15);border:1px solid var(--goldd);border-radius:2px;color:var(--gold);font-size:.6rem;cursor:pointer;font-family:"Noto Serif TC",serif;';
    sendBtn.onclick=()=>{
      const newTxt=inp.value.trim();
      if(!newTxt||G.thinking)return;
      box.remove();
      // 1. 找到這個 action 在 storyData 裡的位置，刪掉它之後的所有內容
      const sdIdx=G.storyData.findIndex(e=>e.type==='action'&&e.v===originalTxt);
      if(sdIdx>-1)G.storyData.splice(sdIdx); // 刪掉 action 和之後的回覆
      // 2. 刪掉 DOM 中 action 元素之後的所有故事內容
      const container=document.getElementById('story-content');
      let removing=false;
      [...container.children].forEach(child=>{
        if(child===actionEl){removing=true;child.remove();return;}
        if(removing)child.remove();
      });
      // 3. 回滾 history：移除最後一對 user+assistant（舊的送出和回覆）
      if(G.history.length>=2){
        const last=G.history[G.history.length-1];
        const prev=G.history[G.history.length-2];
        if(prev.role==='user'&&last.role==='assistant')G.history.splice(-2);
        else if(last.role==='user')G.history.pop();
      }
      saveGame();
      // 4. 用新文字重送
      sendChoice(newTxt);
    };
    const cancelBtn=document.createElement('button');
    cancelBtn.textContent='取消';
    cancelBtn.style.cssText='padding:.25rem .4rem;background:transparent;border:1px solid var(--brd);border-radius:2px;color:var(--sild);font-size:.6rem;cursor:pointer;font-family:"Noto Serif TC",serif;';
    cancelBtn.onclick=()=>box.remove();
    box.appendChild(inp);box.appendChild(sendBtn);box.appendChild(cancelBtn);
    actionEl.appendChild(box);
    inp.focus();inp.select();
  }
}
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
  btn.onclick=(ev)=>{ev.stopPropagation();w.remove();sendChoice('（系統：上次回應格式錯誤，請只輸出純JSON）'+retryAction);};
  e.appendChild(btn);
  w.appendChild(e);
  document.getElementById('story-content').appendChild(w);scrollD();
}

function renderChoices(arr,doSave=true){
  if(doSave)G.currentChoices=arr;
  // Occasional ambient flavor text
  if(Math.random()<0.15&&G.time){
    const hour=G.time.hour||12;
    const ambients=hour>=6&&hour<12?['晨光透過雲層灑落。','遠處傳來鳥鳴。','空氣中帶著露水的氣息。']:
      hour>=12&&hour<18?['陽光正烈。','街道上行人漸多。','微風吹過，帶起塵土。']:
      hour>=18&&hour<22?['暮色漸深。','街燈一盞盞亮起。','酒館裡傳出歡笑聲。']:
      ['夜深了。','星辰在天空閃爍。','橘子的眼睛在黑暗中微微發光。'];
    const amb=ambients[Math.floor(Math.random()*ambients.length)];
    appendEntryToDOM({type:'narr',v:amb},false);
  }
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
  // 解析對話格式：「角色名：內容」或「角色名：內容」
  const lines=v.split(/\n/).filter(l=>l.trim());
  const parsed=[];
  let hasDialogue=false;
  lines.forEach(line=>{
    const m=line.match(/^(.{1,10})[：:](.+)/);
    if(m){
      parsed.push({speaker:m[1].trim(),content:m[2].trim()});
      hasDialogue=true;
    }else{
      parsed.push({speaker:null,content:line.trim()});
    }
  });
  // 顯示在故事區
  parsed.forEach(p=>{
    if(p.speaker){
      appendEntryToDOM({type:'dial',sp:p.speaker+(p.speaker==='橘子'?'🐈😒':p.speaker==='艾爾法'?'😒':''),ln:p.content});
    }else{
      // 沒有冒號 = 艾爾法的對話或行動
      if(/^[「『（]/.test(p.content)||/^「/.test(p.content)){
        appendEntryToDOM({type:'dial',sp:'艾爾法😒',ln:p.content.replace(/^[「『]|[」』]$/g,'')});
      }else{
        appendEntryToDOM({type:'action',v:p.content});
      }
    }
  });
  scrollD();
  // 組成送給 AI 的指令
  let prompt;
  if(hasDialogue){
    prompt=parsed.map(p=>p.speaker?`${p.speaker}說：「${p.content}」`:p.content).join('\n');
  }else if(/^[「『（]/.test(v)||/[」』）]$/.test(v)){
    prompt=`艾爾法說：「${v.replace(/^[「『]|[」』]$/g,'')}」`;
  }else{
    prompt=`艾爾法的行動：${v}`;
  }
  G._skipActionDisplay=true;
  sendChoice(prompt);
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
  G.gold.copper=total%10;
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
const PORTRAIT_STYLE='dark fantasy illustration, detailed character portrait, dramatic lighting, oil painting style, western fantasy RPG art';
const _alfPrompt=`young woman traveler, long straight silver white hair, pale skin, deadpan emotionless face, grey eyes, worn dark hooded cloak, short sword at waist, ${PORTRAIT_STYLE}`;
const _oraPrompt=`cute ragdoll cat, big blue eyes, fluffy white cream fur, chubby cheeks, pink nose, adorable, anime style illustration`;
const PCFG={
  alfar:{
    prompt:_alfPrompt, seed:4821,
    default:`https://image.pollinations.ai/prompt/${encodeURIComponent(_alfPrompt)}?width=260&height=148&seed=4821&model=flux`,
    label:'艾爾法',color:'#a8b5cc',emoji:'😒',
  },
  orange:{
    prompt:_oraPrompt, seed:8816,
    default:`https://image.pollinations.ai/prompt/${encodeURIComponent(_oraPrompt)}?width=260&height=148&seed=8816&model=flux`,
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
    const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id])||{};
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
  const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id])||{};
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


// 計算角色實際素質（基礎 + 裝備加成 + 寶器加成 + 紋章加成 + 職業加成）
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
  // 寶器加成
  if(typeof getRelicBonus==='function'){
    const rb=getRelicBonus(id);
    Object.entries(rb).forEach(([s,v])=>{
      if(stats[s]!==null&&v)stats[s]=(stats[s]||0)+v;
    });
  }
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
  const totalSilver=G.gold.gold*100+G.gold.silver;
  if(totalSilver<cost){showToast('銀幣不足（需5銀）','err');return;}
  applyGold({g:0,s:-cost,c:0});
  const ug=getUpgrade(id);
  ug.pts+=3;
  renderChanged('party');saveGame();
  showToast(`${c.name} 獲得 3 點提升（消耗5銀）`,'ok');
}
// ═══ EXPERIENCE / LEVEL SYSTEM ═══
function grantExp(partyIds,amount){
  if(!amount||amount<=0)return;
  partyIds.forEach(id=>{
    if(id==='orange')return; // 橘子不升級
    const ug=getUpgrade(id);
    if(!ug.exp)ug.exp=0;
    if(!ug.expNext)ug.expNext=(ug.lv||1)*50+50;
    ug.exp+=amount;
    // Level up loop
    let leveled=false;
    while(ug.exp>=ug.expNext){
      ug.exp-=ug.expNext;
      ug.lv=(ug.lv||1)+1;
      ug.pts=(ug.pts||0)+3;
      ug.expNext=ug.lv*50+50;
      leveled=true;
      // HP increase on level up
      const hp=getHP(id);
      hp.max+=5;hp.cur=hp.max;
      G.hp[id]=hp;
      appendEntryToDOM({type:'sys',v:`✦ ${getCharData(id)?.name||id} レベルアップ！Lv.${ug.lv}（素質點數+3・HP上限+5）`});
      showToast(`${getCharData(id)?.name||id} Lv.${ug.lv}！`,'ok');
    }
    G.upgrade[id]=ug;
  });
  if(amount)renderChanged('party');
  saveGame();
}
// ═══ COOKING SYSTEM（料理系統）═══ 本地化，不呼叫AI
const RECIPES=[
  // ── 料理 ──
  {id:'bread_soup',cat:'cook',name:'麵包湯',icon:'🍲',ingredients:[{n:'乾糧',q:1},{n:'草藥包',q:1}],effect:{hp:30},desc:'簡單但溫暖的料理・全隊HP+30',diff:1},
  {id:'grilled_fish',cat:'cook',name:'烤魚定食',icon:'🐟',ingredients:[{n:'魚乾',q:2},{n:'火種',q:1}],effect:{hp:25,favor:{orange:5}},desc:'橘子最愛・HP+25・橘子好感+5',diff:1},
  {id:'herb_tea',cat:'cook',name:'草藥茶',icon:'🍵',ingredients:[{n:'草藥包',q:2}],effect:{cure:'poison'},desc:'解毒效果',diff:1},
  {id:'hunter_stew',cat:'cook',name:'獵人燉肉',icon:'🥘',ingredients:[{n:'獸肉',q:2},{n:'草藥包',q:1}],effect:{hp:50,buff:'rage'},desc:'全隊HP+50・暫時攻擊提升',diff:2},
  {id:'star_cake',cat:'cook',name:'星辰糕',icon:'🌟',ingredients:[{n:'精靈果實',q:1},{n:'月光蘑菇',q:1}],effect:{hp:80,allStats:3},desc:'全隊HP+80・全素質暫時+3',diff:3},
  {id:'iron_ration',cat:'cook',name:'鐵壁口糧',icon:'🫓',ingredients:[{n:'乾糧',q:2},{n:'獸肉',q:1}],effect:{hp:20,buff:'shield'},desc:'HP+20・暫時防禦提升',diff:1},
  {id:'feast',cat:'cook',name:'滿漢全席',icon:'🎉',ingredients:[{n:'獸肉',q:3},{n:'東方香料',q:1},{n:'精靈果實',q:1}],effect:{hp:100,allStats:5},desc:'極致料理・全隊HP+100・全素質+5',diff:4},
  {id:'fog_steak',cat:'cook',name:'鐵霧烤肉',icon:'🥩',ingredients:[{n:'獸肉',q:1},{n:'火種',q:1},{n:'海鹽',q:1}],effect:{hp:35},desc:'鐵霧城風味・HP+35',diff:1},
  {id:'moon_dessert',cat:'cook',name:'銀月甜點',icon:'🍮',ingredients:[{n:'精靈果實',q:1},{n:'乾糧',q:1}],effect:{hp:40,favor:{orange:3}},desc:'銀月城名物・HP+40',diff:2},
  {id:'sea_soup',cat:'cook',name:'東港海鮮湯',icon:'🦐',ingredients:[{n:'魚乾',q:2},{n:'海鹽',q:1},{n:'東方香料',q:1}],effect:{hp:45},desc:'東海風味・HP+45',diff:2},
  {id:'dragon_jerky',cat:'cook',name:'龍肉乾',icon:'🍖',ingredients:[{n:'獸肉',q:3},{n:'防熱藥',q:1}],effect:{hp:60,buff:'rage'},desc:'南荒特產・HP+60・攻擊提升',diff:3},
  {id:'frost_soup',cat:'cook',name:'霜嶺熱湯',icon:'🍜',ingredients:[{n:'獸肉',q:1},{n:'草藥包',q:1},{n:'暖爐石',q:1}],effect:{hp:40,cure:'freeze'},desc:'禦寒・HP+40・解除冰凍',diff:2},

  // ── 鍛造 ──
  {id:'iron_sword',cat:'smith',name:'鐵劍',icon:'⚔️',ingredients:[{n:'鐵錠',q:3},{n:'木材',q:1}],result:'長劍',desc:'鍛造標準鐵劍',diff:2},
  {id:'steel_sword',cat:'smith',name:'精鋼劍',icon:'⚔️',ingredients:[{n:'鋼錠',q:3},{n:'精靈木',q:1}],result:'精鋼劍',desc:'高品質劍刃',diff:3},
  {id:'dragon_blade',cat:'smith',name:'龍牙劍',icon:'⚔️',ingredients:[{n:'龍牙',q:2},{n:'鋼錠',q:2},{n:'龍血草',q:1}],result:'龍牙劍',desc:'以龍牙鍛造的魔劍',diff:4},
  {id:'iron_armor',cat:'smith',name:'鐵甲',icon:'🛡️',ingredients:[{n:'鐵錠',q:5},{n:'皮革',q:2}],result:'鐵胸甲',desc:'標準鐵製護甲',diff:2},
  {id:'dragon_armor',cat:'smith',name:'龍鱗甲',icon:'🛡️',ingredients:[{n:'龍鱗',q:3},{n:'鋼錠',q:3},{n:'精靈絲',q:1}],result:'龍鱗甲',desc:'傳說級防具',diff:5},
  {id:'ring_silver',cat:'smith',name:'銀指環',icon:'💍',ingredients:[{n:'銀礦',q:2}],result:'銀指環',desc:'簡單的銀飾',diff:1},
  {id:'star_ring',cat:'smith',name:'星辰戒',icon:'💍',ingredients:[{n:'星辰石',q:1},{n:'秘銀錠',q:1},{n:'星辰碎片',q:1}],result:'星辰戒',desc:'蘊含星辰之力的戒指',diff:5},
  {id:'enhance_stone',cat:'smith',name:'強化石',icon:'🪨',ingredients:[{n:'鐵礦',q:2},{n:'琥珀',q:1}],result:'強化石',desc:'裝備強化用素材',diff:1},

  // ── 煉金 ──
  {id:'antidote',cat:'alchemy',name:'解毒劑',icon:'💊',ingredients:[{n:'草藥包',q:2},{n:'蛇毒囊',q:1}],result:'解毒劑',desc:'萃取毒素製成的解藥',diff:1},
  {id:'heal_pot',cat:'alchemy',name:'恢復藥劑',icon:'🧪',ingredients:[{n:'草藥包',q:3}],result:'恢復藥劑',desc:'煉金術基礎藥劑',diff:2},
  {id:'moon_elixir',cat:'alchemy',name:'月光精華',icon:'🌙',ingredients:[{n:'月光蘑菇',q:2},{n:'精靈花',q:1}],result:'月光精華',desc:'銀月城秘方',diff:3},
  {id:'world_tree',cat:'alchemy',name:'世界樹樹液',icon:'🌳',ingredients:[{n:'世界樹果實',q:1},{n:'精靈花',q:2},{n:'月光蘑菇',q:1}],result:'世界樹樹液',desc:'萬能解藥',diff:4},
  {id:'poison_blade',cat:'alchemy',name:'毒刃藥劑',icon:'☠️',ingredients:[{n:'蛇毒囊',q:2},{n:'蜘蛛絲',q:1}],result:'劇毒萃取',desc:'武器塗毒用',diff:2},
  {id:'elixir_str',cat:'alchemy',name:'力量藥劑',icon:'💪',ingredients:[{n:'獸肉',q:2},{n:'草藥包',q:1},{n:'鐵礦',q:1}],result:'力量藥劑',desc:'暫時武力提升',diff:2},
  {id:'elixir_int',cat:'alchemy',name:'知力藥劑',icon:'🧠',ingredients:[{n:'月光蘑菇',q:2},{n:'草藥包',q:1}],result:'知力藥劑',desc:'暫時知力提升',diff:2},
  {id:'phoenix_tear',cat:'alchemy',name:'鳳凰之淚',icon:'🔥',ingredients:[{n:'龍血草',q:2},{n:'世界樹果實',q:1},{n:'鳳凰羽',q:1}],result:'鳳凰之淚',desc:'復活藥劑',diff:5},
];
function getCookable(cat){
  const inv=getInv();const items=inv.items;
  return RECIPES.filter(r=>{
    if(cat&&(r.cat||'cook')!==cat)return false;
    return r.ingredients.every(ing=>{const it=items.find(x=>x.n===ing.n);const m=it?.q.match(/(\d+)/);return m&&parseInt(m[1])>=ing.q;});
  });
}
function cookRecipe(recipeId){
  const r=RECIPES.find(x=>x.id===recipeId);if(!r)return;
  const inv=getInv();
  // 消耗食材
  r.ingredients.forEach(ing=>{
    const it=inv.items.find(x=>x.n===ing.n);if(!it)return;
    const m=it.q.match(/(\d+)/);const cur=m?parseInt(m[1]):1;
    if(cur<=ing.q)inv.items=inv.items.filter(x=>x!==it);
    else it.q='×'+(cur-ing.q);
  });
  // 應用效果
  if(r.effect){
    if(r.effect.hp){const members=allParty();members.forEach(m=>{const hp=getHP(m.id);hp.cur=Math.min(hp.max,hp.cur+r.effect.hp);});}
    if(r.effect.favor){
      if(typeof r.effect.favor==='object'){
        Object.entries(r.effect.favor).forEach(([id,val])=>{if(getFavor(id)!==null)setFavor(id,val);});
      }else{
        allParty().forEach(m=>{if(getFavor(m.id)!==null)setFavor(m.id,r.effect.favor);});
      }
    }
    if(r.effect.buff==='rage')G._cookBuff={atk:3,def:0,turns:1};
    if(r.effect.buff==='shield')G._cookBuff={atk:0,def:5,turns:1};
    if(r.effect.atk)G._cookBuff={atk:r.effect.atk,def:r.effect.def||0,turns:1};
    if(r.effect.def&&!r.effect.atk)G._cookBuff={atk:0,def:r.effect.def,turns:1};
  }
  // If recipe has a result item (smithing/alchemy), add to inventory
  if(r.result){
    const db=ITEM_DB[r.result];
    if(db&&db.slot){
      // Equipment result
      const eq={n:r.result,t:db.t||'',w:null,status:'持有',slot:db.slot,bonus:db.bonus||null};
      if(!eq.bonus&&db.bonus)eq.bonus=db.bonus;
      inv.equip.push(eq);
      appendEntryToDOM({type:'sys',v:`⚒️ 鍛造成功：${r.result}（已加入持有欄）`});
    }else{
      // Consumable/material result
      const exist=inv.items.find(i=>i.n===r.result);
      if(exist){const m=exist.q.match(/(\d+)/);exist.q='×'+((m?parseInt(m[1]):1)+1);}
      else inv.items.push({n:r.result,t:db?.t||'',q:'×1'});
      appendEntryToDOM({type:'sys',v:`⚗️ 煉成：${r.result}`});
    }
  }
  if(!r.result)appendEntryToDOM({type:'sys',v:`${r.icon} 料理完成：${r.name} — ${r.desc}`});
  showToast(`${r.name} 完成！`,'ok');
  G._craftCount=(G._craftCount||0)+1;
  renderChanged('party','inv');saveGame();
}
let _craftTab='cook';
function setCraftTab(t){_craftTab=t;renderBoth('activities');}
function buildCookUI(){
  const filtered=RECIPES.filter(r=>(r.cat||'cook')===_craftTab);
  const cookable=getCookable(_craftTab);
  const tabLabels=[['cook','🍳 料理'],['smith','⚒️ 鍛造'],['alchemy','⚗️ 煉金']];
  const tabRow=`<div style="display:flex;gap:2px;margin-bottom:.4rem;background:rgba(201,168,76,.12);border-radius:3px;overflow:hidden;">
  ${tabLabels.map(([k,l])=>
    `<button onclick="setCraftTab('${k}')" style="flex:1;padding:.25rem;font-size:.55rem;background:${_craftTab===k?'rgba(201,168,76,.18)':'transparent'};border:none;color:${_craftTab===k?'var(--goldl)':'var(--sild)'};cursor:pointer;font-family:'Noto Serif TC',serif;">${l}</button>`
  ).join('')}
</div>`;
  const catNames={cook:'料理',smith:'鍛造',alchemy:'煉金'};
  const catDescs={cook:'消耗食材製作料理，效果立即生效。',smith:'以素材鍛造裝備與道具。',alchemy:'煉金合成藥劑與特殊物品。'};
  let h=`<div style="padding:.4rem .5rem .2rem;border-bottom:1px solid var(--brd);margin-bottom:.4rem;">
    ${tabRow}
    <div style="font-size:.48rem;color:var(--sild);margin-top:.1rem;">${catDescs[_craftTab]}</div></div>`;
  if(!cookable.length)h+=`<div style="color:var(--sild);font-size:.55rem;text-align:center;padding:1.5rem;">目前沒有足夠素材的${catNames[_craftTab]}配方。</div>`;
  cookable.forEach(r=>{
    const ingStr=r.ingredients.map(i=>`${i.n}×${i.q}`).join('＋');
    h+=`<div style="background:var(--bg3);border:1px solid var(--brd);border-radius:3px;margin-bottom:.35rem;padding:.4rem .55rem;cursor:pointer;" onclick="cookRecipe('${r.id}')">
      <div style="display:flex;align-items:center;gap:.4rem;">
        <span style="font-size:1rem;">${r.icon}</span>
        <div style="flex:1;"><div style="font-size:.65rem;color:var(--goldl);font-weight:600;">${r.name}</div>
        <div style="font-size:.48rem;color:var(--sild);">${r.desc}</div></div>
        <span style="font-size:.48rem;color:var(--sild);">${'★'.repeat(r.diff)}</span>
      </div>
      <div style="font-size:.45rem;color:var(--sild);margin-top:.2rem;">素材：${ingStr}</div>
    </div>`;
  });
  // 全部配方一覽
  h+=`<div style="font-size:.48rem;color:var(--sild);padding:.3rem 0 .15rem;border-top:1px solid var(--brd);margin-top:.3rem;">全部配方：</div>`;
  filtered.forEach(r=>{const can=cookable.includes(r);
    const ingStr=r.ingredients.map(i=>`${i.n}×${i.q}`).join('+');
    h+=`<div style="font-size:.48rem;color:${can?'var(--sil)':'rgba(255,255,255,.25)'};padding:.08rem 0;">${r.icon} ${r.name}（${ingStr}）${can?'✓':''}</div>`;
  });
  return h;
}

// ═══ STAR RESONANCE（星辰共鳴・合技）═══ 本地化
const RESONANCE=[
  {ids:['alfar','orange'],name:'命運共振',icon:'⚓',desc:'艾爾法＋橘子：骰子判定+2',bonus:{dice:2}},
];
// 動態共鳴：同類型星辰3人以上觸發
function getActiveResonance(){
  const party=G.partyIds||[];const res=[];
  // 固定共鳴
  RESONANCE.forEach(r=>{if(r.ids.every(id=>party.includes(id)))res.push(r);});
  // 動態：同職業3人
  const jobCount={};party.forEach(id=>{const j=getJob(id);if(j)jobCount[j]=(jobCount[j]||0)+1;});
  Object.entries(jobCount).forEach(([job,cnt])=>{
    if(cnt>=3)res.push({name:`${job}連攜`,icon:JOBS[job]?.icon||'⚔️',desc:`${job}×${cnt}：該職業素質判定+${cnt}`,bonus:{dice:cnt}});
  });
  // 天罡3人
  const tgCount=party.filter(id=>{const c=getCharData(id);return c?.type==='天罡';}).length;
  if(tgCount>=3)res.push({name:'天罡之陣',icon:'✦',desc:`天罡${tgCount}人：全判定+1`,bonus:{dice:1}});
  return res;
}
function getResonanceBonus(){return getActiveResonance().reduce((sum,r)=>sum+(r.bonus?.dice||0),0);}
function buildResonanceHtml(){
  const res=getActiveResonance();
  if(!res.length)return'<div style="font-size:.5rem;color:var(--sild);padding:.3rem;">目前無共鳴效果。增加隊伍人數或特定組合以觸發。</div>';
  return res.map(r=>`<div style="display:flex;align-items:center;gap:.4rem;padding:.25rem 0;border-bottom:1px solid rgba(255,255,255,.04);">
    <span style="font-size:.85rem;">${r.icon}</span>
    <div><div style="font-size:.58rem;color:var(--gold);font-weight:600;">${r.name}</div>
    <div style="font-size:.48rem;color:var(--sild);">${r.desc}</div></div></div>`).join('');
}

// ═══ BOUNTY BOARD（懸賞板）═══ 本地生成，不呼叫AI
const BOUNTY_TEMPLATES=[
  {type:'討伐',targets:['野狼群','山賊','巨蜘蛛','哥布林巡邏隊','亡靈兵','食人花','石像鬼','盜匪頭目'],stat:'武力'},
  {type:'護送',targets:['商人','難民','學者','貴族夫人','受傷騎士','醫藥箱','密信'],stat:'統率'},
  {type:'採集',targets:['月光草','鐵礦石','星辰花','毒蘑菇樣本','古代碎片','龍骨化石','冰晶'],stat:'幸運'},
  {type:'調查',targets:['廢棄礦坑','鬧鬼旅館','消失的村莊','走私路線','古代遺跡入口','失蹤的商隊'],stat:'知力'},
  {type:'交涉',targets:['工匠公會糾紛','村民與領主矛盾','商會內鬥','傭兵團招募','盜賊團談判','邊境通行許可'],stat:'魅力'},
];
function generateBounties(){
  const day=G.time?.day||1;const seed=day*7+13;
  const bounties=[];
  for(let i=0;i<4;i++){
    const tmpl=BOUNTY_TEMPLATES[(seed+i*3)%BOUNTY_TEMPLATES.length];
    const target=tmpl.targets[(seed+i*7)%tmpl.targets.length];
    const diff=8+((seed+i*11)%10);
    const reward={s:Math.floor(diff*0.8)+1,c:((seed+i)%10)*5};
    bounties.push({id:`bounty_d${day}_${i}`,type:tmpl.type,target,stat:tmpl.stat,diff,reward,day});
  }
  return bounties;
}
function acceptBounty(idx){
  const bounties=generateBounties();
  const b=bounties[idx];if(!b)return;
  // 本地骰子判定（含裝備+寶器加成）
  const _es=getEffectiveStats('alfar');
  const statVal=_es[b.stat]||0;
  const mod=Math.floor(statVal/10)+getResonanceBonus();
  const raw=Math.floor(Math.random()*20)+1;
  const total=raw+mod;
  const success=total>=b.diff;
  const grade=raw===20?'大成功！':raw===1?'大失敗…':success?'成功':'失敗';
  appendEntryToDOM({type:'sys',v:`📋 懸賞：${b.type}【${b.target}】（${b.stat}判定 難度${b.diff}）`});
  appendEntryToDOM({type:'sys',v:`🎲 投出${raw} +${mod} = ${total}　→ ${grade}`});
  if(success){
    applyGold({g:0,s:b.reward.s,c:b.reward.c});
    appendEntryToDOM({type:'sys',v:`✦ 懸賞完成！獲得 銀${b.reward.s}・銅${b.reward.c}`});
    // 工會經驗
    if(G.guilds?.adventurer?.joined)addGuildExp('adventurer',10+Math.floor(b.diff/3));
    showToast('懸賞完成！','ok');
  }else{
    if(raw===1){applyHPChange([{id:'alfar',delta:-8,reason:'懸賞失敗受傷'}]);}
    appendEntryToDOM({type:'sys',v:'✗ 懸賞失敗。' +(raw===1?'而且受傷了…':'')});
    showToast('懸賞失敗','err');
  }
  advanceTime(2);
  scrollD();saveGame();renderChanged('party','inv');
}
function buildBountyBoard(){
  const bounties=generateBounties();
  let h=`<div style="padding:.4rem .5rem .2rem;border-bottom:1px solid var(--brd);margin-bottom:.4rem;">
    <div style="font-size:.62rem;color:var(--goldd);letter-spacing:.1em;font-weight:600;">📋 懸賞板</div>
    <div style="font-size:.48rem;color:var(--sild);">每日更新。用${allParty()[0]?.name||'主角'}的素質進行判定。共鳴加成：+${getResonanceBonus()}</div></div>`;
  bounties.forEach((b,i)=>{
    h+=`<div style="background:var(--bg3);border:1px solid var(--brd);border-radius:3px;margin-bottom:.35rem;padding:.4rem .55rem;cursor:pointer;" onclick="acceptBounty(${i})">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><div style="font-size:.62rem;color:var(--goldl);font-weight:600;">${b.type}：${b.target}</div>
        <div style="font-size:.48rem;color:var(--sild);">${b.stat}判定・難度${b.diff}</div></div>
        <div style="text-align:right;"><div style="font-size:.58rem;color:var(--gold);">銀${b.reward.s}・銅${b.reward.c}</div></div>
      </div></div>`;
  });
  return h;
}

// ═══ BASE PRODUCTION（據點經營）═══ 本地化自動生產
function getBaseWorkers(){return G.baseWorkers||(G.baseWorkers={});}
function assignWorker(charId,facility){
  const w=getBaseWorkers();
  // 移除舊分配
  Object.keys(w).forEach(f=>{if(w[f]===charId)delete w[f];});
  if(facility)w[facility]=charId;
  saveGame();renderChanged('party');
}
function collectProduction(){
  const w=getBaseWorkers();const inv=getInv();const now=Date.now();
  const last=G._lastCollect||(now-180000); // 首次給3小時生產量
  const hours=Math.min(24,Math.floor((now-last)/60000)); // 1分鐘=1遊戲小時
  if(hours<1)return;
  G._lastCollect=now;
  const produced=[];
  Object.entries(w).forEach(([facility,charId])=>{
    const c=getCharData(charId);if(!c)return;
    const job=getJob(charId);
    const item=HQ_PRODUCTION[facility];if(!item)return;
    const qty=Math.floor(hours/item.rate);if(qty<1)return;
    const exist=inv.items.find(x=>x.n===item.n);
    if(exist){const m=exist.q.match(/(\d+)/);exist.q='×'+((m?parseInt(m[1]):1)+qty);}
    else inv.items.push({n:item.n,t:item.t,q:'×'+qty});
    produced.push(`${item.n}×${qty}（${c.name}）`);
  });
  if(produced.length){
    appendEntryToDOM({type:'sys',v:`🏗️ 據點生產收穫：${produced.join('、')}`});
    showToast('據點生產收穫！','ok');
    renderChanged('inv');saveGame();
  }
}

// ═══ DICE GAMBLE（骰子賭博）═══ 純本地
function openDiceGame(){
  const bet=Math.min(G.gold.copper+G.gold.silver*10+G.gold.gold*1000,50);
  if(bet<5){showToast('至少需要銅5才能賭','err');return;}
  const betAmount=Math.min(30,Math.floor(bet/2));
  const playerDice=[Math.floor(Math.random()*6)+1,Math.floor(Math.random()*6)+1];
  const dealerDice=[Math.floor(Math.random()*6)+1,Math.floor(Math.random()*6)+1];
  const pTotal=playerDice[0]+playerDice[1];
  const dTotal=dealerDice[0]+dealerDice[1];
  appendEntryToDOM({type:'sys',v:`🎲 骰子賭局！下注 銅${betAmount}`});
  appendEntryToDOM({type:'sys',v:`你的骰子：${playerDice[0]}＋${playerDice[1]}＝${pTotal}`});
  appendEntryToDOM({type:'sys',v:`莊家骰子：${dealerDice[0]}＋${dealerDice[1]}＝${dTotal}`});
  if(pTotal>dTotal){
    applyGold({g:0,s:0,c:betAmount});
    appendEntryToDOM({type:'sys',v:`✦ 你贏了！獲得 銅${betAmount}`});
    showToast(`贏了 銅${betAmount}！`,'ok');
  }else if(pTotal<dTotal){
    applyGold({g:0,s:0,c:-betAmount});
    appendEntryToDOM({type:'sys',v:`✗ 你輸了。失去 銅${betAmount}`});
    showToast(`輸了 銅${betAmount}…`,'err');
  }else{
    appendEntryToDOM({type:'sys',v:'平手！退回賭注。'});
    showToast('平手','inf');
  }
  scrollD();saveGame();
}

// ═══ FORTUNE TELLING（占卜系統）═══ 橘子星象占卜，本地化
const FORTUNES=[
  {text:'東方有一顆星正在墜落⋯⋯那裡可能有人在等。',hint:'往東探索可能遇到新星辰。',type:'star'},
  {text:'血色的月亮——今晚不適合趕路。',hint:'夜間移動風險增加。',type:'warn'},
  {text:'金幣的光芒指向北方市集。',hint:'北方城鎮可能有好交易。',type:'trade'},
  {text:'兩顆星在靠近⋯⋯它們之間有未了的緣分。',hint:'隊伍中某對角色關係可能加深。',type:'bond'},
  {text:'鐵與火的味道。匠人之星即將降世。',hint:'可能遇到生產職業的星辰。',type:'star'},
  {text:'一個被遺忘的地方藏著古老的寶物。',hint:'探索遺跡可能發現寶器。',type:'relic'},
  {text:'風向變了⋯⋯有人在暗處注視著你。',hint:'小心暗影勢力的動向。',type:'warn'},
  {text:'星辰排列成弓的形狀。遠方有戰事。',hint:'軍事衝突可能即將發生。',type:'war'},
  {text:'甜蜜的香氣⋯⋯橘子覺得今天適合吃魚。',hint:'餵橘子魚乾好感加倍。',type:'orange'},
  {text:'三顆星圍繞著一座山——據點的位置就在那裡。',hint:'據點選址的線索。',type:'base'},
  {text:'陰雲散去，明天會是晴天。',hint:'天氣好轉，適合遠行。',type:'weather'},
  {text:'第七顆星⋯⋯不，是第七十二顆。地煞的氣息很近。',hint:'附近有地煞星辰。',type:'star'},
];
function doFortune(){
  const day=G.time?.day||1;
  const idx=(day*13+7)%FORTUNES.length;
  const f=FORTUNES[idx];
  appendEntryToDOM({type:'dial',sp:'橘子🐈😒',ln:'喵⋯⋯喵喵。'});
  appendEntryToDOM({type:'dial',sp:'系統',ln:`〔翻譯：${f.text}〕`});
  appendEntryToDOM({type:'sys',v:`🔮 占卜提示：${f.hint}`});
  addIntel({id:'fortune_d'+day,title:'橘子占卜・Day'+day,content:f.text+'\n→ '+f.hint,src:'橘子占卜',rel:3,cat:'謠言',orange:true});
  showToast('🔮 橘子占卜','ok');
  scrollD();saveGame();
}

// ═══ ACTIVITIES TAB（活動面板）═══
function buildActivities(){
  let h='';
  // 共鳴
  h+=`<div style="padding:.4rem .5rem .2rem;border-bottom:1px solid var(--brd);margin-bottom:.4rem;">
    <div style="font-size:.62rem;color:var(--goldd);letter-spacing:.1em;font-weight:600;">✦ 星辰共鳴</div></div>`;
  h+=buildResonanceHtml();
  // 懸賞板
  h+=buildBountyBoard();
  // 料理
  h+=buildCookUI();
  // 賭博
  h+=`<div style="padding:.4rem .5rem .2rem;border-bottom:1px solid var(--brd);margin-top:.5rem;margin-bottom:.4rem;">
    <div style="font-size:.62rem;color:var(--goldd);letter-spacing:.1em;font-weight:600;">🎲 骰子賭局</div>
    <div style="font-size:.48rem;color:var(--sild);">在酒館試試手氣。自動下注銅幣。</div></div>
    <button onclick="openDiceGame()" style="width:calc(100% - 1rem);margin:0 .5rem .5rem;padding:.45rem;background:var(--bg3);border:1px solid var(--brd);border-radius:3px;color:var(--goldl);font-size:.62rem;cursor:pointer;font-family:'Noto Serif TC',serif;">🎲 擲骰子！</button>`;
  // 據點生產收穫
  const workers=Object.keys(getBaseWorkers()).length;
  if(workers>0){
    h+=`<div style="padding:.4rem .5rem .2rem;border-bottom:1px solid var(--brd);margin-top:.3rem;margin-bottom:.4rem;">
      <div style="font-size:.62rem;color:var(--goldd);letter-spacing:.1em;font-weight:600;">🏗️ 據點生產</div>
      <div style="font-size:.48rem;color:var(--sild);">${workers} 名工人運作中</div></div>
      <button onclick="collectProduction()" style="width:calc(100% - 1rem);margin:0 .5rem .5rem;padding:.45rem;background:var(--bg3);border:1px solid var(--brd);border-radius:3px;color:var(--goldl);font-size:.62rem;cursor:pointer;font-family:'Noto Serif TC',serif;">收穫生產物資</button>`;
  }
  return h+buildAchievements();
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
      const info=guilds[id]||{rank:0,exp:0};
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
  // Random event during rest
  setTimeout(()=>checkRandomEncounter('rest'),500);
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
  if(!G.time)G.time={day:1,hour:18,weather:'濃霧'};
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
  if(tm.advance)advanceTime(Math.min(tm.advance,240));
  if(tm.setHour!==undefined){G.time.hour=Math.max(0,Math.min(23,Math.floor(tm.setHour)));updateTimeDisplay();saveGame();}
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
    {id:'anchor_seal', name:'命運之錨・印',req:95,  type:'覺醒',
     desc:'橘子命運之錨的力量瞬間覺醒。本場景所有判定成功。一局限用一次。',
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
    const hints=['北方的山道似乎有人跡⋯⋯','橘子的耳朵朝向東邊的暗巷轉了一下','地上有一枚不起眼的銅扣——某人匆忙離開時掉的','空氣中有淡淡的草藥味，來源不明','牆上的刮痕像是某種暗號'];
    const h=hints[Math.floor(Math.random()*hints.length)];
    appendEntryToDOM({type:'dial',sp:'橘子🐈😒',ln:'喵⋯⋯'});
    appendEntryToDOM({type:'dial',sp:'系統',ln:`〔翻譯：${h}〕`});
    addIntel({id:'bond_hint_'+Date.now(),title:'橘子的引導',content:h,src:'羈絆感知',rel:4,cat:'謠言',orange:true});
    scrollD();saveGame();return;
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
          title="${escHtml(sk.desc)}"
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
          ${(()=>{const _ug=getUpgrade(c.id);const _expPct=_ug.expNext?Math.round((_ug.exp||0)/_ug.expNext*100):0;return c.id!=='orange'?`<div style="display:flex;align-items:center;gap:.3rem;margin-top:.15rem;">
            <span style="font-size:.46rem;color:var(--goldd);min-width:28px;">Lv.${_ug.lv||1}</span>
            <div style="flex:1;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;">
              <div style="width:${_expPct}%;height:100%;background:var(--goldd);border-radius:2px;transition:width .3s;"></div>
            </div>
            <span style="font-size:.42rem;color:var(--sild);">${_ug.exp||0}/${_ug.expNext||100}</span>
          </div>`:'';})()}
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
      <button class="pa suggest" onclick="event.stopPropagation();doFortune()">占卜🔮</button>
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
          <button class="pa suggest" onclick="doFortune()">占卜🔮</button>
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
  ev.stopPropagation();if(G.thinking)return;
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

  (Array.isArray(scenes)?scenes:[scenes]).forEach(e=>appendEntryToDOM(e));
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
  ev.stopPropagation();if(G.thinking)return;
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
  ev.stopPropagation();if(G.thinking)return;
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
  ev.stopPropagation();if(G.thinking)return;
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
    // 關於北斗星
    [{type:'dial',sp:'艾爾法😒',ln:'那個先行者⋯⋯你見過他嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'⋯⋯喵。'},
     {type:'sys',v:'〔系統翻譯：（沉默。這是少數讓橘子停頓的話題之一。）〕'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：他的氣息⋯⋯我記得。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'⋯⋯所以你也不是普通的貓。'},
    ],
    // 關於天氣
    [{type:'dial',sp:'艾爾法😒',ln:'今天天氣還行。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：我是貓。我不在乎天氣。我在乎的是魚。〕'},
    ],
    // 關於旅途
    [{type:'dial',sp:'艾爾法😒',ln:'我們接下來去哪？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
     {type:'sys',v:'〔系統翻譯：哪裡有魚就去哪裡。這個問題很難嗎。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'⋯⋯不是所有決策都能用魚來判斷的。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：（用看白痴的眼神）〕'},
    ],
    // 關於戰鬥
    [{type:'dial',sp:'艾爾法😒',ln:'剛才的戰鬥⋯⋯'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
     {type:'sys',v:'〔系統翻譯：你的劍法有退步。左側防禦太慢了0.3秒。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'⋯⋯你一隻貓是怎麼看出來的。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：因為我是一隻知力99的貓。〕'},
    ],
    // 關於紋章
    [{type:'dial',sp:'艾爾法😒',ln:'你對紋章有什麼感覺嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'⋯⋯喵。'},
     {type:'sys',v:'〔系統翻譯：（長時間沉默）它們在呼吸。每一枚都像是活著的東西。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'⋯⋯'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：別碰不該碰的。記住了。〕'},
    ],
    // 橘子吐槽
    [{type:'dial',sp:'艾爾法😒',ln:'橘子，你覺得我最近表現怎麼樣？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
     {type:'sys',v:'〔系統翻譯：以一個沒有工作、沒有背景、帶著一隻貓到處流浪的人來說⋯⋯還行吧。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'⋯⋯謝謝妳的肯定。'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：不客氣。現在去找魚乾。〕'},
    ],
    // 深夜
    [{type:'dial',sp:'艾爾法😒',ln:'還沒睡？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵⋯⋯'},
     {type:'sys',v:'〔系統翻譯：（凝視窗外）⋯⋯今晚的星星很吵。〕'},
     {type:'dial',sp:'艾爾法😒',ln:'星星會吵嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔系統翻譯：對你來說是沉默的。對我來說⋯⋯每顆都在說話。〕'},
    ],
  ];
  const fav=getFavor('orange')||50;
  // 好感高時解鎖北斗星話題
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
  ev.stopPropagation();if(G.thinking)return;
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
    // 更多建議
    [{type:'dial',sp:'艾爾法😒',ln:'有什麼該注意的嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵——喵。'},
     {type:'sys',v:'〔橘子建議：你的錢快不夠了。在花錢之前先想想怎麼賺。〕'},
    ],
    [{type:'dial',sp:'艾爾法😒',ln:'該去哪探索？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵。'},
     {type:'sys',v:'〔橘子建議：北方有什麼在召喚。不是敵意，是⋯⋯類似邀請。〕'},
    ],
    [{type:'dial',sp:'艾爾法😒',ln:'我的裝備夠用嗎？'},
     {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
     {type:'sys',v:'〔橘子建議：你的劍快撐不住了。找個鐵匠看看，或者⋯⋯自己鍛造。活動頁面有鍛造選項。〕'},
    ],
    [{type:'dial',sp:'艾爾法😒',ln:'最近有什麼不對勁的地方？'},
     {type:'dial',sp:'橘子🐈😒',ln:'⋯⋯喵。'},
     {type:'sys',v:'〔橘子建議：空氣中有紋章的氣息。很微弱，但確實存在。小心。〕'},
    ],
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
  // 頭像：已招募用角色頭像，接觸中用星辰感知頭像
  let thumbHtml='';
  if(recruited&&s.id){const src=getPortraitSrc(s.id);if(src)thumbHtml=`<img src="${src}" style="width:100%;height:32px;object-fit:cover;object-position:center top;border-radius:2px;margin-bottom:.1rem;" onerror="this.style.display='none'"/>`;}
  else if(contact){const src=getCustomPortrait(`star_${t}_${s.num}`);if(src)thumbHtml=`<img src="${src}" style="width:100%;height:32px;object-fit:cover;object-position:center top;border-radius:2px;margin-bottom:.1rem;opacity:.7;" onerror="this.style.display='none'"/>`;}
  return `<div class="sc ${cls}" onclick="openStar('${t}',${s.num})" style="${inParty?'border-color:rgba(76,175,122,.6)':''}">
    ${thumbHtml}
    <div class="stp">${t}</div>
    <div class="snm">第${s.num}星</div>
    <div class="sst">${s.star}</div>
    <div class="snm2">${nm}</div>
    ${statusHtml}
  </div>`;
}
function openItemDetail(name){
  const db=ITEM_DB[name];if(!db)return;
  const inv=getInv();
  const item=inv.items.find(i=>i.n===name);
  const qty=item?item.q:'×0';
  document.getElementById('modal-inner').innerHTML=`
    <div style="text-align:center;padding:.5rem 0;">
      <div style="font-size:2rem;">${db.icon||'📦'}</div>
      <div style="font-size:.85rem;color:var(--sil);font-weight:600;margin:.2rem 0;">${name}</div>
      <div style="font-size:.56rem;color:var(--sild);">${db.cat||'道具'} ・ ${qty}</div>
    </div>
    <div style="font-size:.64rem;color:#7a8fa0;line-height:1.7;padding:.3rem 0;border-top:1px solid var(--brd);">
      ${db.t||''}
    </div>
    ${db.effect?.hp?`<div style="font-size:.6rem;color:#6ab46a;margin:.2rem 0;">效果：HP +${db.effect.hp}</div>`:''}
    ${db.effect?.favor?`<div style="font-size:.6rem;color:#6ab46a;margin:.2rem 0;">效果：好感度提升</div>`:''}
    ${db.effect?.cure?`<div style="font-size:.6rem;color:#6ab46a;margin:.2rem 0;">效果：${db.effect.cure==='all'?'解除所有異常':'解除'+db.effect.cure}</div>`:''}
    ${db.effect?.buff?`<div style="font-size:.6rem;color:rgba(180,140,220,.8);margin:.2rem 0;">增益：${STATUS_EFFECTS[db.effect.buff]?.name||db.effect.buff}</div>`:''}
    ${db.bonus?`<div style="font-size:.6rem;color:#6ab46a;margin:.2rem 0;">素質：${bonusText(db.bonus)}</div>`:''}
    ${db.price?`<div style="font-size:.56rem;color:var(--goldd);margin:.2rem 0;">價值：${priceStr(db.price)}</div>`:''}
    ${db.slot?`<div style="font-size:.56rem;color:var(--sild);margin:.2rem 0;">部位：${db.slot}</div>`:''}
    <div style="display:flex;gap:.3rem;margin-top:.4rem;">
      ${item&&(db.effect?.hp||db.effect?.favor||db.effect?.cure)?`<button onclick="useItem('${name.replace(/'/g,"\\\\'")}');closeD();" style="flex:1;padding:.35rem;font-size:.62rem;background:rgba(100,180,100,.12);border:1px solid rgba(100,180,100,.4);border-radius:3px;color:#6ab46a;cursor:pointer;font-family:'Noto Serif TC',serif;">使用</button>`:''}
      <button onclick="closeD()" style="flex:1;padding:.35rem;font-size:.62rem;background:transparent;border:1px solid var(--brd);border-radius:3px;color:var(--sild);cursor:pointer;font-family:'Noto Serif TC',serif;">關閉</button>
    </div>`;
  document.getElementById('detail-modal').classList.add('open');
}
function buildInv(){
  const inv=getInv();
  const equipped=(inv.equip||[]).filter(i=>i.status==='equipped');
  const held=(inv.equip||[]).filter(i=>i.status!=='equipped');
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
      ${canUnequip&&i.slot?`<button onclick="event.stopPropagation();upgradeEquip(allParty().find(m=>m.name==='${escHtml(String(i.w).replace(/'/g,"\\\'"))}')?.id||'alfar','${escHtml(i.slot)}')"
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
  <div class="isec"><div class="ittl">道具欄</div>${[...inv.items].sort((a,b)=>{const da=ITEM_DB[a.n],db2=ITEM_DB[b.n];const ca=da?.cat||'',cb=db2?.cat||'';return ca.localeCompare(cb)||a.n.localeCompare(b.n);}).map(i=>{const db=ITEM_DB[i.n];const usable=db&&(db.effect?.hp||db.effect?.favor||db.effect?.cure);return`<div class="irow" onclick="openItemDetail('${i.n.replace(/'/g,"\\\\'")}')" style="cursor:pointer;"><div style="flex:1"><div class="inm">${db?.icon||''} ${i.n}</div><div class="int">${db?.t||i.t}</div></div><div style="display:flex;align-items:center;gap:.3rem;"><span class="iqt">${i.q}</span>${usable?`<button onclick="event.stopPropagation();useItem('${i.n.replace(/'/g,"\\\\'")}')" style="font-size:.55rem;padding:.12rem .35rem;background:rgba(100,180,100,.1);border:1px solid rgba(100,180,100,.4);border-radius:2px;color:#6ab46a;cursor:pointer;font-family:'Noto Serif TC',serif;">使用</button>`:''}</div></div>`;}).join('')}</div>
  <div class="isec"><div class="ittl">重要情報</div>${inv.key.map(i=>{const db=ITEM_DB[i.n];return`<div class="irow"><div><div class="inm">${db?.icon||'📋'} ${i.n}</div><div class="int">${db?.t||i.t}</div></div><div class="iqt">${i.q}</div></div>`;}).join('')}</div>
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
   intel:{id:'os_1',title:'橘子的夜間行為',content:'橘子有時在深夜凝視某個方向，即便那裡空無一物。她的反應不像普通的貓。',src:'艾爾法觀察',rel:3,cat:'人物',orange:true,related:'橘子・命運之錨'}},

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
    {type:'sys',v:'✦ 命運之錨・封印解除 ✦\n晁蓋之位的真正力量覺醒：橘子的感知覆蓋整個艾爾薩大陸。北斗星下108星辰的一切動向，她都能察覺。'},
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
   unlock:'橘子開始有更深的感知反應。聊天中北斗星話題解鎖。'},
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
  appendEntryToDOM({type:'sys',v:`⚜️ 北斗星線索（${n}）：【${clue.title}】`});
  // 檢查門檻解鎖
  const tier=FOUNDER_TIERS.find(t=>t.at===n);
  if(tier){
    appendEntryToDOM({type:'sys',v:`✦ 線索達到 ${n} 條——【${tier.label}】`});
    checkFounderTierUnlock(n);
    showToast('線索里程碑：'+tier.label,'ok');
  }else{
    showToast('北斗星線索 +1（'+n+'條）','ok');
  }
  // 自動加入情報板
  addIntel({id:'founder_'+clue.id, title:'北斗星・'+clue.title,
    content:clue.content, src:clue.src||'不明來源',
    rel:clue.rel||3, cat:'人物', orange:clue.orange||false,
    related:'北斗星・先行者'});
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
    // 橘子的北斗星話題解鎖已在 chatOrange 中透過好感度控制，這裡額外觸發
    appendEntryToDOM({type:'narr',v:'橘子從艾爾法的懷中坐起，望向遠方，耳朵微微轉動。那個方向，什麼也沒有——或者說，沒有任何人類能看見的東西。'});
    appendEntryToDOM({type:'dial',sp:'橘子🐈😒',ln:'喵⋯⋯'});
    appendEntryToDOM({type:'sys',v:'〔橘子感知：某個記憶的殘影。她認識那個氣息。〕'});
  }
  if(n>=12&&!G._clue12Shown){
    G._clue12Shown=true;
    appendEntryToDOM({type:'sys',v:'═══ 線索達到12條。某個古老的訊息正在顯現。═══'});
    appendEntryToDOM({type:'narr',v:'夜風忽然停了。橘子的瞳孔驟然收縮，藍色的光芒在她的眼底一閃而逝。她看見了什麼——是先行者留在星辰之間的最後訊息。'});
    appendEntryToDOM({type:'dial',sp:'橘子🐈😒',ln:'喵嗚————'});
    appendEntryToDOM({type:'dial',sp:'系統',ln:'〔翻譯：他⋯⋯留了話。給所有繼承星辰之路的人。但我還看不清全部。需要更多線索。〕'});
    addIntel({id:'clue_milestone_12',title:'先行者的殘響',content:'北斗星的12條線索匯聚，橘子隱約感知到先行者臨終前留下的訊息碎片。真相尚不完整，但方向已經浮現。',src:'橘子感知',rel:5,cat:'人物',orange:true});
    showToast('✦ 主線解鎖：先行者的殘響','ok');
    saveGame();
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
    desc:'一把來歷不明的無銘短劍。劍身有一道奇異的裂紋，卻怎麼也折不斷。彷彿命運本身的傷痕。',
    effect:'武力+15・大成功時額外傷害',
    bonus:{武力:15},
    status:'equipped', equippedTo:'alfar',
    lore:'天魁星降世之器。它選擇了她——或者說，它一直在等她。'},
  'orange': {starId:'orange', starName:'橘子', starNum:'地1', name:'命運之錨',
    type:'神物', icon:'⚓', rarity:'傳說',
    desc:'一枚五枚銅幣買來的貓。帝國最後的占星師說：「凡能找到這隻貓的人，便是命運之主。」',
    effect:'【封印中】覺醒後：全隊感知範圍擴大',
    bonus:null,
    status:'sealed', equippedTo:'orange',
    lore:'晁蓋之位降世之器。她本身即是寶器——不屬於108星，卻是引導星辰聚合的錨。她選擇了誰，命運便跟隨誰。'},
};

// 寶器品質顏色
const RELIC_RARITY_COLOR={普通:'#888',精良:'#6ab4c8',稀有:'var(--gold)',傳說:'rgba(200,120,220,.9)',神器:'#ff6060'};

function getRelicCount(){return Object.keys(G.relics).length+Object.keys(PRESET_RELICS).length;}

function applyRelic(r){
  if(!r||!r.id)return;
  const existed=!!G.relics[r.id];
  G.relics[r.id]={...r, foundDay:G.time?.day||1, status:r.status||'held', equippedTo:r.equippedTo||null};
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
      <span style="font-size:.52rem;color:var(--sild);">${foundCount}/${count} 已知</span>
    </div>
    ${all.map(r=>{
      const col=RELIC_RARITY_COLOR[r.rarity]||'var(--gold)';
      const sealed=r.status==='sealed';
      const equipped=r.status==='equipped';
      const holder=r.equippedTo?getCharData(r.equippedTo)?.name||r.starName:'';
      const bText=r.bonus?bonusText(r.bonus):'';
      return`<div style="display:flex;gap:.5rem;align-items:flex-start;padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.04);">
        <span style="font-size:1.1rem;flex-shrink:0;opacity:${sealed?0.5:1}">${r.icon||'◈'}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:.3rem;margin-bottom:.1rem;flex-wrap:wrap;">
            <span style="font-size:.72rem;color:${col};font-weight:600">${r.name}</span>
            ${r.rarity?`<span style="font-size:.48rem;color:${col};border:1px solid ${col};border-radius:2px;padding:.02rem .22rem;opacity:.7">${r.rarity}</span>`:''}
            ${r.type?`<span style="font-size:.5rem;color:var(--sild);">${r.type}</span>`:''}
            ${equipped?`<span style="font-size:.46rem;color:#6ab46a;border:1px solid rgba(100,180,100,.4);border-radius:2px;padding:.02rem .2rem;">裝備中</span>`:''}
          </div>
          <div style="font-size:.6rem;color:var(--sild);line-height:1.45;margin-bottom:.12rem">${r.desc||''}</div>
          ${bText?`<div style="font-size:.58rem;color:#6ab46a;margin-bottom:.08rem;">${bText}</div>`:''}
          ${r.effect?`<div style="font-size:.56rem;color:${sealed?'var(--sild)':'rgba(180,140,220,.8)'};">${r.effect}</div>`:''}
          ${r.lore?`<div style="font-size:.52rem;color:rgba(150,140,100,.5);margin-top:.08rem;font-style:italic">${r.lore}</div>`:''}
          ${holder?`<div style="font-size:.5rem;color:rgba(120,120,100,.5);margin-top:.06rem">持有者：${holder}</div>`:''}
          ${!sealed&&r.starId?`<div style="margin-top:.3rem;">
            ${equipped?`<button onclick="unequipRelic('${r.starId||r.id}')" style="font-size:.55rem;padding:.15rem .4rem;background:transparent;border:1px solid rgba(204,68,68,.35);border-radius:2px;color:rgba(204,68,68,.7);cursor:pointer;font-family:'Noto Serif TC',serif;">卸下寶器</button>`
            :`<button onclick="equipRelic('${r.starId||r.id}')" style="font-size:.55rem;padding:.15rem .4rem;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.4);border-radius:2px;color:var(--goldd);cursor:pointer;font-family:'Noto Serif TC',serif;">裝備寶器</button>`}
          </div>`:''}
        </div>
      </div>`;
    }).join('')}
    ${found.length===0?`<div style="font-size:.62rem;color:rgba(120,120,100,.5);padding:.3rem 0">其餘寶器散落於艾爾薩大陸各處，等待命運之人尋回。</div>`:''}
  </div>`;
}

function equipRelic(id){
  const relic=PRESET_RELICS[id]||G.relics[id];
  if(!relic||relic.status==='sealed')return;
  relic.status='equipped';
  relic.equippedTo=relic.starId||'alfar';
  showToast(`寶器 ${relic.name} 已裝備`,'ok');
  renderChanged('inv','party');saveGame();
}
function unequipRelic(id){
  const relic=PRESET_RELICS[id]||G.relics[id];
  if(!relic)return;
  relic.status='held';
  relic.equippedTo=null;
  showToast(`寶器 ${relic.name} 已卸下`,'ok');
  renderChanged('inv','party');saveGame();
}

// 計算寶器加成（用於戰鬥等系統）
function getRelicBonus(charId){
  const bonus={武力:0,知力:0,統率:0,魅力:0,幸運:0};
  // Check preset relics
  Object.values(PRESET_RELICS).forEach(r=>{
    if(r.equippedTo===charId&&r.bonus&&r.status==='equipped'){
      Object.entries(r.bonus).forEach(([k,v])=>{if(bonus[k]!==undefined)bonus[k]+=v;});
    }
  });
  // Check found relics
  Object.values(G.relics).forEach(r=>{
    if(r.equippedTo===charId&&r.bonus&&r.status==='equipped'){
      Object.entries(r.bonus).forEach(([k,v])=>{if(bonus[k]!==undefined)bonus[k]+=v;});
    }
  });
  return bonus;
}

// ═══ CREST SYSTEM（紋章系統）═══
// 世界創生時，始源之劍與盾的碰撞產生27枚真紋章，蘊含世界根源法則。
// 帝國崩裂之夜，沉睡的真紋章開始覺醒，與108星辰的降世息息相關。
// 一般紋章為真紋章的碎片化衍生，可裝備使用。

const TRUE_CRESTS=[
  // ── 始源紋章群（3）── 世界誕生之力
  {id:'genesis',  cat:'始源', name:'創世真紋章',  icon:'🌌', color:'#e0c0ff',
   desc:'萬物起源之力。傳說在世界誕生的瞬間，虛空中第一道光凝結為此紋章。持有者可觸及存在的根源——但凡人的意識能否承受「一切的真相」？',
   curse:'持有者逐漸喪失凡人的情感，最終成為不哭不笑的「觀測者」。',
   lore:'帝國始祖曾短暫觸及此紋章，建立了六百年霸業。但他的日記最後一頁只有一句話：「我什麼都看見了。所以我什麼都不再感受。」',
   effect:'所有素質判定+5・解鎖隱藏劇情分支',
   location:'unknown', holder:null, status:'dormant'},
  {id:'blade',    cat:'始源', name:'劍真紋章',    icon:'⚔️', color:'#ff6060',
   desc:'劈開天地的始源之劍凝結而成。純粹的「斬斷」之力——斬斷肉體、斬斷因果、甚至斬斷命運本身。',
   curse:'持有者無法停止戰鬥的渴望。和平時期會陷入無法控制的狂暴。',
   lore:'傳說始源之劍將盾擊碎為大地，自身化為蒼穹。劍真紋章是那把劍留在世上最後的碎片。',
   effect:'武力+30・攻擊無視防禦・大成功時觸發「斷命一閃」',
   location:'unknown', holder:null, status:'dormant'},
  {id:'bulwark',  cat:'始源', name:'盾真紋章',    icon:'🛡️', color:'#6090ff',
   desc:'承受一切的始源之盾凝結而成。絕對的「守護」之力——守護生命、守護記憶、守護世界的形態。',
   curse:'持有者背負世界的重量，壽命以常人十倍的速度流逝。',
   lore:'始源之盾被劍擊碎後化為大地，但盾的意志並未消散。它化為紋章，繼續守護——即使被守護的一切早已改變。',
   effect:'全隊 HP+50%・受到致命傷害時觸發「不碎之壁」',
   location:'unknown', holder:null, status:'dormant'},

  // ── 元素紋章群（5）── 自然法則之力
  {id:'hellfire', cat:'元素', name:'炎獄真紋章',  icon:'🔥', color:'#ff4400',
   desc:'灼燒一切的原初之火。不僅燃燒物質，更能燃燒概念——仇恨、記憶、乃至時間本身。',
   curse:'持有者的體溫不斷升高，最終會自燃。歷代持有者平均壽命僅十二年。',
   lore:'南荒的龍牙砦深處，地熱異常的源頭。當地居民稱之為「地底的心臟」。',
   effect:'火屬性魔法威力三倍・免疫火焰・周圍敵人每回合灼傷',
   location:'南荒・龍牙砦深處', holder:null, status:'dormant'},
  {id:'abyssal',  cat:'元素', name:'冥淵真紋章',  icon:'🌊', color:'#0066cc',
   desc:'深淵之水。據說世界最深處有一片永不見光的海洋，冥淵紋章便是那片海的意志。',
   curse:'持有者逐漸被深淵吸引，最終無法離開水域。許多持有者的結局是沉入大海。',
   lore:'東海王國的漁民有時會在暴風雨中看見海底的藍光。那不是生物——是紋章在呼喚。',
   effect:'水屬性魔法威力三倍・水中行動自如・召喚海嘯',
   location:'東海・深海海溝', holder:null, status:'dormant'},
  {id:'tempest',  cat:'元素', name:'天嵐真紋章',  icon:'🌪️', color:'#88ddaa',
   desc:'自由之風的具現。風無形無質，卻能摧毀一切。持有者獲得絕對的自由——包括擺脫因果律的自由。',
   curse:'持有者無法在同一個地方停留超過三天。永恆的流浪者。',
   lore:'翠林域上空有時會出現不自然的氣流螺旋。精靈長老說那是「風的紋章在散步」。',
   effect:'風屬性魔法威力三倍・移動速度倍增・迴避率大幅提升',
   location:'翠林域・風之迴廊', holder:null, status:'dormant'},
  {id:'thunder',  cat:'元素', name:'雷霆真紋章',  icon:'⚡', color:'#ffdd00',
   desc:'天罰之雷。傳說這是世界用來懲罰違背法則者的力量。閃電是天意的裁決，雷鳴是判決的宣告。',
   curse:'持有者會不自覺地審判周圍的一切。所有的灰色地帶在他眼中都變成非黑即白。',
   lore:'王冠峰山頂的落雷頻率是其他地方的一百倍。那裡有一把被雷劈成焦炭的古劍——它曾經是某個持有者的武器。',
   effect:'雷屬性魔法威力三倍・攻擊附帶麻痺・命中率100%',
   location:'中央王國・王冠峰', holder:null, status:'dormant'},
  {id:'terra',    cat:'元素', name:'磐石真紋章',  icon:'🏔️', color:'#8b6914',
   desc:'大地之力的根源。山脈、荒野、沃土——一切堅實之物的法則都源於此紋章。不動如山，沉穩如石。',
   curse:'持有者身體逐漸石化。最終會化為一座雕像，永遠守護腳下的土地。',
   lore:'霧山山脈的地質異常。矮人族傳說山脈本身就是遠古持有者石化後的遺體。',
   effect:'地屬性魔法威力三倍・防禦力倍增・免疫擊退和擊飛',
   location:'霧山山脈・地心', holder:null, status:'dormant'},

  // ── 天體紋章群（4）── 星辰運行之力
  {id:'solar',    cat:'天體', name:'曜日真紋章',  icon:'☀️', color:'#ffaa00',
   desc:'太陽之力。光明、溫暖、希望——但也是灼燒、旱災、毀滅。太陽不分善惡地照耀一切。',
   curse:'持有者的情感會傳染給周圍所有人。快樂時眾人狂喜，悲傷時眾人痛哭。孤獨成為唯一的選擇。',
   lore:'中央王國的王位繼承者曾持有此紋章。「太陽王」的統治帶來黃金時代——也帶來了帝國末期的瘋狂。',
   effect:'光屬性魔法・全隊攻擊+15・驅散黑暗系狀態',
   location:'鏽城・帝國王座', holder:null, status:'dormant'},
  {id:'lunar',    cat:'天體', name:'月輪真紋章',  icon:'🌙', color:'#aabbdd',
   desc:'月亮之力。陰影、秘密、變化。月有陰晴圓缺，持有者的力量也隨月相增減。',
   curse:'滿月之夜力量暴走，新月之夜力量歸零。持有者永遠無法擁有穩定的力量。',
   lore:'銀月城之名來源於此。建城者在城中心封印了月輪紋章的碎片，使城市永遠沐浴在銀色月光中。',
   effect:'暗屬性魔法・滿月時全素質+20・新月時變身能力解鎖',
   location:'銀月城・月之地窖', holder:null, status:'dormant'},
  {id:'stellar',  cat:'天體', name:'星命真紋章',  icon:'✦', color:'#ddc0ff',
   desc:'與108命運之星直接相關的紋章。掌控星辰降世與聚合的法則。持有者能感知所有星辰之人的位置與命運。',
   curse:'持有者看見所有人的命運軌跡，卻無法改變任何一條。全知帶來的是無盡的無力感。',
   lore:'北斗星・先行者可能曾經觸及此紋章——這或許就是他能感知108星降世的原因，也可能是他倒下的原因。',
   effect:'感知所有星辰位置・招募成功率+50%・解鎖星辰共鳴',
   location:'unknown', holder:null, status:'dormant'},
  {id:'eclipse',  cat:'天體', name:'蝕真紋章',    icon:'🌑', color:'#553355',
   desc:'日蝕與月蝕之力。光與暗的交錯、秩序與混沌的邊界。代表「例外」與「異變」的力量。',
   curse:'持有者的存在本身就是異變。周圍的因果律會扭曲，巧合頻繁發生，命運不再可預測。',
   lore:'帝國崩裂之夜，天象記錄中除了108顆流星外，還有一次短暫的日蝕——在夜晚。這在天文學上不可能發生。',
   effect:'無視屬性相剋・敵方增益全部反轉・觸發隨機奇蹟事件',
   location:'unknown', holder:null, status:'dormant'},

  // ── 生滅紋章群（4）── 生死輪轉之力
  {id:'vitality', cat:'生滅', name:'生命真紋章',  icon:'💚', color:'#00cc66',
   desc:'生命力的源泉。能治癒一切傷病、甚至復活死者。但生命紋章的持有者會發現——給予生命的代價是自己的生命。',
   curse:'每次使用治癒力量，持有者自身的壽命會等量減少。治癒他人一年的傷，就失去自己一年的壽命。',
   lore:'傳說帝國時代有一位持有者在瘟疫中治癒了整座城市三萬人。之後她在一夜之間老去，含笑而終。',
   effect:'全隊HP回復+100%・復活已死亡同伴・免疫所有負面狀態',
   location:'翠林域・世界樹根部', holder:null, status:'dormant'},
  {id:'souleater',cat:'生滅', name:'魂噬真紋章',  icon:'💀', color:'#880088',
   desc:'吞噬靈魂的紋章。每當持有者身邊有人死去，那個靈魂就會被紋章吸收。積累的靈魂越多，力量越強大。',
   curse:'紋章會主動製造死亡來餵養自己。持有者身邊的人會以各種方式接連死去——事故、疾病、戰場。',
   lore:'這是所有真紋章中最被詛咒的一枚。據說每一任持有者最終都會成為孤身一人——因為身邊所有人都已被紋章吞噬。',
   effect:'每次擊殺敵人永久+1全素質・召喚亡靈軍團・即死魔法',
   location:'鏽城・帝國地下墓穴', holder:null, status:'dormant'},
  {id:'samsara',  cat:'生滅', name:'輪迴真紋章',  icon:'♾️', color:'#cc8800',
   desc:'死與生的循環之力。萬物終將消亡，萬物終將重生。這枚紋章記錄了世界誕生以來每一次死亡與重生。',
   curse:'持有者能看見所有事物的「前世」。每一棵樹、每一塊石頭、每一個人——你看見的不是他們，而是他們曾經是誰。',
   lore:'108星的降世本身，或許就是輪迴紋章運作的結果。那些星辰之人，會不會是前世某群人的轉生？',
   effect:'戰鬥不敵時自動復活一次・察覺隱藏的前世因緣・解鎖輪迴劇情',
   location:'unknown', holder:null, status:'dormant'},
  {id:'nihil',    cat:'生滅', name:'虛無真紋章',  icon:'⬛', color:'#444444',
   desc:'一切的終結。不是死亡——死亡之後還有輪迴。虛無是比死亡更深的消滅：連存在的痕跡都不會留下。',
   curse:'持有者周圍的事物會逐漸「消失」。先是顏色，然後是聲音，然後是記憶——最終，連持有者自己是否存在都變得可疑。',
   lore:'帝國崩裂之夜，帝都有三個街區在一瞬間消失。不是毀滅——是消失。連廢墟都沒有留下。沒有人記得那裡曾經有什麼。',
   effect:'消滅魔法（無視一切防禦）・概念抹除・觸發虛無侵蝕事件',
   location:'鏽城・消失街區的中心', holder:null, status:'dormant'},

  // ── 支配紋章群（4）── 權力與法則之力
  {id:'sovereign',cat:'支配', name:'霸王真紋章',  icon:'👑', color:'#ffd700',
   desc:'統治的力量。持有者的命令對所有生命具有強制力。王權的極致——但絕對的權力帶來絕對的孤獨。',
   curse:'持有者無法分辨真心的服從和紋章的強制。每一句「是的，陛下」都可能是紋章的傀儡術，而非真心。',
   lore:'聖赫倫帝國初代皇帝是此紋章的持有者。六百年帝國——六百年的孤獨。末代皇帝暴斃之夜，紋章消失了。',
   effect:'統率+30・強制命令（低等級敵人自動投降）・領地內全員增益',
   location:'鏽城・帝國玉座', holder:null, status:'dormant'},
  {id:'chaos',    cat:'支配', name:'混沌真紋章',  icon:'🌀', color:'#ff00ff',
   desc:'秩序的對立面。混沌不是邪惡——它是可能性本身。在混沌中，任何事都可能發生，任何規則都可能被打破。',
   curse:'持有者周圍的因果律崩壞。計劃永遠趕不上變化，盟友可能突然變成敵人，敵人可能突然成為朋友。',
   lore:'霧刃幫的崛起速度異常——一個山賊組織怎麼可能在三年內控制整個山口地帶？有人懷疑他們的首領觸及了混沌紋章。',
   effect:'敵方所有判定隨機化・隨機觸發有利事件・打破任何封印',
   location:'unknown', holder:null, status:'dormant'},
  {id:'order',    cat:'支配', name:'秩序真紋章',  icon:'⚖️', color:'#4488cc',
   desc:'法則之力。秩序紋章維持世界的規則運轉——物理法則、因果律、甚至命運的軌道。',
   curse:'持有者無法容忍任何「例外」。所有的創造、變革、叛逆在他眼中都是必須被糾正的錯誤。',
   lore:'帝國的法典不是人寫的——是秩序紋章的碎片投影。所以帝國法律完美到不近人情。',
   effect:'全隊判定結果穩定化（消除隨機性）・封印敵方技能・結界魔法',
   location:'中央王國・帝國法院遺址', holder:null, status:'dormant'},
  {id:'judgment', cat:'支配', name:'審判真紋章',  icon:'⚜️', color:'#cc4444',
   desc:'罪與罰的紋章。能看穿一切謊言、審視一切罪行、執行一切刑罰。正義的化身——或暴力的正當化。',
   curse:'持有者眼中所有人都有罪。因為在絕對的正義面前，沒有人是完全清白的。持有者最終會審判自己。',
   lore:'帝國審判庭曾使用此紋章的碎片製作「審問之眼」。那隻眼睛能逼迫任何人說出真話——也逼瘋了三任審判長。',
   effect:'看穿謊言和隱藏意圖・對「有罪者」傷害倍增・免疫精神攻擊',
   location:'鏽城・審判庭廢墟', holder:null, status:'dormant'},

  // ── 奧義紋章群（4）── 超越常理之力
  {id:'illusion', cat:'奧義', name:'夢幻真紋章',  icon:'🦋', color:'#ee88cc',
   desc:'夢境與幻象的力量。現實與虛幻的界線在持有者手中變得模糊。創造幻象、潛入夢境、甚至將夢境變為現實。',
   curse:'持有者逐漸無法分辨夢與現實。最終可能永遠沉睡在自己創造的完美夢境中——或者，那才是真正的現實？',
   lore:'影沼地的瘴氣不是毒——是夢幻紋章的殘餘力量。沼澤居民長期暴露後產生幻覺，分不清真假。',
   effect:'創造幻象欺騙敵人・潛入NPC夢境獲取情報・解鎖夢境地圖',
   location:'影沼地・霧之核心', holder:null, status:'dormant'},
  {id:'chronos',  cat:'奧義', name:'時律真紋章',  icon:'⏳', color:'#aa88ff',
   desc:'時間之力。加速、減速、暫停、甚至回溯。但時間是世界最脆弱的法則——任何干涉都可能造成災難性的後果。',
   curse:'持有者的時間感知紊亂。一秒可能感覺像一年，一年可能感覺像一秒。與他人的時間永遠不同步。',
   lore:'帝國崩裂之夜，有人試圖用時律紋章阻止皇帝的死亡。結果不但沒有成功——還讓整座帝都陷入時間裂縫。',
   effect:'戰鬥中暫停時間一回合・預知下回合敵人行動・回溯一次選擇',
   location:'鏽城・時間裂縫', holder:null, status:'dormant'},
  {id:'gateway',  cat:'奧義', name:'門扉真紋章',  icon:'🚪', color:'#66ccaa',
   desc:'連接一切空間的力量。開啟通往任何地方的門——不僅是物理空間，也包括異界、夢境、甚至其他時間線。',
   curse:'持有者身邊會自發性出現空間裂縫。不知道什麼時候會踏入另一個世界，也不知道另一個世界的什麼會踏入這裡。',
   lore:'影沼地深處通往「地底世界」的通道——可能就是門扉紋章造成的永久空間裂縫。',
   effect:'瞬間移動到已知地點・召喚異界生物・打開次元裂縫',
   location:'影沼地・地底入口', holder:null, status:'dormant'},
  {id:'sage',     cat:'奧義', name:'智慧真紋章',  icon:'📖', color:'#88aacc',
   desc:'全知之力。持有者能閱讀世界的「源碼」——理解一切現象背後的原理，包括其他紋章的運作方式。',
   curse:'知識是沉重的。持有者會被無窮無盡的資訊淹沒。很多持有者在獲得全知後選擇了沉默，因為語言無法表達他們看見的東西。',
   lore:'翠林域的禁忌書庫——傳說是某任智慧紋章持有者將自己的全知投影為實體書籍。但沒有人能讀完。',
   effect:'知力+30・看穿敵人弱點・解鎖所有隱藏情報・辨識一切紋章',
   location:'翠林域・禁忌書庫', holder:null, status:'dormant'},

  // ── 命運紋章群（3）── 改變世界之力
  {id:'revolution',cat:'命運', name:'變革真紋章', icon:'🔄', color:'#ff8844',
   desc:'變化與革命之力。一切停滯都將被打破，一切舊秩序都將被推翻。這是「逼上梁山」之力的根源。',
   curse:'持有者無法安於現狀。即使建立了新秩序，紋章也會驅使持有者再次推翻它。永恆的革命者。',
   lore:'每一次大陸歷史的劇變背後，都有變革紋章的影子。帝國的建立、帝國的崩裂——或許都是同一枚紋章在推動。',
   effect:'逆境中全素質+10・推翻任何「不可能」的判定・觸發革命劇情線',
   location:'unknown', holder:null, status:'dormant'},
  {id:'polaris',  cat:'命運', name:'北斗真紋章',  icon:'🌟', color:'#ffe4b5',
   desc:'指引之力。北斗星永遠指向北方——這枚紋章永遠指向「正確的道路」。與北斗星・先行者直接相關的核心紋章。',
   curse:'持有者能看見正確的路，卻未必能走到終點。先行者的宿命——照亮他人的路，自己卻倒在半途。',
   lore:'北斗星・先行者倒下時，這枚紋章碎裂為數個碎片散落各地。蒐集碎片或許能解開先行者的真相。與北斗星線索系統直接關聯。',
   effect:'指引星辰之人所在方向・解鎖北斗星主線・全隊幸運+15',
   location:'碎裂散落', holder:null, status:'dormant'},
  {id:'dawn',     cat:'命運', name:'黎明真紋章',  icon:'🌅', color:'#ffcc88',
   desc:'新紀元之力。當黑夜最深沉的時刻過去，黎明終將到來。這是終結亂世、開啟新時代的力量——108星聚齊之時覺醒。',
   curse:'黎明到來之前，持有者必須承受最深沉的黑夜。所有的苦難、所有的犧牲，都在黎明前最後的黑暗中積累。',
   lore:'占星師的預言中記載：「當108星齊聚於北斗之下，黎明紋章將在命運之錨的見證下覺醒，亂世終結，新紀元開始。」',
   effect:'108星全員齊聚時覺醒・終結亂世・觸發最終章・全員素質+20',
   location:'命運之座（據點最終設施）', holder:null, status:'dormant'},
];

// 一般紋章：真紋章的碎片化衍生，可透過商店、寶箱、掉落獲得
const REGULAR_CRESTS=[
  // 元素系
  {id:'fire_1',      cat:'元素', name:'火焰紋章',    icon:'🔥', rarity:'普通', desc:'基礎火屬性紋章。裝備後可使用火焰箭術。', effect:'火焰箭：單體火傷害', slot:'magic', price:800},
  {id:'fire_2',      cat:'元素', name:'業火紋章',    icon:'🔥', rarity:'精良', desc:'進階火屬性紋章。火焰範圍擴大。', effect:'業火陣：範圍火傷害', slot:'magic', price:3500},
  {id:'water_1',     cat:'元素', name:'流水紋章',    icon:'💧', rarity:'普通', desc:'基礎水屬性紋章。裝備後可使用治癒術。', effect:'治癒術：回復單體HP', slot:'magic', price:800},
  {id:'water_2',     cat:'元素', name:'激流紋章',    icon:'💧', rarity:'精良', desc:'進階水屬性紋章。治癒範圍擴大。', effect:'激流癒：回復全體HP', slot:'magic', price:3500},
  {id:'wind_1',      cat:'元素', name:'微風紋章',    icon:'🍃', rarity:'普通', desc:'基礎風屬性紋章。裝備後可使用風刃術。', effect:'風刃：單體風傷害+減速', slot:'magic', price:800},
  {id:'wind_2',      cat:'元素', name:'暴風紋章',    icon:'🍃', rarity:'精良', desc:'進階風屬性紋章。催眠之風。', effect:'暴風眠：範圍催眠', slot:'magic', price:3500},
  {id:'thunder_1',   cat:'元素', name:'電擊紋章',    icon:'⚡', rarity:'普通', desc:'基礎雷屬性紋章。裝備後可使用雷擊術。', effect:'雷擊：單體雷傷害+麻痺', slot:'magic', price:800},
  {id:'thunder_2',   cat:'元素', name:'雷雲紋章',    icon:'⚡', rarity:'精良', desc:'進階雷屬性紋章。連鎖落雷。', effect:'連鎖雷：多體雷傷害', slot:'magic', price:3500},
  {id:'earth_1',     cat:'元素', name:'岩石紋章',    icon:'🪨', rarity:'普通', desc:'基礎地屬性紋章。裝備後可使用防壁術。', effect:'岩壁：單體防禦+30%', slot:'magic', price:800},
  {id:'earth_2',     cat:'元素', name:'地脈紋章',    icon:'🪨', rarity:'精良', desc:'進階地屬性紋章。大地之護。', effect:'地脈護：全體防禦+20%', slot:'magic', price:3500},
  // 戰技系
  {id:'fury',        cat:'戰技', name:'狂戰士紋章',  icon:'💢', rarity:'精良', desc:'裝備者進入狂暴狀態。攻擊大幅提升但無法防禦。', effect:'攻擊+50%・防禦-30%・無法逃跑', slot:'combat', price:2500},
  {id:'falcon',      cat:'戰技', name:'隼擊紋章',    icon:'🦅', rarity:'精良', desc:'裝備者攻擊速度大幅提升。', effect:'先制攻擊・連擊機率+30%', slot:'combat', price:2500},
  {id:'counter',     cat:'戰技', name:'反擊紋章',    icon:'↩️', rarity:'普通', desc:'受到物理攻擊時有機率自動反擊。', effect:'被攻擊時40%機率反擊', slot:'combat', price:1500},
  {id:'critical',    cat:'戰技', name:'會心紋章',    icon:'💥', rarity:'普通', desc:'暴擊率大幅提升。', effect:'暴擊率+25%', slot:'combat', price:1500},
  {id:'double',      cat:'戰技', name:'雙擊紋章',    icon:'⚔️', rarity:'稀有', desc:'每次攻擊額外追加一次攻擊。', effect:'每次攻擊二連擊', slot:'combat', price:5000},
  // 守護系
  {id:'shield',      cat:'守護', name:'守護紋章',    icon:'🛡️', rarity:'普通', desc:'基礎防禦紋章。減少受到的傷害。', effect:'受傷-15%', slot:'defense', price:1000},
  {id:'resist',      cat:'守護', name:'抗性紋章',    icon:'🔰', rarity:'普通', desc:'提升對異常狀態的抵抗力。', effect:'異常抵抗+50%', slot:'defense', price:1200},
  {id:'barrier',     cat:'守護', name:'結界紋章',    icon:'🔮', rarity:'精良', desc:'魔法防禦大幅提升。', effect:'魔法傷害-30%', slot:'defense', price:3000},
  {id:'regenerate',  cat:'守護', name:'再生紋章',    icon:'💗', rarity:'精良', desc:'每回合自動回復少量HP。', effect:'每回合回復5%HP', slot:'defense', price:3000},
  // 強化系
  {id:'power',       cat:'強化', name:'力量紋章',    icon:'💪', rarity:'普通', desc:'武力提升。', effect:'武力+10', slot:'boost', price:1500},
  {id:'intel_c',     cat:'強化', name:'聰慧紋章',    icon:'🧠', rarity:'普通', desc:'知力提升。', effect:'知力+10', slot:'boost', price:1500},
  {id:'command',     cat:'強化', name:'指揮紋章',    icon:'🎖️', rarity:'普通', desc:'統率提升。', effect:'統率+10', slot:'boost', price:1500},
  {id:'charm',       cat:'強化', name:'魅惑紋章',    icon:'✨', rarity:'普通', desc:'魅力提升。', effect:'魅力+10', slot:'boost', price:1500},
  {id:'fortune',     cat:'強化', name:'幸運紋章',    icon:'🍀', rarity:'普通', desc:'幸運提升。', effect:'幸運+10', slot:'boost', price:1500},
  // 特殊系
  {id:'exp_boost',   cat:'特殊', name:'成長紋章',    icon:'📈', rarity:'稀有', desc:'經驗值獲取倍增。', effect:'經驗值+100%', slot:'special', price:8000},
  {id:'gold_boost',  cat:'特殊', name:'聚財紋章',    icon:'💰', rarity:'稀有', desc:'金幣獲取倍增。', effect:'金幣獲取+100%', slot:'special', price:8000},
  {id:'escape',      cat:'特殊', name:'脫兔紋章',    icon:'🐇', rarity:'普通', desc:'逃跑必定成功。', effect:'逃跑成功率100%', slot:'special', price:2000},
  {id:'stealth',     cat:'特殊', name:'隱匿紋章',    icon:'👤', rarity:'精良', desc:'降低敵人察覺機率。', effect:'遇敵率-50%・先制率+30%', slot:'special', price:4000},
  {id:'holy',        cat:'特殊', name:'聖光紋章',    icon:'✝️', rarity:'稀有', desc:'淨化一切不潔。對不死系敵人特效。', effect:'對不死系傷害+200%・驅散詛咒', slot:'special', price:6000},
  {id:'dark',        cat:'特殊', name:'暗影紋章',    icon:'🖤', rarity:'稀有', desc:'黑暗之力。提升暗屬性攻擊。', effect:'暗屬性攻擊・吸收HP', slot:'special', price:6000},
];

const CREST_RARITY_COLOR={普通:'#888',精良:'#6ab4c8',稀有:'var(--gold)',傳說:'rgba(200,120,220,.9)',真紋章:'#e0c0ff'};
const CREST_CAT_ICON={始源:'🌌',元素:'🔮',天體:'✦',生滅:'♾️',支配:'👑',奧義:'📖',命運:'🌟',戰技:'⚔️',守護:'🛡️',強化:'💪',特殊:'🔰'};

// G.crests = { discovered:{id:true}, equipped:{charId:crestId}, inventory:[crestId,...], trueCrestStatus:{id:{found,holder,awakened}} }
function initCrests(){
  if(!G.crests) G.crests={discovered:{},equipped:{},inventory:[],trueCrestStatus:{}};
  if(!G.crests.discovered) G.crests.discovered={};
  if(!G.crests.equipped) G.crests.equipped={};
  if(!G.crests.inventory) G.crests.inventory=[];
  if(!G.crests.trueCrestStatus) G.crests.trueCrestStatus={};
}

function applyCrestUpdate(data){
  if(!data)return;
  initCrests();
  const items=Array.isArray(data)?data:[data];
  items.forEach(cr=>{
    if(!cr||!cr.id)return;
    // True Crest discovery
    const tc=TRUE_CRESTS.find(t=>t.id===cr.id);
    if(tc){
      const st=G.crests.trueCrestStatus[cr.id]||{};
      if(cr.found) st.found=true;
      if(cr.holder) st.holder=cr.holder;
      if(cr.awakened) st.awakened=true;
      if(cr.location) tc.location=cr.location;
      G.crests.trueCrestStatus[cr.id]=st;
      G.crests.discovered[cr.id]=true;
      const col=tc.color||'#e0c0ff';
      appendEntryToDOM({type:'sys',v:`✦ 真紋章發現：【${tc.icon} ${tc.name}】`});
      if(tc.desc) appendEntryToDOM({type:'sys',v:tc.desc});
      if(cr.holder) appendEntryToDOM({type:'sys',v:`持有者：${cr.holder}`});
      showToast(`真紋章：${tc.name}`,'ok');
      // Auto-add intel
      addIntel({id:'crest_'+cr.id, title:tc.name, content:tc.desc+(tc.curse?'\n詛咒：'+tc.curse:''),
        src:cr.src||'紋章感知', rel:5, cat:'紋章'});
    }else{
      // Regular crest acquisition
      const rc=REGULAR_CRESTS.find(r=>r.id===cr.id);
      if(rc){
        G.crests.discovered[cr.id]=true;
        const qty=cr.qty||1;
        for(let i=0;i<qty;i++) G.crests.inventory.push(cr.id);
        appendEntryToDOM({type:'sys',v:`◈ 獲得紋章：【${rc.icon} ${rc.name}】${qty>1?'×'+qty:''}`});
        showToast(`紋章：${rc.name}`,'ok');
      }
    }
  });
  renderChanged('crest','inv');
  saveGame();
}

function equipCrest(charId,crestIdx){
  initCrests();
  if(crestIdx<0||crestIdx>=G.crests.inventory.length)return;
  const crestId=G.crests.inventory[crestIdx];
  // Unequip current if any
  const curEquipped=G.crests.equipped[charId];
  if(curEquipped){
    G.crests.inventory.push(curEquipped);
  }
  G.crests.equipped[charId]=crestId;
  G.crests.inventory.splice(crestIdx,1);
  const rc=REGULAR_CRESTS.find(r=>r.id===crestId);
  const name=rc?rc.name:crestId;
  const ch=getCharData(charId);
  showToast(`${ch?.name||charId} 裝備了 ${name}`,'ok');
  markDirty('crest');renderBoth('crest');
  saveGame();
}

function unequipCrest(charId){
  initCrests();
  const crestId=G.crests.equipped[charId];
  if(!crestId)return;
  G.crests.inventory.push(crestId);
  delete G.crests.equipped[charId];
  showToast('紋章已卸下','ok');
  markDirty('crest');renderBoth('crest');
  saveGame();
}

let _crestFilter='true';
function setCrestFilter(k){_crestFilter=k;markDirty('crest');renderBoth('crest');}

function buildCrest(){
  initCrests();
  const f=_crestFilter;
  const filterRow=`<div class="sfrow" style="flex-wrap:wrap;">${[['true','真紋章'],['regular','一般紋章'],['equipped','裝備中']].map(([k,l])=>`<button class="sfb ${f===k?'ac':''}" onclick="setCrestFilter('${k}')">${l}</button>`).join('')}</div>`;

  let h=filterRow;

  if(f==='true'){
    // 真紋章總覽
    const found=Object.keys(G.crests.trueCrestStatus).filter(id=>G.crests.trueCrestStatus[id].found).length;
    h+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:.4rem .2rem .2rem;">
      <span style="font-size:.62rem;color:var(--goldd);">✦ 27 真紋章</span>
      <span style="font-size:.52rem;color:var(--sild);">發現 ${found} / 27</span>
    </div>`;
    // Group by category
    const cats=['始源','元素','天體','生滅','支配','奧義','命運'];
    cats.forEach(cat=>{
      const crests=TRUE_CRESTS.filter(c=>c.cat===cat);
      const catIcon=CREST_CAT_ICON[cat]||'◈';
      h+=`<div style="margin-bottom:.5rem;">
        <div style="font-size:.58rem;color:var(--goldd);letter-spacing:.06em;margin:.4rem 0 .25rem;padding-left:.1rem;">${catIcon} ${cat}紋章群</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.3rem;">`;
      crests.forEach(tc=>{
        const st=G.crests.trueCrestStatus[tc.id]||{};
        const isFound=st.found;
        const isAwakened=st.awakened;
        const borderCol=isFound?(isAwakened?tc.color:'rgba(200,180,100,.4)'):'rgba(80,80,80,.3)';
        const bgCol=isFound?'rgba(255,255,255,.03)':'rgba(30,30,30,.3)';
        h+=`<div onclick="${isFound?`openTrueCrest('${tc.id}')`:''}" style="background:${bgCol};border:1px solid ${borderCol};border-radius:4px;padding:.4rem;cursor:${isFound?'pointer':'default'};transition:border-color .2s;">
          <div style="display:flex;align-items:center;gap:.3rem;margin-bottom:.15rem;">
            <span style="font-size:.9rem;opacity:${isFound?1:.3}">${tc.icon}</span>
            <span style="font-size:.62rem;color:${isFound?tc.color:'var(--sild)'};font-weight:${isFound?600:400}">${isFound?tc.name:'？？？'}</span>
          </div>
          ${isFound?`<div style="font-size:.5rem;color:var(--sild);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${tc.desc.substring(0,40)}⋯</div>
          ${st.holder?`<div style="font-size:.48rem;color:${tc.color};margin-top:.1rem;">持有者：${st.holder}</div>`:''}
          ${isAwakened?`<div style="font-size:.48rem;color:#6ab46a;margin-top:.1rem;">✦ 已覺醒</div>`:''}`
          :`<div style="font-size:.5rem;color:rgba(80,80,80,.5);line-height:1.4;">尚未發現</div>`}
        </div>`;
      });
      h+=`</div></div>`;
    });
    // Lore section
    h+=`<div style="margin-top:.6rem;padding:.5rem;background:rgba(255,255,255,.02);border:1px solid var(--brd);border-radius:4px;">
      <div style="font-size:.58rem;color:var(--goldd);margin-bottom:.3rem;">📜 紋章創世記</div>
      <div style="font-size:.56rem;color:var(--sild);line-height:1.7;">
        太初，唯有虛空。虛空孤寂而落淚，淚水化為兩兄弟——劍與盾。<br>
        劍與盾激戰七晝夜。劍劈碎了盾，碎片化為大地；盾折斷了劍，碎片化為蒼穹。<br>
        戰鬥的火花化為星辰，兩者身上的 27 枚寶石化為 27 枚真紋章。<br>
        世界開始運轉。真紋章散落各地，選擇持有者，塑造歷史的走向。<br>
        帝國曆 1077 年，帝國崩裂之夜，沉睡的真紋章再度覺醒——與108顆命運之星的降世同步。這不是巧合。
      </div>
    </div>`;
  }
  else if(f==='regular'){
    // 持有的一般紋章
    const inv=G.crests.inventory;
    const countMap={};
    inv.forEach(id=>{countMap[id]=(countMap[id]||0)+1;});
    const uniqueIds=[...new Set(inv)];
    h+=`<div style="padding:.4rem .2rem .2rem;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:.62rem;color:var(--goldd);">◈ 持有紋章</span>
      <span style="font-size:.52rem;color:var(--sild);">${inv.length} 枚</span>
    </div>`;
    if(!uniqueIds.length){
      h+=`<div style="font-size:.62rem;color:var(--sild);padding:.5rem .2rem;">尚無一般紋章。可透過商店購買、寶箱發現或擊敗敵人獲得。</div>`;
    }else{
      const catOrder=['元素','戰技','守護','強化','特殊'];
      catOrder.forEach(cat=>{
        const catCrests=uniqueIds.map(id=>REGULAR_CRESTS.find(r=>r.id===id)).filter(r=>r&&r.cat===cat);
        if(!catCrests.length)return;
        h+=`<div style="font-size:.55rem;color:var(--goldd);margin:.4rem 0 .2rem;">${CREST_CAT_ICON[cat]||'◈'} ${cat}系</div>`;
        catCrests.forEach(rc=>{
          const qty=countMap[rc.id]||0;
          const col=CREST_RARITY_COLOR[rc.rarity]||'#888';
          h+=`<div style="display:flex;gap:.5rem;align-items:center;padding:.35rem .1rem;border-bottom:1px solid rgba(255,255,255,.04);">
            <span style="font-size:.9rem;flex-shrink:0">${rc.icon}</span>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:.3rem;">
                <span style="font-size:.66rem;color:${col};font-weight:600">${rc.name}</span>
                <span style="font-size:.46rem;color:${col};border:1px solid ${col};border-radius:2px;padding:.01rem .2rem;opacity:.7">${rc.rarity}</span>
                <span style="font-size:.52rem;color:var(--sild);">×${qty}</span>
              </div>
              <div style="font-size:.54rem;color:var(--sild);margin-top:.06rem">${rc.effect}</div>
            </div>
          </div>`;
        });
      });
    }
  }
  else if(f==='equipped'){
    // 裝備中的紋章
    h+=`<div style="padding:.4rem .2rem .2rem;font-size:.62rem;color:var(--goldd);">⚙ 裝備中紋章</div>`;
    const party=allParty();
    let anyEquipped=false;
    party.forEach(ch=>{
      const crestId=G.crests.equipped[ch.id];
      const rc=crestId?REGULAR_CRESTS.find(r=>r.id===crestId):null;
      h+=`<div style="display:flex;align-items:center;gap:.5rem;padding:.35rem .2rem;border-bottom:1px solid rgba(255,255,255,.04);">
        <span style="font-size:.8rem">${ch.emoji||'👤'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.62rem;color:var(--sil)">${ch.name}</div>
          ${rc?`<div style="display:flex;align-items:center;gap:.25rem;margin-top:.08rem;">
            <span style="font-size:.7rem">${rc.icon}</span>
            <span style="font-size:.58rem;color:${CREST_RARITY_COLOR[rc.rarity]||'#888'}">${rc.name}</span>
            <span style="font-size:.5rem;color:var(--sild);">${rc.effect}</span>
          </div>
          <button onclick="unequipCrest('${ch.id}')" style="margin-top:.15rem;font-size:.52rem;padding:.1rem .3rem;background:transparent;border:1px solid rgba(204,68,68,.35);border-radius:2px;color:rgba(204,68,68,.7);cursor:pointer;">卸下</button>`
          :`<div style="font-size:.56rem;color:var(--sild);margin-top:.06rem">— 未裝備紋章 —</div>
          ${G.crests.inventory.length?`<select onchange="if(this.value!=='')equipCrest('${ch.id}',parseInt(this.value))" style="margin-top:.15rem;font-size:.52rem;padding:.12rem .25rem;background:var(--bg3);border:1px solid var(--brd);border-radius:2px;color:var(--sil);cursor:pointer;">
            <option value="">選擇紋章⋯</option>
            ${G.crests.inventory.map((cid,idx)=>{const r=REGULAR_CRESTS.find(x=>x.id===cid);return r?`<option value="${idx}">${r.icon} ${r.name}（${r.effect}）</option>`:''}).join('')}
          </select>`:''}`}
        </div>
      </div>`;
      if(rc) anyEquipped=true;
    });
    if(!anyEquipped&&!G.crests.inventory.length){
      h+=`<div style="font-size:.58rem;color:var(--sild);padding:.4rem .2rem;">尚無紋章可裝備。</div>`;
    }
  }

  return h;
}

function openTrueCrest(id){
  const tc=TRUE_CRESTS.find(t=>t.id===id);if(!tc)return;
  const st=G.crests.trueCrestStatus[id]||{};
  document.getElementById('modal-inner').innerHTML=`
    <div style="text-align:center;padding:.5rem 0;">
      <div style="font-size:2rem;">${tc.icon}</div>
      <div style="font-size:.9rem;color:${tc.color};font-weight:600;margin:.3rem 0;">${tc.name}</div>
      <div style="font-size:.52rem;color:var(--sild);letter-spacing:.08em;">${tc.cat}紋章群 ・ 真紋章</div>
    </div>
    <div style="font-size:.64rem;color:#7a8fa0;line-height:1.75;padding:.3rem 0;border-top:1px solid var(--brd);margin-top:.3rem;">
      ${tc.desc}
    </div>
    <div style="margin-top:.4rem;padding:.3rem;background:rgba(200,60,60,.08);border:1px solid rgba(200,60,60,.2);border-radius:3px;">
      <div style="font-size:.56rem;color:rgba(200,80,80,.8);font-weight:600;">⚠ 詛咒</div>
      <div style="font-size:.58rem;color:rgba(200,100,100,.7);line-height:1.6;margin-top:.15rem;">${tc.curse}</div>
    </div>
    <div style="margin-top:.4rem;padding:.3rem;background:rgba(255,255,255,.03);border:1px solid var(--brd);border-radius:3px;">
      <div style="font-size:.56rem;color:var(--goldd);font-weight:600;">✦ 效果</div>
      <div style="font-size:.58rem;color:#6ab46a;line-height:1.6;margin-top:.15rem;">${tc.effect}</div>
    </div>
    ${tc.lore?`<div style="margin-top:.4rem;font-size:.58rem;color:rgba(150,140,100,.6);line-height:1.6;font-style:italic;padding:.3rem;border-left:2px solid rgba(150,140,100,.3);">
      ${tc.lore}
    </div>`:''}
    <div style="margin-top:.4rem;display:flex;flex-wrap:wrap;gap:.4rem;font-size:.54rem;">
      ${st.holder?`<span style="color:${tc.color};">持有者：${st.holder}</span>`:`<span style="color:var(--sild);">持有者：不明</span>`}
      <span style="color:var(--sild);">所在：${tc.location||'不明'}</span>
      ${st.awakened?`<span style="color:#6ab46a;">✦ 已覺醒</span>`:`<span style="color:var(--sild);">休眠中</span>`}
    </div>
  `;
  document.getElementById('modal-wrap').classList.add('open');
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
      <p style="margin-bottom:.4rem;">帝國崩裂之夜，天象異變，北斗星下 108 顆流星劃過艾爾薩上空。占星師記錄下這一刻：「北斗指引，命運之星降世，聚者終結輪迴，散者萬劫不復。」這 108 顆星分為<span style="color:var(--gold);">天罡三十六星</span>（將領、英雄、智者）與<span style="color:var(--gold);">地煞七十二星</span>（工匠、商人、密探、學者）。</p>
      <div style="font-size:.58rem;color:rgba(180,140,220,.8);letter-spacing:.08em;margin:.5rem 0 .3rem;">⚜ 北斗星・先行者</div>
      <p style="margin-bottom:.4rem;">最初感知到星辰降世的人。他如同北斗般指引方向，召集了最早的同伴，踏上聚星之路——卻在途中倒下。他的名字已被遺忘，但他留下的線索與未竟之志，成為後繼者的遺產。北斗雖墜，其光仍照亮前路。</p>
      <div style="font-size:.58rem;color:var(--goldd);letter-spacing:.08em;margin:.5rem 0 .3rem;">🔮 27 真紋章</div>
      <p style="margin-bottom:.4rem;">世界創生時，始源之劍與盾的碰撞產生 27 枚真紋章，蘊含世界根源法則。真紋章賦予持有者強大力量，但伴隨詛咒。帝國崩裂之夜，沉睡的真紋章開始覺醒——與 108 星辰的降世同步。紋章與星辰的關係，是解開這個亂世之謎的關鍵。</p>
      <div style="font-size:.58rem;color:var(--goldd);letter-spacing:.08em;margin:.5rem 0 .3rem;">✦ 逼上梁山</div>
      <p style="margin-bottom:.4rem;">艾爾法並非英雄。她只是一個來歷不明的旅人——沒有故鄉，沒有過去，帶著一隻五枚銅幣的貓漫無目的地流浪。橘子也不只是一隻貓——她是北斗星下聚義的起點，如同晁蓋般的存在。命運選中了她們——或者說，命運沒有給她們別的選擇。108 顆星辰，每一顆背後都有一個「被逼上絕路」的故事。</p>
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
    {title:'鐵霧城',icon:'🏭',body:'霧山聯邦的首府，故事起點。終年被工業霧氣籠罩，鐵礦豐富。城衛制度嚴格，底層民眾在代理城主恩佐・卡羅的苛政下掙扎。旅人艾爾法與橘子初次來到此城，便捲入了霧刃幫的風波。',tags:['霧山聯邦','起點']},
    {title:'銀月城',icon:'🌙',body:'中央王國首都，大陸最大的商貿中心。情報流通之地，英雄公會總部所在。新月型的城牆在夜晚映照月光，因此得名。政治暗流湧動，各方勢力在此角力。',tags:['中央王國','商貿']},
    {title:'東港城',icon:'⚓',body:'東海王國最大港口。海貿繁盛，但也是走私和間諜活動的溫床。商人公會在此勢力最強。碼頭區魚龍混雜，情報與危險並存。',tags:['東海王國','港口']},
    {title:'鏽城（前帝都）',icon:'🏚️',body:'聖赫倫帝國的舊都。帝國崩裂後逐漸荒廢，現被帝國殘軍佔據。城中充滿帝國全盛時期的遺跡與機關，據說地下宮殿中藏有帝國最後的秘密。',tags:['中央王國','帝國遺跡']},
    {title:'翠林城',icon:'🌲',body:'翠林域的中心城市，被千年古樹環繞。精靈與森民聚居，外人需要通行證才能進入。魔法力量在此地最為濃厚，學者與術士嚮往之地。',tags:['翠林域','魔法']},
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
    {title:'108 命運之星',icon:'✦',body:'帝國崩裂之夜，北斗星下降世的 108 顆星辰。分為天罡三十六星（將領、英雄、智者）和地煞七十二星（工匠、商人、密探、學者等）。傳說：於北斗星下聚齊 108 星者可終結亂世輪迴。注意：橘子（命運之錨）與北斗星（先行者）不在 108 星之列。'},
    {title:'天罡三十六星',icon:'⭐',body:'108 星中地位較高的 36 顆。對應的人物多為武將、謀士、領袖級人才。每位天罡星降世時攜帶一件命運寶器。天魁星為首——在本作中，天魁星是艾爾法。'},
    {title:'地煞七十二星',icon:'💫',body:'108 星中數量較多的 72 顆。對應的人物多為各行各業的專才：鐵匠、廚師、醫師、密探、商人、學者、園丁、航海家等。他們不一定會戰鬥，但每一位都不可或缺。'},
    {title:'北斗星（先行者）',icon:'⚜️',body:'不屬於 108 星，但最早感知到星辰降世的人。他如同北斗般指引方向，召集了最初的同伴，踏上聚星之路——卻在途中倒下。北斗雖墜，其光仍照亮前路。他的真實身份和倒下的原因是遊戲主線謎團之一。'},
    {title:'晁蓋之位',icon:'⚓',body:'源自《水滸傳》的概念。晁蓋是聚義的起點，召集好漢上梁山的第一人——卻在大業未竟時倒下。在本作中，橘子佔據晁蓋之位：她不是 108 星之一，卻是引導星辰聚合的命運之錨。北斗星（先行者）同樣不在 108 星之列，兩者共同構成「星外引路人」的角色。'},
    {title:'命運寶器',icon:'🗡️',body:'每位星辰之人降世時攜帶的特殊道具。寶器與持有者的命運綁定，品質從「普通」到「神器」不等。集齊所有寶器據說可觸發隱藏事件。艾爾法的寶器是「天命折刃」，橘子本身就是寶器「命運之錨」。'},
    {title:'星辰感知',icon:'🐈',body:'橘子（命運之錨）的獨有能力。橘子不屬於 108 星，但她能感知所有星辰之人的氣息。當附近有星辰之人時，橘子會產生反應——耳朵轉動、凝視某個方向、或發出特殊的叫聲。隨著橘子秘密線的推進，感知範圍會逐步擴大。'},
    {title:'招募模式',icon:'🤝',body:'108 星辰之人透過六種方式加入：\n① 逼上梁山型（被迫害而投靠）\n② 義氣相投型（被正義行為感召）\n③ 計謀招攬型（需要策略說服）\n④ 比武收服型（必須擊敗對方）\n⑤ 連環引薦型（A 介紹 B）\n⑥ 時機限定型（錯過就失去）'},
  ],
  '角色':[
    {title:'艾爾法😒',icon:'😒',body:'本作主角。天魁星。來歷不明的旅人，沒有職業、沒有過去。銀色長髮，面無表情，沉默寡言。帶著一隻花五枚銅幣買的布偶貓在大陸上漫無目的地流浪。不是英雄——只是一個被命運選中的普通人。體內沉眠的星力是命運強加的枷鎖。'},
    {title:'橘子🐈😒',icon:'🐈',body:'晁蓋之位・命運之錨。不屬於 108 星，卻是引導星辰聚合的關鍵存在。五枚銅幣買來的布偶貓，雌性。藍眼睛，雙色毛，面癱。只會喵叫（由系統翻譯）。知力 99，看穿一切虛偽。對翻肚持強烈反對立場。如同《水滸傳》中的晁蓋——她是開路人，是北斗星下 108 星聚義的起點。'},
    {title:'北斗星・先行者',icon:'⚜️',body:'不屬於 108 星。最早感知到星辰降世的神秘存在。他如同北斗般指引方向，召集了最初的同伴踏上聚星之路——卻在途中倒下。他的名字已被遺忘，留下的線索與未竟之志成為後繼者的遺產。北斗雖墜，其光仍照亮前路。'},
    {title:'暗王（???）',icon:'👁️',body:'艾爾薩大陸幕後的神秘推手。不是 108 星之一，但其影響力凌駕於星辰之上。疑似在暗中操縱十二王國的政局。與星辰降世有某種關聯。真實身份完全不明。'},
    {title:'恩佐・卡羅',icon:'⚙️',body:'鐵霧城代理城主。以鐵腕治理霧山聯邦西部，控制鐵礦開採與貿易。對底層人民苛刻，對反抗者毫不留情。張貼霧刃幫懸賞令的人。'},
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
    {title:'橘子秘密線',icon:'⚓',body:'橘子的真實身份透過五個階段逐步揭露。觸發條件包括：與橘子互動（聊天、餵魚）、好感度達標、蒐集北斗星線索、特定劇情事件。每階段解鎖新的情報和能力。第五階段=命運之錨覺醒。'},
    {title:'紋章系統',icon:'🔮',body:'世界創生時誕生的27枚真紋章蘊含世界根源法則，持有者獲得強大力量但承受詛咒。一般紋章是真紋章的碎片衍生，可裝備於角色的紋章槽位。\n紋章分類：元素系（火水風雷地魔法）、戰技系（物理強化）、守護系（防禦能力）、強化系（素質提升）、特殊系（特殊效果）。'},
    {title:'密技',icon:'💡',body:'在自由行動欄輸入特殊指令：\n・@錢：獲得大量金幣（測試用）\n・@骰子：開啟骰子面板'},
    {title:'戰鬥系統',icon:'⚔️',body:'遭遇敵人時進入回合制戰鬥。行動選項：\n・攻擊：選擇目標，d20+武力修正判定。暴擊(20)傷害翻倍，失敗(1)落空。\n・防禦：本回合受到傷害減半。\n・道具：使用背包中的消耗品（藥劑、食物等）。\n・逃跑：幸運判定，BOSS戰無法逃跑。\n回合順序由幸運決定。勝利獲得金幣、經驗值和掉落物品。'},
    {title:'經驗與升級',icon:'📈',body:'戰鬥勝利和任務完成可獲得經驗值（EXP）。\n・升級所需EXP = 等級×50+50\n・升級獎勵：素質點數+3、HP上限+5\n・素質點數可自由分配到五項基礎素質\n・橘子不參與升級系統'},
    {title:'狀態效果',icon:'💫',body:'戰鬥中可能附加的狀態：\n・中毒☠️：每回合損失5HP（3回合）\n・灼燒🔥：每回合損失8HP（2回合）\n・冰凍❄️：無法行動（1回合）\n・暈眩💫：無法行動（1回合）\n・致盲🌑：命中率降低（2回合）\n・再生💚：每回合回復10HP（3回合）\n・護盾🛡️：防禦力提升（2回合）\n・狂暴💢：攻擊提升但防禦降低（3回合）'},
    {title:'鍛造與煉金',icon:'⚒️',body:'在活動頁面可進行製作：\n・料理🍳：使用食材製作料理，回復HP或提供增益\n・鍛造⚒️：使用礦石和素材打造武器防具\n・煉金⚗️：調配藥劑、毒藥、特殊道具\n需要對應材料，材料可從商店購買、怪物掉落或探索獲得。'},
    {title:'成就系統',icon:'🏆',body:'完成特定條件可解鎖成就，記錄冒險歷程。共16個成就涵蓋：初次戰鬥、任務完成、星辰招募、等級提升、財富累積、BOSS擊殺、城市探索、紋章發現等。可在活動頁面查看。'},
    {title:'隨機事件',icon:'🎲',body:'旅行和休息時可能觸發隨機事件：\n・戰鬥遭遇：路途中被怪物或盜賊攻擊\n・寶箱發現：發現被遺忘的物資\n・NPC遭遇：遇到旅人、商人、占卜師等\n・天氣變化：暴風雨、濃霧、暴風雪\n・橘子感知：星辰氣息的線索\n事件類型和機率與所在地區有關。'},
  ],
  '紋章':[
    {title:'紋章創世記',icon:'🌌',body:'太初，唯有虛空。虛空孤寂而落淚，淚水化為兩兄弟——劍與盾。劍與盾激戰七晝夜。劍劈碎了盾，碎片化為大地；盾折斷了劍，碎片化為蒼穹。戰鬥的火花化為星辰，兩者身上的27枚寶石化為27枚真紋章。世界開始運轉。'},
    {title:'27真紋章',icon:'✦',body:'世界根源法則的結晶。分為七群：\n・始源紋章群（3）：創世・劍・盾\n・元素紋章群（5）：炎獄・冥淵・天嵐・雷霆・磐石\n・天體紋章群（4）：曜日・月輪・星命・蝕\n・生滅紋章群（4）：生命・魂噬・輪迴・虛無\n・支配紋章群（4）：霸王・混沌・秩序・審判\n・奧義紋章群（4）：夢幻・時律・門扉・智慧\n・命運紋章群（3）：變革・北斗・黎明'},
    {title:'真紋章與詛咒',icon:'⚠️',body:'每枚真紋章都伴隨詛咒。力量越強，代價越大。劍真紋章讓持有者渴望戰鬥無法停止；生命真紋章以持有者的壽命換取治癒力量；魂噬真紋章製造周圍人的死亡來餵養自己。真紋章選擇持有者，而非持有者選擇真紋章。'},
    {title:'一般紋章',icon:'◈',body:'真紋章力量的碎片化衍生。威力遠不及真紋章，但沒有詛咒。可透過商店購買、寶箱發現或敵人掉落獲得。每個角色有一個紋章槽位，可裝備一枚一般紋章。\n分類：元素系（魔法攻擊/治癒）、戰技系（物理強化）、守護系（防禦能力）、強化系（素質提升）、特殊系（特殊效果）。'},
    {title:'真紋章與帝國崩裂',icon:'👑',body:'聖赫倫帝國的建立與六百年統治，與霸王真紋章密切相關。初代皇帝是霸王紋章持有者，以紋章之力統一大陸。末代皇帝暴斃之夜，霸王紋章消失——同一夜，108命運之星降世，多枚沉睡的真紋章開始覺醒。這不是巧合。'},
    {title:'真紋章與108星',icon:'🌟',body:'星命真紋章掌控108星的降世與聚合法則。北斗真紋章與北斗星・先行者直接相關——他的倒下可能與紋章碎裂有關。黎明真紋章在108星全員齊聚時覺醒。真紋章與星辰的關係是遊戲最核心的主線之一。'},
    {title:'紋章與西方魔法',icon:'🔮',body:'艾爾薩大陸的魔法體系建立在紋章之上。所有魔法本質上都是紋章力量的微弱共鳴。翠林域的精靈透過與大地紋章的親和力使用自然魔法；帝國的術士透過研究紋章碎片開發攻擊魔法。真正的紋章持有者能使用遠超常規的魔法。'},
    {title:'紋章與鍛造',icon:'⚒️',body:'部分真紋章的碎片可作為鍛造素材，製作蘊含紋章之力的特殊裝備。例如：星辰碎片可鍛造星辰戒、龍血草可鍛造龍牙劍。在據點的藏星閣研究紋章碎片可加速北斗星線索的收集。'},
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
  {id:'library', name:'藏星閣', icon:'📚', stars:18, desc:'學者星入駐後開放。解讀古文、研究星辰秘密。', effect:'情報解析・北斗星線索加速'},
  {id:'clinic',  name:'杏林堂', icon:'⚕️', stars:20, desc:'醫師星入駐後開放。治療傷病、調配藥劑。', effect:'休息HP回復+50%・解毒・復活'},
  {id:'spy',     name:'暗鴉樓', icon:'🕵️', stars:22, desc:'密探星入駐後開放。情報網絡、暗中行動。', effect:'自動獲取情報・偵查敵情'},
  {id:'market',  name:'星河商會',icon:'💰', stars:25, desc:'商賈星入駐後開放。專屬商店、貿易路線。', effect:'獨家商品・交易免稅'},
  {id:'arena',   name:'試煉場', icon:'⚔️', stars:28, desc:'武將星入駐後開放。訓練、比武、切磋技藝。', effect:'訓練費用減半・解鎖連攜技'},
  {id:'garden',  name:'星辰園', icon:'🌿', stars:30, desc:'園丁星入駐後開放。種植藥草、採集素材。', effect:'定期產出藥草・稀有素材'},
  {id:'dock',    name:'聚星港', icon:'⛵', stars:35, desc:'航海星入駐後開放。遠洋貿易、海外探索。', effect:'解鎖海外區域・貿易收入'},
  {id:'tower',   name:'命星塔', icon:'🔭', stars:50, desc:'集齊半數星辰後覺醒。觀測全大陸星辰動向。', effect:'全大陸星辰位置可見'},
  {id:'throne',  name:'天命之座',icon:'👑', stars:108,desc:'108星齊聚。終結輪迴的最後一步。', effect:'???'},
];

// 據點設施生產品資料庫
const HQ_PRODUCTION={
  鍛造坊:{n:'強化石',t:'裝備強化素材',rate:4},
  食堂:{n:'便當',t:'全隊HP+20',rate:3},
  煉藥房:{n:'草藥',t:'煉藥素材',rate:3},
  商店:{n:'貿易券',t:'可兌換銀幣',rate:5},
  工坊:{n:'布料',t:'裁縫素材',rate:4},
  獵場:{n:'獸肉',t:'料理素材',rate:3},
};

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
  if(r.items){const inv=getInv();(Array.isArray(r.items)?r.items:[r.items]).forEach(item=>{const ex=inv.items.find(i=>i.n===item.n);if(ex){const m=ex.q.match(/[×x]?\s*(\d+)/);ex.q='×'+((m?parseInt(m[1]):1)+1);}else inv.items.push({...item,q:item.q||'×1'});parts.push(item.n);});}
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
  const cacheable=['stars','inv','quest','intel','wiki','hq','guild','activities','crest','sysinfo']; // party/log change often, skip cache
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
    else if(tab==='activities')h=buildActivities();
    else if(tab==='hq')h=buildHQ();
    else if(tab==='crest')h=buildCrest();
    else if(tab==='sysinfo')h=buildSysInfo();
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
function setFormation(id,pos){
  G.formation[id]=pos;
  saveGame();
  showToast(`${getCharData(id)?.name||id} → ${pos==='front'?'前排':'後排'}`,'ok');
  closeD();setTimeout(()=>openChar(id),100);
}
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
  document.getElementById('modal-inner').innerHTML=pHtml+`<div class="mtop"><div class="mscol"><div class="mtp">${escHtml(c.type)}</div><div class="mnm">第${c.num}星</div><div class="mst">${escHtml(c.star)}</div></div><div class="micol"><div class="mname">${escHtml(c.name)} <span style="font-size:.8rem">${c.emoji}</span></div><div class="msub2">Lv.${getUpgrade(id).lv||1} ・ ${escHtml(c.title)}</div><div class="mstat r">✦ 已加入</div></div></div><div class="mbody"><div class="msec"><div class="msect">人物說明</div><div class="mdesc">${escHtml(c.desc)}</div></div><div class="msec"><div class="msect">素質數值</div><div style="padding-top:.18rem">${smini(c.stats,c.sn,c.id)}</div></div><div class="msec"><div class="msect">天賦技能</div>${c.tl.map(t=>`<div class="tarow"><span class="ta2 ${t.s?'sl':''}">${t.s?'【封印】':''}${escHtml(t.n)}</span><div class="tadesc">${escHtml(t.d)}</div></div>`).join('')}</div><div class="msec"><div class="msect">戰鬥陣型</div><div style="display:flex;gap:.4rem;padding:.2rem 0;">${id!=='orange'?`<button onclick="setFormation('${id}','front')" style="flex:1;padding:.3rem;font-size:.6rem;background:${(G.formation[id]||'front')==='front'?'rgba(204,68,68,.15)':'transparent'};border:1px solid ${(G.formation[id]||'front')==='front'?'rgba(204,68,68,.5)':'var(--brd)'};border-radius:3px;color:${(G.formation[id]||'front')==='front'?'#cc6666':'var(--sild)'};cursor:pointer;font-family:'Noto Serif TC',serif;">⚔ 前排（攻擊+・受傷+）</button><button onclick="setFormation('${id}','back')" style="flex:1;padding:.3rem;font-size:.6rem;background:${G.formation[id]==='back'?'rgba(100,130,200,.15)':'transparent'};border:1px solid ${G.formation[id]==='back'?'rgba(100,130,200,.5)':'var(--brd)'};border-radius:3px;color:${G.formation[id]==='back'?'#88aacc':'var(--sild)'};cursor:pointer;font-family:'Noto Serif TC',serif;">🛡 後排（傷害-・受傷-）</button>`:`<span style="font-size:.6rem;color:var(--sild);">橘子不參與戰鬥陣型</span>`}</div></div><div class="msec"><div class="msect">裝備</div>${Object.entries(c.eq).map(([k,v])=>`<div class="tr2"><span class="ts">${k}</span><span class="ti">${escHtml(v)}</span></div>`).join('')}</div>${id==='orange'?`<div class="msec"><div class="msect" style="color:rgba(180,140,220,.8);">⚓ 秘密・命運之錨</div>${getOrangeSecretHtml()}</div>`:''}</div>`;
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
    body=pHtml+(c?`<div class="msec"><div class="msect">人物說明</div><div class="mdesc">${escHtml(c.desc)}</div></div><div class="msec"><div class="msect">素質數值</div><div style="padding-top:.18rem">${smini(c.stats,c.sn,s.id)}</div></div>`:'')+'<div class="mnote2">→ 點擊「同伴」標籤查看完整資料</div>';
  }
  else if(iC){
    const starPortId=`star_${type}_${num}`;
    const cSrc=getCustomPortrait(starPortId);
    const cPortHtml=cSrc?`<div style="position:relative;width:100%;height:130px;overflow:hidden;border-bottom:1px solid var(--brd);">
      <img src="${cSrc}" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;" onerror="this.style.display='none'"/>
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 50%,var(--bg2) 100%);pointer-events:none;"></div></div>`:'';
    body=cPortHtml+`<div class="msec"><div class="msect">目擊情報</div><div class="mdesc">遭遇：${escHtml(s.cN||'身份不明')}</div><div class="mnote2">${escHtml(s.hint||'尚無情報')}</div></div><div class="msec"><div class="msect">素質數值</div><div class="mdesc" style="color:var(--sild);font-size:.68rem">尚未加入——數值未解鎖</div></div>`;}
  else{body=`<div class="msec"><div class="msect">星辰情報</div><div class="mdesc" style="color:var(--sild)">此星辰尚未降世，或尚未與主星相遇。</div><div class="mnote2">世界的某個角落，這顆星正在等待。</div></div>`;}
  const _dn=iU?'？？':(s.name==='?'||s.name==='???')?escHtml(s.cN||'？？？'):escHtml(s.name);
  document.getElementById('modal-inner').innerHTML=`<div class="mtop"><div class="mscol"><div class="mtp">${escHtml(type)}</div><div class="mnm">第${num}星</div><div class="mst">${escHtml(s.star)}</div></div><div class="micol"><div class="mname">${_dn}</div><div class="msub2">${escHtml(type)}・第${num}星・${escHtml(s.star)}</div><div class="mstat ${sc}">${st}</div></div></div><div class="mbody">${body}</div>`;
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
    <div style="margin-bottom:.5rem;padding:.4rem;background:rgba(201,168,76,.06);border:1px solid var(--brd);border-radius:3px;">
      <div style="font-size:.6rem;color:var(--goldd);margin-bottom:.3rem;">✦ 用描述生成頭像</div>
      <textarea id="port-desc-${id}" style="width:100%;height:100px;background:var(--bg);border:1px solid var(--brd);border-radius:2px;color:var(--sil);font-family:'Noto Serif TC',serif;font-size:.62rem;padding:.3rem;resize:vertical;" placeholder="輸入描述，中文OK！描述越詳細效果越好。\n例：可愛的藍眼布偶貓，蓬鬆的白色和奶油色毛髮，臉上有深色花紋，圓滾滾的大眼睛，粉紅色小鼻子，胖嘟嘟的臉頰，坐在奇幻風格的窗台上，溫暖的燈光">${cfg?.prompt||''}</textarea>
      <div style="display:flex;gap:.3rem;margin-top:.3rem;">
        <button onclick="generateFromDesc('${id}')" id="gen-btn-${id}" class="sbn c" style="flex:1;font-size:.62rem;padding:.3rem;">✦ 生成頭像</button>
      </div>
      <div id="gen-status-${id}" style="font-size:.58rem;color:var(--sild);min-height:.9rem;margin-top:.2rem;"></div>
    </div>
    <div style="display:flex;gap:.4rem;margin-bottom:.35rem;">
      <input id="port-url-${id}" class="s-inp" style="flex:1;font-size:.65rem;" placeholder="或直接貼圖片網址" value="${cur}"/>
      <button onclick="applyCustomPortrait('${id}');closeD();setTimeout(()=>openChar('${id}'),100);" class="sbn p" style="flex-shrink:0;padding:.32rem .55rem;font-size:.63rem;">套用</button>
    </div>
    <button onclick="clearPortraitCache('${id}');renderBoth('party');closeD();setTimeout(()=>openChar('${id}'),100);" style="font-size:.6rem;padding:.15rem .45rem;background:transparent;border:1px solid var(--brd);border-radius:2px;color:var(--sild);cursor:pointer;margin-top:.25rem;">重設為預設</button>`;
  document.querySelector('#detail-modal .mbox.detail-mbox').appendChild(panel);
}
function saveKey(){
  const k=document.getElementById('api-inp').value.trim(),w=document.getElementById('api-warn');
  if(!k){w.textContent='請輸入 API 金鑰';w.classList.add('show');return;}
  if(!k.startsWith('sk-ant-')){w.textContent='格式不正確，應以 sk-ant- 開頭';w.classList.add('show');return;}
  CFG.key=k;document.getElementById('api-modal').classList.remove('open');showToast('✦ API 金鑰已設定','ok');
}
function openHelp(){
  document.getElementById('modal-inner').innerHTML=`
    <div style="padding:.3rem 0;">
      <div style="font-size:.85rem;color:var(--gold);font-weight:700;text-align:center;margin-bottom:.6rem;">❓ 命運之星・遊戲說明</div>

      <div style="font-size:.68rem;color:var(--goldl);margin:.5rem 0 .2rem;">🎮 基本操作</div>
      <div style="font-size:.6rem;color:var(--sild);line-height:1.7;">
        ・選擇下方的行動選項推進故事<br>
        ・在輸入欄直接打字進行自由行動<br>
        ・直接打字 = 艾爾法說的話或做的事<br>
        ・「角色名：內容」格式可指定角色對話<br>
        ・用「」包住的文字視為對話
      </div>

      <div style="font-size:.68rem;color:var(--goldl);margin:.5rem 0 .2rem;">⚔️ 戰鬥系統</div>
      <div style="font-size:.6rem;color:var(--sild);line-height:1.7;">
        ・遭遇敵人時自動進入回合制戰鬥<br>
        ・點擊敵人圖示進行攻擊<br>
        ・可使用防禦（傷害減半）、道具（藥劑等）、逃跑<br>
        ・暴擊(骰20)傷害翻倍，大失敗(骰1)落空<br>
        ・BOSS戰無法逃跑<br>
        ・勝利獲得金幣、經驗值、掉落物品
      </div>

      <div style="font-size:.68rem;color:var(--goldl);margin:.5rem 0 .2rem;">📈 成長系統</div>
      <div style="font-size:.6rem;color:var(--sild);line-height:1.7;">
        ・戰鬥勝利和任務完成獲得EXP<br>
        ・升級獲得3點素質點數（自由分配）和HP+5<br>
        ・在同伴頁面點角色可分配素質點數<br>
        ・裝備武器/防具/飾品提升素質<br>
        ・寶器（命運寶器）也提供素質加成
      </div>

      <div style="font-size:.68rem;color:var(--goldl);margin:.5rem 0 .2rem;">🗺️ 探索與旅行</div>
      <div style="font-size:.6rem;color:var(--sild);line-height:1.7;">
        ・點擊地圖按鈕開啟大陸地圖<br>
        ・點擊城市查看設施（商店、旅店、公會等）<br>
        ・點擊設施可直接前往互動<br>
        ・旅行途中可能遭遇隨機事件<br>
        ・長途旅行需在驛站搭乘
      </div>

      <div style="font-size:.68rem;color:var(--goldl);margin:.5rem 0 .2rem;">⚒️ 鍛造與煉金</div>
      <div style="font-size:.6rem;color:var(--sild);line-height:1.7;">
        ・在活動頁面進行製作<br>
        ・料理：使用食材恢復HP或增益<br>
        ・鍛造：使用礦石打造武器防具<br>
        ・煉金：調配藥劑和特殊道具<br>
        ・材料來自商店、怪物掉落、探索
      </div>

      <div style="font-size:.68rem;color:var(--goldl);margin:.5rem 0 .2rem;">✦ 108星辰</div>
      <div style="font-size:.6rem;color:var(--sild);line-height:1.7;">
        ・故事中遇到星辰之人時橘子會感知<br>
        ・與星辰之人建立關係後可選擇招募<br>
        ・招募10人解鎖據點系統<br>
        ・108星全員齊聚觸發最終章
      </div>

      <div style="font-size:.68rem;color:var(--goldl);margin:.5rem 0 .2rem;">🔮 紋章系統</div>
      <div style="font-size:.6rem;color:var(--sild);line-height:1.7;">
        ・世界有27枚真紋章（主線相關）<br>
        ・一般紋章可在紋章頁面裝備到角色<br>
        ・真紋章發現是重大劇情事件<br>
        ・真紋章賦予強大力量但伴隨詛咒
      </div>

      <div style="font-size:.68rem;color:var(--goldl);margin:.5rem 0 .2rem;">💡 密技</div>
      <div style="font-size:.6rem;color:var(--sild);line-height:1.7;">
        ・在自由行動欄輸入 @錢 → 獲得大量金幣<br>
        ・在自由行動欄輸入 @骰子 → 開啟骰子面板
      </div>
    </div>`;
  document.getElementById('detail-modal').classList.add('open');
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

// 自動為所有有 prompt 但無頭像的角色生成 AI 頭像
// 從AI回應的對話中偵測新角色並自動生成頭像
const _knownSpeakers=new Set(['系統','橘子🐈😒','艾爾法😒','旁白']);
function _stripEmoji(s){return s.replace(/[^\p{L}\p{N}\s]/gu,'').trim();}
function autoPortraitFromDialogue(d){
  const dls=Array.isArray(d.dl)?d.dl:d.dl?[d.dl]:[];
  const nv=Array.isArray(d.nv)?d.nv:d.nv?[d.nv]:[];
  const allText=[...nv,...dls.map(x=>x?.ln||'')].join(' ');
  dls.forEach(dl=>{
    if(!dl||!dl.sp)return;
    const speaker=String(dl.sp).trim();
    if(!speaker||speaker.length>20)return;
    // 跳過系統和已知角色
    if(_knownSpeakers.has(speaker)||speaker.includes('系統')||speaker.includes('翻譯'))return;
    if(allParty().some(m=>speaker.includes(m.name)||m.name.includes(_stripEmoji(speaker))))return;
    const name=_stripEmoji(speaker)||speaker;
    if(name.length<1)return;
    const npcId='npc_'+name.replace(/\s/g,'_');
    if(getCustomPortrait(npcId)){_knownSpeakers.add(speaker);return;}
    _knownSpeakers.add(speaker);
    // 檢查是否為已知的 contact 星辰 → 用星辰系統生成
    const matchStar=[...TIANGANG,...DISHAT].find(s=>(s.name&&s.name!=='?'&&name.includes(s.name))||(s.cN&&name.includes(s.cN)));
    if(matchStar){
      const type=TIANGANG.includes(matchStar)?'天罡':'地煞';
      generateStarPortrait(type,matchStar.num,matchStar.name!=='?'?matchStar.name:name,matchStar.hint||desc||'');
      return;
    }
    // 從敘述提取外貌
    let desc=name;
    try{const re=new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[^。，]{0,40}');const m=allText.match(re);if(m)desc=m[0];}catch(_){}
    // 建 prompt
    const prompt=`${desc}, character portrait, ${PORTRAIT_STYLE}`;
    const seed=Math.floor(Math.random()*9000)+1000;
    if(!G.extraPcfg)G.extraPcfg={};
    G.extraPcfg[npcId]={prompt,seed,label:name,emoji:speaker};
    saveGame();
    // 生成頭像，完成後重繪故事（讓頭像出現在對話旁）
    const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=260&height=148&seed=${seed}&model=flux`;
    const img=new Image();
    img.onload=()=>{
      setCustomPortrait(npcId,url);
      saveGame();
      // 重繪故事內容讓頭像顯示出來
      renderStoryFromData();
    };
    img.onerror=()=>{console.warn('Portrait failed for',name);};
    img.src=url;
  });
}
// 為108星辰生成頭像（不需要sp觸發，任何時候都可呼叫）
function generateStarPortrait(type,num,name,hint){
  const starPortId=`star_${type}_${num}`;
  if(getCustomPortrait(starPortId))return; // 已有
  const desc=hint||name||'mysterious fantasy character';
  const prompt=`${desc.replace(/[・、。]/g,', ')}, character portrait, ${PORTRAIT_STYLE}`;
  const seed=Math.floor(Math.random()*9000)+1000;
  if(!G.extraPcfg)G.extraPcfg={};
  G.extraPcfg[starPortId]={prompt,seed,label:name||'???'};
  const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=260&height=148&seed=${seed}&model=flux`;
  const img=new Image();
  img.onload=()=>{
    setCustomPortrait(starPortId,url);saveGame();
    markDirty('stars');renderBoth('stars');
    renderStoryFromData(); // 重繪讓頭像出現
  };
  img.src=url;
}
// 開機時為所有已接觸但沒頭像的星辰補生成
function generateMissingStarPortraits(){
  let delay=0;
  [...TIANGANG,...DISHAT].forEach(s=>{
    if(s.status==='contact'||s.status==='recruited'){
      const portId=s.id?s.id:`star_${s.type||'地煞'}_${s.num}`;
      if(!getCustomPortrait(portId)&&!getCustomPortrait(`star_天罡_${s.num}`)&&!getCustomPortrait(`star_地煞_${s.num}`)){
        delay+=3000;
        setTimeout(()=>{
          const type=TIANGANG.includes(s)?'天罡':'地煞';
          generateStarPortrait(type,s.num,s.name!=='?'?s.name:(s.cN||''),s.hint||'');
        },delay);
      }
    }
  });
}
function generatePortraitNow(id){
  if(getCustomPortrait(id))return; // 已有
  const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id]);
  if(!cfg?.prompt)return;
  const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(cfg.prompt)}?width=260&height=148&seed=${cfg.seed||Math.floor(Math.random()*9000)+1000}&model=flux`;
  const img=new Image();
  img.onload=()=>{
    setCustomPortrait(id,url);
    markDirty('party','stars');
    renderBoth('party');renderBoth('stars');
  };
  img.src=url;
}
function autoGeneratePortraits(){
  const ids=[...Object.keys(PCFG),...Object.keys(G.extraPcfg||{})];
  let delay=0;
  ids.forEach(id=>{
    if(getCustomPortrait(id))return; // 已有自訂頭像
    const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id]);
    if(!cfg?.prompt)return;
    delay+=3000; // 間隔3秒避免過載
    setTimeout(()=>{
      const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(cfg.prompt)}?width=260&height=148&seed=${cfg.seed||Math.floor(Math.random()*9000)+1000}&model=flux`;
      const img=new Image();
      img.onload=()=>{setCustomPortrait(id,url);renderBoth('party');};
      img.src=url;
    },delay);
  });
}
function generateFromDesc(id){
  const textarea=document.getElementById(`port-desc-${id}`);
  const status=document.getElementById(`gen-status-${id}`);
  const btn=document.getElementById(`gen-btn-${id}`);
  if(!textarea)return;
  let desc=textarea.value.trim();
  if(!desc){status.textContent='請輸入描述';status.style.color='#f99';return;}
  if(btn)btn.disabled=true;
  if(status){status.textContent='生成中，約 10~30 秒… 支援中文描述';status.style.color='var(--sild)';}
  // Save prompt to config
  const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id]);
  if(cfg)cfg.prompt=desc;
  const seed=Math.floor(Math.random()*9000)+1000;
  if(cfg)cfg.seed=seed;
  // 自動補上畫風提示（如果用戶沒寫英文風格詞）
  const hasStyle=/portrait|illustration|style|fantasy|anime|painting/i.test(desc);
  const finalPrompt=hasStyle?desc:desc+', character portrait, fantasy illustration';
  const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=260&height=148&seed=${seed}&model=flux`;
  const img=new Image();
  img.onload=()=>{
    setCustomPortrait(id,url);
    markDirty('party','stars');renderBoth('party');renderBoth('stars');
    if(status){status.textContent='✓ 頭像已更新！';status.style.color='var(--grn)';}
    const urlInp=document.getElementById(`port-url-${id}`);if(urlInp)urlInp.value=url;
    if(btn)btn.disabled=false;
    saveGame();
  };
  img.onerror=()=>{
    if(status){status.textContent='⚠ 生成失敗，請修改描述後重試';status.style.color='#f99';}
    if(btn)btn.disabled=false;
  };
  img.src=url;
}
async function generateAIPortrait(id){
  const cfg=PCFG[id]||(G.extraPcfg&&G.extraPcfg[id]);if(!cfg?.prompt)return;
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
    G.sceneLoc='📍 鐵霧城・城門前';
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
    TIANGANG.slice(1).forEach(s=>{s.status='unknown';s.name='?';delete s.id;delete s.cN;delete s.hint;});
    DISHAT.slice(1).forEach(s=>{s.status='unknown';s.name='?';delete s.id;delete s.cN;delete s.hint;});

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

// ═══ 完整性檢查：掃描 history 與遊戲狀態的不同步 ═══
function integrityCheck(){
  const fixes=[];
  // 從最近 history 提取 AI 回應中的 JSON
  const recentAssist=G.history.filter(m=>m.role==='assistant').slice(-10);
  recentAssist.forEach(m=>{
    let d;try{d=JSON.parse(m.content);}catch(_){try{const mm=m.content.match(/\{[\s\S]*\}/);if(mm)d=JSON.parse(mm[0]);}catch(_){}}
    if(!d)return;
    // 1. 檢查 sp 欄位：AI 回了 sp 但 handleStarPresence 可能沒跑到
    if(d.sp){
      const sps=Array.isArray(d.sp)?d.sp:[d.sp];
      sps.forEach(sp=>{
        if(!sp||sp.special||!sp.num||!sp.type)return;
        const arr=sp.type==='天罡'?TIANGANG:DISHAT;
        const star=arr.find(s=>s.num===sp.num);
        if(star&&star.status==='unknown'){
          star.status='contact';
          if(sp.name&&!/^[?？]+$/.test(sp.name))star.name=sp.name;
          if(sp.hint)star.hint=sp.hint;
          if(sp.cN)star.cN=sp.cN;
          if(sp.star)star.star=sp.star;
          fixes.push(`星辰錄補登：${sp.type}第${sp.num}星 ${sp.cN||sp.name||'???'}`);
        }else if(star&&star.status==='contact'&&sp.name&&!/^[?？]+$/.test(sp.name)&&star.name!==sp.name){
          star.name=sp.name;
          fixes.push(`星辰錄更名：第${sp.num}星→${sp.name}`);
        }
      });
    }
    // 2. 檢查 nm 欄位：AI 回了 nm 但 addNewMember 可能沒跑到
    if(d.nm){
      const nms=Array.isArray(d.nm)?d.nm:[d.nm];
      nms.forEach(nm=>{
        if(!nm||!nm.id||!nm.name)return;
        if(!getCharData(nm.id)){
          addNewMember(nm);
          fixes.push(`角色補登：${nm.name} 加入隊伍`);
        }else if(!isInParty(nm.id)){
          joinParty(nm.id);
          fixes.push(`角色補入隊：${nm.name}`);
        }
      });
    }
    // 3. 檢查 fa/gd/hp 等是否被漏掉（只補 fa，金幣和HP太敏感不自動補）
    if(d.fa){
      const fas=Array.isArray(d.fa)?d.fa:[d.fa];
      fas.forEach(f=>{if(f&&f.id&&f.delta&&getFavor(f.id)!==null)setFavor(f.id,f.delta);});
    }
    // 4. 檢查 info
    if(d.info){
      const infos=Array.isArray(d.info)?d.info:[d.info];
      infos.forEach(inf=>{
        if(inf&&inf.id&&!(G.intel||[]).find(x=>x.id===inf.id))addIntel(inf);
      });
    }
  });
  // 5. 檢查 extraParty 裡有角色但不在 partyIds 裡（且隊伍未滿）
  (G.extraParty||[]).forEach(c=>{
    if(c.id&&!isInParty(c.id)&&(G.partyIds||[]).length<MAX_PARTY){
      // 只補最近加入的（避免把所有離隊的都加回來）
      // 檢查 history 裡是否提到這個角色
      const mentioned=G.history.slice(-20).some(m=>m.content&&m.content.includes(c.name));
      if(mentioned){
        joinParty(c.id);
        fixes.push(`角色補入隊：${c.name}（劇情中提及但未在隊伍）`);
      }
    }
  });
  // 6. 掃描最近敘述中出現的角色名，檢查是否有「同行但未入隊」的情況
  const recentText=G.history.slice(-20).map(m=>m.content||'').join(' ');
  const partyNames=allParty().map(m=>m.name);
  // 掃描 extraParty 和已知 contact 星辰
  [...TIANGANG,...DISHAT].filter(s=>s.status==='contact'&&s.name&&s.name!=='?').forEach(s=>{
    if(!partyNames.includes(s.name)&&recentText.includes(s.name)){
      fixes.push(`⚠ 星辰「${s.name}」（${s.type}第${s.num}星）在劇情中出現但未加入隊伍。下次選擇時可嘗試邀請。`);
    }
  });

  if(fixes.length){
    markDirty('stars','party','intel');
    renderBoth('stars');renderBoth('party');
    saveGame();
    fixes.forEach(f=>appendEntryToDOM({type:'sys',v:`⚙ ${f}`}));
    scrollD();
    showToast(`⚙ 檢查完成，${fixes.length} 項`,'ok');
  }else{
    appendEntryToDOM({type:'sys',v:'⚙ 完整性檢查：所有資料同步正常。'});
    scrollD();
  }
  return fixes.length;
}

async function syncAll(){
  if(G.thinking){showToast('AI 回應中，請稍候','inf');return;}
  markAllDirty();
  Object.keys(_renderCache).forEach(k=>delete _renderCache[k]);
  updateGold();updateTimeDisplay();updateShopBtn();
  ['party','stars','inv','quest','intel','log','guild','activities'].forEach(tab=>renderBoth(tab));
  if(G.currentChoices?.length)renderChoices(G.currentChoices,false);
  document.getElementById('scene-title').textContent=G.sceneTitle||'';
  document.getElementById('scene-loc').textContent=G.sceneLoc||'';
  saveGame();
  // 按鈕動畫
  const btn=document.querySelector('button[onclick="syncAll()"]');
  if(btn){btn.style.transition='transform .5s';btn.style.transform='rotate(360deg)';setTimeout(()=>{btn.style.transform='';btn.style.transition='';},500);}
  // 完整性檢查：修正不同步的資料
  integrityCheck();
  // 注入校正訊息到 history，讓 AI 下次回應時遵守新規則
  const inv=getInv();
  const pd=allParty().map(m=>`${m.name}/${getJob(m.id)||'?'}/HP${getHP(m.id).cur}`).join(',');
  const correction=`【系統校正】請嚴格遵守以下規則：
1. 只輸出純JSON。
2. 遇到新的重要NPC時，若橘子感知到星辰氣息，必須填sp欄位：{"num":N,"type":"天罡或地煞","star":"星名","name":"???","hint":"外貌","cN":"暫稱"}。不填sp=星辰錄不更新。
3. 與星辰角色同行一段時間後，ch選項必須包含「邀請加入隊伍」的選擇。玩家選擇後用nm欄位觸發入隊。
4. 每次回應必須有nv（敘述）和dl（對話）。
5. 當前狀態：隊伍=${pd}；金幣=金${G.gold.gold}銀${G.gold.silver}銅${G.gold.copper}；場景=${G.sceneTitle}/${G.sceneLoc}
請以JSON格式繼續當前場景。`;
  // 移除舊的校正（如果有的話）
  G.history=G.history.filter(m=>!(m.role==='user'&&m.content.includes('【系統校正】')));
  G.history.push({role:'user',content:correction});
  G.history.push({role:'assistant',content:`{"st":"${G.sceneTitle||'繼續'}","sl":"${G.sceneLoc||'📍 未知'}","nv":[],"dl":[],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null}`});
  saveGame();
  if(G.currentChoices?.length)renderChoices(G.currentChoices,false);
  else renderFallback();
  showToast('✦ 同步完成，AI已校正','ok');
  appendEntryToDOM({type:'sys',v:'✦ AI 規則已校正。下次選擇時生效。'});
  scrollD();
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

// ═══ ACHIEVEMENT SYSTEM ═══
const ACHIEVEMENTS=[
  {id:'first_battle',title:'初戰',desc:'完成第一場戰鬥',icon:'⚔️',check:()=>G._battleCount>=1},
  {id:'first_quest',title:'冒險的起點',desc:'完成第一個任務',icon:'📋',check:()=>G.quests.some(q=>q.status==='完成')},
  {id:'first_star',title:'星辰初會',desc:'招募第一位108星辰',icon:'✦',check:()=>[...TIANGANG,...DISHAT].filter(s=>s.status==='recruited').length>=2},
  {id:'five_stars',title:'聚星之路',desc:'招募5位星辰之人',icon:'🌟',check:()=>[...TIANGANG,...DISHAT].filter(s=>s.status==='recruited').length>=6},
  {id:'ten_stars',title:'北斗之下',desc:'招募10位星辰之人・解鎖據點',icon:'🏛️',check:()=>[...TIANGANG,...DISHAT].filter(s=>s.status==='recruited').length>=11},
  {id:'level_5',title:'初露鋒芒',desc:'任一角色達到 Lv.5',icon:'📈',check:()=>Object.values(G.upgrade).some(u=>u.lv>=5)},
  {id:'level_10',title:'身經百戰',desc:'任一角色達到 Lv.10',icon:'📈',check:()=>Object.values(G.upgrade).some(u=>u.lv>=10)},
  {id:'rich',title:'初見金幣',desc:'擁有1金幣以上',icon:'🪙',check:()=>G.gold.gold>=1},
  {id:'mega_rich',title:'富甲一方',desc:'擁有10金幣以上',icon:'💰',check:()=>G.gold.gold>=10},
  {id:'first_craft',title:'初次鍛造',desc:'成功製作第一件物品',icon:'⚒️',check:()=>G._craftCount>=1},
  {id:'boss_slayer',title:'BOSS獵人',desc:'擊敗第一個BOSS',icon:'💀',check:()=>G._bossKills>=1},
  {id:'explorer',title:'探索者',desc:'造訪3個不同城市',icon:'🗺️',check:()=>(G._visitedCities||[]).length>=3},
  {id:'crest_found',title:'紋章發現者',desc:'發現第一枚真紋章',icon:'🔮',check:()=>G.crests&&Object.keys(G.crests.trueCrestStatus||{}).some(k=>G.crests.trueCrestStatus[k].found)},
  {id:'orange_love',title:'貓奴',desc:'橘子好感度達到90',icon:'🐈',check:()=>(getFavor('orange')||50)>=90},
  {id:'survivor',title:'死裡逃生',desc:'戰鬥敗北後存活',icon:'💪',check:()=>G._defeatCount>=1},
  {id:'all_city',title:'大陸旅人',desc:'造訪全部16座城市',icon:'🌍',check:()=>(G._visitedCities||[]).length>=16},
];

function checkAchievements(){
  if(!G._achievements)G._achievements=[];
  let newCount=0;
  ACHIEVEMENTS.forEach(a=>{
    if(G._achievements.includes(a.id))return;
    try{if(a.check()){
      G._achievements.push(a.id);
      appendEntryToDOM({type:'sys',v:`🏆 成就解鎖：【${a.icon} ${a.title}】${a.desc}`});
      showToast(`🏆 ${a.title}`,'ok');
      newCount++;
    }}catch(_){}
  });
  if(newCount)saveGame();
}

function buildAchievements(){
  if(!G._achievements)G._achievements=[];
  const unlocked=G._achievements.length;
  return`<div style="font-size:.62rem;color:var(--goldd);margin-bottom:.4rem;">🏆 成就（${unlocked}/${ACHIEVEMENTS.length}）</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.3rem;">
    ${ACHIEVEMENTS.map(a=>{
      const done=G._achievements.includes(a.id);
      return`<div style="padding:.35rem;background:${done?'rgba(201,168,76,.08)':'var(--bg3)'};border:1px solid ${done?'rgba(201,168,76,.3)':'var(--brd)'};border-radius:3px;opacity:${done?1:.5};">
        <div style="font-size:.8rem;text-align:center;">${a.icon}</div>
        <div style="font-size:.56rem;color:${done?'var(--gold)':'var(--sild)'};text-align:center;font-weight:${done?600:400};">${a.title}</div>
        <div style="font-size:.48rem;color:var(--sild);text-align:center;">${done?a.desc:'???'}</div>
      </div>`;
    }).join('')}
    </div>`;
}

// ═══ INIT ═══
function initLog(){
  return[
    {sec:'序章・Day1',loc:'鐵霧城・城門前',lines:[{t:'txt',v:'旅人艾爾法與橘子抵達鐵霧城。終年不散的濃霧，空氣中帶著鐵鏽味。'},{t:'sys',v:'持有：銀幣8枚、銅幣135枚'}]},
  ];
}

function initStory(){
  const c=document.getElementById('story-content');
  c.innerHTML='';
  _sysInfoLog.length=0;
  document.getElementById('story-scroll').scrollTop=0;
  G.storyData=[];

  const opening=[
    // ── 序幕：天象 ──
    {type:'sec',v:'序幕'},
    {type:'narr',v:'帝國曆 1077 年，深秋之夜。聖赫倫帝國末代皇帝駕崩的那個晚上，北斗星下 108 顆流星劃過艾爾薩大陸的天空。沒有人知道這意味著什麼。'},
    {type:'narr',v:'三年後，帝國已成廢墟。十二位總督各據一方稱王，邊境燃起戰火，商路斷絕，盜匪橫行。'},

    // ── Day 1：抵達鐵霧城 ──
    {type:'sec',v:'序章　Day 1　傍晚'},
    {type:'narr',v:'鐵霧城。霧山聯邦的工業重鎮，終年濃霧不散，空氣裡永遠帶著鐵鏽的味道。'},
    {type:'narr',v:'城門前排著長長的隊伍。逃難的農民、找活的傭兵、鬼鬼祟祟的行商。一個拉低斗篷帽沿的銀髮女人混在隊伍中，看起來和其他旅人沒什麼不同。'},
    {type:'narr',v:'她不記得自己從哪裡來，也不知道要往哪裡去。身上只有一把磨損的無銘短劍、一件破舊的斗篷、兩塊乾糧，和一隻五枚銅幣買的貓。'},
    {type:'dial',sp:'守門衛兵',ln:'入城費五銅。有通行證的減免。'},
    {type:'dial',sp:'艾爾法😒',ln:'⋯⋯沒有通行證。'},
    {type:'narr',v:'五枚銅幣落入衛兵的手中。城門在她面前緩緩打開，霧氣從門內湧出，像是迎接，又像是吞噬。'},

    // ── 城內 ──
    {type:'narr',v:'城內比城外更灰暗。鐵匠的錘聲迴盪在街道上，酒館門口有人在爭吵，告示欄前圍了一群人。'},
    {type:'narr',v:'艾爾法沒有看告示欄。她需要的是一頓飯和一個能過夜的地方。'},
    {type:'dial',sp:'橘子🐈😒',ln:'喵——'},
    {type:'sys',v:'〔系統翻譯：那邊的酒館有魚的味道。建議前往。這不是商量。〕'},
    {type:'narr',v:'肩上的布偶貓懶洋洋地趴著，藍眼睛半睜半閉。這隻貓從不撒嬌，從不示弱，只是一直在那裡——彷彿她才是主人，而艾爾法不過是代步工具。'},
    {type:'narr',v:'暮色漸深，霧越來越濃。鐵霧城的夜晚即將降臨。'},
  ];

  opening.forEach(e=>appendEntryToDOM(e));
  G.history=[
    {role:'user',content:'故事開始。場景：鐵霧城，傍晚。艾爾法是來歷不明的旅人，沒有職業沒有背景，帶著一隻五銅幣買的布偶貓橘子剛抵達鐵霧城。她需要找到食物和住處。城裡有酒館、告示欄、碼頭、市集等地點可探索。這是一個西方劍與魔法的奇幻世界，水滸傳風格的亂世冒險。請給出自由探索的行動選項。'},
    {role:'assistant',content:'{"st":"序章 Day 1","sl":"📍 鐵霧城・大街","nv":["暮色漸深。鐵霧城的街道在霧中延伸，幾個方向各有不同的光景——酒館的燈火、告示欄的人群、碼頭方向隱約的號角聲。"],"dl":[{"sp":"橘子🐈😒","ln":"喵。"},{"sp":"系統","ln":"〔翻譯：我餓了。你也是。先解決這個。〕"}],"sm":null,"gd":{"g":0,"s":0,"c":0},"ch":[{"t":"走進酒館，先填飽肚子再說","h":"可能遇到有趣的人・花費銅幣"},{"t":"去告示欄看看有沒有能賺錢的工作","h":"情報收集・了解城市狀況"},{"t":"往碼頭方向走走","h":"探索・可能有打工機會"},{"t":"找個便宜的旅店先住下","h":"安全・消耗少量銅幣"}],"nm":null,"cb":null,"iv":null,"sp":null,"shop":null,"fa":null,"hp":null,"qt":null,"tm":null,"rp":null,"info":null,"relic":null,"clue":null,"or":null,"job":null,"gu":null,"cr":null}'}
  ];
  const initChoices=[
    {t:'走進酒館，先填飽肚子再說',h:'可能遇到有趣的人・花費銅幣'},
    {t:'去告示欄看看有沒有能賺錢的工作',h:'情報收集・了解城市狀況'},
    {t:'往碼頭方向走走',h:'探索・可能有打工機會'},
    {t:'找個便宜的旅店先住下',h:'安全・消耗少量銅幣'}
  ];
  renderChoices(initChoices);
  saveGame();
}

// 自動戰鬥判定（由 AI cb 欄位觸發）
function autoCombat(cb){
  if(!cb)return;
  // Use new combat system if enemy IDs provided
  if(cb.enemies&&Array.isArray(cb.enemies)){
    startCombat(cb.enemies,cb.boss||false);
    return;
  }
  BGM.setMood('battle');if(BGM.playing){BGM.stop();BGM.start();}
  // 顯示骰子按鈕
  const db=document.getElementById('dice-btn');
  if(db)db.style.display='';
  // 展開自由行動列（讓玩家看到骰子）
  const fr=document.getElementById('free-row');
  if(fr)fr.classList.add('open');
  const _esCombat=getEffectiveStats('alfar');
  const statVal=_esCombat[cb.stat]||0;
  const bondBonus=G.rep['_bond_dice_bonus']||0;
  if(bondBonus>0){G.rep['_bond_dice_bonus']=0;appendEntryToDOM({type:'sys',v:`✦ 羈絆加成 +${bondBonus} 生效中`});}
  const autoSuccess=G.rep['_bond_auto_success']||0;
  if(autoSuccess)G.rep['_bond_auto_success']=0;
  const resBonus=getResonanceBonus();
  const cookAtk=G._cookBuff?.atk||0;if(G._cookBuff)G._cookBuff=null;
  const mod=Math.floor(statVal/10)+bondBonus+resBonus+cookAtk;
  const enemy=cb.enemy||'敵人';
  const diff=cb.difficulty||12;
  if(resBonus)appendEntryToDOM({type:'sys',v:`✦ 星辰共鳴加成 +${resBonus}`});
  if(cookAtk)appendEntryToDOM({type:'sys',v:`🍳 料理加成 +${cookAtk}`});
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
      },2000); // 必須晚於 heroDown 的 1500ms
    }
  },70);
}

// ═══ LOCAL COMBAT (no API needed for basic encounters) ═══
function localCombat(enemyName,difficulty){
  difficulty=difficulty||10;
  const _esLocal=getEffectiveStats('alfar');
  const statVal=_esLocal['武力']||0;
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
    const _esDice=getEffectiveStats(_diceState.charId);
    const v=_esDice[_diceState.stat]||0;
    const mod=Math.floor(v/10);
    document.getElementById('dice-result').innerHTML=`<div style="text-align:center;color:var(--sild);font-size:.72rem;">d20 + ${_diceState.stat}(${v}) 加值 +${mod}<br><span style="font-size:.62rem;opacity:.6">${STAT_MAP[_diceState.stat]||''}</span></div>`;
  }
}

function rollDice(){
  const c=getCharData(_diceState.charId);if(!c)return;
  const _esRoll=getEffectiveStats(_diceState.charId);
  const statVal=_esRoll[_diceState.stat]||0;
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

// ═══ MAP DATA DB ═══
const POI_ICON_COLORS={port:'#4488cc',plaza:'#c9a84c',guard:'#cc8844',inn:'#44aa66',shop:'#aa6644',guild:'#8844aa',danger:'#cc4444',waystation:'#c9a84c',special:'#88aacc',ruins:'#887755',district:'#778899'};
const GUILD_NAME_MAP={'冒險者':'adventurer','英雄':'adventurer','商人':'merchant','學院':'scholar','匠人':'craft','暗影':'shadow','傭兵':'adventurer'};

// ═══ NPC 資料庫 ═══
const NPC_DB={
  // 鐵霧城
  'enzzo':{name:'恩佐・卡羅',title:'鐵霧城代理城主',city:'iron_fog',icon:'⚙️',faction:'ironmist',
    desc:'以鐵腕治理霧山聯邦西部。控制鐵礦與貿易，對底層苛刻。',personality:'冷酷、精於算計',disposition:'hostile'},
  'gelin':{name:'葛林',title:'碼頭區倉庫老闆',city:'iron_fog',icon:'📦',faction:'ironmist',
    desc:'碼頭區最大倉庫的經營者。和善但精明，常僱用零工。',personality:'務實、圓滑',disposition:'neutral'},
  'mist_boss':{name:'霧刃幫首領',title:'山口劫匪頭目',city:'iron_fog',icon:'⚔️',faction:'mistblade',
    desc:'身份不明的霧刃幫首領。組織規模可能比表面更大。',personality:'不明',disposition:'enemy'},
  // 銀月城
  'moon_mayor':{name:'席爾維婭',title:'銀月城商會會長',city:'silver_moon',icon:'🌙',faction:'merchant',
    desc:'銀月城最有權勢的女商人。掌控情報網路與貿易路線。',personality:'優雅、深不可測',disposition:'neutral'},
  'hero_master':{name:'鐵拳・馬庫斯',title:'英雄公會會長',city:'silver_moon',icon:'🛡️',faction:'hero',
    desc:'退役的帝國禁衛隊長。公正嚴厲，對新人要求極高。',personality:'正直、嚴厲',disposition:'friendly'},
  // 東港城
  'port_info':{name:'烏鴉',title:'情報屋老闆',city:'east_port',icon:'🕵️',faction:'shadow',
    desc:'東港城地下情報網的核心人物。什麼消息都能買到，但價格不菲。',personality:'神秘、守信',disposition:'neutral'},
  'merchant_boss':{name:'金袋・哈羅德',title:'商人公會東港分會長',city:'east_port',icon:'💰',faction:'merchant',
    desc:'控制東海貿易線的肥胖商人。笑臉背後是精密的算計。',personality:'貪婪、狡猾',disposition:'neutral'},
  // 翠林域
  'elf_elder':{name:'艾蕾恩',title:'翠林長老',city:'jade_forest',icon:'🧝',faction:null,
    desc:'千年精靈長老。守護世界樹與禁忌書庫。對外人保持距離但非敵意。',personality:'睿智、超然',disposition:'neutral'},
  // 鏽城
  'imperial_gen':{name:'鐵壁・凱恩',title:'帝國殘軍將軍',city:'rust_city',icon:'👑',faction:'imperial',
    desc:'效忠已故皇帝的最後將軍。相信帝國會復興，但部下已開始動搖。',personality:'忠誠、固執',disposition:'neutral'},
  // 霜守堡
  'knight_cmdr':{name:'冰霜・亞瑟',title:'流亡騎士團團長',city:'frost_keep',icon:'🛡️',faction:null,
    desc:'率領騎士團駐守北方極寒之地的騎士。嚴守帝國時代的騎士誓言。',personality:'高潔、頑固',disposition:'friendly'},
  // 南荒
  'sand_hunter':{name:'沙獵・莉拉',title:'南荒獵人',city:'sand_gate',icon:'🏜️',faction:null,
    desc:'南荒最強的獵人之一。熟知荒野每條路徑，是進入龍牙砦的最佳嚮導。',personality:'沉默寡言、可靠',disposition:'neutral'},
  // 影沼地
  'marsh_doc':{name:'毒蛛・梅拉',title:'影沼鎮藥師',city:'shadow_marsh',icon:'🕷️',faction:null,
    desc:'影沼地最好的藥師，同時也是最危險的毒師。治療和毒殺只在一念之間。',personality:'陰沉、專業',disposition:'neutral'},
  // 灰港
  'haven_fisherman':{name:'老漁夫・巴恩',title:'灰港漁民代表',city:'grey_haven',icon:'🐟',faction:'ironmist',
    desc:'灰港最資深的漁夫。看似單純的老人，實際上對海上走私路線瞭若指掌。',personality:'和藹、世故',disposition:'friendly'},
  // 金橋城
  'bridge_tax':{name:'稅務官・雷蒙',title:'金橋城稅務署長',city:'golden_bridge',icon:'📜',faction:null,
    desc:'中央王國派駐金橋城的稅務官。對每一枚銅幣都斤斤計較，但在其位謀其政。',personality:'精明、公正',disposition:'neutral'},
  // 王冠峰
  'peak_scout':{name:'鷹眼・薩拉',title:'邊境斥候隊長',city:'crown_peak',icon:'🦅',faction:null,
    desc:'駐守王冠峰瞭望塔的斥候隊長。能看見三國邊境的一切動靜。',personality:'警覺、直率',disposition:'friendly'},
  // 珊瑚灣
  'coral_pirate':{name:'紅鬍子・葛瑞格',title:'珊瑚灣海盜頭目',city:'coral_bay',icon:'🏴‍☠️',faction:null,
    desc:'珊瑚灣暗礁附近活動的海盜首領。與其說是海盜，不如說是收保護費的漁霸。',personality:'粗獷、講義氣',disposition:'neutral'},
  // 霧海關
  'pass_commander':{name:'鐵壁・沃爾夫',title:'霧海關守備隊長',city:'fog_sea_pass',icon:'🚧',faction:null,
    desc:'霧海關的守備隊長。嚴格執行盤查制度，但據說可以用「特殊方式」通關。',personality:'嚴肅、可收買',disposition:'neutral'},
  // 古樹隱村
  'elder_sage':{name:'星語者・伊凡',title:'古樹隱村隱士',city:'elder_grove',icon:'🧙',faction:null,
    desc:'隱居在禁忌書庫中的老學者。據說他讀遍了帝國時代所有的禁書，知道許多不該知道的事。',personality:'古怪、博學',disposition:'neutral'},
  // 龍牙砦
  'dragon_hunter':{name:'屠龍者・雷克斯',title:'南荒最強戰士',city:'dragon_valley',icon:'🐉',faction:null,
    desc:'唯一進入古龍遺跡並活著出來的人。身上的傷疤比故事還多。',personality:'沉默、驕傲',disposition:'neutral'},
  // 各城市商人
  'iron_blacksmith':{name:'鐵錘・德溫',title:'鐵霧城鐵匠',city:'iron_fog',icon:'⚒️',faction:'ironmist',
    desc:'鐵霧城最好的鐵匠。礦工出身，打出的武器以耐用著稱。',personality:'寡言、專注',disposition:'friendly'},
  'moon_alchemist':{name:'銀瓶・蘿拉',title:'銀月城煉金術士',city:'silver_moon',icon:'⚗️',faction:null,
    desc:'銀月城藥鋪的老闆。擅長調配各種藥劑，也販售一些「不太合法」的東西。',personality:'神秘、健談',disposition:'friendly'},
  'port_shipwright':{name:'老船匠・約翰',title:'東港城造船師',city:'east_port',icon:'⚓',faction:null,
    desc:'東港城最資深的造船師。每艘從東港出海的船都經過他的手。',personality:'固執、自豪',disposition:'friendly'},
};

// ═══ 怪物/敵人資料庫 ═══
const ENEMY_DB={
  // 一般敵人（各地區）
  'goblin':{name:'哥布林',lv:1,hp:15,stats:{武力:8,知力:3},drops:['哥布林牙'],exp:5,gold:{s:0,c:10},area:['iron_fog','grey_haven'],icon:'👹'},
  'wolf':{name:'灰狼',lv:2,hp:25,stats:{武力:14,知力:5},drops:['狼皮'],exp:8,gold:{s:0,c:20},area:['iron_fog','iron_crown'],icon:'🐺'},
  'bandit':{name:'山賊',lv:3,hp:35,stats:{武力:18,知力:10},drops:['繃帶','銅幣袋'],exp:12,gold:{s:1,c:0},area:['iron_fog','grey_haven','sand_gate'],icon:'🗡️'},
  'mist_thug':{name:'霧刃幫嘍囉',lv:4,hp:45,stats:{武力:22,知力:12},drops:['鐵匕首','霧刃幫徽章'],exp:18,gold:{s:2,c:0},area:['iron_fog'],icon:'⚔️'},
  'snake':{name:'毒蛇',lv:2,hp:20,stats:{武力:10,知力:4},drops:['蛇毒囊'],exp:6,gold:{s:0,c:15},area:['shadow_marsh','dragon_valley'],icon:'🐍'},
  'spider':{name:'巨蛛',lv:3,hp:30,stats:{武力:15,知力:6},drops:['蜘蛛絲'],exp:10,gold:{s:0,c:30},area:['shadow_marsh','elder_grove'],icon:'🕷️'},
  'bat':{name:'洞窟蝙蝠',lv:1,hp:12,stats:{武力:6,知力:2},drops:['蝙蝠翼'],exp:4,gold:{s:0,c:8},area:['iron_crown','rust_city','dragon_valley'],icon:'🦇'},
  'skeleton':{name:'骸骨兵',lv:5,hp:55,stats:{武力:25,知力:8},drops:['骷髏骨','帝國遺劍'],exp:22,gold:{s:3,c:0},area:['rust_city'],icon:'💀'},
  'pirate':{name:'海盜',lv:4,hp:50,stats:{武力:20,知力:14},drops:['海軍彎刀','珊瑚'],exp:20,gold:{s:2,c:50},area:['east_port','coral_bay','fog_sea_pass'],icon:'🏴‍☠️'},
  'forest_sprite':{name:'森靈',lv:3,hp:28,stats:{武力:10,知力:25},drops:['精靈花','月光蘑菇'],exp:15,gold:{s:1,c:50},area:['jade_forest','elder_grove'],icon:'🧚'},
  'ice_wolf':{name:'霜狼',lv:5,hp:60,stats:{武力:28,知力:8},drops:['冰霜結晶','狼皮'],exp:25,gold:{s:3,c:50},area:['frost_keep'],icon:'🐺'},
  'sand_worm':{name:'沙蟲',lv:6,hp:80,stats:{武力:32,知力:5},drops:['沙蟲殼','沙金'],exp:35,gold:{s:5,c:0},area:['dragon_valley','sand_gate'],icon:'🪱'},
  'marsh_golem':{name:'沼澤巨人',lv:7,hp:100,stats:{武力:35,知力:10},drops:['泥岩核心','沼澤精華'],exp:45,gold:{s:6,c:0},area:['shadow_marsh'],icon:'🗿'},
  'dark_knight':{name:'暗黑騎士',lv:8,hp:120,stats:{武力:40,知力:20},drops:['暗影精華','暗黑騎士甲'],exp:60,gold:{s:10,c:0},area:['rust_city'],icon:'🖤'},
  'dragon_spawn':{name:'幼龍',lv:10,hp:200,stats:{武力:50,知力:30},drops:['龍鱗','龍牙','龍血草'],exp:100,gold:{g:1,s:0,c:0},area:['dragon_valley'],icon:'🐉'},
  // BOSS
  'mist_leader':{name:'霧刃幫首領',lv:8,hp:150,stats:{武力:38,知力:25},drops:['霧刃幫首領面具','混沌碎片'],exp:80,gold:{g:0,s:50,c:0},area:['iron_fog'],boss:true,icon:'👤'},
  'imperial_shade':{name:'帝國亡靈將軍',lv:12,hp:300,stats:{武力:55,知力:35},drops:['聖赫倫皇冠碎片','帝國禁衛甲'],exp:150,gold:{g:2,s:0,c:0},area:['rust_city'],boss:true,icon:'👻'},
  'sea_serpent':{name:'海蛇王',lv:10,hp:250,stats:{武力:45,知力:20},drops:['海蛇鱗','深海珊瑚'],exp:120,gold:{g:1,s:50,c:0},area:['coral_bay','fog_sea_pass'],boss:true,icon:'🐉'},
  'ancient_dragon':{name:'遠古巨龍',lv:15,hp:500,stats:{武力:70,知力:50},drops:['古龍之鱗','龍骨劍','創世碎片'],exp:300,gold:{g:5,s:0,c:0},area:['dragon_valley'],boss:true,icon:'🐲'},
  // ── 中級敵人 ──
  'thief':{name:'盜賊',lv:3,hp:32,stats:{武力:16,知力:15},drops:['銅幣袋','匕首'],exp:14,gold:{s:1,c:50},area:['silver_moon','golden_bridge','east_port'],icon:'🥷'},
  'mercenary':{name:'傭兵',lv:5,hp:60,stats:{武力:26,知力:14},drops:['長劍','皮甲'],exp:25,gold:{s:3,c:0},area:['silver_moon','rust_city','sand_gate'],icon:'⚔️'},
  'mage_apprentice':{name:'術士學徒',lv:4,hp:35,stats:{武力:8,知力:28},drops:['法杖','月光蘑菇'],exp:20,gold:{s:2,c:0},area:['silver_moon','jade_forest'],icon:'🧙'},
  'smuggler':{name:'走私客',lv:3,hp:38,stats:{武力:15,知力:18},drops:['走私品地圖','東方香料'],exp:16,gold:{s:2,c:50},area:['grey_haven','east_port','fog_sea_pass'],icon:'🤫'},
  'guard_dog':{name:'守衛犬',lv:2,hp:22,stats:{武力:16,知力:4},drops:['獸肉'],exp:7,gold:{s:0,c:15},area:['iron_fog','iron_crown','silver_moon'],icon:'🐕'},
  'wild_boar':{name:'野豬',lv:2,hp:30,stats:{武力:18,知力:3},drops:['獸肉','皮革'],exp:9,gold:{s:0,c:20},area:['jade_forest','crown_peak','sand_gate'],icon:'🐗'},
  'cave_troll':{name:'洞穴巨魔',lv:6,hp:90,stats:{武力:30,知力:6},drops:['巨魔牙','鐵礦'],exp:35,gold:{s:4,c:0},area:['iron_crown','dragon_valley'],icon:'👹'},
  'ghost':{name:'幽靈',lv:5,hp:40,stats:{武力:15,知力:30},drops:['暗影精華','幽靈布'],exp:28,gold:{s:2,c:50},area:['rust_city','shadow_marsh'],icon:'👻'},
  'harpy':{name:'鷹身女妖',lv:5,hp:45,stats:{武力:22,知力:20},drops:['鷹羽','風之結晶'],exp:26,gold:{s:3,c:0},area:['crown_peak','frost_keep'],icon:'🦅'},
  'lizardman':{name:'蜥蜴人',lv:4,hp:50,stats:{武力:20,知力:10},drops:['蜥蜴鱗','毒囊'],exp:22,gold:{s:2,c:0},area:['shadow_marsh','dragon_valley'],icon:'🦎'},
  'undead_knight':{name:'不死騎士',lv:7,hp:110,stats:{武力:35,知力:15},drops:['暗黑騎士甲','骷髏骨'],exp:50,gold:{s:7,c:0},area:['rust_city'],icon:'⚔️'},
  'sea_monster':{name:'海獸',lv:6,hp:85,stats:{武力:28,知力:12},drops:['海獸牙','深海珊瑚'],exp:38,gold:{s:5,c:0},area:['east_port','coral_bay','fog_sea_pass'],icon:'🦑'},
  'fire_elemental':{name:'火焰精靈',lv:7,hp:75,stats:{武力:20,知力:35},drops:['火焰結晶','紅寶石'],exp:42,gold:{s:6,c:0},area:['dragon_valley'],icon:'🔥'},
  'ice_elemental':{name:'冰霜精靈',lv:7,hp:75,stats:{武力:18,知力:38},drops:['冰霜結晶','藍寶石'],exp:42,gold:{s:6,c:0},area:['frost_keep'],icon:'❄️'},
  'forest_guardian':{name:'森之守衛',lv:8,hp:130,stats:{武力:30,知力:35},drops:['精靈木','世界樹果實'],exp:55,gold:{s:8,c:0},area:['jade_forest','elder_grove'],icon:'🌳'},
  'shadow_assassin':{name:'暗影刺客',lv:9,hp:95,stats:{武力:42,知力:30},drops:['暗影精華','暗殺匕首'],exp:65,gold:{s:10,c:0},area:['shadow_marsh','rust_city'],icon:'🗡️'},
  'wyvern':{name:'飛龍',lv:11,hp:180,stats:{武力:48,知力:25},drops:['龍鱗','龍牙'],exp:90,gold:{s:15,c:0},area:['dragon_valley','crown_peak'],icon:'🐲'},
  'lich':{name:'巫妖',lv:12,hp:160,stats:{武力:25,知力:55},drops:['暗影精華','虛無之塵','巫妖法杖'],exp:110,gold:{s:20,c:0},area:['rust_city'],icon:'💀'},
  // ── 更多BOSS ──
  'frost_wyrm':{name:'霜龍',lv:13,hp:350,stats:{武力:55,知力:40},drops:['冰霜結晶','龍鱗','龍骨劍'],exp:200,gold:{g:3,s:0,c:0},area:['frost_keep'],boss:true,icon:'🐉'},
  'shadow_lord':{name:'暗影領主',lv:14,hp:400,stats:{武力:50,知力:55},drops:['暗影精華','虛無之塵','暗影劍'],exp:250,gold:{g:4,s:0,c:0},area:['shadow_marsh'],boss:true,icon:'👁️'},
  'forest_king':{name:'森林之王',lv:11,hp:280,stats:{武力:40,知力:45},drops:['世界樹果實','精靈木','翠林之杖'],exp:180,gold:{g:2,s:50,c:0},area:['elder_grove'],boss:true,icon:'🌲'},
  'merchant_king':{name:'黃金海盜王',lv:12,hp:320,stats:{武力:45,知力:35},drops:['海軍彎刀','鑽石','海圖'],exp:200,gold:{g:5,s:0,c:0},area:['coral_bay'],boss:true,icon:'🏴‍☠️'},
};

// ═══ QUEST DATABASE ═══
const QUEST_DB={
  // ── 主線任務 ──
  main_001:{title:'鐵霧城的第一夜',type:'主線',chapter:1,
    desc:'你剛抵達鐵霧城，需要找到食物和住處。探索這座被濃霧籠罩的工業城市。',
    objectives:['在鐵霧城找到住處','探索城市收集情報'],
    rewards:{gd:{g:0,s:5,c:0},exp:20},
    triggerArea:'iron_fog',autoTrigger:true},
  main_002:{title:'霧刃幫的陰影',type:'主線',chapter:1,
    desc:'霧刃幫在山口地帶橫行，劫掠商隊。城裡到處是懸賞令。也許這是賺錢的機會——或者是麻煩的開始。',
    objectives:['調查霧刃幫的活動','找到霧刃幫據點的線索','決定是否介入'],
    rewards:{gd:{g:0,s:20,c:0},exp:50,items:['霧刃幫徽章']},
    triggerArea:'iron_fog',prereq:'main_001'},
  main_003:{title:'碼頭的秘密',type:'主線',chapter:1,
    desc:'碼頭區似乎不只是卸貨的地方。夜晚有可疑的活動，倉庫老闆葛林知道些什麼。',
    objectives:['調查碼頭區的可疑活動','與倉庫老闆葛林交談'],
    rewards:{gd:{g:0,s:15,c:0},exp:40},
    triggerArea:'iron_fog',prereq:'main_002'},
  main_004:{title:'通往銀月的路',type:'主線',chapter:2,
    desc:'鐵霧城的謎團暫告一段落。前方有更大的世界等待探索——銀月城，大陸最大的商業都市。',
    objectives:['前往霧山驛站','購買前往銀月城的通行手段','抵達銀月城'],
    rewards:{gd:{g:0,s:30,c:0},exp:60},
    triggerArea:'iron_fog',prereq:'main_003'},
  main_005:{title:'銀月城的英雄公會',type:'主線',chapter:2,
    desc:'銀月城是各路英雄匯聚之地。英雄公會也許能提供更多關於108星辰的線索。',
    objectives:['前往英雄公會','與公會長馬庫斯交談','接受公會任務證明實力'],
    rewards:{gd:{g:0,s:50,c:0},exp:80,items:['英雄公會徽章']},
    triggerArea:'silver_moon',prereq:'main_004'},
  main_006:{title:'星辰的迴響',type:'主線',chapter:2,
    desc:'橘子越來越頻繁地感知到星辰氣息。銀月城的星象館也許能解答一些疑問。',
    objectives:['前往銀月城星象館','調查108星的降世記錄','尋找北斗星先行者的線索'],
    rewards:{gd:{g:0,s:40,c:0},exp:100,items:['北斗星碎片・壹']},
    triggerArea:'silver_moon',prereq:'main_005'},
  main_007:{title:'東海的呼喚',type:'主線',chapter:3,
    desc:'線索指向東港城。商人公會掌握著大量情報，但獲取情報需要代價。',
    objectives:['前往東港城','接觸商人公會','找到情報屋「烏鴉」'],
    rewards:{gd:{g:1,s:0,c:0},exp:120},
    triggerArea:'east_port',prereq:'main_006'},
  main_008:{title:'翠林的守護者',type:'主線',chapter:3,
    desc:'精靈長老艾蕾恩或許知道108星辰與真紋章的關係。但要進入翠林域需要通行證。',
    objectives:['取得翠林通行證','前往翠林城','拜訪精靈長老'],
    rewards:{gd:{g:0,s:80,c:0},exp:150,items:['精靈長老的祝福']},
    triggerArea:'jade_forest',prereq:'main_007'},
  main_009:{title:'帝國的殘影',type:'主線',chapter:4,
    desc:'鏽城——曾經的帝都，如今的廢墟。帝國殘軍盤據於此，時間裂縫也在此出現。',
    objectives:['前往鏽城','調查帝國遺跡','面對帝國亡靈'],
    rewards:{gd:{g:2,s:0,c:0},exp:200,items:['時間裂縫結晶']},
    triggerArea:'rust_city',prereq:'main_008'},
  main_010:{title:'龍牙砦的試煉',type:'主線',chapter:4,
    desc:'南荒的龍牙砦深處，傳說藏有遠古巨龍的寶庫——以及炎獄真紋章。',
    objectives:['前往龍牙砦','探索古龍遺跡','面對遠古巨龍'],
    rewards:{gd:{g:5,s:0,c:0},exp:300,items:['古龍之鱗']},
    triggerArea:'dragon_valley',prereq:'main_009'},

  // ── 支線任務 ──
  side_fog_01:{title:'礦工的苦衷',type:'支線',
    desc:'鐵冠城的礦工們在苛刻的條件下工作。有人想逃離，但逃離意味著成為通緝犯。',
    objectives:['與礦工聚落交談','決定是否幫助礦工逃離'],
    rewards:{gd:{g:0,s:15,c:0},exp:30},
    triggerArea:'iron_crown'},
  side_fog_02:{title:'走私者的請求',type:'支線',
    desc:'灰港鎮有人想僱你運送一批「貨物」。報酬豐厚，但合法性可疑。',
    objectives:['前往灰港走私碼頭','檢查貨物內容','決定是否接受委託'],
    rewards:{gd:{g:0,s:30,c:0},exp:35},
    triggerArea:'grey_haven'},
  side_moon_01:{title:'失蹤的學徒',type:'支線',
    desc:'銀月城一名術士學徒失蹤了。他的師父懸賞尋人——但似乎隱瞞了什麼。',
    objectives:['接受尋人委託','調查學徒的去向','找到學徒或他的遺物'],
    rewards:{gd:{g:0,s:25,c:0},exp:45,items:['符文短杖']},
    triggerArea:'silver_moon'},
  side_port_01:{title:'海盜的寶藏',type:'支線',
    desc:'珊瑚灣附近沉了一艘海盜船。據說船上有一批珍貴的貨物——但海域危險。',
    objectives:['在東港打聽沉船位置','前往珊瑚灣','潛入沉船取回寶藏'],
    rewards:{gd:{g:1,s:0,c:0},exp:60,items:['珊瑚弓']},
    triggerArea:'east_port'},
  side_forest_01:{title:'禁忌的知識',type:'支線',
    desc:'古樹隱村的禁忌書庫裡有關於真紋章的記載。但精靈長老禁止外人閱覽。',
    objectives:['取得精靈長老的許可','進入禁忌書庫','閱讀紋章相關記載'],
    rewards:{gd:{g:0,s:50,c:0},exp:80,items:['帝國占星師手記']},
    triggerArea:'elder_grove'},
  side_frost_01:{title:'騎士的誓言',type:'支線',
    desc:'霜守堡的騎士團長尋求幫助。北方有不尋常的怪物出沒，與真紋章有關。',
    objectives:['與騎士團長交談','調查北方異常','擊敗霜域怪物'],
    rewards:{gd:{g:0,s:40,c:0},exp:70,items:['霜守堡騎士徽章']},
    triggerArea:'frost_keep'},
  side_marsh_01:{title:'毒蛛的交易',type:'支線',
    desc:'影沼鎮的藥師梅拉有一筆特殊的交易。她需要稀有的素材，作為回報她會提供珍貴的藥物。',
    objectives:['與藥師梅拉交談','收集沼澤深處的稀有素材','交付素材獲得報酬'],
    rewards:{gd:{g:0,s:20,c:0},exp:40,items:['世界樹樹液']},
    triggerArea:'shadow_marsh'},
  side_sand_01:{title:'沙獵的考驗',type:'支線',
    desc:'南荒獵人莉拉願意成為你的嚮導，但首先你必須通過她的考驗。',
    objectives:['接受莉拉的考驗','在南荒生存三天','擊敗沙蟲'],
    rewards:{gd:{g:0,s:35,c:0},exp:55,items:['影沼地圖']},
    triggerArea:'sand_gate'},

  // ── 重複任務 ──
  rep_bounty:{title:'懸賞任務',type:'重複',
    desc:'各地懸賞令上的任務。可重複接受。',
    objectives:['完成一次懸賞'],
    rewards:{gd:{g:0,s:5,c:0},exp:15},
    repeatable:true,triggerArea:'all'},
  rep_gather:{title:'素材收集',type:'重複',
    desc:'商人公會需要各種素材。帶回素材可獲得報酬。',
    objectives:['收集指定素材3個'],
    rewards:{gd:{g:0,s:8,c:0},exp:10},
    repeatable:true,triggerArea:'all'},
};

// ═══ COMBAT SYSTEM ═══
const STATUS_EFFECTS={
  poison:{name:'中毒',icon:'☠️',dot:5,dur:3,desc:'每回合損失HP'},
  burn:{name:'灼燒',icon:'🔥',dot:8,dur:2,desc:'每回合損失HP'},
  freeze:{name:'冰凍',icon:'❄️',dur:1,skipTurn:true,desc:'無法行動'},
  blind:{name:'致盲',icon:'🌑',dur:2,hitPenalty:5,desc:'命中率降低'},
  stun:{name:'暈眩',icon:'💫',dur:1,skipTurn:true,desc:'無法行動'},
  regen:{name:'再生',icon:'💚',dot:-10,dur:3,desc:'每回合回復HP'},
  shield:{name:'護盾',icon:'🛡️',dur:2,defBonus:10,desc:'防禦力提升'},
  rage:{name:'狂暴',icon:'💢',dur:3,atkBonus:8,defPenalty:5,desc:'攻擊力提升但防禦降低'},
};
let _combat=null;
function startCombat(enemyIds,isBoss){
  if(_combat)return;
  BGM.setMood('battle');if(BGM.playing){BGM.stop();BGM.start();}
  const enemies=enemyIds.map((eid,i)=>{
    const tmpl=ENEMY_DB[eid];if(!tmpl)return null;
    return{id:eid+'_'+i,templateId:eid,name:tmpl.name,icon:tmpl.icon||'👹',hp:tmpl.hp,maxHp:tmpl.hp,stats:{...tmpl.stats},drops:[...(tmpl.drops||[])],exp:tmpl.exp||0,gold:{...(tmpl.gold||{s:0,c:0})},lv:tmpl.lv||1,boss:tmpl.boss||isBoss||false,buffs:[]};
  }).filter(Boolean);
  if(!enemies.length)return;
  const party=allParty().filter(m=>m.id!=='orange').map(m=>{
    const es=getEffectiveStats(m.id);const hp=getHP(m.id);
    return{id:m.id,name:m.name,emoji:m.emoji||'😒',hp:hp.cur,maxHp:hp.max,formation:G.formation[m.id]||'front',stats:es,buffs:[],defended:false,isPlayer:true};
  });
  if(!party.length)return;
  _combat={enemies,party,round:1,turnIdx:0,turnOrder:[],phase:'start',log:[],totalExp:enemies.reduce((a,e)=>a+e.exp,0),totalGold:enemies.reduce((a,e)=>({g:(a.g||0)+(e.gold.g||0),s:(a.s||0)+(e.gold.s||0),c:(a.c||0)+(e.gold.c||0)}),{g:0,s:0,c:0}),allDrops:enemies.flatMap(e=>e.drops),isBoss:enemies.some(e=>e.boss)};
  const all=[...party.map(p=>({...p,_init:Math.floor((p.stats.幸運||0)/5)+Math.floor(Math.random()*6)+1})),...enemies.map(e=>({...e,_init:Math.floor((e.stats.知力||5)/5)+Math.floor(Math.random()*6)+1}))];
  all.sort((a,b)=>b._init-a._init);
  _combat.turnOrder=all.map(a=>a.id);_combat.phase='player_turn';_combat.turnIdx=0;
  advanceTurn();openCombatModal();renderCombat();
}
function advanceTurn(){
  if(!_combat)return;
  for(let i=0;i<_combat.turnOrder.length*2;i++){
    const id=_combat.turnOrder[_combat.turnIdx%_combat.turnOrder.length];const unit=getCombatUnit(id);
    if(unit&&unit.hp>0){const skip=unit.buffs.find(b=>STATUS_EFFECTS[b.id]?.skipTurn);
      if(skip){addCombatLog(`${unit.name} ${STATUS_EFFECTS[skip.id].icon} ${STATUS_EFFECTS[skip.id].name}中，無法行動！`);_combat.turnIdx++;continue;}
      _combat.phase=unit.isPlayer?'player_turn':'enemy_turn';return;}
    _combat.turnIdx++;
  }
}
function getCombatUnit(id){if(!_combat)return null;return _combat.party.find(p=>p.id===id)||_combat.enemies.find(e=>e.id===id);}
function getCurrentTurnUnit(){if(!_combat)return null;const id=_combat.turnOrder[_combat.turnIdx%_combat.turnOrder.length];return getCombatUnit(id);}
function addCombatLog(text){if(!_combat)return;_combat.log.push(text);if(_combat.log.length>50)_combat.log.shift();}
function processTurnStart(unit){
  if(!unit)return;const expiredBuffs=[];
  unit.buffs.forEach(b=>{const eff=STATUS_EFFECTS[b.id];if(!eff)return;
    if(eff.dot){unit.hp=Math.max(0,Math.min(unit.maxHp,unit.hp-eff.dot));
      if(eff.dot>0)addCombatLog(`${unit.name} 受到 ${eff.icon}${eff.name} 傷害 -${eff.dot} HP`);
      else addCombatLog(`${unit.name} ${eff.icon}${eff.name} 回復 +${-eff.dot} HP`);}
    b.dur--;if(b.dur<=0)expiredBuffs.push(b.id);});
  unit.buffs=unit.buffs.filter(b=>!expiredBuffs.includes(b.id));
  if(expiredBuffs.length){expiredBuffs.forEach(id=>{const eff=STATUS_EFFECTS[id];if(eff)addCombatLog(`${unit.name} 的 ${eff.name} 效果消失了`);});}
  unit.defended=false;
}
function combatAttack(targetId){
  if(!_combat||_combat.phase!=='player_turn')return;
  const _cur=getCurrentTurnUnit();
  if(_cur&&_cur.isPlayer&&!_cur._turnProcessed){_cur._turnProcessed=true;processTurnStart(_cur);}
  const attacker=getCurrentTurnUnit();const target=getCombatUnit(targetId);
  if(!attacker||!target||target.hp<=0)return;
  const atkStat=attacker.stats.武力||10;const defStat=Math.floor((target.stats.統率||target.stats.武力||10)/3);
  const atkBonus=attacker.buffs.reduce((a,b)=>a+(STATUS_EFFECTS[b.id]?.atkBonus||0),0);
  const hitPenalty=attacker.buffs.reduce((a,b)=>a+(STATUS_EFFECTS[b.id]?.hitPenalty||0),0);
  const roll=Math.floor(Math.random()*20)+1;const hitMod=Math.floor(atkStat/10)-hitPenalty;const hitTotal=roll+hitMod;const crit=roll===20;const fumble=roll===1;
  if(fumble){addCombatLog(`${attacker.name} 🎲${roll} 大失敗！攻擊落空！`);}
  else if(hitTotal<8+Math.floor(target.lv||1)){addCombatLog(`${attacker.name} 🎲${roll}+${hitMod}=${hitTotal} 未命中 ${target.name}！`);}
  else{let dmg=Math.max(1,Math.floor(atkStat/3)+Math.floor(Math.random()*6)+1+atkBonus-defStat);
    if(attacker.formation==='front')dmg=Math.floor(dmg*1.2); // Front row +20% damage
    if(attacker.formation==='back')dmg=Math.floor(dmg*0.8); // Back row -20% damage
    if(target.defended)dmg=Math.floor(dmg*0.5);const defBonus=target.buffs.reduce((a,b)=>a+(STATUS_EFFECTS[b.id]?.defBonus||0),0);dmg=Math.max(1,dmg-defBonus);if(crit)dmg=dmg*2;
    target.hp=Math.max(0,target.hp-dmg);addCombatLog(`${attacker.name} 🎲${roll}${crit?' 暴擊！':''} → ${target.name} 受到 ${dmg} 傷害${target.hp<=0?' 💀 擊敗！':` (HP:${target.hp}/${target.maxHp})`}`);}
  endPlayerTurn();
}
function combatDefend(){if(!_combat||_combat.phase!=='player_turn')return;const unit=getCurrentTurnUnit();if(!unit)return;unit.defended=true;addCombatLog(`${unit.name} 進入防禦姿態（傷害減半）`);endPlayerTurn();}
function combatUseItem(itemName){
  if(!_combat||_combat.phase!=='player_turn')return;const unit=getCurrentTurnUnit();if(!unit)return;const data=ITEM_DB[itemName];if(!data)return;
  if(data.effect?.hp){unit.hp=Math.min(unit.maxHp,unit.hp+data.effect.hp);addCombatLog(`${unit.name} 使用 ${itemName}：HP +${data.effect.hp} (HP:${unit.hp}/${unit.maxHp})`);}
  else if(data.effect?.buff){const buffId=data.effect.buff;if(STATUS_EFFECTS[buffId]){unit.buffs.push({id:buffId,dur:STATUS_EFFECTS[buffId].dur});addCombatLog(`${unit.name} 使用 ${itemName}：獲得 ${STATUS_EFFECTS[buffId].icon}${STATUS_EFFECTS[buffId].name}`);}}
  else{addCombatLog(`${unit.name} 使用了 ${itemName}`);}
  const inv=getInv();const idx=inv.items.findIndex(i=>i.n===itemName);
  if(idx>=0){const item=inv.items[idx];const qm=item.q.match(/(\d+)/);const qty=qm?parseInt(qm[1]):1;if(qty<=1)inv.items.splice(idx,1);else item.q='×'+(qty-1);}
  endPlayerTurn();
}
function combatMagicAttack(){
  if(!_combat||_combat.phase!=='player_turn')return;
  const attacker=getCurrentTurnUnit();
  if(!attacker)return;
  const intStat=attacker.stats.知力||10;
  if(intStat<20){addCombatLog('知力不足，無法使用魔法');renderCombat();return;}

  // Magic hits all enemies for knowledge-based damage
  const roll=Math.floor(Math.random()*20)+1;
  const crit=roll===20;
  const fumble=roll===1;

  if(fumble){
    addCombatLog(`${attacker.name} 🎲${roll} 魔法失控！`);
  }else{
    _combat.enemies.forEach(e=>{
      if(e.hp<=0)return;
      let dmg=Math.max(1,Math.floor(intStat/4)+Math.floor(Math.random()*4)+1);
      if(crit)dmg=dmg*2;
      e.hp=Math.max(0,e.hp-dmg);
      addCombatLog(`${attacker.name} ✦魔法${crit?' 暴擊！':''} → ${e.name} ${dmg} 傷害${e.hp<=0?' 💀':''}`);
    });
  }
  endPlayerTurn();
}
function combatFlee(){
  if(!_combat||_combat.phase!=='player_turn')return;const unit=getCurrentTurnUnit();if(!unit)return;
  if(_combat.isBoss){addCombatLog('⚠ BOSS戰無法逃跑！');renderCombat();return;}
  const roll=Math.floor(Math.random()*20)+1;const mod=Math.floor((unit.stats.幸運||10)/10);const maxEnemyLv=Math.max(..._combat.enemies.map(e=>e.lv||1));
  if(roll+mod>=8+maxEnemyLv){addCombatLog(`${unit.name} 成功逃脫！`);endCombat('flee');return;}
  addCombatLog(`${unit.name} 🎲${roll}+${mod}=${roll+mod} 逃跑失敗！`);endPlayerTurn();
}
function endPlayerTurn(){if(!_combat)return;if(_combat.enemies.every(e=>e.hp<=0)){endCombat('victory');return;}_combat.turnIdx++;
  // New round check
  if(_combat.turnIdx % _combat.turnOrder.length === 0) _combat.round++;
  const _next=getCombatUnit(_combat.turnOrder[_combat.turnIdx % _combat.turnOrder.length]);
  if(_next)_next._turnProcessed=false;
  advanceTurn();renderCombat();if(_combat&&_combat.phase==='enemy_turn'){setTimeout(executeEnemyTurn,800);}}
function executeEnemyTurn(){
  if(!_combat||_combat.phase!=='enemy_turn')return;const enemy=getCurrentTurnUnit();
  if(!enemy||enemy.hp<=0){_combat.turnIdx++;advanceTurn();renderCombat();return;}
  processTurnStart(enemy);
  if(enemy.hp<=0){addCombatLog(`${enemy.name} 被狀態效果擊敗！💀`);if(_combat.enemies.every(e=>e.hp<=0)){endCombat('victory');return;}_combat.turnIdx++;advanceTurn();renderCombat();return;}
  const alive=_combat.party.filter(p=>p.hp>0);if(!alive.length){endCombat('defeat');return;}
  const frontRow=alive.filter(p=>p.formation!=='back');
  const target=frontRow.length?frontRow.reduce((a,b)=>a.hp<b.hp?a:b):alive.reduce((a,b)=>a.hp<b.hp?a:b);
  const atkStat=enemy.stats.武力||10;const defStat=Math.floor((target.stats.統率||10)/3);const roll=Math.floor(Math.random()*20)+1;const crit=roll===20;
  if(roll===1){addCombatLog(`${enemy.icon} ${enemy.name} 🎲1 攻擊落空！`);}
  else{let dmg=Math.max(1,Math.floor(atkStat/3)+Math.floor(Math.random()*4)+1-defStat);if(target.defended)dmg=Math.floor(dmg*0.5);
    if(target.formation==='back')dmg=Math.floor(dmg*0.7); // Back row takes 30% less
    const defBonus=target.buffs.reduce((a,b)=>a+(STATUS_EFFECTS[b.id]?.defBonus||0),0);dmg=Math.max(1,dmg-defBonus);if(crit)dmg=dmg*2;target.hp=Math.max(0,target.hp-dmg);addCombatLog(`${enemy.icon} ${enemy.name} → ${target.name} ${crit?'暴擊！':''}${dmg} 傷害${target.hp<=0?' 💀':` (HP:${target.hp}/${target.maxHp})`}`);
    // Status effect chance based on enemy type
    const tmpl=ENEMY_DB[enemy.templateId];
    if(tmpl&&target.hp>0){
      if(enemy.templateId==='snake'||enemy.templateId==='lizardman'){
        if(Math.random()<0.3){target.buffs.push({id:'poison',dur:3});addCombatLog(`${target.name} 被毒液命中！☠️ 中毒`);}
      }else if(enemy.templateId==='fire_elemental'||enemy.templateId==='dragon_spawn'||enemy.templateId==='ancient_dragon'){
        if(Math.random()<0.25){target.buffs.push({id:'burn',dur:2});addCombatLog(`${target.name} 被火焰灼燒！🔥`);}
      }else if(enemy.templateId==='ice_elemental'||enemy.templateId==='ice_wolf'||enemy.templateId==='frost_wyrm'){
        if(Math.random()<0.2){target.buffs.push({id:'freeze',dur:1});addCombatLog(`${target.name} 被冰凍！❄️`);}
      }else if(enemy.templateId==='ghost'||enemy.templateId==='lich'){
        if(Math.random()<0.2){target.buffs.push({id:'blind',dur:2});addCombatLog(`${target.name} 被黑暗籠罩！🌑 致盲`);}
      }else if(enemy.templateId==='cave_troll'||enemy.templateId==='marsh_golem'){
        if(Math.random()<0.25){target.buffs.push({id:'stun',dur:1});addCombatLog(`${target.name} 被震暈！💫`);}
      }
    }
  }
  if(_combat.party.every(p=>p.hp<=0)){endCombat('defeat');return;}
  _combat.turnIdx++;advanceTurn();renderCombat();if(_combat&&_combat.phase==='enemy_turn'){setTimeout(executeEnemyTurn,800);}
}
function endCombat(result){
  if(!_combat)return;_combat.phase=result;
  if(result==='victory'){
    addCombatLog('═══ 戰鬥勝利！ ═══');
    G._battleCount=(G._battleCount||0)+1;
    if(_combat.isBoss)G._bossKills=(G._bossKills||0)+1;
    const gold=_combat.totalGold;
    if(gold.g||gold.s||gold.c){applyGold(gold);addCombatLog(`💰 獲得 ${priceStr(gold)}`);}
    const exp=_combat.totalExp;if(exp){addCombatLog(`✦ 經驗值 +${exp}`);if(typeof grantExp==='function')grantExp(G.partyIds.filter(id=>id!=='orange'),exp);}
    const drops=[];_combat.allDrops.forEach(dropName=>{if(Math.random()<0.5){const inv=getInv();const exist=inv.items.find(i=>i.n===dropName);if(exist){const m=exist.q.match(/(\d+)/);exist.q='×'+((m?parseInt(m[1]):1)+1);}else{const db=ITEM_DB[dropName];inv.items.push({n:dropName,t:db?.t||'',q:'×1'});}drops.push(dropName);}});
    if(drops.length)addCombatLog(`📦 掉落：${drops.join('、')}`);
    _combat.party.forEach(p=>{if(G.hp[p.id])G.hp[p.id].cur=p.hp;else G.hp[p.id]={cur:p.hp,max:p.maxHp};});
    renderCombat();saveGame();renderChanged('inv','party');
    setTimeout(()=>{closeCombatModal();const enemies=_combat?_combat.enemies.map(e=>e.name).join('、'):'';const rounds=_combat?_combat.round:0;const summary=`【戰鬥結束・勝利】經過${rounds}回合激戰，擊敗了${enemies}。獲得${priceStr(gold)}${exp?' 經驗+'+exp:''}${drops.length?' 掉落：'+drops.join('、'):''}。請描述勝利場景並繼續劇情，給出行動選項。`;_combat=null;BGM.setMood('explore');sendChoice(summary);},3000);
  }else if(result==='defeat'){
    addCombatLog('═══ 戰鬥失敗⋯⋯ ═══');
    G._defeatCount=(G._defeatCount||0)+1;
    _combat.party.forEach(p=>{if(G.hp[p.id])G.hp[p.id].cur=1;else G.hp[p.id]={cur:1,max:p.maxHp};});renderCombat();saveGame();
    setTimeout(()=>{closeCombatModal();const defeatEnemies=_combat?_combat.enemies.map(e=>e.name).join('、'):'';_combat=null;BGM.setMood('explore');sendChoice(`【戰鬥結束・敗北】與${defeatEnemies}的戰鬥中落敗。艾爾法重傷倒下，橘子拖著她離開了危險區域。所有人HP殘存1。請描述艱難的敗退場景，讓氣氛沉重但留有希望，然後給出行動選項。`);},2500);
  }else if(result==='flee'){
    renderCombat();setTimeout(()=>{closeCombatModal();_combat=null;BGM.setMood('explore');sendChoice('【戰鬥結束・逃跑】艾爾法成功逃離了戰鬥。請繼續劇情。');},1500);
  }
}
function renderCombat(){
  const modal=document.getElementById('combat-modal');if(!modal||!_combat)return;const c=_combat;const currentUnit=getCurrentTurnUnit();const isPlayerTurn=c.phase==='player_turn'&&currentUnit?.isPlayer;
  const enemyHtml=c.enemies.map(e=>{const hpPct=Math.round(e.hp/e.maxHp*100);const dead=e.hp<=0;const buffs=e.buffs.map(b=>STATUS_EFFECTS[b.id]?.icon||'').join('');
    return'<div style="text-align:center;opacity:'+(dead?.3:1)+';flex:1;min-width:60px;"><div style="font-size:1.4rem;">'+e.icon+'</div><div style="font-size:.58rem;color:'+(e.boss?'#ff6060':'var(--sil)')+';font-weight:'+(e.boss?700:400)+'">'+e.name+(e.boss?' ★':'')+'</div><div style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin:.15rem 0;overflow:hidden;"><div style="width:'+hpPct+'%;height:100%;background:'+(hpPct>50?'#4caf7a':hpPct>25?'#e08c35':'#cc4444')+';border-radius:2px;transition:width .3s;"></div></div><div style="font-size:.48rem;color:var(--sild);">'+(dead?'💀 擊敗':e.hp+'/'+e.maxHp)+' '+buffs+'</div>'+(isPlayerTurn&&!dead?'<button onclick="combatAttack(\''+e.id+'\')" style="margin-top:.2rem;font-size:.52rem;padding:.15rem .35rem;background:rgba(204,68,68,.15);border:1px solid rgba(204,68,68,.4);border-radius:2px;color:#cc6666;cursor:pointer;">⚔ 攻擊</button>':'')+'</div>';}).join('');
  const partyHtml=c.party.map(p=>{const hpPct=Math.round(p.hp/p.maxHp*100);const dead=p.hp<=0;const isCurrent=currentUnit?.id===p.id;const buffs=p.buffs.map(b=>STATUS_EFFECTS[b.id]?.icon||'').join('');
    return'<div style="text-align:center;flex:1;min-width:60px;opacity:'+(dead?.3:1)+';'+(isCurrent?'border:1px solid var(--goldd);border-radius:4px;padding:.2rem;background:rgba(201,168,76,.08);':'padding:.2rem;')+'"><div style="font-size:.9rem;">'+p.emoji+'</div><div style="font-size:.56rem;color:var(--sil);">'+p.name+(p.defended?' 🛡️':'')+'</div><div style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin:.15rem 0;overflow:hidden;"><div style="width:'+hpPct+'%;height:100%;background:'+(hpPct>50?'#4caf7a':hpPct>25?'#e08c35':'#cc4444')+';border-radius:2px;transition:width .3s;"></div></div><div style="font-size:.48rem;color:var(--sild);">'+(dead?'💀':p.hp+'/'+p.maxHp)+' '+buffs+'</div></div>';}).join('');
  let actHtml='';
  if(isPlayerTurn){const inv=getInv();const usable=inv.items.filter(i=>{const db=ITEM_DB[i.n];return db&&(db.effect?.hp||db.effect?.buff||db.effect?.cure);}).slice(0,6);
    const itemBtns=usable.map(i=>'<button onclick="combatUseItem(\''+i.n.replace(/'/g,"\\'")+'\') " style="font-size:.5rem;padding:.12rem .25rem;background:rgba(100,180,100,.1);border:1px solid rgba(100,180,100,.3);border-radius:2px;color:#6ab46a;cursor:pointer;">'+(ITEM_DB[i.n]?.icon||'')+' '+i.n+'</button>').join('');
    actHtml='<div style="display:flex;flex-wrap:wrap;gap:.3rem;justify-content:center;padding:.3rem 0;">'+((currentUnit.stats.知力||0)>=20?'<button onclick="combatMagicAttack()" style="font-size:.55rem;padding:.2rem .5rem;background:rgba(130,100,200,.12);border:1px solid rgba(130,100,200,.4);border-radius:3px;color:rgba(160,130,230,.9);cursor:pointer;font-family:\'Noto Serif TC\',serif;">✦ 魔法</button>':'')+'<button onclick="combatDefend()" style="font-size:.55rem;padding:.2rem .5rem;background:rgba(100,130,200,.12);border:1px solid rgba(100,130,200,.4);border-radius:3px;color:#88aacc;cursor:pointer;">🛡️ 防禦</button><button onclick="combatFlee()" style="font-size:.55rem;padding:.2rem .5rem;background:rgba(180,160,80,.1);border:1px solid rgba(180,160,80,.4);border-radius:3px;color:var(--goldd);cursor:pointer;">🏃 逃跑</button></div>'+(usable.length?'<div style="display:flex;flex-wrap:wrap;gap:.2rem;justify-content:center;padding:.15rem 0;">'+itemBtns+'</div>':'');}
  const logHtml=c.log.slice(-8).map(l=>'<div style="font-size:.52rem;color:var(--sild);line-height:1.4;padding:.06rem 0;">'+l+'</div>').join('');
  let resultHtml='';
  if(c.phase==='victory')resultHtml='<div style="text-align:center;padding:.5rem;color:#6ab46a;font-size:.8rem;font-weight:700;letter-spacing:.1em;">✦ 勝利 ✦</div>';
  else if(c.phase==='defeat')resultHtml='<div style="text-align:center;padding:.5rem;color:#cc4444;font-size:.8rem;font-weight:700;letter-spacing:.1em;">✦ 敗北 ✦</div>';
  else if(c.phase==='flee')resultHtml='<div style="text-align:center;padding:.5rem;color:var(--goldd);font-size:.8rem;">逃跑成功</div>';
  document.getElementById('combat-inner').innerHTML='<div style="text-align:center;font-size:.56rem;color:var(--goldd);letter-spacing:.1em;padding:.2rem 0;">⚔ ROUND '+c.round+' ⚔</div><div style="display:flex;gap:.4rem;justify-content:center;padding:.4rem .2rem;border-bottom:1px solid var(--brd);">'+enemyHtml+'</div><div style="display:flex;gap:.4rem;justify-content:center;padding:.4rem .2rem;">'+partyHtml+'</div>'+(isPlayerTurn?'<div style="text-align:center;font-size:.54rem;color:var(--goldl);padding:.15rem 0;">▶ '+currentUnit.name+' 的回合 — 選擇攻擊目標或行動</div>':'')+actHtml+'<div style="max-height:80px;overflow-y:auto;border-top:1px solid var(--brd);padding:.3rem;margin-top:.2rem;">'+logHtml+'</div>'+resultHtml;
}
function openCombatModal(){document.getElementById('combat-modal').classList.add('open');}
function closeCombatModal(){document.getElementById('combat-modal').classList.remove('open');}

// ═══ 隨機事件資料庫 ═══
const EVENT_DB=[
  // ── 戰鬥遭遇 ──
  {id:'goblin_ambush',type:'combat',trigger:'travel',chance:0.12,enemies:['goblin','goblin'],desc:'路邊的灌木叢中突然竄出哥布林！',area:['iron_fog','grey_haven','iron_crown']},
  {id:'wolf_pack',type:'combat',trigger:'travel',chance:0.10,enemies:['wolf','wolf','wolf'],desc:'一群灰狼擋住了去路，牠們的眼中閃著飢餓的光。',area:['iron_fog','iron_crown','frost_keep']},
  {id:'bandit_raid',type:'combat',trigger:'travel',chance:0.08,enemies:['bandit','bandit'],desc:'山賊從岩石後方跳出：「留下錢財，饒你一命！」',area:['iron_fog','grey_haven','sand_gate']},
  {id:'skeleton_patrol',type:'combat',trigger:'travel',chance:0.07,enemies:['skeleton','skeleton'],desc:'一隊骸骨兵在廢墟中巡邏。它們轉向了你。',area:['rust_city']},
  {id:'pirate_attack',type:'combat',trigger:'travel',chance:0.08,enemies:['pirate','pirate'],desc:'海盜從暗處衝出，彎刀上還帶著鏽跡。',area:['east_port','coral_bay','fog_sea_pass']},
  {id:'spider_nest',type:'combat',trigger:'explore',chance:0.10,enemies:['spider','spider','spider'],desc:'你不小心踩破了巨蛛的巢穴！',area:['shadow_marsh','elder_grove']},
  {id:'ice_wolves',type:'combat',trigger:'travel',chance:0.09,enemies:['ice_wolf','ice_wolf'],desc:'霜狼的嚎叫在冰原上迴盪。',area:['frost_keep']},
  {id:'sand_worm_attack',type:'combat',trigger:'travel',chance:0.06,enemies:['sand_worm'],desc:'腳下的沙地突然震動——沙蟲！',area:['dragon_valley','sand_gate']},

  // ── 寶箱/掉落 ──
  {id:'hidden_chest',type:'loot',trigger:'explore',chance:0.10,desc:'在角落發現了一個被遺忘的寶箱。',area:'all'},
  {id:'old_camp',type:'loot',trigger:'travel',chance:0.08,desc:'路邊有一個廢棄的營地，似乎還有些留下的物資。',area:'all'},
  {id:'fallen_merchant',type:'loot',trigger:'travel',chance:0.06,desc:'路邊倒著一輛翻覆的商車，貨物散落一地。',area:['iron_fog','silver_moon','golden_bridge']},

  // ── NPC遭遇 ──
  {id:'lost_traveler',type:'encounter',trigger:'travel',chance:0.08,desc:'路邊有一個迷路的旅人，看起來精疲力竭。',choices:['幫助指路','分享食物','無視走過'],area:'all'},
  {id:'mysterious_merchant',type:'shop',trigger:'travel',chance:0.05,desc:'一個蒙面商人擋住去路：「想看看我的貨物嗎？保證你沒見過。」',area:'all'},
  {id:'fortune_teller',type:'encounter',trigger:'rest',chance:0.07,desc:'一位老占卜師在路邊擺攤：「讓我看看你的命運吧。」',area:['silver_moon','east_port','sand_gate']},
  {id:'wounded_soldier',type:'encounter',trigger:'travel',chance:0.06,desc:'一名受傷的士兵靠在路邊的大石上，傷口還在流血。',choices:['治療他','詢問發生什麼事','離開'],area:['rust_city','frost_keep','iron_crown']},
  {id:'stray_cat',type:'encounter',trigger:'explore',chance:0.08,desc:'一隻流浪貓從暗巷中走出。橘子的耳朵動了動。',area:'all'},

  // ── 橘子/星辰感知 ──
  {id:'orange_sense',type:'story',trigger:'rest',chance:0.10,desc:'橘子忽然耳朵轉動，凝視某個方向。她感知到了什麼。',effect:{clue_hint:true},area:'all'},
  {id:'star_vision',type:'story',trigger:'rest',chance:0.05,desc:'夜空中，某顆星辰閃爍得格外明亮。橘子望著天空，久久不語。',effect:{clue_hint:true},area:'all'},
  {id:'dream_fragment',type:'story',trigger:'rest',chance:0.04,desc:'艾爾法做了一個奇怪的夢。夢中有一個聲音在呼喚——但醒來後什麼都記不清了。',effect:{clue_hint:true},area:'all'},

  // ── 天氣/環境 ──
  {id:'storm',type:'weather',trigger:'travel',chance:0.08,desc:'突如其來的暴風雨迫使你停下腳步。',effect:{time:2},area:['east_port','coral_bay','fog_sea_pass']},
  {id:'thick_fog',type:'weather',trigger:'travel',chance:0.10,desc:'濃霧突然降下，幾乎看不見前方的路。',effect:{time:1},area:['iron_fog','grey_haven','shadow_marsh']},
  {id:'blizzard',type:'weather',trigger:'travel',chance:0.08,desc:'暴風雪席捲而來，必須找地方躲避。',effect:{time:3,hp:-10},area:['frost_keep']},
  {id:'earthquake',type:'weather',trigger:'explore',chance:0.03,desc:'腳下突然劇烈搖晃——地震！',effect:{time:1},area:['dragon_valley','rust_city']},

  // ── 特殊探索 ──
  {id:'old_ruins',type:'explore',trigger:'explore',chance:0.06,desc:'偏離主道後，發現了一處被藤蔓覆蓋的古老廢墟。',area:['rust_city','dragon_valley','elder_grove']},
  {id:'hidden_spring',type:'explore',trigger:'explore',chance:0.07,desc:'在山間發現了一處隱藏的溫泉。泉水散發著微微的魔力光芒。',effect:{hp:30},area:['jade_forest','frost_keep','crown_peak']},
];

// 城市資料（16座城市）
const MAP_CITIES={
  // ═══ 霧山聯邦 ═══
  iron_fog:{name:'鐵霧城',cx:175,cy:215,size:7,kingdom:'fog_mt',desc:'霧山聯邦工業重城，終年霧不散。代理城主：恩佐·卡羅。',keywords:['鐵霧城'],
    pois:[{name:'港口區・倉庫',icon:'⚓',type:'port',x:110,y:265,desc:'葛林的倉庫，可接搬運工作。'},{name:'中央廣場',icon:'📋',type:'plaza',x:200,y:178,desc:'公告欄，懸賞令張貼處。'},{name:'城衛隊本部',icon:'🛡️',type:'guard',x:295,y:148,desc:'代理城主恩佐駐守。'},{name:'鐵鎚旅館',icon:'🍺',type:'inn',x:158,y:150,desc:'休息・打聽情報・補給。'},{name:'武器修繕鋪',icon:'⚒️',type:'shop',x:255,y:245,desc:'裝備維修・輕型武器。'},{name:'雜貨商行',icon:'🎒',type:'shop',x:328,y:218,desc:'乾糧・繃帶・基本補給。'},{name:'霧山驛站',icon:'🐎',type:'waystation',x:225,y:310,desc:'可購買驛馬前往其他城市。',waystation:true},{name:'霧刃幫據點',icon:'⚠️',type:'danger',x:385,y:290,desc:'山口附近活動，位置不確定。'},{name:'鐵霧傭兵公會',icon:'⚔️',type:'guild',x:230,y:180,desc:'懸賞任務・傭兵招募。'}]},
  iron_crown:{name:'鐵冠城',cx:120,cy:120,size:5,kingdom:'fog_mt',desc:'霧山聯邦北方要塞，守備嚴密，礦脈豐富。',keywords:['鐵冠城'],
    pois:[{name:'要塞城門',icon:'🏰',type:'guard',x:200,y:160,desc:'戒備森嚴，需通關令。'},{name:'礦工聚落',icon:'⛏️',type:'district',x:300,y:240,desc:'採礦工人居住區。'},{name:'北驛',icon:'🐎',type:'waystation',x:370,y:170,desc:'前往鐵霧城或銀月城。',waystation:true},{name:'鐵冠武器鋪',icon:'⚔️',type:'shop',x:150,y:200,desc:'精鋼武器・礦區特供。'},{name:'礦區雜貨',icon:'🎒',type:'shop',x:250,y:280,desc:'礦工補給品。'},{name:'鐵冠旅館',icon:'🍺',type:'inn',x:350,y:200,desc:'礦工與行商休息處。'}]},
  grey_haven:{name:'灰港鎮',cx:90,cy:185,size:4,kingdom:'fog_mt',desc:'霧山聯邦西端漁港，海霧終年不散，走私猖獗。',keywords:['灰港'],
    pois:[{name:'漁市場',icon:'🐟',type:'shop',x:180,y:180,desc:'鮮魚・海產・漁民消息。'},{name:'走私碼頭',icon:'🤫',type:'danger',x:320,y:260,desc:'夜間才開放，危險但有奇貨。'},{name:'灰港客棧',icon:'🍺',type:'inn',x:250,y:200,desc:'漁民與水手聚集。'},{name:'灰港雜貨',icon:'🎒',type:'shop',x:140,y:230,desc:'漁村基本補給。'},{name:'灰港渡口',icon:'🐎',type:'waystation',x:280,y:150,desc:'船運往鐵霧城或影沼鎮。',waystation:true}]},
  // ═══ 中央王國 ═══
  silver_moon:{name:'銀月城',cx:340,cy:148,size:8,kingdom:'central',desc:'中央王國最大商業都市，各路英雄匯聚，情報市場繁盛。',keywords:['銀月城'],
    pois:[{name:'月橋商街',icon:'🏪',type:'shop',x:160,y:170,desc:'各類商品・稀有道具。'},{name:'英雄公會',icon:'⚔️',type:'guild',x:250,y:230,desc:'任務・懸賞・傭兵招募。'},{name:'銀月旅館',icon:'🍺',type:'inn',x:340,y:155,desc:'高級旅館。'},{name:'中央驛站',icon:'🐎',type:'waystation',x:430,y:195,desc:'四通八達。',waystation:true},{name:'星象館',icon:'🔭',type:'special',x:310,y:290,desc:'古老星象機構，與108星辰有關聯。'}]},
  rust_city:{name:'鏽城',cx:360,cy:255,size:6,kingdom:'central',desc:'前帝都廢墟，帝國崩裂後百廢待興。',keywords:['鏽城','廢都'],
    pois:[{name:'廢墟廣場',icon:'🏚️',type:'ruins',x:200,y:165,desc:'帝都昔日中心。'},{name:'殘黨據點',icon:'⚠️',type:'danger',x:350,y:220,desc:'帝國殘黨盤據。'},{name:'地下遺跡',icon:'🕳️',type:'special',x:290,y:295,desc:'古代機關，未知寶藏。'},{name:'廢都驛',icon:'🐎',type:'waystation',x:150,y:250,desc:'破舊但仍運作。',waystation:true},{name:'廢都雜貨',icon:'🎒',type:'shop',x:250,y:200,desc:'拾荒者販售的物資。'},{name:'鏽鐵武器攤',icon:'⚔️',type:'shop',x:150,y:180,desc:'帝國遺物翻新。'},{name:'廢都酒館',icon:'🍺',type:'inn',x:300,y:160,desc:'殘黨與探險者出沒。'}]},
  golden_bridge:{name:'金橋城',cx:400,cy:178,size:5,kingdom:'central',desc:'中央王國東部商貿樞紐，連接東海與內陸的咽喉。',keywords:['金橋城','金橋'],
    pois:[{name:'大橋市集',icon:'🏪',type:'shop',x:200,y:180,desc:'東西貨物交匯，物價公道。'},{name:'稅務署',icon:'📜',type:'guard',x:300,y:230,desc:'中央王國稅收重地。'},{name:'金橋驛',icon:'🐎',type:'waystation',x:380,y:170,desc:'前往銀月城或東港城。',waystation:true},{name:'金橋武器行',icon:'⚔️',type:'shop',x:250,y:220,desc:'東西方武器交匯。'},{name:'金橋旅館',icon:'🍺',type:'inn',x:150,y:200,desc:'商旅歇腳處。'}]},
  crown_peak:{name:'王冠峰',cx:290,cy:105,size:4,kingdom:'central',desc:'中央王國北境要塞，俯瞰翠林域與霧山聯邦交界。',keywords:['王冠峰'],
    pois:[{name:'瞭望塔',icon:'🗼',type:'guard',x:250,y:180,desc:'可遠眺三國邊境。'},{name:'邊境商隊營地',icon:'🏕️',type:'shop',x:350,y:240,desc:'來往商隊補給站。'},{name:'邊境雜貨',icon:'🎒',type:'shop',x:200,y:260,desc:'山上補給有限。'},{name:'瞭望塔客房',icon:'🍺',type:'inn',x:300,y:200,desc:'邊境守軍的休息設施。'},{name:'峰頂驛',icon:'🐎',type:'waystation',x:350,y:150,desc:'往銀月城或翠林城。',waystation:true}]},
  // ═══ 東海王國 ═══
  east_port:{name:'東港城',cx:510,cy:155,size:7,kingdom:'east_sea',desc:'東海王國大港，海貿繁盛，情報人員眾多。',keywords:['東港城'],
    pois:[{name:'東港碼頭',icon:'⚓',type:'port',x:420,y:275,desc:'大型商港，可搭船。'},{name:'商人公會',icon:'💰',type:'guild',x:215,y:175,desc:'情報・任務・走私線索。'},{name:'海鷗旅館',icon:'🍺',type:'inn',x:175,y:240,desc:'各路人馬聚集。'},{name:'武器鋪・波浪',icon:'⚔️',type:'shop',x:305,y:205,desc:'海軍規格武器。'},{name:'東港驛站',icon:'🐎',type:'waystation',x:385,y:155,desc:'前往銀月城或霧海關。',waystation:true},{name:'情報屋',icon:'🕵️',type:'special',x:290,y:290,desc:'地下情報網。'}]},
  fog_sea_pass:{name:'霧海關',cx:545,cy:248,size:5,kingdom:'east_sea',desc:'東海王國南端要塞，控制海上航路。',keywords:['霧海關'],
    pois:[{name:'關卡城門',icon:'🚧',type:'guard',x:200,y:155,desc:'嚴格盤查，需通行證。'},{name:'走私商人',icon:'🤫',type:'special',x:310,y:245,desc:'黑市交易。'},{name:'南海驛',icon:'🐎',type:'waystation',x:380,y:195,desc:'前往東港城或南方。',waystation:true},{name:'關口雜貨',icon:'🎒',type:'shop',x:250,y:200,desc:'關卡內唯一商店。'},{name:'關口客棧',icon:'🍺',type:'inn',x:180,y:230,desc:'過夜等候通關。'}]},
  coral_bay:{name:'珊瑚灣',cx:555,cy:180,size:4,kingdom:'east_sea',desc:'東海王國漁村，盛產珊瑚與珍珠，海盜出沒。',keywords:['珊瑚灣'],
    pois:[{name:'珊瑚市場',icon:'🐚',type:'shop',x:220,y:200,desc:'珊瑚・珍珠・海產品。'},{name:'海盜暗礁',icon:'🏴‍☠️',type:'danger',x:350,y:270,desc:'海盜藏身處。'},{name:'海產雜貨',icon:'🎒',type:'shop',x:280,y:170,desc:'漁村小店。'},{name:'珊瑚灣酒館',icon:'🍺',type:'inn',x:180,y:250,desc:'漁民酒館。'},{name:'珊瑚渡口',icon:'🐎',type:'waystation',x:350,y:200,desc:'船運往東港城。',waystation:true}]},
  // ═══ 翠林域 ═══
  jade_forest:{name:'翠林城',cx:290,cy:65,size:5,kingdom:'forest',desc:'翠林域精靈聚居地，外人不易進入。',keywords:['翠林城','翠林'],
    pois:[{name:'世界樹廣場',icon:'🌳',type:'special',x:250,y:180,desc:'古老精靈議會所在。'},{name:'藥草市集',icon:'🌿',type:'shop',x:350,y:245,desc:'稀有藥草・精靈特產。'},{name:'林間驛',icon:'🐎',type:'waystation',x:160,y:210,desc:'需取得通行許可。',waystation:true},{name:'翠林武器工坊',icon:'⚔️',type:'shop',x:200,y:200,desc:'精靈工藝武器。'},{name:'翠林旅舍',icon:'🍃',type:'inn',x:300,y:180,desc:'精靈待客之所。'}]},
  elder_grove:{name:'古樹隱村',cx:335,cy:48,size:3,kingdom:'forest',desc:'翠林深處的隱匿聚落，居住著最古老的森民與隱士。',keywords:['古樹隱村','隱村'],
    pois:[{name:'長老之廳',icon:'🧙',type:'special',x:260,y:200,desc:'古老智慧的守護者。'},{name:'禁忌書庫',icon:'📚',type:'special',x:350,y:250,desc:'收藏帝國時代的禁書。'},{name:'隱士草藥攤',icon:'🌿',type:'shop',x:200,y:280,desc:'珍稀草藥・限量。'},{name:'長老之廳客房',icon:'🍃',type:'inn',x:310,y:180,desc:'古老的森民待客之道。'}]},
  // ═══ 南荒 ═══
  dragon_valley:{name:'龍牙砦',cx:415,cy:328,size:5,kingdom:'wasteland',desc:'南荒廢棄要塞，尋寶者與亡命之徒聚集。',keywords:['龍牙砦','龍谷'],
    pois:[{name:'亡命者營地',icon:'🔥',type:'danger',x:215,y:180,desc:'強者為王。'},{name:'古龍遺跡',icon:'🐉',type:'special',x:320,y:250,desc:'古代龍族寶庫。'},{name:'廢砦驛',icon:'🐎',type:'waystation',x:380,y:155,desc:'破舊驛站。',waystation:true},{name:'亡命者市集',icon:'🎒',type:'shop',x:280,y:200,desc:'強者為王的交易。'},{name:'篝火營地',icon:'🍺',type:'inn',x:250,y:260,desc:'露天簡陋但安全。'}]},
  sand_gate:{name:'沙門城',cx:320,cy:340,size:4,kingdom:'wasteland',desc:'南荒北境的關城，是進入荒野的最後補給站。',keywords:['沙門城','沙門'],
    pois:[{name:'最後補給站',icon:'🎒',type:'shop',x:220,y:190,desc:'南荒專用補給品。'},{name:'沙門酒館',icon:'🍺',type:'inn',x:310,y:240,desc:'冒險者情報交換。'},{name:'沙門驛',icon:'🐎',type:'waystation',x:380,y:180,desc:'前往龍牙砦或鏽城。',waystation:true},{name:'沙門冒險者公會',icon:'⚔️',type:'guild',x:280,y:200,desc:'南荒探索任務。'}]},
  // ═══ 霜嶺 ═══
  frost_keep:{name:'霜守堡',cx:150,cy:38,size:4,kingdom:'north_ice',desc:'北方極寒之地的孤堡，帝國時代的邊防遺址，現由流亡騎士團駐守。',keywords:['霜守堡','霜嶺'],
    pois:[{name:'騎士團營房',icon:'🛡️',type:'guard',x:220,y:180,desc:'流亡騎士團，紀律嚴明。'},{name:'冰窖倉庫',icon:'❄️',type:'shop',x:320,y:230,desc:'寒帶特產・皮毛・凍肉。'},{name:'霜嶺驛',icon:'🐎',type:'waystation',x:380,y:200,desc:'前往鐵冠城。條件惡劣。',waystation:true},{name:'霜守雜貨',icon:'🎒',type:'shop',x:200,y:250,desc:'禦寒物資。'},{name:'騎士團宿舍',icon:'🍺',type:'inn',x:280,y:200,desc:'騎士團提供的簡陋住所。'}]},
  // ═══ 影沼地 ═══
  shadow_marsh:{name:'影沼鎮',cx:115,cy:310,size:4,kingdom:'shadow_marsh',desc:'西南沼澤中的隱秘聚落，瘴氣瀰漫，藥師與亡命之徒藏身於此。',keywords:['影沼鎮','影沼'],
    pois:[{name:'沼澤藥鋪',icon:'🧪',type:'shop',x:220,y:190,desc:'稀有毒藥與解藥。'},{name:'暗渡口',icon:'🛶',type:'special',x:320,y:260,desc:'通往不為人知的水路。'},{name:'影沼驛',icon:'🐎',type:'waystation',x:360,y:180,desc:'前往鐵霧城或灰港鎮。',waystation:true},{name:'影沼雜貨',icon:'🎒',type:'shop',x:280,y:220,desc:'沼澤生存物資。'},{name:'暗夜客棧',icon:'🍺',type:'inn',x:180,y:250,desc:'不問來歷的住所。'}]},
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
  // Random encounter during travel
  const areaEnemies=Object.entries(ENEMY_DB).filter(([,e])=>e.area&&e.area.includes(cityId)&&!e.boss);
  if(areaEnemies.length&&Math.random()<0.25){
    const pick=areaEnemies[Math.floor(Math.random()*areaEnemies.length)];
    const count=1+Math.floor(Math.random()*2);
    const ids=Array(count).fill(pick[0]);
    setTimeout(()=>{
      appendEntryToDOM({type:'narr',v:`途中遭遇了${pick[1].name}！`});
      startCombat(ids,false);
    },1500);
    return;
  }
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

  const iconColors=POI_ICON_COLORS;
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
  const iconColors=POI_ICON_COLORS;
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
  '雜貨':'general','雜貨鋪':'general','雜貨店':'general','雜貨商行':'general','商行':'general',
  '補給':'general','補給站':'general','市集':'general','漁市場':'general','珊瑚市場':'general','冰窖':'general',
  '武器':'weapon','武器鋪':'weapon','武器店':'weapon','武器修繕':'weapon','鐵匠':'weapon','鐵匠舖':'weapon',
  '防具':'armor','防具店':'armor','盔甲':'armor',
  '旅店':'inn','客棧':'inn','旅館':'inn','酒館':'inn',
  '藥鋪':'apothecary','藥店':'apothecary','藥草':'apothecary','藥師':'apothecary','沼澤藥鋪':'apothecary',
  '飾品':'accessory','飾品店':'accessory',
  '商街':'general','大橋市集':'general','邊境商隊':'general',
};

function getShopKey(poiName,poiType){
  // First check by POI type
  if(poiType==='inn')return 'inn';
  // Then check by name keywords
  for(const[k,v] of Object.entries(POI_SHOP_MAP)){
    if(poiName.includes(k))return v;
  }
  // Fallback based on type
  if(poiType==='shop')return 'general';
  return 'general';
}

function doGoToPoi(cityId,poiName){
  closeMap();
  const city=MAP_CITIES[cityId];
  const loc=city.name+'・'+poiName.replace('・','');
  G.sceneLoc='📍 '+loc;
  document.getElementById('scene-loc').textContent=G.sceneLoc;
  appendEntryToDOM({type:'sys',v:`📍 前往 ${loc}`});
  advanceTime(1);

  const poiObj=city.pois.find(p=>p.name===poiName);
  if(poiObj?.waystation){
    G.atWayStation=true;
    appendEntryToDOM({type:'sys',v:`🐎 ${poiName} — 可從此處出發前往其他城市。`});
    appendEntryToDOM({type:'sys',v:'📍 開啟地圖選擇目的地即可出發。'});
    showToast('已到達驛站','ok');
    scrollD();saveGame();
    return;
  }
  const isGuild=/(公會|工會)/.test(poiName);
  const isShop=/(商店|市集|攤販|雜貨|武器|鐵匠|藥舖|酒館|客棧|旅店|旅館|藥店|藥鋪|補給|防具|飾品|商行|商街|冰窖|漁市|珊瑚市場|草藥|工坊)/.test(poiName);
  if(isGuild){
    // 工會POI：本地開啟工會面板＋懸賞板，不呼叫AI
    const guildMap=GUILD_NAME_MAP;
    const gId=Object.entries(guildMap).find(([k])=>poiName.includes(k));
    if(gId&&!G.guilds?.[gId[1]]?.joined){joinGuild(gId[1]);}
    appendEntryToDOM({type:'narr',v:`你走進${poiName}的大廳。公告板上貼滿了委託和懸賞。`});
    markDirty('guild','activities');
    switchTab(document.querySelector('.ptab'),'p','activities');
    scrollD();saveGame();
  }else if(isShop){
    // 直接開啟商店 UI，不等 AI
    const poi=city.pois.find(p=>p.name===poiName);
    const baseKey=getShopKey(poiName,poi?.type);
    const shopId=`${cityId}_${poiName}`;
    const shop=mergeShop(shopId,baseKey,[],poiName,cityId);
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
    const poiData=city.pois.find(p=>p.name===poiName);
    sendChoice(`【抵達${loc}】${poiData?.desc||''}。請描述場景並給出行動選項。`);
  }
}

const _shopRefreshCache={};
async function silentShopRefresh(shopId,baseKey,poiName,cityId){
  if(!CFG.key)return;
  // 同一商店整個session只呼叫一次API
  if(_shopRefreshCache[shopId])return;
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
  const savedVer=localStorage.getItem('fate_game_ver')||'1.0';
  if(savedVer!==VERSION){
    localStorage.setItem('fate_game_ver',VERSION);
    setTimeout(()=>{
      const doReset=confirm('偵測到舊版存檔（v'+savedVer+' → v'+VERSION+'）\n\n新版大幅更新了商店、紋章、角色設定、城市設施等。\n建議「重新開始」以獲得最佳體驗。\n\n確定 = 重新開始\n取消 = 繼續舊存檔');
      if(doReset){localStorage.removeItem(SAVE_KEY);localStorage.removeItem('fate_save_v1');location.reload();}
    },500);
  }
  updateGold();
  renderStoryFromData();
  markDirty('log');
  const fixed=integrityCheck();
  showToast(fixed?`✦ 讀取存檔・修正${fixed}項`:'✦ 讀取存檔成功','ok');
}else{
  localStorage.setItem('fate_game_ver',VERSION);
  G.log=initLog();
  markDirty('log');
  initStory();
  // First time: show help
  setTimeout(openHelp,1500);
}
scrollD();
BGM.restore();
// 畫風版本檢測 — 畫風更新時自動清除舊頭像快取並重新生成
// 強制更新 Service Worker
if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistration().then(reg=>{
    if(reg){reg.update();if(reg.waiting)reg.waiting.postMessage('skipWaiting');}
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload());
}
const _PORTRAIT_VER='5';
if(localStorage.getItem('portrait_style_ver')!==_PORTRAIT_VER){
  clearPortraitCache();
  Object.keys(localStorage).filter(k=>k.startsWith('portrait_')||k.startsWith('db_svg_')).forEach(k=>localStorage.removeItem(k));
  localStorage.setItem('portrait_style_ver',_PORTRAIT_VER);
}
setTimeout(autoGeneratePortraits,2000);
setTimeout(generateMissingStarPortraits,3000); // 補生成所有缺頭像的星辰
setTimeout(collectProduction,1000); // 啟動時自動收穫據點生產 // 啟動後2秒開始生成頭像
if(!CFG.key)document.getElementById('api-modal').classList.add('open');
document.getElementById('free-inp').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing)sendFree();});
document.getElementById('api-inp').addEventListener('keydown',e=>{if(e.key==='Enter')saveKey();});
document.getElementById('s-key').addEventListener('keydown',e=>{if(e.key==='Enter')applySettings();});