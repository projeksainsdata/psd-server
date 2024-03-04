import mongoose, { Schema } from "mongoose";


const ToDoSchema = new mongoose.Schema({
    name: String
})

export default mongoose.model("todos", ToDoSchema);