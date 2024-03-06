import mongoose from 'mongoose';

const followSchema = new mongoose.Schema({
    follower: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Pastikan ini sesuai dengan nama model pengguna Anda
        required: true,
    },
    following: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }
}, {
    timestamps: true // Menambahkan cap waktu untuk tanggal pembuatan dan pembaruan
});

export default mongoose.model('Follow', followSchema);
