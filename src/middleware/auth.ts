import type {NextFunction, Request, Response} from 'express';
import type {DecodedIdToken} from 'firebase-admin/auth';
import {adminAuth} from '../lib/firebase-admin.ts';
import {getOrCreateUser} from '../db/users.ts';

export interface AuthenticatedDbUser {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: AuthenticatedDbUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({error: 'Unauthorized: Missing token'});
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    res.status(401).json({error: 'Unauthorized: Empty token'});
    return;
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    const email = decodedToken.email || `${decodedToken.uid}@firebase.local`;
    const displayName =
      typeof decodedToken.name === 'string' && decodedToken.name.trim()
        ? decodedToken.name.trim()
        : email.split('@')[0];

    const dbUser = await getOrCreateUser(decodedToken.uid, email, displayName);
    req.dbUser = {
      id: dbUser.id,
      uid: dbUser.uid,
      email: dbUser.email,
      displayName: dbUser.displayName,
      role: dbUser.role,
    };

    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token or syncing user:', error);
    res.status(401).json({error: 'Unauthorized: Invalid or expired session token'});
  }
};
