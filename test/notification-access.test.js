const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const utils = require('../public/js/push-gate-utils');
function harness(permission='granted') {
    const elements = new Map(); const calls=[];
    const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',disabled:false,focus(){},setAttribute(){}});return elements.get(id);};
    const context=vm.createContext({ console, Uint8Array, URLSearchParams, atob, setTimeout, clearTimeout,
        document:{getElementById:element,body:{classList:{toggle(){}}}},
        window:{PushManager:function(){},Notification:{},PushGateUtils:{withTimeout:(p,ms,message)=>utils.withTimeout(p,Math.min(ms,25),message)}},
        navigator:{serviceWorker:{register:async()=>({active:true,pushManager:{getSubscription:async()=>({toJSON:()=>({})})}})}},
        Notification:{permission,requestPermission(){calls.push('prompt');return Promise.resolve('granted');}},
        localStorage:{getItem:()=>'',removeItem(){}},location:{search:''},fetch:async()=>({ok:true,status:200,json:async()=>({data:{publicKey:'AQID'}})}),calls
    });
    const source=fs.readFileSync(path.join(__dirname,'../public/js/dashboard.js'),'utf8');
    vm.runInContext(source.slice(source.indexOf('function urlBase64ToUint8Array'),source.indexOf('async function loadDashboardData')),context);
    vm.runInContext("startStudentWorkspace = () => calls.push('workspace');",context);
    return {context,calls,elements,run:s=>vm.runInContext(s,context)};
}
test('previously allowed permission opens workspace before failed config without prompting again',async()=>{
    const h=harness();h.run("pushConfiguration=async()=>{throw new Error('offline')}");
    await h.run('checkMandatoryNotificationAccess()');
    assert.ok(h.calls.includes('workspace'));assert.equal(h.calls.includes('prompt'),false);
    assert.equal(h.elements.get('mandatoryNotificationGate').hidden,true);
    assert.equal(h.elements.get('notificationSetupMessage').textContent,'offline');
});
test('granted permission remains usable when browser subscription hangs',async()=>{
    const h=harness();h.run("navigator.serviceWorker.register=async()=>({active:true,pushManager:{getSubscription:()=>new Promise(()=>{})}})");
    await h.run('checkMandatoryNotificationAccess()');
    assert.equal(h.elements.get('mandatoryNotificationGate').hidden,true);
    assert.match(h.elements.get('notificationSetupMessage').textContent,/timed out/);
});
test('turn-on click never requests permission again when already granted',async()=>{
    const h=harness();h.run("ensureMandatorySubscription=async()=>({})");
    await h.run('enableMandatoryNotifications()');
    assert.equal(h.calls.includes('prompt'),false);assert.equal(h.elements.get('enableMandatoryNotifications').disabled,false);
});
test('new permission request runs synchronously in click before fetching configuration',async()=>{
    const h=harness('default');h.run("Notification.requestPermission=()=>{calls.push('prompt');Notification.permission='granted';return Promise.resolve('granted')};pushConfiguration=async()=>{calls.push('config');return {publicKey:'AQID'}};ensureMandatorySubscription=async()=>({})");
    const result=h.run('enableMandatoryNotifications()');assert.equal(h.calls[0],'prompt');await result;
    assert.ok(h.calls.indexOf('config')>h.calls.indexOf('prompt'));
});
test('visibility checks share one in-progress subscription sync',async()=>{
    const h=harness();h.run("pushConfiguration=async()=>{calls.push('config');return {publicKey:'AQID'}};ensureMandatorySubscription=async()=>new Promise(r=>setTimeout(r,5))");
    await Promise.all([h.run('checkMandatoryNotificationAccess()'),h.run('checkMandatoryNotificationAccess()')]);
    assert.equal(h.calls.filter(x=>x==='config').length,1);
});
test('rotated application key replaces stale browser subscription',async()=>{
    const h=harness();h.run("const stale={options:{applicationServerKey:new Uint8Array([9,9,9]).buffer},unsubscribe:async()=>{calls.push('unsubscribe');return true}};const registration={active:true,pushManager:{getSubscription:async()=>stale,subscribe:async()=>{calls.push('subscribe');return {toJSON:()=>({})}}}};savePushSubscription=async()=>calls.push('save')");
    await h.run("ensureMandatorySubscription({publicKey:'AQID'},registration)");
    assert.deepEqual(h.calls,['unsubscribe','subscribe','save']);
});
test('shared-device conflict renews endpoint instead of transferring another account',async()=>{
    const h=harness();h.run("const old={unsubscribe:async()=>{calls.push('unsubscribe');return true}};const fresh={};const registration={active:true,pushManager:{getSubscription:async()=>old,subscribe:async()=>{calls.push('subscribe');return fresh}}};savePushSubscription=async s=>{if(s===old)throw Object.assign(new Error('conflict'),{status:409});calls.push('saved fresh')}");
    await h.run("ensureMandatorySubscription({publicKey:'AQID'},registration)");
    assert.deepEqual(h.calls,['unsubscribe','subscribe','saved fresh']);
});
