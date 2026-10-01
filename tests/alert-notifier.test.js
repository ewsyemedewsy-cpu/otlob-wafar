import test from 'node:test';import assert from 'node:assert/strict';
import {createAlertTracker} from '../apps/web/src/alert-notifier.js';
test('desktop alerts ignore initial history and duplicate polling but notify new events',()=>{
 const next=createAlertTracker();assert.deepEqual(next([{id:'old'}]),[]);
 assert.deepEqual(next([{id:'old'},{id:'new'},{id:'new'}]),[{id:'new'}]);
 assert.deepEqual(next([]),[]);assert.deepEqual(next([{id:'new'},{id:'old'}]),[]);
 assert.deepEqual(next([{id:'paid:new'}]),[{id:'paid:new'}]);
});
