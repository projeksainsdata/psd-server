import mongoose from 'mongoose';

const followSchema = new mongoose.Schema({
    following: [
        {
          type: String,
          ref: "users",
        },
      ],
      followers: [
        {
          type: String,
          ref:"users",
        },
      ],
});

export default mongoose.model('Follow', followSchema);
