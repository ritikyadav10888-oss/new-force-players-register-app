import { newAgeCategoryId, type AgeCategoryDef } from '@/lib/age-categories';

/** Standard youth / open bands for quick tournament setup. */
export function createDemoAgeCategories(): AgeCategoryDef[] {
  return [
    { id: newAgeCategoryId(), name: 'U-9', minAge: 0, maxAge: 8, minDob: null, maxDob: null, fee: 0 },
    { id: newAgeCategoryId(), name: 'U-11', minAge: 9, maxAge: 10, minDob: null, maxDob: null, fee: 0 },
    { id: newAgeCategoryId(), name: 'U-13', minAge: 11, maxAge: 12, minDob: null, maxDob: null, fee: 0 },
    { id: newAgeCategoryId(), name: 'U-15', minAge: 13, maxAge: 14, minDob: null, maxDob: null, fee: 0 },
    { id: newAgeCategoryId(), name: 'Open', minAge: 15, maxAge: null, minDob: null, maxDob: null, fee: 0 },
  ];
}
