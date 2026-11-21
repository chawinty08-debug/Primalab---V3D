# Primalab---V3D

PrimaLab **Model Builder**: เครื่องมือในเบราว์เซอร์สำหรับสร้างไฟล์ Visual3D จาก static C3D
(ไฟล์ทั้งหมดประมวลผลในเบราว์เซอร์ ไม่มีการอัปโหลด)

| Path | URL บนเว็บ | หน้าที่ |
|---|---|---|
| `model-lab/index.html` | `/primalab/model-lab/` | **Model Builder v1** (ตัวที่ใช้อยู่บนเว็บตอนนี้ ไม่แก้ไข): static C3D → `.mdh` (Conventional Lower 16), จับคู่/relabel motion C3D |
| `model-lab/v2/index.html` | `/primalab/model-lab/v2/` | **Model Builder v2**: ทุกอย่างของ v1 และ **pipeline `.v3s`** (ขั้น 4–5) |
| `model-lab/old/index.html` | `/primalab/model-lab/old/` | Model & Pipeline Lab รุ่นเดิม: template IOR, ตรวจ `.mdh`, อ่าน build log, pipeline รุ่นเดิม |
| `tests/` | | Node tests ของ core (`PL`) และ UI smoke test (jsdom) ของ v2 |

แต่ละหน้าเป็นไฟล์ HTML เดียว (CSS + JS inline) ไม่มี build step ให้อัปโหลดโฟลเดอร์ `model-lab/` ไปที่ hosting ได้ทันที (v2 ใช้ลิงก์ `../old/` และ `../` จึงต้องอยู่ใต้ `model-lab/`)

## Pipeline (.v3s) ใน Model Builder v2

ย้ายมาจาก `old/` (แท็บ 3) และผูกกับข้อมูลของ Model Builder:

- **ไฟล์ static / .mdh / มวล / ส่วนสูง** มาจากขั้น 1–3 อัตโนมัติ (แก้เองได้)
- **ไฟล์ motion** มาจากขั้น 1b เฉพาะไฟล์ที่จับคู่ marker ครบ ไฟล์ที่ต้อง relabel ใช้ชื่อ `*_relabeled.c3d`
  ไฟล์ static และชื่อซ้ำถูกตัดออกจากรายการ motion
- **Joints** แสดงเฉพาะ segment ที่มีใน `.mdh` (Lower 16: RPV, R/L TH, SK, FT → hip/knee/ankle)
- **ลำดับ Cardan** ตามแกน segment ใน `.mdh` (ML–AP–Axial): `+X/+Y` → Z-X-Y, `+Y/+Z` → X-Y-Z
- ตัวเลือกใหม่: โฟลเดอร์ข้อมูล (full path ใน Windows), tag `MOTION` เพื่อไม่คำนวณบน static,
  NEGATE แกน AP/Axial ของ joint ฝั่งซ้าย (ยังไม่ทดสอบ)
- ตรวจเพิ่ม: segment ที่ไม่มีใน mdh, cutoff ≥ Nyquist, kinetics กับ trial ที่ไม่มี force platform,
  analog rate เท่ากับ marker rate, segment ที่ไม่มี `/MASS`, Cardan ไม่ตรงกับแกน segment

ไฟล์ที่ได้เป็น **DRAFT ยังไม่ได้รันใน Visual3D** จุดที่ต้องยืนยันติดป้าย `<<CHECK>>`

## Upper body (v2, ไม่บังคับ)

ขั้น 2b เพิ่ม segment จาก Plug-in Gait upper markers (+ medial elbow) ลงใน `.mdh` เดียวกัน:

| Segment | ปลาย proximal | ปลาย distal | Tracking | /MASS |
|---|---|---|---|---|
| `RTA` trunk | กึ่งกลาง C7–CLAV | RIGHT_HIP / LEFT_HIP | C7, T10, CLAV, STRN | – |
| `R/L AR` upper arm | SJC (acromion เลื่อนลงตามแกน axial ของ RTA = Shoulder_Offset) | ELB / ELBM | SJC, ELB, UPA | 0.028·Mass |
| `R/L FA` forearm | EJC (กึ่งกลาง ELB–ELBM) | WRA / WRB | FRM, WRA, WRB | 0.016·Mass |
| `R/L HA` hand | WJC (กึ่งกลาง WRA–WRB) | FIN | WRA, WRB, FIN | 0.006·Mass |

- เลือกเฉพาะ segment ที่ marker ครบ (เช่น ไม่มี RFIN → ไม่มี RHA) และ upper arm ต้องมี trunk
- Shoulder offset เริ่มต้น = 0.17 × ระยะ acromion–acromion (constant offset, Rab et al. 2002; ติด `<<CHECK>>`) ใส่ค่าที่วัดเองได้
- Pipeline: joint Trunk, Shoulder, Elbow, Wrist; shoulder เลือก ISB Euler Y-X-Y (Wu et al. 2005) ได้
- เมื่อปิด upper body ไฟล์ `.mdh` เหมือนเดิมทุก byte

## Tests

```bash
npm install                 # jsdom สำหรับ UI test
npm test                    # core + UI (ใช้ไฟล์ตัวอย่างที่ฝังในหน้า)
node tests/core.test.js path/to/static.c3d    # ทดสอบกับ static C3D ของแล็บเพิ่ม
```

Repo นี้เป็น public: **อย่า commit C3D ของผู้ถูกทดสอบ** (`.gitignore` กัน `*.c3d` ไว้แล้ว)

Visual3D เป็นผลิตภัณฑ์ของเจ้าของผลิตภัณฑ์ เครื่องมือนี้ไม่ใช่เครื่องมือทางการ · ใช้เพื่อการเรียนรู้
