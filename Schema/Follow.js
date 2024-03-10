import mongoose from 'mongoose';

const followSchema = new mongoose.Schema({
    following: [
        {
          type: String,
          default: [],
        },
      ],
      followers: [
        {
          type: String,
          default: [],
        },
      ],
});

export default mongoose.model('Follow', followSchema);
