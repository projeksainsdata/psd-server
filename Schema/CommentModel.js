import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema(
  {
    owner: String,
    content: String,
    parentTopic: {
      type: mongoose.Types.ObjectId,
      ref: "topic",
    },
    parentComment: {
      type: mongoose.Types.ObjectId,
      ref: "comment",
      default: null,
    },
    upvotes: [
      {
        type: String,
        ref: "user",
        default: [],
      },
    ],
    downvotes: [
      {
        type: String,
        ref: "user",
        default: [],
      },
    ],
  },
  { timestamps: true }
);

CommentSchema.virtual("author", {
  ref: "user",
  localField: "owner",
  foreignField: "username",
  justOne: true,
});

CommentSchema.set("toObject", { virtuals: true });
CommentSchema.set("toJSON", { virtuals: true });

export default mongoose.model("CommentForum", CommentSchema);
