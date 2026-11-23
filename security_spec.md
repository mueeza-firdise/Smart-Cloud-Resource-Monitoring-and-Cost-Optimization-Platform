# CloudScale ML Firestore Security Specification

## 1. Data Invariants
1. **Default-Deny Baseline**: Every unspecified document path is denied read and write access (`allow read, write: if false;`).
2. **Verified Identity**: All authenticated operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation**: `/users/{userId}` stores email PII and allows `get` strictly for `isOwner(userId) || isAdmin()`, with `list` explicitly denied (`allow list: if false;`) to prevent cross-user email enumeration.
4. **Master Gate & Ownership**: Subcollections `/users/{userId}/presets/{presetId}` and `/users/{userId}/snapshots/{snapshotId}` require `exists(/databases/$(database)/documents/users/$(userId))`, path-verified ownership (`userId == request.auth.uid`), and payload `ownerUid == request.auth.uid`.
5. **Anti-Privilege Escalation**: Users may only register with `role == 'operator'`, cannot mutate `role`, `uid`, `ownerUid`, or `createdAt`, and cannot write to `/admins/{userId}`.
6. **Temporal & Volumetric Integrity**: Document IDs must pass `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars), strings have strict `.size()` bounds, numbers enforce physical/domain ranges (CPU 0-100%, strict threshold ordering `scaleDownLow < scaleDownModerate < scaleUpHigh < scaleUpCritical`), and `createdAt`/`updatedAt` must equal `request.time`.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read/write** on `/users/u1/presets/p1` (`request.auth == null`).
2. **Unverified email write** (`email_verified: false`) attempting admin or user profile creation.
3. **Cross-user PII scraping** (`list /users` or `get /users/victim_uid` as `attacker_uid`).
4. **Privilege escalation on registration** (`{ uid: 'u1', role: 'admin', ... }` on `/users/u1`).
5. **Shadow / ghost field injection** (`{ ..., isAdmin: true }` on `/users/u1/presets/p1`).
6. **Identity spoofing** on preset create (`ownerUid: 'other_uid'` under `/users/u1/presets/p1`).
7. **ID poisoning** with 1.5KB junk string or invalid symbols (`presetId: 'bad/..$id' + 'a'.repeat(1500)`).
8. **Backdated / forged timestamp** (`createdAt: '2020-01-01T00:00:00Z'` instead of `request.time`).
9. **Immutable field mutation** on update (changing `ownerUid` or `createdAt` on an existing preset).
10. **Invalid threshold ordering** (`scaleUpHigh: 25, scaleUpCritical: 20` violating `scaleDownLow < scaleDownModerate < scaleUpHigh < scaleUpCritical`).
11. **Out-of-bounds CPU / server capacity** (`cpuUsage: 180` or `maxServers: 500` causing denial-of-bounds corruption).
12. **Client-side admin elevation** (`setDoc('/admins/attacker_uid', { email: 'attacker@example.com' })`).
