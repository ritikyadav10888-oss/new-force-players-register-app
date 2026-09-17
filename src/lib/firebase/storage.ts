import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirebaseApp } from '@/lib/firebase/app';

/** Firebase Storage — replaces Supabase `uploads` bucket after cutover. */
export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}
