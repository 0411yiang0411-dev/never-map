import test from 'node:test';
import assert from 'node:assert/strict';
import {retryPolicy,resumeDecision} from '../src/sync-policy.mjs';
import {storedAccess,rememberAccess,forgetAccess} from '../src/session.mjs';
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
test('remembered login survives a fresh session after two days and logout removes both stores',()=>{
  const durable=storage(),session=storage();rememberAccess('private-test-token',session,durable);
  const restartedSession=storage();assert.equal(storedAccess(restartedSession,durable),'private-test-token');
  forgetAccess(restartedSession,durable);assert.equal(storedAccess(restartedSession,durable),'');
});
test('network recovery backs off, while quota/auth/conflict and invalid content keep their safety stops',()=>{
  assert.deepEqual([0,1,2,3,4,12].map(n=>retryPolicy(0,n).delay),[5000,10000,20000,40000,60000,60000]);
  assert.equal(retryPolicy(503).kind,'network');assert.equal(retryPolicy(429).delay,60000);
  for(const status of [401,403,409,413,415])assert.equal(retryPolicy(status).delay,Infinity);
});
test('returning clean devices download newer contents; offline edits upload only against their own base',()=>{
  assert.equal(resumeDecision({pending:false,revision:1,localSignature:'old'},8,'new'),'download');
  assert.equal(resumeDecision({pending:true,revision:8,localSignature:'edit'},8,'old'),'upload');
  assert.equal(resumeDecision({pending:true,revision:1,localSignature:'offline-edit'},8,'other-device'),'conflict');
});
test('lost upload responses are acknowledged without overwriting newer local changes',()=>{
  assert.equal(resumeDecision({pending:true,revision:7,localSignature:'sent',lastUploadSignature:'sent'},8,'sent'),'acknowledged');
  assert.equal(resumeDecision({pending:true,revision:7,localSignature:'continued-edit',lastUploadSignature:'sent'},8,'sent'),'acknowledged-upload-again');
  assert.equal(resumeDecision({pending:true,revision:7,localSignature:'continued-edit',lastUploadSignature:'sent'},9,'sent'),'conflict');
});
