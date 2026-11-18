# IAM USERINFO Claim Spec v2.1 — Implementation Guide

> **ผู้รับ:** ทีม FE (bpn06, bec01, LOAN) + ทีม Backend
> **ฉบับ:** v2.1 — updated 2026-06-22 (post-implementation)
> **สถานะ:** **Deployed** — SIT + PROD (API v1.20260622.0446, Keycloak mapper-v2)
> **แหล่งความจริงของ role:** `IAMX.ROLE` + `IAMX.USER_ROLE_MAPPING` (Oracle schema `IAMX`)
> **มาตรฐาน role code:** UPPERCASE + HYPHEN เท่านั้น (เช่น `IT-CENTER`, `BUD-AGENCY`, `LOAN-ADMIN`)

---

## สิ่งที่เปลี่ยนจาก v2

| # | ประเด็น | v2 | v2.1 (implement แล้ว) |
|---|---|---|---|
| 1 | สถานะ | spec ร่าง | **deployed SIT + PROD** |
| 2 | Role code separator | ปนกัน (hyphen/underscore/space) | **UPPERCASE + HYPHEN เดียว** (LOAN-ADMIN ไม่ใช่ LOAN_ADMIN) |
| 3 | AGC_LGO_FLAG | TBD source | **ใช้ parent agency name** = 'องค์กรปกครองส่วนท้องถิ่น' |
| 4 | AGC_CENTER_FLAG | TBD (3 options) | **ใช้ AGC_TYPE** (option b) |
| 5 | USERROLE in JWT | ใช้ REF_USER_ID (bug) | **fix → ใช้ USER_ID (cuid)** |
| 6 | ROLE_CODES filter | ไม่มี date filter | **เพิ่ม EFFECTIVE_DATE/EXPIRE_DATE + IS_ACTIVE** |
| 7 | SUBAGENCY_ID | ขาดใน Keycloak claim | **เพิ่มแล้ว** (ma4.AGC_ID) |
| 8 | FE filter LOAN | `LOAN_` prefix (underscore) | **`LOAN-` prefix (hyphen)** |

---

## Claim Structure (ตัวอย่างจริง)

```jsonc
// JWT token → USERINFO claim
"USERINFO": {
  // --- ตัวตน ---
  "USER_ID": "nmvd3gucl2f2joczm3l0o541",       // IAMX cuid (ใช้ join กับ USER_ROLE_MAPPING)
  "USER_INFO_ID": "42",
  "REF_USER_ID": "395",                          // legacy numeric id
  "USER_NAME": "somchai@example.com",
  "EMAIL": "somchai@example.com",
  "FIRST_NAME": "สมชาย",
  "LAST_NAME": "ใจดี",
  "FULL_NAME": "สมชาย ใจดี",
  "PHONE": null,
  "MOBILE": "0891234567",
  "TEL": "0891234567",
  "POSITION_NAME": "นักวิเคราะห์งบประมาณชำนาญการพิเศษ",

  // --- หน่วยงาน 3 ชั้น ---
  "MINISTRY_ID": "4092c228-6155-c01a-e301-81aa4d790ae5",
  "MINISTRY_NAME": "กระทรวงการคลัง",
  "MINISTRY_CODE": "0200",
  "AGENCY_ID": "b0f121df-0d7d-860f-c3e0-c26a552b6e2c",
  "AGENCY_NAME": "องค์กร",
  "AGENCY_CODE": "01007",
  "AGENCY_TYPE": "DEPARTMENT",
  "AGC_SHORTNAME": "ORG",
  "SUBAGENCY_ID": null,             // ถ้า USER_OPERATION_ID มีค่า → ma4.AGC_ID
  "SUBAGENCY_CODE": null,
  "SUBAGENCY_NAME": null,
  "USER_DEPARTMENT_ID": "5",
  "DEPARTMENT_NAME": "กองจัดทำงบประมาณด้านเศรษฐกิจ 1",
  "USER_OPERATION_ID": null,

  // --- ⭐ fields ใหม่ที่ IAM compute ---
  "USER_LEVEL": "AGENCY",           // derive จาก source column ลึก→ตื้น
  "AGC_CENTER_FLAG": "Y",           // derive จาก AGC_TYPE
  "AGC_LGO_FLAG": "N",              // derive จาก parent agency name
  "AGC_SP_FLAG": "N",               // จาก M_AGC.AGC_SP_FLAG (NVL → 'N')

  // --- location ---
  "PROVINCE_NAME": "กรุงเทพมหานคร",
  "DISTRICT_NAME": "พญาไท",
  "SUBDISTRICT_NAME": "สามเสนใน"
},

// --- ⭐ USERROLE claim (แยกจาก USERINFO) ---
"USERROLE": ["ADMIN", "IT-CENTER"]   // array ของ IAMX.ROLE.CODE (active + ตาม date range)
```

---

## Field Reference — แต่ละ field มาจากไหน ใช้ยังไง

### 1. USER_LEVEL

| รายละเอียด | ค่า |
|---|---|
| **ค่าที่เป็นไปได้** | `"SUBAGENCY"` / `"AGENCY"` / `"MINISTRY"` / `null` |
| **Source** | SQL CASE ใน mapper (ทั้ง API + Keycloak) |
| **Logic** | ดูจาก **source column** ไม่ใช่ JOIN result |

```sql
CASE WHEN ui.USER_OPERATION_ID IS NOT NULL THEN 'SUBAGENCY'
     WHEN ui.USER_AGENCY_ID    IS NOT NULL THEN 'AGENCY'
     WHEN ui.USER_MINISTRY_ID  IS NOT NULL THEN 'MINISTRY'
     ELSE NULL END AS USER_LEVEL
```

**FE ใช้:**
```ts
const level = userInfo.USER_LEVEL;  // อ่านตรงๆ ไม่ต้อง derive เอง
```

**Validate ได้กับ** `M_AGC.DATA_LEVEL_TYPE` (MIN/AGC/SUB_AGC) — ค่าตรงกัน

---

### 2. USERROLE (ROLE_CODES)

| รายละเอียด | ค่า |
|---|---|
| **Claim name** | `USERROLE` (ใน JWT), `ROLE_CODES` (ใน API /me/bootstrap) |
| **Type** | `string[]` (array) |
| **Source** | `IAMX.USER_ROLE_MAPPING` JOIN `IAMX.ROLE` |
| **Key** | `USER_ROLE_MAPPING.USER_ID` = cuid (VARCHAR2) — **ไม่ใช่ REF_USER_ID** |

```sql
SELECT DISTINCT r.CODE AS role_code
  FROM IAMX.USER_ROLE_MAPPING urm
  JOIN IAMX.ROLE r ON r.ID = urm.ROLE_ID AND r.IS_ACTIVE = 1
 WHERE urm.USER_ID = :cuid AND urm.IS_ACTIVE = 1
   AND TRUNC(SYSDATE) BETWEEN urm.EFFECTIVE_DATE
                           AND NVL(urm.EXPIRE_DATE, TRUNC(SYSDATE))
 ORDER BY r.CODE
```

**มาตรฐาน role code (ตั้งแต่ 2026-06-22):**
- **UPPERCASE** เท่านั้น
- **HYPHEN `-`** เป็น separator เดียว (ไม่มี underscore, ไม่มี space)
- ตัวอย่าง: `IT-CENTER`, `BUD-AGENCY`, `LOAN-ADMIN`, `PDPA-USER`

**FE ใช้:**
```ts
const roles: string[] = claims.USERROLE || [];

// เช็ค role เฉพาะ
const isAdmin     = roles.includes('ADMIN');
const seeAllMenu  = roles.includes('IT-CENTER');     // เลิก hardcode REF_USER_ID 395/-11

// filter domain
const isLoanUser  = roles.some(r => r.startsWith('LOAN-'));   // ⚠️ LOAN-xxx ไม่ใช่ LOAN_xxx
const isBudget    = roles.some(r => r.startsWith('BUD-'));

// multi-role (14 users มีมากกว่า 1 role)
// ใช้ .includes() หรือ .some() เสมอ ไม่ใช่ === เทียบค่าเดียว
```

---

### 3. AGC_CENTER_FLAG

| รายละเอียด | ค่า |
|---|---|
| **ค่าที่เป็นไปได้** | `"Y"` / `"N"` (ไม่มี null) |
| **ความหมาย** | หน่วยงานส่วนกลาง (ราชการส่วนกลาง) |
| **Logic** | ถ้า `AGC_TYPE` เป็นท้องถิ่น → `'N'`, ที่เหลือ → `'Y'` |

```sql
CASE WHEN ma.AGC_TYPE IN (
    'MUNICIPALITY',
    'SUBDISTRICT_MUNICIPALITY',
    'PROVINCIAL_ADMINISTRATIVE_ORGANIZATION',
    'SPECIAL_LOCAL_ADMINISTRATION_ORGANIZATION',
    'LOCAL_GOVERNMENT_ORG',
    'CITY_MUNICIPALITY'
) THEN 'N' ELSE 'Y' END AS AGC_CENTER_FLAG
```

**FE ใช้:**
```ts
const isCenter = userInfo.AGC_CENTER_FLAG === 'Y';
// ไม่ต้อง default เป็น 'N' เองอีก — IAM การันตีแล้ว
```

---

### 4. AGC_LGO_FLAG

| รายละเอียด | ค่า |
|---|---|
| **ค่าที่เป็นไปได้** | `"Y"` / `"N"` (ไม่มี null) |
| **ความหมาย** | หน่วยงานเป็น อปท. (องค์กรปกครองส่วนท้องถิ่น) |
| **Logic** | ดูจาก parent agency (`ma2` = `M_AGC ON ma.PARENT_ID`) |

```sql
CASE WHEN ma2.AGC_NAME = 'องค์กรปกครองส่วนท้องถิ่น' THEN 'Y' ELSE 'N' END AS AGC_LGO_FLAG
```

---

### 5. AGC_SP_FLAG

| รายละเอียด | ค่า |
|---|---|
| **ค่าที่เป็นไปได้** | `"Y"` / `"N"` (ไม่มี null — NVL แล้ว) |
| **ความหมาย** | หน่วยงานพิเศษ |
| **Source** | `NVL(M_AGC.AGC_SP_FLAG, 'N')` JOIN ผ่าน `USER_AGENCY_ID` |

---

### 6. SUBAGENCY_ID / SUBAGENCY_CODE / SUBAGENCY_NAME

| รายละเอียด | ค่า |
|---|---|
| **Source** | `USER_INFO.USER_OPERATION_ID` → JOIN `M_AGC ma4` |
| **ค่า** | `ma4.AGC_ID` / `ma4.AGC_CODE` / `ma4.AGC_NAME` |
| **null ถ้า** | user ไม่มี USER_OPERATION_ID (ส่วนใหญ่) |

---

### 7. MINISTRY fallback

ถ้า `USER_MINISTRY_ID` เป็น null แต่ `USER_AGENCY_ID` มีค่า:
- mapper JOIN `M_AGC ma3 ON ma3.AGC_ID = ui.USER_MINISTRY_ID`
- fallback ไปที่ `M_AGC ma2 ON ma.PARENT_ID = ma2.AGC_ID` (parent ของ agency)

```sql
CASE WHEN ma3.AGC_ID IS NOT NULL THEN ma3.AGC_ID ELSE ma2.AGC_ID END AS MINISTRY_ID
CASE WHEN ma3.AGC_CODE IS NOT NULL THEN ma3.AGC_CODE ELSE ma2.AGC_CODE END AS MINISTRY_CODE
CASE WHEN ma3.AGC_NAME IS NOT NULL THEN ma3.AGC_NAME ELSE ma2.AGC_NAME END AS MINISTRY_NAME
```

---

## Source Code Locations

| Component | File | Function |
|---|---|---|
| **IAMX API mapper** | `api/core/handlers/menu_handler.go:448` | `getUserInfo()` |
| **Keycloak SPI** | `keycloak-mapper/src/.../IamxUserInfoMapper.java` | `setClaim()` + `lookupOracleUserInfo()` |
| **API endpoint** | `/iamx/api/me/bootstrap` | returns USERINFO + ROLE_CODES |
| **JWT claim** | Keycloak token | `USERINFO` + `USERROLE` |

---

## Claim ที่มาจาก 2 ที่ (API vs JWT)

| Field | API `/me/bootstrap` | JWT claim |
|---|---|---|
| User info fields | `userInfo.*` | `USERINFO.*` |
| Role codes | `userInfo.ROLE_CODES` (array) | `USERROLE` (array) |
| USER_LEVEL | `userInfo.USER_LEVEL` | `USERINFO.USER_LEVEL` |
| AGC_CENTER_FLAG | `userInfo.AGC_CENTER_FLAG` | `USERINFO.AGC_CENTER_FLAG` |
| Menu/Permissions | `/me/menu`, `/me/permissions` | ❌ ไม่อยู่ใน JWT (ใหญ่เกิน) |

---

## ⚠️ Breaking Changes สำหรับ FE

### 1. LOAN role codes เปลี่ยน separator

| เดิม | ใหม่ |
|---|---|
| `LOAN_ADMIN` | `LOAN-ADMIN` |
| `LOAN_AGENCY` | `LOAN-AGENCY` |
| `LOAN_CABINET` | `LOAN-CABINET` |
| `LOAN_IT` | `LOAN-IT` |
| `LOAN_PDMO` | `LOAN-PDMO` |

**FE ต้องแก้:**
```ts
// เดิม
const isLoanUser = roles.some(r => r.startsWith('LOAN_'));
// ใหม่
const isLoanUser = roles.some(r => r.startsWith('LOAN-'));
```

### 2. Role codes อื่นที่เปลี่ยน

| เดิม | ใหม่ |
|---|---|
| `PDPA_USER` | `PDPA-USER` |
| `DTS_01` | `DTS-01` |
| `ADMIN_BAP01` | `ADMIN-BAP01` |
| `Admins AGC` | `ADMINS-AGC` |
| `User UPM` | `USER-UPM` |

### 3. USERROLE claim ใน JWT ใช้งานได้แล้ว

เดิม USERROLE ว่างเปล่า (bug ใช้ REF_USER_ID → parseLong ของ cuid fail)
ตอนนี้ fix แล้ว — FE ใช้ `USERROLE` จาก JWT ได้เลย

---

## Deployment Status

| Env | API | Keycloak mapper | Role codes fixed | UAT kubeconfig |
|---|---|---|---|---|
| **SIT** | ✅ v1.20260622.0446 | ✅ mapper-v2 | ✅ | - |
| **UAT** | ❌ pending | ❌ pending | ✅ (DB fixed) | ❌ expired |
| **PROD** | ✅ v1.20260622.0446 | ✅ mapper-v2 | ✅ | - |

---

## Open Questions (Resolved)

| # | คำถามจาก v2 | คำตอบ |
|---|---|---|
| 1 | AGC_LGO_FLAG มาจากไหน | ✅ parent agency name = 'องค์กรปกครองส่วนท้องถิ่น' |
| 2 | ROLE_CODES ordering | ✅ เรียงตาม CODE alphabetically (`ORDER BY r.CODE`) |
| 3 | Ministry NAME lookup | ✅ ใช้ `M_AGC ma2` (parent) หรือ `M_AGC ma3` (USER_MINISTRY_ID) |
| 4 | AGENCY_TYPE typo | ยังไม่ได้แก้ — ไม่กระทบ logic (ใช้ IN list เฉพาะ local gov types) |
| 5 | MINISTRY backfill | ✅ mapper derive จาก parent agency (ma2) ถ้า USER_MINISTRY_ID null |
| 6 | 70 users ไม่มี org | ✅ ส่ง USER_LEVEL = null — FE รองรับแล้ว |
