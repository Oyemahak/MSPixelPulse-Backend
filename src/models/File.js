import mongoose from 'mongoose';

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

export default mongoose.model('File', fileSchema);
