import mongoose from 'mongoose';

const SavedBlogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users', // Menyambungkan dengan model User
    required: true
  },
  blog_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'blogs', 
    required: true
  },
  savedAt: {
    type: Date,
    default: Date.now
  }
});

const SavedBlog = mongoose.model('SavedBlog', SavedBlogSchema);

export default SavedBlog;
