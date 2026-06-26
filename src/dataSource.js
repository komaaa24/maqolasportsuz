import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from './config.js';
import { SubmissionEntity } from './entities/SubmissionEntity.js';
import { UserDraftEntity } from './entities/UserDraftEntity.js';
import { InitPostgresStorage1719230000000 } from './migrations/1719230000000-InitPostgresStorage.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: config.databaseUrl,
  entities: [SubmissionEntity, UserDraftEntity],
  migrations: [InitPostgresStorage1719230000000],
  migrationsRun: true,
  synchronize: false,
  logging: false,
});
