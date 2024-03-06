import mongoose from 'mongoose';

const followSchema = new mongoose.Schema({
    follower: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Asumsi bahwa nama model pengguna adalah 'User'
        required: true,
    },
    following: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }
}, {
    timestamps: true // Menyertakan tanggal pembuatan dan pembaruan
});

const Follow = mongoose.model('Follow', followSchema);

export default Follow;
