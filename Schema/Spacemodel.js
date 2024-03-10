import mongoose from 'mongoose';

const SpaceSchema = new mongoose.Schema(
  {
    name: String,
    avatar: String,
  },
  { timestamps: true }
);

export default mongoose.model("Space", SpaceSchema);
