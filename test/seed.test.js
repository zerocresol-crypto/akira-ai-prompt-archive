import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';

test('Autumn Café skeleton is correctly dated and remains private',async()=>{
  const db=new DatabaseSync(':memory:');
  for(const name of ['0001_init.sql','0002_seed_autumn_cafe.sql','0003_schedule.sql'])db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  const days=db.prepare('SELECT day_order,date,title FROM days ORDER BY day_order').all();
  assert.deepEqual(days.map(d=>d.date),['2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10']);
  assert.equal(days.length,7);
  const DB={prepare(sql){const statement=db.prepare(sql);return {bind(...args){this.args=args;return this},first(){return statement.get(...(this.args||[]))||null},all(){return {results:statement.all(...(this.args||[]))}}}}};
  const response=await worker.fetch(new Request('https://archive.example/series/autumn-cafe-collection'),{DB});
  assert.equal(response.status,404);
  assert.equal(db.prepare("SELECT status FROM series WHERE slug='autumn-cafe-collection'").get().status,'draft');
});
