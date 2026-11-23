import {eq} from 'drizzle-orm';
import {db} from './index.ts';
import {users} from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
) {
  try {
    const safeName = (displayName || email.split('@')[0] || 'Cloud Operator').slice(0, 100);
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: safeName,
        role: 'Cloud Architect',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: safeName,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to sync user profile:', error);
    throw new Error('Unable to synchronize user account.', {cause: error});
  }
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Failed to query user by UID:', error);
    throw new Error('Unable to fetch user record.', {cause: error});
  }
}
