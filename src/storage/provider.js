import { storageProviderName } from '../config/providers.js';
import { googleDriveStorage } from './googleDriveStorage.js';
import { supabaseStorage } from './supabaseStorage.js';

export function getStorageProvider() {
  return storageProviderName() === 'google-drive' ? googleDriveStorage : supabaseStorage;
}

export function storageProviderStatus() {
  return getStorageProvider().status();
}

