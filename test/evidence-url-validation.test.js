const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectEvidenceUrl, probeEvidenceUrl } = require('../src/services/evidenceUrl');

test('evidence URLs require safe public HTTPS hosts', () => {
  assert.equal(inspectEvidenceUrl('http://example.com').ok, false);
  assert.equal(inspectEvidenceUrl('https://localhost/test').ok, false);
  assert.equal(inspectEvidenceUrl('https://127.0.0.1/test').ok, false);
  assert.equal(inspectEvidenceUrl('https://192.168.1.2/test').ok, false);
  assert.equal(inspectEvidenceUrl('https://example.com/project').ok, true);
});

test('evidence probe accepts a working URL and follows only safe redirects', async () => {
  const calls=[];
  const fetchImpl=async (url,options) => {
    calls.push([url,options.method]);
    if(String(url).includes('/start')) return {status:302,headers:{get:name=>name==='location'?'/final':null},body:null};
    return {status:200,headers:{get:()=>null},body:null};
  };
  const result=await probeEvidenceUrl('https://example.com/start',{fetchImpl,timeoutMs:50,maxRedirects:2});
  assert.equal(result.ok,true);
  assert.equal(calls.length,2);
});

test('dead or private redirect evidence does not auto-verify', async () => {
  const dead=await probeEvidenceUrl('https://example.com/dead',{fetchImpl:async()=>({status:404,headers:{get:()=>null},body:null}),timeoutMs:50});
  assert.equal(dead.ok,false);
  const privateRedirect=await probeEvidenceUrl('https://example.com/start',{fetchImpl:async()=>({status:302,headers:{get:()=> 'https://127.0.0.1/secret'},body:null}),timeoutMs:50});
  assert.equal(privateRedirect.ok,false);
  assert.equal(privateRedirect.hard_invalid,true);
});
