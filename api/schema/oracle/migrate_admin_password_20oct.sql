-- 20/10/69 ผู้ดูแล IAM-X Console: เก็บรหัสเป็น bcrypt (60 ตัว) — เดิม VARCHAR2(40) เก็บรหัสตรง ๆ
ALTER TABLE IAMX.ADMIN MODIFY (PASSWORD VARCHAR2(100 CHAR))
/
