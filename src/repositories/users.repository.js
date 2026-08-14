import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { dataProviderName } from '../config/providers.js';
import { GoogleSheetsRepository, GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { MongooseRepository } from './mongoose.repository.js';

export class UsersRepository {
  constructor() {
    this.google = new GoogleSheetsRepository(GOOGLE_SHEET_TABS.users);
    this.mongo = new MongooseRepository(User);
  }

  active() { return dataProviderName() === 'google' ? this.google : this.mongo; }
  async findById(id, options) {
    const value = await this.active().findById(id, options);
    return this.present(value);
  }
  async list(options) {
    const result = await this.active().list(options);
    return { ...result, items: result.items.map((item) => this.present(item)) };
  }
  async update(id, patch) {
    return this.present(await this.active().update(id, patch));
  }
  delete(id) { return this.active().delete(id); }

  async findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (dataProviderName() === 'google') return this.present(await this.google.findOne({ email: normalized }), { credentials: true });
    const user = await User.findOne({ email: normalized }).select('+password +authVersion').lean();
    return this.present(user ? { ...user, id: String(user._id) } : null, { credentials: true });
  }

  async create({ password, passwordHash, ...input } = {}) {
    const email = String(input.email || '').trim().toLowerCase();
    if (dataProviderName() === 'google') {
      const hash = passwordHash || (password ? await bcrypt.hash(password, 10) : '');
      if (!hash) {
        const error = new Error('passwordHash is required for a Google user record');
        error.code = 'PASSWORD_HASH_REQUIRED';
        error.status = 400;
        throw error;
      }
      return this.present(await this.google.create({ ...input, email, passwordHash: hash }));
    }
    return this.present(await this.mongo.create({ ...input, email, password: password || passwordHash }));
  }

  async verifyCredentials(email, password) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    const hash = user.password;
    if (!hash || !(await bcrypt.compare(String(password || ''), hash))) return null;
    return user;
  }

  async setPassword(id, password) {
    if (dataProviderName() === 'google') {
      return this.present(await this.google.update(id, {
        passwordHash: await bcrypt.hash(String(password), 10),
        passwordChangedAt: new Date().toISOString(),
      }));
    }
    const user = await User.findById(id).select('+password +authVersion');
    if (!user) return null;
    user.password = String(password);
    user.authVersion = Number(user.authVersion || 0) + 1;
    await user.save();
    return this.present({ ...user.toObject(), id: String(user._id) });
  }

  present(value, { credentials = false } = {}) {
    if (!value) return null;
    const user = { ...value, _id: value._id || value.id };
    if (!user.accountStatus && user.status) user.accountStatus = user.status;
    if (!user.accessApplication && user.applicationStatus) {
      user.accessApplication = { status: user.applicationStatus, requestedRole: user.role || 'client' };
    }
    user.authVersion = Number(user.authVersion || 0);
    if (credentials && user.passwordHash) user.password = user.passwordHash;
    delete user.passwordHash;
    if (!credentials) delete user.password;
    return user;
  }
}

export const usersRepository = new UsersRepository();
export default usersRepository;
