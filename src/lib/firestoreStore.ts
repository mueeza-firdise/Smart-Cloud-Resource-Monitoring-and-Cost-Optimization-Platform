import type {User} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import {db, handleFirestoreError, OperationType} from './firebase';
import type {ScalingConfig, ScalingPresetDoc, TelemetrySnapshotDoc} from '../types';

function toMillis(val: unknown): number {
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  return Date.now();
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const displayName = (user.displayName || user.email?.split('@')[0] || 'Cloud Operator').slice(0, 100);
  const email = (user.email || '').slice(0, 254);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        role: 'operator',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = existingSnap.data();
      if (data?.displayName !== displayName) {
        await updateDoc(ref, {
          displayName,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserPresets(
  uid: string,
  onData: (presets: ScalingPresetDoc[]) => void,
  onError: (msg: string) => void,
): () => void {
  const path = `users/${uid}/presets`;
  const q = query(collection(db, 'users', uid, 'presets'), where('ownerUid', '==', uid), limit(25));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ScalingPresetDoc[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerUid: String(data.ownerUid || uid),
          name: String(data.name || 'Preset'),
          scaleDownLow: Number(data.scaleDownLow ?? 20),
          scaleDownModerate: Number(data.scaleDownModerate ?? 30),
          scaleUpHigh: Number(data.scaleUpHigh ?? 80),
          scaleUpCritical: Number(data.scaleUpCritical ?? 90),
          minServers: Math.round(Number(data.minServers ?? 2)),
          maxServers: Math.round(Number(data.maxServers ?? 20)),
          createdAtMs: toMillis(data.createdAt),
          updatedAtMs: toMillis(data.updatedAt),
        };
      });
      items.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Permission denied loading presets.');
      }
    },
  );
}

export async function saveScalingPreset(
  uid: string,
  name: string,
  cfg: ScalingConfig,
): Promise<string> {
  const presetId = `preset_${Date.now()}`;
  const path = `users/${uid}/presets/${presetId}`;
  const safeName = name.trim().slice(0, 64) || 'Custom Threshold Preset';

  try {
    await setDoc(doc(db, 'users', uid, 'presets', presetId), {
      ownerUid: uid,
      name: safeName,
      scaleDownLow: Number(cfg.scaleDownLow),
      scaleDownModerate: Number(cfg.scaleDownModerate),
      scaleUpHigh: Number(cfg.scaleUpHigh),
      scaleUpCritical: Number(cfg.scaleUpCritical),
      minServers: Math.round(cfg.minServers),
      maxServers: Math.round(cfg.maxServers),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return presetId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteScalingPreset(uid: string, presetId: string): Promise<void> {
  const path = `users/${uid}/presets/${presetId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'presets', presetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserSnapshots(
  uid: string,
  onData: (snapshots: TelemetrySnapshotDoc[]) => void,
  onError: (msg: string) => void,
): () => void {
  const path = `users/${uid}/snapshots`;
  const q = query(collection(db, 'users', uid, 'snapshots'), where('ownerUid', '==', uid), limit(15));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: TelemetrySnapshotDoc[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerUid: String(data.ownerUid || uid),
          label: String(data.label || 'Cluster Snapshot'),
          trafficMode: String(data.trafficMode || 'Normal'),
          cpuUsage: Number(data.cpuUsage ?? 0),
          ramUsage: Number(data.ramUsage ?? 0),
          storageUsage: Number(data.storageUsage ?? 0),
          serverCount: Math.round(Number(data.serverCount ?? 3)),
          predictedCpu: Number(data.predictedCpu ?? 0),
          dailyCost: Number(data.dailyCost ?? 0),
          costSavedDaily: Number(data.costSavedDaily ?? 0),
          createdAtMs: toMillis(data.createdAt),
        };
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Permission denied loading snapshots.');
      }
    },
  );
}

export async function saveTelemetrySnapshot(
  uid: string,
  payload: Omit<TelemetrySnapshotDoc, 'id' | 'ownerUid' | 'createdAtMs'>,
): Promise<string> {
  const snapshotId = `snap_${Date.now()}`;
  const path = `users/${uid}/snapshots/${snapshotId}`;

  try {
    await setDoc(doc(db, 'users', uid, 'snapshots', snapshotId), {
      ownerUid: uid,
      label: payload.label.trim().slice(0, 80) || 'Cluster Snapshot',
      trafficMode: payload.trafficMode.trim().slice(0, 32) || 'Normal',
      cpuUsage: Math.min(100, Math.max(0, Number(payload.cpuUsage))),
      ramUsage: Math.min(100, Math.max(0, Number(payload.ramUsage))),
      storageUsage: Math.min(100, Math.max(0, Number(payload.storageUsage))),
      serverCount: Math.min(50, Math.max(1, Math.round(payload.serverCount))),
      predictedCpu: Math.min(100, Math.max(0, Number(payload.predictedCpu))),
      dailyCost: Math.min(1000000, Math.max(0, Number(payload.dailyCost))),
      costSavedDaily: Math.min(1000000, Math.max(-1000000, Number(payload.costSavedDaily))),
      createdAt: serverTimestamp(),
    });
    return snapshotId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteTelemetrySnapshot(uid: string, snapshotId: string): Promise<void> {
  const path = `users/${uid}/snapshots/${snapshotId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'snapshots', snapshotId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
