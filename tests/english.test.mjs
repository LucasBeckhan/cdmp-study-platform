import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const pack=require('../js/english-practice.js');
const core=require('../js/core.js');
test('English supplement has unique IDs, valid answers, explanations and topic references',()=>{
 assert.equal(pack.bank.length,24);
 assert.equal(new Set(pack.bank.map(q=>q.id)).size,24);
 for(const q of pack.bank){assert.equal(q.opts.length,4);assert.ok(q.ans>=0&&q.ans<q.opts.length);assert.ok(q.exp.length>30);assert.ok(pack.knowledge.some(k=>k.id===q.ch));}
});
test('English answers update only the independent English track',()=>{
 const state=core.fixState({v:2,tracks:{}});
 const zh=core.ensureTrack(state,'cdmp');const en=core.ensureTrack(state,'cdmp-en');
 core.applyAnswer(en,pack.bank[0],false,new Date());
 assert.deepEqual(zh.wrong,[]);assert.deepEqual(en.wrong,[pack.bank[0].id]);
 core.applyAnswer(en,pack.bank[0],true,new Date());assert.deepEqual(en.wrong,[]);
});
