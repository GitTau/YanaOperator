const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
function load(){const file=require('node:path').join(__dirname,'staffSession.ts');const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(code,file);return m.exports;}
test('missing profile denies access and clears cached data',async()=>{
 const {createStaffSession}=load();let state,clears=0;
 const c=createStaffSession({load:async()=>({profile:null,captain:null}),publish:s=>state=s,clearCache:()=>{clears++;}});
 await c.accept({id:'user-a'});assert.equal(state.isAuthenticated,false);assert.equal(state.user,null);assert.match(state.error,/profile/i);assert.ok(clears);
});
test('invalid role or mismatched identity denies access',async()=>{
 const {createStaffSession}=load();
 for(const profile of [{id:'a',role:'RIDER'},{id:'b',role:'ADMIN'}]){
 let state;const c=createStaffSession({load:async()=>({profile,captain:null}),publish:s=>state=s,clearCache:()=>{}});await c.accept({id:'a'});assert.equal(state.isAuthenticated,false);
 }
});
test('valid staff profile enables access',async()=>{
 const {createStaffSession}=load();let state;
 const c=createStaffSession({load:async()=>({profile:{id:'a',role:'OPERATOR'},captain:null}),publish:s=>state=s,clearCache:()=>{}});await c.accept({id:'a'});assert.equal(state.isAuthenticated,true);assert.equal(state.profile.role,'OPERATOR');
});
test('late profile response cannot restore signed-out session',async()=>{
 const {createStaffSession}=load();let resolve,state;
 const c=createStaffSession({load:()=>new Promise(r=>resolve=r),publish:s=>state=s,clearCache:()=>{}});
 const pending=c.accept({id:'a'});c.reset();resolve({profile:{id:'a',role:'ADMIN'},captain:null});await pending;assert.equal(state.isAuthenticated,false);assert.equal(state.user,null);
});
test('account switch discards old response and clears cache',async()=>{
 const {createStaffSession}=load();let resolve,state,clears=0;
 const c=createStaffSession({load:async id=>id==='a'?new Promise(r=>resolve=r):({profile:{id,role:'MECHANIC'},captain:null}),publish:s=>state=s,clearCache:()=>{clears++;}});
 const old=c.accept({id:'a'});await c.accept({id:'b'});resolve({profile:{id:'a',role:'ADMIN'},captain:null});await old;assert.equal(state.user.id,'b');assert.ok(clears>=2);
});
test('query failures deny access with visible retryable error',async()=>{
 const {createStaffSession}=load();let state;
 const c=createStaffSession({load:async()=>{throw Error('private backend error');},publish:s=>state=s,clearCache:()=>{}});await c.accept({id:'a'});assert.equal(state.isAuthenticated,false);assert.match(state.error,/retry/i);assert.doesNotMatch(state.error,/private/);
});
