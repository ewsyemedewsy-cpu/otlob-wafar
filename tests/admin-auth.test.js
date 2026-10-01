import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {requireAdmin} from '../services/api/src/admin.js';

test('admin credentials fail closed, support digest rotation and never permit legacy fallback',()=>{
 const oldKey=process.env.ADMIN_API_KEY,oldDigest=process.env.ADMIN_API_KEY_SHA256,oldBuffer=globalThis.Buffer;
 const run=key=>{
  let status=200,passed=false,body,headers={};
  const res={set:(k,v)=>headers[k]=v,status:n=>{status=n;return res},json:b=>body=b};
  requireAdmin({get:()=>key},res,()=>passed=true);
  assert.equal(headers['Cache-Control'],'no-store');
  if(!passed)assert.deepEqual(body,{error:'unauthorized'});
  return {status,passed};
 };
 try{
  globalThis.Buffer=undefined;
  delete process.env.ADMIN_API_KEY;delete process.env.ADMIN_API_KEY_SHA256;
  assert.equal(run('anything').status,401);
  process.env.ADMIN_API_KEY='legacy-test-key';
  assert.equal(run('legacy-test-key').passed,true);
  assert.equal(run('wrong').status,401);
  const first=crypto.randomBytes(32).toString('hex'),second=crypto.randomBytes(32).toString('hex');
  process.env.ADMIN_API_KEY_SHA256=crypto.createHash('sha256').update(first).digest('hex');
  assert.equal(run(first).passed,true);
  assert.equal(run('legacy-test-key').status,401);
  assert.equal(run('').status,401);
  assert.equal(run('x'.repeat(1025)).status,401);
  process.env.ADMIN_API_KEY_SHA256=crypto.createHash('sha256').update(second).digest('hex');
  assert.equal(run(first).status,401);assert.equal(run(second).passed,true);
  process.env.ADMIN_API_KEY_SHA256='invalid';
  assert.equal(run('legacy-test-key').status,401);
 }finally{
  globalThis.Buffer=oldBuffer;
  if(oldKey===undefined)delete process.env.ADMIN_API_KEY;else process.env.ADMIN_API_KEY=oldKey;
  if(oldDigest===undefined)delete process.env.ADMIN_API_KEY_SHA256;else process.env.ADMIN_API_KEY_SHA256=oldDigest;
 }
});
