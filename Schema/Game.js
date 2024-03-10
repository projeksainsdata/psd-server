import mongoose from 'mongoose';

const gameSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  }],
  timeStarted: Date,
  topic: String,
  timeEnded: Date,
  gameType: {
    type: String,
    enum: ['mcq', 'open_ended']
  }
}, { timestamps: true });

gameSchema.index({ userId: 1 });

export default mongoose.model('Game', gameSchema);
