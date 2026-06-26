import { EntitySchema } from 'typeorm';

export const SubmissionEntity = new EntitySchema({
  name: 'Submission',
  tableName: 'submissions',
  columns: {
    id: {
      type: String,
      primary: true,
      length: 64,
    },
    status: {
      type: String,
      length: 64,
      index: true,
    },
    user: {
      type: 'jsonb',
    },
    file: {
      type: 'jsonb',
    },
    payment: {
      type: 'jsonb',
    },
    admin: {
      type: 'jsonb',
      nullable: true,
    },
    createdAt: {
      type: 'timestamptz',
      createDate: true,
    },
    updatedAt: {
      type: 'timestamptz',
      updateDate: true,
    },
  },
});
