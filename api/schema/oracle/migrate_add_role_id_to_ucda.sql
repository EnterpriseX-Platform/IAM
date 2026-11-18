-- Add role_id to USER_CUSTOM_DATA_ACCESS
-- Replaces responsibility_id discriminator for UPM register/approval path
ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS ADD (
    role_id NUMBER
);

ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS
    ADD CONSTRAINT fk_ucda_role FOREIGN KEY (role_id) REFERENCES IAMX.role(id);

-- Replace unique index: old used responsibility_id, new uses role_id
DROP INDEX IAMX.uq_ucda;
CREATE UNIQUE INDEX uq_ucda ON IAMX.USER_CUSTOM_DATA_ACCESS(user_id, NVL(role_id, -1), agency_path);

CREATE INDEX idx_ucda_role ON IAMX.USER_CUSTOM_DATA_ACCESS(role_id);
