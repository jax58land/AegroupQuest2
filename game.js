// ======================================================
// Aぇ! group クエスト Ⅱ (Web)  -  game.js 〈フル版〉
// - nicoca_v2.ttf を使用（style.css の @font-face 参照）
// - 可愛い操作ボタン（index.html / style.css 参照）
// - クリック/タップでメニュー・コマンドが反映されるホットスポット実装
// - GitHub Pages でそのまま動作
// ======================================================

// ====== 基本定数 ======
const SCREEN_W = 960, SCREEN_H = 640;
const TEXT_AREA_H = 160;
const FPS = 60;

const DEFENSE_FACTOR = 5;
const ELEM_ADV_MULT = 1.5;
const GUARD_REDUCTION = 0.5;
const NORMAL_ATTACK_POWER = 5;
const NEXT_TURN_ATK_BONUS = 15;

const PORTRAIT_W = 96, PORTRAIT_H = 80;
const LINE_H = 28;
const PANEL_MARGIN_X = 16;
const PANEL_LEFT_W = 480;
const PANEL_GAP = 16;

const BLINK_DURATION_FRAMES = 36;
const BLINK_INTERVAL_MS = 80;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 便利関数
const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
const nowMS = ()=>performance.now();

// フォント（nicoca優先）
const font = (px)=>`${px}px "nicoca","Noto Sans JP",sans-serif`;
const font28 = ()=>font(28);
const font48 = ()=>font(48);

// 画像キャッシュ
const imgCache = new Map();
async function loadImageScaled(src, w, h){
  const key = `${src}@${w}x${h}`;
  if(imgCache.has(key)) return imgCache.get(key);
  const img = new Image();
  img.src = `./assets/${src}`;
  await img.decode().catch(()=>{});
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const ictx = off.getContext("2d");
  if(img.naturalWidth){
    ictx.drawImage(img, 0, 0, w, h);
  }else{
    // プレースホルダ（アセット無しでも動く）
    ictx.fillStyle = "#333"; ictx.fillRect(0,0,w,h);
    ictx.strokeStyle="#888"; ictx.strokeRect(0,0,w,h);
    ictx.fillStyle="#bbb"; ictx.font = "14px sans-serif";
    ictx.fillText(src, 6, 20);
  }
  imgCache.set(key, off);
  return off;
}

// サウンド（存在すれば鳴らす）
const music = {
  title: new Audio("./assets/bgm_title.mp3"),
  battle: new Audio("./assets/bgm_battle.mp3"),
  final:  new Audio("./assets/bgm_battle_final.mp3"),
  ending: new Audio("./assets/bgm_ending.mp3"),
  gameover: new Audio("./assets/bgm_gameover.mp3"),
};
for(const a of Object.values(music)){ a.loop = true; a.volume = 0.5; }

const se = {
  select: new Audio("./assets/se_select.mp3"),
  attack: new Audio("./assets/se_attack.mp3"),
  skill:  new Audio("./assets/se_skill.mp3"),
  victory:new Audio("./assets/se_victory.mp3"),
  defeat: new Audio("./assets/se_defeat.mp3"),
};
for(const a of Object.values(se)){ a.volume = 0.6; }

// ブラウザの自動再生規制対策：初回操作でアンロック
let audioUnlocked = false;
function tryUnlockAudio(){
  if(audioUnlocked) return;
  audioUnlocked = true;
  const all = [...Object.values(music), ...Object.values(se)];
  all.forEach(a=>a.play().then(()=>a.pause()).catch(()=>{}));
}
addEventListener("pointerdown", tryUnlockAudio, {once:true});
addEventListener("keydown", tryUnlockAudio, {once:true});

// ====== データ構造 ======
const Element = { FIRE:"火", WIND:"風", PSYCHIC:"エスパー", THUNDER:"雷", WATER:"水", NONE:"無" };
const ELEM_STRONG = {
  [Element.FIRE]: Element.WIND,
  [Element.WIND]: Element.PSYCHIC,
  [Element.PSYCHIC]: Element.THUNDER,
  [Element.THUNDER]: Element.WATER,
  [Element.WATER]: Element.FIRE,
};

const Scene = { TITLE:0, STORY:1, ENCOUNTER:2, BATTLE:3, RECRUIT:4, ENDING:5, CLEAR:6, GAMEOVER:7 };

class Skill{
  constructor(name, power, quote, addAtkNext=0, selfCannotNext=false){
    this.name=name; this.power=power; this.quote=quote;
    this.add_atk_next=addAtkNext; this.self_cannot_cast_next=selfCannotNext;
  }
}
class Character{
  constructor({name, element, atk, df, max_hp, weapon, skills, is_enemy=false}){
    this.name=name; this.element=element; this.atk=atk; this.df=df;
    this.max_hp=max_hp; this.weapon=weapon; this.skills=skills; this.is_enemy=is_enemy;
    this.hp=max_hp; this.next_atk_bonus=0; this.cannot_cast_turns=0; this.guarding=false;
  }
  isAlive(){ return this.hp>0; }
  startTurn(){ this.guarding=false; }
  endTurn(){ if(this.cannot_cast_turns>0) this.cannot_cast_turns--; }
}

// ====== キャラ定義（Python準拠） ======
function makePartyInitial(){
  return [
    new Character({
      name:"セイヤ", element:Element.FIRE, atk:10, df:5, max_hp:150, weapon:"マイク",
      skills:[
        new Skill("高音「声たーかいー」",10,"声たーかいー！"),
        new Skill("キレる「なんでやねん！」",10,"なんでやねん！"),
        new Skill("全速ダッシュ",0,"Take me back now 僕のままで", NEXT_TURN_ATK_BONUS),
        new Skill("ツッコミ（反動）",15,"誰がそもそも…細かく説明してほしい",0,true),
      ],
    }),
    new Character({
      name:"リチャード", element:Element.THUNDER, atk:5, df:10, max_hp:190, weapon:"ベース",
      skills:[
        new Skill("ラップ",10,"変わらない答え抱き…"),
        new Skill("キレる",10,"血眼で探してます！"),
        new Skill("ダンス",0,"(ダンス)", NEXT_TURN_ATK_BONUS),
        new Skill("はんなり心（反動）",15,"大好きどすえ〜",0,true),
      ],
    }),
  ];
}
function makeRecruits(){
  return [
    new Character({
      name:"マサカド", element:Element.WATER, atk:8, df:7, max_hp:170, weapon:"ギター",
      skills:[
        new Skill("早弾き",10,"(ジャカジャカ)"),
        new Skill("Monster",10,"きーみーのさけーびーでー"),
        new Skill("ポヤ角",0,"(ポヤ角)", NEXT_TURN_ATK_BONUS),
        new Skill("よしのりフィーバー（反動）",15,"イェーイ！",0,true),
      ],
    }),
    new Character({
      name:"コジケン", element:Element.PSYCHIC, atk:9, df:3, max_hp:350, weapon:"キーボード",
      skills:[
        new Skill("名言（反動）",15,"真の強さとは、弱さである",0,true),
        new Skill("うまキング",0,"うまキング！", NEXT_TURN_ATK_BONUS),
        new Skill("こじけんタイム",10,"イェーイ！"),
        new Skill("キレる",10,"何がおもろいんじゃコレェ！"),
      ],
    }),
    new Character({
      name:"サノマサヤ", element:Element.WIND, atk:8, df:8, max_hp:130, weapon:"ドラム",
      skills:[
        new Skill("よしこタイム",10,"よしこで〜す！"),
        new Skill("賞金稼ぎ",0,"510万", NEXT_TURN_ATK_BONUS),
        new Skill("挨拶（反動）",15,"サノマサヤッヤッヤッ",0,true),
        new Skill("キレる",10,"ヘタクソ！"),
      ],
    }),
  ];
}
function makeEnemies(stage){
  const defs_single = [
    ["ジョーイチロー", Element.WATER, 7,7,800, "ボケ",
      [new Skill("ふざける",10,"ふざける！"), new Skill("野球語り",10,"野球の話…"), new Skill("イジリ",20,"イジリ！")]],
    ["シゲオカ", Element.FIRE, 10,5,900, "情熱",
      [new Skill("演技",10,"演技！"), new Skill("歯が多い",10,"ニカッ"), new Skill("ふざける",30,"ふざけ！")]],
    ["タカツキング", Element.PSYCHIC, 7,10,1000, "MC力",
      [new Skill("司会進行",15,"進行！"), new Skill("ツッコミ",15,"ツッコミ！"), new Skill("八重歯",40,"ガブッ")]],
    ["ジーコ", Element.THUNDER, 9,9,1000, "雪だるま",
      [new Skill("ふざける",10,"ふざけ！"), new Skill("ゴイゴイスー",10,"スー！"), new Skill("マッサマンパワー",50,"マッサマン！")]],
  ];
  if(stage<=3){
    const [name, elem, atk, df, hp, weapon, skills] = defs_single[stage];
    return [new Character({name, element:elem, atk, df, max_hp:hp, weapon, skills, is_enemy:true})];
  }
  const y = new Character({name:"ヨコヤマ", element:Element.NONE, atk:10, df:10, max_hp:1200, weapon:"∞",
    skills:[new Skill("パスポート取りたいんです",10,"パスポート…"),
            new Skill("いずれテッペン超えれる？",10,"テッペン…？"),
            new Skill("オバハッハーン",20,"オバハッハーン！")], is_enemy:true});
  const o = new Character({name:"オオクラ", element:Element.WIND, atk:10, df:10, max_hp:1200, weapon:"∞",
    skills:[new Skill("だってアイドルだもん",10,"アイドルだもん"),
            new Skill("大倉だよ！",10,"大倉だよ！"),
            new Skill("ほなトリキ一緒にいきますか",20,"トリキ行こか")], is_enemy:true});
  return [y,o];
}
function charImageName(ch){
  if(ch.is_enemy){
    const mp = {
      "ジョーイチロー":"enemy_jyoichiro.png","シゲオカ":"enemy_shigeoka.png","タカツキング":"enemy_takatsuking.png","ジーコ":"enemy_jiko.png","ヨコヤマ":"enemy_yokoyama.png","オオクラ":"enemy_ookura.png"
    };
    return mp[ch.name] || "enemy_unknown.png";
  }else{
    const mp = {
      "セイヤ":"player_seiya.png","リチャード":"player_richard.png","マサカド":"player_masakado.png","コジケン":"player_kojiken.png","サノマサヤ":"player_sanomasaya.png"
    };
    return mp[ch.name] || "player_unknown.png";
  }
}

// ====== 戦闘計算 ======
function elementMultiplier(attacker, defender){
  return (ELEM_STRONG[attacker.element] === defender.element) ? ELEM_ADV_MULT : 1.0;
}
function computeDamage(attacker, defender, basePower){
  const effAtk = attacker.atk + attacker.next_atk_bonus;
  const raw = Math.floor(basePower * effAtk * element_multiplier(attacker, defender));
  function element_multiplier(a, d){ return (ELEM_STRONG[a.element]===d.element)?ELEM_ADV_MULT:1.0; }
  let reduced = raw - defender.df * DEFENSE_FACTOR;
  if(defender.guarding) reduced = Math.floor(reduced * GUARD_REDUCTION);
  return Math.max(1, reduced);
}
function performSkill(attacker, defender, skill){
  let log = `${attacker.name} は ${skill.name}！`;
  let dealt = 0;
  if(skill.power>0){
    dealt = computeDamage(attacker, defender, skill.power);
    defender.hp = Math.max(0, defender.hp - dealt);
    log += ` ${defender.name} に ${dealt} ダメージ！`;
  }
  if(skill.add_atk_next>0){
    attacker.next_atk_bonus = skill.add_atk_next;
    log += ` 次の攻撃力が+${skill.add_atk_next}！`;
  }
  if(skill.self_cannot_cast_next){
    attacker.cannot_cast_turns = 2;
    log += " 反動で次のターン“技”が使えない！";
  }
  return {log, dealt};
}
function performNormalAttack(attacker, defender){
  const dealt = computeDamage(attacker, defender, NORMAL_ATTACK_POWER);
  defender.hp = Math.max(0, defender.hp - dealt);
  if(attacker.next_atk_bonus>0) attacker.next_atk_bonus=0;
  return {log:`${attacker.name} の こうげき！ ${defender.name} に ${dealt} ダメージ！`, dealt};
}
function enemyAct(enemy, target){
  enemy.startTurn();
  const sk = enemy.skills[Math.floor(Math.random()*enemy.skills.length)];
  const {log, dealt} = performSkill(enemy, target, sk);
  enemy.endTurn();
  return {log, dealt};
}

// ====== セーブ（localStorage） ======
const SAVE_KEY = "ae_group_quest2_save";
function saveGame(stage, party, recruitsAdded){
  const data = {
    stage,
    party: party.map(p=>({name:p.name, hp:p.hp, max_hp:p.max_hp})),
    recruits_added: recruitsAdded,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}
function loadGame(){
  const s = localStorage.getItem(SAVE_KEY);
  if(!s) return null;
  try{
    const data = JSON.parse(s);
    let party = makePartyInitial();
    const recruits = makeRecruits();
    let recruits_added = data.recruits_added ?? 0;
    for(let i=0;i<recruits_added;i++) party.push(recruits[i]);
    (data.party||[]).forEach(sv=>{
      const p = party.find(pp=>pp.name===sv.name);
      if(p) p.hp = Math.min(Number(sv.hp||p.max_hp), p.max_hp);
    });
    return {stage:data.stage, party, recruits_added};
  }catch{ return null; }
}

// ====== 浮遊テキスト ======
class FloatText{
  constructor(text,x,y,color=[255,60,60],alpha=255,vy=-0.8,life=60){
    this.text=text; this.x=x; this.y=y; this.color=color; this.alpha=alpha; this.vy=vy; this.life=life;
  }
}

// ====== クリック用ホットスポット ======
let hotspots = []; // {type:"menu"|"command"|"enter", index?, rect:{x,y,w,h}}
function toCanvasXY(e){
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (canvas.width / r.width);
  const y = (e.clientY - r.top)  * (canvas.height / r.height);
  return {x,y};
}

// ====== Game本体 ======
class Game{
  constructor(){
    this.resetAll();

    // キーボード
    addEventListener("keydown",(e)=>{
      if(["ArrowUp","ArrowDown","Enter"].includes(e.key)) e.preventDefault();
      this.handleKey(e.key);
    }, {passive:false});

    // 可愛いボタン（index.html）
    document.querySelectorAll(".btn").forEach(b=>{
      b.addEventListener("pointerdown", ()=> this.handleKey(b.dataset.key));
    });

    // クリック/タップ
    canvas.addEventListener("pointerdown",(e)=>{
      const {x,y} = toCanvasXY(e);
      for(const h of hotspots){
        const r=h.rect;
        if(x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h){
          if(h.type==="menu"){ this.menu_index=h.index; this.onEnter(); }
          else if(h.type==="command"){ this.selection_index=h.index; this.onEnter(); }
          else if(h.type==="enter"){ this.onEnter(); }
          return;
        }
      }
      // 下部パネルをタップしたらEnter相当
      if(y >= SCREEN_H - TEXT_AREA_H) this.onEnter();
    });

    // ホバーでポインタ
    canvas.addEventListener("pointermove",(e)=>{
      const {x,y} = toCanvasXY(e);
      const hit = hotspots.some(h=>{
        const r=h.rect; return x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h;
      });
      canvas.style.cursor = hit ? "pointer" : "default";
    });

    // ループ
    const loop = ()=>{ this.update(); this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---- 状態リセット（はじめから/つづきから共通） ----
  resetAll(){
    this.scene = Scene.TITLE;
    this.menu_index = 0;

    this.stage = 0;
    this.party = makePartyInitial();
    this.recruits = makeRecruits();
    this.recruits_added = 0;

    this.enemies = [];
    this.is_final_battle = false;
    this.player_queue = [];
    this.enemy_queue = [];
    this.current_actor_idx = 0;
    this.battle_log = [];
    this.selection_index = 0;
    this.turn_player = true;

    this.story_lines = [
      "セイヤとリチャードは突如「ぇ! group」となり、",
      "失われた「A」を取り戻すため旅に出た。",
      "道中で失った仲間を助け出し、力を合わせる。",
      "立ちはだかるはカミガタボーイズ四天王…そして…",
      "5人は「Aぇ! group」を取り戻せるのか…！？",
      "（Enterで次へ）",
    ];
    this.story_idx = 0;
    this.pending_result = null;
    this.fade_alpha = {};
    this.death_announced = new Set();
    this.hit_blink = {};
    this.float_texts = [];
    this.enemy_draw_rects = {};
    this.party_portrait_rects = {};
    this.recruiting_member = null;

    this.recruit_lines = {
      "マサカド":["マサカド「任せとき！」","ギターの力、見せたるで！","セイヤ「そんなんええねん！」"],
      "コジケン":["コジケン「真の強さとは、弱さである…」","全員「よいしょ〜」","コジケン「一緒に行こうや！」"],
      "サノマサヤ":["サノマサヤ「よしこでーす！」","賞金稼ぐで！","マサカド「ほんま頼りになるわぁ」"],
    };

    this.encounter_idx = 0;
    this.encounter_lines_single = {
      "ジョーイチロー":["ジョーイチロー「お前らに『A』は渡さへんで！」","セイヤ「なんで敵なっとんねん！」"],
      "シゲオカ":["シゲオカ「別に歯多ないわ！」","リチャード「なんも言うてへんがな！」"],
      "タカツキング":["タカツキング「私のチケットここにありまっしゃろ？」","セイヤ「知らん！！！」"],
      "ジーコ":["ジーコ「ゴイゴイスー！」","コジケン「スー！」"],
    };
    this.encounter_lines_duo = [
      "ヨコヤマ「パスポート取りたいんです？」",
      "オオクラ「よくここまで来たな」",
      "セイヤ「Aを返してもらいますよ！」",
      "ヨコヤマ＆オオクラ「行くで！」",
    ];

    this.current_bgm = null;
    this.playBGM("title");
  }

  // ---- BGM/SE ----
  playBGM(key){
    if(this.current_bgm===key) return;
    this.current_bgm = key;
    try{
      for(const [k,a] of Object.entries(music)){
        if(k===key){ a.play().catch(()=>{}); } else { a.pause(); a.currentTime=0; }
      }
    }catch{}
  }
  playSE(name){
    const a = se[name]; if(!a) return;
    try{ a.currentTime=0; a.play().catch(()=>{}); }catch{}
  }

  // ---- 文字支援 ----
  fitSize(text, maxW, base=28, min=16){
    for(let s=base; s>=min; s--){
      ctx.font = font(s);
      if(ctx.measureText(text).width <= maxW) return s;
    }
    return min;
  }
  elide(text, maxW){
    ctx.font = font28();
    if(ctx.measureText(text).width <= maxW) return text;
    const ell = "…"; let s=text;
    while(s && ctx.measureText(s+ell).width>maxW) s=s.slice(0,-1);
    return s? s+ell : ell;
  }

  // ---- シーン制御 ----
  startEncounter(){
    this.enemies = makeEnemies(this.stage);
    this.is_final_battle = (this.enemies.length>=2);
    this.encounter_idx=0;
    this.turn_player=true; this.selection_index=0;
    this.fade_alpha={}; this.death_announced.clear();
    this.hit_blink={}; this.float_texts=[];
    this.enemy_draw_rects={}; this.party_portrait_rects={};
    this.playBGM("title");
    this.scene = Scene.ENCOUNTER;
  }
  startBattle(){
    this.turn_player=true; this.selection_index=0;
    const appear = this.is_final_battle ? this.enemies.map(e=>e.name).join(" と ") : this.enemies[0].name;
    this.battle_log = [`${appear} が あらわれた！`];
    this.pending_result = null;
    this.playBGM(this.is_final_battle?"final":"battle");
    this.scene = Scene.BATTLE;
    this.startPlayerPhase();
  }
  startPlayerPhase(){
    this.player_queue = this.alivePartyIndices();
    if(this.player_queue.length>0) this.current_actor_idx = this.player_queue[0];
    this.turn_player=true; this.selection_index=0;
  }
  startEnemyPhase(){ this.enemy_queue = this.aliveEnemyIndices(); this.turn_player=false; }

  alivePartyIndices(){ return this.party.map((p,i)=>p.isAlive()?i:-1).filter(i=>i>=0); }
  aliveEnemyIndices(){ return this.enemies.map((e,i)=>e.isAlive()?i:-1).filter(i=>i>=0); }
  currentActor(){
    const idxs = this.alivePartyIndices();
    if(!idxs.length) return this.party[0];
    if(!idxs.includes(this.current_actor_idx)) this.current_actor_idx = idxs[0];
    return this.party[this.current_actor_idx];
  }
  buildOptions(actor){
    const unusable = actor.cannot_cast_turns>0;
    const opts = [
      ["通常こうげき","atk",false],
      ...actor.skills.map((s,i)=>[s.name + (unusable?"（使用不可：反動）":""), `skill:${i}`, unusable]),
      ["ガード","guard",false],
      ["いれかえ","swap", this.alivePartyIndices().length<=1 ],
      ["セーブして終了","savequit",false],
    ];
    return opts;
  }
  getPrimaryEnemy(){
    const idxs = this.aliveEnemyIndices();
    return idxs.length? this.enemies[idxs[0]] : null;
  }

  // ---- 入力 ----
  handleKey(key){
    if(key==="ArrowUp"){ this.playSE("select"); this.onUp(); }
    else if(key==="ArrowDown"){ this.playSE("select"); this.onDown(); }
    else if(key==="Enter"){ this.playSE("select"); this.onEnter(); }
  }
  onUp(){
    if(this.scene===Scene.TITLE){
      this.menu_index = (this.menu_index - 1 + 2) % 2; // 正しく上方向へ
    }else if(this.scene===Scene.BATTLE && this.turn_player){
      const opts = this.buildOptions(this.currentActor());
      this.selection_index = (this.selection_index - 1 + opts.length) % opts.length;
    }
  }
  onDown(){
    if(this.scene===Scene.TITLE){
      this.menu_index = (this.menu_index + 1) % 2;
    }else if(this.scene===Scene.BATTLE && this.turn_player){
      const opts = this.buildOptions(this.currentActor());
      this.selection_index = (this.selection_index + 1) % opts.length;
    }
  }
  onEnter(){
    if(this.scene===Scene.TITLE){
      if(this.menu_index===0){
        this.resetAll();           // はじめから
        this.scene = Scene.STORY; this.playBGM("title");
      }else{
        const loaded = loadGame(); // つづきから
        this.resetAll();
        if(loaded){
          this.stage = loaded.stage;
          this.party = loaded.party;
          this.recruits_added = loaded.recruits_added;
        }
        this.scene = Scene.STORY;
      }
      return;
    }
    if(this.scene===Scene.STORY){
      this.story_idx++;
      if(this.story_idx>=this.story_lines.length) this.startEncounter();
      return;
    }
    if(this.scene===Scene.ENCOUNTER){
      this.encounter_idx += 2;
      const lines = this.is_final_battle ? this.encounter_lines_duo
        : (this.encounter_lines_single[this.enemies[0]?.name] || []);
      if(this.encounter_idx>=lines.length) this.startBattle();
      return;
    }
    if(this.scene===Scene.BATTLE){
      if(this.pending_result){
        if(this.pending_result.victory) this.handleVictory();
        else { this.scene=Scene.GAMEOVER; this.playBGM("gameover"); }
        this.pending_result=null;
        return;
      }
      if(!this.party.some(p=>p.isAlive())){
        this.playSE("defeat");
        this.pending_result = {victory:false, message:"全滅してしまった…"};
        this.battle_log.push(this.pending_result.message);
        return;
      }
      if(!this.enemies.some(e=>e.isAlive())){
        this.playSE("victory");
        const names = this.enemies.map(e=>e.name).join(" と ");
        this.pending_result = {victory:true, message:`${names} を たおした！`};
        this.battle_log.push(this.pending_result.message);
        return;
      }

      this.party.forEach(p=>{ if(p.hp<=0) this.onDeath(p); });
      this.enemies.forEach(e=>{ if(e.hp<=0) this.onDeath(e); });

      if(this.turn_player){
        const actor = this.currentActor();
        const opts = this.buildOptions(actor);
        const [label, cmd, disabled] = opts[this.selection_index];
        if(disabled){ this.battle_log.push("その行動は今はできない！"); return; }
        const target = this.getPrimaryEnemy(); if(!target) return;

        let log="", dealt=0;
        if(cmd==="atk"){
          actor.startTurn();
          ({log,dealt} = performNormalAttack(actor, target));
          this.playSE("attack");
          actor.endTurn();
          if(dealt>0){ this.hitFlash(target.name); this.spawnDamageNumber(target.name, dealt, true); }
          this.battle_log.push(log);
          this.advanceAfterPlayerAction();
        }else if(cmd.startsWith("skill:")){
          if(actor.cannot_cast_turns>0){ this.battle_log.push("反動で“技”が使えない！"); return; }
          const idx = Number(cmd.split(":")[1]);
          const sk = actor.skills[idx];
          actor.startTurn();
          ({log,dealt} = performSkill(actor, target, sk));
          this.playSE("skill");
          actor.endTurn();
          if(dealt>0){ this.hitFlash(target.name); this.spawnDamageNumber(target.name, dealt, true); }
          this.battle_log.push(log);
          this.advanceAfterPlayerAction();
        }else if(cmd==="guard"){
          actor.startTurn(); actor.guarding=true; actor.endTurn();
          this.battle_log.push(`${actor.name} は みをまもっている！`);
          this.advanceAfterPlayerAction();
        }else if(cmd==="swap"){
          const alive = this.alivePartyIndices();
          if(alive.length>1){
            const curpos = alive.indexOf(this.current_actor_idx);
            this.current_actor_idx = alive[(curpos+1)%alive.length];
            if(this.player_queue.length) this.player_queue[0]=this.current_actor_idx;
            this.battle_log.push(`${actor.name} → ${this.party[this.current_actor_idx].name} に いれかえ！`);
          }else{
            this.battle_log.push("いれかえできない！");
          }
        }else if(cmd==="savequit"){
          saveGame(this.stage, this.party, this.recruits_added);
          this.battle_log.push("セーブして終了します。ページを閉じてOK。");
        }
      }else{
        // 敵ターン（Enterで1体ずつ進む）
        while(this.enemy_queue.length && !this.enemies[this.enemy_queue[0]].isAlive()){
          this.enemy_queue.shift();
        }
        if(!this.enemy_queue.length){ this.startPlayerPhase(); return; }
        const e_idx = this.enemy_queue.shift();
        const enemy = this.enemies[e_idx];
        const targets = this.alivePartyIndices();
        if(!targets.length){
          this.playSE("defeat");
          this.pending_result = {victory:false, message:"全滅…"};
          this.battle_log.push(this.pending_result.message);
          return;
        }
        const tgt = this.party[targets[Math.floor(Math.random()*targets.length)]];
        const {log,dealt} = enemyAct(enemy, tgt);
        this.battle_log.push(log);
        if(dealt>0){ this.hitFlash(tgt.name); this.spawnDamageNumber(tgt.name, dealt, false); }
        if(tgt.hp<=0) this.onDeath(tgt);
        if(!this.enemy_queue.length) this.startPlayerPhase();
      }
      return;
    }
    if(this.scene===Scene.RECRUIT){
      this.party.push(this.recruiting_member);
      this.recruits_added++;
      this.recruiting_member = null;
      this.party.forEach(p=>{ p.hp=p.max_hp; p.next_atk_bonus=0; p.cannot_cast_turns=0; });
      this.startEncounter();
      return;
    }
    if(this.scene===Scene.CLEAR){
      saveGame(5, this.party, this.recruits_added);
      this.scene = Scene.TITLE; this.playBGM("title"); return;
    }
    if(this.scene===Scene.GAMEOVER){
      this.scene = Scene.TITLE; this.playBGM("title"); return;
    }
  }

  advanceAfterPlayerAction(){
    while(this.player_queue.length && !this.party[this.player_queue[0]].isAlive()) this.player_queue.shift();
    if(this.player_queue.length) this.player_queue.shift();
    while(this.player_queue.length && !this.party[this.player_queue[0]].isAlive()) this.player_queue.shift();
    if(this.player_queue.length){ this.current_actor_idx = this.player_queue[0]; this.selection_index=0; this.turn_player=true; }
    else{ this.startEnemyPhase(); }
  }

  onDeath(who){
    if(!this.death_announced.has(who.name)){
      this.battle_log.push(`${who.name} は やられた！`);
      this.death_announced.add(who.name);
    }
  }
  spawnDamageNumber(name, dmg, isEnemy){
    let cx = SCREEN_W/2, cy = SCREEN_H/2;
    if(isEnemy && this.enemy_draw_rects[name]){
      const r = this.enemy_draw_rects[name];
      cx = r.x + r.w/2; cy = r.y + r.h/2;
    }else if(!isEnemy && this.party_portrait_rects[name]){
      const r = this.party_portrait_rects[name];
      cx = r.x + r.w/2; cy = r.y - 8;
    }
    this.float_texts.push(new FloatText(String(dmg), cx, cy));
  }
  hitFlash(name){ this.hit_blink[name] = BLINK_DURATION_FRAMES; }

  handleVictory(){
    this.party.forEach(p=>{ p.hp=p.max_hp; p.next_atk_bonus=0; p.cannot_cast_turns=0; });
    if(this.is_final_battle){ this.scene=Scene.CLEAR; this.playBGM("ending"); return; }
    this.stage++;
    if(this.stage<=3 && this.recruits_added < this.recruits.length){
      this.recruiting_member = this.recruits[this.recruits_added];
      this.scene = Scene.RECRUIT; this.playBGM("title"); return;
    }
    this.startEncounter();
  }

  // ====== 描画ユーティリティ ======
  async drawImageAlpha(name,x,y,w,h,alpha=1){
    const img = await loadImageScaled(name, w, h);
    ctx.save(); ctx.globalAlpha = clamp(alpha,0,1); ctx.drawImage(img,x,y); ctx.restore();
  }
  alphaFor(name, alive, aMap){
    let a = aMap[name] ?? 1.0;
    if(!alive && a>0) a = Math.max(0, a - (12/255));
    if(alive && a<1) a = Math.min(1, a + (12/255));
    aMap[name]=a; return a;
  }
  applyBlink(name, baseAlpha){
    const remain = this.hit_blink[name] ?? 0;
    if(remain<=0) return baseAlpha;
    return (Math.floor(performance.now()/BLINK_INTERVAL_MS)%2===0) ? Math.max(0.35, baseAlpha*0.35) : baseAlpha;
  }
  drawHPBar(x,y,w,h,now,mx,color="#0c8"){
    ctx.fillStyle="#505050"; ctx.fillRect(x,y,w,h);
    ctx.fillStyle=color; ctx.fillRect(x, y, w*clamp(now/mx,0,1), h);
    ctx.strokeStyle="#eee"; ctx.strokeRect(x,y,w,h);
  }
  drawBottomBG(showSplit=false){
    // 下部パネル
    ctx.fillStyle="#141414"; ctx.fillRect(0, SCREEN_H - TEXT_AREA_H, SCREEN_W, TEXT_AREA_H);
    // 上縁（2px帯）
    ctx.fillStyle="#c8c8c8"; ctx.fillRect(0, SCREEN_H - TEXT_AREA_H, SCREEN_W, 2);
    // 縦線（バトル時のみ／整数座標で2px幅）
    if(showSplit){
      const xSplit = PANEL_MARGIN_X + PANEL_LEFT_W + Math.floor(PANEL_GAP/2);
      ctx.fillStyle="#808080";
      ctx.fillRect(xSplit, SCREEN_H - TEXT_AREA_H + 8, 2, TEXT_AREA_H - 16);
    }
  }

  // ====== 各シーン描画 ======
  async drawTitle(){
    hotspots = [];
    this.playBGM("title");
    ctx.clearRect(0,0,SCREEN_W,SCREEN_H);

    const logo = await loadImageScaled("logo_title.png", 600, 200);
    if(logo){ ctx.drawImage(logo, SCREEN_W/2-300, 80); }
    else{
      ctx.font = font48(); ctx.fillStyle="#ff0";
      const t="Aぇ! group クエスト Ⅱ"; const tw=ctx.measureText(t).width;
      ctx.fillText(t, SCREEN_W/2 - tw/2, 120);
    }

    const menu = ["はじめから","つづきから"];
    menu.forEach((m,i)=>{
      ctx.font = font28();
      ctx.fillStyle = (i===this.menu_index)?"#fff":"#a0a0a0";
      const x = SCREEN_W/2 - 60, y = 300 + i*40;
      ctx.fillText(m, x, y);
      hotspots.push({type:"menu", index:i, rect:{x:x-8, y:y-24, w:240, h:32}});
    });

    this.drawBottomBG(false);
    ctx.font=font28(); ctx.fillStyle="#eee";
    ctx.fillText("↑↓で選択、Enterで決定", PANEL_MARGIN_X, SCREEN_H - TEXT_AREA_H + 28);

    hotspots.push({type:"enter", rect:{x:0, y:SCREEN_H - TEXT_AREA_H, w:SCREEN_W, h:TEXT_AREA_H}});
  }

  async drawStory(){
    hotspots = [{type:"enter", rect:{x:0, y:SCREEN_H - TEXT_AREA_H, w:SCREEN_W, h:TEXT_AREA_H}}];
    this.playBGM("title");
    ctx.clearRect(0,0,SCREEN_W,SCREEN_H);
    const bg = await loadImageScaled("bg_story.png", SCREEN_W, SCREEN_H - TEXT_AREA_H);
    if(bg) ctx.drawImage(bg,0,0); else { ctx.fillStyle="#1e1e50"; ctx.fillRect(0,0,SCREEN_W,SCREEN_H-TEXT_AREA_H); }
    const safeIdx = Math.min(this.story_idx, this.story_lines.length-1);
    this.drawBottomBG(false);
    ctx.font=font28(); ctx.fillStyle="#eee";
    ctx.fillText(this.story_lines[safeIdx], PANEL_MARGIN_X, SCREEN_H - TEXT_AREA_H + 28);
  }

  async drawEncounter(){
    hotspots = [];
    ctx.clearRect(0,0,SCREEN_W,SCREEN_H);
    const bg = await loadImageScaled(this.is_final_battle?"bg_battle_final.png":"bg_battle.png", SCREEN_W, SCREEN_H - TEXT_AREA_H);
    if(bg) ctx.drawImage(bg,0,0);

    let lines;
    if(this.is_final_battle){
      const left = this.enemies[0], right = this.enemies[1];
      await this.drawImageAlpha(charImageName(left), SCREEN_W/2-320, 90, 280,206,1);
      await this.drawImageAlpha(charImageName(right), SCREEN_W/2+40, 90, 280,206,1);
      ctx.font=font48(); ctx.fillStyle="#ff0";
      const t="ヨコヤマ ＆ オオクラ"; const tw=ctx.measureText(t).width;
      ctx.fillText(t, SCREEN_W/2 - tw/2, 68);
      lines = this.encounter_lines_duo;
    }else{
      const enemy = this.enemies[0];
      await this.drawImageAlpha(charImageName(enemy), SCREEN_W/2-150, 90, 300,220,1);
      ctx.font=font48(); ctx.fillStyle="#ff0";
      const t=enemy.name, tw=ctx.measureText(t).width;
      ctx.fillText(t, SCREEN_W/2 - tw/2, 68);
      lines = this.encounter_lines_single[enemy.name] || ["……","（Enterで次へ）"];
    }

    this.drawBottomBG(false);
    let y = SCREEN_H - TEXT_AREA_H + 28;
    const cur = lines.slice(this.encounter_idx, this.encounter_idx+2);
    ctx.font=font28(); ctx.fillStyle="#eee";
    for(const ln of cur){
      ctx.fillText(ln, PANEL_MARGIN_X, y);
      hotspots.push({type:"enter", rect:{x:PANEL_MARGIN_X-8, y:y-24, w:SCREEN_W - PANEL_MARGIN_X*2, h:32}});
      y += LINE_H;
    }
    const hint = (this.encounter_idx >= lines.length-2) ? "（Enterでバトルへ）" : "（Enterで次へ）";
    ctx.fillStyle="#c8c8c8"; ctx.fillText(hint, PANEL_MARGIN_X, SCREEN_H - 10 - LINE_H);

    hotspots.push({type:"enter", rect:{x:0, y:SCREEN_H - TEXT_AREA_H, w:SCREEN_W, h:TEXT_AREA_H}});
  }

  drawPartyStrip(){
    const y = SCREEN_H - TEXT_AREA_H - PORTRAIT_H - 8;
    let x = 16; const gap = 12;
    this.party_portrait_rects = {};
    this.party.forEach(async (ch, idx)=>{
      const img = await loadImageScaled(charImageName(ch), PORTRAIT_W, PORTRAIT_H);
      const alive = ch.isAlive();
      let alpha = this.alphaFor(ch.name, alive, this.fade_alpha);
      alpha = this.applyBlink(ch.name, alpha);
      ctx.save(); ctx.globalAlpha=alpha; ctx.drawImage(img, x, y); ctx.restore();
      const border = (this.scene===Scene.BATTLE && this.turn_player && idx===this.current_actor_idx && alive) ? "#ff0" : "#c8c8c8";
      ctx.strokeStyle=border; ctx.strokeRect(x-2,y-2,PORTRAIT_W+4,PORTRAIT_H+4);
      this.drawHPBar(x, y + PORTRAIT_H + 2, PORTRAIT_W, 6, ch.hp, ch.max_hp, "#3cc");
      this.party_portrait_rects[ch.name] = {x:x-2, y:y-2, w:PORTRAIT_W+4, h:PORTRAIT_H+4};
      x += PORTRAIT_W + gap;
    });
  }

  drawCommandAndLog(options, selectionIdx){
    this.drawBottomBG(true);
    hotspots = []; // バトル描画ごとに作り直す

    // 左：コマンド
    const left_x = PANEL_MARGIN_X;
    const top_y = SCREEN_H - TEXT_AREA_H + 8;
    const usable_h = TEXT_AREA_H - 16;
    const visible = Math.max(1, Math.floor(usable_h / LINE_H));
    const total = options.length;
    const max_top = Math.max(0, total - visible);
    const top_index = Math.min(Math.max(0, selectionIdx - Math.floor(visible/2)), max_top);
    const bottom_index = Math.min(top_index + visible, total);

    for(let draw_i=0,opt_i=top_index; opt_i<bottom_index; opt_i++, draw_i++){
      const [label,_cmd,disabled] = options[opt_i];
      const y = top_y + draw_i * LINE_H;
      if(opt_i===selectionIdx){
        ctx.fillStyle="#464646"; ctx.fillRect(left_x, y, PANEL_LEFT_W, LINE_H-2);
        ctx.strokeStyle="#ff0"; ctx.strokeRect(left_x, y, PANEL_LEFT_W, LINE_H-2);
      }
      ctx.font=font28(); ctx.fillStyle = disabled ? "#b4b4b4" : "#fff";
      const mark = (opt_i===selectionIdx)?"▶ ":"  ";
      const avail = PANEL_LEFT_W - 16;
      const disp = this.elide(mark + label, avail);
      ctx.fillText(disp, left_x+8, y+24-4);

      // クリックで即決定
      hotspots.push({type:"command", index:opt_i, rect:{x:left_x, y:y, w:PANEL_LEFT_W, h:LINE_H-2}});
    }

    // 右：実況
    const right_x = PANEL_MARGIN_X + PANEL_LEFT_W + PANEL_GAP;
    const right_y = SCREEN_H - TEXT_AREA_H + 8;
    const right_w = SCREEN_W - right_x - PANEL_MARGIN_X;
    ctx.font=font28(); ctx.fillStyle="#ff0"; ctx.fillText("実況", right_x, right_y);
    const start_y = right_y + LINE_H;
    const L = Math.max(1, Math.floor((TEXT_AREA_H - 16) / LINE_H) - 1);
    const logs = this.battle_log.slice(-L);
    ctx.fillStyle="#eee";
    logs.forEach((ln,i)=>{
      const size = this.fitSize(ln, right_w, 28, 16);
      ctx.font = font(size);
      ctx.fillText(ln, right_x, start_y + i*LINE_H);
    });

    // 右パネル全体をEnter相当に
    hotspots.push({type:"enter", rect:{x:right_x, y:right_y, w:right_w, h:TEXT_AREA_H - 8}});
  }

  async drawBattle(){
    ctx.clearRect(0,0,SCREEN_W,SCREEN_H);
    const bg = await loadImageScaled(this.is_final_battle?"bg_battle_final.png":"bg_battle.png", SCREEN_W, SCREEN_H - TEXT_AREA_H);
    if(bg) ctx.drawImage(bg,0,0);

    // 敵
    this.enemy_draw_rects = {};
    if(this.is_final_battle && this.enemies.length>=2){
      const left = this.enemies[0], right = this.enemies[1];
      const limg = await loadImageScaled(charImageName(left), 260,190);
      const lalpha = this.applyBlink(left.name, this.alphaFor(left.name, left.isAlive(), this.fade_alpha));
      const lx = SCREEN_W/2 - 330, ly = 90;
      ctx.save(); ctx.globalAlpha=lalpha; ctx.drawImage(limg, lx, ly); ctx.restore();
      this.enemy_draw_rects[left.name] = {x:lx, y:ly, w:260, h:190};
      ctx.font=font28(); ctx.fillStyle="#fee";
      ctx.fillText(`${left.name}  HP:${left.hp}/${left.max_hp}`, SCREEN_W/2 - 360, 44);
      this.drawHPBar(SCREEN_W/2 - 360, 50, 240, 14, left.hp, left.max_hp, "#e33");

      const rimg = await loadImageScaled(charImageName(right), 260,190);
      const ralpha = this.applyBlink(right.name, this.alphaFor(right.name, right.isAlive(), this.fade_alpha));
      const rx = SCREEN_W/2 + 70, ry = 90;
      ctx.save(); ctx.globalAlpha=ralpha; ctx.drawImage(rimg, rx, ry); ctx.restore();
      this.enemy_draw_rects[right.name] = {x:rx, y:ry, w:260, h:190};
      ctx.fillText(`${right.name}  HP:${right.hp}/${right.max_hp}`, SCREEN_W/2 + 40, 44);
      this.drawHPBar(SCREEN_W/2 + 40, 50, 240, 14, right.hp, right.max_hp, "#e33");
    }else{
      const enemy = this.enemies[0];
      const eimg = await loadImageScaled(charImageName(enemy), 300,220);
      const ealpha = this.applyBlink(enemy.name, this.alphaFor(enemy.name, enemy.isAlive(), this.fade_alpha));
      const ex = SCREEN_W/2 - 150, ey = 90;
      ctx.save(); ctx.globalAlpha=ealpha; ctx.drawImage(eimg, ex, ey); ctx.restore();
      this.enemy_draw_rects[enemy.name] = {x:ex, y:ey, w:300, h:220};
      ctx.font=font28(); ctx.fillStyle="#fee";
      const t = `${enemy.name}  HP:${enemy.hp}/${enemy.max_hp}`; const tw=ctx.measureText(t).width;
      ctx.fillText(t, SCREEN_W/2 - tw/2, 44);
      this.drawHPBar(SCREEN_W/2 - 120, 50, 240, 14, enemy.hp, enemy.max_hp, "#e33");
    }

    // 味方
    this.drawPartyStrip();

    // コマンド＋実況（ここで hotspots を詰める）
    const actor = this.currentActor();
    const options = this.buildOptions(actor);
    this.drawCommandAndLog(options, this.selection_index);

    // 浮遊ダメージ
    this.float_texts.forEach(ft=>{
      ctx.save(); ctx.globalAlpha = ft.alpha/255;
      ctx.font = font(36);
      ctx.strokeStyle="#000"; ctx.lineWidth=4; ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle=`rgb(${ft.color[0]},${ft.color[1]},${ft.color[2]})`;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });
  }

  async drawRecruit(){
    hotspots = [{type:"enter", rect:{x:0, y:SCREEN_H - TEXT_AREA_H, w:SCREEN_W, h:TEXT_AREA_H}}];
    ctx.clearRect(0,0,SCREEN_W,SCREEN_H);
    const ch = this.recruiting_member;
    const img = await loadImageScaled(charImageName(ch), 300,220);
    ctx.drawImage(img, SCREEN_W/2-150, 120);
    ctx.font=font48(); ctx.fillStyle="#ff0";
    const title = `${ch.name} が なかまに なった！`;
    const tw = ctx.measureText(title).width;
    ctx.fillText(title, SCREEN_W/2 - tw/2, 68);
    const lines = (this.recruit_lines[ch.name]||["よろしくな！"]).concat(["（Enterで次へ）"]);
    this.drawBottomBG(false);
    ctx.font=font28(); ctx.fillStyle="#eee";
    let y = SCREEN_H - TEXT_AREA_H + 28;
    for(const ln of lines){ ctx.fillText(ln, PANEL_MARGIN_X, y); y+=LINE_H; }
  }

  async drawClear(){
    hotspots = [{type:"enter", rect:{x:0, y:SCREEN_H - TEXT_AREA_H, w:SCREEN_W, h:TEXT_AREA_H}}];
    ctx.clearRect(0,0,SCREEN_W,SCREEN_H);
    ctx.font=font48(); ctx.fillStyle="#ff0";
    const msg="CLEAR!!"; const tw=ctx.measureText(msg).width;
    ctx.fillText(msg, SCREEN_W/2 - tw/2, 120);
    const lines = [
      "カミガタボーイズたち を たおした！",
      "5人の もとに 「A」が かえってきた！",
      "5人は 正真正銘の『Aぇ! group』に！",
      "（Enter で タイトルへ）",
    ];
    ctx.font=font28(); ctx.fillStyle="#eee";
    let y=220; for(const ln of lines){
      const w=ctx.measureText(ln).width;
      ctx.fillText(ln, SCREEN_W/2 - w/2, y); y+=36;
    }
  }
  async drawGameover(){
    hotspots = [{type:"enter", rect:{x:0, y:SCREEN_H - TEXT_AREA_H, w:SCREEN_W, h:TEXT_AREA_H}}];
    ctx.clearRect(0,0,SCREEN_W,SCREEN_H);
    ctx.font=font48(); ctx.fillStyle="#f55";
    const msg="GAME OVER"; const tw=ctx.measureText(msg).width;
    ctx.fillText(msg, SCREEN_W/2 - tw/2, 180);
    ctx.font=font28(); ctx.fillStyle="#eee";
    const hint="（Enter で タイトルへ）"; const w=ctx.measureText(hint).width;
    ctx.fillText(hint, SCREEN_W/2 - w/2, 300);
  }

  // ====== エフェクト進行 ======
  updateEffects(){
    for(const k of Object.keys(this.hit_blink)){ if(this.hit_blink[k]>0) this.hit_blink[k]--; }
    this.float_texts = this.float_texts.filter(ft=>{
      ft.y += ft.vy; ft.alpha = Math.max(0, ft.alpha - 4); ft.life -= 1;
      return ft.life>0 && ft.alpha>0;
    });
  }

  // ====== ループ ======
  update(){ this.updateEffects(); }
  async draw(){
    switch(this.scene){
      case Scene.TITLE: await this.drawTitle(); break;
      case Scene.STORY: await this.drawStory(); break;
      case Scene.ENCOUNTER: await this.drawEncounter(); break;
      case Scene.BATTLE: await this.drawBattle(); break;
      case Scene.RECRUIT: await this.drawRecruit(); break;
      case Scene.CLEAR: await this.drawClear(); break;
      case Scene.GAMEOVER: await this.drawGameover(); break;
    }
  }
}

// ====== 起動 ======
new Game();
