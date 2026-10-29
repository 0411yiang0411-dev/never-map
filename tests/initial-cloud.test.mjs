import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCloudShouldWin} from '../src/sync-policy.mjs';
test('fresh blank devices recover existing cloud content even after an initial theme update',()=>{
  assert.equal(initialCloudShouldWin(null,[],[{id:'existing'}]),true);
  assert.equal(initialCloudShouldWin(null,[{isDeleted:true}],[{id:'existing'}]),true);
});
test('existing edits and deliberate deletions with a known revision retain upload/conflict semantics',()=>{
  assert.equal(initialCloudShouldWin(null,[{id:'local'}],[{id:'existing'}]),false);
  assert.equal(initialCloudShouldWin(222,[],[{id:'existing'}]),false);
  assert.equal(initialCloudShouldWin(null,[],[]),false);
});
