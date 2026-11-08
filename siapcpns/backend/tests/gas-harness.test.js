// Uji backend Apps Script tanpa Google: node backend/tests/gas-harness.test.js
// Mensimulasikan SpreadsheetApp, CacheService, LockService, UrlFetchApp (tokeninfo palsu), dll.
const fs=require('fs'), vm=require('vm'), crypto=require('crypto');
const DIR=require('path').join(__dirname,'..','apps-script');
// ---- in-memory spreadsheet ----
class Sheet{ constructor(n){this.name=n;this.rows=[];this.maxRows=1000;}
  getLastRow(){return this.rows.length}
  getMaxRows(){return this.maxRows}
  appendRow(r){this.rows.push(r.map(v=>v===''?'':String(v)))} // stored as text (format @)
  getRange(r,c,nr=1,nc=1){const sh=this;return{
    getValues(){const out=[];for(let i=0;i<nr;i++){const row=sh.rows[r-1+i]||[];out.push(Array.from({length:nc},(_,j)=>row[c-1+j]===undefined?'':row[c-1+j]))}return out},
    setValues(v){for(let i=0;i<nr;i++){sh.rows[r-1+i]=sh.rows[r-1+i]||[];for(let j=0;j<nc;j++)sh.rows[r-1+i][c-1+j]=v[i][j]===''?'':String(v[i][j])}return this},
    setFontWeight(){return this},setBackground(){return this},setNumberFormat(){return this},
    createTextFinder(t){let exact=false;const tf={matchEntireCell(x){exact=x;return tf},matchCase(){return tf},
      findAll(){const res=[];for(let i=0;i<nr;i++){const v=String((sh.rows[r-1+i]||[])[c-1]??'');if(exact?v===t:v.includes(t))res.push({getRow:()=>r+i})}return res},
      findNext(){return tf.findAll()[0]||null}};return tf}
  }}
  setFrozenRows(){}
}
const sheets={}; const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n)),getSheets:()=>Object.values(sheets),deleteSheet:s=>delete sheets[s.name]};
const props={SPREADSHEET_ID:'sheet123',GOOGLE_CLIENT_ID:'client-abc.apps.googleusercontent.com'};
const cacheStore={};
let tokeninfoCalls=0;
const tokens={ // fake id tokens -> claims
 'h.alice.s':{aud:props.GOOGLE_CLIENT_ID,iss:'https://accounts.google.com',exp:Math.floor(Date.now()/1000)+3000,email:'Alice@Gmail.com',email_verified:'true',name:'Alice Wijaya',picture:'https://x/p.jpg',sub:'1'},
 'h.wrongaud.s':{aud:'other',iss:'accounts.google.com',exp:Math.floor(Date.now()/1000)+3000,email:'eve@x.com',email_verified:'true'},
 'h.expired.s':{aud:props.GOOGLE_CLIENT_ID,iss:'accounts.google.com',exp:Math.floor(Date.now()/1000)-10,email:'old@x.com',email_verified:'true'},
};
const ctx={
 console, JSON, Math, Date, Number, String, Object, Array, isNaN, encodeURIComponent,
 SpreadsheetApp:{openById:id=>{if(id!=='sheet123')throw new Error('bad id');return ss}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,getProperties:()=>props})},
 CacheService:{getScriptCache:()=>({get:k=>cacheStore[k]??null,put:(k,v)=>{cacheStore[k]=v}})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 UrlFetchApp:{fetch:(url)=>{tokeninfoCalls++;const t=decodeURIComponent(url.split('id_token=')[1]);const c=tokens[t];
   return {getResponseCode:()=>c?200:400,getContentText:()=>JSON.stringify(c||{error:'invalid_token'})}}},
 Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],
   base64EncodeWebSafe:b=>Buffer.from(b.map(x=>x&255)).toString('base64url'),DigestAlgorithm:{SHA_256:1},
   formatDate:(d,tz,f)=>{const x=new Date(d);return f==='yyyyMMdd'?x.toISOString().slice(0,10).replace(/-/g,''):x.toISOString().slice(0,10)}},
 ContentService:{createTextOutput:t=>({t,setMimeType(){return this}}),MimeType:{JSON:'json'}},
 Logger:{log:(...a)=>console.log('  [log]',...a)},
};
vm.createContext(ctx);
for(const f of fs.readdirSync(DIR).filter(f=>f.endsWith('.gs')).sort()) vm.runInContext(fs.readFileSync(DIR+'/'+f,'utf8'),ctx,{filename:f});
const post=(action,payload,token)=>JSON.parse(ctx.doPost({parameter:{},postData:{contents:JSON.stringify({action,payload,token})}}).t);
let fails=0; const check=(name,cond,extra)=>{console.log((cond?'PASS ':'FAIL ')+name+(cond?'':'  '+JSON.stringify(extra)));if(!cond)fails++};

ctx.setupSheets();
check('setup creates sheets', ['users','profiles','assessments','waitlist'].every(n=>sheets[n]&&sheets[n].rows.length===1));
check('ping', post('ping').ok);
check('unknown action', post('nope').error.code==='UNKNOWN_ACTION');
check('getMe without token -> UNAUTHENTICATED', post('getMe',{}).error.code==='UNAUTHENTICATED');
check('wrong audience rejected', post('getMe',{},'h.wrongaud.s').error.code==='UNAUTHENTICATED');
check('expired token rejected', post('getMe',{},'h.expired.s').error.code==='UNAUTHENTICATED');
check('garbage token', post('getMe',{},'abc').error.code==='UNAUTHENTICATED');

const assess={version:'2026.1',total:42,levelId:'sedang-bersiap',durationSec:95,aspects:[{id:'alur',score:17},{id:'dokumen',score:11},{id:'kemampuan',score:0},{id:'waltu',score:9},{id:'waktu',score:14}],answers:{q1:'a',q9:'c',bad:'z'},completedAt:'2026-11-07T08:00:00Z'};
let r=post('login',{assessment:assess},'h.alice.s');
check('login ok', r.ok, r);
check('new user created', r.data.isNew===true && r.data.user.email==='alice@gmail.com' && r.data.user.plan==='free', r.data);
check('assessment attached', !!r.data.attachedAssessmentId && r.data.latestAssessment.total===42, r.data);
check('profile incomplete', r.data.profileComplete===false);
const urow=sheets.users.rows[1]; check('user row stored', urow[1]==='alice@gmail.com' && urow[5]==='free', urow);
const arow=sheets.assessments.rows[1]; check('answers sanitized', arow[10]==='{"q1":"a","q9":"c"}', arow[10]);

r=post('login',{},'h.alice.s'); check('second login not new', r.ok && r.data.isNew===false && sheets.users.rows.length===2, r);
check('token verification cached', tokeninfoCalls<=4, tokeninfoCalls);

check('bad profile rejected', post('saveProfile',{education:'X',major:'a',minutesPerDay:30,daysPerWeek:5},'h.alice.s').error.code==='BAD_REQUEST');
check('bad minutes rejected', post('saveProfile',{education:'D4/S1',major:'Akuntansi',minutesPerDay:33,daysPerWeek:5},'h.alice.s').error.code==='BAD_REQUEST');
const prof={education:'D4/S1',major:'=HYPERLINK("x")',targetFormation:'Pranata Komputer',targetProvince:'Sulawesi Selatan',testDate:'2027-01-20',targetType:'kompetitif',minutesPerDay:45,daysPerWeek:5,reminderTime:'19:30'};
r=post('saveProfile',prof,'h.alice.s'); check('profile saved', r.ok && r.data.profileComplete===true, r);
check('formula injection neutralized', sheets.profiles.rows[1][2].startsWith("'="), sheets.profiles.rows[1][2]);
r=post('saveProfile',{...prof,major:'Akuntansi',minutesPerDay:60},'h.alice.s');
check('profile upsert (no duplicate)', r.ok && sheets.profiles.rows.length===2 && r.data.profile.minutesPerDay===60, sheets.profiles.rows);
r=post('getMe',{},'h.alice.s'); check('getMe returns profile', r.ok && r.data.profile.testDate==='2027-01-20' && r.data.profile.major==='Akuntansi', r);

check('anon assessment saved', post('saveAssessment',assess).data.saved===true && sheets.assessments.rows.length===3);
check('tampered total rejected', post('saveAssessment',{...assess,total:99}).error.code==='BAD_REQUEST');
check('aspect over max rejected', post('saveAssessment',{...assess,aspects:[{id:'alur',score:30},{id:'dokumen',score:0},{id:'kemampuan',score:0},{id:'waktu',score:12}]}).error.code==='BAD_REQUEST');
check('bad level rejected', post('saveAssessment',{...assess,levelId:'x'}).error.code==='BAD_REQUEST');
check('waitlist bad email', post('joinWaitlist',{email:'x'}).error.code==='INVALID_EMAIL');
post('joinWaitlist',{email:'A@b.co'}); post('joinWaitlist',{email:'a@b.co'});
check('waitlist dedup', sheets.waitlist.rows.length===2, sheets.waitlist.rows);
check('large body rejected', JSON.parse(ctx.doPost({parameter:{},postData:{contents:'x'.repeat(100001)}}).t).error.code==='BAD_REQUEST');
check('internal error hidden', (()=>{props.SPREADSHEET_ID='nope';ctx._ssCache=null;const x=post('getMe',{},'h.alice.s');props.SPREADSHEET_ID='sheet123';return x.error.code==='SERVER_ERROR'&&!x.error.message.includes('bad id')})());
console.log(fails? `\n${fails} FAILED` : '\nALL PASSED');
