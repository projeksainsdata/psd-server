import mongoose from 'mongoose';

const followSchema = new mongoose.Schema({
    following: [
        {
          type: String,
          ref: "user",
        },
      ],
      followers: [
        {
          type: String,
          ref:"user",
        },
      ],
});

export default mongoose.model('Follow', followSchema);
