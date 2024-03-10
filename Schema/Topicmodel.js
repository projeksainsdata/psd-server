import mongoose from 'mongoose';
import AutoIncrementFactory from 'mongoose-sequence';
const AutoIncrement = AutoIncrementFactory(mongoose);

const TopicSchema = new mongoose.Schema(
  {
    owner: String,
    title: String,
    content: String,
    slug: String,
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
    viewsCount: {
      type: Number,
      default: 0,
    },
    totalComments: {
      type: Number,
      default: 0,
    },
    tags: [
      {
        type: mongoose.Types.ObjectId,
        ref: "Tag",
        default: [],
      },
    ],
  },
  { timestamps: true }
);

TopicSchema.plugin(AutoIncrement, { inc_field: "TopicID" });

TopicSchema.virtual("author", {
  ref: "user",
  localField: "owner",
  foreignField: "username",
  justOne: true,
});

TopicSchema.set("toObject", { virtuals: true });
TopicSchema.set("toJSON", { virtuals: true });

export default mongoose.model("Topic", TopicSchema);
