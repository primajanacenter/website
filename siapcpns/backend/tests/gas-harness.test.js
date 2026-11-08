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
  deleteRow(r){this.rows.splice(r-1,1)}
  getLastColumn(){return this.rows.reduce((m,r)=>Math.max(m,r.length),0)}
  setName(n){this.name=n;return this}
}
function makeSS(store){return {getSheetByName:n=>store[n]||null,insertSheet:n=>(store[n]=new Sheet(n)),getSheets:()=>Object.values(store),deleteSheet:s=>delete store[s.name]};}
const sheets={}; const ss=makeSS(sheets); const qsheets={}; const qss=makeSS(qsheets);
const files={}; // id -> {ss, name, folder}
function newFile(id,name,folder,store={}){const s2=makeSS(store); s2.getId=()=>id; s2.getUrl=()=>'https://x/'+id; files[id]={ss:s2,name,folder,store}; return s2;}
const props={SPREADSHEET_ID:'sheet123',QUESTIONS_SPREADSHEET_ID:'qsheet456',GOOGLE_CLIENT_ID:'client-abc.apps.googleusercontent.com'};
const cacheStore={};
let tokeninfoCalls=0;
const tokens={ // fake id tokens -> claims
 'h.alice.s':{aud:props.GOOGLE_CLIENT_ID,iss:'https://accounts.google.com',exp:Math.floor(Date.now()/1000)+3000,email:'Alice@Gmail.com',email_verified:'true',name:'Alice Wijaya',picture:'https://x/p.jpg',sub:'1'},
 'h.bob.s':{aud:props.GOOGLE_CLIENT_ID,iss:'accounts.google.com',exp:Math.floor(Date.now()/1000)+3000,email:'bob@x.com',email_verified:'true',name:'Bob'},
 'h.wrongaud.s':{aud:'other',iss:'accounts.google.com',exp:Math.floor(Date.now()/1000)+3000,email:'eve@x.com',email_verified:'true'},
 'h.expired.s':{aud:props.GOOGLE_CLIENT_ID,iss:'accounts.google.com',exp:Math.floor(Date.now()/1000)-10,email:'old@x.com',email_verified:'true'},
};
const ctx={
 console, JSON, Math, Date, Number, String, Object, Array, isNaN, encodeURIComponent,
 SpreadsheetApp:{openById:id=>{if(id==='sheet123')return ss;if(id==='qsheet456')return qss;if(files[id])return files[id].ss;throw new Error('bad id')},
   create:name=>{const id='new'+Object.keys(files).length;const st={};const s2=newFile(id,name,null,st);st['Sheet1']=new Sheet('Sheet1');s2.getSheets=()=>Object.values(st);const orig=st['Sheet1'];orig.setName=n=>{delete st['Sheet1'];orig.name=n;st[n]=orig;return orig};return s2}},
 DriveApp:{getFolderById:fid=>({_id:fid,getFilesByType:()=>{const list=Object.entries(files).filter(([id,f])=>f.folder===fid).map(([id,f])=>({getId:()=>id,getName:()=>f.name,isTrashed:()=>false}));let i=0;return {hasNext:()=>i<list.length,next:()=>list[i++]}}}),
   getFileById:id=>({moveTo:folder=>{files[id].folder=folder._id}})},
 MimeType:{GOOGLE_SHEETS:'sheets'},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,getProperties:()=>props})},
 CacheService:{getScriptCache:()=>({get:k=>cacheStore[k]??null,put:(k,v)=>{cacheStore[k]=v},putAll:m=>Object.assign(cacheStore,m),getAll:ks=>Object.fromEntries(ks.filter(k=>k in cacheStore).map(k=>[k,cacheStore[k]])),remove:k=>{delete cacheStore[k]}})},
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

// ================= Fase 3: tryout =================
ctx.setupSheets(); ctx.setupQuestionSheets(); ctx.importDemoPackage();
check('demo imported', qsheets.questions.rows.length===16 && qsheets.packages.rows.length===2);
ctx.importDemoPackage();
check('re-import replaces (no duplicates)', qsheets.questions.rows.length===16 && qsheets.packages.rows.length===2);
let info=post('getTryoutInfo',{},'h.alice.s');
check('tryout info', info.ok && info.data.packages.length===1 && info.data.packages[0].questionCount===15 && info.data.packages[0].canStart, info);
let st=post('startAttempt',{packageId:'DEMO-01'},'h.alice.s');
check('start attempt', st.ok && st.data.questions.length===15, st);
const leak=JSON.stringify(st.data.questions);
check('no answer keys leaked', !/"answer"|"score"|"explanation"/.test(leak), leak.slice(0,200));
let st2=post('startAttempt',{packageId:'DEMO-01'},'h.alice.s');
check('start again resumes same attempt', st2.data.attemptId===st.data.attemptId && sheets.attempts.rows.length===2);
const qs=st.data.questions; const demo=ctx.getDemoPackageData_();
// answer: all TWK correct, TIU 2 correct, TKP best options
const ans={}; qs.forEach((q,i)=>{const src=demo.questions[i]; if(q.subtest==='twk')ans[q.id]=src.answer; else if(q.subtest==='tiu'){ if(i<7) ans[q.id]=src.answer; else ans[q.id]= src.answer==='a'?'b':'a'; } else { const best=src.scores.indexOf(5); ans[q.id]='abcde'[best]; }});
ans['FAKE-1']='a'; ans[qs[0].id+'x']='b';
let sp=post('saveProgress',{attemptId:st.data.attemptId,answers:{[qs[0].id]:'a',bogus:'z'}},'h.alice.s');
check('save progress sanitized', sp.ok && sp.data.count===1, sp);
check('other user cannot read attempt', post('getReport',{attemptId:st.data.attemptId},'h.bob.s').error.code==='NOT_FOUND');
check('report before submit blocked', post('getReport',{attemptId:st.data.attemptId},'h.alice.s').error.code==='NOT_FINISHED');
let sub=post('submitAttempt',{attemptId:st.data.attemptId,answers:ans},'h.alice.s');
check('submit ok', sub.ok, sub);
let rep=post('getReport',{attemptId:st.data.attemptId},'h.alice.s');
const S={}; (rep.data?rep.data.subtests:[]).forEach(x=>S[x.id]=x);
check('scores correct (TWK 25, TIU 10, TKP 25)', S.twk.score===25 && S.tiu.score===10 && S.tkp.score===25 && rep.data.total===60, rep.data&&rep.data.subtests);
check('passing flags (TWK ok, TIU fail, TKP ok)', S.twk.passed && !S.tiu.passed && S.tkp.passed && rep.data.passedAll===false);
check('free: only weakest topic open', rep.data.topics.filter(t=>!t.locked).length===1 && rep.data.topicsLocked===true && rep.data.topics[0].name.length>0, rep.data.topics);
check('free: review limited & wrong only', rep.data.review.length===3 && rep.data.review.every(r=>r.points<5) && rep.data.reviewLocked, rep.data.review.map(r=>r.number));
let sub2=post('submitAttempt',{attemptId:st.data.attemptId,answers:{}},'h.alice.s');
let rep2=post('getReport',{attemptId:st.data.attemptId},'h.alice.s');
check('resubmit is idempotent', sub2.ok && rep2.data.total===60);
// late submission uses server-saved answers
let st3=post('startAttempt',{packageId:'DEMO-01'},'h.alice.s');
check('demo package unlimited -> new attempt', st3.ok && st3.data.attemptId!==st.data.attemptId);
post('saveProgress',{attemptId:st3.data.attemptId,answers:{[qs[0].id]:demo.questions[0].answer}},'h.alice.s');
const row3=sheets.attempts.rows.find(r=>r[0]===st3.data.attemptId); row3[6]=new Date(Date.now()-10*60000).toISOString();
let sub3=post('submitAttempt',{attemptId:st3.data.attemptId,answers:ans},'h.alice.s');
let rep3=post('getReport',{attemptId:st3.data.attemptId},'h.alice.s');
check('late submit uses saved answers only', sub3.ok && rep3.data.total===5 && rep3.data.finishMode==='late', rep3.data&&rep3.data.total);
// expired in-progress auto-graded on info
let st4=post('startAttempt',{packageId:'DEMO-01'},'h.alice.s');
const row4=sheets.attempts.rows.find(r=>r[0]===st4.data.attemptId); row4[6]=new Date(Date.now()-10*60000).toISOString();
info=post('getTryoutInfo',{},'h.alice.s');
check('expired attempt auto-finalized', info.data.packages[0].inProgress===null && sheets.attempts.rows.find(r=>r[0]===st4.data.attemptId)[4]==='submitted');
// free limit on a diagnostic package
qsheets.packages.rows.push(['DIAG-01','Diagnostik','diagnostic','',100,'','','',1,'live',1]);
qsheets.questions.rows.push(...demo.questions.map((q,i)=>['DIAG-01-'+(i+1),'DIAG-01',String(q.number),q.subtest,q.topic_id,String(q.level),q.text,q.context||'',...q.options,q.answer||'',...(q.scores||['','','','','']).map(String),q.explanation,'live','test']));
ctx.refreshQuestionCache(); delete cacheStore['pkgs'];
let d1=post('startAttempt',{packageId:'DIAG-01'},'h.alice.s'); post('submitAttempt',{attemptId:d1.data.attemptId,answers:{}},'h.alice.s');
let d2=post('startAttempt',{packageId:'DIAG-01'},'h.alice.s');
check('free attempt limit enforced', d2.error && d2.error.code==='FORBIDDEN', d2);
info=post('getTryoutInfo',{},'h.alice.s');
const diag=info.data.packages.find(p=>p.packageId==='DIAG-01');
check('diag default passing grade & lock reason', diag.pg.twk===65 && diag.lockReason==='FREE_LIMIT' && !diag.canStart, diag);
check('getMe latestAttempt', post('getMe',{},'h.alice.s').data.latestAttempt.status==='submitted');
check('unknown package', post('startAttempt',{packageId:'NOPE'},'h.alice.s').error.code==='NOT_FOUND');


// ================= Mode folder: 1 file = 1 paket =================
function pkgFile(id,name,pkgRow,qRows,folder='folderA'){const st={};newFile(id,name,folder,st);
  st.packages=new Sheet('packages'); st.packages.rows=[['package_id','title','type','description','duration_min','pg_twk','pg_tiu','pg_tkp','free_attempts','status','order'],pkgRow];
  st.questions=new Sheet('questions'); st.questions.rows=qRows; return st;}
const QH=['question_id','package_id','number','subtest','topic_id','level','text','context','option_a','option_b','option_c','option_d','option_e','answer','score_a','score_b','score_c','score_d','score_e','explanation','status','source'];
// file with SHUFFLED column order to prove header-based reading
const QH2=[...QH].reverse();
const mk=(pid,h)=>demo.questions.map(q=>{const o={question_id:pid+'-'+q.number,package_id:pid,number:q.number,subtest:q.subtest,topic_id:q.topic_id,level:q.level,text:q.text,context:q.context||'',answer:q.answer||'',explanation:q.explanation,status:'live',source:'t'};'abcde'.split('').forEach((l,i)=>{o['option_'+l]=q.options[i];o['score_'+l]=q.scores?q.scores[i]:''});return h.map(k=>o[k]);});
pkgFile('f1','Paket P-01',['P-01','Paket Satu','diagnostic','',100,'','','',1,'live',1],[QH,...mk('P-01',QH)]);
pkgFile('f2','Paket P-02',['P-02','Paket Dua','diagnostic','',90,'','','','','live',2],[QH2,...mk('P-02',QH2)]);
pkgFile('f3','Paket P-03 draft',['P-03','Draft','diagnostic','',100,'','','','','draft',3],[QH,...mk('P-03',QH)]);
pkgFile('f4','Duplikat',['P-01','Duplikat P-01','diagnostic','',100,'','','','','live',4],[QH,...mk('P-01',QH)]);
const bad={}; newFile('f5','Rusak','folderA',bad); // file tanpa sheet
pkgFile('f6','Folder lain',['X-01','Lain','diagnostic','',100,'','','','','live',1],[QH,...mk('X-01',QH)],'folderB');
props.QUESTIONS_FOLDER_ID='folderA';
ctx.refreshQuestionCache();
info=post('getTryoutInfo',{},'h.alice.s');
const ids=info.data.packages.map(p=>p.packageId);
check('folder: live packages from files + bank merged', ids.includes('P-01')&&ids.includes('P-02')&&ids.includes('DEMO-01')&&ids.includes('DIAG-01'), ids);
check('folder: draft hidden, other folder ignored', !ids.includes('P-03')&&!ids.includes('X-01'), ids);
check('folder: duplicate id kept once', ids.filter(x=>x==='P-01').length===1 && info.data.packages.find(p=>p.packageId==='P-01').title==='Paket Satu');
check('folder: fileId not exposed', !JSON.stringify(info.data).includes('fileId'));
check('folder: shuffled columns read correctly', info.data.packages.find(p=>p.packageId==='P-02').questionCount===15 && info.data.packages.find(p=>p.packageId==='P-02').durationMin===90);
let fst=post('startAttempt',{packageId:'P-02'},'h.bob.s');
const fq=fst.data.questions; const fans={}; fq.forEach((q,i)=>{const src=demo.questions[i]; fans[q.id]= src.answer || 'abcde'[src.scores.indexOf(5)];});
post('submitAttempt',{attemptId:fst.data.attemptId,answers:fans},'h.bob.s');
let frep=post('getReport',{attemptId:fst.data.attemptId},'h.bob.s');
check('folder: perfect answers score 75 (shuffled columns), default PG applied', frep.data.total===75 && frep.data.subtests[0].passingGrade===65, frep.data&&frep.data.total);
// new file appears after refresh
pkgFile('f7','Paket P-07',['P-07','Paket Tujuh','diagnostic','',100,'','','','','live',7],[QH,...mk('P-07',QH)]);
check('folder: new file hidden until cache refresh', !post('getTryoutInfo',{},'h.alice.s').data.packages.some(p=>p.packageId==='P-07'));
ctx.warmQuestionCache();
check('folder: new file visible after warm', post('getTryoutInfo',{},'h.alice.s').data.packages.some(p=>p.packageId==='P-07'));
// folder only mode (no single bank)
delete props.QUESTIONS_SPREADSHEET_ID; ctx.refreshQuestionCache();
const ids2=post('getTryoutInfo',{},'h.alice.s').data.packages.map(p=>p.packageId);
check('folder-only mode works', ids2.includes('P-01') && !ids2.includes('DEMO-01'), ids2);
ctx.createDemoPackageFile();
check('createDemoPackageFile into folder', post('getTryoutInfo',{},'h.alice.s').data.packages.some(p=>p.packageId==='DEMO-01'));
ctx.checkQuestionFolder();
delete props.QUESTIONS_FOLDER_ID; ctx.clearPackageCache_(null);
check('no source -> clear config error', post('getTryoutInfo',{},'h.alice.s').error.code==='CONFIG_MISSING');

console.log(fails? `\n${fails} FAILED` : '\nALL PASSED');
