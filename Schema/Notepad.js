import mongoose, { Schema } from "mongoose";

const NotepadSchema = new mongoose.Schema({
    content: String,
});

export default mongoose.model("notepad", NotepadSchema);