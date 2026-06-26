import { EntitySchema } from 'typeorm';

export const UserDraftEntity = new EntitySchema({
  name: 'UserDraft',
  tableName: 'user_drafts',
  columns: {
    userId: {
      type: String,
      primary: true,
      length: 64,
    },
    draft: {
      type: 'jsonb',
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
