// Core tests for model-lab/index.html (PL core: mdh generator + pipeline).
// Run: node tests/core.test.js [extra-static.c3d ...]
// Uses the Motive sample embedded in the page (already public). Extra C3D paths given on the
// command line are tested too; keep participant data out of the repo (see .gitignore).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'model-lab', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const sandbox = { module: { exports: {} } };
new Function('module', scripts[0])(sandbox.module);
const PL = sandbox.module.exports;
const b64 = /var SAMPLE_B64 = "([A-Za-z0-9+/=]+)"/.exec(scripts[1])[1];
const toAB = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

function buildMdh(C, extra) {
  const key = PL.detectPreset(C.bare);
  assert.ok(key, 'marker set not detected');
  const roleMap = PL.presetToRoleMap(key);
  return PL.generate(Object.assign({ roleMap, prefix: '', source: 'test.c3d' }, extra || {}));
}
function baseOpts(extra) {
  return Object.assign({
    staticFile: 'static.c3d', modelFile: 'model.mdh', motionFiles: ['trial01.c3d', 'trial02_relabeled.c3d'], folder: '',
    fileNew: true, setSubject: true, mass: 70, height: 1.7, tagMotion: true, lowpass: false, cutoff: 6, reflected: 6,
    interpolateNote: true, quantities: ['ANGLE'], joints: PL.JOINTS.map((j) => j.id), customJoints: '', resolution: 'parent',
    cardan: 'ZXY', axesSeq: 'ZXY', axes: { ml: 'Z', ap: 'X', axial: 'Y' }, exportMat: false, stamp: '2026-11-21'
  }, extra || {});
}
const cmds = (t) => t.split('\r\n').filter((l) => /^[A-Z][A-Za-z_]+$/.test(l));
const block = (t, name, nth) => {
  const lines = t.split('\r\n'); let n = 0;
  for (let i = 0; i < lines.length; i++) if (lines[i] === name && n++ === (nth || 0)) { const out = []; for (let k = i + 1; lines[k] !== ';'; k++) out.push(lines[k]); return out; }
  return null;
};

const sample = PL.parseC3D(toAB(Buffer.from(b64, 'base64')));
const mdh = buildMdh(sample).text;
const segs = PL.mdhSegments(mdh);

test('mdhSegments finds the 7 Lower 16 segments and their /MASS', () => {
  assert.deepStrictEqual(Object.keys(segs).sort(), ['LFT', 'LSK', 'LTH', 'RFT', 'RPV', 'RSK', 'RTH']);
  assert.strictEqual(segs.RTH.mass, true); assert.strictEqual(segs.RSK.mass, true);
  assert.strictEqual(segs.RFT.mass, false); assert.strictEqual(segs.RPV.mass, false);
});

test('cardanFor maps segment axes to ML-AP-Axial', () => {
  assert.strictEqual(PL.cardanFor('+X', '+Y').seq, 'ZXY');
  assert.strictEqual(PL.cardanFor('+Y', '+Z').seq, 'XYZ');
});

test('command order: static, model, build, motions, assign, tag, select MOTION, compute', () => {
  const t = PL.generateV3s(baseOpts());
  assert.deepStrictEqual(cmds(t).slice(0, 13), ['File_New', 'File_Open', 'Create_Hybrid_Model', 'Apply_Model_Template', 'Set_Subject_Weight', 'Set_Subject_Height',
    'Build_Model', 'File_Open', 'File_Open', 'Assign_Model_File', 'Assign_Tags_To_Files', 'Select_Active_File', 'Compute_Model_Based_Data']);
  assert.ok(block(t, 'Assign_Model_File').includes('/MOTION_FILE_NAMES=trial01.c3d+trial02_relabeled.c3d'));
  assert.ok(block(t, 'Select_Active_File').includes('/FILE_NAME=MOTION'));
  assert.strictEqual(cmds(t).filter((c) => c === 'Compute_Model_Based_Data').length, 6);
});

test('no motion files: no tag, ALL_FILES, lint warns', () => {
  const o = baseOpts({ motionFiles: [] }), t = PL.generateV3s(o);
  assert.ok(!cmds(t).includes('Assign_Model_File')); assert.ok(!cmds(t).includes('Assign_Tags_To_Files'));
  assert.ok(block(t, 'Select_Active_File').includes('/FILE_NAME=ALL_FILES'));
  assert.ok(PL.lintPipeline(o, { segments: segs }).some((m) => /ยังไม่มีไฟล์ motion/.test(m.text)));
});

test('static and duplicate names are removed from the motion list, with warnings', () => {
  const o = baseOpts({ staticFile: 'S.c3d', motionFiles: ['s.c3d', 'a.c3d', 'A.c3d', 'b.c3d'] }), t = PL.generateV3s(o);
  assert.ok(block(t, 'Assign_Model_File').includes('/MOTION_FILE_NAMES=a.c3d+b.c3d'));
  assert.strictEqual(cmds(t).filter((c) => c === 'File_Open').length, 3);
  const m = PL.lintPipeline(o, { segments: segs }).map((x) => x.text).join('\n');
  assert.ok(/ตัดออก/.test(m) && /ซ้ำ/.test(m));
});

test('output uses CRLF only and ends with CRLF', () => {
  const t = PL.generateV3s(baseOpts());
  assert.ok(t.endsWith('\r\n')); assert.ok(!/[^\r]\n/.test(t));
});

test('data folder gives Windows full paths for static, mdh, motions, mat', () => {
  const t = PL.generateV3s(baseOpts({ folder: 'C:\\Lab\\Sub01\\', exportMat: true }));
  assert.ok(block(t, 'File_Open').includes('/FILE_NAME=C:\\Lab\\Sub01\\static.c3d'));
  assert.ok(block(t, 'Apply_Model_Template').includes('/MODEL_TEMPLATE=C:\\Lab\\Sub01\\model.mdh'));
  assert.ok(block(t, 'File_Open', 1).includes('/FILE_NAME=C:\\Lab\\Sub01\\trial01.c3d'));
  assert.ok(block(t, 'Export_Data_To_Matfile').includes('/FILE_NAME=C:\\Lab\\Sub01\\joint_data.mat'));
});

test('joint angle block: segments, Cardan axes, no resolution CS', () => {
  const b = block(PL.generateV3s(baseOpts()), 'Compute_Model_Based_Data', 1);
  assert.deepStrictEqual(b.filter((l) => /^\/(RESULT_NAME|FUNCTION|SEGMENT|REFERENCE_SEGMENT|AXIS\d|RESOLUTION_COORDINATE_SYSTEM)=/.test(l)),
    ['/RESULT_NAME=RKneeAngle', '/FUNCTION=JOINT_ANGLE', '/SEGMENT=RSK', '/REFERENCE_SEGMENT=RTH', '/RESOLUTION_COORDINATE_SYSTEM=', '/AXIS1=Z', '/AXIS2=X', '/AXIS3=Y']);
});

test('moment block resolves in the parent segment', () => {
  const t = PL.generateV3s(baseOpts({ quantities: ['MOMENT'], joints: ['RKnee'] })), b = block(t, 'Compute_Model_Based_Data');
  assert.ok(b.includes('/FUNCTION=JOINT_MOMENT')); assert.ok(b.includes('/RESOLUTION_COORDINATE_SYSTEM=RTH'));
});

test('negateLeft flips AP and Axial axes on left joints only', () => {
  const t = PL.generateV3s(baseOpts({ negateLeft: true, joints: ['RKnee', 'LKnee'] }));
  const r = block(t, 'Compute_Model_Based_Data', 0), l = block(t, 'Compute_Model_Based_Data', 1);
  assert.ok(r.includes('! /NEGATEX=FALSE') && r.includes('! /NEGATEY=FALSE'));
  assert.ok(l.includes('/NEGATEX=TRUE') && l.includes('/NEGATEY=TRUE') && l.includes('! /NEGATEZ=FALSE'));
});

test('lint: joint on a segment missing from the mdh is an error', () => {
  const o = baseOpts({ joints: [], customJoints: 'RShoulder, RAR, RTA' });
  const m = PL.lintPipeline(o, { segments: segs });
  assert.ok(m.some((x) => x.level === 'bad' && /RAR/.test(x.text)));
});

test('lint: cutoff at or above Nyquist is an error', () => {
  const o = baseOpts({ lowpass: true, cutoff: 60 });
  assert.ok(PL.lintPipeline(o, { segments: segs, staticRate: 100 }).some((x) => x.level === 'bad' && /Nyquist/.test(x.text)));
  assert.ok(!PL.lintPipeline(baseOpts({ lowpass: true, cutoff: 10 }), { segments: segs, staticRate: 100 }).some((x) => /Nyquist/.test(x.text)));
});

test('lint: kinetics on a trial without force plates is an error; Cardan mismatch warns', () => {
  const o = baseOpts({ quantities: ['MOMENT'] });
  const m = PL.lintPipeline(o, { segments: segs, motions: [{ name: 'a.c3d', ready: true, M: { forcePlates: 0, rate: 100 } }], massEntered: true, heightEntered: true });
  assert.ok(m.some((x) => x.level === 'bad' && /force platform/.test(x.text)));
  assert.ok(m.some((x) => /RFT, LFT|RFT|LFT/.test(x.text) && /MASS/.test(x.text)));
  assert.ok(PL.lintPipeline(baseOpts({ cardan: 'XYZ' }), { segments: segs }).some((x) => /ไม่ตรงกับแกน segment/.test(x.text)));
});

test('parseC3D reports force plates and analog rate (sample)', () => {
  assert.strictEqual(typeof sample.forcePlates, 'number'); assert.strictEqual(typeof sample.analogRate, 'number');
});

process.argv.slice(2).forEach((p) => {
  test('extra C3D ' + path.basename(p) + ': mdh validates and pipeline has 6 angles', () => {
    const C = PL.parseC3D(toAB(fs.readFileSync(p)));
    const g = buildMdh(C), v = PL.validate(g.text, C.bare);
    assert.deepStrictEqual(v.errors, []);
    const t = PL.generateV3s(baseOpts({ staticFile: path.basename(p) }));
    const m = PL.lintPipeline(baseOpts(), { segments: PL.mdhSegments(g.text), staticRate: C.rate });
    assert.ok(!m.some((x) => x.level === 'bad'), JSON.stringify(m));
    assert.strictEqual((t.match(/^Compute_Model_Based_Data$/gm) || []).length, 6);
    console.log('     ' + C.npts + ' markers, ' + C.rate + ' Hz, force plates ' + C.forcePlates + ', analog ' + C.analogRate + ' Hz');
  });
});

if (failed) { console.log('\n' + failed + ' failed'); process.exit(1); } else console.log('\nall passed');
