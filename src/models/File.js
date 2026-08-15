import mongoose from 'mongoose';
import { createProviderModel } from '../providers/providerModel.js';

const fileSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploaderName: { type: String, trim: true, default: '' },
    filename: String,
    mimetype: String,
    size: Number,
    url: String, // if later you put to Drive/Cloudinary
  },
  { timestamps: true }
);

const File = mongoose.model('File', fileSchema);
export default createProviderModel(File, {
  modelName: 'File', tab: 'Files', relations: { project: 'Project', uploader: 'User' },
});
