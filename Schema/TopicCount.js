import mongoose from 'mongoose';

const topicCountSchema = new mongoose.Schema({
  topic: {
    type: String,
    unique: true
  },
  count: Number
}, { timestamps: true });

export default mongoose.model('TopicCount', topicCountSchema);
