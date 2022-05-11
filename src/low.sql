CREATE TABLE IF NOT EXISTS groups (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
    username VARCHAR(255) NOT NULL
);

-- Just hard-coded my username here :D
INSERT INTO admins (username) SELECT 'JACKDRAGOON'
WHERE NOT EXISTS ( SELECT * FROM admins WHERE username = 'JACKDRAGOON' );


CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    public_key VARCHAR(128) NOT NULL,
    mnemonic VARCHAR(255) NOT NULL,
    init_vec VARCHAR (255) NOT NULL
);

-- Adding one more column
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN;

