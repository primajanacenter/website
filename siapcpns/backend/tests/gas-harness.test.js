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
// ---- Mayar API V2 palsu ----
const mayar={payments:{},calls:[],failCreate:false,rejectRedirect:false,seq:0};
function mayarMock(url,opts){
  const path=url.split('/hl/v2')[1]; const method=(opts.method||'get').toLowerCase();
  const body=opts.payload?JSON.parse(opts.payload):null; mayar.calls.push({method,path,body,auth:(opts.headers||{}).Authorization});
  const reply=(code,obj)=>({getResponseCode:()=>code,getContentText:()=>JSON.stringify(obj)});
  if((opts.headers||{}).Authorization!=='Bearer test-key') return reply(401,{statusCode:401,messages:'Unauthorized'});
  if(method==='post'&&path==='/payments/create'){
    if(mayar.failCreate) return reply(500,{statusCode:500,messages:'Internal error'});
    if(mayar.rejectRedirect&&body.redirectUrl) return reply(200,{statusCode:400,messages:'redirectUrl is not supported on payment requests and was not saved'});
    const id='pr_'+(++mayar.seq), tid='tx_'+mayar.seq;
    mayar.payments[id]={id,transactionId:tid,status:'unpaid',amount:body.amount,body};
    return reply(200,{statusCode:200,messages:'success',data:{id,transactionId:tid,link:'https://sandbox.myr.id/pl/'+id}});
  }
  let m=path.match(/^\/payments\/(.+)$/);
  if(method==='get'&&m){const p=mayar.payments[decodeURIComponent(m[1])];return p?reply(200,{statusCode:200,messages:'success',data:{id:p.id,status:p.status,amount:p.amount,transactions:[]}}):reply(404,{statusCode:404,messages:'not found'});}
  m=path.match(/^\/transactions\/(.+)$/);
  if(method==='get'&&m){const p=Object.values(mayar.payments).find(x=>x.transactionId===decodeURIComponent(m[1]));return p?reply(200,{statusCode:200,messages:'success',data:{id:p.transactionId,status:p.status,amount:p.amount}}):reply(404,{statusCode:404,messages:'Transaction not found'});}
  if(method==='post'&&path==='/webhooks/update') return reply(200,{statusCode:200,messages:'success'});
  return reply(404,{statusCode:404,messages:'unknown'});
}
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
 UrlFetchApp:{fetch:(url,opts)=>{if(url.includes('/hl/v2/'))return mayarMock(url,opts||{});tokeninfoCalls++;const t=decodeURIComponent(url.split('id_token=')[1]);const c=tokens[t];
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
// ================= Fase 4: latihan harian =================
ctx.setupSheets();
pkgFile('lat','Bank Latihan',['LAT-01','Bank Latihan Harian 1','latihan','',"",'','','','','live',90],[QH,...mk('LAT-01',QH)]);
ctx.refreshQuestionCache();
check('latihan bank hidden from tryout list', !post('getTryoutInfo',{},'h.alice.s').data.packages.some(p=>p.packageId==='LAT-01'));
check('latihan bank cannot start as tryout', post('startAttempt',{packageId:'LAT-01'},'h.alice.s').error.code==='NOT_FOUND');
const carol='h.carol.s'; tokens[carol]={aud:props.GOOGLE_CLIENT_ID,iss:'accounts.google.com',exp:Math.floor(Date.now()/1000)+3000,email:'carol@x.com',email_verified:'true',name:'Carol'};
let td=post('getToday',{},carol);
check('getToday fresh user', td.ok && td.data.practice.remaining===10 && td.data.practice.doneToday===0 && td.data.streak===0 && td.data.focusTopics.length===3 && td.data.practice.bankSize===15, td);
let ps=post('startPractice',{},carol);
check('startPractice 10 soal tanpa kunci', ps.ok && ps.data.questions.length===10 && !/"answer"|"score"|"explanation"/.test(JSON.stringify(ps.data.questions)), ps);
const key=Object.fromEntries(demo.questions.map(q=>['LAT-01-'+q.number,q]));
const right=q=>{const d=key[q.id]; return d.answer || 'abcde'[d.scores.indexOf(5)];};
const wrong=q=>{const d=key[q.id]; return d.answer ? (d.answer==='a'?'b':'a') : 'abcde'[d.scores.indexOf(1)];};
let a1=post('answerPractice',{sessionId:ps.data.sessionId,questionId:ps.data.questions[0].id,answer:right(ps.data.questions[0])},carol);
check('jawaban benar dinilai', a1.ok && a1.data.correct && a1.data.points===5 && a1.data.explanation.length>10, a1);
let a1b=post('answerPractice',{sessionId:ps.data.sessionId,questionId:ps.data.questions[0].id,answer:'a'},carol);
check('jawab ulang tidak dihitung dua kali', a1b.ok && sheets.practice_answers.rows.length===2);
let a2=post('answerPractice',{sessionId:ps.data.sessionId,questionId:ps.data.questions[1].id,answer:wrong(ps.data.questions[1])},carol);
check('jawaban salah dinilai', a2.ok && !a2.data.correct && a2.data.bestAnswer===right(ps.data.questions[1]), a2);
const wrongId=ps.data.questions[1].id;
check('soal di luar sesi ditolak', post('answerPractice',{sessionId:ps.data.sessionId,questionId:'LAT-01-999',answer:'a'},carol).error.code==='BAD_REQUEST');
check('sesi milik orang lain ditolak', post('answerPractice',{sessionId:ps.data.sessionId,questionId:ps.data.questions[2].id,answer:'a'},'h.bob.s').error.code==='SESSION_EXPIRED');
for (let i=2;i<10;i++) post('answerPractice',{sessionId:ps.data.sessionId,questionId:ps.data.questions[i].id,answer:right(ps.data.questions[i])},carol);
td=post('getToday',{},carol);
check('kuota habis setelah 10', td.data.practice.doneToday===10 && td.data.practice.remaining===0 && td.data.streak===1, td.data.practice);
check('startPractice ditolak saat kuota habis', post('startPractice',{},carol).error.code==='DAILY_LIMIT');
check('fokus topik memuat topik yang salah', td.data.focusTopics.some(t=>t.topicId===key[wrongId].topic_id), td.data.focusTopics);
check('level topik tersedia', Object.keys(td.data.topicLevels).length>=5);
// geser riwayat ke 2 hari lalu → kuota pulih, soal salah diprioritaskan
const two=new Date(Date.now()-2*86400000); const dTwo=two.toISOString().slice(0,10);
sheets.practice_answers.rows.slice(1).forEach(r=>{r[1]=dTwo; r[8]=two.toISOString();});
let ps2=post('startPractice',{},carol);
check('hari baru: kuota pulih & soal salah muncul pertama', ps2.ok && ps2.data.questions[0].id===wrongId, ps2.data&&ps2.data.questions.map(q=>q.id));
td=post('getToday',{},carol);
check('streak putus bila kemarin tidak latihan', td.data.streak===0, td.data.streak);
let pst=post('startPractice',{topicId:'tiu-deret'},carol);
check('latihan per topik', pst.ok && pst.data.questions.every(q=>q.topicId==='tiu-deret'), pst.data&&pst.data.questions.map(q=>q.topicId));
// premium tanpa batas harian
const crow=sheets.users.rows.find(r=>r[1]==='carol@x.com'); crow[5]='premium'; crow[6]=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
sheets.practice_answers.rows.slice(1).forEach(r=>{r[1]=new Date().toISOString().slice(0,10);});
for (let i=0;i<5;i++) sheets.practice_answers.rows.push([...sheets.practice_answers.rows[1]]);
td=post('getToday',{},carol);
check('premium: tanpa batas harian', td.data.practice.dailyLimit===null && post('startPractice',{},carol).ok, td.data.practice);


// ================= Fase 5: pembayaran Mayar =================
Object.assign(props,{MAYAR_API_KEY:'test-key',MAYAR_BASE_URL:'https://api.mayar.io',WEBHOOK_TOKEN:'tok_rahasia_panjang_1234567890',APP_BASE_URL:'https://app.contoh.id'});
tokens['h.dina.s']={aud:props.GOOGLE_CLIENT_ID,iss:'accounts.google.com',exp:Math.floor(Date.now()/1000)+3000,email:'dina@x.com',email_verified:'true',name:'Dina'};
const dina='h.dina.s';
ctx.setupSheets();
check('setup: sheet pembayaran & paket awal', sheets.transactions && sheets.webhook_log && sheets.plans.rows.length===4, sheets.plans&&sheets.plans.rows.length);
ctx.setupSheets();
check('setup ulang tidak menggandakan paket', sheets.plans.rows.length===4);
let gp=post('getPlans',{});
check('getPlans tanpa login', gp.ok && gp.data.plans.length===3 && gp.data.plans[1].planId==='P3M' && gp.data.plans[1].price===119000 && gp.data.env==='sandbox' && gp.data.current===null, gp);
post('login',{},dina);
check('checkout butuh login', post('createCheckout',{planId:'P3M'}).error.code==='UNAUTHENTICATED');
check('paket tidak dikenal ditolak', post('createCheckout',{planId:'P99'},dina).error.code==='BAD_REQUEST');
let co5=post('createCheckout',{planId:'P3M',amount:1000,price:1},dina);
const trxRow=()=>sheets.transactions.rows.find(r=>r[0]===co5.data.trxId);
check('checkout dibuat', co5.ok && co5.data.paymentUrl.startsWith('https://sandbox.myr.id/') && trxRow()[7]==='pending', co5);
const lastCreate=mayar.calls.filter(c=>c.path==='/payments/create').pop();
check('nominal dari server, bukan dari frontend', lastCreate.body.amount===119000 && trxRow()[6]==='119000', lastCreate.body);
check('redirectUrl ke halaman status', lastCreate.body.redirectUrl==='https://app.contoh.id/pages/status-bayar.html?trx='+co5.data.trxId && lastCreate.body.email==='dina@x.com');
let co2=post('createCheckout',{planId:'P3M'},dina);
check('checkout ulang memakai link yang sama', co2.ok && co2.data.trxId===co5.data.trxId && co2.data.reused===true, co2);
const clearThrottle=()=>Object.keys(cacheStore).filter(k=>k.startsWith('pchk_')).forEach(k=>delete cacheStore[k]);
let pst5=post('getPaymentStatus',{trxId:co5.data.trxId},dina);
check('status pending sebelum bayar', pst5.ok && pst5.data.transaction.status==='pending' && pst5.data.plan==='free', pst5);
check('transaksi orang lain tidak bisa dibaca', post('getPaymentStatus',{trxId:co5.data.trxId},'h.bob.s').error.code==='NOT_FOUND');
const hook=(token,obj)=>ctx.doPost({parameter:{hook:'mayar',token},postData:{contents:JSON.stringify(obj)}});
const prId=trxRow()[8], txId=trxRow()[9];
const payload={event:'payment.received',data:{id:txId,transactionId:txId,status:'SUCCESS',transactionStatus:'paid',customerEmail:'dina@x.com',amount:119000,productId:prId}};
hook('salah',payload);
check('webhook token salah diabaikan', trxRow()[7]==='pending' && sheets.webhook_log.rows.length===1);
hook(props.WEBHOOK_TOKEN,payload);
check('webhook palsu (Mayar belum lunas) tidak mengaktifkan premium', trxRow()[7]==='pending' && sheets.webhook_log.rows.length===2 && String(sheets.webhook_log.rows[1][4]).startsWith('not_paid'), sheets.webhook_log.rows[1]);
mayar.payments[prId].status='paid';
hook(props.WEBHOOK_TOKEN,payload);
const drow=()=>sheets.users.rows.find(r=>r[1]==='dina@x.com');
const days=(iso)=>Math.round((new Date(iso)-Date.now())/86400000);
check('webhook valid → premium 90 hari', trxRow()[7]==='paid' && trxRow()[14]==='ya' && drow()[5]==='premium' && days(drow()[6])===90, {trx:trxRow(),user:drow()});
const until1=drow()[6];
hook(props.WEBHOOK_TOKEN,payload); clearThrottle(); post('getPaymentStatus',{trxId:co5.data.trxId},dina);
check('webhook & cek ulang tidak menambah premium dua kali', drow()[6]===until1 && sheets.webhook_log.rows[3][4]==='already_processed', sheets.webhook_log.rows[3]);
pst5=post('getPaymentStatus',{trxId:co5.data.trxId},dina);
check('status lunas & plan premium', pst5.data.transaction.status==='paid' && pst5.data.plan==='premium' && pst5.data.premiumUntil, pst5.data);
check('getPlans menampilkan status premium & riwayat', (()=>{const g=post('getPlans',{},dina).data;return g.current.plan==='premium'&&g.history[0].status==='paid'&&g.pending===null;})());
// pembelian kedua: diperpanjang dari tanggal premium yang masih berlaku
co5=post('createCheckout',{planId:'P1M'},dina); mayar.payments[trxRow()[8]].status='paid'; clearThrottle();
pst5=post('getPaymentStatus',{trxId:co5.data.trxId},dina);
check('perpanjangan ditumpuk dari masa aktif (90+30)', pst5.data.transaction.status==='paid' && days(drow()[6])===120, days(drow()[6]));
// rekonsiliasi tanpa webhook
co5=post('createCheckout',{planId:'P6M'},dina);
const recRow=trxRow(); mayar.payments[recRow[8]].status='paid';
let rc5=ctx.reconcilePayments();
check('rekonsiliasi mengaktifkan tanpa webhook', trxRow()[7]==='paid' && trxRow()[16]==='reconcile' && days(drow()[6])===300 && rc5.fulfilled===1, {rc5,row:trxRow()});
// kedaluwarsa
co5=post('createCheckout',{planId:'P1M'},dina); trxRow()[12]=new Date(Date.now()-60000).toISOString();
rc5=ctx.reconcilePayments();
check('link lewat batas waktu ditandai kedaluwarsa', trxRow()[7]==='expired', trxRow());
// redirectUrl ditolak → ulang tanpa redirect
mayar.rejectRedirect=true; tokens['h.eka.s']={...tokens['h.dina.s'],email:'eka@x.com',name:'Eka'};
co5=post('createCheckout',{planId:'P1M'},'h.eka.s');
check('redirectUrl tidak didukung → dibuat ulang tanpa redirect', co5.ok && co5.data.redirect===false && !mayar.calls.filter(c=>c.path==='/payments/create').pop().body.redirectUrl, co5);
mayar.rejectRedirect=false;
// Mayar error
mayar.failCreate=true; tokens['h.fani.s']={...tokens['h.dina.s'],email:'fani@x.com',name:'Fani'};
co5=post('createCheckout',{planId:'P1M'},'h.fani.s');
check('Mayar gagal → PAYMENT_ERROR & transaksi failed', !co5.ok && co5.error.code==='PAYMENT_ERROR' && sheets.transactions.rows[sheets.transactions.rows.length-1][7]==='failed', co5);
mayar.failCreate=false;
check('API key tidak pernah dikirim ke frontend', !JSON.stringify(post('getPlans',{},dina)).includes('test-key'));
// batas pembuatan checkout per jam
tokens['h.gita.s']={...tokens['h.dina.s'],email:'gita@x.com',name:'Gita'};
['P1M','P3M','P6M'].forEach(p=>post('createCheckout',{planId:p},'h.gita.s'));
sheets.transactions.rows.filter(r=>r[2]==='gita@x.com').forEach(r=>{r[11]=new Date(Date.now()-40*60000).toISOString();});
['P1M','P3M'].forEach(p=>post('createCheckout',{planId:p},'h.gita.s'));
check('batas 5 checkout per jam', post('createCheckout',{planId:'P6M'},'h.gita.s').error.code==='RATE_LIMITED');
const offBase=props.MAYAR_BASE_URL; delete props.MAYAR_BASE_URL;
check('pembayaran nonaktif bila belum dikonfigurasi', post('createCheckout',{planId:'P1M'},dina).error.code==='PAYMENT_OFF' && post('getPlans',{}).data.env==='off');
props.MAYAR_BASE_URL=offBase;


// ================= Fase 6: materi premium & rencana adaptif =================
{
const mstore={}; newFile('mat1','MATERI – Materi Premium – LIVE',null,mstore); mstore.materials=new Sheet('materials');
const MH=['material_id','topic_id','level','title','minutes','ringkasan','poin_kunci','contoh_soal','opsi_a','opsi_b','opsi_c','opsi_d','opsi_e','kunci','pembahasan','strategi','jebakan','status'];
mstore.materials.rows.push(MH);
const mrow=(t,l,st='live')=>[`MAT-${t}-L${l}`,t,String(l),`Judul ${t} L${l}`,'9','Ringkasan rahasia '+t+' level '+l+' '.repeat(5)+'x'.repeat(200),'Poin satu\nPoin dua\nPoin tiga','Soal contoh?','A1','B1','C1','D1','E1','c','PEMBAHASAN-RAHASIA-'+t+l,'Strategi 1\nStrategi 2','Jebakan 1',st];
mstore.materials.rows.push(mrow('tiu-deret',2),mrow('tiu-deret',3),mrow('tiu-deret',4),mrow('twk-uud',2),mrow('twk-uud',3,'draft'),mrow('tiu-figural-x',2));
props.MATERIALS_SPREADSHEET_ID='mat1';
let mi=post('getMaterialIndex',{});
check('indeks materi tanpa login', mi.ok && mi.data.available['tiu-deret'].length===3 && mi.data.available['twk-uud'].length===1 && !mi.data.loggedIn && Object.keys(mi.data.recommended).length===0, mi.data);
let gm=post('getMaterial',{topicId:'tiu-deret',level:2});
check('tanpa login: terkunci (LOGIN) & tanpa isi', gm.ok && gm.data.locked && gm.data.reason==='LOGIN' && !JSON.stringify(gm).includes('PEMBAHASAN-RAHASIA') && !JSON.stringify(gm).includes('Poin dua'), gm);
gm=post('getMaterial',{topicId:'tiu-deret',level:3},'h.bob.s');
check('gratis: terkunci (PREMIUM) & cuplikan dipotong', gm.ok && gm.data.locked && gm.data.reason==='PREMIUM' && gm.data.teaser.pointCount===3 && gm.data.teaser.intro.length<=172 && !JSON.stringify(gm).includes('PEMBAHASAN-RAHASIA'), gm.data);
gm=post('getMaterial',{topicId:'tiu-deret',level:4},dina);
check('premium: materi lengkap', gm.ok && !gm.data.locked && gm.data.material.poinKunci.length===3 && gm.data.material.contoh.jawaban===2 && gm.data.material.tips.length===2, gm.data);
check('level 1 lewat API ditolak', post('getMaterial',{topicId:'tiu-deret',level:1},dina).error.code==='BAD_REQUEST');
check('materi draft tidak tampil', post('getMaterial',{topicId:'twk-uud',level:3},dina).error.code==='NOT_FOUND');
check('topik tidak dikenal ditolak', post('getMaterial',{topicId:'tiu-figural-x',level:2},dina).error.code==='BAD_REQUEST');
mi=post('getMaterialIndex',{},dina);
check('indeks: rekomendasi level untuk pengguna', mi.data.premium===true && mi.data.recommended['tiu-deret']>=1, mi.data.recommended);
// rencana adaptif
check('rencana adaptif terkunci untuk gratis', post('getPlan',{},'h.bob.s').error.code==='FORBIDDEN');
check('rencana adaptif butuh profil', post('getPlan',{},dina).error.code==='PROFILE_INCOMPLETE');
post('saveProfile',{education:'D4/S1',major:'Akuntansi',targetFormation:'',targetProvince:'Jawa Tengah',testDate:'',targetType:'passing_grade',minutesPerDay:60,daysPerWeek:7,reminderTime:'19:00'},dina);
let gp6=post('getPlan',{},dina);
const P=gp6.data;
check('rencana: 7 hari, 20 prioritas, hari ini ada', gp6.ok && P.adaptive && P.week.length===7 && P.priorities.length===20 && P.today && P.today.tasks.length>=1, gp6);
check('rencana: belum tryout → dijadwalkan & catatan', P.targets.tryoutThisWeek===true && P.week.some(w=>w.tasks.some(t=>t.type==='tryout')) && P.notes.some(n=>n.includes('Belum ada tryout')), P.notes);
const mt=P.week.flatMap(w=>w.tasks).find(t=>t.type==='materi');
check('tugas materi memakai level ≥2 & tautan level', mt && mt.level>=2 && mt.href.includes('&level='+mt.level), mt);
// tryout terakhir: TIU jauh di bawah ambang batas → topik TIU naik ke atas
const did=sheets.users.rows.find(r=>r[1]==='dina@x.com')[0];
const AH=sheets.attempts.rows[0]; const arow=AH.map(()=> '');
const setA=(k,v)=>{arow[AH.indexOf(k)]=v;};
setA('attempt_id','a_dina1');setA('user_id',did);setA('package_id','PX-99');setA('status','submitted');setA('submitted_at',new Date().toISOString());setA('started_at',new Date().toISOString());
setA('twk','100');setA('tiu','40');setA('tkp','175');setA('topic_json','{}');
sheets.attempts.rows.push(arow);
P2=post('getPlan',{},dina).data;
check('selisih TIU → topik TIU diprioritaskan', P2.priorities.slice(0,6).every(x=>x.subtest==='tiu') && P2.gaps.tiu.gap===40 && P2.notes.some(n=>n.startsWith('TIU masih 40 poin')), {g:P2.gaps,n:P2.notes});
check('baru tryout → tidak dijadwalkan ulang minggu ini', P2.targets.tryoutThisWeek===false, P2.targets);
// kepatuhan tinggi → target dinaikkan
const PH=sheets.practice_answers.rows[0];
for(let i=1;i<=6;i++){const d=new Date(Date.now()+7*3600000-i*86400000).toISOString().slice(0,10);for(let j=0;j<80;j++){const r=PH.map(()=> '');r[0]=did;r[1]=d;r[2]='Q'+i+'-'+j;r[4]='tiu-deret';r[5]='tiu';r[6]='a';r[7]='5';r[8]=d+'T10:00:00Z';sheets.practice_answers.rows.push(r);}}
P3=post('getPlan',{},dina).data;
check('kepatuhan >110% → target harian naik', P3.adherence.pct>110 && P3.targets.intensity===1.15 && P3.notes.some(n=>n.startsWith('Konsisten')), P3.adherence);
let td6=post('getToday',{},dina);
check('getToday memuat byTopicToday', td6.ok && typeof td6.data.practice.byTopicToday==='object');
var P2,P3;
}


// ================= Fase 7: Tryout Akbar =================
{
ctx.setupSheets();
pkgFile('fak1','AKBAR-T1',['AK-T1','Tryout Akbar Uji','akbar','',100,'','','','','live',50],[QH,...mk('AK-T1',QH)]);
pkgFile('fak2','AKBAR-T2',['AK-T2','Tryout Akbar Uji 2','akbar','',100,'','','','','live',51],[QH,...mk('AK-T2',QH)]);
ctx.refreshQuestionCache(); delete cacheStore['pkgs'];
const lobby=post('getTryoutInfo',{},'h.bob.s').data.packages.map(p=>p.packageId);
check('akbar: tidak tampil di lobi tryout', !lobby.includes('AK-T1'), lobby);
check('akbar: tidak bisa lewat startAttempt', post('startAttempt',{packageId:'AK-T1'},'h.bob.s').error.code==='NOT_FOUND');
const H=sheets.akbar_events.rows[0]; const now=Date.now();
const evRow=(id,pkg,o,c,r)=>H.map(k=>({event_id:id,package_id:pkg,title:'Akbar '+id,opens_at:new Date(now+o*3600e3).toISOString(),closes_at:new Date(now+c*3600e3).toISOString(),results_at:new Date(now+r*3600e3).toISOString(),status:'scheduled',participants:'',created_at:''}[k]??''));
sheets.akbar_events.rows.push(evRow('E1','AK-T1',-1,5,6), evRow('E0','AK-T1',24,39,48));
let ai=post('getAkbarInfo',{});
check('akbar info anonim: event berjalan', ai.ok && ai.data.current.eventId==='E1' && ai.data.current.state==='open' && ai.data.current.my===null && ai.data.next.length===1, ai.data);
check('join butuh login', post('joinAkbar',{eventId:'E1'}).error.code==='UNAUTHENTICATED');
check('event belum dibuka', post('joinAkbar',{eventId:'E0'},'h.bob.s').error.code==='NOT_OPEN');
const perfect=(qs)=>{const a={};qs.forEach((q,i)=>{const src=demo.questions[i];a[q.id]=src.answer||'abcde'[src.scores.indexOf(5)];});return a;};
const users=['h.bob.s','h.alice.s',dina,'h.eka.s'];
const joins={};
users.forEach(u=>{joins[u]=post('joinAkbar',{eventId:'E1'},u);});
check('join berhasil, tanpa kunci jawaban', joins['h.bob.s'].ok && joins['h.bob.s'].data.questions.length===15 && !/"answer"|"score"/.test(JSON.stringify(joins['h.bob.s'].data)), joins['h.bob.s']);
check('join ulang melanjutkan attempt yang sama', post('joinAkbar',{eventId:'E1'},'h.bob.s').data.attemptId===joins['h.bob.s'].data.attemptId);
const qs=joins['h.bob.s'].data.questions;
const half=Object.fromEntries(Object.entries(perfect(qs)).slice(0,8));
post('submitAttempt',{attemptId:joins['h.bob.s'].data.attemptId,answers:perfect(qs)},'h.bob.s');
post('submitAttempt',{attemptId:joins['h.alice.s'].data.attemptId,answers:half},'h.alice.s');
post('submitAttempt',{attemptId:joins[dina].data.attemptId,answers:perfect(qs)},dina);
// eka dibiarkan berjalan (akan dinilai otomatis saat terbit)
post('saveProgress',{attemptId:joins['h.eka.s'].data.attemptId,answers:half},'h.eka.s');
check('ikut lagi setelah selesai ditolak', post('joinAkbar',{eventId:'E1'},'h.bob.s').error.code==='ALREADY_DONE');
check('rapor dikunci sebelum hasil terbit', post('getReport',{attemptId:joins['h.bob.s'].data.attemptId},'h.bob.s').error.code==='RESULTS_PENDING');
check('peringkat belum terbit', post('getAkbarRanking',{eventId:'E1'}).error.code==='RESULTS_PENDING');
check('akbar tidak menjadi latestAttempt di beranda', (post('getMe',{},'h.bob.s').data.latestAttempt||{}).packageId!=='AK-T1');
ai=post('getAkbarInfo',{},'h.bob.s');
check('status peserta: submitted', ai.data.current.my.status==='submitted' && ai.data.current.my.rank===null);
// samakan durasi agar tie-break: bob & dina sama total → dina lebih cepat
const att=(id)=>sheets.attempts.rows.find(r=>r[0]===id); const AHh=sheets.attempts.rows[0];
att(joins['h.bob.s'].data.attemptId)[AHh.indexOf('duration_sec')]='3000';
att(joins[dina].data.attemptId)[AHh.indexOf('duration_sec')]='2000';
// tutup event & terbitkan
const E1=sheets.akbar_events.rows.find(r=>r[0]==='E1'); const ix=(k)=>H.indexOf(k);
E1[ix('opens_at')]=new Date(now-10*3600e3).toISOString(); E1[ix('closes_at')]=new Date(now-3*3600e3).toISOString(); E1[ix('results_at')]=new Date(now-60e3).toISOString();
att(joins['h.eka.s'].data.attemptId)[AHh.indexOf('ends_at')]=new Date(now-4*3600e3).toISOString();
check('join setelah ditutup ditolak', post('joinAkbar',{eventId:'E1'},'h.fani.s').error.code==='CLOSED');
ctx.publishAkbarResults();
const R=sheets.akbar_results.rows; const RH=R[0];
check('hasil terbit: 4 peserta (termasuk yang dinilai otomatis)', R.length===5 && E1[ix('status')]==='published' && E1[ix('participants')]==='4', R.length);
const rk=post('getAkbarRanking',{eventId:'E1'});
check('peringkat: urutan total & tie-break durasi', rk.ok && rk.data.top[0].total===75 && rk.data.top[0].name==='Dina' && rk.data.top[1].total===75 && rk.data.top.length===4, rk.data.top);
check('peringkat publik tanpa user_id/email', !/user_id|@|userId/.test(JSON.stringify(rk.data)));
check('nama disamarkan', rk.data.top.some(t=>t.name==='Alice W.'), rk.data.top.map(t=>t.name));
const rb=post('getAkbarRanking',{eventId:'E1'},'h.bob.s');
check('posisi saya & persentil', rb.data.me.rank===2 && rb.data.me.percentile===67 && rb.data.stats.n===4 && !rb.data.analysis, rb.data.me);
check('peringkat provinsi khusus premium', post('getAkbarRanking',{eventId:'E1',scope:'province'},'h.bob.s').error.code==='FORBIDDEN');
const rd=post('getAkbarRanking',{eventId:'E1',scope:'province'},dina);
check('premium: provinsi & analisis subtes', rd.ok && rd.data.province==='Jawa Tengah' && rd.data.top.length>=1 && rd.data.analysis.length===3 && rd.data.analysis[0].top10>0, rd.data);
check('rapor terbuka setelah terbit', post('getReport',{attemptId:joins['h.bob.s'].data.attemptId},'h.bob.s').ok);
ai=post('getAkbarInfo',{},'h.bob.s');
check('riwayat memuat peringkat saya', ai.data.past[0].eventId==='E1' && ai.data.past[0].my.rank===2 && ai.data.past[0].participants===4, ai.data.past);
ctx.publishAkbarResults();
check('terbit ulang tidak menggandakan', sheets.akbar_results.rows.length===5);
ctx.scheduleAkbarEvents();
const newEv=sheets.akbar_events.rows.find(r=>r[1]==='AK-T2');
check('jadwal otomatis: Minggu 06.00–21.00 WIB', newEv && new Date(newEv[ix('opens_at')]).getUTCHours()===23 && new Date(new Date(newEv[ix('opens_at')]).getTime()+7*3600e3).getUTCDay()===0 && new Date(newEv[ix('closes_at')]).getUTCHours()===14, newEv);
ctx.scheduleAkbarEvents();
check('jadwal tidak dobel', sheets.akbar_events.rows.filter(r=>r[1]==='AK-T2').length===1);
check('loadProbe tanpa token ditolak', post('loadProbe',{key:'x'}).error.code==='UNKNOWN_ACTION');
props.LOADTEST_TOKEN='lt-123';
const lp=post('loadProbe',{key:'lt-123',probeId:'p1'});
check('loadProbe dengan token', lp.ok && lp.data.questions===15 && sheets.loadtest_log.rows.length===2, lp);
delete props.LOADTEST_TOKEN;
// --- ketahanan: sel tanggal hasil edit manual di Spreadsheet ---
const D=(x)=>{const d=ctx.akbarDate_(x);return d?d.toISOString():null;};
check('akbarDate_: ISO, WIB tanpa zona, dd/mm/yyyy, Date, kosong', D('2026-11-15T06:00:00+07:00')==='2026-11-14T23:00:00.000Z' && D('2026-11-15 06:00')==='2026-11-14T23:00:00.000Z' && D('15/11/2026 06.00')==='2026-11-14T23:00:00.000Z' && D(new Date('2026-11-14T23:00:00Z'))==='2026-11-14T23:00:00.000Z' && D('')===null && D('besok pagi')===null && D('2026-11-14T23:00:00.000Z')==='2026-11-14T23:00:00.000Z');
const nEv=sheets.akbar_events.rows.length;
const raw=(id,pkg,o,c,r,st)=>H.map(k=>({event_id:id,package_id:pkg,title:'Uji '+id,opens_at:o,closes_at:c,results_at:r,status:st||'scheduled'}[k]??''));
const fmtW=(ms)=>{const d=new Date(ms+7*3600e3);const p=x=>String(x).padStart(2,'0');return `${p(d.getUTCDate())}/${p(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}.${p(d.getUTCMinutes())}`;};
sheets.akbar_events.rows.push(raw('EBAD','AK-T1','besok','',''), raw('EGHOST','PAKET-HILANG',new Date(now-3600e3).toISOString(),new Date(now+5*3600e3).toISOString(),''),
  raw('EDMY','AK-T1',fmtW(now-3600e3),fmtW(now+5*3600e3),''));
delete cacheStore['pkgs'];
const ai2=post('getAkbarInfo',{},'h.bob.s');
check('getAkbarInfo tetap jalan dengan baris rusak & paket hilang', ai2.ok, ai2.error);
check('event dd/mm/yyyy terbaca sebagai event berjalan', ai2.ok && ai2.data.current && ['EDMY','EGHOST'].includes(ai2.data.current.eventId) || (ai2.ok && ai2.data.current===null), ai2.data&&ai2.data.current);
const jd=post('joinAkbar',{eventId:'EDMY'},'h.fani.s'); check('join event dd/mm/yyyy', jd.ok && jd.data.questions.length===15, jd.error);
check('getAkbarRanking event tanpa hasil → RESULTS_PENDING (bukan SERVER_ERROR)', post('getAkbarRanking',{eventId:'EDMY'}).error.code==='RESULTS_PENDING');
check('getAkbarRanking event rusak → NOT_FOUND', post('getAkbarRanking',{eventId:'EBAD'}).error.code==='NOT_FOUND');
sheets.akbar_events.rows.splice(nEv);
}

// ================= Fase 8: SKB, pasca-SKD, referral =================
{
ctx.setupSheets();
check('setup: sheet skd_results & referrals', sheets.skd_results && sheets.referrals && sheets.users.rows[0].includes('ref_code') && sheets.transactions.rows[0].includes('discount'));
const skbRows=Array.from({length:10},(_,i)=>{const o={question_id:'SKB-T1-'+(i+1),package_id:'SKB-T1',number:i+1,subtest:'SKB',topic_id:i<5?'skb-asn':'skb-pelayanan',level:3,text:'Soal SKB '+(i+1),context:'',option_a:'Benar',option_b:'Salah 1',option_c:'Salah 2',option_d:'Salah 3',option_e:'Salah 4',answer:'a',explanation:'Penjelasan',status:'live',source:'t'};return QH.map(k=>o[k]??'');});
pkgFile('fskb','SKB-T1',['SKB-T1','SKB Uji','skb','Paket SKB uji',60,'','','',1,'live',300],[QH,...skbRows]);
ctx.refreshQuestionCache(); delete cacheStore['pkgs'];
tokens['h.sari.s']={...tokens['h.dina.s'],email:'sari@x.com',name:'Sari Putri',sub:'sari'};
tokens['h.rina.s']={...tokens['h.dina.s'],email:'rina@x.com',name:'Rina',sub:'rina'};
tokens['h.tono.s']={...tokens['h.dina.s'],email:'tono@x.com',name:'Tono',sub:'tono'};
post('login',{},'h.tono.s');
const lob=post('getTryoutInfo',{},'h.tono.s').data.packages.map(p=>p.packageId);
check('skb: tidak tampil di lobi SKD', !lob.includes('SKB-T1'), lob);
const sk=post('getTryoutInfo',{type:'skb'},'h.tono.s');
check('skb: daftar khusus SKB', sk.ok && sk.data.packages.length===1 && sk.data.packages[0].packageId==='SKB-T1' && sk.data.packages[0].questionCount===10, sk.data&&sk.data.packages);
const st8=post('startAttempt',{packageId:'SKB-T1'},'h.tono.s');
check('skb: mulai', st8.ok && st8.data.questions.length===10 && st8.data.questions[0].subtest==='skb' && !/"answer"/.test(JSON.stringify(st8.data)), st8.error);
const ans8={}; st8.data.questions.forEach((q,i)=>ans8[q.id]=i<8?'a':'b');
post('submitAttempt',{attemptId:st8.data.attemptId,answers:ans8},'h.tono.s');
const rp8=post('getReport',{attemptId:st8.data.attemptId},'h.tono.s');
check('skb: rapor skor 40/50, skala 100 = 80', rp8.ok && rp8.data.total===40 && rp8.data.maxTotal===50 && rp8.data.score100===80 && rp8.data.subtests.length===1 && rp8.data.subtests[0].id==='skb' && rp8.data.passedAll===null, rp8.data||rp8.error);
check('skb: nama topik & pembahasan gratis', rp8.data.topics[0].name && /ASN|pelayanan/i.test(rp8.data.topics[0].name) && rp8.data.review.length===2, rp8.data.topics);
check('skb: kuota gratis 1×', post('startAttempt',{packageId:'SKB-T1'},'h.tono.s').error.code==='FORBIDDEN');
check('skb: bukan latestAttempt beranda', (post('getMe',{},'h.tono.s').data.latestAttempt||{}).packageId!=='SKB-T1');
const tdy=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);
check('pasca-SKD: kosong', (()=>{const g=post('getPostSkd',{},'h.tono.s');return g.ok&&g.data.result===null;})());
check('pasca-SKD: skor di luar rentang ditolak', post('saveSkdResult',{testDate:tdy,twk:200,tiu:100,tkp:180},'h.tono.s').error.code==='BAD_REQUEST');
check('pasca-SKD: tanggal masa depan ditolak', post('saveSkdResult',{testDate:'2099-01-01',twk:90,tiu:100,tkp:180},'h.tono.s').error.code==='BAD_REQUEST');
let ps=post('saveSkdResult',{testDate:tdy,twk:90,tiu:100,tkp:180,formation:'Analis Kebijakan <b>'},'h.tono.s');
check('pasca-SKD: lolos → langkah SKB', ps.ok && ps.data.result.total===370 && ps.data.result.passedAll===true && ps.data.analysis.skdPart===26.91 && ps.data.analysis.steps[0].id==='skb' && ps.data.analysis.scenarios[1].final===68.91, ps.data&&ps.data.analysis);
check('pasca-SKD: teks formasi dibersihkan', !/[<>]/.test(ps.data.result.formation), ps.data.result.formation);
ps=post('saveSkdResult',{testDate:tdy,twk:90,tiu:70,tkp:180},'h.tono.s');
check('pasca-SKD: tanggal sama → diperbarui, TIU gagal → fokus TIU', ps.ok && sheets.skd_results.rows.length===2 && ps.data.result.passedAll===false && ps.data.analysis.weakest==='tiu' && ps.data.analysis.steps[0].id==='fokus', ps.data&&ps.data.analysis);
check('pasca-SKD: data orang lain terpisah', post('getPostSkd',{},'h.bob.s').data.result===null);
// --- referral ---
post('login',{},'h.rina.s');
const gr=post('getReferral',{},'h.rina.s');
check('referral: kode dibuat', gr.ok && /^SC[A-Z2-9]{6}$/.test(gr.data.code) && gr.data.invited===0, gr.data);
check('referral: kode stabil', post('getReferral',{},'h.rina.s').data.code===gr.data.code);
check('referral: kode sendiri ditolak', post('claimReferral',{code:gr.data.code},'h.rina.s').error.code==='BAD_REQUEST');
check('referral: kode tak dikenal', post('claimReferral',{code:'SCZZZZZZ'},'h.tono.s').error.code==='NOT_FOUND');
check('referral: pembeli lama tidak bisa', post('claimReferral',{code:gr.data.code},dina).error.code==='BAD_REQUEST');
const lg=post('login',{ref:gr.data.code.toLowerCase()},'h.sari.s');
check('referral: klaim lewat login ?ref=', lg.ok && lg.data.referralClaimed===true, lg.data&&lg.data.referralClaimed);
check('referral: klaim ulang ditolak', post('claimReferral',{code:gr.data.code},'h.sari.s').error.code==='ALREADY_DONE');
const gps=post('getPlans',{},'h.sari.s').data;
check('referral: harga diskon 10% di getPlans', gps.referral && gps.referral.discountPct===10 && gps.plans[0].refPrice===44100 && gps.plans[0].price===49000, gps.plans[0]);
const cos=post('createCheckout',{planId:'P1M'},'h.sari.s');
const srow=()=>sheets.transactions.rows.find(r=>r[0]===cos.data.trxId); const TH=sheets.transactions.rows[0];
check('referral: tagihan Mayar memakai harga diskon', cos.ok && mayar.calls.filter(c=>c.path==='/payments/create').pop().body.amount===44100 && srow()[TH.indexOf('amount')]==='44100' && srow()[TH.indexOf('discount')]==='4900', srow());
const rinaRow=()=>sheets.users.rows.find(r=>r[1]==='rina@x.com'); const sariRow=()=>sheets.users.rows.find(r=>r[1]==='sari@x.com');
mayar.payments[srow()[TH.indexOf('mayar_id')]].status='paid'; Object.keys(cacheStore).filter(k=>k.startsWith('pchk_')).forEach(k=>delete cacheStore[k]);
post('getPaymentStatus',{trxId:cos.data.trxId},'h.sari.s');
const dd=(iso)=>Math.round((new Date(iso)-Date.now())/86400000);
check('referral: teman premium 30 hari, pengajak +7 hari', sariRow()[5]==='premium' && dd(sariRow()[6])===30 && rinaRow()[5]==='premium' && dd(rinaRow()[6])===7, {s:sariRow(),r:rinaRow()});
const RH=sheets.referrals.rows[0]; const rrow=sheets.referrals.rows[1];
check('referral: status rewarded', rrow[RH.indexOf('status')]==='rewarded' && rrow[RH.indexOf('trx_id')]===cos.data.trxId);
ctx.fulfillTransaction_(cos.data.trxId,'ulang');
check('referral: bonus tidak dobel', dd(rinaRow()[6])===7);
check('referral: diskon hilang setelah pembelian pertama', !post('getPlans',{},'h.sari.s').data.referral);
const gr2=post('getReferral',{},'h.rina.s').data;
check('referral: statistik pengajak', gr2.invited===1 && gr2.rewarded===1 && gr2.bonusDaysEarned===7 && gr2.recent[0].status==='rewarded' && !/sari|@/.test(JSON.stringify(gr2)), gr2);
const gs=post('getReferral',{},'h.sari.s').data;
check('referral: status teman', gs.myReferral && gs.myReferral.status==='rewarded' && gs.myReferral.discountActive===false && gs.canClaim===false, gs);
}
delete props.QUESTIONS_FOLDER_ID; ctx.clearPackageCache_(null);
check('no source -> clear config error', post('getTryoutInfo',{},'h.alice.s').error.code==='CONFIG_MISSING');

console.log(fails? `\n${fails} FAILED` : '\nALL PASSED');
