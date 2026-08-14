// backend/src/features/users/controllers/profile.controller.js
import multer from 'multer';
import { removePath, uploadBuffer } from '../../../lib/supabase.js';
import User from '../../../models/User.js';
import { cleanFileName, validateUpload } from '../../../lib/filePolicy.js';
import { cleanPublicUrl, cleanText } from '../../../lib/validation.js';
import { presentUser } from '../../../lib/presentUser.js';

// in-memory file buffer
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

const PROFILE_FIELDS = [
  'name',
  'phone',
  'companyName',
  'businessName',
  'businessWebsite',
  'industry',
  'jobTitle',
  'timezone',
  'preferredContactMethod',
  'bio',
  'specialties',
  'technologies',
  'availability',
  'projectContactPreference',
  'notificationPreferences',
  'themePreference',
];

function cleanList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 20);
  }
  return [];
}

function cleanProfilePatch(body = {}) {
  const patch = {};

  for (const key of PROFILE_FIELDS) {
    if (!(key in body)) continue;

    if (key === 'specialties' || key === 'technologies') {
      patch[key] = cleanList(body[key]);
      continue;
    }

    if (key === 'notificationPreferences') {
      const prefs = body[key] || {};
      patch[key] = {
        portalUpdates: prefs.portalUpdates !== false,
        emailUpdates: prefs.emailUpdates !== false,
        billingAlerts: prefs.billingAlerts !== false,
      };
      continue;
    }

    if (key === 'themePreference') {
      if (['light', 'dark'].includes(body[key])) patch[key] = body[key];
      continue;
    }

    if (key === 'businessWebsite') {
      patch[key] = body[key] ? cleanPublicUrl(body[key]) : '';
      continue;
    }

    const maxLength = key === 'bio' ? 2000 : key === 'projectContactPreference' ? 500 : 180;
    patch[key] = cleanText(body[key], maxLength);
  }

  return patch;
}

// GET /api/users/me
export async function getMyProfile(req, res) {
  const user = await User.findById(req.user?._id).select('-password').lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user: await presentUser(user) });
}

// PATCH /api/users/me
export async function updateMyProfile(req, res) {
  if (req.body?.businessWebsite && !cleanPublicUrl(req.body.businessWebsite)) {
    return res.status(400).json({ message: 'Website must be a valid http or https URL' });
  }
  const patch = cleanProfilePatch(req.body || {});
  const user = await User.findByIdAndUpdate(req.user?._id, patch, {
    new: true,
    runValidators: true,
  }).select('-password');

  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user: await presentUser(user) });
}

// POST /api/users/me/avatar  (form-data: avatar)
export async function setMyAvatar(req, res) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'Avatar file is required' });

    const verdict = validateUpload(file, 'avatar');
    if (!verdict.ok) return res.status(415).json({ message: verdict.message });

    const user = await User.findById(req.user?._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const safeName = cleanFileName(file.originalname || 'avatar');
    const ts = Date.now();
    const storePath = `avatars/${user._id}/${ts}-${safeName}`;
    const contentType = file.mimetype || 'image/png';

    const uploaded = await uploadBuffer(storePath, file.buffer, contentType, {
      userId: String(user._id),
      clientId: String(user._id),
      uploadedBy: String(user._id),
      category: 'profile',
      originalName: file.originalname,
    });
    const oldPath = user.avatarPath;

    user.avatarUrl = uploaded.url;
    user.avatarPath = storePath;
    await user.save();

    let cleanupPending = false;
    if (oldPath && oldPath !== storePath) {
      try {
        await removePath(oldPath);
      } catch {
        cleanupPending = true;
      }
    }

    res.json({ ok: true, avatarUrl: uploaded.url, cleanupPending });
  } catch (e) {
    console.error('setMyAvatar error:', e.code || e.message);
    res.status(e.status || 500).json({ message: e.status === 503 ? 'File storage is unavailable' : 'Server error' });
  }
}

// DELETE /api/users/me/avatar
export async function deleteMyAvatar(_req, res) {
  try {
    const user = await User.findById(_req.user?._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // remove from storage if present
    if (user.avatarPath) {
      await removePath(user.avatarPath);
    }

    user.avatarUrl = '';
    user.avatarPath = '';
    await user.save();

    res.json({ ok: true });
  } catch (e) {
    console.error('deleteMyAvatar error:', e.code || e.message);
    res.status(e.status || 500).json({ message: e.status === 503 ? 'File storage is unavailable' : 'Server error' });
  }
}
