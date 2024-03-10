import mongoose from 'mongoose';

const TagSchema = new mongoose.Schema(
  {
    name: String,
    createdBy: String,
  },
  { timestamps: true }
);

TagSchema.virtual("author", {
  ref: "user",
  localField: "createdBy",
  foreignField: "username",
  justOne: true,
});

export default mongoose.model("Tag", TagSchema);
