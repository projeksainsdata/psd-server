// chatSchema.js
import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  userId: String, // ID pengguna untuk mengidentifikasi percakapan
  message: String,
  isUser: Boolean,
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('Chat', chatSchema);

