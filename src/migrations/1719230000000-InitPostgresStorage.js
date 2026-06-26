export class InitPostgresStorage1719230000000 {
  name = 'InitPostgresStorage1719230000000';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id varchar(64) PRIMARY KEY,
        status varchar(64) NOT NULL,
        "user" jsonb NOT NULL,
        file jsonb NOT NULL,
        payment jsonb NOT NULL,
        admin jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_submissions_status
      ON submissions (status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_submissions_user_id
      ON submissions (("user" ->> 'id'))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_drafts (
        "userId" varchar(64) PRIMARY KEY,
        draft jsonb NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('DROP TABLE IF EXISTS user_drafts');
    await queryRunner.query('DROP INDEX IF EXISTS idx_submissions_user_id');
    await queryRunner.query('DROP INDEX IF EXISTS idx_submissions_status');
    await queryRunner.query('DROP TABLE IF EXISTS submissions');
  }
}
