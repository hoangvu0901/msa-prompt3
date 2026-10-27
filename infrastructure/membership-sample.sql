INSERT INTO memberships (mname, score)
VALUES ('SILVER', 100)
ON CONFLICT (mname) DO NOTHING;
