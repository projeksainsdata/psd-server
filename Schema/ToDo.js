import mongoose, { Schema } from "mongoose";

const ToDoSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
      },
    completed: {
        type: Boolean,
        default: false
    }
});

export default mongoose.model("todos", ToDoSchema);