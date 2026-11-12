import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const {resolve}=createRequire(import.meta.url)('../js/navigation.js');
const tracks={cdmp:{},java:{}};
test('unscoped learning links resolve to current track, including home',()=>{
 for(const view of ['home','quiz','plan','resources','knowledge','exam']) assert.equal(resolve('#/'+view,tracks,'java').track,'java');
 assert.equal(resolve('#/home',tracks,'java').view,'home');
});
test('missing preference selects available track; global pages stay global',()=>{
 assert.equal(resolve('#/quiz',tracks,'deleted').track,'cdmp');
 assert.equal(resolve('#/hub',tracks,'cdmp').global,'hub');
 assert.equal(resolve('#/wrongbook',tracks,'cdmp').global,'wrongbook');
});
test('invalid routes provide feedback and retain knowledge deep links',()=>{
 assert.ok(resolve('#/missing/home',tracks).message);
 assert.ok(resolve('#/quiz',{}).message);
 assert.equal(resolve('#/cdmp/missing',tracks).view,'home');
 assert.equal(resolve('#/cdmp/knowledge/governance',tracks).arg,'governance');
});
