// UI smoke test: loads model-lab/index.html in jsdom (embedded sample), checks step 4-5 wiring.
// Run: npm install && node tests/ui.test.js [motion.c3d]
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'model-lab', 'index.html'), 'utf8');
const errors = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) { w.addEventListener('error', (e) => errors.push(e.message)); w.alert = () => {}; } });
const w = dom.window, $ = (id) => w.document.getElementById(id);
const v3s = () => w.__PL_TEST.pipeline(); // CRLF text that is downloaded (textarea .value normalises to LF)
const fire = (id, ev) => $(id).dispatchEvent(new w.Event(ev || 'change'));

let failed = 0;
function test(name, fn) { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); } }

test('page loads without script errors', () => { assert.deepStrictEqual(errors, []); });
test('sample: mdh and v3s generated, static and mdh names filled', () => {
  assert.ok($('out').value.includes('HYBRID_SEGMENT'));
  assert.ok($('vOut').value.includes('Compute_Model_Based_Data'));
  assert.strictEqual($('vStatic').value, 'Take_static2026-11-10_09.44.13_AM.c3d');
  assert.ok(/^ConvLower16_.*\.mdh$/.test($('vModel').value));
});
test('6 joint checkboxes, all enabled for Lower 16', () => {
  const js = [...w.document.querySelectorAll('#vJoints input')];
  assert.strictEqual(js.length, 6); assert.ok(js.every((c) => !c.disabled && c.checked));
});
test('mass from step 3 flows into Set_Subject_Weight', () => {
  $('mass').value = '97.6'; fire('mass', 'input');
  assert.ok($('vOut').value.includes('/WEIGHT=97.6'));
});
test('axes +Y/+Z switches auto Cardan to X-Y-Z', () => {
  $('axes').value = '+Y|+Z'; fire('axes');
  assert.ok(v3s().includes('/AXIS1=X\r\n/AXIS2=Y\r\n/AXIS3=Z'));
  $('axes').value = '+X|+Y'; fire('axes');
  assert.ok(v3s().includes('/AXIS1=Z\r\n/AXIS2=X\r\n/AXIS3=Y'));
});
test('custom joint on missing segment shows an error', () => {
  $('vCustom').value = 'RShoulder, RAR, RTA'; fire('vCustom', 'input');
  assert.ok(/พบปัญหา/.test($('vStatus').textContent));
  $('vCustom').value = ''; fire('vCustom', 'input');
});
test('lowpass at 60 Hz on 240 Hz data is fine; 130 Hz is above Nyquist', () => {
  $('vLow').checked = true; fire('vLow'); $('vCut').value = '60'; fire('vCut', 'input');
  assert.ok($('vOut').value.includes('/FREQUENCY_CUTOFF=60'));
  assert.ok(![...$('vMsgs').children].some((li) => /Nyquist/.test(li.textContent)));
  $('vCut').value = '130'; fire('vCut', 'input');
  assert.ok([...$('vMsgs').children].some((li) => /Nyquist/.test(li.textContent)));
  $('vLow').checked = false; fire('vLow');
});
test('workspace mode drops File_Open/Build', () => {
  $('vWs').checked = true; fire('vWs');
  assert.ok(!/^File_Open$/m.test($('vOut').value)); assert.ok(!/^Build_Model$/m.test($('vOut').value));
  $('vWs').checked = false; fire('vWs');
});

const motionPath = process.argv[2];
test('motion from step 1b appears in pipeline' + (motionPath ? ' (' + path.basename(motionPath) + ')' : ' (sample static used as motion)'), () => {
  let buf;
  if (motionPath) buf = fs.readFileSync(motionPath);
  else { const s = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][1][1]; buf = Buffer.from(/var SAMPLE_B64 = "([A-Za-z0-9+/=]+)"/.exec(s)[1], 'base64'); }
  w.__PL_TEST.addMotion(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'trial01.c3d');
  const t = $('vOut').value;
  if (motionPath) { console.log('     ' + $('vMotionLine').textContent); return; }
  assert.ok(/\/MOTION_FILE_NAMES=trial01\.c3d/.test(t), 'motion not in Assign_Model_File');
  assert.ok(t.includes('/FILE_NAME=MOTION'));
});

if (failed) { console.log('\n' + failed + ' failed'); process.exit(1); } else console.log('\nall passed');
